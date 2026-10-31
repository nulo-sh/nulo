import { describe, expect, test } from "vitest"
import { isNewPasswordValid, newPasswordHint } from "./password"

describe("new-password rule", () => {
	test("short, mismatched, long and strong pairs", () => {
		expect(isNewPasswordValid("short", "short")).toBe(false)
		expect(newPasswordHint("short", "short")).toBe("At least 8 characters")
		expect(isNewPasswordValid("longenough", "longenougx")).toBe(false)
		expect(newPasswordHint("longenough", "longenougx")).toBe("Passwords don't match")
		const long = "a".repeat(25)
		expect(isNewPasswordValid(long, long)).toBe(true)
		expect(newPasswordHint(long, long)).toBe("Long enough. Don't forget it.")
		expect(isNewPasswordValid("longenough", "longenough")).toBe(true)
		expect(newPasswordHint("longenough", "longenough")).toBe("Strong password")
	})
	test("an empty repeat never validates, whatever the password", () => {
		expect(isNewPasswordValid("", "")).toBe(false)
		expect(isNewPasswordValid("longenough", "")).toBe(false)
		expect(newPasswordHint("", "")).toBe("At least 8 characters")
	})

	// Each glyph below is one character to a person but two or more UTF-16 units or code points.
	const EMOJI = "😀"
	const ACCENTED = "é"
	const FAMILY = "👨‍👩‍👧"
	test.each([
		["four emoji", EMOJI, 4],
		["seven accented letters", ACCENTED, 7],
		["seven ZWJ families", FAMILY, 7],
	])("%s are fewer than 8 characters", (_name, glyph, times) => {
		const password = glyph.repeat(times)
		expect(isNewPasswordValid(password, password)).toBe(false)
		expect(newPasswordHint(password, password)).toBe("At least 8 characters")
	})
	test.each([
		["eight emoji", EMOJI],
		["eight accented letters", ACCENTED],
		["eight ZWJ families", FAMILY],
	])("%s are 8 characters", (_name, glyph) => {
		const password = glyph.repeat(8)
		expect(isNewPasswordValid(password, password)).toBe(true)
		expect(newPasswordHint(password, password)).toBe("Strong password")
	})
	test("strength counts the same characters: 13 accented letters are not long, 25 emoji are", () => {
		const thirteen = ACCENTED.repeat(13)
		expect(newPasswordHint(thirteen, thirteen)).toBe("Strong password")
		const twentyFive = EMOJI.repeat(25)
		expect(newPasswordHint(twentyFive, twentyFive)).toBe("Long enough. Don't forget it.")
	})
})
