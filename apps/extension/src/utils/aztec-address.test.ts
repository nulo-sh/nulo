// @vitest-environment node
import { AztecAddress } from "@aztec-labs/stdlib/aztec-address"
import { Fr } from "@aztec-labs/foundation/curves/bn254"
import { BN254_FR_MODULUS } from "@nulo/wallet-core/utils"
import { describe, expect, test } from "vitest"
import { bareAztecAddress, isValidAztecAddress } from "./aztec-address"

const OFF_CURVE = "0x24f20fb6e501242936eb1f47e2f51610f15e6c07486ed62012774e5f14ebd583"
const KAT_ACCOUNT = "0x04d7bb8a4a0239077d7d246279076fdab66f5ed6167bd01882fad6131199457a"
const TEST_USDC = "0x0f8df6867e9547fdf90e0f69187ada6fbd7b1f6ad4903ad333200bb032279ecf"
const MODULUS = "0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001"

test("the shared field modulus is upstream's", () => {
	expect(BN254_FR_MODULUS).toBe(Fr.MODULUS)
})

describe("isValidAztecAddress", () => {
	test("accepts real addresses and refuses an off-curve one", () => {
		expect(isValidAztecAddress(KAT_ACCOUNT)).toBe(true)
		expect(isValidAztecAddress(TEST_USDC)).toBe(true)
		expect(isValidAztecAddress(TEST_USDC.toUpperCase().replace("0X", "0x"))).toBe(true)
		expect(isValidAztecAddress(OFF_CURVE)).toBe(false)
	})

	test("refuses malformed hex, the zero address and values at or above the modulus", () => {
		expect(isValidAztecAddress("")).toBe(false)
		expect(isValidAztecAddress(KAT_ACCOUNT.slice(0, -1))).toBe(false)
		expect(isValidAztecAddress(`0x${"0".repeat(64)}`)).toBe(false)
		expect(isValidAztecAddress(MODULUS)).toBe(false)
		expect(isValidAztecAddress(`0x${"f".repeat(64)}`)).toBe(false)
	})

	test("agrees with upstream AztecAddress.isValid on random field elements", async () => {
		const fixed = [KAT_ACCOUNT, TEST_USDC, OFF_CURVE].map((h) => AztecAddress.fromStringUnsafe(h))
		const random = Array.from({ length: 64 }, () => new AztecAddress(Fr.random()))
		let invalid = 0
		for (const address of [...fixed, ...random]) {
			const upstream = await address.isValid()
			if (!upstream) invalid++
			expect(isValidAztecAddress(address.toString()), address.toString()).toBe(upstream)
		}
		// Both answers occur, so the comparison is not vacuous.
		expect(invalid).toBeGreaterThan(0)
		expect(invalid).toBeLessThan(fixed.length + random.length)
	})
})

describe("bareAztecAddress", () => {
	const cp = (n: number) => String.fromCodePoint(n)
	const inner = (char: string) => `${TEST_USDC.slice(0, 30)}${char}${TEST_USDC.slice(30)}`

	test("a bare address is returned as given, case included", () => {
		const mixed = `0x${TEST_USDC.slice(2).toUpperCase()}`
		expect(bareAztecAddress(TEST_USDC)).toBe(TEST_USDC)
		expect(bareAztecAddress(` ${mixed}\u200D`)).toBe(mixed)
	})

	test.each([
		["a space", " "],
		["a no-break space", cp(0xa0)],
		["a tab", "\t"],
		["a line feed", "\n"],
		["the Ogham space mark", cp(0x1680)],
		["a zero-width joiner", cp(0x200d)],
		["a zero-width non-joiner", cp(0x200c)],
		["a zero-width space", cp(0x200b)],
		["a right-to-left override", cp(0x202e)],
		["a byte-order mark", cp(0xfeff)],
		["a soft hyphen", cp(0xad)],
		["the Hangul filler", cp(0x3164)],
		["the Hangul choseong filler", cp(0x115f)],
		["a tag space, outside the BMP", cp(0xe0020)],
		["a variation selector, outside the BMP", cp(0xe0100)],
	])("%s at either end is dropped", (_, char) => {
		expect(bareAztecAddress(`${char}${KAT_ACCOUNT}`)).toBe(KAT_ACCOUNT)
		expect(bareAztecAddress(`${KAT_ACCOUNT}${char}`)).toBe(KAT_ACCOUNT)
		expect(bareAztecAddress(`${char}${char}${KAT_ACCOUNT}${char}`)).toBe(KAT_ACCOUNT)
	})

	test("a mix of edge characters before and after is dropped", () => {
		expect(bareAztecAddress(`${cp(0xa0)}\t${cp(0x200c)} ${TEST_USDC} ${cp(0x200d)}${cp(0xe0020)}${cp(0x3164)}`)).toBe(TEST_USDC)
	})

	test.each([
		["a space inside", inner(" ")],
		["a zero-width joiner inside", inner(cp(0x200d))],
		["the Hangul filler inside", inner(cp(0x3164))],
		["a visible character at an edge", `${TEST_USDC}.`],
		["a combining mark at an edge", `${TEST_USDC}${cp(0x301)}`],
		["fullwidth digits", TEST_USDC.replace(/[0-9]/g, (d) => cp(0xff10 + Number(d)))],
		["a Cyrillic look-alike letter", TEST_USDC.replace("a", cp(0x430))],
		["two addresses", `${TEST_USDC} ${KAT_ACCOUNT}`],
		["hex off the curve", ` ${OFF_CURVE}${cp(0x200d)}`],
		["a name", "Alice "],
		["empty text", ""],
		["edge characters only", ` ${cp(0x200d)}\t${cp(0x3164)}`],
	])("%s is no address", (_, text) => {
		expect(bareAztecAddress(text)).toBeUndefined()
	})
})
