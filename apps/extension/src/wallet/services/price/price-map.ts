/**
 * Price mapping: which CoinGecko id prices which asset, per chain.
 *
 * Aztec-native tokens are too new to be indexed anywhere, so each priced token maps to an
 * Ethereum-side proxy ticker (Test USDC → USDC, Fee Juice → AZTEC). The signed list carries each
 * listed token's feed (id, band, ticker); Fee Juice's is the one compiled feed. The request is the
 * table's ids, so it varies with the held list, never with holdings or the network.
 *
 * `min`/`max` is a hard accept-band in USD. Quotes outside it are rejected at write AND read time —
 * a poisoned or garbage response can never enter (or survive in) the cache.
 */

import { FEE_JUICE_PRICE_FEED, FEE_JUICE_PRICE_ID, type PriceFeed, type PriceFeeds, type TokenListEntry, tokenKey } from "@nulo/token-list"

export type PriceMapEntry = { coingeckoId: string } & PriceFeed

/** CoinGecko id → the feed that validates its quotes. */
export type PriceTable = Readonly<Record<string, PriceMapEntry>>

/** `tokenKey` → the entry the signed list prices that token with. */
export type PricedTokens = Readonly<Record<string, PriceMapEntry>>

/** Fee Juice is priced as AZTEC on every chain (1 FJ = 1 AZTEC). */
export const FEE_JUICE_ENTRY: PriceMapEntry = { coingeckoId: FEE_JUICE_PRICE_ID, ...FEE_JUICE_PRICE_FEED }

/**
 * E2E-ONLY sandbox rule: with `VITE_NULO_E2E_PRICE_MAP=1` (set exclusively by
 * the network-e2e agent build), EVERY contract on the sandbox chain (id 0)
 * prices as USDC — sandbox token addresses are minted per run, so no signed
 * list can cover them. Statically false in prod builds →
 * the branch and its build stamp are DCE-stripped (same discipline as
 * E2E_PROVERLESS; `_build-extension.yml` greps release bundles for the stamp).
 */
const E2E_SANDBOX_PRICE_MAP = (import.meta.env.VITE_NULO_E2E_PRICE_MAP ?? "") === "1"
const E2E_SANDBOX_ENTRY: PriceMapEntry = { coingeckoId: "usd-coin", min: 0.2, max: 5, ticker: "USDC" }

/** The list's feeds, then Fee Juice's over its id: no list can re-band Fee Juice. */
export function priceTableOf(feeds: PriceFeeds): PriceTable {
	const table: Record<string, PriceMapEntry> = E2E_SANDBOX_PRICE_MAP ? { [E2E_SANDBOX_ENTRY.coingeckoId]: E2E_SANDBOX_ENTRY } : {}
	for (const [coingeckoId, feed] of Object.entries(feeds)) table[coingeckoId] = { coingeckoId, ...feed }
	table[FEE_JUICE_ENTRY.coingeckoId] = FEE_JUICE_ENTRY
	return table
}

export function pricedTokensOf(entries: readonly TokenListEntry[], table: PriceTable): PricedTokens {
	return Object.fromEntries(
		entries.flatMap((e) =>
			e.priceId !== undefined && Object.hasOwn(table, e.priceId) ? [[tokenKey(e.chainId, e.address), table[e.priceId]]] : [],
		),
	)
}

export function getPriceMapEntry(priced: PricedTokens, chainId: number, contract: string): PriceMapEntry | undefined {
	if (E2E_SANDBOX_PRICE_MAP && chainId === 0) {
		// The stamp is LIVE DATA on the returned entry — an unused export gets
		// tree-shaken even in ARMED builds, which made the release grep a
		// false-negative guard. Inside the kept branch, the string survives
		// exactly when the rule does; `_build-extension.yml` greps for it AND
		// fails fast if the env var is set at all.
		return { ...E2E_SANDBOX_ENTRY, e2eStamp: "NULO_E2E_PRICE_MAP_BUILD_STAMP" } as PriceMapEntry
	}
	const key = tokenKey(chainId, contract)
	return Object.hasOwn(priced, key) ? priced[key] : undefined
}

/** The batched query set, sorted so the request string is stable for one list. */
export function priceIdsOf(table: PriceTable): string[] {
	return Object.keys(table).sort()
}

export function inBand(usd: number, entry: PriceFeed): boolean {
	return usd >= entry.min && usd <= entry.max
}
