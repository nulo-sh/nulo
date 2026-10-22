import type { MethodsSpec, ServiceSpec } from "@/wallet/base"
import { ServiceClient, definePassthroughsExhaustive } from "@nulo/extension-messaging/background"
import { documentLogger } from "@/wallet/services/logger/client"
import { type Events, type Methods, UI_PREFERENCE_SERVICE_NAME } from "./spec"

export * from "./spec"

export interface UiPreferenceServiceClient extends MethodsSpec<Methods> {}
// biome-ignore lint/suspicious/noUnsafeDeclarationMerging: the merged interface's methods ARE installed — at runtime by definePassthroughsExhaustive below, whose signature proves the name list covers every Methods key, so no advertised method is missing.
export class UiPreferenceServiceClient extends ServiceClient<Methods, Events> implements ServiceSpec<Methods, Events> {
	public constructor(name?: string) {
		super(UI_PREFERENCE_SERVICE_NAME, documentLogger(), name)
	}
}
definePassthroughsExhaustive<Methods>()(UiPreferenceServiceClient.prototype, [
	"getPinnedTokens",
	"setPinnedTokens",
	"getFeePicks",
	"saveFeePick",
])
