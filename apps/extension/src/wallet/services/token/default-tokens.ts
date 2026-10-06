/**
 * Built-in default-token seed list. One entry per (chainId, contract); the
 * seeder adds any missing entry after unlock, through the same journaled
 * machinery as a manual add — but gated on the TOFU pins below, because
 * seeding is zero-interaction (no preview popup for the user to inspect).
 *
 * Pin provenance (captured by `scripts/seed-preflight.ts` against the
 * canonical public RPCs — re-run it whenever a network resets):
 * - `expectedClassId`: live-captured from the node. The load-bearing pin —
 *   the artifact and every FnImpl derive from the class, so a hostile RPC
 *   cannot swap in a different contract implementation.
 * - `expectedSymbol`: the CHAIN's symbol, live-captured with
 *   `scripts/seed-preflight-metadata.ts` (standards Token storage layout —
 *   the upstream sample Token's layout decodes garbage; that mismatch shipped
 *   a wrong "cUSD" pin that hard-skipped the token on every unlock). Chain
 *   metadata disagreeing with the pin means we should not silently seed it.
 * - `expectedDecimals`: the chain's decimals, read by
 *   `scripts/seed-preflight-metadata.ts` with the symbol. Every amount the
 *   row shows and every send scales by it, so it is equality-pinned too.
 */

import { CHAIN_IDS } from "@/utils/chain-ids"

/** The L2 tokens unleashed's testnet generation pre-creates (`bridge.tokens[].l2Token` in its
 *  `apps/tools/public/testnet-bridge.json`), deployed by its hub. A new generation moves them; the
 *  aztec-update skill's reset step re-points them here, which moves the seeds and the price map. */
export const TESTNET_TOKENS = {
	USDC: "0x0f8df6867e9547fdf90e0f69187ada6fbd7b1f6ad4903ad333200bb032279ecf",
	USDT: "0x0432a81ca01e5f7a4a738117718595c258bb6f0b1df1e797fc0881e26cdc41ee",
	EURC: "0x0d8493a9747a706649e6bf85694356e3a8bd0f03a5f28479562d6b50d2ce590d",
	GBPC: "0x2d8fb63a7b035198295a451cac292a50a2a58fdf4824e2f5c18356146062ff50",
} as const

/** Live-captured from the Testnet node for all four tokens (original == current): the
 *  aztec-standards 6.0.0-rc.1 Token class. Their symbols, names ("Test USDC", …) and 6 decimals
 *  came from `seed-preflight-metadata.ts` in the same capture. */
const TESTNET_TOKEN_CLASS_ID = "0x24c34002788720c941a327a20c369b12c8bdcff3b5a974673a8f618763471505"

export type DefaultTokenSeed = {
	chainId: number
	contract: string
	/** TOFU pin: `currentContractClassId` the instance must present. */
	expectedClassId: string
	/** Product-intent pin: chain symbol must match exactly. */
	expectedSymbol: string
	/** Chain decimals must match exactly: a wrong one rescales every amount shown and sent. */
	expectedDecimals: number
	/** Compiled-in label for the row shown BEFORE the chain has answered. Never
	 *  persisted and never compared: the token row carries the chain's own name. */
	displayName: string
}

export const DEFAULT_TOKEN_SEEDS: readonly DefaultTokenSeed[] = [
	{
		chainId: CHAIN_IDS.TESTNET,
		contract: TESTNET_TOKENS.USDC,
		expectedClassId: TESTNET_TOKEN_CLASS_ID,
		expectedSymbol: "USDC",
		expectedDecimals: 6,
		displayName: "Test USDC",
	},
	{
		chainId: CHAIN_IDS.TESTNET,
		contract: TESTNET_TOKENS.USDT,
		expectedClassId: TESTNET_TOKEN_CLASS_ID,
		expectedSymbol: "USDT",
		expectedDecimals: 6,
		displayName: "Test USDT",
	},
	{
		chainId: CHAIN_IDS.TESTNET,
		contract: TESTNET_TOKENS.EURC,
		expectedClassId: TESTNET_TOKEN_CLASS_ID,
		expectedSymbol: "EURC",
		expectedDecimals: 6,
		displayName: "Test EURC",
	},
	{
		chainId: CHAIN_IDS.TESTNET,
		contract: TESTNET_TOKENS.GBPC,
		expectedClassId: TESTNET_TOKEN_CLASS_ID,
		expectedSymbol: "GBPC",
		expectedDecimals: 6,
		displayName: "Test GBPC",
	},
]

export function seedsForChain(chainId: number): DefaultTokenSeed[] {
	return DEFAULT_TOKEN_SEEDS.filter((s) => s.chainId === chainId)
}

export function findSeed(chainId: number, contract: string): DefaultTokenSeed | undefined {
	return DEFAULT_TOKEN_SEEDS.find((s) => s.chainId === chainId && s.contract.toLowerCase() === contract.toLowerCase())
}
