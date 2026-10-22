// Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0.
import { TxHash, type TxReceipt } from "@aztec-labs/stdlib/tx"
import { assertRestoreEpoch, captureRestoreEpochs, requireRestoreProfileId } from "@/wallet/services/restore-fence"
import { restoreRows } from "@/wallet/services/restore-rows"
import type { Restored, ServiceCollection, ServiceSpec } from "@/wallet/base"
import { Service, defineRpcMethods } from "@nulo/extension-messaging/background"
import type { ILogger } from "@/wallet/logger"
import { AccountService, type Account } from "@/wallet/services/account/service"
import { accountScopeKey } from "@/wallet/services/account/spec"
import { NetworkService } from "@/wallet/services/network/service"
import { ProfileService } from "@/wallet/services/profile/service"
import type { ExecutionFence, ProfileDeletionState } from "@/wallet/services/profile/profile-deletion-state"
import { requireActiveProfile } from "@/wallet/services/profile/require-active-profile"
import { StepContent, type WrappedTask } from "@/wallet/services/task/service"
import { purgeMalformedRows, purgeRows } from "@/wallet/services/purge-rows"
import type { Located, SealedEntityStorage } from "@/wallet/storage/sealed-entity-storage"
import { sealedEntityStorage } from "@/wallet/storage/stores"
import { Lock, sleep } from "@/wallet/utils"
import type { PriorityLevel } from "@nulo/wallet-bridge"
import { getErrorMessage } from "@nulo/wallet-core/utils"
import { EventHandler } from "@nulo/wallet-core/utils"
import type { BrowserApi } from "@nulo/wallet-core/ports"
import {
	type FeeChoice,
	type Tx,
	type TxGasDetails,
	TRANSACTION_SERVICE_NAME,
	type LocalTxOrigin,
	type TxCall,
	TxStatus,
	type Methods,
	type Events,
	TxSchema,
	TxConfirmationTimeoutError,
} from "./spec"
import { FINALITY_READ_INTERVAL_MS, proveFinal } from "./inclusion"
import { MINED_STATUSES, executionResultFromReceipt, txStatusFromReceipt } from "./receipt-status"
import type { AccountFeePaymentMethodOptions } from "@aztec-labs/entrypoints/account"

export * from "./spec"

/**
 * DROPPED-receipt debounce. The node answers DROPPED for any tx hash it does
 * not know — including a just-submitted tx that hasn't reached the queried
 * replica yet, so behind a load-balanced RPC the submitting `sendTx` and the
 * receipt poll can hit different nodes and a healthy tx transiently reads as
 * dropped (aztec.js guards its own `waitForTx` against exactly this via
 * `ignoreDroppedReceiptsFor`). A DROPPED answer is therefore only accepted as
 * terminal once the tx is older than the grace window AND was seen dropped on
 * enough consecutive polls. Observations made DURING the grace window count
 * toward the streak on purpose: a tx that read dropped consistently for the
 * whole window finalizes right at the boundary — the sustained window itself
 * is the evidence, not three post-window ticks.
 */
export const DROPPED_GRACE_MS = 60_000
export const DROPPED_CONFIRMATIONS = 3
/** After a tx IS marked Dropped, keep re-checking it at a slow cadence for this
 *  long — a late mine (the receipt turning up mined after all) resurrects the
 *  row instead of leaving a confirmed tx labeled failed forever. */
export const DROPPED_RESURRECTION_WINDOW_MS = 30 * 60_000
export const DROPPED_RECHECK_INTERVAL_MS = 15_000

/** One activity row as an execution records it after the send. */
export type AddTransactionInput = {
	origin: LocalTxOrigin
	chainId: number
	account: string
	calls: TxCall[]
	nonce: string
	feePaymentMethod: AccountFeePaymentMethodOptions
	hash: string
	submittedEndpointUrl: string | undefined
	estimatedFee?: string
	gasDetails?: TxGasDetails
	/** See {@link Tx.feeSpender}. */
	feeSpender?: string
	/** See {@link Tx.priorityLevel}. */
	priorityLevel?: PriorityLevel
	/** See {@link Tx.feeChoice}. */
	feeChoice?: FeeChoice
	/** The execution's own fence: the row's profile, and the deletion epoch its write is checked against. */
	fence: ExecutionFence
	/** Owning network row id. Together with the fence's profile this is the
	 *  row's activity scope — without it, two profiles holding the same
	 *  address on one chain are indistinguishable in history. */
	networkId?: string
}

