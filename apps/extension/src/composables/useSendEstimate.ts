import { ImportedAccountUnusableError } from "@nulo/extension-messaging/errors"
import { ref, watch } from "vue"
import { useToast } from "@/composables/toast.js"
import { useFeeEstimation } from "@/composables/useFeeEstimation"
import { EstimateRequeue, estimateWhenClear } from "@/utils/estimate-when-clear"
import type { ExecutionServiceClient, TransferFeeQueued } from "@/wallet/services/execution/client"

type EstimateArgs = Parameters<ExecutionServiceClient["estimateTransferFee"]>
type TransferEstimate = Awaited<ReturnType<ExecutionServiceClient["estimateTransferFee"]>>

interface TransferEstimateParams {
	networkId: EstimateArgs[0]
	accountAddress: EstimateArgs[1]
	tokenId: EstimateArgs[2]
	tokenContract: EstimateArgs[3]
	transferType: EstimateArgs[4]
	destination: EstimateArgs[5]
	amount: EstimateArgs[6]
	settings: EstimateArgs[7]
}

type EstimateClient = Pick<ExecutionServiceClient, "estimateTransferFee" | "cancelEstimate" | "onEstimateStarted">

interface SendEstimateDeps {
	/** Connected by the page, which disconnects it only once no submit is pending. */
	executionService: EstimateClient
	/** The page mount's id in the log lines. */
	instanceId: string
	/** Whether the form can be estimated now; false cancels the estimate. */
	ready: () => boolean
	/** The question to ask, read only once `ready()` holds. */
	params: () => TransferEstimateParams
	/** The fee read refused the account: its imported key does not open. */
	onUnusable: () => void
}

/** How long an estimate asked in a task marked by `pauseThisTask` waits before it starts. */
const ESTIMATE_PAUSE_MS = 800
/** How long one question may run before the fee card and the review say so and offer to ask again. */
const ESTIMATE_SLOW_MS = 20_000

/**
 * Send's transfer-fee estimate: the question, the queued answer an earlier send's chain state gives,
 * the slow clock and the failure snack. The page owns the execution client and calls `dispose()`.
 */
export function useSendEstimate(deps: SendEstimateDeps) {
	const { executionService, instanceId } = deps
	const { openToast, toast, closeToast } = useToast()
	/** The wallet answered that an earlier send holds this transfer's chain state; set until the
	 *  estimate's run starts, lands, fails or stops, so nothing the person pays goes out on a fee they
	 *  have not seen. */
	const feeQueued = ref(false)
	/** The cap the queued answer offered (`{ basis, cap }`), or null when it offered none. */
	const queuedCap = ref<TransferFeeQueued["cap"] | null>(null)
	const estimateFailed = ref(false)
	const estimateSlow = ref(false)
	/** The snack that reported the failure: the next question closes it unless another replaced it. */
	let failureSnackId: number | undefined
	let estimateSlowTimer: ReturnType<typeof setTimeout> | undefined
	/** What the running estimate was asked: a requeue repeats it with a fresh token. */
	let lastEstimateParams: TransferEstimateParams | undefined

	const clearEstimateFailure = () => {
		estimateFailed.value = false
		if (failureSnackId !== undefined && toast.value?.id === failureSnackId) closeToast()
		failureSnackId = undefined
	}
	const clearQueued = () => {
		feeQueued.value = false
		queuedCap.value = null
	}

	const engine = useFeeEstimation<TransferEstimateParams, TransferEstimate>({
		debounceMs: ESTIMATE_PAUSE_MS,
		estimate: (params, estimateToken, signal) => {
			const ask = transferFeeAsk(executionService, params, estimateToken)
			lastEstimateParams = params
			console.debug(`[send:${instanceId}] estimateTransferFee firing`)
			return estimateWhenClear(ask, signal, {
				onQueued: (answer) => {
					if (signal.aborted) return
					feeQueued.value = true
					// A spent token's answer carries no cap; the requeue's own answer will.
					if (!answer.tokenSpent) queuedCap.value = answer.cap ?? null
				},
				start: { events: executionService.onEstimateStarted, estimateToken, onStarted: clearQueued },
			})
		},
		cancelRemote: (estimateToken) => {
			executionService.cancelEstimate(estimateToken).catch(() => {})
		},
		onError: (err) => {
			// Rescheduled before the engine's settle clears `isEstimating`, so the queued row never drops.
			if (err instanceof EstimateRequeue) return engine.estimate(lastEstimateParams as TransferEstimateParams)
			clearQueued()
			if (err instanceof ImportedAccountUnusableError) return deps.onUnusable()
			console.error(`[send:${instanceId}] estimateTransferFee failed:`, err)
			estimateFailed.value = true
			failureSnackId = openToast({ kind: "error", label: "Couldn't estimate fee. Try again." })
		},
	})
	const { isEstimating } = engine

	// The queued flag outlives requeues (the engine stays estimating) but never the estimate itself.
	watch(isEstimating, (estimating) => {
		if (!estimating) clearQueued()
	})

	/** Every new question restarts it: a reschedule leaves `isEstimating` true, so the watch alone misses it. */
	function restartSlowClock() {
		clearTimeout(estimateSlowTimer)
		estimateSlow.value = false
		if (isEstimating.value) estimateSlowTimer = setTimeout(() => (estimateSlow.value = true), ESTIMATE_SLOW_MS)
	}
	watch(isEstimating, restartSlowClock)

	function request() {
		clearEstimateFailure()
		if (!deps.ready()) {
			engine.cancel()
			return
		}
		// New input asks a new question: it is queued only once the wallet says so again.
		clearQueued()
		engine.estimate(deps.params())
		restartSlowClock()
	}

	return {
		feeEstimate: engine.result,
		isEstimating,
		feeQueued,
		queuedCap,
		estimateFailed,
		estimateSlow,
		request,
		handoff: engine.handoff,
		pauseThisTask: engine.pauseThisTask,
		startWaiting: engine.startWaiting,
		/** Not terminal: the engine's own dispose, at scope stop, refuses every later question. */
		dispose: () => {
			engine.cancel()
			clearTimeout(estimateSlowTimer)
		},
	}
}

/** The RPC an estimate asks, its arguments read off `params` before the estimator records them. */
function transferFeeAsk(executionService: EstimateClient, params: TransferEstimateParams, estimateToken: string) {
	const { networkId, accountAddress, tokenId, tokenContract, transferType: tt, destination, amount, settings } = params
	return () =>
		executionService.estimateTransferFee(
			networkId,
			accountAddress,
			tokenId,
			tokenContract,
			tt,
			destination,
			amount,
			settings,
			estimateToken,
		)
}
