/**
 * The authorization registry's grant functions answer only the wallet's own authorization action,
 * so a public authorization a dApp obtains by naming the registry is always one the wallet indexed
 * and can revoke. Leaf module: imports only leaves.
 */
import { STANDARD_AUTH_REGISTRY_ADDRESS } from "@aztec-labs/standard-contracts/auth-registry/constants"
import { FunctionSelector } from "@aztec-labs/stdlib/abi"
import { sameFieldAddress } from "./field-address"

/** `set_authorized(Field,bool)`, `set_reject_all(bool)` and `set_authorized_private((Field),Field,bool)`;
 *  pinned by test against the installed artifact. */
export const AUTH_REGISTRY_GRANT_SELECTORS: ReadonlySet<string> = new Set(["0xb839de91", "0x8955f5fc", "0x79a3d418"])

export function isAuthRegistry(address: unknown): boolean {
	return sameFieldAddress(String(address), STANDARD_AUTH_REGISTRY_ADDRESS.toString())
}

/** The schema admits any hex spelling of a selector, so it is compared by value. */
function selectorKey(selector: unknown): string | undefined {
	try {
		return FunctionSelector.fromString(String(selector)).toString()
	} catch {
		return undefined
	}
}

/** A call to a registry grant function, by the selector the entrypoint runs, never the name. A
 *  registry call whose selector cannot be read counts as one. */
export function isAuthRegistryGrantCall(call: { to?: unknown; selector?: unknown }): boolean {
	if (!isAuthRegistry(call.to)) return false
	const key = selectorKey(call.selector)
	return key === undefined || AUTH_REGISTRY_GRANT_SELECTORS.has(key)
}
