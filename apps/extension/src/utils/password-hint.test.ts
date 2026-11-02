import { describe, expect, test } from "vitest"
import { NEW_PASSWORD_HINTS, newPasswordHint } from "./password-hint"

const H = NEW_PASSWORD_HINTS

describe("new-password hint", () => {
	test("the lines are the signed set", () => {
		expect(Object.values(H)).toEqual([
			"At least 8 characters",
			"Passwords don't match",
			"Easy to guess: repeated characters",
			"Easy to guess: characters in order",
			"Easy to guess: a keyboard pattern",
			"Easy to guess: a common password",
			"Easy to guess: make it longer",
			"Good password",
			"Strong password",
		])
	})

	test("length is judged before the match, and the match before the strength", () => {
		expect(newPasswordHint("", "")).toBe(H.short)
		expect(newPasswordHint("short", "other")).toBe(H.short)
		expect(newPasswordHint("aaaaaaaa", "aaaaaaab")).toBe(H.mismatch)
		expect(newPasswordHint("silver-otter-lamp", "")).toBe(H.mismatch)
	})

	// Each glyph below is one character to a person but two or more UTF-16 units or code points.
	test.each([
		["emoji", "😀", H.repeat],
		["accented letters", "e\u0301", H.repeat],
		// Eight families estimate 10^8.9 guesses, inside zxcvbn's good band, which carries no warning.
		["ZWJ families", "👨‍👩‍👧", H.good],
	])("seven %s are short; eight are long enough", (_name, glyph, eight) => {
		expect(newPasswordHint(glyph.repeat(7), glyph.repeat(7))).toBe(H.short)
		expect(newPasswordHint(glyph.repeat(8), glyph.repeat(8))).toBe(eight)
	})

	test.each([
		["aaaaaaaa", H.repeat],
		["abcabcabc", H.repeat],
		["😀".repeat(12), H.repeat],
		["abcdefghij", H.sequence],
		["98765432", H.sequence],
		["zxcvbnm,./", H.keyboard],
		["12345678", H.common],
		["qwertyuiop", H.common],
		["Password1!", H.common],
		["longenough", H.guessable],
		["q8Rt!vP3", H.guessable],
		// A common password's variant past 10^8 guesses leaves the weak band.
		["TestPassword123!", H.good],
		["kettle-violet", H.good],
		["blue7Kettle!", H.strong],
		["silver-otter-lamp", H.strong],
		// With no English word list, one long English word scores 10^15.
		["congratulations", H.strong],
		["😀😃😄😁😆😅🤣😂🙂🙃😉😊", H.strong],
	])("a matching %j reads %j", (password, line) => {
		expect(newPasswordHint(password, password)).toBe(line)
	})
})
