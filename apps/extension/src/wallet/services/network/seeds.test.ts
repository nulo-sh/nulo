import { describe, expect, test } from "vitest"
import { LOCAL_NETWORK_RPC_URL, maxBatchSizeFor, seedForKind } from "./seeds"

const remoteSeedUrls = (["mainnet", "testnet"] as const).map((kind) => {
	const seed = seedForKind(kind)
	if (!seed) throw new Error(`this build seeds no ${kind} network`)
	return seed.rpcUrl
})

describe("maxBatchSizeFor", () => {
	test("caps both remote defaults at 3, also when the URL is typed with a trailing slash", () => {
		for (const url of [...remoteSeedUrls, "https://aztec-mainnet.drpc.org/", "https://aztec-testnet.drpc.org/"]) {
			expect(maxBatchSizeFor(url)).toBe(3)
		}
	})

	test.each([
		["the local network", LOCAL_NETWORK_RPC_URL],
		["a custom node", "https://node.example"],
		["dRPC's paid host", "https://lb.drpc.live/"],
		["an unparseable string", "not a url"],
	])("leaves %s on the client's own batch size", (_label, url) => {
		expect(maxBatchSizeFor(url)).toBeUndefined()
	})
})
