// Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0.
import { Fr } from "@aztec-labs/foundation/curves/bn254"
import type { z } from "zod"
import { assertRestoreEpoch, captureRestoreEpochs, restoreRowProfileId } from "@/wallet/services/restore-fence"
import { profileDeletedError, type ProfileDeletionState } from "@/wallet/services/profile/profile-deletion-state"
import { restoreRows } from "@/wallet/services/restore-rows"
import { deriveAccountSeed, deriveSigningKeyFromSeed } from "@nulo/wallet-crypto"
import { LogLevel, type ILogger } from "@/wallet/logger"
import type { Restored, ServiceCollection, ServiceSpec } from "@/wallet/base"
import { Service, defineRpcMethods } from "@nulo/extension-messaging/background"
import { ProfileService } from "@/wallet/services/profile/service"
import { requireActiveProfile } from "@/wallet/services/profile/require-active-profile"
import { NetworkService } from "@/wallet/services/network/service"
import { purgeMalformedRows, purgeRows } from "@/wallet/services/purge-rows"
import { isSealedText, type SealedEntityStorage } from "@/wallet/storage/sealed-entity-storage"
import { sealedEntityStorage } from "@/wallet/storage/stores"
import { array_max, fromBase64Lenient, hasIntersectionByKeys, KeyedLock, Lock } from "@/wallet/utils"
import { EventHandler, toBase64 } from "@nulo/wallet-core/utils"
import type { BrowserApi } from "@nulo/wallet-core/ports"
import type { RunFence } from "@/wallet/services/profile/spec"
import type { PasskeyCredentialData } from "@nulo/wallet-crypto"
import {
	buildAccountExport,
	decryptAccountExport,
	encryptAccountExport,
	NuloAccount,
	parseAccountExport,
	serializeAccountExport,
	V6_REGIME,
	type IAccountContract,
} from "@nulo/aztec-runtime/account"
import { GrumpkinScalar } from "@aztec-labs/foundation/curves/grumpkin"
import { type ImportedKeysDek, sealImportedSigningKeyV2, unsealImportedSigningKeyV2, zeroize } from "@nulo/wallet-crypto"
import {
	AccountAddressInconsistencyError,
	ChainNotSupportedError,
	InvalidWalletArgumentsError,
	RecoveryModeError,
} from "@nulo/extension-messaging/errors"
import { StaleNetworkRepository } from "@/wallet/services/stale-network/repository"
import { ERR_RESET_PENDING, type JournalAccount } from "@/wallet/services/stale-network/types"
import { ImportedKeysRepository } from "./imported-keys-repository"
import type { AccountIntegrityBlocked, AccountRuntimeMismatchDelegate } from "../account-integrity/types"
import { ERR_UNATTENDED_LIVE_CHECK } from "@/wallet/services/network/spec"
import {
	ACCOUNT_SERVICE_NAME,
	AccountMethodSchemas,
	AccountSchema,
	AccountType,
	DEFAULT_ACCOUNT_NAME,
	DEFAULT_IMPORTED_ACCOUNT_NAME,
	ImportedAccountKeySchema,
	ImportedAccountUnusableError,
	type FullBackupKeys,
	type ImportedAccountKey,
	type PasskeyBackupKeys,
	accountRowId,
	accountRowIdOf,
	parseAccountRowId,
	rowMatchesKey,
	type Account,
	type AccountScope,
	type Events,
	type Methods,
} from "./spec"

export * from "./spec"

/** Seals the key for storage; the plaintext copy dies on every path. */
async function sealSigningKey(dek: ImportedKeysDek, chainId: number, address: string, signingKey: GrumpkinScalar): Promise<string> {
	let skBytes: Uint8Array<ArrayBuffer> | undefined
	try {
		skBytes = signingKey.toBuffer() as Uint8Array<ArrayBuffer>
		return await sealImportedSigningKeyV2(dek, chainId, address, skBytes)
	} finally {
		if (skBytes) zeroize(skBytes)
	}
}

/**
 * Unseals an imported signing key into a scalar and takes ownership of `dek`: the DEK, the
 * plaintext and its copy are wiped, in that order, before the scalar returns or the error
 * propagates, so no secret buffer outlives the unseal on any caller's path.
 */
async function unsealImportedScalar(dek: ImportedKeysDek, chainId: number, address: string, sealed: string): Promise<GrumpkinScalar> {
	let skBytes: Uint8Array<ArrayBuffer> | undefined
	let skCopy: Buffer | undefined
	try {
		skBytes = await unsealImportedSigningKeyV2(dek, chainId, address, sealed)
		// `fromBuffer` copies, so the intermediate is a second plaintext signing key with its own wipe.
		skCopy = Buffer.from(skBytes)
		return GrumpkinScalar.fromBuffer(skCopy)
	} finally {
		zeroize(dek)
		if (skBytes) zeroize(skBytes)
		if (skCopy) zeroize(skCopy)
	}
}

function accountFileBody(signingKey: GrumpkinScalar, l1ChainId: number, address: string, password: string, encrypt: boolean) {
	const envelope = buildAccountExport(signingKey, l1ChainId, address)
	return encrypt ? encryptAccountExport(envelope, password) : serializeAccountExport(envelope)
}

/** `unattended` refuses a live L1 probe; the rest are the in-place reset's: the journal's index and
 *  visibility, and an L1 the reset already verified, so a create after the purge never probes. */
type CreateOverrides = { unattended?: boolean; index?: number; visible?: boolean; l1ChainId?: number }

export class AccountService extends Service<Methods, Events> implements ServiceSpec<Methods, Events> {
	protected readonly rpcMethods = defineRpcMethods<Methods>()(
		"getAccounts",
		"getAccount",
		"createAccount",
		"ensureDefaultAccount",
		"changeAccountName",
		"changeAccountVisibility",
		"exportAccount",
		"exportResetHeldAccount",
		"importAccount",
		"previewImportAccount",
		"exportFullBackupKeys",
		"exportPasskeyBackupKeys",
		"backupImportedKeys",
		"restoreImportedKeys",
		"reconcileImportedAccounts",
	)
	public static name = ACCOUNT_SERVICE_NAME

	public readonly onAccountAdded = new EventHandler<Account>()
	public readonly onAccountUpdated = new EventHandler<Account>()
	public readonly onAccountDeleted = new EventHandler<Account>()

	private readonly storage: SealedEntityStorage<Account>
	private readonly importedKeys: ImportedKeysRepository
	private readonly staleNetworks: StaleNetworkRepository
	// Serialises restore() so two concurrent full-backup imports of the same
	// account can't BOTH pass the intersection check and BOTH write the same row
	// (last-writer-wins ownership flip).
	private readonly restoreLock = new Lock()

	private profileService: ProfileService = null!
	private networkService: NetworkService = null!
	/** Set by the last-started AccountIntegrityCoordinator; never a topological dependency (a cycle). */
	private runtimeMismatchDelegate: AccountRuntimeMismatchDelegate | null = null

	public constructor(logger: ILogger, browserApi: BrowserApi) {
		super(ACCOUNT_SERVICE_NAME, logger)
		const rowKeys = (profileId: string) => this.profileService.rowKeys(profileId)
		this.storage = sealedEntityStorage("accounts", browserApi.storage.local, rowKeys)
		this.importedKeys = new ImportedKeysRepository(browserApi.storage.local, rowKeys)
		this.staleNetworks = new StaleNetworkRepository(browserApi.storage.local)
	}

	/** The method gets the caller's own argument objects, not zod's parsed copies; the framework
	 *  RPCs `backup` and `restore` have no schema and pass through. */
	protected override invoke(method: string, params: unknown[]): unknown {
		const schema = (AccountMethodSchemas as Record<string, z.ZodType | undefined>)[method]
		if (schema && !schema.safeParse(params).success) throw InvalidWalletArgumentsError.forMethod(method)
		return super.invoke(method, params)
	}

	public setRuntimeMismatchDelegate(delegate: AccountRuntimeMismatchDelegate): void {
		this.runtimeMismatchDelegate = delegate
	}

