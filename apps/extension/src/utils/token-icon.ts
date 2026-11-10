/**
 * A token's picture comes only from the signed list, matched on chain and contract as a flag is, so a
 * token that copies a listed symbol on another contract or chain never draws the listed picture.
 */
import type { TokenListEntry } from "@nulo/token-list"
import { keyOf } from "./token-flag"

/** The pictures the worker sends, keyed as {@link tokenIconFor} looks them up. */
export function tokenIconsOf(entries: readonly TokenListEntry[]): Record<string, string> {
	return Object.fromEntries(entries.flatMap((e) => (e.icon === undefined ? [] : [[keyOf(e.chainId, e.address), e.icon]])))
}

export function tokenIconFor(
	icons: Readonly<Record<string, string>>,
	token: { chainId?: number; contract?: string } | undefined,
): string | undefined {
	if (typeof token?.chainId !== "number" || typeof token.contract !== "string") return undefined
	const key = keyOf(token.chainId, token.contract)
	return Object.hasOwn(icons, key) ? icons[key] : undefined
}
