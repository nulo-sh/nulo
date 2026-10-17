// @vitest-environment node
/**
 * The grant decode RPCs read the stored request approval executes, or the one a fee question
 * holds, by reference and before any fee choice, under the boundary every display decode shares: a
 * bounded batch, on a network the active profile owns, through the PXE's artifact for each contract. The stored request goes through the
 * real interaction service; the execution side is prototype-called with a minimal `this`, so the
 * full ExecutionService init graph is not constructed.
 */
import { describe, expect, test, vi } from "vitest"
import { TokenContractArtifact as StandardToken } from "@aztec-foundation/aztec-standards/artifacts/src/artifacts/Token.js"
import type { ContractArtifact } from "@aztec-labs/stdlib/abi"
import type { CallAuthwitContent } from "@nulo/wallet-bridge"
import { jsonSanitize } from "@nulo/wallet-core/utils"
import type { WindowManager } from "@/wallet/services/window-manager/window-manager"
import { DappInteractionService } from "@/wallet/services/dapp-interaction/service"
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

/** A playground grant as the interaction service stores it: no fee path, so approval needs a choice. */
const sendRequest = (contents: CallAuthwitContent[]) => ({
	kind: "send_transaction",
	account: `aztec:1:${OWNER}`,
	actions: contents.map((content) => ({ kind: "add_public_authwit", content })),
})

function makeSelf(
	contents: CallAuthwitContent[],
	{ networkProfileId = "pA", artifact = StandardToken as ContractArtifact, questionProfileId = "pA" } = {},
) {
	const profileService = { getActiveProfile: vi.fn(async () => ({ id: "pA" })) }
	const network = {
		id: "net1",
		profileId: networkProfileId,
		chainId: 1,
		primaryEndpointId: "e1",
		endpoints: [{ id: "e1", rpcUrl: "http://127.0.0.1:8080" }],
	}
	const networkService = { getNetwork: vi.fn(async () => network), getNetworks: vi.fn(async () => [network]) }
	const interactions = new DappInteractionService({ log: () => {} }, {} as WindowManager)
	Object.assign(interactions, {
		profileService,
		networkService,
		accountService: { getAccount: async () => ({ address: OWNER, chainId: 1 }) },
	})
	const session = { id: "s1", profileId: "pA", dappMetadata: { name: "dapp.example", url: "https://dapp.example" } }
	;(interactions as unknown as { storage: Map<string, unknown> }).storage.set("req-1", {
		id: "req-1",
		payload: { params: { operations: [sendRequest(contents)] }, session },
		handleId: "h-1",
		cancellationToken: "req-1",
	})
	;(interactions as unknown as { storage: Map<string, unknown> }).storage.set("q-1", {
		id: "q-1",
		payload: {
			feeQuestion: { fee: "21", approved: "16", payer: { type: "fj" } },
			operation: sendRequest(contents),
			session: { ...session, profileId: questionProfileId },
		},
		handleId: "h-2",
		cancellationToken: "q-1",
	})
	const getContractInstance = vi.fn(async () => ({ currentContractClassId: { toString: () => "0xc1a55" } }))
	const self = Object.assign(Object.create(ExecutionService.prototype), {
		ensureInitialized: async () => {},
		services: { get: () => interactions },
		profileService,
		networkService,
		pxeService: { getContractInstance, getContractArtifact: vi.fn(async () => artifact) },
	}) as ExecutionService
	return { self, interactions, getContractInstance }
}

describe("decodeGrantsForDisplay", () => {
	test("decodes the stored operation's grants before a fee is chosen, one artifact fetch per contract", async () => {
		const { self, interactions, getContractInstance } = makeSelf([TRANSFER, TRANSFER])
		// Approval still needs the choice the display does not wait for.
		await expect(interactions.materializeStoredOperation("req-1", 0)).rejects.toThrow("Select a fee payment method")
		const decoded = await self.decodeGrantsForDisplay("req-1", 0)
		expect(decoded.map((d) => d.kind)).toEqual(["decoded", "decoded"])
		expect(getContractInstance).toHaveBeenCalledTimes(1)
		await expect(self.decodeGrantsForDisplay("req-1", 1)).rejects.toThrow("Invalid id")
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

describe("decodeQuestionGrantsForDisplay", () => {
	test("decodes the grants of the send a fee question holds; each decode reads only its own kind of interaction", async () => {
		const { self } = makeSelf([TRANSFER])
		expect((await self.decodeQuestionGrantsForDisplay("q-1")).map((d) => d.kind)).toEqual(["decoded"])
		await expect(self.decodeQuestionGrantsForDisplay("req-1")).rejects.toThrow("Invalid id")
		await expect(self.decodeGrantsForDisplay("q-1", 0)).rejects.toThrow("Invalid id")
	})

	test("a question held for another profile is refused before any PXE read", async () => {
		const { self, getContractInstance } = makeSelf([TRANSFER], { questionProfileId: "pB" })
		await expect(self.decodeQuestionGrantsForDisplay("q-1")).rejects.toThrow("Wallet locked")
		expect(getContractInstance).not.toHaveBeenCalled()
	})
})
