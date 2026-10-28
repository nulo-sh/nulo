// Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0.
import { getErrorMessage } from "@nulo/wallet-core/utils"
import type { Fr } from "@aztec-labs/foundation/curves/bn254"
import { isNewPasswordValid } from "@/utils/password"
import { toRestoreError } from "@/utils/restore-error"
import type { BrowserApi, RuntimePort, StorageArea } from "@nulo/wallet-core/ports"
import { profileImportedKey, profileNotFirstKey, profileUiKeys } from "@/utils/profile-ui-keys"
import type { IConfig } from "@/wallet/config"
import { LogLevel, type ILogger } from "@/wallet/logger"
import type { Restored, ServiceCollection, ServiceSpec } from "@/wallet/base"
import { DEFAULT_INIT_TIMEOUT_MS, Service, defineRpcMethods } from "@nulo/extension-messaging/background"
import {
	AccountAddressInconsistencyError,
	DuplicateWalletError,
	InvalidPasswordError,
	PasskeyNotOpenedError,
	RecoveryModeError,
	RestoreTornError,
	RetiredProfileError,
	SameUnlockMethodError,
	SessionEndedError,
	StaleUnlockCredentialError,
	UnlockMethodChangedError,
} from "@nulo/extension-messaging/errors"
import { fromBase64Lenient, Lock } from "@/wallet/utils"
import { isGeneratedProfileId, ProfileRepository } from "./repository"
import { EventHandler } from "@nulo/wallet-core/utils"
import { array_equals, canonicalizeMnemonic, deferred, getEntropy, getMnemonic, toBase64 } from "@nulo/wallet-core/utils"
import {
	asBase64Ciphertext,
	asImportedKeysDek,
	asMasterSecretBytes,
	computeWalletFingerprint,
	deriveDappSessionMacKey as deriveDappSessionMacKeyFromSecrets,
	deriveMasterFromMnemonic,
	EncryptionKey,
	generateImportedKeysDek,
	IMPORTED_DEK_AAD,
	IMPORTED_KEYS_DEK_LEN,
	type EncryptedProfileSecret,
	type ImportedKeysDek,
	type MasterSecretBytes,
	openPasskeySlots,
	type Passhash,
	type PasskeyCredential,
	PasswordSecretBox,
	type RowKeys,
	type Sealed,
	sealDekUnderWrapKey,
	sealPasskeySlots,
	unsealDekUnderWrapKey,
	verifyEnvelopeMacV3,
	zeroize,
} from "@nulo/wallet-crypto"
import { PasskeyService } from "@/wallet/services/passkey/service"
import { newCreateInput } from "@/wallet/services/passkey/spec"
import { PasskeyRecoveryCoordinator, type PasskeyAnswer } from "./passkey-recovery-coordinator"
import type { PasskeyCredentialData } from "@nulo/wallet-crypto"
import { SessionManager } from "./session-manager"
import { RowKeyring } from "./row-keyring"
import { ExpiringStash } from "./expiring-stash"
import {
	classifyProfileRow,
	envelopeMacFor,
	macEnvelopeV3,
	newPasskeyRow,
	newPasswordRow,
	newRowFor,
	replacementRow,
	sameStoredRow,
} from "./profile-row"
import {
	PROFILE_SERVICE_NAME,
	type ProfileInfo,
	type Profile,
	type Events,
	type FinalizedRestore,
	type Methods,
	type PasskeyUnlockParams,
	type RestoreSecret,
	type RunFence,
	toProfileInfo,
	type UnlockCredential,
} from "./spec"
import { decodeRestoreMaterial, type RestoreMaterial } from "./restore-material"
import { RestorePendingRepository } from "./restore-pending-repository"
import { TombstoneRepository } from "./tombstone-repository"
import { ProfileDeletionState, type ExecutionFence } from "./profile-deletion-state"
import { WalletLockedError } from "./wallet-locked-error"
import type { ProfileDeletionDelegate } from "../profile-deletion/types"
import { AccountIntegrityBlockedRepository, AccountIntegrityVerifiedStampRepository } from "../account-integrity/blocked-repository"
import type { AccountIntegrityBlocked, AccountIntegrityDelegate } from "../account-integrity/types"
import { StaleNetworkRepository } from "../stale-network/repository"

export * from "./spec"

/** Out-params for `restore`'s locked commit body: allocations made under the lock are reported
 *  back so the single post-lock-release `finally` owns every buffer wipe. */
type RestoreScratch = { destinationDek?: ImportedKeysDek; storedContext: boolean }
/** Inputs of the locked commit body. The buffers travel by reference: a copy outside a stash
 *  would escape the caller's wipe. */
type RestoreCommit = Readonly<{
	profile: ProfileInfo
	name: string
	seal: RowSeal
	material: RestoreMaterial
	allowDuplicate: boolean
}>

/** What opens a row's slots: its password, or a passkey answer, which opens a passkey row only for
 *  the row's own credential and `prfSalt`. */
type SlotKey = { password: string } | { passkey: PasskeyCredential }

/** What a new or resealed row is sealed under: a password's hash, or a passkey answer, whose own
 *  `prfSalt` the row then stores. */
type RowSeal = { passhash: Passhash } | { credential: PasskeyCredential }

/** A row's slots and DEK slot sealed under a {@link RowSeal}, and the unlock fields the row takes. */
type SealedUnder = {
	slots: EncryptedProfileSecret
	dekSealed: string
	unlock: { type: "password" } | { type: "passkey"; credentialId: string; prfSalt: string }
}

/** A row's slots opened under its unlock, from {@link ProfileService.openSlots}. The caller owns the
 *  buffers and calls `wipe()` on every path. */
type OpenedSlots = {
	secret: MasterSecretBytes
	entropy: Uint8Array<ArrayBuffer>
	/** Opens a DEK slot under the same key; `null` when it does not open. */
	openDek(dekSealed: string): Promise<ImportedKeysDek | null>
	wipe(): void
}

/** Whether `key` is for the unlock `row` stores: the same kind and, for a passkey, the row's own
 *  credential at its own input. A key that is still has to open the slots. */
function unlocksWith(row: Profile, key: SlotKey): boolean {
	const classified = classifyProfileRow(row)
	if (classified.kind === "password") return "password" in key
	if (classified.kind !== "passkey" || !("passkey" in key)) return false
	return key.passkey.id === classified.credentialId && key.passkey.unlockKeyFor(classified.prfSalt) !== null
}

/** The refusal at password change once the DEK slot no longer unseals: the DEK keys the PXE store
 *  and every dApp-session tag, so the only non-destructive repair is export + restore. */
const DEK_UNRECOVERABLE_MESSAGE =
	"Imported-keys key unrecoverable. Imported keys and local chain state are lost. Export a full backup (or the recovery phrase) and restore it to repair."

/** The unlock-type gate of `snapshotForUnlock`: a retired row first, then the other stored type by
 *  name; only the passkey arm requires the row to classify as passkey. */
function assertUnlockKind(row: Profile, expect: "password" | "passkey"): void {
	const kind = classifyProfileRow(row).kind
	if (kind === "retired") throw new RetiredProfileError()
	if (expect === "password") {
		if (row.type === "passkey") throw new Error("Profile requires passkey")
		return
	}
	if (row.type === "password") throw new Error("Profile requires password")
	if (kind !== "passkey") throw new Error("Profile storage corrupted")
}

export class ProfileService extends Service<Methods, Events> implements ServiceSpec<Methods, Events> {
	protected readonly rpcMethods = defineRpcMethods<Methods>()(
		"getActiveProfile",
		"getProfiles",
		"createProfile",
		"createPasskeyProfile",
		"unlockProfile",
		"unlockPasskeyProfile",
		"getPasskeyUnlockParams",
		"getSessionHandle",
		"captureRunFence",
		"assertRunFence",
		"lockActiveProfile",
		"refreshSession",
		"changeProfileName",
		"changeProfilePassword",
		"verifyUnlockCredential",
		"verifyExportCredential",
		"changeUnlockMethod",
		"deleteProfile",
		"importMnemonic",
		"exportPlain",
		"exportMnemonic",
		"restore",
		"finalizeRestore",
	)
	public static name = PROFILE_SERVICE_NAME

	public readonly onProfileAdded = new EventHandler<ProfileInfo>()
	public readonly onProfileUpdated = new EventHandler<ProfileInfo>()
	public readonly onProfileDeleted = new EventHandler<ProfileInfo>()
	public readonly onActiveProfileChanged = new EventHandler<ProfileInfo | undefined>()
	public readonly onImportedKeysDegraded = new EventHandler<ProfileInfo>()

	private readonly lock = new Lock()
	private readonly repo: ProfileRepository
	private readonly secretBox: PasswordSecretBox
	private readonly sessionManager: SessionManager
	private passkeys: PasskeyService = null!
	private passkeyCoordinator: PasskeyRecoveryCoordinator = null!

	/** An abandoned restore's rewrap context would otherwise hold two DEKs for the SW lifetime.
	 *  Entries older than this are swept, zeroized, at the entry of every op that touches the map
	 *  (restore/finalizeRestore/deleteProfile). The window comfortably exceeds a slow multi-service
	 *  backup import; a legitimate import that runs longer can be expired by a later trigger —
	 *  accepted. NEVER the id currently being finalized. */
	private static readonly PENDING_RESTORE_TTL_MS = 30 * 60 * 1000

	/**
	 * TTL-bound, memory-only source→destination DEK rewrap context.
	 * `restore()` runs BEFORE the imported-keys slice arrives, so the SOURCE DEK cannot be
	 * consumed inside restore itself: it is stashed here and
	 * `AccountService.restoreImportedKeys` consumes it atomically (rewraps every backup key row
	 * source→destination, zeroizes the source immediately). `finalizeRestore` zeroizes any
	 * LEFTOVER context for its id (the empty-slice case); the shared TTL sweep covers abandoned
	 * restores + SW death. An expired/missing context with rows present fails those rows into
	 * the existing orphan taxonomy — never silently-kept undecryptable rows.
	 */
	private readonly pendingDekRewraps = new ExpiringStash<{
		sourceDek: ImportedKeysDek
		destinationDek: ImportedKeysDek
		capturedAt: number
	}>(ProfileService.PENDING_RESTORE_TTL_MS, (entry) => {
		zeroize(entry.sourceDek)
		zeroize(entry.destinationDek)
	})

	/** Durable delete-in-progress markers (finding D). NOT an EntityStorage — see
	 *  TombstoneRepository: a corrupt tombstone must still reserve its id. */
	private readonly tombstones: TombstoneRepository

	/** A restore-pending marker must be at least this old before the boot
	 *  sweep may treat the import as ABANDONED and reap it. A marker only proves
	 *  incompleteness — a password import whose SW died can still finalize via
	 *  the popup's auto-reconnect — so abandonment is proven by age. Seven days
	 *  is a generous multiple of any plausible import (slice RPCs are seconds; a
	 *  passkey ceremony is minutes; PENDING_RESTORE_TTL is 30 min) and outlasts
	 *  even a suspended-laptop onboarding tab; the wall-clock residual that
	 *  remains is documented at the reap site. */
	public static readonly TORN_IMPORT_MIN_AGE_MS = 7 * 24 * 60 * 60 * 1000

	/** Zeroize + drop stale rewrap contexts. MUST be called under the facade lock (`runExclusive`)
	 *  so it can't zeroize an entry another op holds a live reference to. Optionally skips
	 *  `exceptId` (the id being finalized). */
	private sweepStalePendingRestore(now: number, exceptId?: string): void {
		this.pendingDekRewraps.sweep(now, exceptId)
	}

	/**
	 * Pop the restore rewrap context for `profileId` (see `pendingDekRewraps`). The caller
	 * (AccountService.restoreImportedKeys) takes ownership of BOTH buffers and zeroizes them.
	 * `undefined` = expired / already consumed / never created — the caller fails its rows into
	 * the orphan taxonomy.
	 */
	public async consumeDekRewrapContext(
		profileId: string,
	): Promise<{ sourceDek: ImportedKeysDek; destinationDek: ImportedKeysDek } | undefined> {
		await this.ensureInitialized()
		return this.runExclusive(async () => {
			const now = Date.now()
			this.sweepStalePendingRestore(now, profileId)
			const entry = this.pendingDekRewraps.take(profileId, now)
			if (!entry) return undefined
			return { sourceDek: entry.sourceDek, destinationDek: entry.destinationDek }
		})
	}
	/** In-memory reserved-id set + per-profile deletion epoch (fencing). Seeded
	 *  from the tombstone raw keys in `init()` BEFORE the session is restored.
	 *  Shared (via {@link getDeletionState}) with Execution + Transaction so a
	 *  worker that captured an epoch before a purge is fenced when it persists. */
	private readonly deletionState = new ProfileDeletionState()
	/** Row-seal keys of every profile opened in this worker; see {@link rowKeys}. */
	private readonly rowKeyring = new RowKeyring()
	/** Profiles whose keys were derived under the facade lock and not yet announced. */
	private readonly unannouncedRowKeys = new Set<string>()
	/**
	 * A profile's row keys became available in this worker: fired once per profile per worker,
	 * after the facade lock is released, so a handler may call this service. In-process only.
	 * Handlers must be idempotent: {@link replayRowKeysReady} fires again for every held profile.
	 */
	public readonly onRowKeysReady = new EventHandler<string>()
	/** Session serials restart with the worker; this keeps a handle from naming a later worker's session. */
	private readonly workerId = crypto.randomUUID()
	/** Lazily injected by the last-started ProfileDeletionCoordinator — the purge
	 *  executor. Never a topological dependency (would be a cycle). */
	private deletionDelegate: ProfileDeletionDelegate | null = null
	/** Settles on the first injection; this service answers RPCs from start phases before the
	 *  coordinator's. */
	private readonly deletionDelegateInjected = deferred()
	/** Lazily injected by the last-started AccountIntegrityCoordinator — the pre-open address
	 *  verifier. Never a topological dependency (would be a cycle, same as the deletion delegate). */
	private integrityDelegate: AccountIntegrityDelegate | null = null
	/** Read-only view of the coordinator's durable blocking records, consulted at init so a
	 *  blocked profile's session is never silently rehydrated after a SW restart (the coordinator
	 *  itself starts later, in the last topological phase). */
	private readonly integrityBlocked: AccountIntegrityBlockedRepository
	/** Deletion-time cleanup of the coordinator's per-profile verified stamps. */
	private readonly integrityStamps: AccountIntegrityVerifiedStampRepository
	/** Deletion-time cleanup of the stale-network record, reset journal and reset notice. */
	private readonly staleNetworks: StaleNetworkRepository
	/** Restore-in-progress markers (torn-import detection at the unlock gate). */
	private readonly restorePending: RestorePendingRepository
	private readonly local: StorageArea
	private readonly runtime: RuntimePort
	private restartPreparation: (() => void) | undefined

	public constructor(config: IConfig, logger: ILogger, browserApi: BrowserApi) {
		super(PROFILE_SERVICE_NAME, logger)
		this.repo = new ProfileRepository(browserApi)
		this.local = browserApi.storage.local
		this.runtime = browserApi.runtime
		this.tombstones = new TombstoneRepository(this.local)
		this.integrityBlocked = new AccountIntegrityBlockedRepository(this.local)
		this.integrityStamps = new AccountIntegrityVerifiedStampRepository(this.local)
		this.staleNetworks = new StaleNetworkRepository(this.local)
		this.restorePending = new RestorePendingRepository(this.local)
		this.secretBox = new PasswordSecretBox()
		this.sessionManager = new SessionManager(
			config,
			logger,
			(p) => this.emit("onActiveProfileChanged", p),
			browserApi,
			(fn) => this.runExclusive(fn),
		)
	}