	/**
	 * Every account row stored under its canonical composite key.
	 *
	 * Rows written before the key included the profile are ignored rather than
	 * half-honored: the field scans below would otherwise find them while
	 * `getAccount` / `getAccountContract` (which look up by composite key) would
	 * not, leaving an account that renders but cannot sign. Ignoring them
	 * uniformly lets `ensureDefaultAccount` recreate a canonical row instead.
	 *
	 * This is deliberately not a migration: no released build wrote a row under the older key, and
	 * rows written before 1.0.0 get none.
	 */
	private async liveRows(): Promise<Account[]> {
		const rows: Account[] = []
		for (const [key, row] of await this.storage.getAll()) {
			if (key === accountRowIdOf(row)) rows.push(row)
		}
		return rows
	}

	protected async init(services: ServiceCollection): Promise<void> {
		this.profileService = services.get(ProfileService.name)
		// Profile-delete cleanup is now the coordinator's awaited `purgeForProfile`,
		// NOT a fire-and-forget `onProfileDeleted` subscriber.
		this.networkService = services.get(NetworkService.name) as NetworkService
		this.networkService.registerChainPurgeSubscriber(async (profileId, chainId) => this.clearChainState(profileId, chainId))
		this.profileService.onRowKeysReady.add((profileId) => void this.onRowKeysReady(profileId))
	}

	/** Converts the profile's plaintext rows, then sweeps its orphan key rows: both need the row
	 *  keys, so both wait for the profile's unlock. A failure is logged; the next worker retries,
	 *  since a later unlock in this one finds the keys held and announces nothing. */
	private async onRowKeysReady(profileId: string): Promise<void> {
		try {
			await this.sealLegacyRows(profileId)
			await this.sweepOrphanImportedKeys(profileId)
		} catch (error) {
			this.logWarn("converting or sweeping the profile's accounts failed; the next worker retries", { error })
		}
	}

	/** Seals the profile's plaintext accounts, one row lock per row, each with its plaintext key row
	 *  in one write and one removal: the pair never stands half converted. Key rows left over (an
	 *  orphan, or a pair a crash split) convert after. */
	private async sealLegacyRows(profileId: string): Promise<void> {
		const rowLock = <R>(fn: (isCurrent: () => boolean) => Promise<R>, rowId: string) =>
			this.tupleLocks.withLock(rowId, () => fn(() => true))
		await this.storage.sealLegacy(profileId, rowLock, undefined, (rowId) => this.importedKeys.legacySealsAt(profileId, rowId))
		await this.importedKeys.sealLegacy(profileId, rowLock)
	}

	/** Deletes the profile's imported-key rows whose account is gone (a torn import that wrote the
	 *  key but crashed before the account). An account counts in either form, sealed or plaintext,
	 *  readable or not, so no hideable view feeds this delete; each candidate is checked again under
	 *  its row's lock, the lock an import holds across its key-first pair of writes. */
	private async sweepOrphanImportedKeys(profileId: string): Promise<void> {
		for (const row of await this.importedKeys.forProfile(profileId)) {
			const rowId = accountRowIdOf(row)
			await this.tupleLocks.withLock(rowId, async () => {
				if (await this.storage.occupied(rowId)) return
				await this.importedKeys.delete(row.profileId, row.chainId, row.address)
			})
		}
	}

	/**
	 * Wipe all accounts for `(profileId, chainId)` and emit
	 * `onAccountDeleted` per-account so downstream listeners (AuthRegistry,
	 * etc.) cascade. Called by `NetworkService.purgeChain`.
	 */
	public async clearChainState(profileId: string, chainId: number): Promise<void> {
		await this.ensureInitialized()
		const accounts = (await this.liveRows()).filter((x) => x.profileId === profileId && x.chainId === chainId)
		await purgeRows(
			accounts,
			// Under the row's lock, so a rename parked on its read cannot write the row back.
			(account) =>
				// A profile deletion reaches here with no row keys for a profile never opened in this
				// worker: its plaintext rows go now, its sealed ones in the deletion's keyless sweep.
				this.tupleLocks.withLock(accountRowIdOf(account), async () => {
					await this.storage.purgeId(accountRowIdOf(account))
					// An imported account's key row shares the account's chain scope — purge it too.
					if (account.type === AccountType.Imported) {
						await this.importedKeys.purge(profileId, chainId, account.address)
					}
				}),
			(account) => this.emit("onAccountDeleted", account),
		)
	}

	public async getAccounts(profileId: string, chainId: number, all?: boolean): Promise<Account[]> {
		await this.ensureInitialized()
		// Index-sorted, not storage order: `getValues()` returns rows in insertion order, which after a
		// full-backup restore is NOT index order — so the default active account (accounts[0]) and the
		// account list would otherwise be arbitrary. Every consumer only iterates/filters, so sorting here
		// is the single source that keeps the first account deterministic across fresh and imported profiles.
		return (
			(await this.liveRows())
				.filter((x) => x.profileId === profileId && x.chainId === chainId && (all || x.visible))
				// Address is the tie-breaker so ordering is TOTAL even if a hostile backup restored duplicate
				// indices (legitimate per-type indices are unique) — no reliance on insertion order anywhere.
				.sort((a, b) => a.index - b.index || (a.address < b.address ? -1 : a.address > b.address ? 1 : 0))
		)
	}

	public async getAccount(profileId: string, chainId: number, address: string): Promise<Account | undefined> {
		await this.ensureInitialized()
		const account = await this.storage.get(accountRowId(profileId, chainId, address))
		return rowMatchesKey(account, profileId, chainId, address) ? account : undefined
	}

	public async createAccount(profileId: string, chainId: number, type: AccountType, name: string): Promise<Account> {
		await this.ensureInitialized()
		await this.assertChainUsable(profileId, chainId)
		return this.serializePerTuple(profileId, chainId, type, () => this.createAccountInternal(profileId, chainId, type, name))
	}

	/**
	 * Idempotent default-account provisioning. Returns the lowest-index derived account of the
	 * `(profileId, chainId)` tuple, visible or hidden; with none, creates the first derived account
	 * whose address no row holds.
	 *
	 * The whole sequence runs under the same per-tuple serialization as
	 * `createAccount`, so concurrent callers (the popup's activation bootstrap,
	 * reached from both a profile event and a boot run) don't race-create duplicates.
	 */
	public async ensureDefaultAccount(profileId: string, chainId: number, type: AccountType, name: string): Promise<Account> {
		await this.ensureInitialized()
		await this.assertChainUsable(profileId, chainId)
		return this.serializePerTuple(profileId, chainId, type, async () => {
			// Imported accounts are excluded from the default-account candidate pool: a foreign key
			// must never become the profile's auto-selected default.
			const existing = (await this.liveRows()).filter(
				(x) => x.profileId === profileId && x.chainId === chainId && x.type !== AccountType.Imported,
			)
			if (existing.length > 0) {
				return existing.sort((a, b) => a.index - b.index)[0]!
			}
			return this.createAccountInternal(profileId, chainId, type, name)
		})
	}

	/**
	 * Create the chain's default account on a caller's behalf that is NOT the user — a dApp asking
	 * for accounts on a chain the wallet has never activated. Two limits make that safe unattended:
	 * a chain that already holds any row (hidden or imported included — the network switch's own
	 * rule) is left alone, and a chain whose L1 identity would need a live endpoint probe is
	 * declined rather than probed. Both are no-ops; the caller re-reads the accounts afterwards.
	 * Every other failure (an `unauthorized` lock/deletion race, storage) propagates.
	 */
	public async provisionDefaultAccount(profileId: string, chainId: number): Promise<void> {
		await this.ensureInitialized()
		await this.assertChainUsable(profileId, chainId)
		await this.serializePerTuple(profileId, chainId, AccountType.Nulo_v1, async () => {
			const rows = (await this.liveRows()).filter((x) => x.profileId === profileId && x.chainId === chainId)
			if (rows.length > 0) return
			try {
				await this.createAccountInternal(profileId, chainId, AccountType.Nulo_v1, DEFAULT_ACCOUNT_NAME, { unattended: true })
			} catch (err) {
				if (!(err instanceof Error && err.message.startsWith(ERR_UNATTENDED_LIVE_CHECK))) throw err
			}
		})
	}

