import { watch } from "vue"
import type { TransferFeeEstimate } from "@/wallet/services/execution/spec"
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
	onError: (err: unknown) => void
}

/**
 * Fee estimates for transactions a popup has the service worker build, one per key. A result counts
 * only for the inputs it was asked with: `refresh` re-asks (or drops) a key whenever its inputs
 * change, and a scope change re-asks every key synchronously, so no answer for another profile,
 * network or account survives the switch. The parent calls `refresh` on each input change and
 * `cancelAll` on hide.
 */
export function useWalletTxEstimates<P>(deps: WalletTxEstimatesDeps<P>) {
	const map = useFeeEstimationMap<number, P, TransferFeeEstimate>({
		estimate: deps.estimate,
		cancelRemote: (token) => {
			deps.cancel(token).catch(() => {})
		},
		onError: (_key, err) => deps.onError(err),
	})

	const refresh = (key: number) => {
		const params = deps.paramsOf(key)
		if (params === undefined) map.cancel(key)
		else map.estimate(key, params)
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
		refresh,
		refreshAll,
		landed,
		short,
		cancelAll: map.cancelAll,
		dispose: () => {
			stopScope()
			map.dispose()
		},
	}
}
