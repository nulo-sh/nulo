import { AuthRegistryRefusalError, ScopeViolationError, UnattachedAuthorizationRefusalError } from "@nulo/extension-messaging/errors"

/** Which check refused the request: the authorization registry, another account's authorization
 *  the app did not attach, or a call's name against its selector. */
export type RefusalKind = "registry" | "unattached" | "call"

/** Classified by class, never by text: the scope refusals an estimate or preview can meet are the
 *  registry's, the unattached authorization's and the call binding's, and the binding's is a plain
 *  `ScopeViolationError`, so every subclass is tested first. */
export function refusalKind(error: unknown): RefusalKind | undefined {
	if (error instanceof AuthRegistryRefusalError) return "registry"
	if (error instanceof UnattachedAuthorizationRefusalError) return "unattached"
	if (error instanceof ScopeViolationError) return "call"
	return undefined
}

export const REFUSAL_TITLE = "Nulo won't send this"

export const REFUSAL_REASON: Record<RefusalKind, string> = {
	registry:
		"This transaction asks your account to change its public authorizations from inside another contract. Apps are never allowed to, so it can't be sent. Reject tells the app.",
	unattached:
		"This transaction uses an authorization from another of your accounts, and the app did not include it. Nulo signs only for the account that sends, so it can't be sent. Reject tells the app.",
	call: "A call in this transaction does not run the function it names. Nulo never sends such a call, so it can't be sent. Reject tells the app.",
}