	/** Run `fn` under the facade lock. Injected into `SessionManager` so its
	 *  out-of-band session closes — the alarm-driven TTL close AND the
	 *  config-driven `applyTtlChange` close — serialize against the lock-holding
	 *  session writers (`refresh`/`open`/`unlock`). Without it, a racing
	 *  `refresh()` storage write can land after a `close()` delete and resurrect
	 *  an expired session on the next SW restore (a TTL bypass). Callers MUST NOT
	 *  already hold the facade lock — `Lock` is non-reentrant, so re-entering it
	 *  self-deadlocks; this is safe ONLY because both wired paths are reached from
	 *  the alarm dispatch / the config-update listener, never from inside a locked
	 *  op. A future facade-locked write of `sessionTtl` would re-enter via
	 *  `applyTtlChange` and deadlock — keep `sessionTtl` writes off the locked
	 *  paths. */
	private async runExclusive<T>(fn: (isCurrent: () => boolean) => Promise<T>): Promise<T> {
		try {
			return await this.lock.withLock(fn)
		} finally {
			this.announceRowKeys()
		}
	}

	private announceRowKeys(): void {
		for (const id of [...this.unannouncedRowKeys]) {
			this.unannouncedRowKeys.delete(id)
			if (this.rowKeyring.has(id)) this.onRowKeysReady.invoke(id)
		}
	}

	/**
	 * The row-seal keys of `profileId` when it was opened in this worker's lifetime. Synchronous and
	 * lock-free, so a store reads it inside its own locked section. Kept across lock and switch:
	 * which RPC may read what is still each service's session check, not this.
	 */
	public rowKeys(profileId: string): RowKeys | undefined {
		return this.rowKeyring.get(profileId)
	}

	/** Fires {@link onRowKeysReady} for every profile whose keys are held, whenever they arrived:
	 *  an unlock can complete before a later-starting subscriber attaches. */
	public replayRowKeysReady(): void {
		for (const id of this.rowKeyring.profileIds()) this.onRowKeysReady.invoke(id)
	}

	/** Drops a deleted profile's row keys, after its typed purges ran with them: from here every
	 *  sealed write for it refuses. */
	public dropRowKeys(profileId: string): void {
		this.unannouncedRowKeys.delete(profileId)
		this.rowKeyring.drop(profileId)
	}

	/** Derives `profile`'s row keys unless its id is reserved by a deletion; throws when a deletion
	 *  of it ran during the derivation. Caller MUST hold the facade lock; the master stays
	 *  caller-owned. */
	private async fillRowKeysHoldingLock(profile: Profile, master: MasterSecretBytes): Promise<void> {
		if (classifyProfileRow(profile).kind === "retired") throw new RetiredProfileError()
		const epoch = this.deletionState.capture(profile.id)
		if (this.deletionState.isReserved(profile.id)) return
		const filled = await this.rowKeyring.fill(profile.id, profile.pxeGeneration, master)
		// A deletion that ran during the derivation (a force-released lock) dropped this id's keys
		// before these landed: none may outlive it, and the open or commit that asked must stop, as
		// it does for a deletion it sees itself.
		if (!this.deletionState.isCurrent(profile.id, epoch)) {
			this.dropRowKeys(profile.id)
			throw new Error("Invalid profile id")
		}
		if (filled) this.unannouncedRowKeys.add(profile.id)
	}

	/** The silently restored session's row keys, after its integrity gate kept it open. */
	private async fillRestoredSessionRowKeys(): Promise<void> {
		const session = await this.sessionManager.getActive()
		if (!session || this.deletionState.isReserved(session.profile.id)) return
		const master = asMasterSecretBytes((await this.sessionManager.getSecret(session.profile.id)).toBuffer() as Uint8Array<ArrayBuffer>)
		try {
			await this.fillRowKeysHoldingLock(session.profile, master)
		} finally {
			zeroize(master)
		}
	}

	/** The only reader of a row's sealed slots: the master and entropy `key` opens, or `null` when
	 *  the row does not classify as the unlock `key` is for, or `key` does not open its slots (wrong,
	 *  or a slot corrupted), which each caller maps to its own refusal. A passkey row opens only
	 *  under its own credential and its own `prfSalt`. Refuses a retired row before anything else.
	 *  The DEK opens through the result, so it opens only after the guard. */
	private async openSlots(row: Profile, key: SlotKey): Promise<OpenedSlots | null> {
		const classified = classifyProfileRow(row)
		if (classified.kind === "retired") throw new RetiredProfileError()
		if (classified.kind === "password" && "password" in key) return this.openPasswordSlots(classified.slots, key.password)
		if (classified.kind === "passkey" && "passkey" in key) return this.openPasskeyRowSlots(classified, key.passkey)
		return null
	}

	private async openPasswordSlots(
		slots: { guard: string; secret: string; entropy: string },
		password: string,
	): Promise<OpenedSlots | null> {
		const passhash = await EncryptionKey.getPasshash(password)
		let opened: OpenedSlots | null = null
		try {
			opened = await this.openUnderPasshash(slots, passhash)
		} finally {
			if (!opened) zeroize(passhash)
		}
		if (!opened) return null
		const { wipe } = opened
		return {
			...opened,
			wipe: () => {
				wipe()
				zeroize(passhash)
			},
		}
	}

	/** {@link openPasswordSlots} under a hash the caller owns, and wipes. */
	private async openUnderPasshash(
		slots: { guard: string; secret: string; entropy: string },
		passhash: Passhash,
	): Promise<OpenedSlots | null> {
		const opened = await this.secretBox.unsealWithPasshash(passhash, {
			guard: asBase64Ciphertext(slots.guard),
			secret: asBase64Ciphertext(slots.secret),
			entropy: asBase64Ciphertext(slots.entropy),
		})
		if (!opened) return null
		const { secret, entropy } = opened
		return {
			secret,
			entropy,
			openDek: (dekSealed) => this.unsealDekWithPasshash(passhash, dekSealed),
			wipe: () => {
				zeroize(secret)
				zeroize(entropy)
			},
		}
	}

	private async openPasskeyRowSlots(
		row: Extract<ReturnType<typeof classifyProfileRow>, { kind: "passkey" }>,
		credential: PasskeyCredential,
	): Promise<OpenedSlots | null> {
		const unlockKey = credential.id === row.credentialId ? credential.unlockKeyFor(row.prfSalt) : null
		if (!unlockKey) return null
		const opened = await openPasskeySlots(unlockKey, {
			guard: asBase64Ciphertext(row.slots.guard),
			secret: asBase64Ciphertext(row.slots.secret),
			entropy: asBase64Ciphertext(row.slots.entropy),
		})
		if (!opened) return null
		const { secret, entropy } = opened
		return {
			secret,
			entropy,
			openDek: (dekSealed) => unsealDekUnderWrapKey(unlockKey, dekSealed).catch(() => null),
			wipe: () => {
				zeroize(secret)
				zeroize(entropy)
			},
		}
	}

	/** The key a caller's credential gives: its passkey answer, or else its password. An empty
	 *  password is a password: it gets each path's own wrong-password refusal. */
	private async slotKey(password: string | undefined, credentialData: PasskeyCredentialData | undefined): Promise<SlotKey> {
		if (credentialData) return { passkey: (await this.passkeyCoordinator.fromCredentialData(credentialData)).credential }
		if (password === undefined) throw new Error("Password is required")
		return { password }
	}

	/** What a path throws when `key` did not open the row: its own wrong-password refusal, or the
	 *  passkey's, which no screen may read as a wrong password. */
	private notOpened(key: SlotKey, passwordRefusal: () => Error): Error {
		return "passkey" in key ? new PasskeyNotOpenedError() : passwordRefusal()
	}

	/** Caller MUST already hold the facade lock (`Lock` is non-reentrant). Checks row
	 *  PRESENCE only — deliberately blind to a deletion reservation; the mutation
	 *  paths built on it accept a tombstoned-but-present row (pinned bug, see the
	 *  integration suite's tombstoned-row pin). */
	private async getProfileOrThrowHoldingLock(id: string): Promise<Profile> {
		const profile = await this.repo.get(id)
		if (!profile) {
			throw new Error("Invalid profile id")
		}
		return profile
	}

	/** Capture the row + its deletion epoch in ONE critical section. A tombstoned
	 *  profile (mid-delete: row present, id reserved) is invalid here — `repo.get`
	 *  alone is blind to the reservation. The epoch survives even a delete FOLLOWED
	 *  by a same-id restore (it bumps permanently), so a later `profileFenceBroken`
	 *  check rejects the stale generation. */
	private async captureRowFence(id: string): Promise<{ profile: Profile; capturedEpoch: number }> {
		return this.runExclusive(async () => {
			const profile = await this.getProfileOrThrowHoldingLock(id)
			if (this.deletionState.isReserved(id)) {
				throw new Error("Invalid profile id")
			}
			// Before any field is read: a retired row has nothing to export.
			if (classifyProfileRow(profile).kind === "retired") throw new RetiredProfileError()
			return { profile, capturedEpoch: this.deletionState.capture(id) }
		})
	}

	/** The post-derivation staleness re-check paired with `captureRowFence`: the row is
	 *  gone, reserved, or its deletion epoch advanced during the (slow, unlocked)
	 *  crypto/prompt in between. Lock wrapping is the CALLER's: the confirm/mnemonic
	 *  sites re-check under the facade lock, the export sites run it lock-free. */
	private async profileFenceBroken(id: string, capturedEpoch: number): Promise<boolean> {
		return !(await this.repo.get(id)) || this.deletionState.isReserved(id) || !this.deletionState.isCurrent(id, capturedEpoch)
	}

	/** The row still holds the snapshot's bytes, and no delete or same-id restore ran since its capture. */
	private async rowUnchangedHoldingLock(snapshot: Profile, capturedEpoch: number): Promise<boolean> {
		const live = await this.repo.get(snapshot.id)
		return !!live && sameStoredRow(live, snapshot) && !(await this.profileFenceBroken(snapshot.id, capturedEpoch))
	}

	private async snapshotForUnlock(id: string, expect: "password"): Promise<Extract<Profile, { type: "password" }>>
	private async snapshotForUnlock(id: string, expect: "passkey"): Promise<Extract<Profile, { type: "passkey" }>>
	/** Phase-1 snapshot for the two unlock flows: fetch + tombstone gate + retired gate + type gate
	 *  in ONE critical section. The type arms are asymmetric on purpose — each rejects the OTHER
	 *  stored type by name (a hypothetical third type passes the password arm and is refused by its
	 *  opener), and only the passkey arm requires the row to classify as passkey. */
	private async snapshotForUnlock(id: string, expect: "password" | "passkey"): Promise<Profile> {
		return this.runExclusive(async () => {
			const fetched = await this.getProfileOrThrowHoldingLock(id)
			// A tombstoned profile (mid-delete: row present, id reserved) must not be
			// unlocked — its data is being purged; `repo.get` alone is blind to the
			// reservation.
			if (this.deletionState.isReserved(id)) {
				throw new Error("Invalid profile id")
			}
			assertUnlockKind(fetched, expect)
			return fetched
		})
	}

	/** The DEK trust gate at session open: unseal the slot, then prove the envelope MAC still covers
	 *  this exact record — verified against the REQUESTED id, never the row's self-claimed one
	 *  (belt-and-suspenders on EntityStorage's id/key guard). `null`, never a throw, on unseal/MAC
	 *  failure: the caller opens derived-only (degradation state machine, rule 2) and emits the
	 *  visible warning. Caller MUST hold the facade lock and OWNS the returned dek; on an internal
	 *  throw after the unseal, the local dek is zeroized here before the rethrow. */
	private async unsealTrustedDekHoldingLock(
		id: string,
		row: Profile,
		opened: OpenedSlots,
		logContext: string,
	): Promise<ImportedKeysDek | null> {
		let dek: ImportedKeysDek | null = null
		try {
			dek = await opened.openDek(row.dekSealed)
			if (dek) {
				const macOk = await this.envelopeMacValid(id, row, opened.secret, dek)
				if (!macOk) {
					zeroize(dek)
					dek = null
				}
			}
		} catch (err) {
			zeroize(dek)
			throw err
		}
		if (!dek) {
			this.logger.log(this.name, LogLevel.Error, `imported-keys DEK/MAC failed at ${logContext} — opening derived-only`, id)
		}
		return dek
	}

	/** Open the session, then raise the visible warning when it opened derived-only. `dek` must
	 *  come from the trust gate (`unsealTrustedDekHoldingLock`); `null` opens without it. Allocates and wipes nothing, so
	 *  callers must `return await` it inside their `try`: a bare return lets their `finally`
	 *  zeroize the buffers before the open copies them. Caller MUST hold the facade lock. */
	private async openAndWarnIfDegradedHoldingLock(
		row: Profile,
		master: MasterSecretBytes,
		dek: ImportedKeysDek | null,
	): Promise<ProfileInfo> {
		await this.openSessionVerified(row, master, dek ?? undefined)
		if (!dek) {
			this.emit("onImportedKeysDegraded", this.getProfileInfo(row))
		}
		return this.getProfileInfo(row)
	}

	protected async init(services: ServiceCollection) {
		this.passkeys = services.get(PasskeyService.name)
		this.passkeyCoordinator = new PasskeyRecoveryCoordinator(this.passkeys)

		// Seed the reserved-id set from the durable tombstone RAW keys BEFORE the
		// session is restored / any profile becomes visible — a tombstoned id must
		// never be reused or unlocked while its deletion is still pending (finding D).
		this.deletionState.initReserved(await this.tombstones.reservedIds())
		// Hydrate the deletion EPOCH for each VALID tombstone (raw-key reserve above
		// is fail-closed for corrupt ones; the epoch fence needs the payload). This
		// arms assertCurrent BEFORE any execution can run (D13). Corrupt tombstones
		// stay reserved with epoch 0 — still unreusable, just not epoch-fenced.
		for (const t of await this.tombstones.validPayloads()) {
			this.deletionState.hydrateDeletion(t.profileId, t.epoch)
		}

		// Silent restore: SessionManager handles TTL expiry, missing
		// profile and wrong creds internally. No emit on restore — subscribers pull via
		// getActiveProfile() when they mount.
		// The silent-restore bearer is a random-token wrapped secret
		// (SessionSecretBox), so `restore()` needs no passhash unsealer. dev's
		// tombstone gate is preserved: a tombstoned profile (SW died mid-delete:
		// row present, id reserved) must NOT have its session restored — it's being
		// erased, so no downstream unlock/export/secret path can observe it.
		await this.sessionManager.restore(async (id) => {
			if (this.deletionState.isReserved(id)) return undefined
			const profile = await this.repo.get(id)
			// Only a row an unlock opens restores; a retired or unreadable one is skipped, never thrown
			// on: start-up must not depend on it.
			const kind = profile ? classifyProfileRow(profile).kind : undefined
			if (!profile || (kind !== "password" && kind !== "passkey")) return undefined
			// Torn-restore gate on the SILENT path too: rehydrating a marked
			// profile would bypass the unlock chokepoint. Return undefined (silent
			// close) — throwing here would abort service init.
			const restore = await this.restoreState(profile)
			if (restore === "torn") return undefined
			// Stale leftover from a prior incarnation: purge here too (the
			// interactive path already does) — best-effort, never blocking.
			if (restore === "stale") await this.restorePending.delete(id).catch(() => {})
			return profile
		})

		// Integrity gate on the silent restore: a profile the integrity coordinator flagged must
		// not rehydrate its session after a SW restart. The durable blocking record is the signal
		// (fail-closed on corrupt records); the coordinator itself starts in the LAST topological
		// phase, so this early gate reads the repository directly.
		const restored = await this.sessionManager.getActive()
		if (restored && (await this.integrityBlocked.isBlocked(restored.session.profile))) {
			this.logger.log(this.name, LogLevel.Error, "restored session belongs to an integrity-blocked profile — closing")
			await this.sessionManager.close()
		}
		await this.fillRestoredSessionRowKeys()
	}

