import { describe, expect, test } from "vitest"
import { isNewPasswordValid } from "./password"

describe("new-password rule", () => {
	test("short and mismatched pairs are refused, a long matching one accepted", () => {
		expect(isNewPasswordValid("short", "short")).toBe(false)
		expect(isNewPasswordValid("longenough", "longenougx")).toBe(false)
		expect(isNewPasswordValid("longenough", "longenough")).toBe(true)
	})
	test("an empty repeat never validates, whatever the password", () => {
		expect(isNewPasswordValid("", "")).toBe(false)
		expect(isNewPasswordValid("longenough", "")).toBe(false)
	})
	test("a weak matching pair is accepted: strength is advice, not a rule", () => {
		expect(isNewPasswordValid("aaaaaaaa", "aaaaaaaa")).toBe(true)
	})

	// Each glyph below is one character to a person but two or more UTF-16 units or code points.
	test.each([
		["emoji", "😀"],
		["accented letters", "é"],
		["ZWJ families", "👨‍👩‍👧"],
	])("seven %s are fewer than 8 characters, eight are enough", (_name, glyph) => {
		expect(isNewPasswordValid(glyph.repeat(7), glyph.repeat(7))).toBe(false)
		expect(isNewPasswordValid(glyph.repeat(8), glyph.repeat(8))).toBe(true)
	})
})
