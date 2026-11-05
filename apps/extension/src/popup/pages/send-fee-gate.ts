import type { FeePayer } from "@/popup/components/modules/send/fee-helpers"
import type { TransferFeeEstimate, TransferFeeQueued } from "@/wallet/services/execution/client"

/** The fee side of the Send page, as its card reads it. */
export interface SendFeeState {
	/** The wallet answered that an earlier send holds this transfer's chain state, until the
	 *  estimate's run starts, lands, fails or stops. */
	queued: boolean
	/** The cap the queued answer offered, or null when it offered none. */
	queuedCap: TransferFeeQueued["cap"] | null
	payer: FeePayer | null
	estimate: Pick<TransferFeeEstimate, "estimateId" | "maxFee" | "feeJuiceShortfall"> | null
}

/** Queued against the cap: only a fee the person pays, and nothing goes out above the cap shown. */
export function queueCapOf(state: SendFeeState): TransferFeeQueued["cap"] | null {
	return state.queued && state.payer === "self" ? state.queuedCap : null
}

/** Queued with Nulo's sponsor paying: the person pays nothing, so there is no cap to hold it to. A
 *  sponsor added by hand can charge the account, so it never queues. */
export function queuedSponsoredOf(state: SendFeeState): boolean {
	return state.queued && state.payer === "sponsor"
}

/** Queued, and Send stays on: against the cap shown, or with Nulo's sponsor paying. */
export function queueModeOf(state: SendFeeState): boolean {
	return Boolean(queueCapOf(state)) || queuedSponsoredOf(state)
}

/** Nothing goes out on a fee the person has not seen: a failed estimate leaves Send off too. */
export function feeAllowsSend(state: SendFeeState): boolean {
	const queueMode = queueModeOf(state)
	if (state.queued && !queueMode) return false
	if (!queueMode && !state.estimate) return false
	return !state.estimate?.feeJuiceShortfall
}

/** The fee a press hands the transfer: the queued cap, or the estimate to reuse and, where the person
 *  pays, the figure the page showed, which the send is held to. */
export function sendFeeHandoff(state: SendFeeState): { feeCap?: string; precomputedEstimateId?: string; shownFee?: string } {
	const feeCap = queueCapOf(state)?.cap
	const precomputedEstimateId = feeCap ? undefined : state.estimate?.estimateId
	const shownFee = feeCap || state.payer !== "self" ? undefined : state.estimate?.maxFee
	return { feeCap, precomputedEstimateId, shownFee }
}
