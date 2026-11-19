import { describe, expect, test } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { composeBody, NOTES_DIR, needsNotes, notesProblems, notesRefusal, RELEASE_NOTES_MAX } from "./release-notes"

const ROOT = join(import.meta.dir, "../..")
const GOOD = "A lead line.\n\n- One change.\n- Another change.\n"

describe("notesProblems", () => {
	test("plain notes with a lead line and bullets pass, up to the cap", () => {
		expect(notesProblems(GOOD)).toEqual([])
		expect(notesProblems("A lead line.\n\n- Fixes #1668 and a - b - c case.\n")).toEqual([])
		expect(notesProblems(`🦊${"x".repeat(RELEASE_NOTES_MAX - 1)}`)).toEqual([])
	})

	test("each rule refuses its own class", () => {
		expect(notesProblems(" \n\n")).toEqual(["the notes are empty"])
		// An emoji is one code point to AMO, two UTF-16 units to `.length`.
		expect(notesProblems(`🦊${"x".repeat(RELEASE_NOTES_MAX)}`)).toEqual([
			`the notes are ${RELEASE_NOTES_MAX + 1} chars; AMO accepts at most ${RELEASE_NOTES_MAX}`,
		])
		for (const line of ["## More", "#1668 landed", "- #1668 landed", "2. #1668 landed"])
			expect(notesProblems(`${GOOD}${line}\n`), line).toEqual(["a line or list item opens with #, which AMO reads as a heading"])
		for (const line of ["=======", "---"])
			expect(notesProblems(`Changes\n${line}\n\n- One change.\n`), line).toEqual([
				"a line of only = or - makes a heading or a rule, which AMO drops",
			])
		expect(notesProblems("Sends are faster — and cheaper.")).toEqual(["the notes hold an em dash"])
		expect(notesProblems("Built from @SOURCE_COMMIT@.")).toEqual(["the notes hold @SOURCE_COMMIT@"])
	})
})

describe("needsNotes and notesRefusal", () => {
	test("a stable needs notes, a prerelease does not, an unreadable version throws", () => {
		expect(needsNotes("1.3.0")).toBe(true)
		expect(needsNotes("1.3.0-rc.0")).toBe(false)
		for (const version of ["", "v1.3.0", "1.3", "1.3.0 "]) expect(() => needsNotes(version), version).toThrow(/semantic version/)
	})

	test("a stable without notes or with bad notes is refused, naming the file", () => {
		expect(notesRefusal("1.3.0", GOOD)).toBeNull()
		expect(notesRefusal("1.3.0", null)).toContain("release-notes/1.3.0.md is missing")
		expect(notesRefusal("1.3.0", "x — y")).toBe("release-notes/1.3.0.md: the notes hold an em dash")
		expect(notesRefusal("1.3.0-rc.1", null)).toBeNull()
	})
})

test("the stable body opens with the notes, then git-cliff's text", () => {
	expect(composeBody("1.3.0", `\n${GOOD}\n`, "## 1.3.0\n\n### Install\n")).toBe(
		"## What's new in 1.3.0\n\nA lead line.\n\n- One change.\n- Another change.\n\n---\n\n## 1.3.0\n\n### Install\n",
	)
})

test("every committed notes file is named for a stable version and can ship", () => {
	const files = readdirSync(join(ROOT, NOTES_DIR))
	expect(files.length).toBeGreaterThan(0)
	for (const file of files) {
		expect(file, "release-notes/ holds only X.Y.Z.md files").toMatch(/^\d+\.\d+\.\d+\.md$/)
		expect(notesProblems(readFileSync(join(ROOT, NOTES_DIR, file), "utf8")), file).toEqual([])
	}
})