export class TransactionService extends Service<Methods, Events> implements ServiceSpec<Methods, Events> {
	protected readonly rpcMethods = defineRpcMethods<Methods>()("getTransactions", "getTransaction")
	public static name = TRANSACTION_SERVICE_NAME

	public readonly onTransactionAdded = new EventHandler<Tx>()
	public readonly onTransactionUpdated = new EventHandler<Tx>()
	public readonly onTransactionDeleted = new EventHandler<Tx>()

	/**
	 * Sealed at rest, keyed per profile: a row's storage id is its profile's keyed hash of the tx
	 * hash, so no key names a hash and two profiles holding one hash hold two rows. A row with no
	 * `profileId` (written by older restores) stays plaintext under its hash until a profile is
	 * shown to be its only possible owner.
	 */
	private readonly txs: SealedEntityStorage<Tx>
	/** Every watch below is keyed {@link watchKey}: a row's identity is its profile and its hash. */
	private readonly pending = new Map<string, Tx>()
	// Consecutive-DROPPED counter per pending hash. In-memory on purpose: a SW
	// restart resets the streak, which only makes the debounce MORE conservative.
	private readonly droppedStreaks = new Map<string, number>()
	// Resurrection watch: txs marked Dropped THIS session, re-checked at a slow
	// cadence until the window expires. Deliberately never re-armed from storage
	// on init — same reasoning as `restore`'s refusal of a Pending row: a restored/aged row's
	// `submittedEndpointUrl` must not get the sync worker dialing it again.
	private readonly droppedWatch = new Map<string, Tx>()
	private readonly droppedNextCheckAt = new Map<string, number>()
	// Mined rows below Finalized, read until the finalized chain proves their block final or
	// pruned. Re-armed on init only from the marker this worker sets (see `Tx.awaitingFinality`).
	private readonly finalityWatch = new Map<string, Tx>()
	private readonly finalityNextCheckAt = new Map<string, number>()
	// Serializes restore's read-modify-write (contains → set) so two concurrent
	// imports can't both pass the create-only check for the same hash.
	private readonly lock = new Lock()

	private profileService: ProfileService = null!
	private accountService: AccountService = null!
	private networkService: NetworkService = null!
	private deletionState: ProfileDeletionState = null!

	public constructor(
		logger: ILogger,
		browserApi: BrowserApi,
		private readonly finalityReadMs: number = FINALITY_READ_INTERVAL_MS,
	) {
		super(TRANSACTION_SERVICE_NAME, logger)
		this.txs = sealedEntityStorage("txs", browserApi.storage.local, (profileId) => this.profileService.rowKeys(profileId))
	}

	protected async init(services: ServiceCollection) {
		this.profileService = services.get(ProfileService.name)
		this.accountService = services.get(AccountService.name)
		this.networkService = services.get(NetworkService.name)
		// The SHARED deletion state — addTransaction asserts an execution's captured
		// epoch is still current before writing (D13).
		this.deletionState = this.profileService.getDeletionState()

		// Tx cleanup is account-scoped, never chain-wide: a chainId-only purge would erase every
		// profile's rows on a shared chain. `deleteNetwork` reaches it through `onAccountDeleted`
		// (best-effort), profile deletion through the coordinator's awaited `purgeForAccounts`, and
		// `reconcileImportedAccounts` through the awaited subscriber below, so a restore that drops a
		// keyless account has purged its rows before the import finalizes.
		this.accountService.onAccountDeleted.add(this.onAccountDeleted)
		this.accountService.registerAccountPurgeSubscriber(async (profileId, scopes) => {
			for (const { chainId, address } of scopes) await this.purgeForAccounts([address], profileId, chainId)
		})

		// A profile's rows are armed once its keys are here: a plaintext row of a profile with none
		// would be polled every tick, and its sealed commit refused, for the life of the worker.
		for (const tx of await this.txs.getValues()) {
			if (tx.profileId === undefined || this.profileService.rowKeys(tx.profileId)) this.arm(tx)
		}
		this.profileService.onRowKeysReady.add((profileId) => void this.onRowKeysReady(profileId))

		this.runWorker()
	}

	/** Re-armed only for a Pending row or one carrying the finality marker: a restored row's
	 *  `submittedEndpointUrl` is backup-controlled, so the worker never dials it for a row it did not
	 *  transition itself (`restore` refuses Pending and strips the marker). `ambiguous` rows stay
	 *  out, or a restart would poll them against whichever profile is now active. A row already
	 *  watched keeps its watch, whose object an in-flight poll is fenced on. */
	private arm(tx: Tx): void {
		const key = watchKey(tx)
		if (tx.ambiguous || this.pending.has(key) || this.finalityWatch.has(key) || this.droppedWatch.has(key)) return
		if (tx.status === TxStatus.Pending) this.pending.set(key, tx)
		else if (tx.awaitingFinality) this.finalityWatch.set(key, tx)
	}