	public async getActiveProfile(): Promise<ProfileInfo | undefined> {
		await this.ensureInitialized()
		return this.runExclusive(async () => {
			const session = await this.sessionManager.getActive()
			if (!session || this.deletionState.isReserved(session.profile.id)) return undefined
			return this.getProfileInfo(session.profile)
		})
	}

	/** Capture the {profileId, epoch, session} execution fence ATOMICALLY under the
	 *  facade lock. The active-session read, the reserved-id check, and the epoch
	 *  read MUST be one critical section — `deleteProfile`'s phase 1 (beginDeletion
	 *  + reserve) runs under the SAME lock, so this either captures the pre-delete
	 *  epoch (then the later addTransaction assert fails) or sees the id already
	 *  reserved and rejects. Composing getActiveProfile + capture across separate
	 *  lock acquisitions would let a delete slip between them. */
	public async captureExecutionFence(): Promise<ExecutionFence> {
		await this.ensureInitialized()
		return this.runExclusive(() => this.captureExecutionFenceHoldingLock())
	}

	private async captureExecutionFenceHoldingLock(): Promise<ExecutionFence> {
		const session = await this.sessionManager.getActive()
		if (!session) throw new WalletLockedError()
		// A profile whose deletion has begun answers as locked to every caller, but it is not a lock.
		if (this.deletionState.isReserved(session.profile.id)) throw new Error("Wallet locked")
		return { profileId: session.profile.id, epoch: this.deletionState.capture(session.profile.id), session: session.serial }
	}

	/** Throws {@link SessionEndedError} unless the session `fence` was captured under is still the
	 *  live one, then the deletion-epoch error if a delete of its profile has begun. Reads the session
	 *  manager under the facade lock — never through `getActiveProfile`, which takes the same lock. */
	public async assertFence(fence: ExecutionFence): Promise<void> {
		await this.ensureInitialized()
		return this.runExclusive(async () => {
			const session = await this.sessionManager.getActive()
			if (session?.serial !== fence.session || session.profile.id !== fence.profileId) {
				throw new SessionEndedError()
			}
			this.deletionState.assertCurrent(fence.profileId, fence.epoch)
		})
	}

	/** {@link captureExecutionFence} for a popup run that spans several RPCs, stamped with this
	 *  worker's id: a restarted worker can re-issue the same serial and epoch to the same profile. */
	public async captureRunFence(): Promise<RunFence> {
		return { ...(await this.captureExecutionFence()), incarnation: this.workerId }
	}

	/** {@link assertFence} for a {@link RunFence}; a fence another worker issued is refused first. */
	public async assertRunFence(fence: RunFence): Promise<void> {
		if (fence?.incarnation !== this.workerId) {
			throw new SessionEndedError()
		}
		await this.assertFence(fence)
	}

	/** {@link assertFence}'s question answered synchronously from memory — no lock, no lazy expiry
	 *  close, no await — so a caller can act on the answer in the same tick. A begun deletion also
	 *  answers `false`: its session stays open until the tombstone is written. */
	public isFenceLive(fence: ExecutionFence): boolean {
		return (
			this.sessionManager.peekLiveSerial() === fence.session &&
			this.sessionManager.isActive(fence.profileId) &&
			this.deletionState.isCurrent(fence.profileId, fence.epoch)
		)
	}

	/** The live session's serial, synchronously; `undefined` when locked. */
	public peekLiveSerial(): number | undefined {
		return this.sessionManager.peekLiveSerial()
	}

	public async getSessionHandle(): Promise<string | undefined> {
		await this.ensureInitialized()
		return this.sessionHandle()
	}

	private sessionHandle(): string | undefined {
		const serial = this.sessionManager.peekLiveSerial()
		return serial === undefined ? undefined : `${this.workerId}:${serial}`
	}

	/** Registers the check an expired session consults before it auto-locks; in-process only. */
	public setExpiryDeferral(predicate: (profileId: string) => Promise<boolean>): void {
		this.sessionManager.setExpiryDeferral(predicate)
	}

	/** Registers what runs in the turn the wallet restarts itself after a lock it could not save;
	 *  in-process only. The restart follows in that same turn, so `prepare` must not wait on anything. */
	public setRestartPreparation(prepare: () => void): void {
		this.restartPreparation = prepare
	}

	public async getProfiles(): Promise<ProfileInfo[]> {
		await this.ensureInitialized()
		// A tombstoned (deletion-pending) profile is ABSENT to every read (finding D).
		return (await this.repo.getAll()).filter((p) => !this.deletionState.isReserved(p.id)).map((p) => this.getProfileInfo(p))
	}

	public async createProfile(name: string, password: string): Promise<ProfileInfo> {
		await this.ensureInitialized()
		// Entropy-originated (NULO-ACCOUNT-KDF v2): 32 CSPRNG bytes — plain random, NOT
		// Fr.random(); entropy is pre-PBKDF2 and needs no field bound — encode to the recovery
		// words, then derive the master one-way through the standard BIP-39 step. The row stores
		// BOTH sealed (store-both): the bearer path can't re-run a mnemonic KDF, and unlock
		// already pays one PBKDF2.
		const entropy = crypto.getRandomValues(new Uint8Array(32)) as Uint8Array<ArrayBuffer>
		const words = await getMnemonic(entropy)
		const secret = await deriveMasterFromMnemonic(words)
		// Fresh imported-keys DEK, minted per profile (credential-sealed below — never
		// master-derived; see the Profile.dekSealed doc).
		const dek = generateImportedKeysDek()
		let passhash: Passhash | undefined
		try {
			const sealed = await this.secretBox.seal(password, secret, entropy)
			passhash = sealed.passhash
			const encrypted = sealed.encrypted
			const dekSealed = await this.sealDekWithPasshash(passhash, dek)
			return await this.runExclusive(async () => {
				// Invariant assertion on fresh CSPRNG entropy (a collision is cryptographically
				// impossible) — kept uniform with the import/restore paths.
				const walletFingerprint = await this.assertNotDuplicateWallet(secret, false)
				const id = await this.nextUnreservedId()
				// Inside the lock, after allocation: the MAC binds the final id. PBKDF2 stays outside.
				const profile = await newPasswordRow({ id, name, slots: encrypted, dekSealed, walletFingerprint }, secret, dek)
				await this.persistCreatedProfileHoldingLock(profile)

				await this.openSessionVerified(profile, secret, dek)

				return this.getProfileInfo(profile)
			})
		} finally {
			// zero secret + entropy + dek + passhash after sessionManager has copied
			// what it needs (Fr.fromBuffer copies; the session stores a dek COPY).
			// Done after lock release so a thrown open()/repo.set() also gets the zeroize.
			zeroize(secret)
			zeroize(entropy)
			zeroize(dek)
			zeroize(passhash)
		}
	}

	/** Unlock a password profile. Three phases so the ~1s PBKDF2+AES-GCM
	 *  never holds the facade-wide lock:
	 *   1. Locked read + guard checks — snapshot encrypted bytes.
	 *   2. Unlocked unseal + passhash derive — other profile ops proceed.
	 *   3. Locked revalidate + open session — rejects the stale case where
	 *      changeProfilePassword / deleteProfile landed during phase 2. */
	public async unlockProfile(id: string, password: string): Promise<ProfileInfo> {
		await this.ensureInitialized()

		// Phase 1 — snapshot profile under lock.
		const snapshot = await this.snapshotForUnlock(id, "password")

		// Phase 2 — crypto UNLOCKED. Caller pays ~1s PBKDF2 but the rest of
		// the RPC surface stays responsive.
		const opened = await this.openSlots(snapshot, { password })
		if (!opened) {
			// Can't tell wrong-password from storage corruption from this single
			// null, but GUARD catches wrong-password first in practice. Auth UI
			// matches on InvalidPasswordError (popup/pages/auth.vue:65-74).
			throw new InvalidPasswordError()
		}
		let dek: ImportedKeysDek | null = null
		try {
			// Pairing check at the entropy-decryption site: the stored words must still derive
			// the stored master. A mismatch means a tampered/corrupted/transplanted row whose
			// exported recovery phrase would point at a DIFFERENT wallet — fail closed before any
			// session opens. (CORE material — this failure BLOCKS, per the degradation state
			// machine rule 1; the DEK/MAC checks below degrade instead.)
			await this.assertEntropyMasterPair(opened.secret, opened.entropy)

			// Phase 3 — re-enter lock, revalidate, open session.
			return await this.runExclusive(async () => {
				const current = await this.repo.get(id)
				if (!current) {
					throw new Error("Invalid profile id")
				}
				// A deletion that began during the (lock-free) phase-2 unseal must
				// abort the unlock — the id is now reserved even if the row lingers.
				if (this.deletionState.isReserved(id)) {
					throw new Error("Invalid profile id")
				}
				if (current.type !== "password") {
					throw new Error("Profile requires passkey")
				}
				if (current.guard !== snapshot.guard || current.secret !== snapshot.secret || current.entropy !== snapshot.entropy) {
					// Password changed under us. `secret` is for the OLD ciphertext;
					// the passhash wouldn't unseal the current encrypted blob, so
					// SessionManager.restore would silently close on the next SW
					// suspension. Refuse and let the user retry with the new password.
					throw new InvalidPasswordError()
				}
				// Degradation state machine, rule 2: a DEK-unseal failure OR an envelope-MAC
				// v3 failure opens DERIVED-ONLY — imported accounts quarantine per-account
				// (imported material must never profile-block derived funds; blocking
				// here would hand a storage-writer a one-field DoS lever), a user-visible
				// warning fires (the popup listens on onImportedKeysDegraded — never just a
				// log), and NO bearer is persisted (open() enforces that from the absent dek).
				dek = await this.unsealTrustedDekHoldingLock(id, current, opened, "unlock")
				return await this.openAndWarnIfDegradedHoldingLock(current, opened.secret, dek)
			})
		} finally {
			// zero buffers after sessionManager has copied. Runs on
			// success AND on the revalidate-failure throw path.
			opened.wipe()
			zeroize(dek)
		}
	}

	public async createPasskeyProfile(name: string, credentialData?: PasskeyCredentialData, existing = false): Promise<ProfileInfo> {
		await this.ensureInitialized()
		// PATH A: the page minted the new profile's PRF input and ran the create, or the discovery get
		// of a passkey the person already has; the answer reports it. PATH B (Firefox's toolbar
		// panel): it is minted here and the passkey window runs the step. No id is reserved across the
		// prompt: the id is allocated when the row is saved.
		const minted = credentialData ? undefined : newCreateInput()
		const display = { step: "create", profileName: name } as const
		const answer = !minted
			? await this.passkeyCoordinator.fromCredentialData(credentialData as PasskeyCredentialData)
			: existing
				? await this.passkeyCoordinator.discoverInWindow(minted.prfSalt, display)
				: await this.passkeyCoordinator.createInWindow(minted.userHandle, minted.prfSalt, display)
		return await this.reportToPasskeyWindow(answer, async () => {
			const prfSalt = minted?.prfSalt ?? answer.credential.prfSalt
			const unlockKey = answer.credential.unlockKeyFor(prfSalt)
			if (!unlockKey) throw new Error("Passkey answered for another request")
			return await this.runExclusive(() => this.createPasskeyRowHoldingLock(name, answer.credential, prfSalt, unlockKey))
		})
	}

	/** A passkey create's commit: a fresh recovery phrase, as `createProfile` mints one, sealed under
	 *  the unlock key the answer gave for `prfSalt`. Caller MUST hold the facade lock. */
	private async createPasskeyRowHoldingLock(
		name: string,
		credential: PasskeyCredential,
		prfSalt: string,
		unlockKey: CryptoKey,
	): Promise<ProfileInfo> {
		const entropy = crypto.getRandomValues(new Uint8Array(32)) as Uint8Array<ArrayBuffer>
		const secret = await deriveMasterFromMnemonic(await getMnemonic(entropy))
		const dek = generateImportedKeysDek()
		try {
			await this.assertPrfSaltUnusedHoldingLock(prfSalt)
			const slots = await sealPasskeySlots(unlockKey, secret, entropy)
			const dekSealed = await sealDekUnderWrapKey(unlockKey, dek)
			// Invariant assertion on fresh CSPRNG entropy, kept uniform with the password create.
			const walletFingerprint = await this.assertNotDuplicateWallet(secret, false)
			const id = await this.nextUnreservedId()
			const profile = await newPasskeyRow(
				{ id, name, slots, dekSealed, walletFingerprint, credentialId: credential.id, prfSalt },
				secret,
				dek,
			)
			await this.persistCreatedProfileHoldingLock(profile)
			await this.openSessionVerified(profile, secret, dek)
			return this.getProfileInfo(profile)
		} finally {
			// After sessionManager copied them; a thrown open or write is wiped too.
			zeroize(secret)
			zeroize(entropy)
			zeroize(dek)
		}
	}

	public async getPasskeyUnlockParams(id: string): Promise<PasskeyUnlockParams> {
		await this.ensureInitialized()
		const row = await this.snapshotForUnlock(id, "passkey")
		return { credentialId: row.credentialId, prfSalt: row.prfSalt }
	}

	/** Unlock a passkey profile. Three phases so the WebAuthn prompt (3 min max) never holds the
	 *  facade-wide lock:
	 *   1. Locked read + guard checks — snapshot the row.
	 *   2. Unlocked prompt, then the slots open under the answer's key for the row's own `prfSalt`.
	 *   3. Locked revalidate + open session — rejects the stale case where the profile was deleted,
	 *      or its credential, input or slots changed, under us. */
	public async unlockPasskeyProfile(id: string, credentialData?: PasskeyCredentialData): Promise<ProfileInfo> {
		await this.ensureInitialized()

		const snapshot = await this.snapshotForUnlock(id, "passkey")
		// PATH B refuses an unfinished restore before its window opens, while the page that asked can
		// still say why; `openSessionVerified` stays the authoritative check and owns the purge.
		if (!credentialData && (await this.restoreState(snapshot)) === "torn") {
			throw new RestoreTornError(undefined, { profileId: id })
		}
		// PATH B (Firefox's toolbar panel): the passkey window runs the prompt, bound to the snapshot's
		// credential and input. PATH A: the page did, from `getPasskeyUnlockParams`.
		const answer = credentialData
			? await this.passkeyCoordinator.fromCredentialData(credentialData)
			: await this.passkeyCoordinator.getInWindow(snapshot.credentialId, snapshot.prfSalt, {
					step: "unlock",
					profileName: snapshot.name,
				})
		return await this.reportToPasskeyWindow(answer, async () => {
			if (answer.credential.id !== snapshot.credentialId) {
				throw new Error("Invalid profile id")
			}
			const opened = await this.openSlots(snapshot, { passkey: answer.credential })
			if (!opened) throw new PasskeyNotOpenedError()
			let dek: ImportedKeysDek | null = null
			try {
				// The pairing check runs at every unlock: the stored words must still derive the stored
				// master (CORE material — this failure BLOCKS; the DEK/MAC checks below degrade instead).
				await this.assertEntropyMasterPair(opened.secret, opened.entropy)
				return await this.runExclusive(async () => {
					const current = await this.revalidatePasskeyRowHoldingLock(id, snapshot)
					dek = await this.unsealTrustedDekHoldingLock(id, current, opened, "passkey unlock")
					return await this.openAndWarnIfDegradedHoldingLock(current, opened.secret, dek)
				})
			} finally {
				opened.wipe()
				zeroize(dek)
			}
		})
	}

