/**
 * Per-key FIFO mutex serializing dApp transaction EXECUTION within a
 * `(profileId, chainId)` scope.
 *
 * Why a bespoke primitive instead of `@nulo/wallet-core`'s `Lock`: that lock
 * force-releases after 5 minutes to avoid deadlocks. Proving on a slow runner
 * legitimately exceeds 5 minutes, and a force-release mid-prove would let the
 * next transaction start building against the PXE while the holder is still
 * proving — exactly the stale-private-note interleaving this mutex exists to
 * prevent. So: NO timeout, NO force-release.
 *
 * Correctness role (see implementations-plan/archive/dapp-interaction-lock-fix/plan.md#parallel-popups):
 * once the FIFO baton is released at popup approval, two approved sendTx can
 * both reach execution. `withPxeWrite` serializes individual PXE calls but NOT
 * the build→simulate→prove→submit lifecycle, so without this mutex T1 and T2
 * could simulate against the same private-note snapshot and T2's tx would be
 * rejected on-chain (double-spent nullifier). The NO_FROM path has no nonce at
 * all, so it relies entirely on this serialization. Hold the mutex from before
 * authwit discovery through submit, for both send paths.
 *
 * Keyed `(profileId, chainId)` to match PXE's own `chainGuard` (one PXE runtime
 * per profile+chain). Per-account would under-serialize: two accounts on one
 * chain share the runtime and the chainGuard.
 *
 * Abort: `acquire` accepts an `AbortSignal` so a queued waiter (a "Queued"
 * journal record the user can cancel) can be released from the wait. Aborting
 * while waiting splices the waiter out WITHOUT breaking FIFO ordering for
 * everyone behind it (the successor still waits for the real prior holder).
 *
 * Park: `keep` hands a capped holder's slot on while its place under the caps
 * stays counted, so a request that waits outside the slot and comes back can
 * never be refused for capacity it was already admitted under.
 */

import { deferred } from "@nulo/wallet-core/utils"

/** Thrown from `acquire` when the provided `AbortSignal` fires before the slot
 *  is granted. Distinct class so callers can map it onto their cancel pipeline
 *  (→ `JobCancelledSentinel` → EIP-1193 4001) rather than treating it as a
 *  generic failure. */
export class ExecutionMutexAbortError extends Error {
	public constructor(key: string) {
		super(`ExecutionMutex acquire aborted while waiting on key "${key}"`)
		this.name = "ExecutionMutexAbortError"
	}
}

/** Thrown from `acquire` when a backpressure cap is hit BEFORE enqueue — either
 *  the per-origin contribution cap or the coarse total-lane cap. Distinct class
 *  so the caller can map it onto the dApp-facing `TooManyPendingError` (→ -32005)
 *  rather than a generic failure. The `key` is the internal lane key
 *  (profileId:chainId); it is NOT surfaced to the dApp (no origin/profile oracle). */
export class ExecutionMutexCapacityError extends Error {
	public constructor(key: string) {
		super(`ExecutionMutex capacity reached for key "${key}"`)
		this.name = "ExecutionMutexCapacityError"
	}
}

/** Backpressure caps for a capped `acquire`. When present, the per-origin and
 *  total-lane depths are tracked and enforced. `originKey` MUST be the canonical
 *  browser origin (NOT a display name or sessionId — both are spoofable/multipliable). */
export type AcquireCaps = {
	originKey: string
	maxOriginDepth: number
	maxLaneDepth: number
}

/** Release callback returned by `acquire`. Idempotent — calling it more than
 *  once is a no-op. MUST be called (use `try/finally`) or the key stays locked
 *  forever. */
export type ExecutionMutexRelease = () => void

/** A capped request's counted place while it waits outside the slot (`keep`). Re-entering with it
 *  moves the place to the new hold; it re-enters once, in the lane and origin that counted it. */
export interface SlotReservation {
	/** Gives the place back; a no-op once re-entered or dropped. */
	drop(): void
}

/** One capped request's count in the lane and origin depths, given back exactly once. */
type DepthClaim = { readonly key: string; readonly originDepthKey: string; returned: boolean }

