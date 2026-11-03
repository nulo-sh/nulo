import { afterEach, describe, expect, test, vi } from "vitest"
import { TESTNET_L1_CHAIN_ID, TESTNET_ROLLUP_VERSION } from "../src/utils/chain-ids"
import { seedForKind } from "../src/wallet/services/network/seeds"
import { checkSeed } from "./seed-identity"
import { createPreflightNodeClient } from "./seed-preflight-node"

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
	})

	test("a node that refuses one request of the cap's size fails the seed", async () => {
		const mainnet = seedForKind("mainnet")
		if (!mainnet) throw new Error("this build seeds no Mainnet network")
		const fetch = vi.fn(
			async (_url: string, _init: RequestInit) =>
				new Response(JSON.stringify({ error: { message: "Batch of more than 24 requests are not allowed" } }), { status: 500 }),
		)
		vi.stubGlobal("fetch", fetch)
		const result = await checkSeed(mainnet, createPreflightNodeClient(mainnet.rpcUrl))
		expect(result.ok).toBe(false)
		expect(fetch.mock.calls.map(([, init]) => (JSON.parse(String(init.body)) as unknown[]).length)).toEqual([25])
	})

	test("the preflight client sends the Mainnet seed no request of more than 25 entries", async () => {
		const mainnet = seedForKind("mainnet")
		if (!mainnet) throw new Error("this build seeds no Mainnet network")
		const fetch = vi.fn(async (_url: string, init: RequestInit) => {
			const calls = JSON.parse(String(init.body)) as { id: number }[]
			return new Response(JSON.stringify(calls.map((c) => ({ jsonrpc: "2.0", id: c.id, result: 7 }))))
		})
		vi.stubGlobal("fetch", fetch)
		const node = createPreflightNodeClient(mainnet.rpcUrl)
		await Promise.all(Array.from({ length: 60 }, () => node.getBlockNumber()))
		expect(fetch.mock.calls.map(([, init]) => (JSON.parse(String(init.body)) as unknown[]).length)).toEqual([25, 25, 10])
	})
})
