import { AuthRegistryRefusalError, ScopeViolationError } from "@nulo/extension-messaging/errors"

/** Which check refused the request: the authorization registry, or a call's name against its selector. */
export type RefusalKind = "registry" | "call"

/** Classified by class, never by text: the only scope refusals an estimate or preview can meet are
 *  the registry's and the call binding's, and the binding's is a plain `ScopeViolationError`. */
export function refusalKind(error: unknown): RefusalKind | undefined {
	if (error instanceof AuthRegistryRefusalError) return "registry"
	if (error instanceof ScopeViolationError) return "call"
	return undefined
}

export const REFUSAL_TITLE = "Nulo won't send this"

export const REFUSAL_REASON: Record<RefusalKind, string> = {
	registry:
		"This transaction asks your account to change its public authorizations from inside another contract. Apps are never allowed to, so it can't be sent. Reject tells the app.",
	call: "A call in this transaction does not run the function it names. Nulo never sends such a call, so it can't be sent. Reject tells the app.",
}
