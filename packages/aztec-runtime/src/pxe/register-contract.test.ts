// @vitest-environment node

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const compiledIn = vi.hoisted(() => new Map<string, unknown>())
vi.mock("./known-artifacts", () => ({
	loadProductionKnownArtifacts: async () => ({ artifacts: compiledIn, instances: new Map() }),
}))
vi.mock("./note-schemas", () => ({
	loadProductionNoteSchemas: async () => new Map<string, unknown>(),
}))

import { Fr } from "@aztec-labs/foundation/curves/bn254"
import { jsonStringify } from "@aztec-labs/foundation/json-rpc"
import type { PXE } from "@aztec-labs/pxe/client/bundle"
import type { ContractInstanceWithAddress } from "@aztec-labs/stdlib/contract"
import type { ILogger } from "@nulo/wallet-core/logger"
import { FrozenSchnorrAccountArtifact } from "../account/frozen-artifact"
import { NuloAccount } from "../account/nulo-account"
import { ChainRuntime, type NetworkInfo, type PxeFactory } from "./chain-runtime"
import { type IProfileReader, PxeService } from "./service"

const noopLogger: ILogger = { log: () => {} }
const noopProfiles: IProfileReader = {
	connect: async () => {},
	getProfiles: async () => [],
}
const network: NetworkInfo = { profileId: "p1", chainId: 31337, rpcUrl: "http://localhost:8080" }
const seed = Fr.fromHexString("0x0000000000000000000000000000000000000000000000000000000000000002")

function makeHarness(stored = new Map<string, unknown>()) {
	const writes: string[] = []
	const registeredClasses: unknown[] = []
	const factory: PxeFactory = {
		createChainRuntime: async (n) => {
			const pxe = {
				getContractArtifact: async (id: Fr) => stored.get(id.toString()),
				registerContractClass: async (artifact: unknown) => {
					writes.push("registerContractClass")
					registeredClasses.push(artifact)
				},
				registerContract: async (instance: ContractInstanceWithAddress) => {
					writes.push("registerContract")
					return instance.address
				},
			} as unknown as PXE
			return new ChainRuntime(n.chainId, {} as never, pxe, n.rpcUrl)
		},
	}
	const service = new PxeService(noopProfiles, noopLogger, factory)
	;(service as unknown as { initialized: boolean }).initialized = true
	return { service, writes, registeredClasses }
}

/** The service parses the RPC wire form (hex strings), so serialize the real instance first. */
async function genuineInstance(): Promise<Record<string, unknown>> {
	const account = await NuloAccount.new(seed, noopLogger, "account")
	const instance = (account as unknown as { instance: ContractInstanceWithAddress }).instance
	return JSON.parse(jsonStringify(instance))
}
/** Same wire-form requirement for the artifact. */
const WIRE_ARTIFACT = JSON.parse(jsonStringify(FrozenSchnorrAccountArtifact))
const OTHER_ADDRESS = "0x000000000000000000000000000000000000000000000000000000000000ab12"

describe("PxeService.registerContract derives the address before writing", () => {
	beforeEach(() => {
		vi.stubGlobal("chrome", { runtime: { onMessage: { addListener: () => {} }, sendMessage: () => {} } })
	})
	afterEach(() => {
		vi.unstubAllGlobals()
	})

	test("a genuine preimage/address pair registers the class, then the instance", async () => {
		const { service, writes } = makeHarness()
		await service.registerContract(network, { instance: (await genuineInstance()) as never, artifact: WIRE_ARTIFACT })
		expect(writes).toEqual(["registerContractClass", "registerContract"])
	})

	test("an address that does not derive from the preimage is rejected with NO write", async () => {
		const { service, writes } = makeHarness()
		const instance = await genuineInstance()
		const tampered = { ...instance, address: OTHER_ADDRESS }
		await expect(service.registerContract(network, { instance: tampered as never, artifact: WIRE_ARTIFACT })).rejects.toThrow(
			/registerContract address mismatch/,
		)
		expect(writes).toEqual([])
	})

	test("a tampered preimage field under the genuine address is rejected with NO write", async () => {
		const { service, writes } = makeHarness()
		const instance = await genuineInstance()
		const tampered = { ...instance, salt: new Fr(7n).toString() }
		await expect(service.registerContract(network, { instance: tampered as never })).rejects.toThrow(
			/registerContract address mismatch/,
		)
		expect(writes).toEqual([])
	})
})

describe("PxeService.registerContract writes the wallet's copy of a class it has one of", () => {
	beforeEach(() => {
		vi.stubGlobal("chrome", { runtime: { onMessage: { addListener: () => {} }, sendMessage: () => {} } })
	})
	afterEach(() => {
		compiledIn.clear()
		vi.unstubAllGlobals()
	})

	test("for a compiled-in class, the compiled-in copy is written, not the provided one", async () => {
		const instance = await genuineInstance()
		const ownCopy = { name: "the compiled-in copy" }
		compiledIn.set(String(instance.currentContractClassId), ownCopy)
		const { service, registeredClasses } = makeHarness()
		await service.registerContract(network, { instance: instance as never, artifact: WIRE_ARTIFACT })
		expect(registeredClasses).toHaveLength(1)
		expect(registeredClasses[0]).toBe(ownCopy)
	})

	test("for a class only the store holds, the stored copy is written", async () => {
		const instance = await genuineInstance()
		const stored = new Map<string, unknown>([[String(instance.currentContractClassId), FrozenSchnorrAccountArtifact]])
		const { service, registeredClasses } = makeHarness(stored)
		await service.registerContract(network, { instance: instance as never, artifact: WIRE_ARTIFACT })
		expect(registeredClasses).toHaveLength(1)
		expect(registeredClasses[0]).toBe(FrozenSchnorrAccountArtifact)
	})

	test("for a class the wallet has no copy of, the provided artifact is written (control)", async () => {
		const { service, registeredClasses } = makeHarness()
		await service.registerContract(network, { instance: (await genuineInstance()) as never, artifact: WIRE_ARTIFACT })
		expect(registeredClasses).toHaveLength(1)
		expect(registeredClasses[0]).not.toBe(FrozenSchnorrAccountArtifact)
		expect((registeredClasses[0] as { name: string }).name).toBe(FrozenSchnorrAccountArtifact.name)
	})
})
