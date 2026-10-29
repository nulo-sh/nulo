/**
 * `ExecutionLane` — the execution-lane state machine, moved verbatim off
 * the execution facade: the cancel-controller registry, the
 * per-(profileId, chainId) FIFO execution mutex, the queued-wait
 * heartbeat, the slot acquisition choreography, the queued-record claim
 * wrapper, and `cancelJob`.
 *
 * The facade consumes this as a handle and wires the executors' lane-
 * shaped deps to it. The lane also owns `dapp_execute` record CREATION
 * (`beginJournal`) — the single start path shared by the direct
 * `send_transaction` flow and the queued-claim flow.
 *
 * Frozen invariants (constraint registry — do not "fix" any of these):
 *   - The mutex has NO timeout and NO force-release. A wedged holder
 *     wedges the lane until SW restart; that is the chosen failure mode
 *     (silent overlap is worse — nullifier double-spends).
 *   - FIFO baton release point: `onEnqueued` fires after `acquire` is
 *     CALLED (synchronous enqueue) and before the grant is awaited.
 *   - `cancelJob` transitions the journal FIRST and aborts SECOND; an
 *     FSM rejection drops the cancel silently and never aborts.
 *   - `JobCancelledSentinel` never crosses the RPC boundary —
 *     `rpc-cancel.ts` stays the conversion point, caller-side.
 *   - Sync-register: the pre-acquire controller is registered under the
 *     queued id BEFORE `acquireSlot`'s first await, so a user-cancel
 *     during the wait always finds its controller.
 */

import { JobCancelledSentinel, type JobError, type JobProgress, normalizeError } from "@nulo/wallet-core/jobs"
import { deferred } from "@nulo/wallet-core/utils"
import { SessionEndedError, TooManyPendingError } from "@nulo/extension-messaging/errors"
import { pickPrimaryIndex } from "@/utils/primary-method"
import type { LocalTxOrigin } from "@/wallet/services/transaction/service"
import type { TxCall } from "@/wallet/services/transaction/spec"
import type { OperationJournalService } from "@/wallet/services/operation-journal/service"
import { type JournalCallCarrier, type JournalRetitle, journalCallOf } from "@/wallet/services/operation-journal/spec"
import type { ExecutionHooks } from "@/wallet/services/dapp-interaction/spec"
import type { Network } from "@/wallet/services/network/service"
import type { ProfileInfo } from "@/wallet/services/profile/service"
import type { ExecutionFence } from "@/wallet/services/profile/profile-deletion-state"
import { claimOrCreateDappExecuteJournal as claimOrCreateDappExecuteJournalImpl } from "./claim-helper"
import {
	type AcquireCaps,
	ExecutionMutex,
	ExecutionMutexAbortError,
	ExecutionMutexCapacityError,
	type ExecutionMutexRelease,
} from "./execution-mutex"
import { failureKind } from "./mark-failed-unless-cancelled"

export interface ExecutionLaneDeps {
	operationJournal: OperationJournalService
	getActiveProfile(): Promise<ProfileInfo | undefined>
	/** Deletion epoch for a profile at capture time — threaded into the journal
	 *  create fence so a profile deleted (or deleted-and-reimported) between
	 *  capture and persist refuses the row. Optional: absent means unfenced. */
	captureProfileEpoch?(profileId: string): number
	assertFence(fence: ExecutionFence): Promise<void>
	peekLiveSerial(): number | undefined
	getNetwork(networkId: string): Promise<Network>
	logDebug(msg: string, ...rest: unknown[]): void
	logInfo(msg: string, ...rest: unknown[]): void
	logError(msg: string, ...rest: unknown[]): void
}

/** The stages the ended-session sweep cancels. After the `submitting` write the broadcast can beat
 *  the sweep, and a sent transaction must never read `cancelled`, so those sends are left to the
 *  fence check just before `node.sendTx`. */
const PRE_SUBMIT_STAGES = ["queued", "pending", "simulating", "proving"] as const

/** Popup transfers' bucket in the slot's per-origin cap; no dApp origin can take this form. */
const POPUP_ORIGIN_KEY = "__popup__"
/** Keeps an unexpected absent dApp origin capped under one bucket rather than bypassing the cap. */
const NO_ORIGIN_KEY = "__no_origin__"
/** Popup estimates' bucket: an estimate waits behind another, and queues only behind a send. */
const ESTIMATE_ORIGIN_KEY = "__estimate__"

