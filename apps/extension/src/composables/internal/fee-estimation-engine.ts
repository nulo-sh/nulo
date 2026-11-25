/**
 * The one fee-estimation state machine: per-key start timing, monotonic staleness
 * counters, caller-minted cancellation tokens, remote-cancel ownership, and
 * the handed-off set. `useFeeEstimation` (single-slot) and `useFeeEstimationMap`
 * (per-op) are thin adapters over this engine — it owns every lifecycle
 * transition; they own the Vue state (via the sink callbacks) and their public
 * API shapes.
 *
 * Deliberately Vue-free and NOT auto-importable (the auto-import `dirs` scan is
 * non-recursive, so `internal/` is reachable only by explicit import).
 */

export interface FeeEstimationEngineOptions<TKey extends string | number, TParams, TResult> {
	/**
	 * The RPC leg. Receives the raw key — adapters mint their own derived
	 * identifiers (e.g. the keyed composable's SW-coalescing flowKey); the
	 * engine never constructs one. `signal` aborts once the run is superseded, cancelled or disposed.
	 */
	run: (params: TParams, estimateToken: string, key: TKey, signal: AbortSignal) => Promise<TResult>
	/**
	 * The pause an estimate waits when it is asked in a task `pauseThisTask` marked: the person
	 * typed, or an answer is being handled. Every other estimate starts at the end of the task that
	 * asked for it. No default here — each adapter supplies its own documented default.
	 */
	debounceMs: number
	/**
	 * State sinks. Invoked synchronously at exactly the points the transitions
	 * occur, in a fixed observable order: `schedule` clears the result BEFORE
	 * flipping estimating true; `cancel` clears the result BEFORE flipping
	 * estimating false; on a real error, `onError` fires BEFORE estimating
	 * flips false (an error handler observes estimating === true).
	 */
	onResult: (key: TKey, result: TResult | null) => void
	onEstimating: (key: TKey, estimating: boolean) => void
	/** Called only for real errors, never for stale-counter or post-dispose settles. */
	onError?: (key: TKey, err: unknown) => void
	/**
	 * Remote cancel. Invoked for a superseded or abandoned token whose RPC actually started — an
	 * estimate that never started needs no remote cancel. Never invoked for handed-off tokens
	 * (ownership transferred to the execution path, which is about to consume the stashed
	 * estimate). Only `dispose()` waits for a returned promise, which must never reject: every
	 * other path drops it.
	 */
	cancelRemote?: (estimateToken: string) => unknown
}

export interface FeeEstimationEngine<TKey extends string | number, TParams> {
	/**
	 * Schedule an estimation for `key`, superseding any live one for it. It starts once the task ends,
	 * or after `debounceMs` when the task is marked; a schedule for `key` within the same task replaces it.
	 */
	schedule(key: TKey, params: TParams): void
	/**
	 * The person typed in this task: estimates scheduled until the next timer turn wait the pause.
	 * A settle marks its own task, so a re-ask an answer causes waits too. The mark can also reach a
	 * change from another task queued before that turn, which then waits as it would have before.
	 */
	pauseThisTask(): void
	/** A pick: starts `key`'s estimate now if one still waits its pause. Never creates one. */
	startWaiting(key: TKey): void
	/** Cancel `key`'s pending estimation (if any) and clear its state. Idempotent. */
	cancel(key: TKey): void
	/** Cancel every key with any live state. */
	cancelAll(): void
	/**
	 * Single-slot submit seam: returns the completed token, or — deliberately —
	 * a still-in-flight one (`completed ?? inflight`), marked handed off. The
	 * submit path consumes THIS slot's estimate, so an in-flight token's stash
	 * will be consumed the moment it lands.
	 */
	handoffInclusive(key: TKey): string | null
	/**
	 * Multi-op approve seam: completed tokens ONLY, each marked handed off.
	 * In-flight estimates are deliberately left armed — their ids never reach
	 * the approve payload, so handing them off would only orphan their
	 * eventual stashes. `collect` runs immediately after each token's mark, so
	 * a mid-iteration throw cannot leave later tokens handed off but
	 * unreported (orphaned stashes).
	 */
	handoffCompleted(collect: (key: TKey, token: string) => void): void
	/** Undo a handoff after a FAILED approve — normal cancellation applies again. */
	rearm(): void
	/**
	 * Terminal teardown: clears timers, remote-cancels every owned live token, and refuses every
	 * later `schedule`. Settles once each remote cancel it sent has settled; a repeated call returns
	 * the first call's promise.
	 */
	dispose(): Promise<void>
}

/**
 * When each key's estimate starts: once the task that asked for it ends, or after `pauseMs` when that
 * task was marked. Holds only estimates that have not started; a start removes its own entry, so a
 * fired timer can never start twice.
 */
function createStartClock<TKey>(pauseMs: number) {
	const waiting = new Map<TKey, { timer: ReturnType<typeof setTimeout>; start: () => void }>()
	let paused = false
	let unpause: ReturnType<typeof setTimeout> | undefined
	const clear = (key: TKey) => {
		clearTimeout(waiting.get(key)?.timer)
		waiting.delete(key)
	}
	return {
		pauseThisTask: () => {
			paused = true
			unpause ??= setTimeout(() => {
				paused = false
				unpause = undefined
			}, 0)
		},
		arm: (key: TKey, run: () => void) => {
			const start = () => {
				waiting.delete(key)
				run()
			}
			waiting.set(key, { timer: setTimeout(start, paused ? pauseMs : 0), start })
		},
		clear,
		startWaiting: (key: TKey) => {
			const entry = waiting.get(key)
			clear(key)
			entry?.start()
		},
		keys: () => waiting.keys(),
		clearAll: () => {
			for (const key of [...waiting.keys()]) clear(key)
			clearTimeout(unpause)
		},
	}
}