	/** Phase 3 of a passkey unlock: the live row, refused unless it is the row whose slots the prompt
	 *  opened. Caller MUST hold the facade lock. */
	private async revalidatePasskeyRowHoldingLock(
		id: string,
		snapshot: Extract<Profile, { type: "passkey" }>,
	): Promise<Extract<Profile, { type: "passkey" }>> {
		const current = await this.repo.get(id)
		// A deletion that began during the (lock-free) prompt aborts the unlock — the id is now
		// reserved even if the row lingers.
		if (!current || this.deletionState.isReserved(id)) {
			throw new Error("Invalid profile id")
		}
		if (current.type !== "passkey") {
			throw new Error("Profile requires password")
		}
		const unchanged =
			current.credentialId === snapshot.credentialId &&
			current.prfSalt === snapshot.prfSalt &&
			current.pxeGeneration === snapshot.pxeGeneration &&
			current.guard === snapshot.guard &&
			current.secret === snapshot.secret &&
			current.entropy === snapshot.entropy
		if (!unchanged) {
			throw new Error("Invalid profile id")
		}
		return current
	}

	/** Runs what follows a passkey step's prompt and reports how it ended on every path: a PATH B
	 *  window waits on that report, and PATH A has no window to tell. */
	private async reportToPasskeyWindow<T>(answer: Pick<PasskeyAnswer, "finish">, step: () => Promise<T>): Promise<T> {
		try {
			const result = await step()
			answer.finish?.("done")
			return result
		} catch (err) {
			answer.finish?.("failed")
			throw err
		}
	}

	public async lockActiveProfile(handle?: string): Promise<void> {
		await this.ensureInitialized()
		return this.runExclusive(async () => {
			// A caller that decided to lock one session must not close the session that replaced it.
			const live = this.sessionHandle()
			if (handle !== undefined && live !== undefined && live !== handle) return
			// An explicit lock also ends every pending restore, before the close can fail: a
			// stashed DEK rewrap context must not outlive the user's intent to lock.
			this.sweepStalePendingRestore(Number.POSITIVE_INFINITY)
			const { emitted, recordKept } = await this.sessionManager.close()
			// A restarted worker holds no in-memory session, so `close()` emits
			// nothing. Memory is locked either way, and the popups that route on this
			// event would stay rendered as authenticated, so it fires before the
			// read-back below can throw, unless a successor's session is published by now.
			if (!emitted && this.sessionHandle() === undefined) this.emit("onActiveProfileChanged", undefined)
			// A lock leaves no session record for the next worker to restore: when every delete
			// fails, a restart clears it, as both browsers start `storage.session` empty.
			if (recordKept && this.sessionHandle() === undefined) {
				this.logger.log(this.name, LogLevel.Error, "lock could not be saved; restarting the wallet")
				this.prepareRestart()
				this.runtime.reload()
			}
			// Post-close read-back: `close()` is memory-first and swallows a
			// storage-delete failure (so clearLockAlarm always runs), but an
			// explicit lock that leaves the persisted bearer alive would silently
			// re-unlock on the next SW start. Surface that here so the RPC reports a
			// real failure instead of a false "locked".
			if (await this.sessionManager.hasPersistedSession()) {
				throw new Error("Lock did not persist — the session record could not be cleared; retry")
			}
		})
	}

	/** Nothing is awaited between a lock's failed deletes and the restart: until the restart, the
	 *  record they left could restore the session in a successor worker. A failing preparation never
	 *  holds the restart back. */
	private prepareRestart(): void {
		try {
			this.restartPreparation?.()
		} catch {
			this.logger.log(this.name, LogLevel.Warn, "The restart's preparation failed; restarting anyway")
		}
	}

	/**
	 * Close the active session ONLY if it belongs to `profileId`. Used by the integrity
	 * coordinator so a mismatch detected for profile P can't close a DIFFERENT profile that became
	 * active during the (slow, unlocked) re-derivation. The `isActive` check + `close` run under
	 * the facade lock so no unlock can interleave between them.
	 */
	public async lockProfileIfActive(profileId: string): Promise<void> {
		await this.ensureInitialized()
		return this.runExclusive(async () => {
			if (this.sessionManager.isActive(profileId)) {
				await this.sessionManager.close()
			}
		})
	}

	/**
	 * Run an integrity verdict write — but ONLY if the profile still exists and isn't being
	 * deleted. The OFF-LOCK integrity writers (the coordinator's boot re-verify and its
	 * operation-time classification, AccountService's operation-time block) route through here so
	 * a `deleteProfile` racing them (whose own clears run under this same lock) can't be followed
	 * by an orphan write: the write either lands before the delete's clear (then the delete clears
	 * it) or is skipped here because the profile is gone/reserved. Prevents an unclearable block,
	 * stamp or stale-network record for a deleted profile.
	 * @returns `write`'s result, or undefined when it was skipped.
	 */
	public async persistIntegrityVerdictIfLive<T>(profileId: string, write: () => Promise<T>): Promise<T | undefined> {
		await this.ensureInitialized()
		return this.runExclusive(async () => {
			if (this.deletionState.isReserved(profileId) || !(await this.repo.get(profileId))) return undefined
			return write()
		})
	}

	/** {@link persistIntegrityVerdictIfLive} for the profile block. */
	public async persistIntegrityBlockIfLive(record: AccountIntegrityBlocked): Promise<void> {
		await this.persistIntegrityVerdictIfLive(record.profileId, () => this.integrityBlocked.set(record))
	}

	/**
	 * Derive the per-profile, NON-EXTRACTABLE HMAC key that signs
	 * DappSession rows: `HKDF(master ‖ dek)` (wallet-crypto `dapp-session-mac-key.ts`). Neither
	 * secret leaves this service — only the derived (non-exportable) key is handed out. Propagates
	 * the "Profile locked" throw from `getSecret`, which the DappSession read path treats as
	 * "hide rows until unlock"; an OPEN session without its DEK (recovery mode) throws
	 * `RecoveryModeError` — the same hide-not-delete branch, and the message is the surface for
	 * signing sites. Two same-phrase profiles share the master, so the DEK is what keeps a
	 * sibling from forging a row that verifies under the victim.
	 */
	public async deriveDappSessionMacKey(profileId: string): Promise<CryptoKey> {
		const secret = await this.sessionManager.getSecret(profileId)
		const dek = await this.sessionManager.getDek(profileId)
		if (!dek) throw new RecoveryModeError()
		// `toBuffer` is a fresh copy of the session's master; both copies are wiped after the HKDF.
		const master = asMasterSecretBytes(secret.toBuffer() as Uint8Array<ArrayBuffer>)
		try {
			return await deriveDappSessionMacKeyFromSecrets(master, dek)
		} finally {
			zeroize(master)
			zeroize(dek)
		}
	}

	/** Synchronous: `true` iff `id`'s session is open WITHOUT its DEK (recovery mode). The PXE
	 *  admission guard reads it before every profile-bound request — no lock, no await: the
	 *  session state is committed before the unlock resolves. */
	public isRecoveryMode(id: string): boolean {
		return this.sessionManager.isRecoveryMode(id)
	}

	public async refreshSession(): Promise<void> {
		await this.ensureInitialized()
		return this.runExclusive(async () => {
			await this.sessionManager.refresh()
		})
	}

	public async changeProfileName(id: string, newName: string): Promise<ProfileInfo> {
		await this.ensureInitialized()
		return this.runExclusive(async () => {
			const profile = await this.getProfileOrThrowHoldingLock(id)

			profile.name = newName
			await this.repo.set(id, profile)

			this.emit("onProfileUpdated", this.getProfileInfo(profile))

			this.sessionManager.patchActiveProfile(id, profile)

			return this.getProfileInfo(profile)
		})
	}

	/** Unseal the freshly-resealed pair and run the pre-commit integrity gates: fail
	 *  CLOSED on a null unseal (`resealed.encrypted` was just minted under
	 *  `resealed.passhash`, so null means the row is corrupt — continuing would persist
	 *  the new cipher while SKIPPING the pairing check, the integrity pre-check, and the
	 *  MAC re-key), then the pairing check BEFORE anything commits (a change-password on
	 *  a transplanted-entropy row must NOT launder the mismatch into a MAC-valid
	 *  profile), then the pre-persist drift verify — on drift nothing is committed AND
	 *  the current session closes (a rejected change must not leave the blocked profile
	 *  operating). Caller MUST hold the facade lock and OWNS the returned buffers; on a
	 *  throw after the unseal they are zeroized here before the rethrow. */
	private async unsealResealedVerifiedHoldingLock(
		profile: Profile,
		resealed: Sealed,
	): Promise<{ secret: MasterSecretBytes; entropy: Uint8Array<ArrayBuffer> }> {
		const unsealed = await this.secretBox.unsealWithPasshash(resealed.passhash, resealed.encrypted)
		const secret = unsealed?.secret ?? null
		const entropy = unsealed?.entropy ?? null
		if (!secret || !entropy) {
			zeroize(secret)
			zeroize(entropy)
			throw new Error("Profile storage corrupted")
		}
		try {
			await this.assertEntropyMasterPair(secret, entropy)
			await this.precheckBeforeRekeyHoldingLock(profile, secret)
		} catch (err) {
			zeroize(secret)
			zeroize(entropy)
			throw err
		}
		return { secret, entropy }
	}

	/** The pre-commit integrity gate of a re-key: the pre-open check reads sealed rows, and a re-key
	 *  keeps the master and the generation, so these are the keys the profile already had. On drift
	 *  nothing is committed AND the current session closes (a rejected change must not leave the
	 *  blocked profile operating). Caller MUST hold the facade lock. */
	private async precheckBeforeRekeyHoldingLock(profile: Profile, secret: MasterSecretBytes): Promise<void> {
		await this.fillRowKeysHoldingLock(profile, secret)
		try {
			await this.integrityDelegate?.verifyBeforeSessionOpen(profile.id, secret)
		} catch (precheckError) {
			if (precheckError instanceof AccountAddressInconsistencyError && this.sessionManager.isActive(profile.id)) {
				await this.sessionManager.close()
			}
			throw precheckError
		}
	}

	/** The DEK a re-key carries over, opened under the RETIRED unlock. A slot that does not unseal,
	 *  or one whose envelope MAC does not cover the row, is REFUSED — never healed by minting: the
	 *  DEK keys the PXE store and every dApp-session tag, so a fresh mint would silently orphan them
	 *  all; and a MAC failure cannot distinguish a transplanted `dekSealed` (re-MACing would launder
	 *  it into a freshly-valid envelope) from corruption of the MAC field alone (DEK intact, keys
	 *  recoverable). The non-destructive repair is export a full backup (deliberately still works in
	 *  recovery mode — see `openBackupTransfer`) and restore it. Caller MUST hold the facade lock and
	 *  OWNS the returned dek. */
	private async trustedDekForRekeyHoldingLock(
		profile: Profile,
		secret: MasterSecretBytes,
		old: OpenedSlots,
		changing: "password" | "unlock method",
	): Promise<ImportedKeysDek> {
		const dek = await old.openDek(profile.dekSealed)
		if (!dek) {
			this.logger.log(this.name, LogLevel.Error, `imported-keys DEK unrecoverable at ${changing} change — refusing`, profile.id)
			throw new Error(DEK_UNRECOVERABLE_MESSAGE)
		}
		try {
			if (!(await this.envelopeMacValid(profile.id, profile, secret, dek))) {
				this.logger.log(this.name, LogLevel.Error, `envelope MAC does not cover the DEK slot at ${changing} change`, profile.id)
				throw new Error(`Profile integrity check failed. Export a full backup and restore it before changing the ${changing}`)
			}
			return dek
		} catch (error) {
			zeroize(dek)
			throw error
		}
	}

	/** The trusted DEK re-keyed for the new password. Caller MUST hold the facade lock and OWNS the
	 *  returned dek; on a throw after allocation it is zeroized here before the rethrow. */
	private async rekeyedDekForPasswordChangeHoldingLock(
		profile: Profile,
		secret: MasterSecretBytes,
		old: OpenedSlots,
		newPasshash: Passhash,
	): Promise<{ dek: ImportedKeysDek; newDekSealed: string }> {
		const dek = await this.trustedDekForRekeyHoldingLock(profile, secret, old, "password")
		try {
			return { dek, newDekSealed: await this.sealDekWithPasshash(newPasshash, dek) }
		} catch (err) {
			zeroize(dek)
			throw err
		}
	}

	/** Re-open the active session over the just-committed row with a fresh Fr.
	 *  `openSessionVerified` re-runs the integrity check + the deletion bracket. If the
	 *  RE-check now fails on an address-drift block (e.g. a foreign account was restored
	 *  between the pre-check and here), the password change ALREADY SUCCEEDED — it must
	 *  not be reported as a failure. Swallow ONLY that typed error: openSessionVerified
	 *  has already persisted the block + closed the session, so the barrier surfaces the
	 *  drift as its own handled state. Any other error (deletion fence, etc.)
	 *  propagates. Caller MUST hold the facade lock. */
	private async reopenAfterPasswordChangeHoldingLock(
		id: string,
		profile: Profile,
		secret: MasterSecretBytes,
		dek: ImportedKeysDek,
	): Promise<void> {
		if (!this.sessionManager.isActive(id)) return
		try {
			await this.openSessionVerified(profile, secret, dek)
		} catch (reopenError) {
			if (!(reopenError instanceof AccountAddressInconsistencyError)) throw reopenError
			this.logger.log(
				this.name,
				LogLevel.Error,
				"password changed but re-open hit an address-integrity block — surfaced via the barrier",
				id,
			)
		}
	}

	public async changeProfilePassword(id: string, oldPassword: string, newPassword: string): Promise<ProfileInfo> {
		await this.ensureInitialized()
		return this.runExclusive(async () => {
			const profile = await this.getProfileOrThrowHoldingLock(id)
			if (classifyProfileRow(profile).kind === "retired") throw new RetiredProfileError()
			if (profile.type === "passkey") {
				throw new Error("Operation not supported for passkey profile")
			}

			const old = await this.openSlots(profile, { password: oldPassword })
			if (!old) {
				throw new Error("Invalid profile old password")
			}

			// Unseal the (new-cipher) secret up front so integrity can be checked BEFORE the new
			// password is persisted — if a gate throws, nothing is committed and the RPC failure
			// is honest; a null unseal of the just-sealed cipher means corruption, never a pass.
			let resealed: Sealed | undefined
			let secret: MasterSecretBytes | null = null
			let entropy: Uint8Array<ArrayBuffer> | null = null
			let dek: ImportedKeysDek | null = null
			try {
				resealed = await this.secretBox.seal(newPassword, old.secret, old.entropy)
				;({ secret, entropy } = await this.unsealResealedVerifiedHoldingLock(profile, resealed))
				const rekeyed = await this.rekeyedDekForPasswordChangeHoldingLock(profile, secret, old, resealed.passhash)
				dek = rekeyed.dek

				// Dual reseal is atomic with this same pre-persist-verified commit:
				// guard, master, entropy, AND the DEK re-encrypt together — nothing may remain
				// decryptable under the retired password — and the envelope MAC v3 re-keys over
				// the new ciphertexts (still bound to this row's id + fingerprint) so both verify
				// sites keep holding.
				profile.guard = resealed.encrypted.guard
				profile.secret = resealed.encrypted.secret
				profile.entropy = resealed.encrypted.entropy
				profile.dekSealed = rekeyed.newDekSealed
				profile.envelopeMac = await envelopeMacFor(
					{ id, slots: resealed.encrypted, dekSealed: rekeyed.newDekSealed, walletFingerprint: profile.walletFingerprint },
					secret,
					dek,
				)
				await this.repo.set(id, profile)
				this.emit("onProfileUpdated", this.getProfileInfo(profile))

				await this.reopenAfterPasswordChangeHoldingLock(id, profile, secret, dek)
			} finally {
				old.wipe()
				zeroize(secret)
				zeroize(entropy)
				zeroize(dek)
				zeroize(resealed?.passhash)
			}

			return this.getProfileInfo(profile)
		})
	}

