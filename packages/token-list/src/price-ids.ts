/**
 * The one price table: which CoinGecko ids a list entry may name, each with its USD accept-band and
 * the Ethereum-side ticker it proxies. The wallet requests every id here in one batch, so the
 * request never varies with holdings; an entry naming an id outside the table stays unpriced.
 */
export type PriceId = { sanity: { min: number; max: number }; ticker: string }

/** A stablecoin quote outside [0.20, 5] is provider garbage, not a depeg. */
const STABLE_BAND = { min: 0.2, max: 5 } as const

export const PRICE_IDS: Readonly<Record<string, PriceId>> = {
	"usd-coin": { sanity: STABLE_BAND, ticker: "USDC" },
	tether: { sanity: STABLE_BAND, ticker: "USDT" },
	"euro-coin": { sanity: STABLE_BAND, ticker: "EURC" },
	aztec: { sanity: { min: 0.000_1, max: 100 }, ticker: "AZTEC" },
}

export function isPriceId(id: string): boolean {
	return Object.hasOwn(PRICE_IDS, id)
}
