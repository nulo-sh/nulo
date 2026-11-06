import { ContractAssertionError } from "@nulo/extension-messaging/errors"
import { sameFieldAddress } from "@nulo/wallet-bridge"
import { stripWireControl } from "@/wallet/services/dapp-session/capability-meta"
import type { WireCall } from "./call-surface"
import { safeWire } from "./humanize"

/** The app's own assertion when a frame matches one of `calls` by contract and selector both: a fee
 *  contract the request also calls raises the same text from its own setup. */
export function appAssertion(error: unknown, calls: readonly WireCall[]): string | undefined {
	if (!(error instanceof ContractAssertionError)) return undefined
	const { assertion, frames } = error.details
	const ran = frames.some(
		({ contract, selector }) =>
			selector !== undefined &&
			calls.some(
				(call) =>
					typeof call.to === "string" &&
					typeof call.selector === "string" &&
					call.selector.toLowerCase() === selector.toLowerCase() &&
					sameFieldAddress(call.to, contract),
			),
	)
	if (!ran) return undefined
	const text = stripWireControl(assertion.replace(/[\r\n\t\u2028\u2029]+/gu, " "))
		.replace(/ {2,}/gu, " ")
		.trim()
		.replace(/[\s.]+$/u, "")
	return text ? safeWire(text, 120) : undefined
}