	public async verifyUnlockCredential(id: string, credential: UnlockCredential): Promise<void> {
		await this.ensureInitialized()
		const { profile, capturedEpoch } = await this.captureRowFence(id)
		const key = await this.unlockCredentialKey(credential)
		const opened = await this.openSlots(profile, key)
		if (!opened) throw this.notOpened(key, () => new InvalidPasswordError())
		try {
			await this.assertEntropyMasterPair(opened.secret, opened.entropy)
			await this.runExclusive(async () => {
				if (!(await this.rowUnchangedHoldingLock(profile, capturedEpoch))) throw new Error("Invalid profile id")
				zeroize(await this.trustedDekForRekeyHoldingLock(profile, opened.secret, opened, "unlock method"))
			})
		} finally {
			opened.wipe()
		}
	}

	public async verifyExportCredential(id: string, credential: UnlockCredential): Promise<void> {
		await this.ensureInitialized()
		const { profile, capturedEpoch } = await this.captureRowFence(id)
		const key = await this.unlockCredentialKey(credential)
		const opened = await this.openSlots(profile, key)
		if (!opened) throw this.notOpened(key, () => new InvalidPasswordError())
		try {
			await this.assertEntropyMasterPair(opened.secret, opened.entropy)
			await this.runExclusive(async () => {
				if (!(await this.rowUnchangedHoldingLock(profile, capturedEpoch))) throw new Error("Invalid profile id")
			})
		} finally {
			opened.wipe()
		}
	}

	/**
	 * Reseals a profile under another unlock: `current` must open the row as it is, `next` is a new
	 * password or a passkey answer at a fresh input. The master, the DEK and the row keys stay the
	 * profile's; one write replaces the slots, the DEK slot and the MAC, so exactly one unlock opens
	 * the row before and after. Every refusal before that write leaves the row's bytes unchanged; a
	 * failure after it, or a write whose outcome cannot be read back, closes the session and throws
	 * {@link UnlockMethodChangedError}, never a refusal. An integrity block on the reopen is not a
	 * failure: the profile returns with its session closed, behind the barrier.
	 */
	public async changeUnlockMethod(id: string, current: UnlockCredential, next: UnlockCredential): Promise<ProfileInfo> {
		await this.ensureInitialized()
		if ("password" in next && !isNewPasswordValid(next.password, next.password)) {
			throw new Error("The new password needs at least 8 characters")
		}
		// The prompts and the password hashes run outside the lock; the commit revalidates the row
		// before its checks and its write.
		const { profile: snapshot, capturedEpoch } = await this.captureRowFence(id)
		const kind = classifyProfileRow(snapshot).kind
		if (kind !== "password" && kind !== "passkey") throw new Error("Profile storage corrupted")
		const key = await this.unlockCredentialKey(current)
		if (!unlocksWith(snapshot, key)) throw new StaleUnlockCredentialError()
		if (kind === "password" && "password" in next) throw new SameUnlockMethodError()
		const seal = "password" in next ? await this.newRowSeal(next.password, undefined) : await this.newRowSeal(undefined, next.passkey)
		let opened: OpenedSlots | null = null
		try {
			opened = await this.openSlots(snapshot, key)
			if (!opened) throw this.notOpened(key, () => new InvalidPasswordError())
			const old = opened
			return await this.runExclusive((isCurrent) =>
				this.commitUnlockChangeHoldingLock({ snapshot, capturedEpoch, key, old, seal, isCurrent }),
			)
		} finally {
			opened?.wipe()
			if ("passhash" in seal) zeroize(seal.passhash)
		}
	}

	/** Why a change's row is no longer its snapshot: a stale credential when the same profile now
	 *  stores an unlock `key` is not for, which only another change of unlock writes; else the row is
	 *  gone or was otherwise rewritten, and a retry may succeed. */
	private async movedRowRefusal(id: string, capturedEpoch: number, key: SlotKey): Promise<Error> {
		const live = await this.repo.get(id)
		if (!live || (await this.profileFenceBroken(id, capturedEpoch))) return new Error("Invalid profile id")
		const kind = classifyProfileRow(live).kind
		const resealed = (kind === "password" || kind === "passkey") && !unlocksWith(live, key)
		return resealed ? new StaleUnlockCredentialError() : new Error("Invalid profile id")
	}

	private async unlockCredentialKey(credential: UnlockCredential): Promise<SlotKey> {
		if ("passkey" in credential) return this.slotKey(undefined, credential.passkey)
		if (typeof credential.password !== "string") throw new Error("Password is required")
		return { password: credential.password }
	}

	private async commitUnlockChangeHoldingLock(change: {
		snapshot: Profile
		capturedEpoch: number
		key: SlotKey
		old: OpenedSlots
		seal: RowSeal
		isCurrent: () => boolean
	}): Promise<ProfileInfo> {
		const { snapshot, capturedEpoch, key, old, seal, isCurrent } = change
		const id = snapshot.id
		const unchanged = () => this.rowUnchangedHoldingLock(snapshot, capturedEpoch)
		if (!(await unchanged())) throw await this.movedRowRefusal(id, capturedEpoch, key)
		await this.assertEntropyMasterPair(old.secret, old.entropy)
		const dek = await this.trustedDekForRekeyHoldingLock(snapshot, old.secret, old, "unlock method")
		try {
			if ("credential" in seal) await this.assertPrfSaltUnusedHoldingLock(seal.credential.prfSalt)
			const replacement = await replacementRow(snapshot, await this.sealUnder(seal, old.secret, old.entropy, dek), old.secret, dek)
			await this.assertReplacementOpens(replacement, seal, { secret: old.secret, entropy: old.entropy, dek })
			await this.precheckBeforeRekeyHoldingLock(snapshot, old.secret)
			// The lock's watchdog may have admitted a successor during the slow steps above or this read,
			// so ownership is checked last, with no await before the write.
			if (!(await unchanged())) throw await this.movedRowRefusal(id, capturedEpoch, key)
			if (!isCurrent()) throw new Error("Invalid profile id")
			if (!(await this.writeReplacementHoldingLock(snapshot, replacement))) {
				await this.closeAfterUnlockChangeHoldingLock(id)
				throw new UnlockMethodChangedError()
			}
			await this.afterUnlockChangeHoldingLock(replacement, old.secret, dek)
			return this.getProfileInfo(replacement)
		} finally {
			zeroize(dek)
		}
	}

	/** A resealed row must open under its new unlock to the same master, entropy and DEK before it
	 *  replaces the old one: a row no unlock opens is never written. */
	private async assertReplacementOpens(
		row: Profile,
		seal: RowSeal,
		expected: { secret: MasterSecretBytes; entropy: Uint8Array<ArrayBuffer>; dek: ImportedKeysDek },
	): Promise<void> {
		const classified = classifyProfileRow(row)
		let reopened: OpenedSlots | null = null
		let dek: ImportedKeysDek | null = null
		try {
			if ("credential" in seal) reopened = await this.openSlots(row, { passkey: seal.credential })
			else if (classified.kind === "password") reopened = await this.openUnderPasshash(classified.slots, seal.passhash)
			dek = reopened ? await reopened.openDek(row.dekSealed) : null
			const same =
				!!reopened &&
				!!dek &&
				array_equals(reopened.secret, expected.secret) &&
				array_equals(reopened.entropy, expected.entropy) &&
				array_equals(dek, expected.dek)
			if (!same) throw new Error("Profile storage corrupted")
		} finally {
			reopened?.wipe()
			zeroize(dek)
		}
	}

	/** Writes `replacement` over `original`: `true` once the replacement is stored. A rejected write
	 *  is read back, since a rejection does not prove nothing landed: the original there rethrows
	 *  the rejection, the replacement is a write made, anything else (missing, another row, a read
	 *  that fails) is `false`, an outcome no one can report as unchanged. */
	private async writeReplacementHoldingLock(original: Profile, replacement: Profile): Promise<boolean> {
		try {
			await this.repo.set(original.id, replacement)
			return true
		} catch (writeError) {
			const stored = await this.repo.get(original.id).catch(() => undefined)
			if (stored && sameStoredRow(stored, original)) throw writeError
			return !!stored && sameStoredRow(stored, replacement)
		}
	}

	/** After the write every failure is a changed method: the session closes and the person
	 *  unlocks again with the new one. */
	private async afterUnlockChangeHoldingLock(replacement: Profile, secret: MasterSecretBytes, dek: ImportedKeysDek): Promise<void> {
		const id = replacement.id
		try {
			this.emit("onProfileUpdated", this.getProfileInfo(replacement))
			if (!this.sessionManager.isActive(id)) return
			const before = this.sessionManager.peekLiveSerial()
			try {
				await this.openSessionVerified(replacement, secret, dek)
			} catch (reopenError) {
				// The integrity check closed the session and recorded the block; the barrier shows it.
				if (reopenError instanceof AccountAddressInconsistencyError) return
				throw reopenError
			}
			// `SessionManager.open` swallows its failures and can leave the previous session live, which
			// still holds the replaced row.
			const after = this.sessionManager.peekLiveSerial()
			if (after === undefined || after === before || !this.sessionManager.isActive(id)) throw new Error("Session did not reopen")
		} catch (error) {
			this.logger.log(this.name, LogLevel.Error, "unlock method changed but the session did not reopen", { profileId: id, error })
			await this.closeAfterUnlockChangeHoldingLock(id)
			throw new UnlockMethodChangedError()
		}
	}

	private async closeAfterUnlockChangeHoldingLock(id: string): Promise<void> {
		if (!this.sessionManager.isActive(id)) return
		await this.sessionManager.close().catch((error: unknown) => {
			this.logger.log(this.name, LogLevel.Error, "session close after an unlock method change failed", { profileId: id, error })
		})
	}

	/** Injected by the last-started ProfileDeletionCoordinator. */
	public setDeletionDelegate(delegate: ProfileDeletionDelegate): void {
		this.deletionDelegate = delegate
		this.deletionDelegateInjected.resolve()
	}

	/**
	 * Waits for init and then for the coordinator's start, both inside one init budget, so a delete
	 * waits no longer before its first write than any RPC waits for init. Holds no lock. The budget
	 * runs on the monotonic clock: a wall-clock change must neither stretch nor cut it.
	 */
	private async awaitDeletionDelegate(): Promise<ProfileDeletionDelegate> {
		const deadline = performance.now() + DEFAULT_INIT_TIMEOUT_MS
		await this.ensureInitialized()
		if (!this.deletionDelegate) {
			let timer: ReturnType<typeof setTimeout> | undefined
			const bound = new Promise<void>((resolve) => {
				timer = setTimeout(resolve, Math.max(0, deadline - performance.now()))
			})
			await Promise.race([this.deletionDelegateInjected.promise, bound])
			clearTimeout(timer)
		}
		const delegate = this.deletionDelegate
		if (!delegate) throw new Error("deletion coordinator not ready")
		return delegate
	}

	/** Injected by the last-started AccountIntegrityCoordinator. */
	public setIntegrityDelegate(delegate: AccountIntegrityDelegate): void {
		this.integrityDelegate = delegate
	}

	/**
	 * Session-open chokepoint: EVERY path that materializes a session (unlock, create, import,
	 * finalizeRestore, password change) runs the integrity delegate FIRST — a profile whose
	 * stored account addresses no longer re-derive is withheld, never exposed. For the backup
	 * import path this lands after account restoration and before `finalizeRestore` opens the
	 * session, so a corrupt/foreign backup cannot activate a mismatched profile. The delegate
	 * registers in the LAST topological phase, before any RPC-driven open can occur; when absent
	 * (unit tests without the coordinator) the open proceeds unchecked.
	 */
	private async openSessionVerified(profile: Profile, secret: MasterSecretBytes, dek?: ImportedKeysDek): Promise<void> {
		// The keys come first: the integrity check reads the profile's sealed rows. An open that
		// fails drops keys it derived, so a refused or raced open leaves none behind.
		const held = this.rowKeyring.has(profile.id)
		await this.fillRowKeysHoldingLock(profile, secret)
		try {
			await this.openSessionCheckedHoldingLock(profile, secret, dek)
		} catch (error) {
			if (!held) this.dropRowKeys(profile.id)
			throw error
		}
	}

	private async openSessionCheckedHoldingLock(profile: Profile, secret: MasterSecretBytes, dek?: ImportedKeysDek): Promise<void> {
		// Capture the PERSISTENT deletion epoch up front. `isReserved` alone is transient — a
		// force-released facade lock could let a delete reserve→purge→RELEASE entirely while the
		// verify/open below runs, leaving `isReserved` false on both sides. The monotonic epoch does
		// not reset on release, so comparing it after the open detects a delete that fully completed.
		const deletionEpoch = this.deletionState.capture(profile.id)
		// Torn-restore gate FIRST (cheap read; precedence over the integrity
		// delegate by ordering): a restore-pending marker still present for THIS
		// incarnation means the import never finalized — the slices may be torn,
		// and opening would let the bootstrap silently re-seed the gaps. A marker
		// that EXISTS but cannot be decoded blocks too (tombstone fail-closed
		// precedent); only a generation MISMATCH (stale leftover from a prior
		// incarnation) is purged and ignored.
		const restore = await this.restoreState(profile)
		if (restore === "torn") {
			throw new RestoreTornError(undefined, { profileId: profile.id })
		}
		if (restore === "stale") {
			// Known-stale leftover: best-effort purge — a rejecting remove must
			// not fail an otherwise-valid unlock (rehydration-path symmetry).
			await this.restorePending.delete(profile.id).catch(() => {})
		}
		try {
			if (this.integrityDelegate) {
				await this.integrityDelegate.verifyBeforeSessionOpen(profile.id, secret)
			} else if (await this.integrityBlocked.isBlocked(profile.id)) {
				// STARTUP-WINDOW FAIL-CLOSED: the coordinator injects the delegate in a later phase,
				// but each service accepts RPCs from construction — an unlock racing startup would
				// otherwise open UNCHECKED. With no delegate we can't re-derive, but a KNOWN durable
				// block still refuses the open. (A never-before-seen drift in this window is caught by
				// the coordinator's boot verification, which runs right after it registers; the
				// version-keyed stamp means a drift can't already carry a green stamp.)
				throw new AccountAddressInconsistencyError(undefined, { profileId: profile.id })
			}
		} catch (error) {
			// A freshly-flagged profile must not keep a PRIOR live session either (the password-change
			// flow re-opens over one): withholding the new session while the old stays usable would
			// leave the blocked profile operating.
			if (this.sessionManager.isActive(profile.id)) {
				await this.sessionManager.close()
			}
			throw error
		}
		// Bracket the open against a deletion racing the (possibly slow) verification. Pre-open:
		// reject if already reserved. Post-open: reject + close the just-opened session if the
		// profile is reserved OR its deletion epoch advanced during the open (a delete that
		// reserved→purged→released entirely while the open ran) — so a deleted profile can never be
		// resurrected.
		if (this.deletionState.isReserved(profile.id)) {
			throw new Error("Invalid profile id")
		}
		await this.sessionManager.open(profile, secret, dek)
		if (this.deletionState.isReserved(profile.id) || !this.deletionState.isCurrent(profile.id, deletionEpoch)) {
			if (this.sessionManager.isActive(profile.id)) {
				await this.sessionManager.close()
			}
			throw new Error("Invalid profile id")
		}
		// Post-open invariant. open() is memory-first, so a persistence
		// failure degrades to in-memory success (still active). But a genuine
		// in-memory commit failure (e.g. Fr.fromBuffer / wrap throw) would leave
		// the session inactive while this method returned success — surface it.
		if (!this.sessionManager.isActive(profile.id)) {
			throw new Error("Invalid profile id")
		}
	}

