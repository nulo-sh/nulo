/**
 * A token the signed list flags as a scam, matched on its chain and contract whoever added it: the
 * list, the person or a dApp. The list's addresses are canonical (`0x` and lower-case hex), while a
 * restored row may keep another spelling the address parser accepts (upper case, no `0x`), so both
 * sides go through one key.
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
