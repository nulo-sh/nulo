/**
 * The hashing and the instance schema are faked at the stdlib boundary (a fake artifact names the
 * class id it hashes to), and the artifact schema refuses a value already parsed; the decoder, the
 * memo and the class-id comparison run for real.
 */
import { beforeEach, describe, expect, test, vi } from "vitest"

const stdlib = vi.hoisted(() => {
	const classId = (hex: string) => ({ toString: () => hex, equals: (other: { toString(): string }) => other.toString() === hex })
	const parseInstance = (raw: unknown) => {
		const x = raw as { address?: unknown; currentContractClassId?: unknown; originalContractClassId?: unknown }
		if (typeof x?.currentContractClassId !== "string" || typeof x.originalContractClassId !== "string") throw new Error("bad instance")
		return {
			...x,
			currentContractClassId: classId(x.currentContractClassId),
			originalContractClassId: classId(x.originalContractClassId),
		}
	}
	/** As the real schema does, a value already parsed (a `Buffer`, an `Fr`) is refused. */
	const isWire = (v: unknown): boolean =>
		v === null ||
		typeof v !== "object" ||
		((Array.isArray(v) || Object.getPrototypeOf(v) === Object.prototype) && Object.values(v).every(isWire))
	const parseArtifact = (x: unknown) => {
		if (!isWire(x)) throw new Error("expected wire form")
		return x
	}
	return {
		classId,
		parseInstance,
		parseArtifact,
		hash: vi.fn(async (artifact: { hashesTo?: string }) => {
			if (typeof artifact?.hashesTo !== "string") throw new Error("not an artifact")
			return { id: classId(artifact.hashesTo) }
		}),
	}
})

vi.mock("@aztec-labs/stdlib/contract", async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	ContractInstanceWithAddressSchema: {
		parseAsync: async (x: unknown) => stdlib.parseInstance(x),
		safeParseAsync: async (x: unknown) => {
			try {
				return { success: true, data: stdlib.parseInstance(x) }
			} catch (error) {
				return { success: false, error }
			}
		},
	},
	getContractClassFromArtifact: stdlib.hash,
}))
vi.mock("@aztec-labs/stdlib/abi", async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	ContractArtifactSchema: { parseAsync: async (x: unknown) => stdlib.parseArtifact(x) },
}))

import { ServiceCollection } from "@/wallet/base"
import { ConfigStore } from "@/wallet/config"
import { LoggerStore } from "@/wallet/logger"
import type { IService } from "@/wallet/base"
import { NETWORK_SERVICE_NAME, type Network } from "@/wallet/services/network/spec"
import { FakeFenceProfileService, LIVE_FENCE } from "./fence.fixtures"
import { AccountStateService } from "./service"

class FakeNetworkService implements IService {
	public static readonly name = NETWORK_SERVICE_NAME
	public readonly name = NETWORK_SERVICE_NAME
	public async start(): Promise<void> {}
}

const MISMATCH = "Contract artifact doesn't match instance's current class id"
const CLASS_A = `0x${"0a".repeat(32)}`
const CLASS_B = `0x${"0b".repeat(32)}`
const network = (id: string, chainId: number) =>
	({
		id,
		profileId: "p1",
		chainId,
		l1ChainId: 1,
		name: id,
		endpoints: [{ id: "primary", rpcUrl: "http://localhost:9" }],
		primaryEndpointId: "primary",
	}) as Network
const NET_A = network("net-a", 1)
const NET_B = network("net-b", 2)
const address = (n: number) => `0x${(n + 16).toString(16).repeat(32)}`
const instance = (n: number, classId: string) => ({
	address: address(n),
	currentContractClassId: classId,
	originalContractClassId: classId,
})
const entry = (n: number, classId: string) => ({ address: address(n), instance: instance(n, classId) })
const artifactOf = (classId: string, name = "A") => ({ name, hashesTo: classId })

type Registration = { instance: { address: string }; artifact?: unknown }

