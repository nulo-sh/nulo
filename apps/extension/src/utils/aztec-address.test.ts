// @vitest-environment node
import { AztecAddress } from "@aztec-labs/stdlib/aztec-address"
import { Fr } from "@aztec-labs/foundation/curves/bn254"
import { describe, expect, test } from "vitest"
import { isValidAztecAddress } from "./aztec-address"

const OFF_CURVE = "0x24f20fb6e501242936eb1f47e2f51610f15e6c07486ed62012774e5f14ebd583"
const KAT_ACCOUNT = "0x04d7bb8a4a0239077d7d246279076fdab66f5ed6167bd01882fad6131199457a"
const TEST_USDC = "0x0f8df6867e9547fdf90e0f69187ada6fbd7b1f6ad4903ad333200bb032279ecf"
const MODULUS = "0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001"

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
