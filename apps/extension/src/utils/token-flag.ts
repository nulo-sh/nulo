/**
 * A row matches a flag on chain and contract, whoever added it. A restored row may keep its contract
 * in upper case or without `0x`, so the list's pairs and the rows go through one key.
 */
import type { TokenListPair } from "@nulo/token-list"

const keyOf = (chainId: number, address: string): string => `${chainId}:0x${address.toLowerCase().replace(/^0x/, "")}`

/** The keys the worker sends; the popup matches rows against them with {@link isFlaggedToken}. */
export function flaggedKeysOf(pairs: readonly TokenListPair[]): string[] {
	return pairs.map((pair) => keyOf(pair.chainId, pair.address))
}

export function isFlaggedToken(flagged: ReadonlySet<string>, token: { chainId?: number; contract?: string } | undefined): boolean {
	if (typeof token?.chainId !== "number" || typeof token.contract !== "string") return false
	return flagged.has(keyOf(token.chainId, token.contract))
}
