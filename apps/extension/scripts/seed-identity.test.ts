import { afterEach, describe, expect, test, vi } from "vitest"
import { TESTNET_L1_CHAIN_ID, TESTNET_ROLLUP_VERSION } from "../src/utils/chain-ids"
import { DRPC_FREE_PLAN_BATCH_LIMIT, maxBatchSizeFor, seedForKind } from "../src/wallet/services/network/seeds"
import { stubBatchFetch } from "../tests/helpers/batch-fetch"
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

describe("checkSeed's batch", () => {
	afterEach(() => {
		vi.unstubAllGlobals()
		vi.mocked(maxBatchSizeFor).mockReset()
	})

	const mainnet = seedForKind("mainnet")
	if (!mainnet) throw new Error("this build seeds no Mainnet network")

	test("a node that refuses one request of dRPC's limit fails the seed", async () => {
		// Both the tick and the client take the limit, so one request of exactly that size goes out.
		vi.mocked(maxBatchSizeFor).mockReturnValue(DRPC_FREE_PLAN_BATCH_LIMIT)
		// dRPC refuses a batch above its limit whole: HTTP 400, with an error for every entry.
		const error = { code: 31, message: "Batch of more than 99 requests are not allowed on free plan" }
		const entriesPerRequest = stubBatchFetch(
			(calls) => new Response(JSON.stringify(calls.map((c) => ({ jsonrpc: "2.0", id: c.id, error }))), { status: 400 }),
		)
		const result = await checkSeed(mainnet, createPreflightNodeClient(mainnet.rpcUrl))
		expect(result.ok).toBe(false)
		expect(entriesPerRequest()).toEqual([DRPC_FREE_PLAN_BATCH_LIMIT])
	})

	test("checkSeed sends a seed with no cap one tick of dRPC's limit", async () => {
		const getNodeInfo = vi.fn(async () => ({ l1ChainId: TESTNET_L1_CHAIN_ID, rollupVersion: TESTNET_ROLLUP_VERSION }))
		expect((await checkSeed(TESTNET, node(getNodeInfo))).ok).toBe(true)
		expect(getNodeInfo).toHaveBeenCalledTimes(DRPC_FREE_PLAN_BATCH_LIMIT)
	})

	// A cap that differs from dRPC's limit shows the lookup is used.
	test("checkSeed sends one tick of the cap the lookup answers", async () => {
		vi.mocked(maxBatchSizeFor).mockReturnValueOnce(3)
		const getNodeInfo = vi.fn(async () => ({ l1ChainId: TESTNET_L1_CHAIN_ID, rollupVersion: TESTNET_ROLLUP_VERSION }))
		expect((await checkSeed(TESTNET, node(getNodeInfo))).ok).toBe(true)
		expect(getNodeInfo).toHaveBeenCalledTimes(3)
	})

	test("the preflight client sends no request above the cap the lookup answers", async () => {
		const entriesPerRequest = stubBatchFetch()
		vi.mocked(maxBatchSizeFor).mockReturnValueOnce(3)
		const node = createPreflightNodeClient(mainnet.rpcUrl)
		await Promise.all(Array.from({ length: 8 }, () => node.getBlockNumber()))
		expect(entriesPerRequest()).toEqual([3, 3, 2])
	})
})