export class ExecutionMutex {
	/** Per-key tail of the FIFO chain. The promise stored here resolves when the
	 *  most-recently-enqueued waiter for the key releases. A fresh acquirer
	 *  awaits the current tail, then installs its own promise as the new tail. */
	private readonly tails = new Map<string, Promise<void>>()

	/** Per-lane depth (waiting, holding or parked). Tracked ONLY for capped acquires, so
	 *  uncapped callers (and the FIFO-mechanics unit tests) are unaffected. */
	private readonly laneDepth = new Map<string, number>()
	/** Per-(lane, origin) depth, keyed `${laneKey}|${originKey}` (a lane key
	 *  `profileId:chainId` and a browser origin both exclude `|`, so the join is
	 *  unambiguous — and ASCII, unlike a NUL separator which makes git treat the
	 *  source as binary). */
	private readonly originDepth = new Map<string, number>()
	/** Per-lane entries holding or waiting in the chain, and per-(lane, origin) for capped ones; a
	 *  place `keep` holds outside the slot is not in the chain. */
	private readonly inChain = new Map<string, number>()
	private readonly keepers = new WeakMap<ExecutionMutexRelease, () => SlotReservation>()
	/** Each reservation not yet re-entered or dropped, with the place it holds. */
	private readonly reservations = new WeakMap<SlotReservation, DepthClaim>()

	/**
	 * Acquire the lock for `key`, FIFO. Resolves with a release callback once
	 * the slot is granted. If `signal` fires before the grant, rejects with
	 * `ExecutionMutexAbortError` and removes this waiter from the chain without
	 * disturbing FIFO order for successors.
	 *
	 * When `caps` is given, a backpressure cap is enforced BEFORE enqueue: reject
	 * with `ExecutionMutexCapacityError` if the per-origin OR total-lane depth is
	 * already at its limit. A capacity reject mutates nothing. Depth is
	 * incremented only after passing both caps, and decremented exactly once, by
	 * `release` or by dropping the reservation `keep` turned it into — an aborted
	 * waiter's slot is freed when its chained release fires (conservative
	 * over-count; never an under-count, so the cap cannot be bypassed). A
	 * `reservation` re-enters at the tail with the place it already holds: no cap
	 * check, no increment.
	 */
	public async acquire(
		key: string,
		signal?: AbortSignal,
		caps?: AcquireCaps,
		reservation?: SlotReservation,
	): Promise<ExecutionMutexRelease> {
		// Fast reject: already aborted before we even enqueue. A reservation stays the caller's to drop.
		if (signal?.aborted) throw new ExecutionMutexAbortError(key)

		const claim = reservation ? this.redeem(reservation, key, caps) : this.admit(key, caps)

		const prior = this.tails.get(key) ?? Promise.resolve()

		// `mine` resolves when WE release. The next acquirer will await it.
		const { promise: mine, resolve: resolveMine } = deferred()
		this.tails.set(key, mine)
		const chainKeys = caps ? [key, `${key}|${caps.originKey}`] : [key]
		for (const k of chainKeys) this.inChain.set(k, (this.inChain.get(k) ?? 0) + 1)

		let released = false
		const handOn = (): void => {
			released = true
			// GC the key if no one enqueued behind us (tail still points at mine).
			if (this.tails.get(key) === mine) this.tails.delete(key)
			for (const k of chainKeys) {
				const n = (this.inChain.get(k) ?? 1) - 1
				if (n <= 0) this.inChain.delete(k)
				else this.inChain.set(k, n)
			}
			resolveMine()
		}
		const release: ExecutionMutexRelease = () => {
			if (released) return
			this.keepers.delete(release)
			handOn()
			if (claim) this.returnDepth(claim)
		}
		if (claim) {
			this.keepers.set(release, () => {
				handOn()
				return this.reserve(claim)
			})
		}

		if (!signal) {
			// No abort: simple — wait for the prior holder, then we hold it.
			await prior
			return release
		}

		// Abortable wait. We race `prior` against the abort signal.
		try {
			await this.waitForPriorOrAbort(prior, signal, key)
		} catch (err) {
			// Aborted while waiting. We must NOT strand successors: anyone who
			// enqueued behind us is awaiting `mine`. Chain `mine`'s resolution to
			// the REAL prior holder so the successor still serializes correctly
			// (it proceeds only after `prior` actually completes), and so the key
			// is GC'd if we were the tail. The chained release also decrements the
			// depth counters (conservative over-count until `prior` settles).
			//
			// `released` guard makes this safe even if a (buggy) double-fire of the
			// signal occurs — only the first resolves.
			void prior.finally(release)
			throw err
		}

		return release
	}

