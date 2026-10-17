/**
 * A Fee Juice quote pinned for a spec that reads a fee's dollars. The network suite reaches the live
 * provider, whose quote would replace a seeded one; the pin refuses the provider and seeds the quote,
 * so the expected text comes from the helper the popup prints with, at a known rate.
 */
import { feeDisplay, feeText, FEE_JUICE_DECIMALS, FEE_READOUT_UNIT } from "@/utils/fee-estimation"
import { parseAmountToBaseUnits } from "@/utils/amount"
import { type ArmedInterception, interceptRpc, openScratchPage } from "./browser"
import type { ExtensionContext } from "./extension"

/** Inside AZTEC's sanity band, and high enough that a sandbox fee prints whole tenths of a cent. */
export const PINNED_FEE_JUICE_USD = 7

/**
 * Refuses the provider for the returned interception's life, then writes the quote beside the cached
 * ones. A fee card reads the quote when it mounts, so pin before the screen opens. A fetch already in
 * flight when the refusal arms still lands, within its 10 s abort; the quote is stamped 30 s ahead,
 * inside the 2 min skew the cache accepts, so that fetch's merge keeps it.
 */
export async function pinFeeJuiceQuote(ctx: ExtensionContext): Promise<ArmedInterception> {
	const refused = await interceptRpc(ctx.browser, ctx.extensionId, "https://api.coingecko.com", { kind: "refuse" })
	const page = await openScratchPage(ctx.browser, ctx.extensionId)
	try {
		await page.evaluate(async (usd: number) => {
			const key = "nulo:core:token-prices"
			const stored = (await chrome.storage.local.get(key))[key]
			const quotes = typeof stored === "string" ? JSON.parse(stored) : {}
			quotes.aztec = { coingeckoId: "aztec", usd, fetchedAt: Date.now() + 30_000, providerUpdatedAt: null }
			await chrome.storage.local.set({ [key]: JSON.stringify(quotes) })
		}, PINNED_FEE_JUICE_USD)
	} finally {
		await page.close()
	}
	return refused
}

/** A fee in base units as the popup prints it at the pinned quote. */
export const pinnedFeeText = (raw: string | bigint): string => feeText(feeDisplay(raw, PINNED_FEE_JUICE_USD))

/**
 * What the popup can print, at the pinned quote, for a fee whose figure reads `amount`: a spec that
 * reads only the figure cannot know the base units under it, and the dollars of the interval's two
 * ends may round apart.
 */
export function pinnedFeeTexts(amount: string): ReadonlySet<string> {
	const raw = parseAmountToBaseUnits(amount, FEE_JUICE_DECIMALS)
	const half = FEE_READOUT_UNIT / 2n
	return new Set([pinnedFeeText(raw > half ? raw - half : 0n), pinnedFeeText(raw + half - 1n)])
}
