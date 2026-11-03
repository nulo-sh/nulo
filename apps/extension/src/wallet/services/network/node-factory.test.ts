import type { AztecNode } from "@aztec-labs/stdlib/interfaces/client"
import { afterEach, expect, test, vi } from "vitest"
import { createWalletNodeFactory } from "./node-factory"
import { seedForKind } from "./seeds"

afterEach(() => {
	vi.unstubAllGlobals()
})

test("the wallet's node factory sends the Mainnet default no request of more than 3 entries", async () => {
	const mainnet = seedForKind("mainnet")
	if (!mainnet) throw new Error("this build seeds no Mainnet network")
	const fetch = vi.fn(async (_url: string, init: RequestInit) => {
		const calls = JSON.parse(String(init.body)) as { id: number }[]
		return new Response(JSON.stringify(calls.map((c) => ({ jsonrpc: "2.0", id: c.id, result: 7 }))))
	})
	vi.stubGlobal("fetch", fetch)
	const node: AztecNode = createWalletNodeFactory().createNode(mainnet.rpcUrl)
	await Promise.all(Array.from({ length: 8 }, () => node.getBlockNumber()))
	expect(fetch.mock.calls.map(([, init]) => (JSON.parse(String(init.body)) as unknown[]).length)).toEqual([3, 3, 2])
})
