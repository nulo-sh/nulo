import type { AztecNode } from "@aztec-labs/stdlib/interfaces/client"
import { describe, expect, test } from "vitest"
import { FakeNodeFactory, transportFailure } from "./fake-node-factory"

const A = "https://a.example"
const B = "https://b.example"
const L1 = 11_155_111
const VERSION = 4
const spec = (urls: string[]) => ({
	chainId: (L1 ^ VERSION) >>> 0,
	l1ChainId: L1,
	endpoints: urls.map((rpcUrl, i) => ({ id: `e${i}`, rpcUrl })),
})
const identity = {
	getNodeInfo: async () => ({ l1ChainId: L1, rollupVersion: VERSION }),
	getChainTips: async () => ({ proposed: { number: 1 } }),
}

describe("FakeNodeFactory.createRoutedNode", () => {
	test("a one-endpoint route needs no admission stubs", async () => {
		const factory = new FakeNodeFactory()
		factory.setOverrides(A, { getBlockNumber: async () => 7 } as Partial<AztecNode>)
		await expect(factory.createRoutedNode(spec([A])).getBlockNumber()).resolves.toBe(7)
	})

	test("transportFailure moves a call to the next endpoint, as the real client's failure does", async () => {
		const factory = new FakeNodeFactory()
		factory.setOverrides(A, {
			...identity,
			getContract: async () => Promise.reject(transportFailure("server")),
		} as unknown as Partial<AztecNode>)
		factory.setOverrides(B, { ...identity, getContract: async () => "from b" } as unknown as Partial<AztecNode>)
		const node = factory.createRoutedNode(spec([A, B]))
		await expect(node.getContract(undefined as never)).resolves.toBe("from b")
		expect(node.route.active()?.id).toBe("e0")
	})
})