	/** Seals the profile's plaintext rows, adopts the ownerless ones it alone can own, then arms its
	 *  rows. Each step runs under the tx lock the purges hold; the adoption and the arming check the
	 *  deletion epoch captured before them, so neither arms anything once a deletion overtook them. */
	private async onRowKeysReady(profileId: string): Promise<void> {
		const epoch = this.deletionState.capture(profileId)
		const live = () => !this.deletionState.isReserved(profileId) && this.deletionState.isCurrent(profileId, epoch)
		try {
			await this.txs.sealLegacy(profileId, (fn) => this.lock.withLock(fn))
			await this.adoptOwnerless(profileId, live)
			await this.lock.withLock(async () => {
				if (!live()) return
				for (const tx of await this.txs.getValues()) if (tx.profileId === profileId) this.arm(tx)
			})
		} catch (error) {
			this.logWarn("sealing or arming the profile's transactions failed; the next unlock retries", { error })
		}
	}

	/** An ownerless row becomes the profile's when the profile holds its account on its chain and no
	 *  other profile can own it. It is re-armed under its new identity: the old watch's object names
	 *  no profile, and a commit from it would write the plaintext row back. */
	private async adoptOwnerless(profileId: string, live: () => boolean): Promise<void> {
		const owned = new Set((await this.accountService.getAccountsRaw(profileId)).map((a) => accountScopeKey(a.chainId, a.address)))
		for (const { located, text } of await this.ownerlessRows()) {
			const row = parseOwnerlessTx(text)
			if (!row || row.ambiguous || !owned.has(accountScopeKey(row.chainId, row.account))) continue
			await this.lock.withLock(async () => {
				if (!live() || (await this.ownership([row.account], profileId)) !== "sole") return
				if (!(await this.txs.adoptOwnerless(located.naturalId, text, profileId))) return
				this.unwatch(watchKey(row))
				const adopted = await this.txs.get(located.naturalId, profileId)
				if (adopted) this.arm(adopted)
			})
		}
	}

	private async ownerlessRows(): Promise<Array<{ located: Located; text: string }>> {
		const raw = new Map(await this.txs.rawStringEntries())
		return (await this.txs.entries()).flatMap(({ located }) => {
			const text = raw.get(located.storageId)
			return !located.sealed && located.owner === undefined && text !== undefined ? [{ located, text }] : []
		})
	}

	/** The active profile's rows of `account` (see {@link transactionsOf}); locked, none. */
	public async getTransactions(account: string): Promise<Tx[]> {
		const active = await this.activeProfileId()
		return active ? this.transactionsOf(account, active) : []
	}

	/** The active profile's row of `hash`, or its ownerless one. */
	public async getTransaction(hash: string): Promise<Tx> {
		const active = await this.activeProfileId()
		const tx = active ? await this.txs.get(hash, active) : undefined
		if (!tx) {
			throw new Error("unknown hash")
		}
		return tx
	}

	/** The rows of `account` that `profileId` reads: its own, and the ownerless ones it may own. A
	 *  read that named no profile would answer with whichever profiles' keys this worker holds. */
	public async transactionsOf(account: string, profileId: string): Promise<Tx[]> {
		return (await this.txs.getValues()).filter((x) => x.account === account && (x.profileId ?? profileId) === profileId)
	}

	private async activeProfileId(): Promise<string | undefined> {
		try {
			return (await this.profileService.getActiveProfile())?.id
		} catch {
			return undefined
		}
	}

	/** Synchronous read of in-memory pending txs for an account. Used by
	 *  the fee-estimate-reuse cache to detect that a new pending tx
	 *  appeared between estimate and confirm — that's a signal to
	 *  rebuild rather than reuse, since concurrent in-flight private
	 *  transfers can consume the same notes. */
	public getPendingForAccount(account: string): Tx[] {
		const out: Tx[] = []
		for (const tx of this.pending.values()) {
			if (tx.account === account) out.push(tx)
		}
		return out
	}

