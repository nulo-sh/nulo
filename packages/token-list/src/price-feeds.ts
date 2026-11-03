/**
 * What a list's `priceFeeds` record may say, and the one feed the wallet compiles. A record names
 * the USD band a quote must fall in and the Ethereum-side ticker it proxies; the wallet prices a
 * listed token only through the record its own list carries. No dependency: the signer's import
 * closure reaches this file.
 */

export type PriceFeed = { min: number; max: number; ticker: string }

export type PriceFeeds = Readonly<Record<string, PriceFeed>>

/** Fee Juice is priced as AZTEC on every chain (1 FJ = 1 AZTEC), whatever list the wallet holds. */
export const FEE_JUICE_PRICE_ID = "aztec"

export const FEE_JUICE_PRICE_FEED: PriceFeed = { min: 0.000_1, max: 100, ticker: "AZTEC" }

/** The fiat math snaps a rate to whole micro-USD per token: at this floor the snap moves a value by
 *  at most 0.5%, and the error grows as 1 / price below it. */
export const MIN_FEED_USD = 0.000_1

export const MAX_FEED_USD = 1_000_000

/** A list can re-band a feed with no release, so no record needs a band wider than this. */
export const MAX_BAND_RATIO = 1000

/** 16 entries per chain on the two public networks: the request and its reply stay small. */
export const MAX_PRICE_FEEDS = 32

/** A CoinGecko id's spelling, for an entry's `priceId` and a feed's key alike. */
export const FEED_ID = /^[a-z0-9][a-z0-9-]{0,63}$/

/** A CoinGecko id spelling, and never a name a plain object inherits (`constructor`), so a lookup
 *  keyed by it can only find what was stored under it. */
export function isFeedId(id: unknown): id is string {
	return typeof id === "string" && FEED_ID.test(id) && !(id in Object.prototype)
}
