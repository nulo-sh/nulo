/** Every explorer link the popup renders comes from these builders; a null leaves the page on its copy fallback or shows no link. */
import { describe, expect, test } from "vitest"
import { CHAIN_IDS } from "@/utils/chain-ids"
import {
	explorerDisplayName,
	getAccountExplorerUrl,
	getBlockExplorerUrl,
	getContractExplorerUrl,
	getTransactionExplorerUrl,
} from "./explorers"

const TX = `0x${"ab".repeat(32)}`

describe("getTransactionExplorerUrl", () => {
	test("testnet → testnet aztecscan tx-effects URL (link renders)", () => {
		expect(getTransactionExplorerUrl(CHAIN_IDS.TESTNET, "aztecscan", TX)).toBe(`https://testnet.aztecscan.xyz/tx-effects/${TX}`)
	})

	test("sandbox (chainId 0) → null (no base URL → copy-hash fallback)", () => {
		expect(getTransactionExplorerUrl(CHAIN_IDS.SANDBOX, "aztecscan", TX)).toBeNull()
	})

	test("explorer disabled (null) → null", () => {
		expect(getTransactionExplorerUrl(CHAIN_IDS.TESTNET, null, TX)).toBeNull()
	})

	test("refuses a stored hash that is not 32-byte hex", () => {
		expect(getTransactionExplorerUrl(CHAIN_IDS.TESTNET, "aztecscan", `${TX}/../../address/x`)).toBeNull()
	})
})

const BASE = "https://testnet.aztecscan.xyz"
const BLOCK_HASH = `0x${"2c".repeat(32)}`
const ADDRESS = `0x${"1e".repeat(32)}`
const ADDRESS_BUILDERS = [
	["getContractExplorerUrl", getContractExplorerUrl, "contracts/instances"],
	["getAccountExplorerUrl", getAccountExplorerUrl, "address"],
] as const

describe("getBlockExplorerUrl", () => {
	test("a block number and a block hash each open the block's page", () => {
		expect(getBlockExplorerUrl(CHAIN_IDS.TESTNET, "aztecscan", 48213)).toBe(`${BASE}/blocks/48213`)
		expect(getBlockExplorerUrl(CHAIN_IDS.TESTNET, "aztecscan", BLOCK_HASH)).toBe(`${BASE}/blocks/${BLOCK_HASH}`)
	})

	test.each([
		["a negative number", -1],
		["a fraction", 1.5],
		["a number past the safe range", 2 ** 53],
		["NaN", Number.NaN],
		["a numeric string", "48213"],
		["a short hash", `0x${"2c".repeat(31)}`],
		["a hash without 0x", "2c".repeat(32)],
		["a hash carrying a path", `0x${"2c".repeat(32)}/../tx-effects`],
		["a hash with a trailing newline", `${BLOCK_HASH}\n`],
	])("refuses %s", (_, block) => {
		expect(getBlockExplorerUrl(CHAIN_IDS.TESTNET, "aztecscan", block)).toBeNull()
	})
})

describe.each(ADDRESS_BUILDERS)("%s", (_, build, route) => {
	test("an address opens its page", () => {
		expect(build(CHAIN_IDS.TESTNET, "aztecscan", ADDRESS)).toBe(`${BASE}/${route}/${ADDRESS}`)
	})

	test.each([
		["a short address", `0x${"1e".repeat(31)}`],
		["a non-hex address", `0x${"zz".repeat(32)}`],
		["an address carrying a query", `${ADDRESS}?x=1`],
		["an empty string", ""],
	])("refuses %s", (_, address) => {
		expect(build(CHAIN_IDS.TESTNET, "aztecscan", address)).toBeNull()
	})
})

describe("every new builder", () => {
	const urls = (chainId: number | null | undefined, explorerId: "aztecscan" | null) => [
		getBlockExplorerUrl(chainId, explorerId, 48213),
		getContractExplorerUrl(chainId, explorerId, ADDRESS),
		getAccountExplorerUrl(chainId, explorerId, ADDRESS),
	]

	test.each([
		["explorer None", CHAIN_IDS.TESTNET, null],
		["the sandbox", CHAIN_IDS.SANDBOX, "aztecscan"],
		["no chain", undefined, "aztecscan"],
		["an unresolved chain", null, "aztecscan"],
	] as const)("returns null under %s", (_, chainId, explorerId) => {
		expect(urls(chainId, explorerId)).toEqual([null, null, null])
	})
})

describe("explorerDisplayName", () => {
	test("names the chosen explorer", () => {
		expect(explorerDisplayName("aztecscan")).toBe("Aztecscan")
	})

	test("says explorer under explorer None", () => {
		expect(explorerDisplayName(null)).toBe("explorer")
	})

	test("says explorer for an id no explorer has", () => {
		expect(explorerDisplayName("etherscan" as never)).toBe("explorer")
	})
})