describe("AccountStateService.restore, contract code", () => {
	let service: AccountStateService
	let pxe: {
		registerSender: ReturnType<typeof vi.fn>
		registerContract: ReturnType<typeof vi.fn<(info: { chainId: number }, contract: Registration) => Promise<void>>>
		getContractArtifact: ReturnType<typeof vi.fn>
	}
	const registrations = () =>
		pxe.registerContract.mock.calls.map(([info, c]) => [
			info.chainId,
			c.instance.address,
			"artifact" in c ? (c.artifact as { name: string }).name : null,
		])

	beforeEach(async () => {
		stdlib.hash.mockClear()
		const services = new ServiceCollection()
		services.add(new FakeNetworkService())
		services.add(new FakeFenceProfileService())
		service = new AccountStateService(new LoggerStore(new ConfigStore()))
		services.add(service)
		await services.start()
		pxe = {
			registerSender: vi.fn(async (_info: unknown, a: unknown) => a),
			registerContract: vi.fn(async () => undefined),
			getContractArtifact: vi.fn(async () => undefined),
		}
		;(service as unknown as { pxeService: typeof pxe }).pxeService = pxe
	})

	test("instances of one class hash its artifact once; only the first registration carries it", async () => {
		const result = await service.restore(
			{
				format: 2,
				classes: [{ classId: CLASS_A, artifact: artifactOf(CLASS_A) }],
				items: [{ networkId: "net-a", senders: [], contracts: [entry(1, CLASS_A), entry(2, CLASS_A), entry(3, CLASS_A)] }],
			} as never,
			[NET_A],
			LIVE_FENCE,
		)
		expect(stdlib.hash).toHaveBeenCalledTimes(1)
		expect(registrations()).toEqual([
			[1, address(1), "A"],
			[1, address(2), null],
			[1, address(3), null],
		])
		expect(result[0].contracts).toEqual([{ address: address(1) }, { address: address(2) }, { address: address(3) }])
	})

	test("a first registration that fails leaves the artifact to the next one", async () => {
		pxe.registerContract.mockRejectedValueOnce(new Error("registerContract address mismatch"))
		const result = await service.restore(
			{
				format: 2,
				classes: [{ classId: CLASS_A, artifact: artifactOf(CLASS_A) }],
				items: [{ networkId: "net-a", senders: [], contracts: [entry(1, CLASS_A), entry(2, CLASS_A), entry(3, CLASS_A)] }],
			} as never,
			[NET_A],
			LIVE_FENCE,
		)
		expect(registrations()).toEqual([
			[1, address(1), "A"],
			[1, address(2), "A"],
			[1, address(3), null],
		])
		expect(result[0].contracts[0].restoreError).toContain("address mismatch")
	})

	test("a table entry of the wrong class fails only its own contracts, with the fixed text; another class registers", async () => {
		const result = await service.restore(
			{
				format: 2,
				classes: [
					{ classId: CLASS_A, artifact: artifactOf(CLASS_B, "under A") },
					{ classId: CLASS_B, artifact: artifactOf(CLASS_B, "B") },
				],
				items: [{ networkId: "net-a", senders: [], contracts: [entry(1, CLASS_A), entry(2, CLASS_B), entry(3, CLASS_A)] }],
			} as never,
			[NET_A],
			LIVE_FENCE,
		)
		expect(result[0].contracts).toEqual([
			{ address: address(1), restoreError: MISMATCH },
			{ address: address(2) },
			{ address: address(3), restoreError: MISMATCH },
		])
		expect(registrations()).toEqual([[1, address(2), "B"]])
	})

	test.each([
		["valid first", [CLASS_A, CLASS_B]],
		["invalid first", [CLASS_B, CLASS_A]],
	])("a format-1 file with two different artifacts under one class checks each one (%s)", async (_label, hashes) => {
		const contracts = hashes.map((hashesTo, i) => ({ ...entry(i + 1, CLASS_A), artifact: artifactOf(hashesTo, `copy ${i + 1}`) }))
		const result = await service.restore([{ networkId: "net-a", senders: [], contracts }] as never, [NET_A], LIVE_FENCE)
		const valid = hashes.indexOf(CLASS_A)
		expect(stdlib.hash).toHaveBeenCalledTimes(2)
		expect(result[0].contracts[1 - valid]).toEqual({ address: address(2 - valid), restoreError: MISMATCH })
		expect(result[0].contracts[valid]).toEqual({ address: address(valid + 1) })
		expect(registrations()).toEqual([[1, address(valid + 1), `copy ${valid + 1}`]])
	})

	test("a class two networks share is carried on each network", async () => {
		await service.restore(
			{
				format: 2,
				classes: [{ classId: CLASS_A, artifact: artifactOf(CLASS_A) }],
				items: [
					{ networkId: "net-a", senders: [], contracts: [entry(1, CLASS_A), entry(2, CLASS_A)] },
					{ networkId: "net-b", senders: [], contracts: [entry(3, CLASS_A)] },
				],
			} as never,
			[NET_A, NET_B],
			LIVE_FENCE,
		)
		expect(registrations()).toEqual([
			[1, address(1), "A"],
			[1, address(2), null],
			[2, address(3), "A"],
		])
		expect(stdlib.hash).toHaveBeenCalledTimes(1)
	})

	test("an entry with no code takes the wallet's own copy, looked up once per class; with none it fails alone", async () => {
		pxe.getContractArtifact.mockImplementation(async (_info: unknown, id: { toString(): string }) =>
			id.toString() === CLASS_A ? { ...artifactOf(CLASS_A, "own A"), bytecode: Buffer.from([1, 2, 3]) } : undefined,
		)
		const result = await service.restore(
			{
				format: 2,
				classes: [],
				items: [{ networkId: "net-a", senders: [], contracts: [entry(1, CLASS_A), entry(2, CLASS_B), entry(3, CLASS_A)] }],
			} as never,
			[NET_A],
			LIVE_FENCE,
		)
		expect(result[0].contracts).toEqual([
			{ address: address(1) },
			{ address: address(2), restoreError: "Contract artifact not found" },
			{ address: address(3) },
		])
		expect(pxe.getContractArtifact).toHaveBeenCalledTimes(2)
		expect(registrations()).toEqual([
			[1, address(1), "own A"],
			[1, address(3), null],
		])
	})

	test("table entries no contract references are never hashed", async () => {
		const bulk = Array.from({ length: 500 }, (_, i) => ({
			classId: `0x${i.toString(16).padStart(64, "e")}`,
			artifact: artifactOf(CLASS_B),
		}))
		await service.restore(
			{
				format: 2,
				classes: [...bulk, { classId: CLASS_A, artifact: artifactOf(CLASS_A) }],
				items: [{ networkId: "net-a", senders: [], contracts: [entry(1, CLASS_A)] }],
			} as never,
			[NET_A],
			LIVE_FENCE,
		)
		expect(stdlib.hash).toHaveBeenCalledTimes(1)
		expect(registrations()).toEqual([[1, address(1), "A"]])
	})

	test("no result record carries code, on any branch", async () => {
		pxe.registerContract.mockRejectedValueOnce(new Error("Request to http://x timed out after 5000ms"))
		const result = await service.restore(
			[
				{
					networkId: "net-a",
					senders: [],
					contracts: [
						{ ...entry(1, CLASS_A), artifact: artifactOf(CLASS_A) },
						{ ...entry(2, CLASS_A), artifact: artifactOf(CLASS_A) },
					],
				},
				{
					networkId: "net-b",
					senders: [],
					contracts: [
						{ address: "0x05x", instance: instance(3, CLASS_A), artifact: artifactOf(CLASS_A) },
						{ ...entry(4, CLASS_A), artifact: artifactOf(CLASS_A) },
					],
				},
			] as never,
			[NET_A, NET_B],
			LIVE_FENCE,
		)
		const records = result.flatMap((r) => r.contracts)
		expect(records.map((r) => r.restoreError === undefined)).toEqual([false, false, false, true])
		for (const record of records) expect(Object.keys(record).every((k) => k === "address" || k === "restoreError")).toBe(true)
	})
})
