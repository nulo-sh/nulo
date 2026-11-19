import {
	AuthRegistryRefusalError,
	DefaultEntrypointMultiCallError,
	DefaultEntrypointNoCallError,
	DefaultEntrypointPublicCallError,
	DefaultEntrypointUtilityCallError,
	ScopeViolationError,
	UnattachedAuthorizationRefusalError,
} from "@nulo/extension-messaging/errors"

/** Which check refused the request: the authorization registry, another account's authorization
 *  the app did not attach, a call's name against its selector, or what the default entrypoint,
 *  which runs with no account, cannot build: a public call, a utility call, several calls or none. */
export type RefusalKind = "registry" | "unattached" | "call" | "public" | "utility" | "several" | "none"

/** Classified by class, never by text: the refusals an estimate or preview can meet are the
 *  registry's, the unattached authorization's, the call binding's and the default entrypoint's, and
 *  the binding's is a plain `ScopeViolationError`, so every subclass is tested first. */
export function refusalKind(error: unknown): RefusalKind | undefined {
	if (error instanceof AuthRegistryRefusalError) return "registry"
	if (error instanceof UnattachedAuthorizationRefusalError) return "unattached"
	if (error instanceof ScopeViolationError) return "call"
	if (error instanceof DefaultEntrypointPublicCallError) return "public"
	if (error instanceof DefaultEntrypointUtilityCallError) return "utility"
	if (error instanceof DefaultEntrypointMultiCallError) return "several"
	if (error instanceof DefaultEntrypointNoCallError) return "none"
	return undefined
}

export const REFUSAL_TITLE = "Nulo won't send this"

export const REFUSAL_REASON: Record<RefusalKind, string> = {
	registry:
		"This transaction asks your account to change its public authorizations from inside another contract. Apps are never allowed to, so it can't be sent. Reject tells the app.",
	unattached:
		"This transaction uses an authorization from another of your accounts, and the app did not include it. Nulo signs only for the account that sends, so it can't be sent. Reject tells the app.",
	call: "A call in this transaction does not run the function it names. Nulo never sends such a call, so it can't be sent. Reject tells the app.",
	public: "This transaction runs a public call without an account, which Nulo can't send. Reject tells the app.",
	utility: "This app asked for a utility call without an account. Nulo can only run it from an account.",
	several: "This app asked for several calls without an account. Nulo can only run one call this way.",
	none: "This app asked Nulo to run nothing, with no account. There is nothing to approve.",
}
