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

/** The list's reading of a token that a mark draws, as `usePrices` and `useTokenFlags` give it. A
 *  surface given neither draws the initials with no badge, as every surface does before the list's
 *  first answer. */
export type TokenMarkLookup = {
	iconFor?: (token: ListedAt | undefined) => string | undefined
	isFlagged?: (token: ListedAt | undefined) => boolean
}

/** A token's mark, as `TokenMark` takes it but for its size. */
export type TokenMarkOf = { symbol: string; icon?: string; badge: boolean }

export function tokenMarkOf(lookup: TokenMarkLookup, token: ListedAt & { symbol?: string }): TokenMarkOf {
	return { symbol: token.symbol ?? "", icon: lookup.iconFor?.(token), badge: lookup.isFlagged?.(token) ?? false }
}