/**
 * A dApp send's place among its origin's sends in one lane, from its first grant until it starts
 * or ends. A send parked outside the slot can be overtaken at the mutex, so this, not the mutex,
 * keeps one origin's sends in their enqueue order (a session belongs to one origin).
 */
export interface OriginTurn {
	/** An earlier send of the origin has neither started nor ended. */
	behind(): boolean
	/** Resolves once every earlier send of the origin has started or ended; `false` if `signal` aborts first. */
	earlierDone(signal: AbortSignal): Promise<boolean>
	/** Started or ended. Idempotent. */
	leave(): void
}

export class ExecutionLane {
	/** Cancel surface: jobId → AbortController, tagged with the serial of the
	 *  session that authorized the job. SW-internal only, never crosses the
	 *  wire. `cancelJob(id)` aborts the controller; the in-flight prove
	 *  pipeline checks `signal.aborted` at each stage boundary and
	 *  short-circuits with {@link JobCancelledSentinel}. */
	private readonly activeControllers = new Map<string, { controller: AbortController; serial: number }>()

	/** Per-(profileId, chainId) FIFO mutex serializing dApp sendTx
	 *  EXECUTION (build → simulate → prove → submit). Once the session-FIFO
	 *  baton releases at popup approval, two approved sendTx can both reach
	 *  execution; this mutex keeps them sequential so T2 doesn't simulate
	 *  against T1's not-yet-spent private notes (which would get T2 rejected
	 *  on-chain). Keyed to match PXE's own `chainGuard` scope. Held from
	 *  before authwit discovery through submit, both send paths. */
	private readonly executionMutex = new ExecutionMutex()

	/** Journal ids currently WAITING on `executionMutex.acquire` (not yet
	 *  holding). While non-empty, the heartbeat timer bumps each record's
	 *  `updatedAt` so the periodic reaper doesn't false-declare a legitimately-
	 *  waiting record "stuck" — the Nth concurrent sendTx can wait (N-1)×per-tx
	 *  while queued, which can exceed the 10-min queued / 2-min pending grace. */
	private readonly executionWaiters = new Set<string>()
	/** Journal ids in the PRE-CLAIM window (message arrival → mutex enqueue):
	 *  the session-FIFO wait behind earlier same-session requests plus this
	 *  request's own approval popup — a legitimate wait the reaper's queued
	 *  grace cannot distinguish from a lost handler. id → registeredAt. The
	 *  heartbeat vouches for these only within {@link MAX_QUEUED_WAIT_HEARTBEAT_MS}:
	 *  unbounded vouching would shield a genuinely hung queue from the reaper
	 *  forever, defeating the grace's purpose. Ownership migrates to
	 *  `executionWaiters` at mutex enqueue (`acquireSlot`). */
	private readonly queuedWaiters = new Map<string, number>()
	private executionHeartbeatTimer?: ReturnType<typeof setInterval>
	private static readonly EXECUTION_WAIT_HEARTBEAT_MS = 30_000
	/** Deliberate product ceiling on pre-claim vouching, sized to the admission
	 *  cap: 8 queued per session permits a target behind seven legitimate
	 *  ≤10-min approval popups plus its own (≈80 min). Beyond the ceiling the
	 *  heartbeat stops and the reaper's queued grace takes over, so a hung
	 *  queue resolves honestly (~ceiling + grace) instead of never. */
	private static readonly MAX_QUEUED_WAIT_HEARTBEAT_MS = 90 * 60_000

	private static readonly EXECUTION_ORIGIN_CAP = 8
	private static readonly EXECUTION_LANE_CAP = 32

	/** Per `${lane}|${origin}`, the dApp sends between their first grant and their start, in grant order. */
	private readonly originLines = new Map<string, { done: Promise<void> }[]>()

	public constructor(private readonly deps: ExecutionLaneDeps) {}

	/** The only way into the controller map. Synchronous, so a caller registers before its next
	 *  await; a `serial` that is not the live session's registers nothing and reports
	 *  `live: false`, and the caller terminalizes its record. */
	public registerInFlight(journalId: string, serial: number, controller: AbortController): { live: boolean } {
		if (this.deps.peekLiveSerial() !== serial) return { live: false }
		this.activeControllers.set(journalId, { controller, serial })
		return { live: true }
	}