	/**
	 * Hands a granted capped hold's slot to the next in line and keeps its counted place, for a holder
	 * that waits outside the slot and comes back. Its release then does nothing.
	 */
	public keep(release: ExecutionMutexRelease): SlotReservation {
		const keep = this.keepers.get(release)
		if (!keep) throw new Error("ExecutionMutex: only an unreleased capped hold keeps its place, once")
		this.keepers.delete(release)
		return keep()
	}

	/** Backpressure cap — checked + applied atomically before enqueue. */
	private admit(key: string, caps: AcquireCaps | undefined): DepthClaim | undefined {
		if (!caps) return undefined
		const originDepthKey = `${key}|${caps.originKey}`
		const laneNow = this.laneDepth.get(key) ?? 0
		const originNow = this.originDepth.get(originDepthKey) ?? 0
		if (laneNow >= caps.maxLaneDepth || originNow >= caps.maxOriginDepth) {
			throw new ExecutionMutexCapacityError(key)
		}
		this.laneDepth.set(key, laneNow + 1)
		this.originDepth.set(originDepthKey, originNow + 1)
		return { key, originDepthKey, returned: false }
	}

	private redeem(reservation: SlotReservation, key: string, caps: AcquireCaps | undefined): DepthClaim {
		const claim = this.reservations.get(reservation)
		if (!claim || claim.key !== key || claim.originDepthKey !== `${key}|${caps?.originKey}`) {
			throw new Error("ExecutionMutex: a reservation re-enters once, in the lane and origin that counted it")
		}
		this.reservations.delete(reservation)
		return claim
	}

	private reserve(claim: DepthClaim): SlotReservation {
		const reservation: SlotReservation = {
			drop: () => {
				if (this.reservations.get(reservation) !== claim) return
				this.reservations.delete(reservation)
				this.returnDepth(claim)
			},
		}
		this.reservations.set(reservation, claim)
		return reservation
	}

	private returnDepth(claim: DepthClaim): void {
		if (claim.returned) return
		claim.returned = true
		const lane = (this.laneDepth.get(claim.key) ?? 1) - 1
		if (lane <= 0) this.laneDepth.delete(claim.key)
		else this.laneDepth.set(claim.key, lane)
		const origin = (this.originDepth.get(claim.originDepthKey) ?? 1) - 1
		if (origin <= 0) this.originDepth.delete(claim.originDepthKey)
		else this.originDepth.set(claim.originDepthKey, origin)
	}

	/** Resolve when `prior` settles; reject with `ExecutionMutexAbortError` if
	 *  `signal` fires first. Detaches its own listener either way. */
	private waitForPriorOrAbort(prior: Promise<void>, signal: AbortSignal, key: string): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			const onAbort = () => {
				cleanup()
				reject(new ExecutionMutexAbortError(key))
			}
			const cleanup = () => signal.removeEventListener("abort", onAbort)
			signal.addEventListener("abort", onAbort, { once: true })
			// `prior` never rejects (release callbacks only resolve), but `.then`
			// with both arms keeps us robust if that ever changes.
			prior.then(
				() => {
					cleanup()
					resolve()
				},
				() => {
					cleanup()
					resolve()
				},
			)
		})
	}

	/** Is `key` currently held or has waiters enqueued. */
	public isLocked(key: string): boolean {
		return this.tails.has(key)
	}

	/** Whether a request outside `originKey`'s bucket holds or waits for `key`. An aborted waiter
	 *  counts until the holder ahead of it releases, as it does for `isLocked`. */
	public isLockedOutside(key: string, originKey: string): boolean {
		return (this.inChain.get(key) ?? 0) > (this.inChain.get(`${key}|${originKey}`) ?? 0)
	}
}