	public async addTransaction(input: AddTransactionInput): Promise<Tx> {
		const {
			origin,
			chainId,
			account,
			calls,
			nonce,
			feePaymentMethod,
			hash,
			submittedEndpointUrl,
			estimatedFee,
			gasDetails,
			feeSpender,
			priorityLevel,
			feeChoice,
			fence,
			networkId,
		} = input
		// Under the tx lock: serialize the dup-check + write against restore's
		// create-only check + the coordinator's purge.
		return await this.lock.withLock(async () => {
			// An execution captured {profileId, epoch} when it was authorized.
			// If a deletion of that profile has since begun (epoch advanced) OR the
			// owning account row is already purged/re-owned, reject — a completing
			// prove must not recreate a pending tx after its profile was deleted.
			// Both checks are bound to the CAPTURED profileId: a successor that reused
			// the deterministic address owns a DIFFERENT profileId, so getAccount
			// returns undefined here even after the epoch is released.
			this.deletionState.assertCurrent(fence.profileId, fence.epoch)
			const owner = await this.accountService.getAccount(fence.profileId, chainId, account)
			if (!owner) throw new Error("stale execution owner — account no longer exists")
			if (await this.txs.get(hash, fence.profileId)) {
				throw new Error("duplicated hash")
			}
			const now = Date.now()
			// `submittedEndpointUrl` is resolved by the EXECUTOR from the network it
			// actually built+submitted against (captured before prove/send), then
			// passed in. It is NOT re-derived here from active-profile state: a TTL
			// auto-lock or profile switch DURING the (slow) prove would make an
			// active-profile lookup throw or resolve the wrong profile's endpoint,
			// recording a wrong/undefined URL — which at poll time routes the receipt
			// fetch to the active profile's RPC (a cross-profile leak). See
			// `NetworkService.getNodeForUrl`.
			const tx: Tx = {
				origin,
				chainId,
				profileId: fence.profileId,
				networkId,
				account,
				calls,
				nonce,
				feePaymentMethod,
				hash,
				createdAt: now,
				updatedAt: now,
				status: TxStatus.Pending,
				estimatedFee,
				gasDetails,
				...(feeSpender ? { feeSpender } : {}),
				...(priorityLevel ? { priorityLevel } : {}),
				...(feeChoice ? { feeChoice } : {}),
				submittedEndpointUrl,
			}
			// Sealed first, then the epoch checked again and the row dispatched with no await between.
			const write = await this.txs.prepare(tx.hash, tx)
			this.deletionState.assertCurrent(fence.profileId, fence.epoch)
			await write.commit()
			this.emit("onTransactionAdded", tx)
			this.pending.set(watchKey(tx), tx)
			return tx
		})
	}

	/**
	 * Poll until `txHash` leaves the pending queue (submitted — NOT proven; see
	 * the callers' `waitForTxProven` for public-effect visibility), bounded by
	 * `timeoutMs`. A locked wallet stalls the sync worker indefinitely, so an
	 * unbounded wait spun for the whole lock period holding its task open —
	 * which also blocked the task tree's GC (roots need `finishedAt`).
	 *
	 * Exit contract (each settles the subtask at most once; task-service
	 * throws are swallowed — the registry can be cleared mid-wait by a
	 * profile switch, and the wait's outcome must not be replaced by a
	 * bookkeeping error): drained → complete; timeout → fail + typed
	 * {@link TxConfirmationTimeoutError} (the tx may still mine — the copy
	 * says "not confirmed", never "failed").
	 */
	public async waitForTx(txHash: string, profileId: string, parentTask?: WrappedTask, timeoutMs = 120_000) {
		let waitForTxTask: WrappedTask | undefined
		try {
			waitForTxTask = parentTask?.startSubtask(new StepContent("Waiting for transaction"))
		} catch {
			// A stale/cleared parent must not abort the wait — the wait is the
			// job; the subtask is progress decoration.
		}
		let settled = false
		const settle = (outcome: "complete" | "fail", message?: string): void => {
			if (settled) return
			settled = true
			try {
				if (!waitForTxTask?.exists) return
				if (outcome === "complete") waitForTxTask.complete()
				else waitForTxTask.fail(new Error(message ?? "wait failed"))
			} catch {
				// Task bookkeeping must never replace the wait's outcome.
			}
		}
		const deadline = Date.now() + timeoutMs
		try {
			const key = watchKey({ profileId, hash: txHash })
			while (this.pending.has(key)) {
				if (Date.now() >= deadline) {
					const message = `Transaction not confirmed within ${Math.round(timeoutMs / 1000)}s — it may still complete`
					settle("fail", message)
					throw new TxConfirmationTimeoutError(message)
				}
				await sleep(100)
			}
			settle("complete")
		} catch (err) {
			settle("fail", getErrorMessage(err))
			throw err
		}
	}

