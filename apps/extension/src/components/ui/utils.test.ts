import { describe, expect, test } from "vitest"
import { CHAIN_IDS } from "@/utils/chain-ids"
import { getChainName, getNetworkName } from "./utils"

describe("getChainName", () => {
	test.each([
		[CHAIN_IDS.TESTNET, "Testnet"],
		[CHAIN_IDS.MAINNET, "Alpha"],
		[CHAIN_IDS.SANDBOX, "Sandbox"],
		[2904119610, "Testnet V6-RC.1"],
		[3415328944, "Testnet V6-RC.3"],
		[4248422646, "Alpha V5"],
		[42, "Aztec:42"],
	])("chain %i reads %s", (chainId, name) => {
		expect(getChainName(chainId)).toBe(name)
	})
})

describe("getNetworkName", () => {
	const networks = [
		{ chainId: CHAIN_IDS.TESTNET, name: "Staging" },
		{ chainId: CHAIN_IDS.SANDBOX, name: "Local Network" },
		{ chainId: 31337, name: "My Devnet" },
	]
	test.each([
		["a renamed seed", CHAIN_IDS.TESTNET, "Staging"],
		["the seeded Local Network", CHAIN_IDS.SANDBOX, "Local Network"],
		["an added network", 31337, "My Devnet"],
		["no row, retired", 3415328944, "Testnet V6-RC.3"],
		["no row, never known", 677692, "Aztec:677692"],
	])("%s: chain %i reads %s", (_, chainId, name) => {
		expect(getNetworkName(chainId, networks)).toBe(name)
	})

	test("a row reusing a retired chain's id reads by its own name", () => {
		expect(getNetworkName(3415328944, [{ chainId: 3415328944, name: "Old RC" }])).toBe("Old RC")
	})
})
