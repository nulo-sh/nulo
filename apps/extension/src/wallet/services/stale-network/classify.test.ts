import { describe, expect, test } from "vitest"
import { CHAIN_IDS, LOCAL_L1_CHAIN_ID, MAINNET_L1_CHAIN_ID, TESTNET_L1_CHAIN_ID } from "@/utils/chain-ids"
import { type ClassifiedAccount, type ClassifiedNetwork, classifyChains, hasNetworkCause } from "./classify"

const OLD_TESTNET = 1234
const CUSTOM = 777

const testnet = (over: Partial<ClassifiedNetwork> = {}): ClassifiedNetwork => ({
	id: "tn",
	chainId: CHAIN_IDS.TESTNET,
	l1ChainId: TESTNET_L1_CHAIN_ID,
	kind: "testnet",
	...over,
})
const local = (over: Partial<ClassifiedNetwork> = {}): ClassifiedNetwork => ({
	id: "ln",
	chainId: 0,
	l1ChainId: LOCAL_L1_CHAIN_ID,
	kind: "local",
	...over,
})
const custom = (over: Partial<ClassifiedNetwork> = {}): ClassifiedNetwork => ({
	id: "cn",
	chainId: CUSTOM,
	l1ChainId: 5,
	kind: "custom",
	...over,
})

/** A Nulo_v1 row; `moved` makes this build derive another address for it. */
function nulo(chainId: number, l1ChainId: number, index: number, moved = false): ClassifiedAccount {
	const address = `0x${chainId}-${index}`
	return { chainId, l1ChainId, index, address, derivedAddress: moved ? `${address}-new` : address }
}
const imported = (chainId: number, l1ChainId: number, index: number): ClassifiedAccount => ({
	chainId,
	l1ChainId,
	index,
	address: `0xi${chainId}-${index}`,
})

