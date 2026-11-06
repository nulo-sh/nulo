import { ContractAssertionError } from "@nulo/extension-messaging/errors"
import { sameFieldAddress } from "@nulo/wallet-bridge"
import { stripWireControl } from "@/wallet/services/dapp-session/capability-meta"
import type { WireCall } from "./call-surface"
import { safeWire } from "./humanize"

const SELECTOR = /^0x[0-9a-f]{8}$/i

/**
 * The app's failing assertion, ready for the window, when `error` failed inside one of `calls`: a
 * frame must name that call's contract and selector both, since a fee contract the request also
 * calls raises the same text from its own setup. The text is the contract's, so it is stripped of
 * control characters, trimmed of the trailing stop the window's sentence adds, and capped.
 */
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
					SELECTOR.test(call.selector) &&
					call.selector.toLowerCase() === selector.toLowerCase() &&
					sameFieldAddress(call.to, contract),
			),
	)
	if (!ran) return undefined
	const text = stripWireControl(assertion)
		.trim()
		.replace(/[\s.]+$/u, "")
	return text ? safeWire(text, 120) : undefined
}
