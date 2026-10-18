import type { PricedTokens } from "./price-map"

export const PRICE_SERVICE_NAME = "price"

/** A validated USD quote for one CoinGecko id. */
export type PriceQuote = {
	coingeckoId: string
	/** USD price as returned by the provider (validated: finite, > 0, inside the id's sanity band). */
	usd: number
	/** Local wall-clock ms when this quote was fetched. */
	fetchedAt: number
	/** Provider-reported last-update time (ms), when the API returned one. */
	providerUpdatedAt: number | null
}

/** Cache shape persisted under `nulo:core:token-prices`, keyed by CoinGecko id. */
export type PriceState = Record<string, PriceQuote>

/**
 * Quotes older than this are treated as absent by every consumer. The
 * effective age uses the OLDER of local fetch time and provider update
 * time, so a provider serving stale data doesn't masquerade as fresh.
 */
export const QUOTE_TTL_MS = 15 * 60_000

/** Tolerated forward clock skew. A `fetchedAt` further in the future than
 *  this is not a clock hiccup — it's a corrupt (or planted) cache entry that
 *  would otherwise stay "fresh" forever AND win every monotonic merge. */
export const MAX_CLOCK_SKEW_MS = 2 * 60_000

/** A provider fetch is aborted after this long, so no fetch outlives it by more than its cache write. */
export const PRICE_FETCH_TIMEOUT_MS = 10_000

/**
 * The single staleness rule (spec-level so UI, service, and executors can
 * never drift apart). A quote is usable iff its effective timestamp is
 * within `QUOTE_TTL_MS` of `now` — and not from the future.
 */
export function isQuoteFresh(quote: PriceQuote, now: number): boolean {
	if (quote.fetchedAt > now + MAX_CLOCK_SKEW_MS) return false
	const effectiveAt = quote.providerUpdatedAt !== null ? Math.min(quote.fetchedAt, quote.providerUpdatedAt) : quote.fetchedAt
	return now - effectiveAt < QUOTE_TTL_MS
}

/** Usable quotes with the mapping that says which token each id prices. They travel together, so a
 *  reader never prices a token with a mapping from another moment than its quotes. `flaggedTokens`
 *  rides along as the popup's one channel to the signed list: the `flaggedKeysOf` key of each pair
 *  it flags as a scam, whatever the fiat setting. */
export type PriceSnapshot = {
	quotes: PriceState
	pricedTokens: PricedTokens
	flaggedTokens: readonly string[]
}

export type Methods = {
	/** Usable quotes only (validated + fresh + fiat display enabled). */
	getQuotes(): PriceSnapshot
	/** Refresh if the cache is stale, then return usable quotes. No-op fast path when fresh. */
	refreshIfStale(): PriceSnapshot
}

export type Events = {
	/** Emitted after every fetch no fiat-display flip superseded, failed or not, after every new token
	 *  list, and with no quotes when fiat display is disabled. */
	onQuotesUpdated: PriceSnapshot
}
