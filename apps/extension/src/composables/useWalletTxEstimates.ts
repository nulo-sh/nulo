import { watch } from "vue"
import type { TransferFeeEstimate } from "@/wallet/services/execution/spec"
import { useToast } from "@/composables/toast"
import { useFeeEstimationMap } from "./useFeeEstimationMap"

export interface WalletTxEstimatesDeps<P> {
	/** The service's estimate RPC for one transaction. */
	estimate: (params: P, estimateToken: string, flowKey: string) => Promise<TransferFeeEstimate>
	/** The service's remote cancel. */
	cancel: (estimateToken: string) => Promise<unknown>
	/** Transaction `key`'s current inputs, or undefined while it cannot be estimated. */
	paramsOf: (key: number) => P | undefined
	keys: () => number[]
	/** Moves on every lock and every change of profile, network or account. */
	scope: () => unknown
	/** Logs a failed estimate; the hook itself tells the person, in the failure snack. */
	onError: (err: unknown) => void
}

/**
 * Fee estimates for transactions a popup has the service worker build, one per key. A result counts
 * only for the inputs it was asked with: `refresh` re-asks (or drops) a key whenever its inputs
 * change, and a scope change re-asks every key synchronously, so no answer for another profile,
 * network or account survives the switch. The parent calls `refresh` on each input change and
 * `cancelAll` on hide. A failure opens one snack, which closes once no key stands failed.
 */
export function useWalletTxEstimates<P>(deps: WalletTxEstimatesDeps<P>) {
	const { openToast, toast, closeToast } = useToast()
	/** The snack that reported a failure: closed once no key stands failed, unless another replaced it. */
	let failureSnackId: number | undefined
	const map = useFeeEstimationMap<number, P, TransferFeeEstimate>({
		estimate: deps.estimate,
		cancelRemote: (token) => {
			deps.cancel(token).catch(() => {})
		},
		onError: (_key, err) => {
			deps.onError(err)
			failureSnackId = openToast({ kind: "error", label: "Couldn't estimate fee. Try again." })
		},
	})
	const retireFailureSnack = () => {
		if (Object.values(map.failed.value).some(Boolean)) return
		if (failureSnackId !== undefined && toast.value?.id === failureSnackId) closeToast()
		failureSnackId = undefined
	}

	const refresh = (key: number) => {
		const params = deps.paramsOf(key)
		if (params === undefined) map.cancel(key)
		else map.estimate(key, params)
		retireFailureSnack()
	}
	const refreshAll = () => {
		for (const key of deps.keys()) refresh(key)
	}
	/** Every key has a result for its current inputs. */
	const landed = () => {
		const keys = deps.keys()
		return keys.length > 0 && keys.every((key) => map.results.value[key] != null)
	}
	/** Some key's payer was read short of its fee: the node would refuse that transaction. */
	const short = () => deps.keys().some((key) => map.results.value[key]?.feeJuiceShortfall !== undefined)

	const stopScope = watch(deps.scope, refreshAll, { flush: "sync" })

	return {
		results: map.results,
		estimating: map.estimating,
		failed: map.failed,
		refresh,
		refreshAll,
		landed,
		short,
		cancelAll: () => {
			map.cancelAll()
			retireFailureSnack()
		},
		dispose: () => {
			stopScope()
			map.dispose()
		},
	}
}
