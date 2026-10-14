/**
 * Default-token seeds come from the signed token list (`TokenListService`). The seeder adds any
 * missing entry after unlock, through the same journaled machinery as a manual add, but gated on
 * the TOFU pins below, because seeding is zero-interaction (no preview popup for the user to inspect).
 *
 * - `expectedClassId`: the load-bearing pin. The artifact and every FnImpl derive from the class,
 *   so a hostile RPC cannot swap in a different contract implementation; the list admits only
 *   bundled classes.
 * - `expectedSymbol`: the chain's symbol. Chain metadata disagreeing with the pin means the token
 *   is not silently seeded.
 * - `expectedDecimals`: the chain's decimals. Every amount the row shows and every send scales by
 *   it, so it is equality-pinned too.
 */

import type { TokenListSnapshot } from "@/wallet/services/token-list/spec"

export type DefaultTokenSeed = {
	chainId: number
	contract: string
	/** TOFU pin: `currentContractClassId` the instance must present. */
	expectedClassId: string
	/** Product-intent pin: chain symbol must match exactly. */
	expectedSymbol: string
	/** Chain decimals must match exactly: a wrong one rescales every amount shown and sent. */
	expectedDecimals: number
	/** The list's label for the row shown BEFORE the chain has answered. Never persisted and
	 *  never compared: the token row carries the chain's own name. */
	displayName: string
}

export function seedsFromList(snapshot: TokenListSnapshot | undefined): DefaultTokenSeed[] {
	return (snapshot?.entries ?? []).map((entry) => ({
		chainId: entry.chainId,
		contract: entry.address,
		expectedClassId: entry.classId,
		expectedSymbol: entry.symbol,
		expectedDecimals: entry.decimals,
		displayName: entry.name,
	}))
}
