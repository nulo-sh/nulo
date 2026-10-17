/**
 * A Fee Juice quote pinned for a spec that reads a fee's dollars. The network suite reaches the live
 * provider, whose quote would replace a seeded one; the pin refuses the provider and seeds the quote,
 * so the expected text comes from the helper the popup prints with, at a known rate.
 */
import type { Page } from "puppeteer"
import { parseAmountToBaseUnits } from "@/utils/amount"
import { FEE_JUICE_DECIMALS, FEE_READOUT_UNIT, feeDisplay, feeText } from "@/utils/fee-estimation"
import { PRICE_FETCH_TIMEOUT_MS } from "@/wallet/services/price/spec"
import { type ArmedInterception, interceptRpc, openScratchPage } from "./browser"
import type { ExtensionContext } from "./extension"

/** Inside AZTEC's sanity band, and high enough that a sandbox fee prints whole tenths of a cent. */
export const PINNED_FEE_JUICE_USD = 7

export interface PricePin {
	refused: ArmedInterception
	armedAt: number
}

/** Refuses the provider for the pin's life. Arm it at the scenario's start, then seed before the screen. */
export async function refusePrices(ctx: ExtensionContext): Promise<PricePin> {
	const refused = await interceptRpc(ctx.browser, ctx.extensionId, "https://api.coingecko.com", { kind: "refuse" })
	return { refused, armedAt: Date.now() }
}

/**
 * Writes the quote beside the cached ones. A fetch begun before the refusal armed reads the cache before
 * it writes it, so landing after the seed it would put the live quote back; the service aborts every
 * fetch within `PRICE_FETCH_TIMEOUT_MS` and a refused one writes nothing, so the seed waits out what is
 * left of that window, plus a second for the write. A write delayed past that is not covered; only a
 * refusal armed at launch, before any fetch, would cover it. A fee card reads the quote when it mounts:
 * seed before the screen opens.
 */
export async function seedFeeJuiceQuote(ctx: ExtensionContext, pin: PricePin): Promise<void> {
	const settled = pin.armedAt + PRICE_FETCH_TIMEOUT_MS + 1_000 - Date.now()
	if (settled > 0) await new Promise((resolve) => setTimeout(resolve, settled))
	const page = await openScratchPage(ctx.browser, ctx.extensionId)
	try {
		await page.evaluate(async (usd: number) => {
			const key = "nulo:core:token-prices"
			const stored = (await chrome.storage.local.get(key))[key]
			const quotes = typeof stored === "string" ? JSON.parse(stored) : {}
			quotes.aztec = { coingeckoId: "aztec", usd, fetchedAt: Date.now(), providerUpdatedAt: null }
			await chrome.storage.local.set({ [key]: JSON.stringify(quotes) })
		}, PINNED_FEE_JUICE_USD)
	} finally {
		await page.close()
	}
}

/**
 * The element's text once it reads `expected`, else as it reads after `timeout`, for the caller to
 * assert: a fee card renders its figures before its quote's read answers, then adds the dollars.
 */
export async function settledText(page: Page, testid: string, expected: string, timeout = 15_000): Promise<string | undefined> {
	const sel = `[data-testid="${testid}"]`
	const text = (s: string) => document.querySelector(s)?.textContent?.replace(/\s+/g, " ").trim()
	await page
		.waitForFunction(
			(s: string, want: string) => document.querySelector(s)?.textContent?.replace(/\s+/g, " ").trim() === want,
			{ timeout, polling: 100 },
			sel,
			expected,
		)
		.catch(() => undefined)
	return page.evaluate(text, sel)
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
