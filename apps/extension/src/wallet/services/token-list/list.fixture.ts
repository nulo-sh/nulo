/**
 * The four Testnet rc.1 tokens as the signed list carries them (`infra/token-list/list.source.json`).
 * A test fixture: the wallet itself never reads it, its defaults come from the fetched list.
 */
import { BUNDLED_TOKEN_CLASS_IDS, type TokenListEntry, type TokenListPair } from "@nulo/token-list"
import { CHAIN_IDS } from "@/utils/chain-ids"
import { type PricedTokens, pricedTokensOf } from "@/wallet/services/price/price-map"

export const TEST_TOKENS = {
	USDC: "0x0f8df6867e9547fdf90e0f69187ada6fbd7b1f6ad4903ad333200bb032279ecf",
	USDT: "0x0432a81ca01e5f7a4a738117718595c258bb6f0b1df1e797fc0881e26cdc41ee",
	EURC: "0x0d8493a9747a706649e6bf85694356e3a8bd0f03a5f28479562d6b50d2ce590d",
	GBPC: "0x2d8fb63a7b035198295a451cac292a50a2a58fdf4824e2f5c18356146062ff50",
} as const

const entry = (symbol: keyof typeof TEST_TOKENS, priceId?: string): TokenListEntry => ({
	chainId: CHAIN_IDS.TESTNET,
	address: TEST_TOKENS[symbol],
	classId: BUNDLED_TOKEN_CLASS_IDS[0],
	symbol,
	decimals: 6,
	name: `Test ${symbol}`,
	...(priceId ? { priceId } : {}),
})

export const TEST_LIST_ENTRIES: readonly TokenListEntry[] = [
	entry("USDC", "usd-coin"),
	entry("USDT", "tether"),
	entry("EURC", "euro-coin"),
	entry("GBPC"),
]

export const TEST_PRICED_TOKENS: PricedTokens = pricedTokensOf(TEST_LIST_ENTRIES)

/** A Testnet pair the list flags as a scam: never an entry, so never seeded or priced. */
export const TEST_FLAGGED: TokenListPair = {
	chainId: CHAIN_IDS.TESTNET,
	address: "0x2b5ce8f0a8d4f6b3c1e7a9d0f4b2c6e8a1d3f5b7c9e0a2b4d6f8a1c3e5b7d9f0",
}