export function createFeeEstimationEngine<TKey extends string | number, TParams, TResult>(
	options: FeeEstimationEngineOptions<TKey, TParams, TResult>,
): FeeEstimationEngine<TKey, TParams> {
	const { run, debounceMs, onResult, onEstimating, onError, cancelRemote } = options

	const clock = createStartClock<TKey>(debounceMs)
	const counters = new Map<TKey, number>()
	const inflight = new Map<TKey, { token: string; started: boolean; abort: AbortController }>()
	const completed = new Map<TKey, string>()
	const handedOff = new Set<string>()
	let disposed: Promise<void> | undefined

	/** Remote-cancel every live token still owned for `key`. */
	const cancelOwnedRemoteFor = (key: TKey): unknown[] => {
		const flight = inflight.get(key)
		flight?.abort.abort()
		const tokens = [flight?.started ? flight.token : null, completed.get(key) ?? null]
		inflight.delete(key)
		completed.delete(key)
		return tokens.filter((token): token is string => !!token && !handedOff.has(token)).map((token) => cancelRemote?.(token))
	}

	const cancel = (key: TKey) => {
		clock.clear(key)
		cancelOwnedRemoteFor(key)
		// Bumping the counter for this key invalidates any in-flight run promise.
		counters.set(key, (counters.get(key) ?? 0) + 1)
		onResult(key, null)
		onEstimating(key, false)
	}

	const cancelAll = () => {
		const keys = new Set<TKey>([...clock.keys(), ...inflight.keys(), ...completed.keys()])
		for (const key of keys) cancel(key)
	}

	const schedule = (key: TKey, params: TParams) => {
		if (disposed) return
		clock.clear(key)
		cancelOwnedRemoteFor(key)
		onResult(key, null)
		onEstimating(key, true)
		const myCounter = (counters.get(key) ?? 0) + 1
		counters.set(key, myCounter)
		const token = crypto.randomUUID()
		const abort = new AbortController()
		inflight.set(key, { token, started: false, abort })

		// Stale = disposed, or a newer schedule/cancel bumped this key's counter
		// while our run was in flight. Every settle path re-checks it AFTER the
		// awaited run.
		const isStale = () => disposed !== undefined || myCounter !== counters.get(key)
		const settleSuccess = (r: TResult) => {
			clock.pauseThisTask()
			onResult(key, r)
			completed.set(key, token)
			inflight.delete(key)
		}
		const settleFailure = (err: unknown) => {
			clock.pauseThisTask()
			onResult(key, null)
			// A transport failure (RPC timeout) leaves the SW-side runner
			// alive with no local owner — without this cancel it would be
			// unreachable by every later cleanup path and its stash would
			// sit un-evictable for the full TTL.
			const flight = inflight.get(key)
			if (flight?.token && !handedOff.has(flight.token)) cancelRemote?.(flight.token)
			inflight.delete(key)
			onError?.(key, err)
		}
		clock.arm(key, () => {
			void runScheduledEstimate({
				markStarted: () => {
					const flight = inflight.get(key)
					if (flight?.token === token) flight.started = true
				},
				run: () => run(params, token, key, abort.signal),
				isStale,
				settleSuccess,
				settleFailure,
				clearEstimating: () => onEstimating(key, false),
			})
		})
	}

	const handoffInclusive = (key: TKey): string | null => {
		const token = completed.get(key) ?? inflight.get(key)?.token ?? null
		if (token) handedOff.add(token)
		return token
	}

	const handoffCompleted = (collect: (key: TKey, token: string) => void): void => {
		for (const [key, token] of completed) {
			handedOff.add(token)
			collect(key, token)
		}
	}

	const rearm = (): void => {
		handedOff.clear()
	}

	const dispose = (): Promise<void> => {
		if (disposed) return disposed
		clock.clearAll()
		const keys = new Set<TKey>([...inflight.keys(), ...completed.keys()])
		disposed = Promise.allSettled([...keys].flatMap((key) => cancelOwnedRemoteFor(key))).then(() => {})
		return disposed
	}

	const { pauseThisTask, startWaiting } = clock
	return { schedule, pauseThisTask, startWaiting, cancel, cancelAll, handoffInclusive, handoffCompleted, rearm, dispose }
}

/** The timer-fired estimate run, hoisted to module level so the timer's
 *  callback itself carries no branching. The staleness re-checks sit AFTER the
 *  awaited run on every settle path — the positions the engine's counters
 *  contract requires — and the finally-side estimating clear fires only for
 *  the run that still owns its key's counter. */
async function runScheduledEstimate<TResult>(ctx: {
	markStarted: () => void
	run: () => Promise<TResult>
	isStale: () => boolean
	settleSuccess: (r: TResult) => void
	settleFailure: (err: unknown) => void
	clearEstimating: () => void
}): Promise<void> {
	try {
		ctx.markStarted()
		const r = await ctx.run()
		if (ctx.isStale()) return
		ctx.settleSuccess(r)
	} catch (err) {
		if (ctx.isStale()) return
		ctx.settleFailure(err)
	} finally {
		if (!ctx.isStale()) {
			ctx.clearEstimating()
		}
	}
}
