/**
 * Price mapping: which CoinGecko id prices which asset, per chain.
 *
 * Aztec-native tokens are too new to be indexed anywhere, so each priced token maps to an
 * Ethereum-side proxy ticker (Test USDC → USDC, Fee Juice → AZTEC). The ids, bands and tickers are
 * the one table in `@nulo/token-list`; which token carries which id comes from the signed list
 * (`pricedTokensOf`). The wallet always fetches the FULL id table in one batched request, so the
 * query never varies with holdings or with the list.
 *
 * `sanity` is a hard accept-band in USD. Quotes outside it are rejected at write AND read time — a
 * poisoned or garbage response can never enter (or survive in) the cache. Bands are per-id because
 * "absurd" differs by four orders of magnitude between a stablecoin and AZTEC.
 */

import { PRICE_IDS, type TokenListEntry } from "@nulo/token-list"

export type PriceMapEntry = {
	coingeckoId: string
	/** Hard accept-band (USD). Outside → the quote is dropped for this id. */
	sanity: { min: number; max: number }
}

/** `${chainId}:${lower-case contract}` → the price id the signed list names for that token. */
export type PricedTokens = Readonly<Record<string, string>>

function entryFor(coingeckoId: string): PriceMapEntry | undefined {
	return Object.hasOwn(PRICE_IDS, coingeckoId) ? { coingeckoId, sanity: PRICE_IDS[coingeckoId].sanity } : undefined
}

/** Fee Juice is priced as AZTEC on every chain (1 FJ = 1 AZTEC). */
export const FEE_JUICE_ENTRY: PriceMapEntry = { coingeckoId: "aztec", sanity: PRICE_IDS.aztec.sanity }

/**
 * E2E-ONLY sandbox rule: with `VITE_NULO_E2E_PRICE_MAP=1` (set exclusively by
 * the network-e2e agent build), EVERY contract on the sandbox chain (id 0)
 * prices as USDC — sandbox token addresses are minted per run, so no signed
 * list can cover them. Statically false in prod builds →
 * the branch and its build stamp are DCE-stripped (same discipline as
 * E2E_PROVERLESS; `_build-extension.yml` greps release bundles for the stamp).
 */
const E2E_SANDBOX_PRICE_MAP = (import.meta.env.VITE_NULO_E2E_PRICE_MAP ?? "") === "1"

export function pricedTokensOf(entries: readonly TokenListEntry[]): PricedTokens {
	return Object.fromEntries(entries.flatMap((e) => (e.priceId === undefined ? [] : [[`${e.chainId}:${e.address}`, e.priceId]])))
}

export function getPriceMapEntry(priced: PricedTokens, chainId: number, contract: string): PriceMapEntry | undefined {
	if (E2E_SANDBOX_PRICE_MAP && chainId === 0) {
		// The stamp is LIVE DATA on the returned entry — an unused export gets
		// tree-shaken even in ARMED builds, which made the release grep a
		// false-negative guard. Inside the kept branch, the string survives
		// exactly when the rule does; `_build-extension.yml` greps for it AND
		// fails fast if the env var is set at all.
		return { ...entryFor("usd-coin"), e2eStamp: "NULO_E2E_PRICE_MAP_BUILD_STAMP" } as PriceMapEntry
	}
	const key = `${chainId}:${contract.toLowerCase()}`
	return Object.hasOwn(priced, key) ? entryFor(priced[key]) : undefined
}

/** Human ticker for the proxy pricing an id represents — powers the explicit
 *  `via USDC` labeling everywhere a proxy quote drives UI. */
export function proxyTickerFor(coingeckoId: string): string | undefined {
	return Object.hasOwn(PRICE_IDS, coingeckoId) ? PRICE_IDS[coingeckoId].ticker : undefined
}

export function getSanityBand(coingeckoId: string): { min: number; max: number } | undefined {
	return entryFor(coingeckoId)?.sanity
}

/** The full batched query set: every id in the table, sorted so the request string is stable. */
export function allCoingeckoIds(): string[] {
	return Object.keys(PRICE_IDS).sort()
}
