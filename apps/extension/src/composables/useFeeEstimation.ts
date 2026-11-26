import { nextTick, onScopeDispose, ref, type Ref } from "vue"
import { createFeeEstimationEngine } from "./internal/fee-estimation-engine"

export interface UseFeeEstimationOptions<TParams, TResult> {
	/**
	 * The async estimator. Receives the params handed to `estimate(params)`
	 * plus the caller-minted cancellation token for this attempt — thread it
	 * into `estimateTransferFee` / `estimateOperationFee` so the SW can
	 * abort + evict on remote cancel. `signal` aborts once this attempt is superseded or abandoned.
	 */
	estimate: (params: TParams, estimateToken: string, signal: AbortSignal) => Promise<TResult>
	/** The pause an estimate asked in a task the caller marked with `pauseThisTask` waits. Default: 800ms. */
	debounceMs?: number
	/**
	 * Called when the estimator throws a real error (not a stale-counter cancel).
	 * The composable already swallows the error and clears `result` — this hook
	 * is for logging or surfacing user-visible state.
	 */
	onError?: (err: unknown) => void
	/**
	 * Fire-and-forget remote cancel (`executionService.cancelEstimate`).
	 * Invoked for a superseded or abandoned token whose RPC actually started —
	 * an estimate that never started needs no remote cancel. Never invoked for
	 * tokens released via `handoff()` (ownership transferred to the
	 * execution path, which is about to consume the stashed estimate).
	 */
	cancelRemote?: (estimateToken: string) => void
}

export interface UseFeeEstimationResult<TParams, TResult> {
	/** Latest successful estimation, or `null` while pending or after a failure. */
	result: Ref<TResult | null>
	/** True from the moment `estimate()` is called until the result lands or fails. */
	isEstimating: Ref<boolean>
	/**
	 * Schedule an estimation: it starts once the task ends, or after the pause in a marked task.
	 * Cancels any in-flight one (incl. remotely).
	 */
	estimate: (params: TParams) => void
	/** The person typed in this task, or an answer's consequence is handled in it: what it schedules waits the pause. */
	pauseThisTask: () => void
	/**
	 * A pick that may leave every input as it was (Max on the same amount, the unit switch): once the
	 * changes it made have scheduled, starts the estimate still waiting its pause, if any. Call it
	 * after the pick's writes.
	 */
	startWaiting: () => void
	/** Cancel the pending estimation (if any) and clear `result`. Safe to call repeatedly. */
	cancel: () => void
	/**
	 * Disarm cancellation for the current estimate — call on successful
	 * submit, BEFORE navigating away, so unmount cleanup cannot race the
	 * fire-and-forget confirm out of its stashed reuse entry. Returns the
	 * handed-off token (or null when there's nothing to hand off).
	 * Deliberately in-flight-inclusive, unlike the keyed `handoffAll()`.
	 */
	handoff: () => string | null
	/** Manually dispose. Auto-runs on scope stop. */
	dispose: () => void
}

/** The engine is keyed; the single-slot composable uses one fixed key. */
const SINGLE_SLOT = 0

export function useFeeEstimation<TParams, TResult>(
	options: UseFeeEstimationOptions<TParams, TResult>,
): UseFeeEstimationResult<TParams, TResult> {
	const { estimate, debounceMs = 800, onError, cancelRemote } = options

	const result = ref<TResult | null>(null) as Ref<TResult | null>
	const isEstimating = ref(false)

	const engine = createFeeEstimationEngine<typeof SINGLE_SLOT, TParams, TResult>({
		// The single-slot path does no per-op SW-side coalescing: no flowKey
		// (or instanceId) exists here, so the key is not passed on.
		run: (params, estimateToken, _key, signal) => estimate(params, estimateToken, signal),
		debounceMs,
		onResult: (_key, r) => {
			result.value = r
		},
		onEstimating: (_key, estimating) => {
			isEstimating.value = estimating
		},
		onError: onError ? (_key, err) => onError(err) : undefined,
		cancelRemote,
	})

	onScopeDispose(engine.dispose)

	return {
		result,
		isEstimating,
		estimate: (params) => engine.schedule(SINGLE_SLOT, params),
		pauseThisTask: engine.pauseThisTask,
		startWaiting: () => {
			// Vue's flush runs the watchers the pick's writes queued before this, so their schedule is the one started.
			void nextTick(() => engine.startWaiting(SINGLE_SLOT))
		},
		cancel: () => engine.cancel(SINGLE_SLOT),
		handoff: () => engine.handoffInclusive(SINGLE_SLOT),
		dispose: engine.dispose,
	}
}
