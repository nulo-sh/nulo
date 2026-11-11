/**
 * A token's picture comes only from the signed list, matched on chain and contract as a flag is, so a
 * token that copies a listed symbol on another contract or chain never draws the listed picture.
 */
import type { TokenListEntry } from "@nulo/token-list"
import { listKeyOf } from "./token-flag"

/** The pictures the worker sends, keyed as {@link tokenIconFor} looks them up. */
export function tokenIconsOf(entries: readonly TokenListEntry[]): Record<string, string> {
	return Object.fromEntries(entries.flatMap((e) => (e.icon === undefined ? [] : [[listKeyOf(e.chainId, e.address), e.icon]])))
}

export function tokenIconFor(
	icons: Readonly<Record<string, string>>,
	token: { chainId?: number; contract?: string } | undefined,
): string | undefined {
	if (typeof token?.chainId !== "number" || typeof token.contract !== "string") return undefined
	const key = listKeyOf(token.chainId, token.contract)
	return Object.hasOwn(icons, key) ? icons[key] : undefined
}

type ListedAt = { chainId?: number; contract?: string }

/** The list's reading of a token that a mark draws, as `usePrices` and `useTokenFlags` give it. */
export type TokenMarkLookup = {
	iconFor: (token: ListedAt | undefined) => string | undefined
	isFlagged: (token: ListedAt | undefined) => boolean
}

/** A token's mark, as `TokenMark` takes it but for its size. */
export type TokenMarkOf = { symbol: string; icon?: string; badge: boolean }

/**
 * The mark goes before a name, so a token with no symbol, whose row names something else, has none.
 * Nor does a surface with no list reader: its initials would say the list names no picture, and its
 * missing badge that the list flags nothing.
 */
export function tokenMarkOf(lookup: TokenMarkLookup | undefined, token: (ListedAt & { symbol?: string }) | undefined): TokenMarkOf | null {
	if (!lookup || !token?.symbol) return null
	return { symbol: token.symbol, icon: lookup.iconFor(token), badge: lookup.isFlagged(token) }
}
