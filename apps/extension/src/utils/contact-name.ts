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

const SEPARATORS = /[ \-_]/g

/**
 * Letters drawn like a dot, a zero or an x, as the rule reads them: compatibility forms and marks
 * folded, case kept. Each zero- and x-like letter is one UTS #39 18.0.0 confusables maps to o or O
 * (with or without a stroke), or to x, X or χ. The dot-like letters are the four it maps to "." or "·"
 * (ꓸ, ꞏ, ᐧ, ˑ) and six drawn as a lone dot at the baseline or mid-height (ᱹ, ㆍ, ᆞ, 𑫯, 𛰀, 𛲔);
 * `TWO_DOT_LIKE` is ꓺ, which it maps to "..".
 */
const DOT_LIKE = "\u02D1\u119E\u1427\u1C79\u318D\uA4F8\uA78F\u{11AEF}\u{1BC00}\u{1BC94}"
const TWO_DOT_LIKE = "\uA4FA"
const ZERO_LIKE =
	"Oo\u00D8\u00F8\u019F\u0275\u0398\u039F\u03B8\u03BF\u03C3\u03ED\u041E\u043E\u0472\u0473\u04E8\u04E9\u0555\u0585\u05E1\u0647\u06BE\u06C1\u06D5\u07CB\u0840\u0B20\u0D20\u101D\u10FF\u110B\u11BC\u12D0\u1340\u13BE\u13EB\u1A45\u1C82\u1CBF\u1D0F\u1D11\u2C90\u2C91\u2C9E\u2C9F\u2D31\u2D41\u2D54\uA4F3\uA74A\uA74B\uAB3D\uAB3E\uAB8E\uABBB\u{10292}\u{102AB}\u{1030F}\u{10404}\u{1042C}\u{104C2}\u{104EA}\u{10516}\u{1051E}\u{1092C}\u{10C17}\u{10D07}\u{11124}\u{118B5}\u{118C8}\u{118D7}\u{1699B}\u{16AE9}"
const X_LIKE =
	"Xx\u03A7\u03C7\u0425\u0445\u1541\u157D\u16B7\u1763\u1CF5\u2CAC\u2CAD\u2D5D\uA4EB\uA7B3\uAB53\uAB55\u{10290}\u{102B4}\u{10317}\u{10527}\u{10C13}\u{10C82}\u{10CC2}"

const DOT_LETTER = new RegExp(`[${DOT_LIKE}]`, "gu")
/** A name written only in Lisu letters, where ꓸ and ꓺ are the language's tone marks. */
const LISU_ONLY = /^[\p{Script=Lisu} \-_]+$/u
const DOTS = `${DOT_LIKE}${TWO_DOT_LIKE}`
/** A zero-like letter that begins a word (at the start, after anything but a letter or digit, or after
 *  a dot-like letter), when an x-like letter follows it and a digit comes among the next three letters
 *  or digits, a dot-like letter skipped there as a full stop is. */
const ZERO_LIKE_WORD_START = new RegExp(
	`(?<=^|[^\\p{L}0-9]|[${DOTS}])[${ZERO_LIKE}][ \\-_]*(?=[${X_LIKE}](?:[ \\-_.${DOTS}]*(?![${DOTS}])\\p{L}){0,2}[ \\-_.${DOTS}]*[0-9])`,
	"gu",
)
/** The digit 0 and an x-like letter; the lookahead captures the run after them: letters and digits,
 *  one dot among them. */
const ZERO_X_RUN = new RegExp(`0[${X_LIKE}](?=([\\p{L}0-9]*(?:\\.[\\p{L}0-9]+)?))`, "gu")

/** Whether a `0x` in `s` starts a run of four or more letters or digits with a digit among them. A run
 *  holding a later `0x` holds a digit, so it answers before that one is read when it is four or longer,
 *  and is at most five characters otherwise: the scan is linear. */
function hasZeroXRun(s: string): boolean {
	for (const [, run] of s.matchAll(ZERO_X_RUN)) if (/[0-9]/.test(run) && [...run.replace(".", "")].length >= 4) return true
	return false
}

/**
 * Whether a stored name reads as an address, whatever letters fill it. Once look-alike letters,
 * compatibility forms and marks are folded, it holds `0x` and four hex digits, or two hex runs joined
 * by two or more dots, a run being three hex digits or `0x` and one to three. Once compatibility forms
 * and marks are folded and spaces, hyphens and underscores taken out, it holds two dots in a row, a
 * dot-like letter counting as a dot and ꓺ as two unless the name is written only in Lisu letters; or
 * it holds `0x` and a run of four or more letters or digits with a digit among them and at most one
 * full stop, the x being any x-like letter and the 0 also a zero-like letter `ZERO_LIKE_WORD_START`
 * finds. Such a name is never stored from a person or a contacts file, and one already stored is never
 * printed in place of its address. Every pattern matches in time linear in the name.
 */
export function isAddressShapedName(name: string): boolean {
	const folded = foldToHexForm(name)
	if (/0x[0-9a-f]{4}/.test(folded) || /(?:[0-9a-f]{3}|0x[0-9a-f]{1,3})\.{2,}[0-9a-f]{3}/.test(folded)) return true
	const plain = name.normalize("NFKD").replace(COMBINING_MARK, "")
	const dotted = LISU_ONLY.test(name) ? plain : plain.replaceAll(TWO_DOT_LIKE, "..").replace(DOT_LETTER, ".")
	if (dotted.replace(SEPARATORS, "").includes("..")) return true
	return hasZeroXRun(plain.replace(ZERO_LIKE_WORD_START, "0").replace(SEPARATORS, ""))
}

/** Whether two names are the same contact name: the equality every duplicate check uses. */
export function sameContactName(a: string, b: string): boolean {
	return contactNameKey(a) === contactNameKey(b)
}
