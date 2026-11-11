import { describe, expect, test } from "vitest"
import { isTokenIcon } from "@nulo/token-list/icon"
import { CHAIN_IDS } from "@/utils/chain-ids"
import { TEST_ICONS, TEST_LIST_ENTRIES_WITH_ICONS, TEST_TOKENS } from "@/wallet/services/token-list/list.fixture"
import { tokenIconFor, tokenIconsOf } from "./token-icon"

const icons = tokenIconsOf(TEST_LIST_ENTRIES_WITH_ICONS)

describe("utils/token-icon", () => {
	test("the fixture pictures are pictures the list may carry", () => {
		expect(Object.values(TEST_ICONS).every(isTokenIcon)).toBe(true)
	})

	test("only entries with a picture are keyed, on chain and lower-cased contract", () => {
		expect(icons).toEqual({
			[`${CHAIN_IDS.TESTNET}:${TEST_TOKENS.USDC}`]: TEST_ICONS.USDC,
			[`${CHAIN_IDS.TESTNET}:${TEST_TOKENS.GBPC}`]: TEST_ICONS.GBPC,
		})
	})

	test("a row meets its picture whatever its hex case or prefix, and never on another chain or contract", () => {
		const bare = TEST_TOKENS.USDC.slice(2).toUpperCase()
		expect(tokenIconFor(icons, { chainId: CHAIN_IDS.TESTNET, contract: `0x${bare}` })).toBe(TEST_ICONS.USDC)
		expect(tokenIconFor(icons, { chainId: CHAIN_IDS.TESTNET, contract: bare })).toBe(TEST_ICONS.USDC)
		expect(tokenIconFor(icons, { chainId: CHAIN_IDS.MAINNET, contract: TEST_TOKENS.USDC })).toBeUndefined()
		expect(tokenIconFor(icons, { chainId: CHAIN_IDS.TESTNET, contract: TEST_TOKENS.USDT })).toBeUndefined()
		expect(tokenIconFor(icons, { contract: TEST_TOKENS.USDC })).toBeUndefined()
		expect(tokenIconFor(icons, undefined)).toBeUndefined()
	})
})