	private async createAccountInternal(
		profileId: string,
		chainId: number,
		type: AccountType,
		name: string,
		opts?: CreateOverrides,
	): Promise<Account> {
		if (type !== AccountType.Nulo_v1) {
			throw new Error("unsupported account type")
		}
		// Capture the deletion fence BEFORE the first await. The secret read
		// releases the profile lock before this frame resumes, so a deletion's
		// continuation can interleave in that gap — an epoch captured after the
		// await could already be post-bump, and the pre-write assert below would
		// pass a doomed write.
		const deletion = this.profileService.getDeletionState()
		if (deletion.isReserved(profileId)) {
			throw new Error("unauthorized")
		}
		const epoch = deletion.capture(profileId)
		// Auth gate FIRST — an unauthorized caller must never trigger the custom-network probe
		// inside resolveVerifiedL1ChainId below.
		const master = await this.profileService.getProfileSecret(profileId)
		if (!master) {
			throw new Error("unauthorized")
		}
		const accounts = (await this.liveRows()).filter((x) => x.profileId === profileId && x.chainId === chainId)
		// Next index over the SAME-TYPE rows only: the guard must sit on the filtered list, or the
		// first account of a new type starts at 1 (`array_max([]) + 1` — the cross-type guard bug).
		const sameType = accounts.filter((x) => x.type === type)
		let index = opts?.index ?? (sameType.length > 0 ? array_max(sameType.map((x) => +x.index)) + 1 : 0)
		// The derivation chain input is the verified EXACT L1 id, never the composite: seeded rows
		// are checked against in-code constants, custom rows against a live probe (fail-closed).
		const l1ChainId = opts?.l1ChainId ?? (await this.networkService.resolveVerifiedL1ChainId(profileId, chainId, opts))
		let account: Account | undefined
		while (!account) {
			const secret = await deriveAccountSeed(master, l1ChainId, type, index)
			const address = (await NuloAccount.new(secret, this.logger, this.name)).address.toString()
			const visible = opts?.visible ?? true
			const candidate: Account = { profileId, chainId, address, index, type, l1ChainId, name, visible }
			if (await this.writeIfFree(candidate, deletion, epoch)) account = candidate
			// A pinned index is a reset re-creating its own account: the row standing at that address
			// holds it, so nothing is written and no other index is tried.
			else if (opts?.index !== undefined) return candidate
			else index++
		}
		// Either purge can snapshot during the set. The epoch check runs after the liveness await,
		// and nothing awaits between it and the emit.
		await this.assertStillLive(account)
		if (!deletion.isCurrent(profileId, epoch)) await this.unwrite(account, profileDeletedError(profileId))
		this.emit("onAccountAdded", account)
		return account
	}

	/** Writes a derived row only where no row stands. The check reads the physical key, so an
	 *  imported account, or a row the codec hides, keeps its address and its key, and the caller
	 *  derives the next index. The row lock is never held across a derivation. */
	private async writeIfFree(account: Account, deletion: ProfileDeletionState, epoch: number): Promise<boolean> {
		// A chain reserved for deletion may already have snapshotted its rows: a row written now
		// would outlive the purge.
		if (!(await this.networkService.isChainLive(account.profileId, account.chainId))) throw new Error("network deleted")
		const id = accountRowIdOf(account)
		return this.tupleLocks.withLock(id, async () => {
			if (await this.storage.occupied(id)) return false
			const write = await this.storage.prepare(id, account)
			// A deletion that began during the probe/derivation bumped the epoch — the
			// purge has already harvested addresses, so writing now would mint a row it
			// can never reclaim. No await between this assert and the write.
			deletion.assertCurrent(account.profileId, epoch)
			await write.commit()
			return true
		})
	}

	/**
	 * Re-creates one reset-journal account on `toChainId`; worker-internal. A derived account keeps
	 * its index, name and visibility and derives under `l1ChainId`, which the reset verified, so
	 * nothing probes after the purge. An imported one is committed only when its resealed key opens
	 * under `(toChainId, newAddress)` and derives `newAddress`. A row already present is skipped;
	 * every other fence of a create applies.
	 */
	public async recreateForReset(profileId: string, toChainId: number, entry: JournalAccount, l1ChainId: number): Promise<void> {
		await this.ensureInitialized()
		if (entry.type === AccountType.Imported) return this.recreateImportedForReset(profileId, toChainId, entry, l1ChainId)
		await this.serializePerTuple(profileId, toChainId, AccountType.Nulo_v1, async () => {
			const rows = await this.liveRows()
			const present = rows.some(
				(x) => x.profileId === profileId && x.chainId === toChainId && x.type === AccountType.Nulo_v1 && x.index === entry.index,
			)
			if (present) return
			const overrides = { index: entry.index, visible: entry.visible, l1ChainId }
			await this.createAccountInternal(profileId, toChainId, AccountType.Nulo_v1, entry.name, overrides)
		})
	}

	private async recreateImportedForReset(profileId: string, toChainId: number, entry: JournalAccount, l1ChainId: number): Promise<void> {
		const { newAddress, encryptedSigningKey } = entry
		if (newAddress === undefined || encryptedSigningKey === undefined) throw new Error("imported reset entry has no resealed key")
		// Fenced like importAccount: captured before the DEK read, which a deletion can interleave.
		const deletion = this.profileService.getDeletionState()
		const epoch = deletion.capture(profileId)
		const dek = await this.profileService.getProfileDek(profileId)
		if (!dek) throw new RecoveryModeError()
		const signingKey = await unsealImportedScalar(dek, toChainId, newAddress, encryptedSigningKey)
		if ((await NuloAccount.fromSigningKey(signingKey, this.logger, this.name)).address.toString() !== newAddress) {
			throw ImportedAccountUnusableError.because("address mismatch")
		}
		const account: Account = {
			profileId,
			chainId: toChainId,
			address: newAddress,
			index: entry.index,
			type: AccountType.Imported,
			l1ChainId,
			name: entry.name,
			visible: entry.visible,
		}
		await this.serializePerTuple(profileId, toChainId, AccountType.Imported, async () => {
			if (await this.storage.occupied(accountRowIdOf(account))) return
			if (!(await this.networkService.isChainLive(profileId, toChainId))) throw new Error("network deleted")
			await this.commitImportedAccount(account, encryptedSigningKey, epoch)
		})
	}

	/**
	 * For the reset view: each imported account on `chainId` mapped to the address its key derives
	 * under this build, or to null when its key is missing or does not open. Reads only.
	 */
	public async inspectImportedForReset(profileId: string, chainId: number): Promise<Map<string, string | null>> {
		await this.ensureInitialized()
		const out = new Map<string, string | null>()
		for (const account of await this.importedOnChain(profileId, chainId)) {
			const signingKey = await this.openImportedForReset(profileId, chainId, account.address)
			out.set(
				account.address,
				signingKey && (await NuloAccount.fromSigningKey(signingKey, this.logger, this.name)).address.toString(),
			)
		}
		return out
	}

	/**
	 * The reset's capture of imported keys: each one on `fromChainId` unsealed, its address derived,
	 * and the key resealed under `(toChainId, newAddress)`. A key that is missing or does not open
	 * maps to null and stays out of the reset. Nothing is written.
	 */
	public async resealImportedForReset(
		profileId: string,
		fromChainId: number,
		toChainId: number,
	): Promise<Map<string, { newAddress: string; encryptedSigningKey: string } | null>> {
		await this.ensureInitialized()
		const out = new Map<string, { newAddress: string; encryptedSigningKey: string } | null>()
		for (const account of await this.importedOnChain(profileId, fromChainId)) {
			const signingKey = await this.openImportedForReset(profileId, fromChainId, account.address)
			if (!signingKey) {
				out.set(account.address, null)
				continue
			}
			const newAddress = (await NuloAccount.fromSigningKey(signingKey, this.logger, this.name)).address.toString()
			// A second copy: the unseal wiped the first, and the seal does not wipe its own.
			const dek = await this.profileService.getProfileDek(profileId)
			if (!dek) throw new RecoveryModeError()
			try {
				out.set(account.address, { newAddress, encryptedSigningKey: await sealSigningKey(dek, toChainId, newAddress, signingKey) })
			} finally {
				zeroize(dek)
			}
		}
		return out
	}

