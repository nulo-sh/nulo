import { describe, expect, test } from "vitest"
import { CHAIN_IDS } from "@/utils/chain-ids"
import { TEST_FLAGGED, TEST_TOKENS } from "@/wallet/services/token-list/list.fixture"
import { flaggedKeysOf, isFlaggedToken } from "./token-flag"

const SCAM = TEST_FLAGGED.address
const OTHER = TEST_TOKENS.USDC
const flagged = new Set(
	flaggedKeysOf([
		{ chainId: CHAIN_IDS.TESTNET, address: SCAM },
		{ chainId: CHAIN_IDS.SANDBOX, address: OTHER },
	]),
)

describe("isFlaggedToken", () => {
	test("a row on a flagged chain and contract is flagged, in any spelling a restored row may keep", () => {
		expect(isFlaggedToken(flagged, { chainId: CHAIN_IDS.TESTNET, contract: SCAM })).toBe(true)
		expect(isFlaggedToken(flagged, { chainId: CHAIN_IDS.TESTNET, contract: `0x${SCAM.slice(2).toUpperCase()}` })).toBe(true)
		expect(isFlaggedToken(flagged, { chainId: CHAIN_IDS.TESTNET, contract: SCAM.slice(2) })).toBe(true)
		expect(isFlaggedToken(flagged, { chainId: CHAIN_IDS.SANDBOX, contract: OTHER })).toBe(true)
	})

	test("the same contract on another chain, and another contract on the same chain, are not", () => {
		expect(isFlaggedToken(flagged, { chainId: CHAIN_IDS.SANDBOX, contract: SCAM })).toBe(false)
		expect(isFlaggedToken(flagged, { chainId: CHAIN_IDS.TESTNET, contract: OTHER })).toBe(false)
	})

	test("an empty set, a missing token and a row with no chain or contract flag nothing", () => {
		expect(isFlaggedToken(new Set(), { chainId: CHAIN_IDS.TESTNET, contract: SCAM })).toBe(false)
		expect(isFlaggedToken(flagged, undefined)).toBe(false)
		expect(isFlaggedToken(flagged, { contract: SCAM })).toBe(false)
		expect(isFlaggedToken(flagged, { chainId: CHAIN_IDS.TESTNET })).toBe(false)
	})
})