	private readonly onAccountDeleted = async (account: Account) => {
		// Chain-scoped: an address is the same on every chain with one L1, and deleting an account
		// on one chain must keep its history on the others.
		await this.purgeForAccounts([account.address], account.profileId, account.chainId)
	}

	/**
	 * Whether `profileId` is the only profile holding any of `addresses`.
	 *
	 * Decides the fate of rows written before transactions carried a profile:
	 * with a single owner they are unambiguously this profile's, so deletion is
	 * safe; with more than one they could belong to either, and removing them
	 * would destroy the surviving profile's history. `unknown` while another
	 * profile's account row cannot be read: an owner it hides would read as none.
	 */
	private async ownership(addresses: readonly string[], profileId: string): Promise<"sole" | "shared" | "unknown"> {
		const owners = new Set<string>()
		for (const address of addresses) {
			for (const account of await this.accountService.getAccountsByAddress(address)) {
				owners.add(account.profileId)
			}
		}
		owners.delete(profileId)
		if (owners.size > 0) return "shared"
		return (await this.accountService.hasUnreadAccountsBesides(profileId)) ? "unknown" : "sole"
	}

	/** Awaited tx purge for a SET of accounts — called by the deletion coordinator
	 *  with the tombstone's authoritative address snapshot. Runs under
	 *  the tx lock; idempotent. `onAccountDeleted` delegates here so the single-
	 *  account (deleteNetwork chain-purge) path shares one implementation. `chainId` limits the
	 *  purge to that chain's rows. */
	public async purgeForAccounts(addresses: readonly string[], profileId?: string, chainId?: number): Promise<void> {
		await this.ensureInitialized()
		const set = new Set(addresses)
		const onChain = (rowChainId: unknown) => chainId === undefined || rowChainId === chainId
		await this.lock.withLock(async () => {
			// Two profiles built from one mnemonic own the same address, so an
			// address-only match deletes the OTHER profile's history too. When the
			// caller knows whose rows these are, a scoped row must match that
			// profile; a row that names no profile is only safe to remove when this
			// is the address's sole owner, and is otherwise left alone.
			const owner = profileId !== undefined ? await this.ownership(addresses, profileId) : "sole"
			const all = await this.txs.entries()
			const doomed = all.filter(({ row: x }) => {
				if (!set.has(x.account) || !onChain(x.chainId)) return false
				if (profileId === undefined) return true
				if (x.profileId !== undefined) return x.profileId === profileId
				return owner === "sole"
			})
			// An unscoped row shared with another profile is neither deleted (that
			// would destroy the survivor's history) nor left plain, since deleting
			// this profile makes the survivor the only owner and the row would
			// silently become theirs. Mark it instead, permanently. While an owner
			// cannot be read, the row is left as it is.
			if (profileId !== undefined && owner === "shared") {
				for (const { row: tx } of all) {
					if (!set.has(tx.account) || !onChain(tx.chainId) || tx.profileId !== undefined || tx.ambiguous) continue
					// A marked row must leave every watch: one left watched would keep
					// being polled AND let a later write (built from the pre-mark
					// in-memory object) silently erase the `ambiguous` flag.
					this.unwatch(watchKey(tx))
					await this.txs.set(tx.hash, { ...tx, ambiguous: true })
				}
			}
			// A row may sit in both forms while its plaintext twin awaits removal: both go, one event.
			await purgeRows(
				groupByIdentity(doomed),
				async ({ row, storageIds }) => {
					this.unwatch(watchKey(row))
					for (const storageId of storageIds) await this.txs.deleteStorageId(storageId)
				},
				({ row }) => this.emit("onTransactionDeleted", row),
			)
			// Raw second pass, same lock hold, mirroring the typed rules —
			// a malformed row scoped to another profile is left; an UNSCOPED
			// malformed row is deleted only under sole ownership (it cannot be
			// marked ambiguous like a typed row — rewriting bytes the codec cannot
			// read would launder garbage into a "valid" write — so the non-sole
			// case leaves it, fail-closed and codec-hidden as before). An envelope
			// names no account, so this pass never matches one: a profile's
			// deletion removes its unopened sealed rows by the envelope's profile.
			await purgeMalformedRows(
				{
					rawStringEntries: () => this.txs.rawStringEntries(),
					rawValue: (id) => this.txs.rawValue(id),
					delete: (id) => this.txs.deleteStorageId(id),
				},
				(raw) => {
					if (typeof raw.account !== "string" || !set.has(raw.account) || !onChain(raw.chainId)) return false
					if (profileId === undefined) return true
					if (raw.profileId !== undefined) return raw.profileId === profileId
					return owner === "sole"
				},
				(id) => this.logDebug(`purged malformed tx row ${id}`),
			)
		})
	}