	public deleteController(journalId: string): void {
		this.activeControllers.delete(journalId)
	}

	/** Open a `dapp_execute` journal record covering an in-flight dApp send.
	 *  Returns the journal id (or `undefined` on failure — non-fatal). The
	 *  record carries the signing account, network, and the dApp identity
	 *  for activity-feed rendering. Method name lives in `title` so the
	 *  in-flight card shows the same value the settled card derives from
	 *  the tx history. */
	public async beginJournal(
		networkId: string,
		accountAddress: string,
		origin: LocalTxOrigin,
		calls?: JournalCallCarrier[],
		fence?: ExecutionFence,
	): Promise<string | undefined> {
		try {
			// The fence is the AUTHORIZATION-time (profileId, epoch) capture. When
			// present it is authoritative — re-reading the active profile (or
			// re-capturing the epoch) here, after the FIFO wait, would resolve a
			// successor profile that reused the deleted one's id and file the
			// stale operation into the wrong incarnation.
			const profileId = fence?.profileId ?? (await this.deps.getActiveProfile())?.id
			if (!profileId) return undefined
			const index = pickPrimaryIndex(calls)
			const primary = index === undefined ? undefined : calls?.[index]
			const op = await this.deps.operationJournal.createOperation({
				kind: "dapp_execute",
				origin: "dapp",
				profileId,
				profileEpoch: fence?.epoch ?? this.deps.captureProfileEpoch?.(profileId),
				accountAddress,
				networkId,
				title: primary?.method ?? "Transaction",
				subtitle: origin.name,
				call: primary?.call,
			})
			return op.id
		} catch (error) {
			this.deps.logError("Failed to create dapp_execute journal record", error)
			return undefined
		}
	}

	/**
	 * Cancel an in-flight job (lossy-cancel).
	 *
	 * Transitions the journal record to `cancelled` synchronously, then
	 * fires the SW-internal AbortController so the running prove pipeline
	 * unwinds at its next stage boundary. The underlying offscreen prove
	 * may still complete (BB.wasm can't be preempted); its result is
	 * dropped silently when it arrives.
	 *
	 * No-op for unknown jobIds or jobs that already terminated (idempotent).
	 */
	public async cancelJob(jobId: string): Promise<void> {
		// Ownership gate: the PROFILE is the sole security principal for
		// cancel (an explicit product decision — one profile is one human,
		// who may cancel their own jobs from any of their accounts;
		// accountAddress/sessionId are deliberately not checked). A missing
		// record, a foreign profile, or a locked wallet (no active profile)
		// all drop the signal EXACTLY like an unknown id — existence
		// non-disclosure: callers cannot probe which job ids exist. The
		// read-then-transition window is benign: the FSM transition below
		// remains the arbiter of WHETHER cancel applies; this gate only
		// decides WHO may ask.
		const record = await this.deps.operationJournal.getOperation(jobId)
		if (!record) return
		const profile = await this.deps.getActiveProfile()
		if (!profile || record.profileId !== profile.id) return

		// Try the journal transition first. If the FSM accepts it, the job
		// is in a pre-submit stage and cancel is meaningful — abort the
		// in-flight controller so the prove pipeline unwinds.
		//
		// If the FSM REJECTS the transition (job already terminal, or past
		// `submitting` where the tx is mid-broadcast and on-chain effect is
		// no longer preventable), drop the cancel signal silently and do
		// NOT abort the controller. The in-flight flow continues to its
		// natural `succeeded` or `failed` terminal — preserving consistency
		// between journal stage and on-chain state.
		//
		// This guards the cancel-after-submit race: previously the journal
		// would flip to `cancelled` and the tx-was-already-broadcast path
		// would log a swallowed illegal
		// `cancelled → succeeded` transition, leaving the journal saying
		// "cancelled" while a real tx existed in chain history.
		try {
			await this.deps.operationJournal.transitionOperation(jobId, { stage: "cancelled" })
		} catch (err) {
			this.deps.logDebug("cancelJob: too late to cancel — dropping signal", err)
			return
		}

		this.abortCancelled(jobId)
	}