describe("classifyChains", () => {
	test("a profile matching the build has no entries", () => {
		const accounts = [nulo(CHAIN_IDS.TESTNET, TESTNET_L1_CHAIN_ID, 0), nulo(0, LOCAL_L1_CHAIN_ID, 0)]
		expect(classifyChains([testnet(), local()], accounts)).toEqual({ entries: [], unclassifiable: null })
	})

	test("a seeded row behind its seed is a network reset; addresses stay when the L1 does", () => {
		const accounts = [nulo(OLD_TESTNET, TESTNET_L1_CHAIN_ID, 0), nulo(OLD_TESTNET, TESTNET_L1_CHAIN_ID, 1)]
		expect(classifyChains([testnet({ chainId: OLD_TESTNET }), local()], accounts)).toEqual({
			entries: [{ networkId: "tn", chainId: OLD_TESTNET, networkReset: true, addressesMoved: false }],
			unclassifiable: null,
		})
	})

	test("a network reset whose seed moved the L1 also moves the addresses", () => {
		const { entries } = classifyChains([testnet({ chainId: OLD_TESTNET, l1ChainId: 5 })], [nulo(OLD_TESTNET, 5, 0)])
		expect(entries).toEqual([{ networkId: "tn", chainId: OLD_TESTNET, networkReset: true, addressesMoved: true }])
	})

	test("both causes: the chain is behind its seed and every derived address moved", () => {
		const accounts = [nulo(OLD_TESTNET, TESTNET_L1_CHAIN_ID, 0, true), nulo(OLD_TESTNET, TESTNET_L1_CHAIN_ID, 1, true)]
		expect(classifyChains([testnet({ chainId: OLD_TESTNET })], accounts).entries).toEqual([
			{ networkId: "tn", chainId: OLD_TESTNET, networkReset: true, addressesMoved: true },
		])
	})

	test("every derived address on a current chain moved: addresses only, hidden and imported rows counted", () => {
		const accounts = [
			nulo(CHAIN_IDS.TESTNET, TESTNET_L1_CHAIN_ID, 0, true),
			nulo(CHAIN_IDS.TESTNET, TESTNET_L1_CHAIN_ID, 1, true),
			imported(CHAIN_IDS.TESTNET, TESTNET_L1_CHAIN_ID, 0),
			nulo(0, LOCAL_L1_CHAIN_ID, 0),
		]
		expect(classifyChains([testnet(), local()], accounts)).toEqual({
			entries: [{ networkId: "tn", chainId: CHAIN_IDS.TESTNET, networkReset: false, addressesMoved: true }],
			unclassifiable: null,
		})
	})

	test("Local re-keyed off chainId 0 is a network reset; Local at 0 never is", () => {
		expect(classifyChains([local({ chainId: 9 })], []).entries).toEqual([
			{ networkId: "ln", chainId: 9, networkReset: true, addressesMoved: false },
		])
		expect(hasNetworkCause(local())).toBe(false)
	})

	test("moved addresses on Local are confined like any other chain", () => {
		expect(classifyChains([local()], [nulo(0, LOCAL_L1_CHAIN_ID, 0, true)]).entries).toEqual([
			{ networkId: "ln", chainId: 0, networkReset: false, addressesMoved: true },
		])
	})

	test("a custom row is never a network reset, and its moved addresses are confined", () => {
		expect(hasNetworkCause(custom())).toBe(false)
		expect(hasNetworkCause({ chainId: 1, kind: undefined })).toBe(false)
		expect(classifyChains([custom()], [nulo(CUSTOM, 5, 0, true)]).entries).toEqual([
			{ networkId: "cn", chainId: CUSTOM, networkReset: false, addressesMoved: true },
		])
	})

	test("Mainnet with every address moved is recorded, never blocked, and has no network cause", () => {
		const mainnet: ClassifiedNetwork = { id: "mn", chainId: 42, l1ChainId: MAINNET_L1_CHAIN_ID, kind: "mainnet" }
		expect(hasNetworkCause(mainnet)).toBe(false)
		expect(classifyChains([mainnet], [nulo(42, MAINNET_L1_CHAIN_ID, 0, true)]).entries).toEqual([
			{ networkId: "mn", chainId: 42, networkReset: false, addressesMoved: true },
		])
	})

	test("a chain with some addresses moved blocks the profile, Mainnet included", () => {
		const mixed = [nulo(CHAIN_IDS.TESTNET, TESTNET_L1_CHAIN_ID, 0), nulo(CHAIN_IDS.TESTNET, TESTNET_L1_CHAIN_ID, 1, true)]
		expect(classifyChains([testnet()], mixed)).toEqual({
			entries: [],
			unclassifiable: {
				chainId: CHAIN_IDS.TESTNET,
				accountIndex: 1,
				storedAddress: `0x${CHAIN_IDS.TESTNET}-1`,
				derivedAddress: `0x${CHAIN_IDS.TESTNET}-1-new`,
			},
		})
		const mainnet: ClassifiedNetwork = { id: "mn", chainId: 42, l1ChainId: MAINNET_L1_CHAIN_ID, kind: "mainnet" }
		const mainnetMixed = [nulo(42, MAINNET_L1_CHAIN_ID, 0, true), nulo(42, MAINNET_L1_CHAIN_ID, 1)]
		expect(classifyChains([mainnet], mainnetMixed).unclassifiable?.chainId).toBe(42)
	})

	test("a moved account with no network row blocks the profile", () => {
		expect(classifyChains([testnet()], [nulo(55, TESTNET_L1_CHAIN_ID, 0, true)]).unclassifiable?.chainId).toBe(55)
	})

	test("a moved chain whose accounts disagree with the row's L1 blocks the profile", () => {
		const accounts = [nulo(CHAIN_IDS.TESTNET, TESTNET_L1_CHAIN_ID, 0, true), nulo(CHAIN_IDS.TESTNET, 5, 1, true)]
		expect(classifyChains([testnet()], accounts).unclassifiable?.chainId).toBe(CHAIN_IDS.TESTNET)
	})

	test("a moved chain owned by two rows blocks the profile", () => {
		const rows = [testnet(), custom({ id: "dup", chainId: CHAIN_IDS.TESTNET, l1ChainId: TESTNET_L1_CHAIN_ID })]
		expect(classifyChains(rows, [nulo(CHAIN_IDS.TESTNET, TESTNET_L1_CHAIN_ID, 0, true)]).unclassifiable).not.toBeNull()
	})

	test("an unclassifiable chain blocks even when another chain is resettable", () => {
		const accounts = [
			nulo(OLD_TESTNET, TESTNET_L1_CHAIN_ID, 0, true),
			nulo(0, LOCAL_L1_CHAIN_ID, 0),
			nulo(0, LOCAL_L1_CHAIN_ID, 1, true),
		]
		expect(classifyChains([testnet({ chainId: OLD_TESTNET }), local()], accounts)).toEqual({
			entries: [],
			unclassifiable: expect.objectContaining({ chainId: 0, accountIndex: 1 }),
		})
	})

	test("an imported-only chain gets no address verdict", () => {
		expect(classifyChains([testnet()], [imported(CHAIN_IDS.TESTNET, TESTNET_L1_CHAIN_ID, 0)])).toEqual({
			entries: [],
			unclassifiable: null,
		})
	})

	test("one entry per stale row, each on its own chain", () => {
		const accounts = [nulo(OLD_TESTNET, TESTNET_L1_CHAIN_ID, 0), nulo(CUSTOM, 5, 0, true)]
		expect(classifyChains([testnet({ chainId: OLD_TESTNET }), custom(), local()], accounts).entries).toEqual([
			{ networkId: "tn", chainId: OLD_TESTNET, networkReset: true, addressesMoved: false },
			{ networkId: "cn", chainId: CUSTOM, networkReset: false, addressesMoved: true },
		])
	})
})