	private unwatch(key: string): void {
		this.pending.delete(key)
		this.droppedStreaks.delete(key)
		this.droppedWatch.delete(key)
		this.droppedNextCheckAt.delete(key)
		this.finalityWatch.delete(key)
		this.finalityNextCheckAt.delete(key)
	}

	private async runWorker() {
		while (true) {
			const due = [...this.pending.values(), ...this.collectDroppedDue()]
			const finalityDue = this.collectFinalityDue()
			if (due.length || finalityDue.length) {
				const activeProfile = await this.profileService.getActiveProfile()
				if (activeProfile) {
					try {
						this.logDebug(`Sync ${due.length + finalityDue.length} transactions...`)
						const start = Date.now()
						await Promise.allSettled([...due.map((x) => this.updateTx(x)), ...finalityDue.map((x) => this.checkFinality(x))])
						const end = Date.now()
						this.logDebug(`Transactions synced in ${end - start}ms`)
					} catch (error) {
						this.logError("Failed to sync transaction status.", error)
					}
				}
			}
			await sleep(1000)
		}
	}

	/** Dropped txs due for a resurrection re-check this tick; watch entries past
	 *  the window are evicted (the row simply stays Dropped). */
	private collectDroppedDue(): Tx[] {
		const now = Date.now()
		const due: Tx[] = []
		for (const [key, tx] of this.droppedWatch) {
			if (now - tx.updatedAt > DROPPED_RESURRECTION_WINDOW_MS) {
				this.droppedWatch.delete(key)
				this.droppedNextCheckAt.delete(key)
				continue
			}
			if ((this.droppedNextCheckAt.get(key) ?? 0) <= now) {
				this.droppedNextCheckAt.set(key, now + DROPPED_RECHECK_INTERVAL_MS)
				due.push(tx)
			}
		}
		return due
	}

	private collectFinalityDue(): Tx[] {
		const now = Date.now()
		const due: Tx[] = []
		for (const [key, tx] of this.finalityWatch) {
			if ((this.finalityNextCheckAt.get(key) ?? 0) > now) continue
			this.finalityNextCheckAt.set(key, now + this.finalityReadMs)
			due.push(tx)
		}
		return due
	}

	/** DROPPED-debounce bookkeeping: within the submission grace window, or below the
	 *  consecutive-observation threshold, keep the row Pending and let the next tick
	 *  re-check ("bail"). No streak bookkeeping for a tx that is no longer the armed
	 *  instance — an in-flight poll racing a purge would otherwise recreate the map entry
	 *  the purge just cleaned. Any non-(Dropped-over-Pending) observation resets the streak. */
	private trackDroppedStreak(tx: Tx, status: TxStatus): "bail" | "proceed" {
		const key = watchKey(tx)
		if (status === TxStatus.Dropped && tx.status === TxStatus.Pending) {
			if (this.pending.get(key) !== tx) return "bail"
			const streak = (this.droppedStreaks.get(key) ?? 0) + 1
			this.droppedStreaks.set(key, streak)
			const ageMs = Date.now() - tx.createdAt
			if (ageMs < DROPPED_GRACE_MS || streak < DROPPED_CONFIRMATIONS) {
				this.logDebug(
					`Tx ${tx.hash.slice(0, 8)} reported dropped (streak ${streak}, age ${Math.round(ageMs / 1000)}s) — keeping pending`,
				)
				return "bail"
			}
			return "proceed"
		}
		this.droppedStreaks.delete(key)
		return "proceed"
	}