	/**
	 * Cancel every registered job whose session has ended: `cancelJob`'s journal-first body without
	 * its principal check, since no live session owns these jobs.
	 *
	 * Liveness is read as each record is reached, never passed in, so a session that opens while the
	 * sweep awaits keeps the jobs it registers. A record at `submitting` or later is left to the
	 * broadcast tick's own check. A failure on one record is logged and the sweep moves on.
	 */
	public async abandonDeadSessions(): Promise<void> {
		for (const [journalId, { serial }] of this.activeControllers) {
			try {
				if (serial === this.deps.peekLiveSerial()) continue
				const result = await this.deps.operationJournal.transitionIfStage(journalId, PRE_SUBMIT_STAGES, {
					stage: "cancelled",
				})
				if (result.outcome === "transitioned") this.abortCancelled(journalId)
			} catch (error) {
				this.deps.logError("Failed to cancel a job whose session ended", { journalId, error })
			}
		}
	}

	/** Abort and forget a job whose record is already `cancelled`. */
	private abortCancelled(jobId: string): void {
		const inFlight = this.activeControllers.get(jobId)
		if (inFlight) {
			inFlight.controller.abort()
			this.activeControllers.delete(jobId)
		}
		// A pre-acquire cancel has no controller to abort, but the record may
		// still be vouched for in the pre-claim window — prune it, or repeated
		// cancel/arrival cycles grow the map past the admission cap (which
		// counts only live `queued` rows).
		this.endQueuedWait(jobId)
	}

	/** Resolve the execution-mutex key for a dApp sendTx: `(profileId, chainId)`,
	 *  matching PXE's `chainGuard` scope exactly. The profile is the fence's —
	 *  an op keyed on whichever profile is active would serialize against the
	 *  wrong lane. The lookup is metadata-only (no PXE call), so calling it
	 *  before acquiring the mutex is safe — it doesn't contend on the chain
	 *  guard. `getNetwork` is re-resolved inside the build later; the duplicate
	 *  lookup is a negligible in-memory cost paid for keying correctness. */
	private async resolveExecutionMutexKey(fence: ExecutionFence, networkId: string): Promise<string> {
		const network = await this.deps.getNetwork(networkId)
		return `${fence.profileId}:${network.chainId}`
	}

	/**
	 * Acquire the per-(profileId, chainId) execution slot for a dApp sendTx,
	 * FIFO. When a `queuedJournalId` exists (a "Queued" record the user can see
	 * + cancel), an AbortController is registered under it BEFORE the acquire so
	 * a user-cancel during the wait aborts `acquire` → surfaces as
	 * `JobCancelledSentinel` → the dApp sees EIP-1193 4001. That same controller
	 * is reused by the journal claim (claimed id === queuedJournalId), so it
	 * lives in `activeControllers` continuously from before the wait through
	 * execution — strictly safer for the cancel-vs-claim race than registering
	 * one only after the claim transition.
	 *
	 * The waiting record is heartbeated (updatedAt bumped) for the duration of
	 * the wait so the periodic reaper doesn't declare it stuck.
	 *
	 * The fence is asserted before the slot is keyed or taken: an op whose
	 * authorizing session ended never waits on, or holds, any lane. That
	 * refusal terminalizes `queuedJournalId` here, like a capacity rejection —
	 * the caller's claim never runs to fail it.
	 *
	 * Returns the mutex release callback (call in `finally`) and the
	 * pre-acquire controller to thread into the claim.
	 */
	public async acquireSlot(
		networkId: string,
		queuedJournalId: string | undefined,
		fence: ExecutionFence,
		onEnqueued?: () => void,
		originKey?: string,
	): Promise<{ release: ExecutionMutexRelease; preController: AbortController | undefined }> {
		const preController = await this.registerWaitingRecord(queuedJournalId, fence)

		try {
			await this.deps.assertFence(fence)
			const mutexKey = await this.resolveExecutionMutexKey(fence, networkId)
			// Per-origin + total-lane backpressure cap. `originKey` is the canonical
			// dApp origin (threaded from ctx.origin).
			const caps = this.capsFor(originKey ?? NO_ORIGIN_KEY)
			// `acquire` installs this request as the FIFO tail SYNCHRONOUSLY, before
			// its first await (execution-mutex.ts). The instant we've called it we
			// are enqueued ahead of anyone who calls `acquire` later. Fire the baton
			// release HERE — before awaiting the grant — so the next session
			// message's popup opens immediately WHILE execution order is preserved:
			// that later request can only reach its own `acquire` after the baton
			// advances, i.e. strictly behind us in the FIFO. Releasing at popup
			// approval (before this point) would let a faster successor overtake us.
			// (On a capacity reject `acquire`'s synchronous cap-check rejects before
			// enqueue; onEnqueued still fires, which is a harmless early baton-advance
			// for a request that has just failed.)
			const acquirePromise = this.executionMutex.acquire(mutexKey, preController?.signal, caps)
			onEnqueued?.()
			const release = await acquirePromise
			return { release, preController }
		} catch (err) {
			return await this.refuseSlot(err, queuedJournalId)
		} finally {
			// Wait is over (granted, aborted, or capacity-rejected). A holder no
			// longer needs the heartbeat — its stage transitions bump updatedAt;
			// proving grace is 35 min.
			if (queuedJournalId) this.endExecutionWait(queuedJournalId)
		}
	}

