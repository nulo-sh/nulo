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

/** A whole address split where the header's short form, `trimAddress(address, 6, 4)`, cuts it, so a
 *  screen showing all of it can mark the two ends a person compares. Too short to cut: all head. */
export function addressEnds(address: string): { head: string; middle: string; tail: string } {
	if (address.length <= 10) return { head: address, middle: "", tail: "" }
	return { head: address.slice(0, 6), middle: address.slice(6, -4), tail: address.slice(-4) }
}

/** A whole address as two even lines of 33, so its first and last characters sit at the line edges a
 *  person compares; null for any other length. */
export function addressHalves(address: string): [string, string] | null {
	if (address.length !== 66) return null
	return [address.slice(0, 33), address.slice(33)]
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

/** A token mark's letters: the symbol's first letters and digits by code point, upper case, one in a
 *  mark under 24 px and two from 24 px; "—" when it has none. The symbol may be contract-supplied, so
 *  a control, bidi or emoji character never reaches the mark. */
export function tokenInitials(symbol: string, size: number): string {
	const glyphs = Array.from(symbol.toUpperCase()).filter((c) => /^[\p{L}\p{Nd}]$/u.test(c))
	return glyphs.slice(0, size < 24 ? 1 : 2).join("") || "—"
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

/** A keycap is a digit, `#` or `*` drawn as an emoji: removed whole, so it leaves no digit behind. */
const KEYCAP = /[0-9#*]\uFE0F?\u20E3/gu
/** Characters drawn as emoji, and the joiners, modifiers, selectors and tags that build emoji from
 *  them; a pictographic character that is also punctuation stays. */
const PICTOGRAPHIC =
	/(?!\p{P})\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Regional_Indicator}|[\u200D\u20E3\uFE00-\uFE0F]|[\u{E0020}-\u{E007F}]|[\u{E0100}-\u{E01EF}]/gu

/** `text` without emoji, so a seal-like emoji in a name cannot sit beside a level; letters, digits and
 *  punctuation in every script stay. Spaces the removal leaves are collapsed and trimmed. */
export function stripPictographs(text: string): string {
	return text.replace(KEYCAP, "").replace(PICTOGRAPHIC, "").replace(/ {2,}/g, " ").trim()
}

export function stringCompare(a: string, b: string): number {
	return (a || "").localeCompare(b || "", undefined, { sensitivity: "base", numeric: true })
}
