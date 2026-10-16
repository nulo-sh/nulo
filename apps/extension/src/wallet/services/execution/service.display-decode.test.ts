// @vitest-environment node
/**
 * The grant decode RPC reads the stored request approval executes, by reference, under the boundary
 * every display decode shares: a bounded batch, on a network the active profile owns, through the
 * PXE's artifact for each contract. Prototype-call with a minimal `this`: the surface is four
 * service clients, so the full ExecutionService init graph is not constructed.
 */
import { describe, expect, test, vi } from "vitest"
import { TokenContractArtifact as StandardToken } from "@aztec-foundation/aztec-standards/artifacts/src/artifacts/Token.js"
import type { ContractArtifact } from "@aztec-labs/stdlib/abi"
import type { CallAuthwitContent } from "@nulo/wallet-bridge"
import { jsonSanitize } from "@nulo/wallet-core/utils"
import { ExecutionService } from "./service"

const OWNER = "0x0a1b2c0000000000000000000000000000000000000000000000000000009c2d"
const SPENDER = "0x1b5c090000000000000000000000000000000000000000000000000000083d4e"
const USDC = "0x2f4e8100000000000000000000000000000000000000000000000000000077a0"
const grant = (method: string, args: unknown[]): CallAuthwitContent => ({ kind: "call", caller: SPENDER, contract: USDC, method, args })
const TRANSFER = grant("transfer_public_to_public", [OWNER, SPENDER, "1", "0"])

/** A contract whose one function takes a boolean, as a dApp may register it. */
const FLAGS = {
	name: "Flags",
	functions: [
		{
			name: "set_flag",
			functionType: "private",
			isOnlySelf: false,
			isStatic: false,
			isInitializer: false,
			parameters: [{ name: "flag", type: { kind: "boolean" }, visibility: "private" }],
			returnTypes: [],
			errorTypes: {},
		},
	],
	nonDispatchPublicFunctions: [],
} as unknown as ContractArtifact

function makeSelf(contents: CallAuthwitContent[], { networkProfileId = "pA", artifact = StandardToken as ContractArtifact } = {}) {
	const getContractInstance = vi.fn(async () => ({ currentContractClassId: { toString: () => "0xc1a55" } }))
	const materializeStoredOperation = vi.fn(async () => ({
		kind: "send_transaction",
		networkId: "net1",
		actions: contents.map((content) => ({ kind: "add_public_authwit", content })),
	}))
	const self = Object.assign(Object.create(ExecutionService.prototype), {
		ensureInitialized: async () => {},
		services: { get: () => ({ materializeStoredOperation }) },
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
		pxeService: { getContractInstance, getContractArtifact: vi.fn(async () => artifact) },
	}) as ExecutionService
	return { self, getContractInstance, materializeStoredOperation }
}

describe("decodeGrantsForDisplay", () => {
	test("decodes the stored operation's grants, one artifact fetch per contract", async () => {
		const { self, getContractInstance, materializeStoredOperation } = makeSelf([TRANSFER, TRANSFER])
		const decoded = await self.decodeGrantsForDisplay("req-1", 0)
		expect(materializeStoredOperation).toHaveBeenCalledExactlyOnceWith("req-1", 0)
		expect(decoded.map((d) => d.kind)).toEqual(["decoded", "decoded"])
		expect(getContractInstance).toHaveBeenCalledTimes(1)
	})

	test("reads the stored value signing encodes, which the popup's JSON copy rewrites", async () => {
		// A Buffer-shaped object encodes as `true`; the message layer's JSON replacer turns it into "".
		const stored = grant("set_flag", [{ type: "Buffer", data: [] }])
		expect(jsonSanitize(stored).args).toEqual([""])
		const { self } = makeSelf([stored], { artifact: FLAGS })
		const [shown] = await self.decodeGrantsForDisplay("req-1", 0)
		expect(shown?.kind === "decoded" && shown.decoded.params).toEqual([{ name: "flag", value: { kind: "boolean", value: true } }])
	})

	test("another profile's network and a batch past the bound are refused before any PXE read", async () => {
		const other = makeSelf([TRANSFER], { networkProfileId: "pB" })
		await expect(other.self.decodeGrantsForDisplay("req-1", 0)).rejects.toThrow("unauthorized profile")
		const flood = makeSelf(Array(65).fill(TRANSFER))
		await expect(flood.self.decodeGrantsForDisplay("req-1", 0)).rejects.toThrow("Invalid calls")
		expect(other.getContractInstance).not.toHaveBeenCalled()
		expect(flood.getContractInstance).not.toHaveBeenCalled()
	})
})