	/**
	 * Hands a granted dApp send's slot on while `wait` runs, then re-enters at the tail in the
	 * origin's bucket with the place it was admitted under, so no re-entry is refused for capacity.
	 * The record stays vouched for and keeps the controller `acquireSlot` registered; a silent-path
	 * record's `queued` write settles before `wait` runs, possibly after the slot is handed on. Errors
	 * map as `acquireSlot`'s.
	 */
	public async parkSlot(
		release: ExecutionMutexRelease,
		networkId: string,
		queuedJournalId: string | undefined,
		fence: ExecutionFence,
		preController: AbortController | undefined,
		originKey: string | undefined,
		wait: () => Promise<void>,
	): Promise<ExecutionMutexRelease> {
		const reservation = this.executionMutex.keep(release)
		if (queuedJournalId) this.beginExecutionWait(queuedJournalId)
		try {
			if (queuedJournalId) await this.requeue(queuedJournalId)
			await wait()
			await this.deps.assertFence(fence)
			const mutexKey = await this.resolveExecutionMutexKey(fence, networkId)
			return await this.executionMutex.acquire(mutexKey, preController?.signal, this.capsFor(originKey ?? NO_ORIGIN_KEY), reservation)
		} catch (err) {
			reservation.drop()
			return await this.refuseSlot(err, queuedJournalId)
		} finally {
			if (queuedJournalId) this.endExecutionWait(queuedJournalId)
		}
	}

	/** Joins the origin's line in the `(profile, chain)` lane; call while holding the slot, so the
	 *  place is the grant order. */
	public joinOriginLine(fence: ExecutionFence, chainId: number, originKey: string | undefined): OriginTurn {
		const key = `${fence.profileId}:${chainId}|${originKey ?? NO_ORIGIN_KEY}`
		const line = this.originLines.get(key) ?? []
		this.originLines.set(key, line)
		const { promise: done, resolve } = deferred()
		const entry = { done }
		line.push(entry)
		let left = false
		return {
			behind: () => !left && line.indexOf(entry) > 0,
			earlierDone: (signal) =>
				untilOrAborted(Promise.all(line.slice(0, Math.max(0, line.indexOf(entry))).map((e) => e.done)), signal),
			leave: () => {
				if (left) return
				left = true
				line.splice(line.indexOf(entry), 1)
				if (line.length === 0) this.originLines.delete(key)
				resolve()
			},
		}
	}

	/** Fails a send's record no claim took: still `queued`, or `pending` on the silent path. A
	 *  cancel already ended it; a record past those stages belongs to its claim. */
	public async failUnclaimed(journalId: string | undefined, error: unknown): Promise<void> {
		if (!journalId || error instanceof JobCancelledSentinel) return
		try {
			const failure = normalizeError(error, failureKind(error, "dapp_execute"))
			await this.deps.operationJournal.transitionIfStage(journalId, ["queued", "pending"], { stage: "failed" }, failure)
		} catch (err) {
			this.deps.logError("Failed to update journal operation", { error: err })
		}
	}

