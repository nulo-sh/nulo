import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, describe, expect, test, vi } from "vitest"
import { bytesToHex } from "@nulo/wallet-core/utils"
import { stubBatchFetch } from "../../../../tests/helpers/batch-fetch"
import { createWalletNodeFactory } from "./node-factory"
import {
	DRPC_FREE_PLAN_BATCH_LIMIT,
	LOCAL_NETWORK_RPC_URL,
	maxBatchSizeFor,
	RETIRED_DEFAULT_ENDPOINTS,
	retireDefaultName,
	seedForKind,
} from "./seeds"
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

describe("retireDefaultName", () => {
	const row = (over: Partial<Network> & { id: string }): Network => ({
		profileId: "p1",
		chainId: 1,
		l1ChainId: 1,
		name: "Alpha V6",
		primaryEndpointId: "e1",
		endpoints: [{ id: "e1", rpcUrl: "https://node.example", label: "dRPC" }],
		kind: "mainnet",
		...over,
	})
	// Another profile's "Alpha" does not count as taken.
	const otherProfile = row({ id: "other", profileId: "p2", name: "Alpha", kind: "custom" })

	test.each(["Alpha V6", "Mainnet"])("a mainnet row named %s takes the seed's name, keeping everything else", (name) => {
		const network = row({ id: "mn", name })
		const before = structuredClone(network)
		const next = retireDefaultName(network, [network, otherProfile])
		expect(next).toEqual({ ...before, name: "Alpha" })
		expect(network).toEqual(before)
		expect(retireDefaultName(next!, [next!, otherProfile])).toBeUndefined()
	})

	test.each([
		["a name the person chose", row({ id: "mn", name: "My Alpha" })],
		["another case of a retired name", row({ id: "mn", name: "alpha v6" })],
		["a custom row", row({ id: "mn", kind: "custom" })],
		["a Testnet row", row({ id: "mn", kind: "testnet" })],
		["a row with no kind", row({ id: "mn", name: "Mainnet", kind: undefined })],
	])("leaves %s alone", (_label, network) => {
		expect(retireDefaultName(network, [network])).toBeUndefined()
	})

	test("leaves the row alone while another network of its profile holds the seed's name", () => {
		const network = row({ id: "mn" })
		expect(retireDefaultName(network, [network, row({ id: "mine", name: "Alpha", kind: "custom" })])).toBeUndefined()
	})
})
