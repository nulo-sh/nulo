import { describe, expect, test } from "vitest"
import { bytesToHex } from "@nulo/wallet-core/utils"
import { type RetiredEndpoint, retireEndpoints } from "./retired-endpoints"
import type { Network, NetworkEndpoint } from "./spec"

const RETIRED_URL = "https://lb.drpc.live/aztec-testnet/FAKEKEY"
const REPLACEMENT = "https://aztec-testnet.drpc.org"

const digest = async (text: string) => bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))))
const retired: RetiredEndpoint[] = [{ sha256: await digest(RETIRED_URL), replacement: REPLACEMENT }]

const testnet = (endpoints: NetworkEndpoint[], primaryEndpointId = endpoints[0]!.id): Network => ({
	id: "net1",
	profileId: "p1",
	chainId: 1,
	l1ChainId: 11155111,
	name: "Testnet",
	primaryEndpointId,
	endpoints,
	kind: "testnet",
})

describe("retireEndpoints", () => {
	test("moves the retired endpoint to its replacement, keeping its id, label and primary role", async () => {
		const network = testnet(
			[
				{ id: "own1", rpcUrl: "https://node.example", label: "Mine" },
				{ id: "seed1", rpcUrl: RETIRED_URL, label: "dRPC" },
			],
			"seed1",
		)
		const before = structuredClone(network)
		const next = await retireEndpoints(network, retired)
		expect(next).toEqual({ ...before, endpoints: [before.endpoints[0], { id: "seed1", rpcUrl: REPLACEMENT, label: "dRPC" }] })
		expect(network).toEqual(before)
		expect(await retireEndpoints(next!, retired)).toBeUndefined()
	})

	test.each([
		["a person's own key on the same host", `${RETIRED_URL.slice(0, -"FAKEKEY".length)}OTHERKEY`],
		["a custom node", "https://node.example"],
		["a local endpoint", "http://localhost:8080"],
	])("leaves %s as it is", async (_label, rpcUrl) => {
		expect(await retireEndpoints(testnet([{ id: "e1", rpcUrl }]), retired)).toBeUndefined()
	})

	test("leaves the retired endpoint when the network already holds its replacement", async () => {
		const network = testnet([
			{ id: "seed1", rpcUrl: RETIRED_URL, label: "dRPC" },
			{ id: "own1", rpcUrl: REPLACEMENT },
		])
		expect(await retireEndpoints(network, retired)).toBeUndefined()
	})
})