	/** A silent-path record reads `pending` before it runs; this best-effort write makes it read
	 *  `queued` while it waits, and the claim takes it back. A `queued` or ended record is left
	 *  as it is. */
	private async requeue(journalId: string): Promise<void> {
		try {
			await this.deps.operationJournal.transitionIfStage(journalId, ["pending"], { stage: "queued" })
		} catch (error) {
			this.deps.logError("Failed to move a waiting dApp send back to queued", { error })
		}
	}

	/** `queued → pending` for a granted send a park moved back to `queued`; a send still `pending` stays.
	 *  Any other stage ends it: a cancel that landed first, or a record that is gone. */
	public async reclaimParked(journalId: string): Promise<void> {
		const result = await this.deps.operationJournal.transitionIfStage(journalId, ["queued"], { stage: "pending" })
		if (result.outcome === "transitioned" || (result.outcome === "stage" && result.stage === "pending")) return
		if (result.outcome === "stage" && result.stage === "cancelled") throw new JobCancelledSentinel(journalId)
		throw new Error("A waiting dApp send lost its record")
	}

	/** Cancels a send while it still asks `fee`, so an answer to a question it no longer asks cancels
	 *  nothing: `cancelJob`'s journal-first order, with the question as its precondition. */
	public async cancelQuestion(journalId: string, fee: string): Promise<void> {
		const record = await this.deps.operationJournal.getOperation(journalId)
		if (record?.progress.stage !== "queued" || record.progress.reask?.fee !== fee) return
		await this.cancelJob(journalId)
	}

	/** Any exit from a slot wait but the grant. Always throws. */
	private async refuseSlot(err: unknown, queuedJournalId: string | undefined): Promise<never> {
		if (queuedJournalId) this.activeControllers.delete(queuedJournalId)
		if (err instanceof ExecutionMutexCapacityError) {
			// No claim follows, and the reaper's safety net never fails the silent path's `pending`
			// record, so the refusal fails it here. The dApp sees -32005.
			await this.markJournal(queuedJournalId, { stage: "failed" }, normalizeError(err, "too_many_pending"))
			throw new TooManyPendingError()
		}
		if (err instanceof SessionEndedError) {
			await this.markSessionEnded(queuedJournalId)
			throw err
		}
		// Aborted while waiting (user cancelled the Queued record) — surface via
		// the cancelled pipeline.
		if (err instanceof ExecutionMutexAbortError) throw new JobCancelledSentinel(queuedJournalId ?? "")
		throw err
	}

	private capsFor(originKey: string): AcquireCaps {
		return { originKey, maxOriginDepth: ExecutionLane.EXECUTION_ORIGIN_CAP, maxLaneDepth: ExecutionLane.EXECUTION_LANE_CAP }
	}

	/** Whether a send or an estimate holds (or waits for) the `(profileId, chainId)` slot right now. */
	public isSlotBusy(profileId: string, chainId: number): boolean {
		return this.executionMutex.isLocked(`${profileId}:${chainId}`)
	}

	/** Whether a send holds (or waits for) the `(profileId, chainId)` slot right now. */
	public isSendInSlot(profileId: string, chainId: number): boolean {
		return this.executionMutex.isLockedOutside(`${profileId}:${chainId}`, ESTIMATE_ORIGIN_KEY)
	}

	/**
	 * The slot for a popup estimate, in line behind the estimates ahead of it; `undefined` while a send
	 * holds or waits for it. No send can join in between: the mutex installs its tail synchronously.
	 * An abort of `signal` while waiting ends the wait as the cancel sentinel.
	 */
	public takeEstimateSlot(profileId: string, chainId: number, signal?: AbortSignal): Promise<ExecutionMutexRelease> | undefined {
		if (this.isSendInSlot(profileId, chainId)) return undefined
		return this.executionMutex.acquire(`${profileId}:${chainId}`, signal, this.capsFor(ESTIMATE_ORIGIN_KEY)).catch((error: unknown) => {
			if (error instanceof ExecutionMutexAbortError) throw new JobCancelledSentinel("")
			throw error
		})
	}

