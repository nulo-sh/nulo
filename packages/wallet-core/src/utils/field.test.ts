import { describe, expect, test } from "vitest"
import { BN254_FR_MODULUS, isHex32 } from "./field"

const DIGITS = "0f8df6867e9547fdf90e0f69187ada6fbd7b1f6ad4903ad333200bb032279ecf"

describe("isHex32", () => {
	test.each([
		["lower case", `0x${DIGITS}`],
		["upper case", `0x${DIGITS.toUpperCase()}`],
		["at or above the modulus: the range is not its question", `0x${"f".repeat(64)}`],
	])("accepts %s", (_, value) => {
		expect(isHex32(value)).toBe(true)
	})

	test.each([
		["63 digits", `0x${DIGITS.slice(1)}`],
		["65 digits", `0x0${DIGITS}`],
		["an upper-case prefix", `0X${DIGITS}`],
		["no prefix", DIGITS],
		["a non-hex digit", `0x${DIGITS.slice(1)}g`],
		["a trailing space", `0x${DIGITS} `],
		["the empty string", ""],
	])("refuses %s", (_, value) => {
		expect(isHex32(value)).toBe(false)
	})
})

test("BN254_FR_MODULUS is the scalar field modulus", () => {
	expect(BN254_FR_MODULUS).toBe(21888242871839275222246405745257275088548364400416034343698204186575808495617n)
})
