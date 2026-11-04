import type { AztecNode } from "@aztec-labs/stdlib/interfaces/client"
import { afterEach, expect, test, vi } from "vitest"
import { createWalletNodeFactory } from "./node-factory"
import { maxBatchSizeFor, seedForKind } from "./seeds"

vi.mock("./seeds", async (importOriginal) => {
	const actual = await importOriginal<typeof import("./seeds")>()
	return { ...actual, maxBatchSizeFor: vi.fn(actual.maxBatchSizeFor) }
})

afterEach(() => {
	vi.unstubAllGlobals()
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

test("the wallet's node factory sends the Mainnet default no request of more than 100 entries", async () => {
	const entriesPerRequest = stubAnsweringFetch()
	const node: AztecNode = createWalletNodeFactory().createNode(mainnet.rpcUrl)
	await Promise.all(Array.from({ length: 250 }, () => node.getBlockNumber()))
	expect(entriesPerRequest()).toEqual([100, 100, 50])
})

// The client's own default is also 100, so only a cap that differs from it shows the factory forwards the lookup.
test("the wallet's node factory sends no request above the cap the lookup answers", async () => {
	const entriesPerRequest = stubAnsweringFetch()
	vi.mocked(maxBatchSizeFor).mockReturnValueOnce(3)
	const node: AztecNode = createWalletNodeFactory().createNode(mainnet.rpcUrl)
	await Promise.all(Array.from({ length: 8 }, () => node.getBlockNumber()))
	expect(entriesPerRequest()).toEqual([3, 3, 2])
})
