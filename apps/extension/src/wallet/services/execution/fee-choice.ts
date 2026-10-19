import { type FeeSettings, sameFieldAddress } from "@nulo/wallet-bridge"
import type { FeeChoice, TxCall } from "@/wallet/services/transaction/spec"

/** Who chose the fee payment: the person, in the wallet, or the app, in its own payload. */
export type FeeChooser = "wallet" | "app"

/** The materializer sets `embedded` exactly when the request carries its own fee payment, and the
 *  approval window never offers it, so it is the app's choice and every other kind the person's. */
export function feeChooserOf(feeSettings: FeeSettings): FeeChooser {
	return feeSettings.paymentMethod.kind === "embedded" ? "app" : "wallet"
}

/**
 * The fee chooser a transaction row records. An app's pick is `app_protocol_sponsor` when any of its
 * calls is `sponsor_unconditionally` on `protocolSponsor`, the canonical SponsoredFPC's derived
 * address: that contract elects itself fee payer and the kernel refuses a second one, so a recorded
 * call to it is what paid. Any position counts, so a decoy fee call ahead of it cannot withhold the
 * label; no address, or the method on any other contract, reads as the app's plain pick.
 */
export function feeChoiceOf(
	by: FeeChooser,
	calls: readonly Pick<TxCall, "contract" | "method">[],
	protocolSponsor: string | undefined,
): FeeChoice {
	if (by === "wallet") return "wallet"
	if (protocolSponsor === undefined) return "app"
	const sponsored = calls.some(
		(call) =>
			call.method === "sponsor_unconditionally" &&
			typeof call.contract === "string" &&
			sameFieldAddress(call.contract, protocolSponsor),
	)
	return sponsored ? "app_protocol_sponsor" : "app"
}
