import { Fr } from "@aztec-labs/foundation/curves/bn254"
import type { IService, ServiceCollection } from "@/wallet/base"
import type { ILogger } from "@/wallet/logger"
import { LogLevel } from "@/wallet/logger"
import { type Account, AccountService, AccountType } from "@/wallet/services/account/service"
import { NetworkService } from "@/wallet/services/network/service"
import { ProfileService } from "@/wallet/services/profile/service"
import { type ClassifiedAccount, classifyChains, type UnclassifiableMismatch } from "@/wallet/services/stale-network/classify"
import { StaleNetworkRepository } from "@/wallet/services/stale-network/repository"
import type { StaleEntry } from "@/wallet/services/stale-network/types"
import { AccountAddressInconsistencyError } from "@nulo/extension-messaging/errors"
import { NuloAccount, V6_REGIME } from "@nulo/aztec-runtime/account"
import { deriveAccountSeed, type MasterSecretBytes } from "@nulo/wallet-crypto"
import type { BrowserApi, StorageArea } from "@nulo/wallet-core/ports"
import { AccountIntegrityBlockedRepository, AccountIntegrityVerifiedStampRepository } from "./blocked-repository"
import { accountSetDigest } from "./types"
import type { AccountIntegrityBlocked, AccountIntegrityDelegate, AccountRuntimeMismatchDelegate } from "./types"

declare const __VERSION__: string
const walletVersion = (): string => (typeof __VERSION__ === "undefined" ? "unknown" : __VERSION__)

export const ACCOUNT_INTEGRITY_COORDINATOR_NAME = "account-integrity-coordinator"

/** Injectable for unit tests (jsdom cannot run bb.js poseidon); production always uses the REAL
 *  frozen path — the SHARED `deriveAccountSeed` formula and `NuloAccount.new`, never a local
 *  re-implementation (a stale duplicate here is the drift class that bricks profiles at unlock —
 *  the real default is additionally pinned by a node-env test in aztec-runtime). */
export type DeriveAddress = (master: Fr, account: { l1ChainId: number; type: number; index: number }) => Promise<string>

/** How a verdict reaches storage: directly when the caller holds the profile facade lock, or
 *  through ProfileService's still-exists guard on the off-lock paths. `verdict` answers true when
 *  the write landed or the profile is gone, false when the account set moved under it. */
type VerdictWriters = {
	block: (record: AccountIntegrityBlocked) => Promise<void>
	verdict: (write: () => Promise<boolean>) => Promise<boolean>
}

/** The account set changed twice while it was being verified; nothing was written. */
export const ERR_ACCOUNTS_CHANGED = "ERR_ACCOUNTS_CHANGED"

/**
 * AccountIntegrityCoordinator — the background owner of the address-freeze runtime check.
 *
 * Started LAST (declares dependencies on the services it drives), then registers itself as the
 * pre-session-open integrity delegate of ProfileService and the operation-time classifier of
 * AccountService, and runs a one-shot boot verification of any silently-rehydrated session.
 * (Before it starts, AccountService's operation-time path blocks the profile by itself, so a
 * mismatch in the startup window is still fail-closed.)
 * A mismatch means this build derives different addresses than the profile's stored accounts —
 * a build that moved one chain's identity or derivation, or tampered rows. A mismatch confined to
 * one chain quarantines that chain through the stale-network record and keeps the session; any
 * other withholds/closes the session, persists a blocking record that survives SW restarts (read
 * raw by the popup barrier), and surfaces the typed error. The check is pure KDF + descriptor +
 * artifact — no PXE, no node — so it cannot produce transient false positives.
 */
export class AccountIntegrityCoordinator implements IService, AccountIntegrityDelegate, AccountRuntimeMismatchDelegate {
	public static readonly name = ACCOUNT_INTEGRITY_COORDINATOR_NAME
	public readonly name = ACCOUNT_INTEGRITY_COORDINATOR_NAME
	public readonly dependencies = [ProfileService.name, AccountService.name, NetworkService.name] as const

	private profiles!: ProfileService
	private accounts!: AccountService
	private networks!: NetworkService
	private readonly blocked: AccountIntegrityBlockedRepository
	private readonly stamps: AccountIntegrityVerifiedStampRepository
	private readonly staleNetworks: StaleNetworkRepository

	public constructor(
		private readonly logger: ILogger,
		browserApi?: BrowserApi,
		private readonly deriveAddress: DeriveAddress = async (master, account) => {
			// The ONE shared formula (NULO-ACCOUNT-KDF v2), reading the row-carried l1ChainId —
			// self-contained, so this pre-session-open path needs no network lookup.
			const secret = await deriveAccountSeed(master, account.l1ChainId, account.type, account.index)
			return (await NuloAccount.new(secret, logger, ACCOUNT_INTEGRITY_COORDINATOR_NAME)).address.toString()
		},
	) {
		const storage = (browserApi?.storage.local ?? chrome.storage.local) as StorageArea
		this.blocked = new AccountIntegrityBlockedRepository(storage)
		this.stamps = new AccountIntegrityVerifiedStampRepository(storage)
		this.staleNetworks = new StaleNetworkRepository(storage)
	}