	private async importedOnChain(profileId: string, chainId: number): Promise<Account[]> {
		return (await this.liveRows()).filter((x) => x.profileId === profileId && x.chainId === chainId && x.type === AccountType.Imported)
	}

	/** The key with a fresh DEK copy, which the unseal wipes; null when it is missing or does not
	 *  open, or the session holds no DEK. */
	private async openImportedForReset(profileId: string, chainId: number, address: string): Promise<GrumpkinScalar | null> {
		const keyRow = await this.importedKeys.get(profileId, chainId, address)
		if (!keyRow) return null
		const dek = await this.profileService.getProfileDek(profileId)
		if (!dek) return null
		try {
			return await unsealImportedScalar(dek, chainId, address, keyRow.encryptedSigningKey)
		} catch {
			return null
		}
	}

	/** The post-write liveness read. A read that fails removes the row too, so no caller is left
	 *  holding a row it cannot vouch for (import would otherwise drop the key under it). */
	private async assertStillLive(account: Account): Promise<void> {
		let live: boolean
		try {
			live = await this.networkService.isChainLive(account.profileId, account.chainId)
		} catch (error) {
			return this.unwrite(account, error)
		}
		if (!live) await this.unwrite(account, new Error("network deleted"))
	}

	/** Removes a row no purge will see, then throws `refusal`. Under the row's lock, so a rename
	 *  that read the row cannot write it back, and only while the row still has the type and index
	 *  this writer gave it, so another writer's row at the address stays. */
	private async unwrite(account: Account, refusal: unknown): Promise<never> {
		const id = accountRowIdOf(account)
		await this.tupleLocks.withLock(id, async () => {
			const stored = await this.storage.get(id)
			if (stored?.type === account.type && stored.index === account.index) await this.storage.delete(id)
		})
		throw refusal
	}

	/**
	 * Per-(profileId, chainId, type) async serialization. Wraps an operation
	 * so concurrent calls with the same key run sequentially. Without this,
	 * concurrent `createAccount` / `ensureDefaultAccount` calls can race
	 * inside their `getValues → compute index → set` sequence, producing
	 * duplicate accounts at indices 0 and 1.
	 */
	// maxHoldMs: null — no watchdog: a held tuple lock is never force-released.
	// Under a row lock, await storage only; chain purges can already hold the network lock.
	private readonly tupleLocks = new KeyedLock({ maxHoldMs: null })
	private serializePerTuple<T>(profileId: string, chainId: number, type: AccountType, op: () => Promise<T>): Promise<T> {
		return this.tupleLocks.withLock(`${profileId}:${chainId}:${type}`, op)
	}

	public changeAccountName(profileId: string, chainId: number, address: string, name: string): Promise<Account | undefined> {
		return this.patchAccountField(profileId, chainId, address, "name", name)
	}

	public changeAccountVisibility(profileId: string, chainId: number, address: string, visible: boolean): Promise<Account | undefined> {
		return this.patchAccountField(profileId, chainId, address, "visible", visible)
	}

	/** Whole-row read-modify-write under the row's tuple lock: two field editors racing
	 *  would otherwise revert each other. */
	private patchAccountField<K extends "name" | "visible">(
		profileId: string,
		chainId: number,
		address: string,
		field: K,
		value: Account[K],
	): Promise<Account | undefined> {
		return this.tupleLocks.withLock(accountRowId(profileId, chainId, address), async () => {
			const account = await this.storage.get(accountRowId(profileId, chainId, address))
			if (!rowMatchesKey(account, profileId, chainId, address)) {
				return undefined
			}
			if (account[field] !== value) {
				account[field] = value
				await this.storage.set(accountRowIdOf(account), account)
				this.emit("onAccountUpdated", account)
			}
			return account
		})
	}

	public async getAccountContract(profileId: string, chainId: number, address: string): Promise<IAccountContract> {
		await this.ensureInitialized()
		const account = await this.storage.get(accountRowId(profileId, chainId, address))
		if (!rowMatchesKey(account, profileId, chainId, address)) {
			throw new Error("unknown account address")
		}
		if (account.type === AccountType.Imported) {
			return this.loadImportedAccountContract(profileId, account, address)
		}
		if (account.type !== AccountType.Nulo_v1) {
			throw new Error("unknown account type")
		}
		// Before the derivation: a quarantined chain's addresses are expected to mismatch, and must
		// never reach `raiseRuntimeMismatch`.
		await this.assertChainUsable(profileId, chainId)
		// Re-derivation reads the ROW-CARRIED l1ChainId (self-contained; a tampered value derives
		// a different address and fails closed below). `deriveAccountSeed` rejects non-canonical
		// values — never a silent default.
		const secret = await this.deriveAccountSecret(profileId, account.l1ChainId, account.type, account.index)
		const accountContract: IAccountContract = await NuloAccount.new(secret, this.logger, this.name)
		if (accountContract.address.toString() !== address) {
			await this.raiseRuntimeMismatch(profileId, chainId, account.index, address, accountContract.address.toString())
		}
		return accountContract
	}

	/**
	 * Load an IMPORTED account for signing: decrypt its stored signing key, rebuild via
	 * `fromSigningKey`, and assert the constructed address equals the stored row's — fail closed
	 * on ANY problem (missing key, decrypt/AAD failure, non-canonical scalar, address mismatch).
	 *
	 * Blast radius is deliberately the SINGLE account: a tampered imported key
	 * is external material, so it must not profile-wide-block the derived accounts. The typed
	 * error lets the UI say so; delete + re-import is the repair. No profile block, no
	 * `raiseRuntimeMismatch`.
	 */
	private async loadImportedAccountContract(profileId: string, account: Account, requestedAddress: string): Promise<IAccountContract> {
		await this.assertChainUsable(profileId, account.chainId)
		const keyRow = await this.importedKeys.get(profileId, account.chainId, account.address)
		if (!keyRow) throw ImportedAccountUnusableError.because("signing key missing")
		// The imported-key root is the CREDENTIAL-sealed per-profile DEK, never the master (a
		// shared recovery phrase means a shared master — the DEK is the isolation boundary).
		// A DEGRADED session (dek undefined — the slot failed at unlock) quarantines per-account.
		const dek = await this.profileService.getProfileDek(profileId)
		if (!dek) throw ImportedAccountUnusableError.because("imported keys unavailable — unlock again")
		try {
			const signingKey = await unsealImportedScalar(dek, account.chainId, account.address, keyRow.encryptedSigningKey)
			const contract = await NuloAccount.fromSigningKey(signingKey, this.logger, this.name)
			if (contract.address.toString() !== requestedAddress) {
				throw ImportedAccountUnusableError.because("address mismatch")
			}
			return contract
		} catch (err) {
			if (err instanceof ImportedAccountUnusableError) throw err
			throw ImportedAccountUnusableError.because("signing key could not be recovered")
		}
	}

