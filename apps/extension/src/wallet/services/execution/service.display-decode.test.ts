// @vitest-environment node
/**
 * The display decode RPCs share one boundary: a bounded batch, on a network the active profile owns,
 * read through the PXE's artifact for each contract. Prototype-call with a minimal `this`: the
 * surface is three service clients, so the full ExecutionService init graph is not constructed.
 */
import { describe, expect, test, vi } from "vitest"
import { TokenContractArtifact as StandardToken } from "@aztec-foundation/aztec-standards/artifacts/src/artifacts/Token.js"
import type { CallAuthwitContent } from "@nulo/wallet-bridge"
import { ExecutionService } from "./service"

const OWNER = "0x0a1b2c0000000000000000000000000000000000000000000000000000009c2d"
const SPENDER = "0x1b5c090000000000000000000000000000000000000000000000000000083d4e"
const USDC = "0x2f4e8100000000000000000000000000000000000000000000000000000077a0"
const grant: CallAuthwitContent = {
	kind: "call",
	caller: SPENDER,
	contract: USDC,
	method: "transfer_public_to_public",
	args: [OWNER, SPENDER, "1", "0"],
}

function makeSelf(networkProfileId: string) {
	const getContractInstance = vi.fn(async () => ({ currentContractClassId: { toString: () => "0xc1a55" } }))
	const self = Object.assign(Object.create(ExecutionService.prototype), {
		ensureInitialized: async () => {},
		profileService: { getActiveProfile: vi.fn(async () => ({ id: "pA" })) },
		networkService: {
			getNetwork: vi.fn(async () => ({
				id: "net1",
				profileId: networkProfileId,
				chainId: 1,
				primaryEndpointId: "e1",
				endpoints: [{ id: "e1", rpcUrl: "http://127.0.0.1:8080" }],
			})),
		},
		pxeService: { getContractInstance, getContractArtifact: vi.fn(async () => StandardToken) },
	}) as ExecutionService
	return { self, getContractInstance }
}

describe("decodeGrantsForDisplay", () => {
	test("decodes each grant of the active profile's network, one artifact fetch per contract", async () => {
		const { self, getContractInstance } = makeSelf("pA")
		const decoded = await self.decodeGrantsForDisplay("net1", [grant, grant])
		expect(decoded.map((d) => d.kind)).toEqual(["decoded", "decoded"])
		expect(getContractInstance).toHaveBeenCalledTimes(1)
	})

	test("another profile's network and a batch past the bound are refused before any PXE read", async () => {
		const other = makeSelf("pB")
		await expect(other.self.decodeGrantsForDisplay("net1", [grant])).rejects.toThrow("unauthorized profile")
		const flood = makeSelf("pA")
		await expect(flood.self.decodeGrantsForDisplay("net1", Array(65).fill(grant))).rejects.toThrow("Invalid calls")
		expect(other.getContractInstance).not.toHaveBeenCalled()
		expect(flood.getContractInstance).not.toHaveBeenCalled()
	})
})