	public async start(services: ServiceCollection): Promise<void> {
		this.profiles = services.get(ProfileService.name)
		this.accounts = services.get(AccountService.name)
		this.networks = services.get(NetworkService.name)
		this.profiles.setIntegrityDelegate(this)
		this.accounts.setRuntimeMismatchDelegate(this)
		// The stamp is keyed by (walletVersion, accountSetDigest) — the digest is recomputed from
		// STORAGE at both stamp-time and check-time, so an account added/restored/removed after a
		// green stamp deterministically changes the digest and forces a re-verify. This is
		// event-free ON PURPOSE (a prior `onAccountAdded` subscription had race gaps: the last-phase
		// subscription missed earlier mutations, `restore()` writes rows without emitting, and an
		// event-driven clear could lose to a concurrent stamp write).
		// The one activation the per-open chokepoint cannot see: an extension UPDATE rehydrates the
		// previous session silently, so the first boot of a NEW build re-verifies it here (once per
		// (profile, walletVersion) — the stamp keeps every later SW wake free). Fire-and-forget ON
		// PURPOSE: re-deriving N accounts with a cold bb WASM can take tens of seconds, and doing it
		// inside `services.start()` would stall EVERY service RPC past the popup's boot budget. The
		// verdict still lands mid-flight (mismatch → durable record + session close), so the exposed
		// window stays bounded to the verify's own duration.
		this.bootVerification = this.verifyRestoredSessionOnce().catch((error) => {
			this.logger.log(this.name, LogLevel.Error, "boot integrity verification failed", { error })
		})
	}

	/** The in-flight boot verification — observable (tests await it); startup never does. */
	public bootVerification: Promise<void> = Promise.resolve()

	private async verifyRestoredSessionOnce(): Promise<void> {
		const active = await this.profiles.getActiveProfile()
		if (!active) return
		const rows = await this.accounts.getAccountsRaw(active.id)
		const stamp = await this.stamps.get(active.id)
		// Skip re-derivation ONLY when the build AND the account set both match the last green stamp.
		// A "unknown" version (dev/test builds with no injected __VERSION__) NEVER matches — two
		// different dev builds would otherwise share the "unknown" key and skip a real re-derivation.
		if (
			stamp?.walletVersion === walletVersion() &&
			walletVersion() !== "unknown" &&
			stamp.accountSetDigest === accountSetDigest(rows)
		) {
			return
		}
		let master: Fr
		try {
			master = await this.profiles.getProfileSecret(active.id)
		} catch {
			// Locked/raced away between the getActiveProfile read and here — nothing rehydrated to
			// verify; the next real open goes through the chokepoint.
			return
		}
		try {
			// OFF-LOCK path: persist the block through ProfileService's locked, still-exists-guarded
			// writer, so a `deleteProfile` racing this unlocked re-derivation can't be followed by an
			// orphan block write (its under-lock block-clear would otherwise be undone, leaving an
			// unclearable record for a deleted profile).
			const writers: VerdictWriters = {
				block: (r) => this.profiles.persistIntegrityBlockIfLive(r),
				verdict: async (write) => (await this.profiles.persistIntegrityVerdictIfLive(active.id, write)) ?? true,
			}
			await this.verifyProfile(active.id, master, writers, rows)
		} catch (error) {
			if (error instanceof AccountAddressInconsistencyError) {
				// Close ONLY the profile we verified — a different profile may have become active
				// during the (slow, unlocked) verification.
				await this.profiles.lockProfileIfActive(active.id)
				return
			}
			throw error
		}
	}

	/** See `AccountIntegrityDelegate.verifyBeforeSessionOpen`. Runs INSIDE ProfileService's facade
	 *  lock (called from `openSessionVerified`), so a concurrent delete can't interleave — the block
	 *  is written directly. */
	public async verifyBeforeSessionOpen(profileId: string, masterSecret: MasterSecretBytes): Promise<void> {
		const writers: VerdictWriters = { block: (r) => this.blocked.set(r), verdict: (write) => write() }
		await this.verifyProfile(profileId, Fr.fromBuffer(Buffer.from(masterSecret)), writers)
	}