	/** The SHARED deletion state (reserved ids + per-profile epoch). Execution +
	 *  Transaction resolve this at init so a write that captured an epoch before a
	 *  delete is fenced when it tries to persist afterward (D13). */
	public getDeletionState(): ProfileDeletionState {
		return this.deletionState
	}

	/** A restore-pending marker for this incarnation, or one that cannot be decoded, means the
	 *  backup restore never finished (`torn`); one left by an older incarnation is `stale`. */
	private async restoreState(profile: Profile): Promise<"torn" | "stale" | "clean"> {
		const marker = await this.restorePending.get(profile.id)
		if (marker.kind === "corrupt") return "torn"
		if (marker.kind === "absent") return "clean"
		return marker.marker.pxeGeneration === profile.pxeGeneration ? "torn" : "stale"
	}

	/** A fresh profile id that is neither in storage NOR reserved by a pending
	 *  deletion (fail-CLOSED against successor-clobber, finding D). */
	private async nextUnreservedId(): Promise<string> {
		let id = await this.repo.generateUniqueId()
		while (this.deletionState.isReserved(id)) id = await this.repo.generateUniqueId()
		return id
	}

	/** Torn-import guard, run UNDER the facade lock: refuse unless (a) the row's
	 *  `pxeGeneration` still matches — a same-id re-import that landed between the
	 *  sweep's observation and this call must never be deleted by a decision made about
	 *  its predecessor — and (b) the EXACT observed restore-pending marker tuple is
	 *  still present. (b) is the load-bearing half against a finalize race:
	 *  `finalizeRestore` clears the marker at entry UNDER THIS SAME LOCK and leaves the
	 *  generation unchanged, so a generation check alone would let the sweep delete a
	 *  just-finalized, in-use profile. Marker gone or different →
	 *  the import finalized or restarted → refuse. */
	private async assertTornGuardUnchangedHoldingLock(
		id: string,
		profile: Profile,
		tornGuard: { pxeGeneration: string; markerAt: number },
	): Promise<void> {
		if (profile.pxeGeneration !== tornGuard.pxeGeneration) {
			throw new Error("profile generation changed since the deletion was decided")
		}
		const marker = await this.restorePending.get(id)
		if (marker.kind !== "valid" || marker.marker.pxeGeneration !== tornGuard.pxeGeneration || marker.marker.at !== tornGuard.markerAt) {
			throw new Error("restore-pending marker changed since the deletion was decided — import finalized or restarted")
		}
	}

	/** `beginDeletion` reserved the id synchronously; if the tombstone write
	 *  REJECTS, the delete didn't durably happen — but the rejection is
	 *  commit-ambiguous (the key may still have landed). Read back the RAW tombstone
	 *  key and release the reservation ONLY when its absence is confirmed (a
	 *  cleanly-failed write), so the live profile isn't wedged. If the key exists / is
	 *  corrupt / the read-back throws, RETAIN fail-closed (a durable tombstone means
	 *  `resumePendingDeletions` finishes the delete; releasing would let an unlock race
	 *  the resume). The epoch bump is kept regardless — rolling it back would let a
	 *  later real deletion re-mint the same epoch and un-fence a stale writer. Caller
	 *  MUST hold the facade lock. */
	private async writeTombstoneHoldingLock(
		id: string,
		snapshot: { addresses: string[]; tokenIds: number[]; networkIds: string[]; pxeGeneration: string },
		epoch: number,
	): Promise<void> {
		try {
			await this.tombstones.write({ profileId: id, ...snapshot, epoch })
		} catch (writeError) {
			let tombstoneDurable = true
			try {
				tombstoneDurable = (await this.tombstones.reservedIds()).has(id)
			} catch {
				tombstoneDurable = true
			}
			if (!tombstoneDurable) {
				this.deletionState.release(id)
			}
			throw writeError
		}
	}

	/** Commit a freshly-built row and announce it — the shared tail of every
	 *  create/import path. `openSessionVerified` (where a path opens at all) stays at
	 *  the call site: restore's late-activation paths commit without opening. Caller
	 *  MUST hold the facade lock. */
	private async persistNewProfileHoldingLock(profile: Profile): Promise<void> {
		await this.dropUiKeysBeforeAdoption(profile.id)
		await this.repo.set(profile.id, profile)
		this.emit("onProfileAdded", this.getProfileInfo(profile))
	}

	/** A create's commit. A profile made while another exists is marked, so Home asks it at most for
	 *  its phrase; a tombstoned or undecodable row is no profile here, as in `getProfiles`. Caller
	 *  MUST hold the facade lock. */
	private async persistCreatedProfileHoldingLock(profile: Profile): Promise<void> {
		const notFirst = (await this.repo.getAll()).some((p) => !this.deletionState.isReserved(p.id))
		await this.persistNewProfileHoldingLock(profile)
		if (notFirst) await this.markProfileFlagHoldingLock(profileNotFirstKey(profile.id))
	}

	/** A restore that keeps its backup's id adopts an id used before; a key written under it since
	 *  its purge belongs to no profile yet. A rejected removal fails the commit before anything is
	 *  written. */
	private async dropUiKeysBeforeAdoption(id: string): Promise<void> {
		await this.local.remove(profileUiKeys(id))
	}

	/** After a row: one of Home's Get started flags only the service sets. Here rather than in the
	 *  page, because a passkey window or a closed popup can end the page first. A lost write only
	 *  leaves Home's reminders up, so it never fails the commit. Caller MUST hold the facade lock, so
	 *  a deletion cannot fall between the row and this write. */
	private async markProfileFlagHoldingLock(key: string): Promise<void> {
		try {
			await this.local.set({ [key]: true })
		} catch (error) {
			this.logDebug("profile flag write failed", { error })
		}
	}

	/** Marker BEFORE row (fail-closed): a crash between the two writes leaves an orphan
	 *  marker with no row — lazily purged — never a row without its restore-in-progress
	 *  marker. A rejected row write compensates by removing the marker it just wrote so
	 *  it cannot brand a future same-id profile. No emit here — the restore branches
	 *  announce AFTER this bracket. Caller MUST hold the facade lock. */
	private async writeMarkerThenRowHoldingLock(id: string, newProfile: Profile): Promise<void> {
		await this.dropUiKeysBeforeAdoption(id)
		await this.restorePending.write({ profileId: id, pxeGeneration: newProfile.pxeGeneration, at: Date.now() })
		try {
			await this.repo.set(id, newProfile)
		} catch (rowErr) {
			await this.restorePending.delete(id).catch(() => {})
			throw rowErr
		}
	}

	/**
	 * Atomic, awaited, privacy-erasing profile deletion (finding D). THREE phases:
	 *  1. UNDER the facade lock: snapshot (lock-free reads) → write the durable
	 *     tombstone (reserves the id + bumps the deletion epoch, fencing in-flight
	 *     writes) → delete the profile row → close the session → UI-only emit.
	 *  2. OUTSIDE the lock: the coordinator's awaited purge of EVERY profile-bearing
	 *     root. A failure leaves the tombstone → resume retries; the id stays reserved.
	 *  3. UNDER the lock: clear the tombstone (epoch-guarded); release the reservation once its key is gone.
	 *
	 * `tornGuard` (torn-import sweep only): phase 1 refuses unless the observed
	 * generation + marker tuple are unchanged — see `assertTornGuardUnchangedHoldingLock`.
	 */
	public async deleteProfile(id: string, tornGuard?: { pxeGeneration: string; markerAt: number }): Promise<ProfileInfo> {
		const delegate = await this.awaitDeletionDelegate()

		const { profile, epoch, snapshot } = await this.runExclusive(async () => {
			this.sweepStalePendingRestore(Date.now())
			const profile = await this.repo.get(id)
			if (!profile || this.deletionState.isReserved(id)) {
				throw new Error("Invalid profile id")
			}
			if (tornGuard !== undefined) {
				await this.assertTornGuardUnchangedHoldingLock(id, profile, tornGuard)
			}
			// Fail FAST on a pre-fence row (no persisted pxeGeneration): proceeding
			// would half-execute — the tombstone write drops the undefined field, its
			// own schema then can't parse it, and the PXE clear throws AFTER the row
			// is deleted, wedging the id forever. Every released build writes the field, so no
			// migration adds it.
			if (!profile.pxeGeneration) {
				throw new Error("profile predates the pxe-generation fence, which every released build writes")
			}
			const rows = await delegate.snapshot(id)
			const snapshot = { ...rows, pxeGeneration: profile.pxeGeneration }
			const epoch = this.deletionState.beginDeletion(id)
			await this.writeTombstoneHoldingLock(id, snapshot, epoch)
			await this.repo.delete(id)
			// Close the session BEFORE the emit (a subscriber reacting to the emit
			// must not observe a still-open session for a deleted profile). A record an
			// earlier failed delete left with no session in memory goes too.
			await this.sessionManager.closeProfile(id)
			// Deleting a profile mid-restore must drop + zeroize its rewrap context (its
			// buffers aren't aged yet, so the TTL sweep wouldn't reap them).
			this.pendingDekRewraps.drop(id)
			// A deleted profile's integrity records must not outlive it: a stale blocking record
			// would keep the barrier up forever, and a stale verified-stamp could let a future
			// same-id re-import skip its first boot verification.
			await this.integrityBlocked.clear(id)
			await this.integrityStamps.clear(id)
			await this.staleNetworks.clearProfile(id)
			// The restore-pending marker clears LAST among the fallible cleanups —
			// session close + pending-secret zeroization above must never be
			// skipped by a rejecting storage remove. A failure here leaves the
			// tombstone in place, so the crash-resume path re-clears it.
			await this.restorePending.delete(id)
			this.emit("onProfileDeleted", this.getProfileInfo(profile))
			return { profile, epoch, snapshot }
		})

		await delegate.runFor(id, snapshot)

		// A TORN reap keeps the tombstone (skips phase 3). In the wall-clock
		// corner (clock jump / multi-day suspension) the reaped import's popup may
		// still land slice writes AFTER this purge — slice restores don't consult
		// deletion state — so the cleanup must be re-runnable after the loser
		// quiesces: the retained tombstone makes the NEXT
		// boot's resume re-purge idempotently (catching any late rows), then clear
		// + release there. Cost: the id stays reserved until that boot — a dead
		// import's id, unreused for one SW lifetime.
		if (tornGuard !== undefined) {
			return this.getProfileInfo(profile)
		}

		await this.runExclusive(() => this.clearTombstoneAndRelease(id, epoch))
		return this.getProfileInfo(profile)
	}

	/**
	 * Resume any deletion a prior SW left tombstoned (crashed mid-cleanup). Called
	 * AFTER `services.start()` so it never blocks unrelated startup. Idempotent;
	 * a corrupt tombstone stays reserved ("deletion pending"), never fails open.
	 *
	 * When `bootCutoff` is supplied (the SW boot instant, captured BEFORE
	 * `services.start()` — the same discipline as the journal reaper), also sweep TORN IMPORTS. A
	 * restore-pending marker only proves the restore is INCOMPLETE, not
	 * abandoned: a PASSWORD import whose SW died mid-flow can still legitimately
	 * `finalizeRestore` against this new SW (the popup auto-reconnects; finalize
	 * re-derives from the durable row + the popup-held password).
	 * Abandonment is therefore proven by AGE: only markers older than
	 * {@link TORN_IMPORT_MIN_AGE_MS} are reaped — no live import plausibly spans
	 * it, and the popup flow is an unbroken RPC chain whose failure paths run
	 * the composable's own rollback. The reap runs the real `deleteProfile`
	 * pinned to the observed `pxeGeneration`, so it can never land on a newer
	 * same-id incarnation. Accepted risk (blast-radius note): unlike the journal
	 * reaper's metadata-only boot sweep, this destroys a profile — the age floor
	 * + generation pin + tuple compare-and-delete are the containment. Without a
	 * cutoff the sweep is SKIPPED entirely.
	 */
	public async resumePendingDeletions(bootCutoff?: number): Promise<void> {
		const delegate = this.deletionDelegate
		if (!delegate) return
		await this.resumeTombstonedDeletions(delegate)
		// Torn-import sweep — only with an explicit boot cutoff (see doc).
		if (bootCutoff === undefined) return
		await this.sweepTornImports(bootCutoff)
	}

	/** Finish every valid tombstone's deletion through the same three-phase shape as the
	 *  live `deleteProfile`; per-tombstone failures log and continue. */
	private async resumeTombstonedDeletions(delegate: ProfileDeletionDelegate): Promise<void> {
		// TELEMETRY: a corrupt tombstone reserves its id (fail-closed) but can't be
		// auto-resumed — surface it for manual recovery. We do NOT drop it (that would
		// fail OPEN: the row is already deleted but purge may still be pending).
		const corrupt = await this.tombstones.corruptIds()
		if (corrupt.length) {
			this.logError(
				`profile-deletion: ${corrupt.length} corrupt tombstone(s) reserved but un-resumable (manual recovery)`,
				corrupt.join(","),
			)
		}
		for (const t of await this.tombstones.validPayloads()) {
			try {
				// Complete phase 1 idempotently — a crash may have written the tombstone
				// but not yet deleted the row / closed the session.
				await this.runExclusive(async () => {
					if (await this.repo.get(t.profileId)) await this.repo.delete(t.profileId)
					await this.sessionManager.closeProfile(t.profileId)
					await this.restorePending.delete(t.profileId)
					// Idempotent, same as the live `deleteProfile` phase-1 block: a deletion that
					// crashed before these clears must still drop the integrity records so a deleted
					// profile can't leave an orphan block/stamp behind.
					await this.integrityBlocked.clear(t.profileId)
					await this.integrityStamps.clear(t.profileId)
					await this.staleNetworks.clearProfile(t.profileId)
				})
				await delegate.runFor(t.profileId, {
					addresses: t.addresses,
					tokenIds: t.tokenIds,
					networkIds: t.networkIds,
					pxeGeneration: t.pxeGeneration,
				})
				await this.runExclusive(() => this.clearTombstoneAndRelease(t.profileId, t.epoch))
			} catch (err) {
				this.logError(`resume deletion failed for ${t.profileId}`, err)
			}
		}
	}

	/** Phase 3 of a deletion, under the facade lock. A tombstone left in place (corrupt,
	 *  or another epoch's) keeps the id reserved, as every later boot would. */
	private async clearTombstoneAndRelease(id: string, epoch: number): Promise<void> {
		if (await this.tombstones.clearIfSame(id, epoch)) this.deletionState.release(id)
	}