	/**
	 * Export one account as a NULO-ACCOUNT-EXPORT file body. Service-side auth: the profile
	 * password must unseal the master (a compromised popup can't bypass it). The exported secret
	 * is the account's Schnorr signing key — for a DERIVED account we re-derive it; for an
	 * IMPORTED account we decrypt the stored one. `secretKey` is never exported (derivable).
	 */
	public async exportAccount(profileId: string, chainId: number, address: string, password: string, encrypt: boolean): Promise<string> {
		await this.ensureInitialized()
		const account = await this.storage.get(accountRowId(profileId, chainId, address))
		if (!rowMatchesKey(account, profileId, chainId, address)) {
			throw new Error("unknown account address")
		}
		// Service-side authentication: unseal via the profile password (throws on wrong password).
		// exportMnemonic-style — the master returned by getProfileSecret is session-gated, so we
		// additionally require the password here to gate the SECRET export behind a fresh check.
		const master = await this.profileService.exportPlain(profileId, password)
		if (typeof master !== "string" || master.length === 0) throw new Error("unauthorized")

		let signingKey: GrumpkinScalar
		if (account.type === AccountType.Imported) {
			const keyRow = await this.importedKeys.get(profileId, chainId, address)
			if (!keyRow) throw ImportedAccountUnusableError.because("signing key missing")
			// Fresh auth: the DEK unseals under the SUPPLIED password directly —
			// session-independent, deletion-guarded — never via SessionManager.
			const dek = await this.profileService.exportImportedKeysDek(profileId, password)
			signingKey = await unsealImportedScalar(dek, chainId, address, keyRow.encryptedSigningKey)
		} else if (account.type === AccountType.Nulo_v1) {
			const masterCopy = fromBase64Lenient(master)
			const masterFr = Fr.fromBuffer(masterCopy)
			zeroize(masterCopy)
			const seed = await deriveAccountSeed(masterFr, account.l1ChainId, account.type, account.index)
			signingKey = deriveSigningKeyFromSeed(seed)
		} else {
			throw new Error("unknown account type")
		}
		// The envelope names this build's regime, so it may only carry an address that regime derives
		// from the key: a row stored under a superseded regime would export a file no build imports.
		const derived = (await NuloAccount.fromSigningKey(signingKey, this.logger, this.name)).address.toString()
		if (derived !== address) {
			if (account.type === AccountType.Imported) throw ImportedAccountUnusableError.because("address mismatch")
			// A quarantined chain's rows are expected to mismatch. Classifying again needs the session,
			// which a password-authenticated export may not hold, and would block the whole profile.
			await this.assertChainUsable(profileId, chainId)
			await this.raiseRuntimeMismatch(profileId, chainId, account.index, address, derived)
		}
		return accountFileBody(signingKey, account.l1ChainId, address, password, encrypt)
	}

	/**
	 * Export an imported account a reset holds in its journal, whose row no picker lists while the
	 * chain is quarantined or after the purge, as {@link exportAccount} does for a live one. The
	 * password opens the DEK through a full unseal, the service-side check; the key must derive the
	 * journal's address under this build, so the file names the address the person picked. Reads only.
	 */
	public async exportResetHeldAccount(profileId: string, address: string, password: string, encrypt: boolean): Promise<string> {
		await this.ensureInitialized()
		const journal = await this.staleNetworks.getJournal(profileId)
		const entry = journal?.accounts.find((a) => a.type === AccountType.Imported && a.newAddress === address)
		if (!journal || !entry?.encryptedSigningKey) throw new Error("unknown account address")
		const dek = await this.profileService.exportImportedKeysDek(profileId, password)
		const signingKey = await unsealImportedScalar(dek, journal.toChainId, address, entry.encryptedSigningKey)
		if ((await NuloAccount.fromSigningKey(signingKey, this.logger, this.name)).address.toString() !== address) {
			throw ImportedAccountUnusableError.because("address mismatch")
		}
		return accountFileBody(signingKey, journal.l1ChainId, address, password, encrypt)
	}

	/**
	 * Import an account from a file body into `(profileId, chainId)`. Validates the envelope,
	 * recomputes the address from the signing key and requires it to equal `expectedAddress` (the
	 * address the UI showed the user — the checksum authenticates nothing), rejects a duplicate,
	 * then writes KEY-ROW-FIRST with compensation so a crash never leaves an Account row that
	 * cannot sign.
	 */
	public async importAccount(
		profileId: string,
		chainId: number,
		fileBody: string,
		expectedAddress: string,
		password: string,
		name?: string,
	): Promise<Account> {
		await this.ensureInitialized()
		await this.assertChainUsable(profileId, chainId)
		// Fenced like createAccount: captured before the DEK read, which a deletion can interleave.
		const deletion = this.profileService.getDeletionState()
		const epoch = deletion.capture(profileId)
		// Session-gated DEK for sealing the key at rest (the credential-rooted isolation boundary
		// — never the master). A degraded session cannot ACCEPT new imported material: fail loud.
		const dek = await this.profileService.getProfileDek(profileId)
		if (!dek) throw new Error("Imported keys unavailable. Unlock again")
		try {
			const { signingKey, address: recomputed } = await this.decodeAccountExport(fileBody, password)
			// The user CONFIRMED this exact address in the UI (the checksum authenticates nothing —
			// a self-consistent hostile file is caught here).
			if (recomputed !== expectedAddress) throw new Error("Imported account address does not match the confirmed address")

			return await this.serializePerTuple(profileId, chainId, AccountType.Imported, async () => {
				const sameType = (await this.liveRows()).filter(
					(x) => x.profileId === profileId && x.chainId === chainId && x.type === AccountType.Imported,
				)
				const index = sameType.length > 0 ? array_max(sameType.map((x) => +x.index)) + 1 : 0

				// Imported accounts bind to the ACTIVE network's L1 identity (they don't derive from it,
				// but the row must carry a coherent value for the Account↔Network cross-check).
				const l1ChainId = await this.networkService.getL1ChainIdStored(profileId, chainId)

				const sealed = await sealSigningKey(dek, chainId, recomputed, signingKey)
				if (!(await this.networkService.isChainLive(profileId, chainId))) throw new Error("network deleted")
				const account: Account = {
					profileId,
					chainId,
					address: recomputed,
					index,
					type: AccountType.Imported,
					l1ChainId,
					// User-chosen display name; the export envelope deliberately carries none (the v1
					// file format is frozen), so the UI asks at import time.
					name: (typeof name === "string" && name.trim().slice(0, 40)) || DEFAULT_IMPORTED_ACCOUNT_NAME,
					visible: true,
				}
				await this.commitImportedAccount(account, sealed, epoch)
				return account
			})
		} finally {
			// Outer ownership: the dek copy dies on EVERY path (decode failure, duplicate
			// rejection, l1 lookup throw, seal throw, success).
			zeroize(dek)
		}
	}

	/**
	 * The duplicate check and both writes share one hold of the row's lock, the lock a create of the
	 * same address takes, so neither can land between the other's check and write. Key row first:
	 * a crash between the two writes leaves an orphan key (swept at the next unlock), never an account that
	 * cannot sign. A failure after the key write removes it; the duplicate refusal writes nothing.
	 */
	private async commitImportedAccount(account: Account, sealed: string, epoch: number): Promise<void> {
		const { profileId, chainId, address } = account
		const deletion = this.profileService.getDeletionState()
		const id = accountRowIdOf(account)
		let keyWritten = false
		try {
			await this.tupleLocks.withLock(id, async () => {
				// The stored rows, not the decoded view: a row the codec or its keys hide is still there.
				if (await this.storage.occupied(id)) throw new Error("This account is already in your wallet")
				const keyWrite = await this.importedKeys.prepare({ profileId, chainId, address, encryptedSigningKey: sealed })
				deletion.assertCurrent(profileId, epoch)
				await keyWrite.commit()
				keyWritten = true
				const accountWrite = await this.storage.prepare(id, account)
				deletion.assertCurrent(profileId, epoch)
				await accountWrite.commit()
			})
			// As in createAccountInternal: liveness, then the epoch, then the emit. The emit stays in
			// here because an await between it and the epoch check would let a deletion begin unseen.
			await this.assertStillLive(account)
			if (!deletion.isCurrent(profileId, epoch)) await this.unwrite(account, profileDeletedError(profileId))
		} catch (rowErr) {
			// Imports of one (profile, chain) serialise, so this key is this import's or already gone.
			if (keyWritten) await this.importedKeys.delete(profileId, chainId, address).catch(() => {})
			throw rowErr
		}
		this.emit("onAccountAdded", account)
	}

