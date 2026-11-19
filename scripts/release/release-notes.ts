/**
 * The user-facing notes of a stable release: `release-notes/X.Y.Z.md`, committed before the promote.
 * The same text opens the GitHub Release body and fills the AMO version's `release_notes`, so the
 * rules here are the stricter of the two surfaces. Imports nothing with dependencies: the release
 * jobs load it with no workspace installed.
 */

import { amoChars, NOTES_MAX } from "./publish-firefox-amo"

export const NOTES_DIR = "release-notes"
/** AMO's model caps `release_notes` at the same 3,000 code points as `approval_notes`. */
export const RELEASE_NOTES_MAX = NOTES_MAX
/** `attach-assets` rewrites this token across the whole body; in the notes it would read differently on GitHub and AMO. */
const SOURCE_COMMIT = "@SOURCE_COMMIT@"

const VERSION = /^(\d+)\.(\d+)\.(\d+)(-[0-9A-Za-z.-]+)?$/

export const notesPath = (version: string) => `${NOTES_DIR}/${version}.md`

/** True for a stable `X.Y.Z`, false for a prerelease; throws on a version it cannot read, so it never passes as "not needed". */
export function needsNotes(version: string): boolean {
	const match = VERSION.exec(version)
	if (!match) throw new Error(`not a semantic version: '${version}'`)
	return match[4] === undefined
}

/** Every rule the text breaks, `[]` when it can ship. */
export function notesProblems(text: string): string[] {
	const notes = text.trim()
	if (!notes) return ["the notes are empty"]
	const problems: string[] = []
	const chars = amoChars(notes)
	if (chars > RELEASE_NOTES_MAX) problems.push(`the notes are ${chars} chars; AMO accepts at most ${RELEASE_NOTES_MAX}`)
	// GitHub shows headings and rules; AMO drops them, and reads a line or list item opening with `#` as one.
	if (/^ {0,3}(?:[-*+][ \t]+|\d+[.)][ \t]+)?#/m.test(notes))
		problems.push("a line or list item opens with #, which AMO reads as a heading")
	if (/^ {0,3}(=+|-+)[ \t]*$/m.test(notes)) problems.push("a line of only = or - makes a heading or a rule, which AMO drops")
	// The user-facing copy rule: no em dash joins two clauses; notes have no empty value to mark.
	if (notes.includes("—")) problems.push("the notes hold an em dash")
	if (notes.includes(SOURCE_COMMIT)) problems.push(`the notes hold ${SOURCE_COMMIT}`)
	return problems
}

export function composeBody(version: string, notes: string, cliff: string): string {
	return `## What's new in ${version}\n\n${notes.trim()}\n\n---\n\n${cliff}`
}

/** Why `version` cannot ship with `text` (the file's content, or null when it is absent); null when it can. */
export function notesRefusal(version: string, text: string | null): string | null {
	if (!needsNotes(version)) return null
	const path = notesPath(version)
	if (text === null) return `${path} is missing: a stable release needs its user-facing notes`
	const problems = notesProblems(text)
	return problems.length ? `${path}: ${problems.join("; ")}` : null
}