	private async updateTx(tx: Tx) {
		this.logDebug(`Sync tx ${tx.hash.slice(0, 8)}`)
		// Pin polling to the endpoint that submitted this tx: staying on the
		// originating endpoint avoids transient receipt-not-yet-indexed issues
		// when the user swaps the network's primary endpoint mid-pending, and —
		// critically — keeps a pending tx's receipt fetch on ITS OWN profile's
		// endpoint after a profile switch, instead of leaking the tx hash to the
		// now-active profile's RPC. `getNodeForUrl` never falls back to the
		// active profile. Legacy txs with no recorded endpoint have no URL to
		// pin to, so they still resolve via the active profile's node.
		const node = tx.submittedEndpointUrl
			? await this.networkService.getNodeForUrl(tx.submittedEndpointUrl)
			: await this.networkService.getNode(tx.chainId)
		if (!node) {
			this.logError("Unknown network")
			return
		}

		let receipt: Awaited<ReturnType<typeof node.getTxReceipt>>
		try {
			receipt = await node.getTxReceipt(TxHash.fromString(tx.hash))
		} catch (err) {
			if (tx.submittedEndpointUrl) {
				this.networkService.reportEndpointFailure(tx.submittedEndpointUrl)
			}
			throw err
		}
		const status = txStatusFromReceipt(receipt.status)
		const executionResult = executionResultFromReceipt(receipt.executionResult)

		// DROPPED also means "this replica has never seen the hash" (see the constants'
		// doc block) — debounce it for a still-pending tx.
		if (this.trackDroppedStreak(tx, status) === "bail") return

		if (status === tx.status && executionResult === tx.executionResult) {
			this.logDebug(`Tx ${tx.hash.slice(0, 8)} still ${receipt.status}`)
			return
		}

		// The node fetch above ran UNLOCKED (network I/O). Re-check + persist UNDER
		// the tx lock: a concurrent profile-delete purge (`purgeForAccounts`, same
		// lock) removes this tx from `this.pending` + storage. Without the guarded
		// re-check, the worker's stale write would RESURRECT a deleted profile's tx.
		// The fence is on OBJECT IDENTITY, not hash membership: after a purge,
		// `addTransaction` may legitimately re-create the same hash as a NEW row
		// (ABA) — a stale poll's `has(hash)` would pass and overwrite it, while
		// `get(hash) !== tx` cannot.
		await this.lock.withLock(async () => {
			const key = watchKey(tx)
			if (this.pending.get(key) !== tx && this.droppedWatch.get(key) !== tx) return
			applyReceipt(tx, receipt)
			await this.commit(tx)
			this.logDebug(`Tx ${tx.hash.slice(0, 8)} ${receipt.status}`)
		})
	}

	/**
	 * Proves a mined row's block against the finalized chain, through a node that dials once and
	 * logs nothing: final writes it Finalized; a block pruned writes the fresh receipt, or Pending
	 * with its block, result and fee cleared, after which it is polled as any submitted tx is.
	 */
	private async checkFinality(tx: Tx): Promise<void> {
		const { submittedEndpointUrl: url, block } = tx
		if (!url || !block) return
		const watched = () => this.finalityWatch.get(watchKey(tx)) === tx
		const node = await this.networkService.getSingleAttemptNodeForUrl(url)
		const proof = await proveFinal(node, tx.hash, { block: block.number, hash: block.hash }, watched)
		if (proof.kind === "unsettled" || proof.kind === "unknown") return
		await this.lock.withLock(async () => {
			if (!watched()) return
			if (proof.kind === "final") tx.status = TxStatus.Finalized
			else if (proof.kind === "moved") applyReceipt(tx, proof.receipt)
			else clearInclusion(tx)
			await this.commit(tx)
			this.logDebug("Tx finality settled", { outcome: proof.kind })
		})
	}

	/** Persists a row the worker moved and files it under the one watch its new status needs:
	 *  Pending every tick, Dropped on the resurrection cadence, mined below Finalized until its
	 *  block is final. Under the tx lock. */
	private async commit(tx: Tx): Promise<void> {
		const now = Date.now()
		tx.updatedAt = now
		tx.awaitingFinality = awaitsFinality(tx) || undefined
		await this.txs.set(tx.hash, tx)
		this.emit("onTransactionUpdated", tx)
		const key = watchKey(tx)
		this.unwatch(key)
		if (tx.status === TxStatus.Pending) {
			this.pending.set(key, tx)
		} else if (tx.status === TxStatus.Dropped) {
			this.droppedWatch.set(key, tx)
			this.droppedNextCheckAt.set(key, now + DROPPED_RECHECK_INTERVAL_MS)
		} else if (tx.awaitingFinality) {
			this.finalityWatch.set(key, tx)
			this.finalityNextCheckAt.set(key, now + this.finalityReadMs)
		}
	}

	public async backup(): Promise<Tx[] | undefined> {
		const profile = await requireActiveProfile(this.profileService)

		const networks = await this.networkService.getNetworks()
		if (!networks.length) {
			return undefined
		}

		const txs: Tx[] = []

		for (const n of networks) {
			const accounts = await this.accountService.getAccounts(profile.id, n.chainId)
			for (const acc of accounts) {
				const mine = (await this.transactionsOf(acc.address, profile.id)).filter((tx) => exportableTx(tx, profile.id, n.chainId))
				txs.push(...mine.map(unmarked))
			}
		}

		return txs
	}