	/** The torn-import sweep body — see `resumePendingDeletions`' doc for the
	 *  age-floor/abandonment rationale; per-marker failures log and continue. */
	private async sweepTornImports(bootCutoff: number): Promise<void> {
		const corruptMarkers = await this.restorePending.corruptIds()
		if (corruptMarkers.length) {
			// Fail CLOSED (tombstone doctrine): never delete what we can't decode —
			// the marker stays, the row stays, unlock keeps refusing via its own
			// corrupt-marker gate. Surfaced for manual recovery.
			this.logError(`torn-import sweep: ${corruptMarkers.length} corrupt marker(s) left untouched`, corruptMarkers.join(","))
		}
		for (const marker of await this.restorePending.validMarkers()) {
			if (marker.at >= bootCutoff) continue // this-lifetime import — live, untouchable
			try {
				// Purge decisions run UNDER the facade lock: `restore()` writes its
				// marker under the same lock, so read/compare/delete here is atomic
				// against a live same-id restore (an unlocked deleteIfSame is still
				// TOCTOU between its get and remove).
				const purged = await this.runExclusive(async () => {
					const row = await this.repo.get(marker.profileId)
					if (!row) {
						// Row-write compensation already cleaned the row; the bare marker
						// must not brand a future same-id profile.
						await this.restorePending.deleteIfSame(marker)
						return true
					}
					if (row.pxeGeneration !== marker.pxeGeneration) {
						// Stale leftover from a prior incarnation — the eager version of
						// the lazy purge `openSessionVerified` already performs.
						await this.restorePending.deleteIfSame(marker)
						return true
					}
					return false
				})
				if (purged) continue
				if (bootCutoff - marker.at < ProfileService.TORN_IMPORT_MIN_AGE_MS) {
					// Incomplete, but not provably ABANDONED: a password import whose SW
					// died can still finalize through the popup's auto-reconnect. Leave
					// it; it stays unlock-refused (RestoreTornError) and is reaped once
					// it ages past the floor.
					continue
				}
				// Aged past any plausible live import. Complete the compensating delete
				// through the full three-phase machinery, guarded UNDER THE LOCK on both
				// the observed generation AND the exact marker tuple — finalize clears
				// the marker under that same lock, so a reap can never fire after a
				// finalize; a same-id re-import mints a new generation. If THIS delete
				// fails pre-tombstone the marker survives and the next boot retries;
				// post-tombstone, the tombstone loop above finishes it. A torn reap
				// also RETAINS its tombstone (phase 3 skipped), so the next boot
				// re-purges idempotently — any slice rows a wall-clock-corner loser
				// (forward clock jump / multi-day suspension) lands AFTER this purge
				// are swept once it has quiesced. The loser's own finalize fails
				// RETRYABLY with the backup file still the source of truth; no in-use
				// profile can be deleted (the marker guard above).
				this.logError(`torn-import sweep: completing compensating delete for ${marker.profileId}`)
				await this.deleteProfile(marker.profileId, { pxeGeneration: marker.pxeGeneration, markerAt: marker.at })
			} catch (err) {
				this.logError(`torn-import sweep failed for ${marker.profileId}`, err)
			}
		}
	}

	public async importMnemonic(
		name: string,
		mnemonic: string[],
		password?: string,
		allowDuplicate = false,
		credentialData?: PasskeyCredentialData,
	): Promise<ProfileInfo> {
		await this.ensureInitialized()
		// Boundary validation BEFORE any persistence, on the CANONICAL form (the same
		// normalizer the KDF applies — the same input can never validate one way and derive
		// another): exactly 24 words, every word on the wordlist, checksum valid (`getEntropy`
		// throws on unknown words and bad checksums).
		const words = canonicalizeMnemonic(mnemonic)
		if (words.length !== 24) {
			throw new Error("Invalid mnemonic length")
		}
		const entropy = (await getEntropy(words)) as Uint8Array<ArrayBuffer>
		let seal: RowSeal
		try {
			seal = await this.newRowSeal(password, credentialData)
		} catch (error) {
			zeroize(entropy)
			throw error
		}
		const secret = await deriveMasterFromMnemonic(words)
		// importProfile takes ownership of `secret` + `entropy` + the passhash.
		return await this.importProfile(name, secret, entropy, seal, allowDuplicate)
	}

	/** What a new row from an import or a restore is sealed under: a passkey answer for the new
	 *  profile's own fresh input when given, else the password. The caller owns the passhash. */
	private async newRowSeal(password: string | undefined, credentialData: PasskeyCredentialData | undefined): Promise<RowSeal> {
		if (credentialData) return { credential: (await this.passkeyCoordinator.fromCredentialData(credentialData)).credential }
		if (password === undefined) throw new Error("Password is required for password profile")
		return { passhash: await EncryptionKey.getPasshash(password) }
	}

	/** Seals master, entropy and `dek` under `seal`. The caller owns every buffer. */
	private async sealUnder(
		seal: RowSeal,
		secret: MasterSecretBytes,
		entropy: Uint8Array<ArrayBuffer>,
		dek: ImportedKeysDek,
	): Promise<SealedUnder> {
		const sealDek = await this.sealSlotsUnder(seal, secret, entropy)
		return sealDek(dek)
	}

	/** {@link sealUnder} in two steps, so a caller can draw the DEK after the slots are sealed. */
	private async sealSlotsUnder(
		seal: RowSeal,
		secret: MasterSecretBytes,
		entropy: Uint8Array<ArrayBuffer>,
	): Promise<(dek: ImportedKeysDek) => Promise<SealedUnder>> {
		if ("passhash" in seal) {
			const { passhash } = seal
			const slots = await this.secretBox.sealWithPasshash(passhash, secret, entropy)
			return async (dek) => ({ slots, dekSealed: await this.sealDekWithPasshash(passhash, dek), unlock: { type: "password" } })
		}
		const { id: credentialId, prfSalt } = seal.credential
		const unlockKey = seal.credential.unlockKeyFor(prfSalt)
		if (!unlockKey) throw new Error("Passkey answered for another request")
		const slots = await sealPasskeySlots(unlockKey, secret, entropy)
		return async (dek) => ({
			slots,
			dekSealed: await sealDekUnderWrapKey(unlockKey, dek),
			unlock: { type: "passkey", credentialId, prfSalt },
		})
	}

	/** Each profile's passkey input is its own: a second profile on the same passkey keys its slots
	 *  under a fresh input, never one a stored row already opens under. Caller MUST hold the facade
	 *  lock, so the check and the write it guards are one step. */
	private async assertPrfSaltUnusedHoldingLock(prfSalt: string): Promise<void> {
		const rows = await this.repo.getAll()
		if (rows.some((row) => row.type === "passkey" && row.prfSalt === prfSalt)) {
			throw new Error("Passkey input already belongs to another profile")
		}
	}

	public async exportPlain(id: string, password?: string, credentialData?: PasskeyCredentialData): Promise<string> {
		await this.ensureInitialized()
		const { profile, capturedEpoch } = await this.captureRowFence(id)
		// A wrong credential keeps its type for the caller to word. Any other throw, a crypto-level
		// failure included, is flattened to a plain `Error(message)`.
		try {
			// An export asks for its credential again, so an empty one is a missing one here.
			if (!password && !credentialData) throw new Error("Password is required")
			const key = await this.slotKey(password, credentialData)
			const opened = await this.openSlots(profile, key)
			try {
				if (!opened) {
					throw this.notOpened(key, () => new InvalidPasswordError())
				}
				// Revalidate AFTER the slow unseal: a delete that completed DURING
				// derivation — even fully (row gone, reservation released) — must
				// not still hand back the now-erased profile's master secret.
				if (await this.profileFenceBroken(id, capturedEpoch)) {
					throw new Error("Invalid profile id")
				}
				// Pairing check at every entropy-decryption reveal site: this master feeds
				// `exportAccount` (which derives real signing keys), so a corrupted/transplanted
				// secret slot must fail loudly here too, not silently downstream.
				await this.assertEntropyMasterPair(opened.secret, opened.entropy)
				// Backup `master-key` semantics: ALWAYS the derived master, never entropy —
				// restore() seals this value verbatim as the working master.
				return toBase64(opened.secret)
			} finally {
				// zero secrets after base64-encode escapes (the base64
				// string is the wire format; we can't zero strings).
				opened?.wipe()
			}
		} catch (error) {
			if (error instanceof InvalidPasswordError || error instanceof PasskeyNotOpenedError) {
				this.logDebug("Export refused its credential", { error })
				throw error
			}
			this.logError("Failed to confirm operation", error)
			throw new Error(getErrorMessage(error))
		}
	}

	/**
	 * A profile's full-backup secrets from ONE unseal, so master and entropy can never come from
	 * different row states, plus a fresh per-backup transfer key. The same body for both unlocks:
	 * nothing in it is keyed by the unlock, so the file opens with its own password alone. The caller
	 * re-seals the imported-key rows from `sourceDek` to `transferKey` and the file carries only the
	 * transfer key: the long-lived DEK would open every key imported after the export too, and a
	 * password change rewraps it rather than rotating it. `sourceDek` is null when the stored slot no
	 * longer opens. In-process only. From the return on the caller owns and zeroizes both keys.
	 */
	public async openBackupTransfer(
		id: string,
		password?: string,
		credentialData?: PasskeyCredentialData,
	): Promise<{ masterKey: string; entropy: string; sourceDek: ImportedKeysDek | null; transferKey: ImportedKeysDek }> {
		await this.ensureInitialized()
		const { profile, capturedEpoch } = await this.captureRowFence(id)
		const key = await this.slotKey(password, credentialData)
		const opened = await this.openSlots(profile, key)
		let sourceDek: ImportedKeysDek | null = null
		let handedOver = false
		try {
			if (!opened) {
				throw this.notOpened(key, () => new InvalidPasswordError())
			}
			if (await this.profileFenceBroken(id, capturedEpoch)) {
				throw new Error("Invalid profile id")
			}
			// Pairing check before EXPORT: a backup built from a tampered/
			// transplanted row would otherwise report success with an unrestorable pair.
			await this.assertEntropyMasterPair(opened.secret, opened.entropy)
			// DELIBERATELY opens the slot even when the envelope MAC no longer covers the row, unlike
			// every path that puts the DEK to work: a planted DEK opens none of this profile's rows,
			// which then travel unopened into the restore's orphan taxonomy, while refusing would
			// strand a MAC-corrupted profile whose only non-destructive repair is this backup.
			sourceDek = await opened.openDek(profile.dekSealed)
			if (!sourceDek) {
				this.logger.log(this.name, LogLevel.Warn, "imported-keys DEK unrecoverable at export — rows travel unopened", id)
			}
			const material = {
				masterKey: toBase64(opened.secret),
				entropy: toBase64(opened.entropy),
				sourceDek,
				transferKey: generateImportedKeysDek(),
			}
			handedOver = true
			return material
		} finally {
			opened?.wipe()
			if (!handedOver) zeroize(sourceDek)
		}
	}

	/** Fresh-auth DEK unseal for the account-export path (mirrors `exportPlain`'s posture:
	 *  credential-gated, session-independent, epoch-revalidated): the password, or a passkey answer
	 *  for the row's own `prfSalt`. */
	public async exportImportedKeysDek(id: string, password?: string, credentialData?: PasskeyCredentialData): Promise<ImportedKeysDek> {
		await this.ensureInitialized()
		const { profile, capturedEpoch } = await this.captureRowFence(id)
		const key = await this.slotKey(password, credentialData)
		// Authenticate via the guard round-trip (full unseal), THEN open the DEK slot.
		const opened = await this.openSlots(profile, key)
		try {
			if (!opened) {
				throw this.notOpened(key, () => new InvalidPasswordError())
			}
			if (await this.profileFenceBroken(id, capturedEpoch)) {
				throw new Error("Invalid profile id")
			}
			const dek = await opened.openDek(profile.dekSealed)
			// No MAC gate here either, for `openBackupTransfer`'s reason: a foreign DEK cannot
			// unseal this profile's rows, so the account export fails loudly at the unseal instead
			// of emitting anything — and gating would deny the single-account escape hatch to a
			// profile whose DEK is merely MAC-corrupted.
			if (!dek) {
				throw new Error("Imported-keys key unrecoverable")
			}
			return dek
		} finally {
			opened?.wipe()
		}
	}

	/** The session's imported-keys DEK (a COPY — caller zeroizes), or `undefined` for a degraded
	 *  session. Facade-mediated so the deletion guards apply; AccountService never touches the
	 *  SessionManager directly. */
	public async getProfileDek(id: string): Promise<ImportedKeysDek | undefined> {
		await this.ensureInitialized()
		return this.runExclusive(() => {
			if (this.deletionState.isReserved(id)) throw new Error("Invalid profile id")
			return this.sessionManager.getDek(id)
		})
	}

	public async exportMnemonic(id: string, password?: string, credentialData?: PasskeyCredentialData): Promise<string[]> {
		await this.ensureInitialized()
		const { profile, capturedEpoch } = await this.captureRowFence(id)
		const key = await this.slotKey(password, credentialData)
		const opened = await this.openSlots(profile, key)
		try {
			if (!opened) {
				// Legacy identity-stable message, pinned by the integration suite — kept in
				// lockstep with changeProfilePassword's, whose exact string the
				// change-password UI matches for its wrong-password branch.
				throw this.notOpened(key, () => new Error("Invalid profile old password"))
			}
			// The recovery words come from the STORED ENTROPY (the master derives one-way from
			// them and cannot be reversed). Pairing check before the words are ever revealed:
			// words that no longer derive the stored master would point at a DIFFERENT wallet —
			// the split-brain recovery attack — so fail closed instead of handing them out.
			const mnemonic = await getMnemonic(opened.entropy)
			await this.assertEntropyMasterPair(opened.secret, opened.entropy)
			// Revalidate under the lock AFTER the async derivations — a delete interleaving
			// during them must not let the erased profile's words escape.
			await this.runExclusive(async () => {
				if (await this.profileFenceBroken(id, capturedEpoch)) {
					throw new Error("Invalid profile id")
				}
			})
			return mnemonic
		} finally {
			// zero secrets after mnemonic words derived. The mnemonic
			// is itself sensitive (the user shows it on screen), but
			// zeroing the underlying buffers at least closes the
			// in-memory window.
			opened?.wipe()
		}
	}

	/**
	 * The words↔master pairing check, run at every site that has decrypted BOTH the entropy and
	 * the master: the stored recovery words MUST still derive the stored master. A mismatch means
	 * a tampered or cross-profile-transplanted ciphertext (the backup checksum is integrity-not-
	 * auth; purpose-AAD stops slot-swaps but not same-slot moves between same-password profiles).
	 * Throws before any secret is revealed, persisted, or exported. Zeroizes its own scratch.
	 */
	private async assertEntropyMasterPair(secret: MasterSecretBytes, entropy: Uint8Array<ArrayBuffer>): Promise<void> {
		const words = await getMnemonic(entropy)
		const rederived = await deriveMasterFromMnemonic(words)
		const paired = array_equals(rederived, secret)
		zeroize(rederived)
		if (!paired) {
			throw new Error("Profile storage corrupted")
		}
	}

	/**
	 * Does the stored MAC still cover this exact record? EVERY site that is about to trust the DEK
	 * must ask — not just the unlock path. The DEK slot's AAD is a purpose constant, not
	 * profile-bound, so a same-password sibling's `dekSealed` transplants cleanly into another
	 * profile's row and unseals there; the whole-envelope MAC is the only check that catches it.
	 * A site that skips this either blesses the planted slot (laundering the tamper into a
	 * freshly-valid MAC) or exports material sealed to a key the profile does not own.
	 */
	private async envelopeMacValid(
		requestedId: string,
		p: {
			guard: string
			secret: string
			entropy: string
			dekSealed: string
			walletFingerprint: string
			envelopeMac: string
		},
		secret: MasterSecretBytes,
		dek: ImportedKeysDek,
	): Promise<boolean> {
		return verifyEnvelopeMacV3(requestedId, secret, dek, macEnvelopeV3(p, p.dekSealed, p.walletFingerprint), p.envelopeMac)
	}

