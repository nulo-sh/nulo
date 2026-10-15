import { ServiceClient } from "@nulo/extension-messaging/background"
import { EventHandler } from "@nulo/wallet-core/utils"
import type { ServiceSpec } from "@/wallet/base"
import { documentLogger } from "@/wallet/services/logger/client"
import {
	type Events,
	type Methods,
	NETWORK_RESET_SERVICE_NAME,
	type PendingReset,
	type ResetConfirmation,
	type ResetNotice,
	type StaleNetworkChanged,
	type StaleNetworkView,
} from "./spec"

export * from "./spec"

export class NetworkResetServiceClient extends ServiceClient<Methods, Events> implements ServiceSpec<Methods, Events> {
	public readonly onStaleNetworkChanged = new EventHandler<StaleNetworkChanged>()

	public constructor(name?: string) {
		super(NETWORK_RESET_SERVICE_NAME, documentLogger(), name)
	}

	public getStaleNetwork(networkId: string): Promise<StaleNetworkView | null> {
		return this.request("getStaleNetwork", networkId)
	}

	public getPendingReset(): Promise<PendingReset | null> {
		return this.request("getPendingReset")
	}

	public resetStaleNetwork(networkId: string, confirmed: ResetConfirmation): Promise<StaleNetworkView> {
		return this.request("resetStaleNetwork", networkId, confirmed)
	}

	public takeResetNotice(profileId: string): Promise<ResetNotice | null> {
		return this.request("takeResetNotice", profileId)
	}
}
