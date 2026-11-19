/** What decides Send's button label. */
export interface SendButtonState {
	sending: boolean
	/** Nothing is missing: the press opens the review. */
	allowed: boolean
	/** An estimate is running and no queue lets the send go out meanwhile. */
	estimating: boolean
	amountEmpty: boolean
	/** The amount card shows a refusal. */
	amountRefused: boolean
	/** The fee cannot be paid or estimated as it stands. */
	feeRefused: boolean
}

/** The ready label, and what an off button names as missing; a cause with no words keeps the ready
 *  label beside the banner or notice that names it. */
export function sendButtonLabel(state: SendButtonState): string {
	if (state.sending) return "CONFIRMING"
	if (state.allowed) return "Review send"
	if (state.amountEmpty) return "Enter an amount"
	if (state.amountRefused) return "Fix the amount"
	if (state.feeRefused) return "Fix the fee"
	if (state.estimating) return "Estimating fee"
	return "Review send"
}
