// Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0.
import { stripWireControl } from "@/wallet/services/dapp-session/capability-meta"

export const capitalize = (s: string): string => {
	if (!s) return ""
	return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Truncate an address to `start`…`end` chars around a separator. The
 *  separator parameter exists because the UI currently renders THREE styles
 *  ("..", "...", "…") at different sites — each site states its own, so the
 *  slicing policy still has one implementation. Unifying the visual style is
 *  a deliberate owner decision, not a refactor side effect. */
export const trimAddress = (address: string, start = 8, end = 4, separator = ".."): string => {
	if (!address || address.length <= start + end) return address
	return `${address.substring(0, start)}${separator}${address.substring(address.length - end)}`
}

/**
 * Initials for an entity name: first letters of the first two words, or the
 * first 1–2 characters of a single word, uppercased. Empty/whitespace → "".
 * Shared by contact `abbr` derivation and the account avatar so the two agree.
 */
export function getInitials(name: string): string {
	const words = (name || "").trim().split(/\s+/).filter(Boolean)
	if (words.length === 0) return ""
	if (words.length === 1) return words[0].substring(0, Math.min(words[0].length, 2)).toUpperCase()
	return (words[0][0] + words[1][0]).toUpperCase()
}

export function isValidHex(hex: string, length = 64): boolean {
	const regex = new RegExp(`^0x[a-fA-F0-9]{${length}}$`)
	return regex.test(hex)
}

export function sanitizeString(s: string, length = 0): string {
	if (!s) return ""

	let cleaned = s.replace(/[^\p{L}0-9 \-._]/gu, "")
	if (length && cleaned.length > length) {
		cleaned = cleaned.slice(0, length)
	}

	return cleaned
}

/** `name` as a sentence may carry it: letters, digits, space and `-._` only, so no bidi, zero-width
 *  or control character reaches the sentence; `fallback` when nothing is left. */
export function sentenceName(name: string, fallback: string): string {
	return sanitizeString(name, 32).trim() || fallback
}

const BIDI_AND_ZERO_WIDTH = /[\p{Bidi_Control}\u00AD\u200B\u2060\uFEFF]/gu

/** Text a person types or pastes, without the bidi controls (they reorder what the field shows) or
 *  the zero-width space, word joiner, BOM and soft hyphen (they draw nothing on one line), so none of
 *  these hides in what a field keeps. Joiners, variation selectors and tags stay: emoji sequences and joined
 *  scripts are drawn from them. A dApp's strings take `stripWireControl` instead. */
export const stripBidiAndZeroWidth = (text: string): string => text.replace(BIDI_AND_ZERO_WIDTH, "")

/** Absent, or only whitespace once the wire sanitizer's strip has run. */
export const isBlank = (s: string | null | undefined): boolean => stripWireControl(s ?? "").trim() === ""

/** The empty-value "—" for a blank name, title or label; any other value exactly as given. */
export const dashIfBlank = (s: string | null | undefined): string => (isBlank(s) ? "—" : (s as string))

export function stringCompare(a: string, b: string): number {
	return (a || "").localeCompare(b || "", undefined, { sensitivity: "base", numeric: true })
}