	/**
	 * Mid-session escape hatch: an extension update can rehydrate a live session under new
	 * derivation code without passing the pre-open verifier. With the coordinator's delegate set, a
	 * mismatch confined to this chain quarantines the chain and keeps the session
	 * (`ChainNotSupportedError`). Anything else, a delegate that fails, or no delegate yet (the
	 * startup window) is fail-closed and delegate-independent: `profileService` is a phase-0
	 * dependency (always present) and `integrityBlocked` is our own repo. Both the durable block
	 * (drives the barrier + the next-boot gate) and the session close are AWAITED before the error
	 * propagates, so an MV3 termination right after the throw cannot lose either; a failure in one
	 * is logged but never masks the typed error.
	 */
	private async raiseRuntimeMismatch(
		profileId: string,
		chainId: number,
		accountIndex: number,
		storedAddress: string,
		derivedAddress: string,
	): Promise<never> {
		if (await this.quarantinedAtRuntime(profileId, chainId)) throw new ChainNotSupportedError()
		const record: AccountIntegrityBlocked = {
			profileId,
			chainId,
			accountIndex,
			storedAddress,
			derivedAddress,
			regimeId: V6_REGIME.id,
			walletVersion: typeof __VERSION__ === "undefined" ? "unknown" : __VERSION__,
			detectedAt: Date.now(),
		}
		// Persist through ProfileService's locked, still-exists-guarded writer: this runs OFF the
		// facade lock (getAccountContract isn't inside a profile op), so a concurrent delete must not
		// leave an orphan block for a just-deleted profile.
		try {
			await this.profileService.persistIntegrityBlockIfLive(record)
		} catch (writeError) {
			this.logger.log(ACCOUNT_SERVICE_NAME, LogLevel.Error, "integrity block persist failed", { error: writeError })
		}
		try {
			await this.profileService.lockProfileIfActive(profileId)
		} catch (closeError) {
			this.logger.log(ACCOUNT_SERVICE_NAME, LogLevel.Error, "integrity session close failed", { error: closeError })
		}
		throw new AccountAddressInconsistencyError(undefined, { profileId, chainId, accountIndex })
	}

	/** No account on a quarantined chain is created, imported or loaded for signing; the reset
	 *  re-creates through the internal path. */
	private async assertChainUsable(profileId: string, chainId: number): Promise<void> {
		if (await this.networkService.isChainQuarantined(profileId, chainId)) throw new ChainNotSupportedError()
	}

	private async quarantinedAtRuntime(profileId: string, chainId: number): Promise<boolean> {
		if (!this.runtimeMismatchDelegate) return false
		try {
			return await this.runtimeMismatchDelegate.classifyRuntimeMismatch(profileId, chainId)
		} catch (error) {
			this.logger.log(ACCOUNT_SERVICE_NAME, LogLevel.Error, "runtime mismatch classification failed", { error })
			return false
		}
	}

	private async deriveAccountSecret(profileId: string, l1ChainId: number, type: number, index: number): Promise<Fr> {
		const master = await this.profileService.getProfileSecret(profileId)
		if (!master) {
			throw new Error("unauthorized")
		}
		// The ONE shared formula (NULO-ACCOUNT-KDF v2) — also consumed by the integrity
		// coordinator; a second implementation is the drift class that bricks at unlock.
		return deriveAccountSeed(master, l1ChainId, type, index)
	}

	/**
	 * Every account row holding `address`, across all profiles.
	 *
	 * The address is no longer a unique row identity: two profiles built from one
	 * mnemonic derive the same one. Callers that must decide whether an
	 * address-keyed record is unambiguously a given profile's use this.
	 */
	public async getAccountsByAddress(address: string): Promise<Account[]> {
		await this.ensureInitialized()
		return (await this.liveRows()).filter((x) => x.address === address)
	}

	/** Whether an account row of a profile other than `profileId` is stored but not readable here
	 *  (hidden by its codec, its key check, or a seal this worker holds no keys for), so the owners
	 *  of an address cannot be known from the readable rows alone. A row whose key names no profile
	 *  counts. */
	public async hasUnreadAccountsBesides(profileId: string): Promise<boolean> {
		await this.ensureInitialized()
		const readable = new Set(
			(await this.storage.entries())
				.filter(({ located, row }) => located.naturalId === accountRowIdOf(row))
				.map(({ located }) => located.storageId),
		)
		return (await this.storage.getKeys()).some((id) => !readable.has(id) && parseAccountRowId(id)?.profileId !== profileId)
	}

	/** Lock-free, profileId-parameterized account read — for the deletion
	 *  coordinator's snapshot (safe under the facade lock: no requireActiveProfile). */
	public async getAccountsRaw(profileId: string): Promise<Account[]> {
		await this.ensureInitialized()
		return (await this.liveRows()).filter((x) => x.profileId === profileId)
	}

	/** Addresses harvested from RAW rows (codec-hidden included) owned by
	 *  `profileId` — feeds the deletion snapshot so a malformed parent's dependent
	 *  tx/authwit/balance rows still cascade. Identity comes ONLY from the
	 *  canonical row id, never from the value: malformed bytes at another
	 *  profile's key can claim any profileId/address, and harvesting that claim
	 *  would cascade-delete the OTHER profile's address-keyed rows. A sealed row's
	 *  id is the natural id its seal carries, never its storage key, whose address
	 *  is a keyed hash; one this worker cannot open gives none. Read-only. */
	public async rawAddressesForProfile(profileId: string): Promise<string[]> {
		const out = new Set<string>()
		const harvest = (rowId: string) => {
			const key = parseAccountRowId(rowId)
			if (key !== undefined && key.profileId === profileId && key.address.length > 0) out.add(key.address)
		}
		// A plaintext row stands at its natural id whatever its bytes, a syntax-broken one included.
		for (const [storageId, raw] of await this.storage.rawStringEntries()) if (!isSealedText(raw)) harvest(storageId)
		for (const { naturalId } of (await this.storage.rawRowsOf(profileId)).rows) harvest(naturalId)
		return [...out]
	}

	/** Awaited profile-scoped account purge, called by the deletion coordinator so deletion is
	 *  awaited end-to-end. Idempotent: delete-of-gone is a no-op, so a resumed/re-run
	 *  coordinator converges. */
	public async purgeForProfile(profileId: string): Promise<void> {
		await this.ensureInitialized()
		this.logDebug(`purgeForProfile ${profileId}: remove related accounts`)
		const accounts = (await this.liveRows()).filter((x) => x.profileId === profileId)
		// SILENT: the deletion coordinator awaits every dependent purge DIRECTLY
		// (txs/auth via purgeForAccounts, balances via purgeForTokens, incoming via
		// clearProfile), so re-emitting onAccountDeleted here is redundant — and its
		// fire-and-forget consumers (auth/tx/incoming) run async AFTER the coordinator
		// releases the id, clobbering a successor that reuses this deterministic
		// address. The standalone deleteNetwork/deleteAccount paths keep
		// their emit; only the profile-wide purge goes silent.
		await purgeRows(
			accounts,
			// Under the row's lock, so a rename parked on its read cannot write the row back.
			// With no row keys only the plaintext rows go here; the raw pass below takes every other
			// row at this profile's keys, sealed included.
			(account) => this.tupleLocks.withLock(accountRowIdOf(account), () => this.storage.purgeId(accountRowIdOf(account))),
			() => {},
		)
		// Purge this profile's imported-account signing keys alongside its account rows; a sealed key
		// row with no keys to open it goes in the deletion's keyless sweep.
		for (const keyRow of await this.importedKeys.forProfile(profileId)) {
			await this.importedKeys.purge(keyRow.profileId, keyRow.chainId, keyRow.address)
		}
		// Raw second pass — a validation-failed row this profile owns is
		// invisible to liveRows() and would otherwise survive the purge forever.
		// KEY ownership beats the value's claim: a row at another profile's
		// canonical key is NEVER deleted here whatever its bytes claim (it is that
		// profile's junk, erased when THAT profile is deleted) — so no live writer
		// (another profile's restore/create) can legitimately target a key this
		// pass deletes, and the delete races nobody. Rows at non-canonical keys
		// (legacy shapes, which no writer ever produces) fall back to the value's
		// profileId claim; an unreadable value at such a key is kept, since only
		// a canonical key can attribute it. The restoreLock hold additionally
		// excludes concurrent restores outright while the pass runs.
		await this.restoreLock.withLock(() =>
			purgeMalformedRows(
				{
					rawStringEntries: () => this.storage.rawStringEntries(),
					rawValue: (id) => this.storage.rawValue(id),
					// By storage id: a sealed row's key is not its natural id.
					delete: (id) => this.storage.deleteStorageId(id),
				},
				(raw, id) => {
					const key = parseAccountRowId(id)
					if (key !== undefined) return key.profileId === profileId
					return raw.profileId === profileId
				},
				(id) => this.logDebug(`purged malformed account row ${id}`),
				undefined,
				(id) => parseAccountRowId(id)?.profileId === profileId,
			),
		)
	}

