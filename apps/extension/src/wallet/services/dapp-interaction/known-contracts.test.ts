import { describe, expect, test } from "vitest"
import { knownContracts } from "./known-contracts"

const VERIFIED = {
	chainId: 7,
	contract: `0x${"EF".repeat(32)}`,
	expectedClassId: `0x${"1".repeat(64)}`,
	expectedSymbol: "USDC",
	expectedDecimals: 6,
	displayName: "Test USDC",
}
const FPCS = { sponsored: `0x${"AB".repeat(32)}`, private: `0x${"CD".repeat(32)}` }
const FEE_JUICE = `0x${"0".repeat(63)}3`
const AUTH_REGISTRY = "0x120bf1fe8c548704113679844f28f54b787aafad438bd90f20654f8ffef65e83"

describe("knownContracts", () => {
	test("the protocol contracts carry the drawn role names, in the drawn order, lower-cased", () => {
		expect(knownContracts(FPCS, [])).toEqual([
			{ address: FEE_JUICE, name: "Fee Juice" },
			{ address: `0x${"ab".repeat(32)}`, name: "Sponsored fee payer" },
			{ address: `0x${"cd".repeat(32)}`, name: "Private fee payer" },
			{ address: AUTH_REGISTRY, name: "Auth registry" },
		])
	})

	test("verified defaults follow, by their listed names", () => {
		expect(knownContracts(FPCS, [VERIFIED]).slice(4)).toEqual([{ address: `0x${"ef".repeat(32)}`, name: "Test USDC" }])
	})
})