	public async restore(txs: Tx[], profileId: string): Promise<Restored<Tx>[]> {
		await this.ensureInitialized()
		// Deletion fence keyed on the composable's authoritative created-profile
		// id — tx rows' own profileId is optional AND backup-controlled, so it
		// cannot anchor the fence.
		requireRestoreProfileId(profileId)
		const deletion = this.deletionState
		const epochs = captureRestoreEpochs(deletion, [profileId])

		return await this.lock.withLock(async () => {
			// Every restored row binds to the restored profile and one of its accounts, whatever the
			// backup claims.
			const owned = new Set((await this.accountService.getAccountsRaw(profileId)).map((a) => accountScopeKey(a.chainId, a.address)))
			// The guard rejections THROW (not push-and-continue) so restoreRows
			// records them as `restoreError` with the identical message; the throw
			// also guarantees the row is never written / never added to `this.pending`.
			return await restoreRows(txs, async (tx) => {
				// Never restore a Pending tx: the init scan re-arms a stored one, and the sync worker then
				// dials its backup-controlled `submittedEndpointUrl` (or the active profile's node).
				if (tx.status === TxStatus.Pending) {
					throw new Error("restored pending transaction rejected")
				}
				// Create-only within the destination profile, against both forms of its row and an
				// ownerless row of the same hash, which may be this profile's own.
				if (await this.txs.contains(tx.hash, profileId)) {
					throw new Error("transaction already exists (hash collision)")
				}
				// Validate + canonicalize the persisted shape (mirror the read
				// codec) so a malformed row is recorded, not written + codec-hidden.
				const row = unmarked(TxSchema.parse({ ...tx, profileId }))
				if (!owned.has(accountScopeKey(row.chainId, row.account))) {
					throw new Error("transaction names no account of the restored profile")
				}
				const write = await this.txs.prepare(row.hash, row)
				assertRestoreEpoch(deletion, epochs, profileId)
				await write.commit()
				return row
			})
		})
	}
}

/** Is this row OURS to export? The fetch is by address, which two same-seed profiles
 *  share, so a row naming another profile is not ours. A row marked unattributable is
 *  nobody's — restore would hand it to whichever profile imported the backup. */
function exportableTx(tx: Tx, profileId: string, chainId: number): boolean {
	if (tx.ambiguous) return false
	if (tx.profileId !== undefined && tx.profileId !== profileId) return false
	return tx.chainId === chainId
}

function applyReceipt(tx: Tx, receipt: TxReceipt): void {
	tx.status = txStatusFromReceipt(receipt.status)
	tx.executionResult = executionResultFromReceipt(receipt.executionResult)
	tx.block = receipt.blockHash && receipt.blockNumber ? { hash: receipt.blockHash.toString(), number: receipt.blockNumber } : undefined
	tx.fee = receipt.transactionFee?.toString()
	tx.error = receipt.error
}

function clearInclusion(tx: Tx): void {
	tx.status = TxStatus.Pending
	tx.executionResult = undefined
	tx.block = undefined
	tx.fee = undefined
	tx.error = undefined
}

/** Mined below Finalized, with the endpoint and block that can prove it final. */
function awaitsFinality(tx: Tx): boolean {
	return MINED_STATUSES.has(tx.status) && tx.status !== TxStatus.Finalized && !!tx.submittedEndpointUrl && tx.block !== undefined
}

function unmarked(tx: Tx): Tx {
	const { awaitingFinality: _, ...row } = tx
	return row
}

/** A row's identity: its profile and its hash. An ownerless row has no profile part. */
function watchKey(tx: Pick<Tx, "profileId" | "hash">): string {
	return `${tx.profileId ?? ""}|${tx.hash}`
}

/** One entry per row identity, the sealed copy first, with every storage id the row sits at. */
function groupByIdentity(entries: ReadonlyArray<{ located: Located; row: Tx }>): Array<{ row: Tx; storageIds: string[] }> {
	const groups = new Map<string, { row: Tx; storageIds: string[] }>()
	for (const { located, row } of [...entries].sort((a, b) => Number(b.located.sealed) - Number(a.located.sealed))) {
		const group = groups.get(watchKey(row))
		if (group) group.storageIds.push(located.storageId)
		else groups.set(watchKey(row), { row, storageIds: [located.storageId] })
	}
	return [...groups.values()]
}

/** The ownerless row `text` holds, read through the codec, or `undefined`. */
function parseOwnerlessTx(text: string): Tx | undefined {
	try {
		const parsed = TxSchema.safeParse(JSON.parse(text))
		return parsed.success && parsed.data.profileId === undefined ? parsed.data : undefined
	} catch {
		return undefined
	}
}
