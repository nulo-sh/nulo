import { describe, expect, test } from "vitest"
import { CHAIN_IDS } from "@/utils/chain-ids"
import { getChainName } from "./utils"

describe("getChainName", () => {
	test.each([
		[CHAIN_IDS.TESTNET, "Testnet"],
		[CHAIN_IDS.MAINNET, "Alpha"],
		[CHAIN_IDS.SANDBOX, "Sandbox"],
		[42, "Aztec:42"],
	])("chain %i reads %s", (chainId, name) => {
		expect(getChainName(chainId)).toBe(name)
	})
})
