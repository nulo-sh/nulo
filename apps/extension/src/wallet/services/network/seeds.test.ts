import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, describe, expect, test, vi } from "vitest"
import { bytesToHex } from "@nulo/wallet-core/utils"
import { stubBatchFetch } from "../../../../tests/helpers/batch-fetch"
import { createWalletNodeFactory } from "./node-factory"
import { DRPC_FREE_PLAN_BATCH_LIMIT, LOCAL_NETWORK_RPC_URL, maxBatchSizeFor, RETIRED_DEFAULT_ENDPOINTS, seedForKind } from "./seeds"
import type { Network } from "./spec"

describe("the remote defaults' batches", () => {
	afterEach(() => {
		vi.unstubAllGlobals()
	})

	// The remote defaults take no batch cap, so the client's own default must stay within dRPC's
	// limit. Red here means an Aztec bump raised it: give both dRPC origins a `BATCH_CAPS` entry.
	test.each(["mainnet", "testnet"] as const)("the wallet's %s node sends no request above dRPC's limit", async (kind) => {
		const seed = seedForKind(kind)
		if (!seed) throw new Error(`this build seeds no ${kind} network`)
		const entriesPerRequest = stubBatchFetch()
		const node = createWalletNodeFactory().createNode(seed.rpcUrl)
		const calls = 2 * DRPC_FREE_PLAN_BATCH_LIMIT + 50
		await Promise.all(Array.from({ length: calls }, () => node.getBlockNumber()))
		const sent = entriesPerRequest()
		expect(sent.reduce((sum, n) => sum + n, 0)).toBe(calls)
		expect(Math.max(...sent)).toBeLessThanOrEqual(DRPC_FREE_PLAN_BATCH_LIMIT)
	})
})

describe("maxBatchSizeFor", () => {
	test.each([
		["the local network", LOCAL_NETWORK_RPC_URL],
		["a custom node", "https://node.example"],
		["dRPC's paid host", "https://lb.drpc.live/"],
		["an unparseable string", "not a url"],
	])("leaves %s on the client's own batch size", (_label, url) => {
		expect(maxBatchSizeFor(url)).toBeUndefined()
	})
})

describe("RETIRED_DEFAULT_ENDPOINTS", () => {
	// The recording a v0.31.0 build stored; its Testnet row holds the retired default as seeded.
	const recorded: { entries: Record<string, string> } = JSON.parse(
		readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../../../tests/e2e/fixtures/update/v0.31.0.storage.json"), "utf8"),
	)
	const recordedTestnet = Object.entries(recorded.entries)
		.filter(([key]) => key.startsWith("nulo:core:networks@"))
		.map(([, text]) => JSON.parse(text) as Network)
		.find((row) => row.kind === "testnet")

	test("names the Testnet default a v0.31.0 build stored and moves it to this build's Testnet seed", async () => {
		const [entry] = RETIRED_DEFAULT_ENDPOINTS
		const url = recordedTestnet?.endpoints[0]?.rpcUrl ?? ""
		const digest = bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(url))))
		expect(RETIRED_DEFAULT_ENDPOINTS).toHaveLength(1)
		expect(entry?.replacement).toBe(seedForKind("testnet")?.rpcUrl)
		// A boolean, so a failure prints neither URL.
		expect(digest === entry?.sha256).toBe(true)
	})
})
