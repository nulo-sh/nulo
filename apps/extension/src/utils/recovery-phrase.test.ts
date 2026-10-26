/**
 * The typed phrase's verdict follows the import's own checks on the canonical form it imports, so
 * the hint and the Import button can never call a phrase the import refuses correct, or refuse one
 * it accepts.
 */
import { afterEach, describe, expect, test, vi } from "vitest"
import { phraseHint, readPhraseVerdict } from "./recovery-phrase"

/** A phrase the import accepts: 24 words on the list with a valid checksum. */
const VALID = [...Array(23).fill("abandon"), "art"]

afterEach(() => vi.restoreAllMocks())

describe("readPhraseVerdict", () => {
	test.each([
		["single-spaced", VALID.join(" ")],
		["padded", `  ${VALID.join(" ")} `],
		["double-spaced", VALID.join("  ")],
		["upper case, tabs and line breaks", VALID.join("\t\n").toUpperCase()],
	])("a valid phrase %s is valid", async (_, input) => {
		expect(await readPhraseVerdict(input)).toEqual({ kind: "valid" })
	})

	test.each([
		["nothing", undefined, { kind: "empty" }],
		["only spaces", "   ", { kind: "empty" }],
		["23 words", VALID.slice(1).join(" "), { kind: "count", count: 23 }],
		["25 words", [...VALID, "abandon"].join(" "), { kind: "count", count: 25 }],
		["a word not on the list", VALID.map((w, i) => (i === 4 ? "abandonn" : w)).join(" "), { kind: "word", position: 5 }],
		["a bad checksum", Array(24).fill("abandon").join(" "), { kind: "checksum" }],
	])("%s is refused by name", async (_, input, verdict) => {
		expect(await readPhraseVerdict(input)).toEqual(verdict)
	})

	test("a read that fails for another reason rejects instead of giving a verdict", async () => {
		vi.spyOn(globalThis.crypto.subtle, "digest").mockRejectedValueOnce(new Error("digest unavailable"))
		await expect(readPhraseVerdict(VALID.join(" "))).rejects.toThrow("digest unavailable")
	})
})

describe("phraseHint", () => {
	test.each([
		[{ kind: "valid" }, "Correct"],
		[{ kind: "count", count: 23 }, "23 of 24 words"],
		[{ kind: "count", count: 25 }, "25 words. A phrase has 24."],
		[{ kind: "word", position: 5 }, "Word 5 is not in the word list."],
		[{ kind: "checksum" }, "A word is wrong or out of order."],
		[{ kind: "empty" }, ""],
		[{ kind: "pending" }, ""],
	] as const)("%o reads %j", (verdict, line) => {
		expect(phraseHint(verdict)).toBe(line)
	})
})