	/** Seal the imported-keys DEK under the password credential (EncryptionKey — the audited
	 *  PBKDF2 + AES-GCM path — with the shared purpose AAD). */
	private async sealDekWithPasshash(passhash: Passhash, dek: ImportedKeysDek): Promise<string> {
		const key = await EncryptionKey.fromPasshash(passhash)
		return toBase64(await key.encrypt(dek, IMPORTED_DEK_AAD))
	}

	/** Unseal the DEK slot under the password credential. `null` — not a throw — on any
	 *  wrong-key / transplant / corruption / length failure: the caller applies the degradation
	 *  state machine (derived-only session), never a profile block. */
	private async unsealDekWithPasshash(passhash: Passhash, dekSealed: string): Promise<ImportedKeysDek | null> {
		try {
			const key = await EncryptionKey.fromPasshash(passhash)
			const pt = await key.decrypt(fromBase64Lenient(dekSealed), IMPORTED_DEK_AAD)
			if (pt.length !== IMPORTED_KEYS_DEK_LEN) {
				zeroize(pt)
				return null
			}
			return asImportedKeysDek(pt)
		} catch {
			return null
		}
	}

	/**
	 * The duplicate-phrase guard: compare the candidate master's fingerprint against every live
	 * row. Soft by owner policy — a match throws the typed `DuplicateWalletError` (every matching
	 * profile's NAME, never key material) unless the caller carries the confirmed `allowDuplicate`
	 * override. Returns the fingerprint for the row being built. Callers run this UNDER the same
	 * lock as the row commit (check→write atomicity).
	 */
	private async assertNotDuplicateWallet(master: MasterSecretBytes, allowDuplicate: boolean): Promise<string> {
		const fingerprint = await computeWalletFingerprint(master)
		if (!allowDuplicate) {
			const clashes = (await this.repo.getAll()).filter(
				(p) => !this.deletionState.isReserved(p.id) && p.walletFingerprint === fingerprint,
			)
			if (clashes.length > 0) {
				throw new DuplicateWalletError(undefined, { existingProfileNames: clashes.map((p) => p.name) })
			}
		}
		return fingerprint
	}

	public async getProfileSecret(id: string): Promise<Fr> {
		await this.ensureInitialized()
		return this.runExclusive(() => {
			// A profile queued for deletion must not hand out its secret — a half-
			// deleted profile (tombstoned but not yet purged) is being erased.
			if (this.deletionState.isReserved(id)) throw new Error("Invalid profile id")
			return this.sessionManager.getSecret(id)
		})
	}

	/**
	 * The profile row's CURRENT incarnation generation, read under the facade
	 * lock with the row-exists + not-reserved validation the D4 fence requires
	 * at SEND time. `undefined` (row gone or tombstoned) makes the PXE client
	 * skip the capture/provision — a deleted profile cannot re-key its store.
	 */
	public async getPxeGeneration(id: string): Promise<string | undefined> {
		await this.ensureInitialized()
		return this.runExclusive(async () => {
			if (this.deletionState.isReserved(id)) return undefined
			return (await this.repo.get(id))?.pxeGeneration
		})
	}

	/**
	 * takes ownership of `secret`, `entropy` and the seal's passhash from `importMnemonic`. Zeroes
	 * them in finally — runs on success, throw, and re-throw paths.
	 */
	private async importProfile(
		name: string,
		secret: MasterSecretBytes,
		entropy: Uint8Array<ArrayBuffer>,
		seal: RowSeal,
		allowDuplicate = false,
	): Promise<ProfileInfo> {
		const dek = generateImportedKeysDek()
		try {
			return await this.runExclusive(async () => {
				// Duplicate-phrase guard under the SAME lock as the row commit (check→write
				// atomicity): a concurrent same-phrase import gets exactly one dup verdict.
				const walletFingerprint = await this.assertNotDuplicateWallet(secret, allowDuplicate)
				if ("credential" in seal) await this.assertPrfSaltUnusedHoldingLock(seal.credential.prfSalt)
				const id = await this.nextUnreservedId()
				const sealed = await this.sealUnder(seal, secret, entropy, dek)
				const profile = await newRowFor({ id, name, walletFingerprint, ...sealed }, secret, dek)
				await this.persistNewProfileHoldingLock(profile)
				await this.markProfileFlagHoldingLock(profileImportedKey(id))
				await this.openSessionVerified(profile, secret, dek)
				return this.getProfileInfo(profile)
			})
		} finally {
			zeroize(secret)
			zeroize(entropy)
			zeroize(dek)
			if ("passhash" in seal) zeroize(seal.passhash)
		}
	}

	private getProfileInfo(profile: Profile): ProfileInfo {
		return toProfileInfo(profile, this.sessionManager.isRecoveryMode(profile.id), classifyProfileRow(profile).kind === "retired")
	}

	/** The persisted identity only: `recoveryMode` is a live-session projection and never travels. */
	public async backup(): Promise<ProfileInfo | undefined> {
		const active = await this.getActiveProfile()
		return active && toProfileInfo(active, false)
	}

	public async restore(
		profile: ProfileInfo,
		secret: RestoreSecret,
		password?: string,
		allowDuplicate = false,
		credentialData?: PasskeyCredentialData,
	): Promise<Restored<ProfileInfo>> {
		await this.ensureInitialized()

		if (!secret?.masterKey) {
			throw new Error("Master key is required to restore profile")
		}
		if (!credentialData && !password) {
			throw new Error("Password is required for password profile")
		}

		const profileNames = (await this.repo.getAll()).map((p) => p.name)
		const base = profile.name
		let name = base
		let counter = 1
		while (profileNames.includes(name)) {
			name = `${base} ${counter}`
			counter++
		}
		return this.restoreProfile(profile, secret, name, password, credentialData, allowDuplicate)
	}

	/** `restore`'s body: decode + validate the backup material UNLOCKED, then commit under the lock,
	 *  sealed under the password or the new profile's passkey answer. The post-release `finally`
	 *  here owns every buffer wipe — the locked body reports its allocations back through `scratch`
	 *  so a throw at ANY point still reaches this one cleanup site. */
	private async restoreProfile(
		profile: ProfileInfo,
		secret: RestoreSecret,
		name: string,
		password: string | undefined,
		credentialData: PasskeyCredentialData | undefined,
		allowDuplicate: boolean,
	): Promise<Restored<ProfileInfo>> {
		const material = await decodeRestoreMaterial(secret)
		// `scratch` is filled by the locked body — if seal throws mid-way, this finally
		// still zeros the already-allocated buffers.
		const scratch: RestoreScratch = { storedContext: false }
		let seal: RowSeal | undefined
		try {
			seal = await this.newRowSeal(password, credentialData)
			const commit: RestoreCommit = { profile, name, seal, material, allowDuplicate }
			return await this.runExclusive(() => this.commitRestoredProfileHoldingLock(commit, scratch))
		} finally {
			zeroize(material.master)
			zeroize(material.entropy)
			if (seal && "passhash" in seal) zeroize(seal.passhash)
			if (!scratch.storedContext) {
				zeroize(material.transferKey)
				zeroize(scratch.destinationDek)
			}
		}
	}

	/** The locked commit of a restore. Reports allocations back through `scratch` — the CALLER's
	 *  post-release finally does every wipe. Caller MUST hold the facade lock. */
	private async commitRestoredProfileHoldingLock(input: RestoreCommit, scratch: RestoreScratch): Promise<Restored<ProfileInfo>> {
		const { profile, name, seal, material, allowDuplicate } = input
		try {
			// Duplicate-phrase guard under the SAME lock as the commit (check→write
			// atomicity). The catch below RETHROWS the typed error so the UI's
			// confirm-retry can fire (restoreError flattening would dead-end it).
			const walletFingerprint = await this.assertNotDuplicateWallet(material.master, allowDuplicate)
			if ("credential" in seal) await this.assertPrfSaltUnusedHoldingLock(seal.credential.prfSalt)
			// CLONE DIVERGENCE: a FRESH destination DEK for the
			// new row — restoring A's backup beside a still-live A must not let the
			// clone's credential open keys A imports later. The backup's own key rows
			// stay usable via the source→destination rewrap context below.
			const sealDek = await this.sealSlotsUnder(seal, material.master, material.entropy)
			const destinationDek = generateImportedKeysDek()
			scratch.destinationDek = destinationDek
			const sealed = await sealDek(destinationDek)

			// The backup's id names this profile's storage keys, so only a generated-shaped one is kept.
			let id = isGeneratedProfileId(profile.id) ? profile.id : await this.repo.generateUniqueId()
			while ((await this.repo.contains(id)) || this.deletionState.isReserved(id)) {
				id = await this.repo.generateUniqueId()
			}
			// After the id loop, so the MAC binds the settled id. The caller's `finally` wipes the
			// material.
			const newProfile = await newRowFor({ id, name, walletFingerprint, ...sealed }, material.master, destinationDek)

			await this.writeMarkerThenRowHoldingLock(id, newProfile)
			// Before any slice is written: every slice restore of a sealed root seals under them.
			await this.fillRowKeysHoldingLock(newProfile, material.master)
			await this.markProfileFlagHoldingLock(profileImportedKey(id))

			this.emit("onProfileAdded", this.getProfileInfo(newProfile))

			// Stash the rewrap context — the map takes OWNERSHIP of both buffers
			// (restoreImportedKeys consumes; finalizeRestore/TTL sweep zeroize
			// leftovers).
			this.sweepStalePendingRestore(Date.now(), id)
			this.pendingDekRewraps.set(id, {
				sourceDek: material.transferKey,
				destinationDek,
				capturedAt: Date.now(),
			})
			scratch.storedContext = true

			// Late activation: do NOT open the session here. The popup
			// will call `finalizeRestore(id, password)` after restoring
			// all backup data (networks, accounts, etc.) to avoid
			// `app.vue:onActiveProfileChanged` racing the import with
			// auto-seeded defaults.
			return this.getProfileInfo(newProfile)
		} catch (err) {
			// Build restoreError INSIDE the locked callback so it runs before the
			// lock releases (withLock's finally) — toRestoreError may invoke a
			// custom err.toString().
			// The duplicate-phrase verdict must REACH the UI as its typed self
			// (confirm-retry), never flattened into a dead-end restoreError.
			if (err instanceof DuplicateWalletError) throw err
			return {
				...profile,
				restoreError: toRestoreError(err),
			}
		}
	}

	/**
	 * Late-activation step for the full-backup import flow. Opens the session
	 * for a profile previously created by `restore()`. Splitting restore +
	 * activate lets the caller restore all the backup's networks / accounts /
	 * etc. BEFORE `onActiveProfileChanged` fires — without this split,
	 * `app.vue`'s handler would call `getOrInitNetworks` + `ensureDefaultAccount`
	 * in parallel with the import and race the imported data.
	 *
	 * Re-derives the passhash from `password` (PBKDF2 cost paid again — acceptable for a one-time
	 * import flow).
	 *
	 * Idempotent in spirit: if the session is already active for this profile,
	 * skips the re-open (the no-op case after a second `finalizeRestore` call).
	 */
	public async finalizeRestore(id: string, password?: string, credentialData?: PasskeyCredentialData): Promise<FinalizedRestore> {
		await this.ensureInitialized()

		return this.runExclusive(async () => {
			const profile = await this.finalizeRestoreHoldingLock(id, password, credentialData)
			const fence = await this.captureExecutionFenceHoldingLock()
			if (fence.profileId !== id) throw new SessionEndedError()
			return { profile, fence: { ...fence, incarnation: this.workerId } }
		})
	}

	private async finalizeRestoreHoldingLock(
		id: string,
		password: string | undefined,
		credentialData: PasskeyCredentialData | undefined,
	): Promise<ProfileInfo> {
		// Finalize is the last reader of the restore's rewrap context for its id, so every path wipes
		// what it did not take: a leftover context is the empty-slice case (nothing consumed it). The
		// identity check spares an entry a later restore stashed after the lock's hold watchdog
		// released this call.
		const seenRewrap = this.pendingDekRewraps.get(id)
		try {
			// Sweep stale entries but never the id being finalized here.
			this.sweepStalePendingRestore(Date.now(), id)
			const profile = await this.repo.get(id)
			if (!profile) {
				throw new Error("Invalid profile id")
			}
			// A tombstoned profile (SW died mid-delete: row still present, id
			// reserved) must not open a session — it is being erased. Gate here as
			// well as at row-read so a delete that began mid-restore is caught.
			if (this.deletionState.isReserved(id)) {
				throw new Error("Invalid profile id")
			}
			if (classifyProfileRow(profile).kind === "retired") throw new RetiredProfileError()

			// Clear the restore-in-progress marker at ENTRY: being called at all
			// proves the storage-slice phase completed (the import flow only
			// finalizes after every slice restore). Clearing on entry — not on
			// session-open success — keeps finalize-throw survivors (a wrong
			// password) on their documented unlock-later recovery instead of
			// branding them torn.
			await this.restorePending.delete(id)

			// If the session is already active for this profile, treat as
			// no-op. Defensive against double-finalize.
			if (this.sessionManager.isActive(id)) {
				return this.getProfileInfo(profile)
			}
			// `restore` sealed the row under the credential handed back here: a row of another type was
			// edited in between.
			if (profile.type !== (credentialData ? "passkey" : "password")) {
				throw new Error("Profile type changed between restore and finalizeRestore")
			}
			return await this.finalizeOpenHoldingLock(id, profile, password, credentialData)
		} finally {
			if (this.pendingDekRewraps.get(id) === seenRewrap) this.pendingDekRewraps.drop(id)
		}
	}

	/** Finalize's open: re-open the row with the credential `restore` sealed it under (a password's
	 *  PBKDF2 paid again — acceptable for a one-time import flow; a passkey answer is the one the
	 *  restore used, with no second prompt), mirroring the unlocks' phase 3, with the full
	 *  degradation state machine at this open too (the row was minted by `restore()`, so a DEK/MAC
	 *  failure here means a tamper landed BETWEEN restore and finalize — skipping the MAC check would
	 *  hand a storage attacker a bearer-backed non-degraded session). Caller MUST hold the facade
	 *  lock. */
	private async finalizeOpenHoldingLock(
		id: string,
		profile: Profile,
		password: string | undefined,
		credentialData: PasskeyCredentialData | undefined,
	): Promise<ProfileInfo> {
		if (!credentialData && !password) {
			throw new Error("Password is required for password profile")
		}
		const key = await this.slotKey(password, credentialData)
		const opened = await this.openSlots(profile, key)
		if (!opened) {
			throw this.notOpened(key, () => new InvalidPasswordError())
		}
		let dek: ImportedKeysDek | null = null
		try {
			// Pairing check before the session opens: a tamper between restore()
			// and finalize must not open a session whose recovery phrase is a lie. Inside
			// the try so a pairing throw still wipes the unsealed buffers.
			await this.assertEntropyMasterPair(opened.secret, opened.entropy)
			dek = await this.unsealTrustedDekHoldingLock(id, profile, opened, "finalizeRestore")
			return await this.openAndWarnIfDegradedHoldingLock(profile, opened.secret, dek)
		} finally {
			// zero buffers after sessionManager has copied.
			opened.wipe()
			zeroize(dek)
		}
	}
}
