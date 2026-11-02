import { afterEach, describe, expect, test, vi } from "vitest"
import { buildPhraseCheck, cryptoRandomIndex, isPhraseCheckPassed, type PhraseQuestion } from "./phrase-check"

const WORDS = Array.from({ length: 24 }, (_, i) => `w${i + 1}`)

afterEach(() => {
	vi.restoreAllMocks()
})

describe("buildPhraseCheck", () => {
	test("three distinct positions, ascending, each asking the word the grid numbers there", () => {
		for (let run = 0; run < 200; run++) {
			const questions = buildPhraseCheck(WORDS)
			const positions = questions.map((q) => q.position)
			expect(positions).toHaveLength(3)
			expect(new Set(positions).size).toBe(3)
			expect(positions).toEqual([...positions].sort((a, b) => a - b))
			for (const q of questions) {
				expect(q.position).toBeGreaterThanOrEqual(1)
				expect(q.position).toBeLessThanOrEqual(24)
				expect(q.phraseWord).toBe(WORDS[q.position - 1])
			}
		}
	})

	test("each question offers four distinct words of the phrase, its own among them", () => {
		for (let run = 0; run < 200; run++) {
			for (const q of buildPhraseCheck(WORDS)) {
				expect(q.phraseChoices).toHaveLength(4)
				expect(new Set(q.phraseChoices).size).toBe(4)
				expect(q.phraseChoices).toContain(q.phraseWord)
				for (const choice of q.phraseChoices) expect(WORDS).toContain(choice)
			}
		}
	})

	test("the draw decides positions and order: an injected source makes it repeatable", () => {
		const first = () => 0
		expect(buildPhraseCheck(WORDS, first).map((q) => [q.position, q.phraseChoices])).toEqual(
			buildPhraseCheck(WORDS, first).map((q) => [q.position, q.phraseChoices]),
		)
	})

	test("a phrase of few distinct words still builds, with every choice distinct and the answer offered", () => {
		const twoWords = Array.from({ length: 24 }, (_, i) => (i % 2 ? "abandon" : "zoo"))
		for (const q of buildPhraseCheck(twoWords)) {
			expect([...q.phraseChoices].sort()).toEqual(["abandon", "zoo"])
			expect(q.phraseWord).toBe(twoWords[q.position - 1])
		}
		const oneWord = Array.from({ length: 24 }, () => "abandon")
		expect(buildPhraseCheck(oneWord).map((q) => q.phraseChoices)).toEqual([["abandon"], ["abandon"], ["abandon"]])
	})
})

describe("isPhraseCheckPassed", () => {
	const questions: PhraseQuestion[] = [
		{ position: 3, phraseWord: "w3", phraseChoices: ["w9", "w3", "w1", "w20"] },
		{ position: 11, phraseWord: "w11", phraseChoices: ["w11", "w2", "w7", "w5"] },
		{ position: 20, phraseWord: "w20", phraseChoices: ["w4", "w8", "w20", "w3"] },
	]

	test("every question's own word passes", () => {
		expect(isPhraseCheckPassed(questions, ["w3", "w11", "w20"])).toBe(true)
	})

	test.each([
		{ refused: "one wrong word", picks: ["w3", "w11", "w8"] },
		{ refused: "the right words at the wrong positions", picks: ["w20", "w11", "w3"] },
		{ refused: "a question left unpicked", picks: ["w3", undefined, "w20"] },
		{ refused: "fewer picks than questions", picks: ["w3", "w11"] },
		{ refused: "more picks than questions", picks: ["w3", "w11", "w20", "w20"] },
	])("refuses $refused", ({ picks }) => {
		expect(isPhraseCheckPassed(questions, picks)).toBe(false)
	})

	test("refuses a check with no questions", () => {
		expect(isPhraseCheckPassed([], [])).toBe(false)
	})
})

describe("cryptoRandomIndex", () => {
	test("draws inside [0, bound) from the platform source", () => {
		const spy = vi.spyOn(crypto, "getRandomValues")
		for (let run = 0; run < 500; run++) {
			const value = cryptoRandomIndex(24)
			expect(Number.isInteger(value)).toBe(true)
			expect(value).toBeGreaterThanOrEqual(0)
			expect(value).toBeLessThan(24)
		}
		expect(spy).toHaveBeenCalled()
	})

	test("redraws a value from the biased tail instead of folding it", () => {
		// 2^32 mod 3 is 1, so the one value at or above the limit is 2^32 - 1.
		const draws = [2 ** 32 - 1, 5]
		vi.spyOn(crypto, "getRandomValues").mockImplementation(<T extends ArrayBufferView | null>(array: T): T => {
			;(array as unknown as Uint32Array)[0] = draws.shift() as number
			return array
		})
		expect(cryptoRandomIndex(3)).toBe(2)
		expect(draws).toEqual([])
	})

	test.each([0, -1, 1.5, Number.NaN])("refuses the bound %s", (bound) => {
		expect(() => cryptoRandomIndex(bound)).toThrow(RangeError)
	})
})
