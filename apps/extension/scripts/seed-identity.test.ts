import { afterEach, describe, expect, test, vi } from "vitest"
import { TESTNET_L1_CHAIN_ID, TESTNET_ROLLUP_VERSION } from "../src/utils/chain-ids"
import { maxBatchSizeFor, seedForKind } from "../src/wallet/services/network/seeds"
import { checkSeed } from "./seed-identity"
import { createPreflightNodeClient } from "./seed-preflight-node"

vi.mock("../src/wallet/services/network/seeds", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../src/wallet/services/network/seeds")>()
	return { ...actual, maxBatchSizeFor: vi.fn(actual.maxBatchSizeFor) }
})

const TESTNET = seedForKind("testnet")
if (!TESTNET) throw new Error("this build seeds no Testnet")
const PINNED = `pinned chainId=${TESTNET.chainId} l1ChainId=${TESTNET_L1_CHAIN_ID}`

const node = (getNodeInfo: () => Promise<unknown>) => ({ getNodeInfo }) as Parameters<typeof checkSeed>[1]

describe("checkSeed", () => {
	test("a node on the pins passes with the pair it reported", async () => {
		const result = await checkSeed(
			TESTNET,
			node(async () => ({ l1ChainId: TESTNET_L1_CHAIN_ID, rollupVersion: TESTNET_ROLLUP_VERSION })),
		)
		expect(result).toEqual({
			ok: true,
			line: `Testnet: l1ChainId=${TESTNET_L1_CHAIN_ID} rollupVersion=${TESTNET_ROLLUP_VERSION} (${PINNED}) OK`,
		})
	})

	test("a rollup version that aliases the pinned chain id past 2^32 fails", async () => {
		const alias = TESTNET_ROLLUP_VERSION + 2 ** 32
		const result = await checkSeed(
			TESTNET,
			node(async () => ({ l1ChainId: TESTNET_L1_CHAIN_ID, rollupVersion: alias })),
		)
		expect(result).toEqual({ ok: false, line: `Testnet: l1ChainId=${TESTNET_L1_CHAIN_ID} rollupVersion=${alias} (${PINNED}) MISMATCH` })
	})

	test("a failed read prints none of the error's words", async () => {
		const result = await checkSeed(
			TESTNET,
			node(async () => {
				throw new Error("https://rpc.example: invalid credential /opaque-key")
			}),
		)
		expect(result).toEqual({ ok: false, line: `Testnet: no node info (${PINNED}) MISMATCH` })
	})
})

describe("checkSeed's batch at the seed's cap", () => {
	afterEach(() => {
		vi.unstubAllGlobals()
		vi.mocked(maxBatchSizeFor).mockReset()
	})

	const mainnet = seedForKind("mainnet")
	if (!mainnet) throw new Error("this build seeds no Mainnet network")

	function stubAnsweringFetch() {
		const fetch = vi.fn(async (_url: string, init: RequestInit) => {
			const calls = JSON.parse(String(init.body)) as { id: number }[]
			return new Response(JSON.stringify(calls.map((c) => ({ jsonrpc: "2.0", id: c.id, result: 7 }))))
		})
		vi.stubGlobal("fetch", fetch)
		return () => fetch.mock.calls.map(([, init]) => (JSON.parse(String(init.body)) as unknown[]).length)
	}

	test("a node that refuses one request of the cap's size fails the seed", async () => {
		// dRPC refuses a batch above its limit whole: HTTP 400, with an error for every entry.
		const error = { code: 31, message: "Batch of more than 99 requests are not allowed on free plan" }
		const fetch = vi.fn(async (_url: string, init: RequestInit) => {
			const calls = JSON.parse(String(init.body)) as { id: number }[]
			return new Response(JSON.stringify(calls.map((c) => ({ jsonrpc: "2.0", id: c.id, error }))), { status: 400 })
		})
		vi.stubGlobal("fetch", fetch)
		const result = await checkSeed(mainnet, createPreflightNodeClient(mainnet.rpcUrl))
		expect(result.ok).toBe(false)
		expect(fetch.mock.calls.map(([, init]) => (JSON.parse(String(init.body)) as unknown[]).length)).toEqual([100])
	})

	test("the preflight client sends the Mainnet seed no request of more than 100 entries", async () => {
		const entriesPerRequest = stubAnsweringFetch()
		const node = createPreflightNodeClient(mainnet.rpcUrl)
		await Promise.all(Array.from({ length: 250 }, () => node.getBlockNumber()))
		expect(entriesPerRequest()).toEqual([100, 100, 50])
	})

	// The real cap equals the client's own default of 100, so only a cap that differs from it shows the lookup is used.
	test("checkSeed sends one tick of the cap the lookup answers", async () => {
		vi.mocked(maxBatchSizeFor).mockReturnValueOnce(3)
		const getNodeInfo = vi.fn(async () => ({ l1ChainId: TESTNET_L1_CHAIN_ID, rollupVersion: TESTNET_ROLLUP_VERSION }))
		expect((await checkSeed(TESTNET, node(getNodeInfo))).ok).toBe(true)
		expect(getNodeInfo).toHaveBeenCalledTimes(3)
	})

	test("the preflight client sends no request above the cap the lookup answers", async () => {
		const entriesPerRequest = stubAnsweringFetch()
		vi.mocked(maxBatchSizeFor).mockReturnValueOnce(3)
		const node = createPreflightNodeClient(mainnet.rpcUrl)
		await Promise.all(Array.from({ length: 8 }, () => node.getBlockNumber()))
		expect(entriesPerRequest()).toEqual([3, 3, 2])
	})
})