	/**
	 * The dApp sends' slot for a popup transfer, in its own origin bucket. The transfer already owns
	 * its controller, so this registers none: `signal` is that controller's, and an abort ends the
	 * wait as the cancel sentinel. `onWait` runs once, synchronously, when another send holds or
	 * awaits the slot as this one joins the line. Call `release` in `finally`.
	 */
	public async acquireTransferSlot(
		networkId: string,
		journalId: string,
		fence: ExecutionFence,
		signal: AbortSignal,
		onWait?: () => void,
	): Promise<ExecutionMutexRelease> {
		this.beginExecutionWait(journalId)
		try {
			await this.deps.assertFence(fence)
			const mutexKey = await this.resolveExecutionMutexKey(fence, networkId)
			// Nothing is awaited between the check and the enqueue, so the check is the line as joined.
			if (this.executionMutex.isLocked(mutexKey)) onWait?.()
			return await this.executionMutex.acquire(mutexKey, signal, this.capsFor(POPUP_ORIGIN_KEY))
		} catch (err) {
			if (err instanceof ExecutionMutexCapacityError) throw new TooManyPendingError()
			if (err instanceof ExecutionMutexAbortError) throw new JobCancelledSentinel(journalId)
			throw err
		} finally {
			this.endExecutionWait(journalId)
		}
	}

	/** Registers the waiting record's controller in the call's synchronous prefix, so a cancel
	 *  landing during any later await finds it; an ended session registers nothing and fails
	 *  the record. */
	private async registerWaitingRecord(queuedJournalId: string | undefined, fence: ExecutionFence): Promise<AbortController | undefined> {
		if (!queuedJournalId) return undefined
		const controller = new AbortController()
		if (!this.registerInFlight(queuedJournalId, fence.session, controller).live) {
			await this.markSessionEnded(queuedJournalId)
			throw new SessionEndedError()
		}
		this.beginExecutionWait(queuedJournalId)
		return controller
	}

	private markSessionEnded(journalId: string | undefined): Promise<void> {
		return this.markJournal(journalId, { stage: "failed" }, normalizeError(new SessionEndedError(), "session_ended"))
	}

	private beginExecutionWait(journalId: string): void {
		// Ownership migration: a pre-claim waiter reaching the mutex hands its
		// liveness vouching to the execution set — exactly one owner per id.
		this.queuedWaiters.delete(journalId)
		this.executionWaiters.add(journalId)
		this.ensureHeartbeatTimer()
	}

	private endExecutionWait(journalId: string): void {
		this.executionWaiters.delete(journalId)
		this.maybeStopHeartbeatTimer()
	}

	/** Start vouching for a record in the pre-claim window (see
	 *  {@link queuedWaiters}). Called by the wallet-sdk handler at
	 *  queued-record creation via the {@link ExecutionService} delegator. */
	public beginQueuedWait(journalId: string): void {
		if (this.executionWaiters.has(journalId)) return
		this.queuedWaiters.set(journalId, Date.now())
		this.ensureHeartbeatTimer()
	}

	/** Stop vouching (handler settled without reaching the mutex, or the
	 *  backstop after settlement). Idempotent. */
	public endQueuedWait(journalId: string): void {
		this.queuedWaiters.delete(journalId)
		this.maybeStopHeartbeatTimer()
	}

	private ensureHeartbeatTimer(): void {
		if (!this.executionHeartbeatTimer) {
			this.executionHeartbeatTimer = setInterval(() => {
				void this.heartbeatExecutionWaiters()
			}, ExecutionLane.EXECUTION_WAIT_HEARTBEAT_MS)
		}
	}

	private maybeStopHeartbeatTimer(): void {
		if (this.executionWaiters.size === 0 && this.queuedWaiters.size === 0 && this.executionHeartbeatTimer) {
			clearInterval(this.executionHeartbeatTimer)
			this.executionHeartbeatTimer = undefined
		}
	}

	private async heartbeatExecutionWaiters(): Promise<void> {
		// Snapshot — touchOperation awaits and the collections can mutate
		// mid-iteration.
		for (const id of [...this.executionWaiters]) {
			try {
				await this.deps.operationJournal.touchOperation(id)
			} catch {
				// Record gone (reaped / cancelled / completed) — harmless; the next
				// settle removes it from the wait-set.
			}
		}
		const now = Date.now()
		for (const [id, registeredAt] of [...this.queuedWaiters]) {
			// Lease expiry: stop vouching past the ceiling — the reaper's grace
			// takes over and a hung queue resolves honestly instead of never.
			if (now - registeredAt > ExecutionLane.MAX_QUEUED_WAIT_HEARTBEAT_MS) {
				this.queuedWaiters.delete(id)
				continue
			}
			try {
				await this.deps.operationJournal.touchOperation(id)
			} catch {
				// Record gone — harmless; the settle backstop removes it.
			}
		}
		this.maybeStopHeartbeatTimer()
	}

