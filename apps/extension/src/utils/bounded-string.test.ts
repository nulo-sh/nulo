import { describe, expect, test } from "vitest"
import { boundedString } from "./bounded-string"

const ASTRAL = "😀"

describe("boundedString", () => {
	const schema = boundedString(4)

	test("a string at the budget in UTF-16 units passes, astral or not", () => {
		expect(schema.safeParse("abcd").success).toBe(true)
		expect(schema.safeParse(ASTRAL.repeat(2)).success).toBe(true)
	})

	test("astral characters within the budget in code points but over it in units are refused", () => {
		const result = schema.safeParse(ASTRAL.repeat(3))
		expect(result.error?.issues.map((issue) => [issue.code, "maximum" in issue ? issue.maximum : undefined])).toEqual([["too_big", 4]])
	})

	test("a string over the budget in code points is refused with one too_big issue", () => {
		const result = schema.safeParse("abcde")
		expect(result.error?.issues.map((issue) => issue.code)).toEqual(["too_big"])
	})

	test("a lone surrogate counts as one unit, as string.length does", () => {
		expect(schema.safeParse("abc\uD83D").success).toBe(true)
		expect(schema.safeParse("abcd\uD83D").success).toBe(false)
	})
})
