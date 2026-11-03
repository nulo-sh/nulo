import { type FeeCallLike, type FeePayerRoute, classifyFeePayer } from "@nulo/wallet-bridge"

/** The embedded payment a payer route names, or undefined for a route that embeds none. */
export function embeddedPaymentOf(route: FeePayerRoute | undefined): "fjwc" | "fpc" | undefined {
	return route === "fjwc" || route === "fpc" ? route : undefined
}

/**
 * The embedded fee payment a payload carries — "fjwc" (the sender claims Fee Juice in setup) or
 * "fpc" (an external contract pays) — or undefined when it carries none: no payer, or a sender who
 * only asks to pay from held Fee Juice. That last shape is a requested self-pay, not an embedded
 * payment: the wallet's own Fee Juice method pays it, and building it as a claim in setup would
 * never end setup.
 */
export function detectEmbeddedFeePayment(feePayer: unknown, from: unknown, calls?: ReadonlyArray<FeeCallLike>): "fjwc" | "fpc" | undefined {
	return embeddedPaymentOf(classifyFeePayer(feePayer, from, calls))
}
