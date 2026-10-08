/**
 * The one definition of a contact name, for the contact form, contacts import, backup restore and
 * the contact service alike: how a name is stored, when two names are the same, and when a name
 * holds nothing to store.
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
 *  its outer spaces still there, so a space between two words can be typed. */
export function typedContactName(name: string): string {
	return cut(visibleName(name))
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

/** Whether two names are the same contact name: the equality every duplicate check uses. */
export function sameContactName(a: string, b: string): boolean {
	return contactNameKey(a) === contactNameKey(b)
}