	/**
	 * Claim a pre-allocated queued journal record (transition queued → pending)
	 * OR create a new in-flight record if no queued id was provided.
	 *
	 * Decision tree + invariants live in `./claim-helper.ts` so they're
	 * unit-testable without spinning up the full ExecutionService harness.
	 * This thin wrapper just binds lane dependencies into the helper's
	 * dependency injection shape.
	 */
	public async claimOrCreateJournal(
		networkId: string,
		accountAddress: string,
		origin: LocalTxOrigin,
		calls: JournalCallCarrier[] | undefined,
		hooks: ExecutionHooks | undefined,
		reuseController: AbortController | undefined,
		fence: ExecutionFence,
	): Promise<{ journalId: string | undefined; controller: AbortController | undefined }> {
		return claimOrCreateDappExecuteJournalImpl(
			{
				operationJournal: this.deps.operationJournal,
				registerInFlight: (journalId, serial, controller) => this.registerInFlight(journalId, serial, controller),
				deleteController: (journalId) => this.deleteController(journalId),
				createFreshRecord: (n, a, o, c) => this.beginJournal(n, a, o, c, fence),
				logger: {
					debug: (msg) => this.deps.logDebug(msg),
					info: (msg) => this.deps.logInfo(msg),
					error: (msg, raw) => this.deps.logError(msg, raw),
				},
			},
			{
				networkId,
				accountAddress,
				// The profile execution was AUTHORIZED under (the fence capture), never
				// a fresh active-profile read: after the FIFO wait the active profile
				// can be a successor that reused the same id.
				profileId: fence.profileId,
				session: fence.session,
				origin,
				calls,
				queuedJournalId: hooks?.queuedJournalId,
				reuseController,
			},
		)
	}

	public async markJournal(
		journalId: string | undefined,
		progress: JobProgress,
		error?: JobError | null,
		retitle?: JournalRetitle,
	): Promise<void> {
		if (!journalId) return
		try {
			await this.deps.operationJournal.transitionOperation(journalId, progress, error, retitle)
		} catch (err) {
			this.deps.logError("Failed to update journal operation", err)
		}
	}

	/**
	 * Names the record by the primary call a build made, the one its settled row will title: the title
	 * and the call, class included, in one write, so the two never describe different calls. Nothing
	 * depends on it: a refused write leaves the record as it was.
	 */
	public async recordBuiltCall(journalId: string | undefined, txCalls: readonly TxCall[]): Promise<void> {
		if (!journalId || txCalls.length === 0) return
		const primary = txCalls[pickPrimaryIndex(txCalls) ?? 0]
		const call = journalCallOf(primary.contract, primary.args, primary.classId)
		const written =
			call !== undefined &&
			(await this.deps.operationJournal.setOperationMeta(journalId, { title: primary.method, call }).then(
				() => true,
				() => false,
			))
		if (!written) this.deps.logDebug("journal call not recorded")
	}

	/** {@link markJournal} for a write the caller depends on: a refused write or a missing id rejects. */
	public async commitJournal(journalId: string | undefined, progress: JobProgress): Promise<void> {
		if (!journalId) throw new Error("journal write refused: the operation has no record")
		await this.deps.operationJournal.transitionOperation(journalId, progress)
	}
}

/** `true` once `promise` fulfills, `false` if `signal` aborts first. */
function untilOrAborted(promise: Promise<unknown>, signal: AbortSignal): Promise<boolean> {
	if (signal.aborted) return Promise.resolve(false)
	return new Promise<boolean>((resolve) => {
		const onAbort = () => resolve(false)
		signal.addEventListener("abort", onAbort, { once: true })
		promise.then(() => {
			signal.removeEventListener("abort", onAbort)
			resolve(true)
		})
	})
}
