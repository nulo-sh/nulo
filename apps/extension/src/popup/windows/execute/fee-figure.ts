import { classifyFeePayer, isEmbeddedFeePayment } from "@nulo/wallet-bridge"
import type { DraftUIOperation } from "./types"

/** A send whose app set its own cap or priority fee, either of which may raise the charge. */
function setsOwnFee(op: DraftUIOperation): boolean {
	if (op.kind === "send_transaction") return Boolean(op.fee?.maxFeesPerGas || op.fee?.maxPriorityFeesPerGas)
	if (op.kind !== "aztec_sendTx") return false
	const gas = op.opts?.fee?.gasSettings
	return Boolean(gas?.maxFeesPerGas || gas?.maxPriorityFeesPerGas)
}

/** An app's own payment that claims Fee Juice to the account, which then pays the fee itself. */
export function claimsToAccount(op: DraftUIOperation): boolean {
	if (op.kind === "send_transaction") return op.fee?.embeddedFeePayment === "fjwc"
	return op.kind === "aztec_sendTx" && classifyFeePayer(op.exec?.feePayer, op.opts?.from, op.exec?.calls) === "fjwc"
}

/**
 * Whether Confirm waits for this operation's estimate. The figure is what an approval holds the
 * send to wherever the wallet picks the fee or the account pays it, and it is the charge an app's
 * own cap or priority commits. A default-entrypoint operation is never estimated: nothing to wait for.
 */
export function waitsForFeeFigure(op: DraftUIOperation): boolean {
	if (op.kind !== "send_transaction" && op.kind !== "aztec_sendTx") return false
	if (op.kind === "aztec_sendTx" && op.executionMode === "default_entrypoint") return false
	return !isEmbeddedFeePayment(op) || claimsToAccount(op) || setsOwnFee(op)
}
