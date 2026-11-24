import { describe, expect, test } from "vitest"
import {
	CHAIN_IDS,
	MAINNET_L1_CHAIN_ID,
	MAINNET_ROLLUP_VERSION,
	RETIRED_CHAINS,
	TESTNET_L1_CHAIN_ID,
	TESTNET_ROLLUP_VERSION,
	walletChainId,
} from "./chain-ids"

// The literals are pinned beside the derivation because a pair edit re-keys every seeded network,
// explorer, price and default-token entry, so it must never land unnoticed.
describe("CHAIN_IDS derives from its recorded pair", () => {
	test("testnet → 685146337", () => {
		expect(CHAIN_IDS.TESTNET).toBe(walletChainId(TESTNET_L1_CHAIN_ID, TESTNET_ROLLUP_VERSION))
		expect(CHAIN_IDS.TESTNET).toBe(685146337)
	})

	test("mainnet → 2070860441", () => {
		expect(CHAIN_IDS.MAINNET).toBe(walletChainId(MAINNET_L1_CHAIN_ID, MAINNET_ROLLUP_VERSION))
		expect(CHAIN_IDS.MAINNET).toBe(2070860441)
	})

	test("the composite is an unsigned 32-bit number: a high-bit pair never reads negative", () => {
		const id = walletChainId(1, 2 ** 31)
		expect(id).toBe(2147483649)
		expect(typeof id).toBe("number")
	})

	test("a mainnet-kind row is checked against Ethereum mainnet", () => {
		expect(MAINNET_L1_CHAIN_ID).toBe(1)
	})
})

// Independent of the list: editing or dropping an entry reds here, so the list only grows. A reset
// appends its outgoing chain to both, in the commit that moves the pin.
const EXPECTED_RETIRED = [
	{ chainId: 2904119610, l1ChainId: 11155111, rollupVersion: 2914217885, network: "Testnet", major: 6, name: "Testnet V6-RC.1" },
	{ chainId: 3415328944, l1ChainId: 11155111, rollupVersion: 3409706519, network: "Testnet", major: 6, name: "Testnet V6-RC.3" },
	{ chainId: 4248422646, l1ChainId: 1, rollupVersion: 4248422647, network: "Alpha", major: 5, name: "Alpha V5" },
]

describe("RETIRED_CHAINS", () => {
	test("matches its independently hardcoded copy exactly", () => {
		expect(RETIRED_CHAINS).toEqual(EXPECTED_RETIRED)
	})

	test("every id derives from its recorded pair", () => {
		for (const chain of RETIRED_CHAINS) expect(chain.chainId).toBe(walletChainId(chain.l1ChainId, chain.rollupVersion))
	})

	test("no entry is a live id", () => {
		const live = new Set<number>(Object.values(CHAIN_IDS))
		expect(RETIRED_CHAINS.filter((chain) => live.has(chain.chainId))).toEqual([])
	})

	test("ids and names are unique, and every name opens with its network and major", () => {
		expect(new Set(RETIRED_CHAINS.map((chain) => chain.chainId)).size).toBe(RETIRED_CHAINS.length)
		expect(new Set(RETIRED_CHAINS.map((chain) => chain.name)).size).toBe(RETIRED_CHAINS.length)
		for (const chain of RETIRED_CHAINS) expect(chain.name.startsWith(`${chain.network} V${chain.major}`)).toBe(true)
	})
})
