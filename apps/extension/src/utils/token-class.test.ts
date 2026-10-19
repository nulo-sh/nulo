import { BUNDLED_TOKEN_CLASS_IDS } from "@nulo/token-list"
import { describe, expect, test } from "vitest"
import { isValidatedTokenClass } from "./token-class"

describe("isValidatedTokenClass", () => {
	const bundled = BUNDLED_TOKEN_CLASS_IDS[0] ?? ""

	test("a bundled class is in, in either case", () => {
		expect(isValidatedTokenClass(bundled)).toBe(true)
		expect(isValidatedTokenClass(`0x${bundled.slice(2).toUpperCase()}`)).toBe(true)
	})

	test("another class, and a row with none, are out", () => {
		expect(isValidatedTokenClass(`0x${"1".repeat(64)}`)).toBe(false)
		expect(isValidatedTokenClass(undefined)).toBe(false)
	})
})
