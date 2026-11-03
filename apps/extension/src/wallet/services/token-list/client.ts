import { ServiceClient } from "@nulo/extension-messaging/background"
import type { ServiceSpec } from "@/wallet/base"
import { documentLogger } from "@/wallet/services/logger/client"
import { type Events, type Methods, type RefreshResult, TOKEN_LIST_SERVICE_NAME } from "./spec"

export * from "./spec"

export class TokenListServiceClient extends ServiceClient<Methods, Events> implements ServiceSpec<Methods, Events> {
	public constructor(name?: string) {
		super(TOKEN_LIST_SERVICE_NAME, documentLogger(), name)
	}

	public refresh(): Promise<RefreshResult> {
		return this.request("refresh")
	}
}
