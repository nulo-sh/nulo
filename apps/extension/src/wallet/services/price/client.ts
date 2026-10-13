import type { ServiceSpec } from "@/wallet/base"
import { ServiceClient } from "@nulo/extension-messaging/background"
import { documentLogger } from "@/wallet/services/logger/client"
import { EventHandler } from "@nulo/wallet-core/utils"
import { PRICE_SERVICE_NAME, type Events, type Methods, type PriceSnapshot } from "./spec"

export * from "./spec"
export { getPriceMapEntry, FEE_JUICE_ENTRY, type PricedTokens } from "./price-map"
export { formatUsdMicro, parseUsdToMicro, tokenAmountToUsdMicro, usdToTokenAmount } from "./convert"

export class PriceServiceClient extends ServiceClient<Methods, Events> implements ServiceSpec<Methods, Events> {
	public readonly onQuotesUpdated = new EventHandler<PriceSnapshot>()

	public constructor(name?: string) {
		super(PRICE_SERVICE_NAME, documentLogger(), name)
	}

	public getQuotes(): Promise<PriceSnapshot> {
		return this.request("getQuotes")
	}

	public refreshIfStale(): Promise<PriceSnapshot> {
		return this.request("refreshIfStale")
	}
}