	public async backup(): Promise<Account[]> {
		const profile = await requireActiveProfile(this.profileService)
		await this.refuseDuringReset(profile.id)
		const rows = await this.rowsOfProfile(profile.id)
		await this.refuseDuringReset(profile.id)
		return rows
	}

	/** The journal is the only copy of the accounts a reset is moving, so a full backup refuses
	 *  while one exists, before and after its reads. */
	private async refuseDuringReset(profileId: string): Promise<void> {
		if (await this.staleNetworks.getJournal(profileId)) {
			throw new Error(`${ERR_RESET_PENDING}: Finish the network reset before making a full backup.`)
		}
	}

	private async rowsOfProfile(profileId: string): Promise<Account[]> {
		return (await this.liveRows()).filter((x) => x.profileId === profileId)
	}

	public async restore(accounts: Account[]): Promise<Restored<Account>[]> {
		await this.ensureInitialized()
		// Deletion fence captured at entry (see restore-fence.ts): rows written
		// after a mid-restore deleteProfile must reject, not orphan.
		const deletion = this.profileService.getDeletionState()
		const epochs = captureRestoreEpochs(deletion, accounts.map(restoreRowProfileId))

		// Serialise the whole restore: the intersection check + the writes must be
		// atomic w.r.t. a concurrent restore, or two imports of the same address
		// both pass the check then both write (last-writer-wins ownership).
		return await this.restoreLock.withLock(async () => {
			// Identity is the full row id, not the address alone: two profiles restored
			// from the same mnemonic legitimately derive the same address, and each owns
			// its own row. This whole-batch collision check stays OUTSIDE restoreRows —
			// it aborts the entire restore, not a single row. Non-object rows are
			// excluded HERE only (the key extraction would throw on a hostile null,
			// aborting the slice); they still flow to restoreRows, which records
			// each as its own restoreError.
			const collidable = accounts.filter((a): a is Account => typeof a === "object" && a !== null)
			const collides = hasIntersectionByKeys(await this.liveRows(), collidable, ["profileId", "chainId", "address"])
			if (collides) throw new Error("Duplicate account")

			const seen = new Set<string>()
			const networkedChains = new Map<string, Set<number>>()
			const hasNetwork = async (profileId: string, chainId: number) => {
				let chains = networkedChains.get(profileId)
				if (!chains) {
					chains = new Set((await this.networkService.getNetworksRaw(profileId)).map((n) => n.chainId))
					networkedChains.set(profileId, chains)
				}
				return chains.has(chainId)
			}
			return await restoreRows(accounts, async (account) => {
				// H: validate + canonicalize the persisted shape (mirror the read codec).
				const parsed = AccountSchema.parse(account)
				// Account↔Network chain-identity cross-check: the backup checksum is integrity-not-
				// auth, so a doctored blob can carry a self-consistent (chainId, l1ChainId) pair.
				// Networks restore BEFORE accounts in the full-backup order, so the stored
				// (seeded-constant-validated) row is the reference; mismatch rejects the row.
				// An imported row on a chain with no network is held unchecked: there is nothing to
				// check it against, and refusing it would lose a key no recovery phrase re-derives.
				// A derived row there is refused: it re-derives once its network exists.
				if (parsed.type !== AccountType.Imported || (await hasNetwork(parsed.profileId, parsed.chainId))) {
					const expectedL1 = await this.networkService.getL1ChainIdStored(parsed.profileId, parsed.chainId)
					if (parsed.l1ChainId !== expectedL1) {
						throw new Error(`account/network chain identity mismatch: ${parsed.l1ChainId} vs ${expectedL1}`)
					}
				}
				// F: reject an empty/whitespace address. "Successfully restored" must NOT
				// mean "set() didn't throw" for a blank address — a blank-account row
				// would otherwise join the imported-account allow-set and let a tx/authwit
				// referencing "" through. (Full AztecAddress canonicalization is a stronger
				// follow-up; a legit backup's addresses are already canonical, so the
				// composable's address-match stays exact for real data.)
				if (parsed.address.trim().length === 0) throw new Error("empty account address")
				// Dedupe within the batch — the storage-intersection check above only
				// covers pre-existing rows, so two identical addresses in one restore
				// would otherwise both "succeed" (last write wins).
				const rowId = accountRowIdOf(parsed)
				if (seen.has(rowId)) throw new Error("duplicate account address in batch")
				seen.add(rowId)
				const write = await this.storage.prepare(rowId, parsed)
				assertRestoreEpoch(deletion, epochs, parsed.profileId)
				await write.commit()
				return parsed
			})
		})
	}

	/** Decode + validate an account-export file body → its signing key + recomputed address.
	 *  Shared by `previewImportAccount` (show the address) and `importAccount` (write). */
	private async decodeAccountExport(fileBody: string, password: string): Promise<{ signingKey: GrumpkinScalar; address: string }> {
		if (fileBody.length > 64 * 1024) throw new Error("Account export file is too large")
		// Encrypted variant is base64 (not JSON); plaintext starts with `{`.
		const trimmed = fileBody.trim()
		const json = trimmed.startsWith("{") ? trimmed : await decryptAccountExport(trimmed, password)
		const { signingKey, claimedAddress } = parseAccountExport(json)
		// The address is a pure function of the signing key — recompute and require it to match the
		// file's self-claim (catches a plaintext file whose address was edited without the key).
		const address = (await NuloAccount.fromSigningKey(signingKey, this.logger, this.name)).address.toString()
		if (address !== claimedAddress) throw new Error("Account export address does not match its signing key")
		return { signingKey, address }
	}

	public async previewImportAccount(fileBody: string, password: string): Promise<string> {
		await this.ensureInitialized()
		return (await this.decodeAccountExport(fileBody, password)).address
	}

	/**
	 * Accounts are read before the key rows: an import that lands between the two reads can add a
	 * key row with no account, which the orphan sweep removes at the profile's next unlock,
	 * but never an account without its key. The fence is asserted again after the last seal, so a lock, switch, deletion or
	 * worker restart during the export throws instead of returning another session's material.
	 */
	public async exportFullBackupKeys(fence: RunFence, password: string): Promise<FullBackupKeys> {
		await this.ensureInitialized()
		await this.profileService.assertRunFence(fence)
		await this.refuseDuringReset(fence.profileId)
		const { masterKey, entropy, sourceDek, transferKey } = await this.profileService.openBackupTransfer(fence.profileId, password)
		try {
			const accounts = await this.rowsOfProfile(fence.profileId)
			const stored = await this.importedKeys.backup(fence.profileId)
			const resealed = sourceDek ? await this.resealImportedKeys(stored, sourceDek, transferKey) : { rows: stored, unopened: 0 }
			await this.refuseDuringReset(fence.profileId)
			await this.profileService.assertRunFence(fence)
			return {
				masterKey,
				entropy,
				importedKeysKey: toBase64(transferKey),
				importedKeyRows: resealed.rows,
				accounts,
				dekReplaced: sourceDek === null,
				unopenedImportedKeys: resealed.unopened,
			}
		} finally {
			zeroize(sourceDek)
			zeroize(transferKey)
		}
	}

