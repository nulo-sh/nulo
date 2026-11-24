/**
 * The one definition of a contact name, for the contact form, contacts import, backup restore and
 * the contact service alike: how a name is stored, when two names are the same, when a name holds
 * nothing to store, and when it reads as an address.
 */
import { sanitizeString } from "@/utils/string"

/** The longest stored name, in UTF-16 units as the contact form counts them. */
export const CONTACT_NAME_MAX = 25

const INVISIBLE = /\p{Default_Ignorable_Code_Point}/gu
const WHITESPACE_RUN = /\p{White_Space}+/gu

/** Invisible characters go, any whitespace becomes a space before the character filter (which
 *  would delete it and join the words), and the runs the filter leaves become one space. Visible
 *  letters and their case are kept. */
function visibleName(name: string): string {
	return sanitizeString(name.replace(INVISIBLE, "").replace(WHITESPACE_RUN, " ")).replace(/ {2,}/g, " ")
}

/** A letter outside the BMP that the cut would split is dropped whole: half of one is not a
 *  character, and the next pass strips it, so the name would never read back as saved. */
function cut(name: string): string {
	return name.slice(0, CONTACT_NAME_MAX).replace(/[\uD800-\uDBFF]$/, "")
}

/** A name as it is stored; untrusted display text from a person, a file or a backup. Trimmed before
 *  the cut too, so outer spaces never cost a character. */
export function sanitizeContactName(name: string): string {
	return cut(visibleName(name).trim()).trim()
}

/** A name as the contact form keeps it while it is typed: what `sanitizeContactName` stores, with
 *  a trailing space still there, so a space between two words can be typed. A leading space is
 *  dropped: it is never stored, and would cost a character. */
export function typedContactName(name: string): string {
	return cut(visibleName(name).trimStart())
}

/** Whether nothing of `name` would be stored: it holds only invisible characters, whitespace and
 *  characters a name cannot hold. */
export function isEmptyContactName(name: string): boolean {
	return sanitizeContactName(name) === ""
}

/** Case folding for matching: per code point, lower, upper, lower. It puts exactly the code points
 *  Unicode default case folding treats as one letter in one class (ß, ss and ẞ; σ and ς), though it
 *  may name the class differently (Cherokee folds to lowercase here). The round trip would also join
 *  dotless ı to i, which default folding keeps apart, so ı is left as it is. */
function foldCase(s: string): string {
	let folded = ""
	for (const c of s) folded += c === "\u0131" ? c : c.toLowerCase().toUpperCase().toLowerCase()
	return folded
}

/**
 * The key two contact names are the same name by: no invisible characters, compatibility forms
 * (NFKC), case folded, whitespace runs as one space, trimmed. Letters that only look alike across
 * scripts (Cyrillic А, Latin A) keep different keys. Invisible characters go first so one between a
 * letter and its accent cannot stop NFKC composing them; NFKC and folding never produce one.
 */
export function contactNameKey(name: string): string {
	return foldCase(name.replace(INVISIBLE, "").normalize("NFKC")).replace(WHITESPACE_RUN, " ").trim()
}

/** Letters drawn like `0`, `x` or a hex letter, lower case: Latin `o`, then Cyrillic and Greek. */
const HEX_LOOKALIKE: Readonly<Record<string, string>> = {
	o: "0",
	а: "a",
	в: "b",
	с: "c",
	ԁ: "d",
	е: "e",
	о: "0",
	х: "x",
	α: "a",
	β: "b",
	ϲ: "c",
	ε: "e",
	ο: "0",
	χ: "x",
}
const COMBINING_MARK = /\p{M}/gu
const unlookalike = (s: string): string => Array.from(s, (c) => HEX_LOOKALIKE[c] ?? c).join("")

/** Both passes are needed: NFKD turns `ϲ` into `ς` and a mathematical capital into a Latin one, so
 *  the table runs before it, and case and the table again after it. */
function foldToHexForm(name: string): string {
	return unlookalike(unlookalike(name.toLowerCase()).normalize("NFKD").replace(COMBINING_MARK, "").toLowerCase())
}

/**
 * Whether a stored name reads as an address: once look-alike letters, compatibility forms and marks
 * are folded, it holds `0x` and four hex digits, or two hex runs joined by two or more dots, a run
 * being three hex digits or `0x` and one to three. Such a name is never stored from a person or a
 * file, and one already stored is never printed in place of its address. Fixed-width runs keep the
 * match linear on any input.
 */
export function isAddressShapedName(name: string): boolean {
	const folded = foldToHexForm(name)
	return /0x[0-9a-f]{4}/.test(folded) || /(?:[0-9a-f]{3}|0x[0-9a-f]{1,3})\.{2,}[0-9a-f]{3}/.test(folded)
}

/** Whether two names are the same contact name: the equality every duplicate check uses. */
export function sameContactName(a: string, b: string): boolean {
	return contactNameKey(a) === contactNameKey(b)
}
