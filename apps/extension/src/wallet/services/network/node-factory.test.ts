import type { AztecNode } from "@aztec-labs/stdlib/interfaces/client"
import { afterEach, expect, test, vi } from "vitest"
import { stubBatchFetch } from "../../../../tests/helpers/batch-fetch"
import { createWalletNodeFactory } from "./node-factory"
import { maxBatchSizeFor, seedForKind } from "./seeds"

vi.mock("./seeds", async (importOriginal) => {
	const actual = await importOriginal<typeof import("./seeds")>()
	return { ...actual, maxBatchSizeFor: vi.fn(actual.maxBatchSizeFor) }
})

afterEach(() => {
	vi.unstubAllGlobals()
	vi.mocked(maxBatchSizeFor).mockReset()
})

const mainnet = seedForKind("mainnet")
if (!mainnet) throw new Error("this build seeds no Mainnet network")

// No remote default has a cap, so only a cap the lookup is made to answer shows the factory forwards it.
test("the wallet's node factory sends no request above the cap the lookup answers", async () => {
	const entriesPerRequest = stubBatchFetch()
	vi.mocked(maxBatchSizeFor).mockReturnValueOnce(3)
	const node: AztecNode = createWalletNodeFactory().createNode(mainnet.rpcUrl)
	await Promise.all(Array.from({ length: 8 }, () => node.getBlockNumber()))
	expect(entriesPerRequest()).toEqual([3, 3, 2])
})