	/**
	 * Accounts are read first so a concurrent import cannot export an account without its key. The
	 * rows are counted where the DEK lives and returned as read: the file carries exactly those.
	 */
	public async exportPasskeyBackupKeys(fence: RunFence, credentialData: PasskeyCredentialData): Promise<PasskeyBackupKeys> {
		await this.ensureInitialized()
		await this.profileService.assertRunFence(fence)
		await this.refuseDuringReset(fence.profileId)
		const accounts = await this.rowsOfProfile(fence.profileId)
		const importedKeyRows = await this.importedKeys.backup(fence.profileId)
		const material = await this.profileService.exportPasskeyBackupKeys(fence.profileId, credentialData, importedKeyRows)
		await this.refuseDuringReset(fence.profileId)
		await this.profileService.assertRunFence(fence)
		return {
			credentialId: material.credentialId,
			dekSealed: material.dekSealed,
			dekReplaced: material.dekReplaced,
			unopenedImportedKeys: material.unopened,
			importedKeyRows,
			accounts,
		}
	}

	/** Re-seal each row from `from` to `to`. A row that does not open travels as stored, and the
	 *  restore files it as an orphan; a seal failure aborts. */
	private async resealImportedKeys(
		rows: ImportedAccountKey[],
		from: ImportedKeysDek,
		to: ImportedKeysDek,
	): Promise<{ rows: ImportedAccountKey[]; unopened: number }> {
		const out: ImportedAccountKey[] = []
		let unopened = 0
		for (const row of rows) {
			let skBytes: Uint8Array<ArrayBuffer>
			try {
				skBytes = await unsealImportedSigningKeyV2(from, row.chainId, row.address, row.encryptedSigningKey)
			} catch {
				unopened++
				out.push(row)
				continue
			}
			try {
				out.push({ ...row, encryptedSigningKey: await sealImportedSigningKeyV2(to, row.chainId, row.address, skBytes) })
			} finally {
				zeroize(skBytes)
			}
		}
		if (unopened > 0) this.logWarn("imported-key rows did not open at backup export", { unopened })
		return { rows: out, unopened }
	}

	/** Backup this profile's imported-account key rows (the dedicated `imported-account-keys`
	 *  slice). Ciphertext only — the plaintext keys never leave the encrypted envelope. */
	public async backupImportedKeys(): Promise<ImportedAccountKey[]> {
		await this.ensureInitialized()
		const profile = await requireActiveProfile(this.profileService)
		await this.refuseDuringReset(profile.id)
		const keys = await this.importedKeys.backup(profile.id)
		await this.refuseDuringReset(profile.id)
		return keys
	}

	/** Restore imported-account key rows via the SOURCE→DESTINATION rewrap (clone divergence):
	 *  backup rows are sealed under the SOURCE profile's DEK; the restored
	 *  row minted a FRESH one. `ProfileService.restore()` stashed both in a TTL-bound context;
	 *  this consumes it atomically, re-seals every row under the destination DEK, and zeroizes
	 *  the source immediately. A missing/expired context with rows present fails those rows into
	 *  the existing orphan taxonomy (`reconcileImportedAccounts` then drops the keyless type-1
	 *  Account rows) — never silently-kept undecryptable rows. Runs BEFORE the reconcile. */
	public async restoreImportedKeys(rows: ImportedAccountKey[]): Promise<Restored<ImportedAccountKey>[]> {
		await this.ensureInitialized()
		// Deletion fence captured at entry (see restore-fence.ts) — the rewrap
		// awaits are long enough for a rollback deleteProfile to complete.
		const deletion = this.profileService.getDeletionState()
		const epochs = captureRestoreEpochs(deletion, rows.map(restoreRowProfileId))
		return await this.restoreLock.withLock(async () => {
			// One context per restore (normalizeAllIds remapped every row to the new profile id).
			const profileIds = [...new Set(rows.map((r) => (typeof r?.profileId === "string" ? r.profileId : "")))].filter(Boolean)
			const contexts = new Map<string, { sourceDek: ImportedKeysDek; destinationDek: ImportedKeysDek }>()
			try {
				for (const pid of profileIds) {
					const ctx = await this.profileService.consumeDekRewrapContext(pid)
					if (ctx) contexts.set(pid, ctx)
				}
				return await restoreRows(rows, async (row) => {
					const parsed = ImportedAccountKeySchema.parse(row)
					if (parsed.address.trim().length === 0) throw new Error("empty imported-key address")
					const ctx = contexts.get(parsed.profileId)
					if (!ctx) throw new Error("no rewrap context for imported key, so it was not restored")
					let skBytes: Uint8Array<ArrayBuffer> | undefined
					try {
						skBytes = await unsealImportedSigningKeyV2(
							ctx.sourceDek,
							parsed.chainId,
							parsed.address,
							parsed.encryptedSigningKey,
						)
						const resealed = await sealImportedSigningKeyV2(ctx.destinationDek, parsed.chainId, parsed.address, skBytes)
						const rewrapped = { ...parsed, encryptedSigningKey: resealed }
						const write = await this.importedKeys.prepare(rewrapped)
						assertRestoreEpoch(deletion, epochs, rewrapped.profileId)
						await write.commit()
						return rewrapped
					} finally {
						if (skBytes) zeroize(skBytes)
					}
				})
			} finally {
				for (const ctx of contexts.values()) {
					zeroize(ctx.sourceDek)
					zeroize(ctx.destinationDek)
				}
			}
		})
	}

	private readonly accountPurgeSubscribers: Array<(profileId: string, scopes: ReadonlyArray<AccountScope>) => Promise<void>> = []

	/** Register an awaited cleanup for account-scope removals. Peer services call this
	 *  from their `init()`. `reconcileImportedAccounts` awaits every subscriber BEFORE
	 *  deleting the Account rows; a subscriber throw aborts the removal with every row
	 *  still in place — dependents die first, never the other way around. */
	public registerAccountPurgeSubscriber(fn: (profileId: string, scopes: ReadonlyArray<AccountScope>) => Promise<void>): void {
		this.accountPurgeSubscribers.push(fn)
	}

	/**
	 * After a full-backup restore, drop any IMPORTED Account row that has no matching key row —
	 * a hostile epoch-4 backup can carry a type-1 row with the key slice omitted, which would
	 * otherwise restore as a zombie that fails only at signing. Runs during the restore, after both
	 * the account rows and the key rows have landed and before the profile's session opens.
	 *
	 * Ordering is list → awaited dependent purges → delete: a crash before the purge changes
	 * nothing; a crash after it leaves a keyless account with no stale dependents, repaired by
	 * the next reconcile. Scopes are full (chainId, address) tuples — the same address can
	 * legitimately exist on another chain of this profile and must survive. Returns only the
	 * scopes actually deleted: the delete pass re-reads each row under its lock, so an account
	 * whose key appeared during the awaited purge is kept and not reported. A create never writes
	 * over a candidate: it skips every occupied address.
	 */
	public async reconcileImportedAccounts(profileId: string): Promise<AccountScope[]> {
		await this.ensureInitialized()
		const imported = (await this.liveRows()).filter((a) => a.profileId === profileId && a.type === AccountType.Imported)
		const keyless: Account[] = []
		for (const account of imported) {
			if (await this.tupleLocks.withLock(accountRowIdOf(account), () => this.isKeylessImport(account))) keyless.push(account)
		}
		if (keyless.length === 0) return []
		const scopes = keyless.map((a) => ({ chainId: a.chainId, address: a.address }))
		for (const subscriber of this.accountPurgeSubscribers) {
			await subscriber(profileId, scopes)
		}
		const dropped: AccountScope[] = []
		for (const account of keyless) {
			// Under the row's lock: a rename parked on the row's read would otherwise write it back.
			const deleted = await this.tupleLocks.withLock(accountRowIdOf(account), async () => {
				if (!(await this.isKeylessImport(account))) return false
				await this.storage.delete(accountRowIdOf(account))
				return true
			})
			if (!deleted) continue
			this.emit("onAccountDeleted", account)
			dropped.push({ chainId: account.chainId, address: account.address })
		}
		return dropped
	}

	/** Whether the row stored at `account`'s address is still an imported account with no key row,
	 *  read fresh, since it was listed before an await. Called under the row's lock. */
	private async isKeylessImport(account: Account): Promise<boolean> {
		const { profileId, chainId, address } = account
		const stored = await this.storage.get(accountRowIdOf(account))
		if (!rowMatchesKey(stored, profileId, chainId, address) || stored.type !== AccountType.Imported) return false
		return !(await this.importedKeys.get(profileId, chainId, address))
	}
}
