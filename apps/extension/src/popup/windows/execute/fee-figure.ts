import { classifyFeePayer, isEmbeddedFeePayment } from "@nulo/wallet-bridge"
import { isPrivateFpc } from "@/wallet/services/fpc/private-fpc-address"
import type { DraftUIOperation } from "./types"

/** A send whose app set its own cap or priority fee, either of which may raise the charge. */
function setsOwnFee(op: DraftUIOperation): boolean {
	if (op.kind === "send_transaction") return Boolean(op.fee?.maxFeesPerGas || op.fee?.maxPriorityFeesPerGas)
	if (op.kind !== "aztec_sendTx") return false
	const gas = op.opts?.fee?.gasSettings
	return Boolean(gas?.maxFeesPerGas || gas?.maxPriorityFeesPerGas)
}

/** An app's own payment that claims Fee Juice to the account, which then pays the fee itself. */
function claimsToAccount(op: DraftUIOperation): boolean {
	if (op.kind === "send_transaction") return op.fee?.embeddedFeePayment === "fjwc"
	return op.kind === "aztec_sendTx" && classifyFeePayer(op.exec?.feePayer, op.opts?.from, op.exec?.calls) === "fjwc"
}

/** An app's own payment naming the PrivateFPC as payer, which charges the sender's own Private Fee
 *  Juice. */
export function paysFromPrivateFeeJuice(op: DraftUIOperation): boolean {
	return op.kind === "aztec_sendTx" && isPrivateFpc(op.exec?.feePayer)
}

/** An app's own payment the person pays all the same: a claim to the account, or one through the
 *  PrivateFPC. */
export function personPaysAppPayment(op: DraftUIOperation): boolean {
	return claimsToAccount(op) || paysFromPrivateFeeJuice(op)
}

/** The paying method the window's fee card reports; `fpc` is a sponsor, never the person. */
export type FeePayerPick = { type: "fj" | "private_fpc" | "fpc" }

/**
 * Whether Confirm waits for this operation's estimate. The figure is what an approval holds the
 * send to wherever the person pays: a method picked in the window other than a sponsor (`payer`,
 * waited on while unknown), or an app's payment the person makes all the same. It is also the
 * charge an app's own cap or priority commits. A default-entrypoint operation is never estimated.
 */
export function waitsForFeeFigure(op: DraftUIOperation, payer?: FeePayerPick | null): boolean {
	if (op.kind !== "send_transaction" && op.kind !== "aztec_sendTx") return false
	if (op.kind === "aztec_sendTx" && op.executionMode === "default_entrypoint") return false
	const personPicks = !isEmbeddedFeePayment(op) && payer?.type !== "fpc"
	return personPicks || personPaysAppPayment(op) || setsOwnFee(op)
}

/**
 * Whether this operation holds Confirm. While its estimate or authorization preview is scheduled or
 * running, always: confirm holds the approval to the authorizations that run lists. Once settled,
 * `waitsForFeeFigure` decides.
 */
export function holdsConfirm(
	op: DraftUIOperation,
	payer: FeePayerPick | null | undefined,
	estimate: { landed: boolean; inFlight: boolean },
): boolean {
	return estimate.inFlight || (waitsForFeeFigure(op, payer) && !estimate.landed)
}