	/** See `AccountRuntimeMismatchDelegate`. Off the facade lock, so the merge goes through
	 *  ProfileService's still-exists guard. */
	public async classifyRuntimeMismatch(profileId: string, chainId: number): Promise<boolean> {
		const master = await this.profiles.getProfileSecret(profileId)
		const rows = await this.accounts.getAccountsRaw(profileId)
		const networks = (await this.networks.getNetworksRaw(profileId)).filter((n) => n.chainId === chainId)
		const onChain = rows.filter((r) => r.chainId === chainId)
		const { entries, unclassifiable } = classifyChains(networks, await this.deriveAll(master, onChain, new Map()))
		const entry = entries.find((e) => e.chainId === chainId && e.addressesMoved)
		if (unclassifiable || !entry) return false
		const current = async () => accountSetDigest(await this.accounts.getAccountsRaw(profileId))
		const merged = await this.profiles.persistIntegrityVerdictIfLive(profileId, () =>
			this.staleNetworks.mergeEntry(profileId, entry, accountSetDigest(rows), current),
		)
		// The accounts changed since the read (a reset finished, say): the verdict is obsolete, so
		// this operation is refused and nothing is written, never a profile block.
		if (merged === false) return true
		if (merged) this.logger.log(this.name, LogLevel.Warn, "chain quarantined at operation time", { chainId })
		return merged === true
	}

	/**
	 * Re-derive every stored account, classify each chain, and either persist the profile block
	 * and throw, or write the stale-network record and heal (clear the block, stamp walletVersion +
	 * the digest of the exact rows verified). The record is written only while the account set
	 * still has the digest it was classified from; one change re-reads and re-classifies, a second
	 * refuses with nothing cleared or stamped. `rows` may reuse the boot path's read.
	 */
	private async verifyProfile(profileId: string, master: Fr, writers: VerdictWriters, rows?: Account[]): Promise<void> {
		const derived = new Map<string, string>()
		for (let attempt = 0; attempt < 2; attempt++) {
			const accountRows = attempt === 0 && rows ? rows : await this.accounts.getAccountsRaw(profileId)
			const networks = await this.networks.getNetworksRaw(profileId)
			const { entries, unclassifiable } = classifyChains(networks, await this.deriveAll(master, accountRows, derived))
			if (unclassifiable) await this.blockProfile(profileId, unclassifiable, writers.block)
			const digest = accountSetDigest(accountRows)
			if (await writers.verdict(() => this.writeVerdict(profileId, digest, entries))) return
		}
		throw new Error(`${ERR_ACCOUNTS_CHANGED}: the accounts changed while Nulo checked them. Try again.`)
	}

	/** Derives each Nulo_v1 row once per verification; `derived` memoizes across the retry. Only
	 *  Nulo_v1 rows have a derivation; an unknown future type is rejected at use by AccountService. */
	private async deriveAll(master: Fr, rows: Account[], derived: Map<string, string>): Promise<ClassifiedAccount[]> {
		const out: ClassifiedAccount[] = []
		for (const row of rows) {
			const classified: ClassifiedAccount = { chainId: row.chainId, l1ChainId: row.l1ChainId, index: row.index, address: row.address }
			if (row.type === AccountType.Nulo_v1) {
				const key = `${row.l1ChainId}:${row.type}:${row.index}`
				let address = derived.get(key)
				if (address === undefined) {
					address = await this.deriveAddress(master, row)
					derived.set(key, address)
				}
				classified.derivedAddress = address
			}
			out.push(classified)
		}
		return out
	}

	private async writeVerdict(profileId: string, digest: string, entries: StaleEntry[]): Promise<boolean> {
		const current = async () => accountSetDigest(await this.accounts.getAccountsRaw(profileId))
		if (!(await this.staleNetworks.compareAndSetRecord({ profileId, accountSetDigest: digest, entries }, current))) return false
		await this.blocked.clear(profileId)
		await this.stamps.set(profileId, { walletVersion: walletVersion(), accountSetDigest: digest })
		return true
	}

	/** Persists the block best-effort and ALWAYS throws the typed error afterward, so the caller's
	 *  close-on-`AccountAddressInconsistencyError` still runs even if the write failed. */
	private async blockProfile(
		profileId: string,
		mismatch: UnclassifiableMismatch,
		persistBlock: (record: AccountIntegrityBlocked) => Promise<void>,
	): Promise<never> {
		const record: AccountIntegrityBlocked = {
			profileId,
			chainId: mismatch.chainId,
			accountIndex: mismatch.accountIndex,
			storedAddress: mismatch.storedAddress,
			derivedAddress: mismatch.derivedAddress,
			regimeId: V6_REGIME.id,
			walletVersion: walletVersion(),
			detectedAt: Date.now(),
		}
		this.logger.log(
			this.name,
			LogLevel.Error,
			"account address integrity mismatch — session withheld",
			`profile=${profileId} chain=${mismatch.chainId} index=${mismatch.accountIndex}`,
		)
		try {
			await persistBlock(record)
		} catch (writeError) {
			this.logger.log(this.name, LogLevel.Error, "integrity block persist failed", { error: writeError })
		}
		throw new AccountAddressInconsistencyError(undefined, {
			profileId,
			chainId: mismatch.chainId,
			accountIndex: mismatch.accountIndex,
		})
	}
}
