/**
 * A full backup's contract part from the export to a fresh profile's restore: the real
 * `AccountStateService.backup`, the file assembly, the import's network remap and chain-sync tail,
 * and `AccountStateService.restore`. The PXE is a test-local stub of the client's methods: seeded
 * instances and artifacts on the exporting side, the wallet's catalog copy and a record of
 * registrations on the fresh one. Class-id hashing and the instance schema are faked at the stdlib
 * boundary, so nothing reaches Barretenberg.
 */
import { describe, expect, test, vi } from "vitest"

const stdlib = vi.hoisted(() => {
	const classId = (hex: string) => ({
		toString: () => hex,
		toJSON: () => hex,
		equals: (other: { toString(): string }) => other.toString() === hex,
	})
	const parseInstance = (raw: unknown) => {
		const x = raw as { currentContractClassId?: unknown; originalContractClassId?: unknown }
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
		hash: async (artifact: { hashesTo?: string }) => {
			if (typeof artifact?.hashesTo !== "string") throw new Error("not an artifact")
			return { id: classId(artifact.hashesTo) }
		},
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

import { runImportChainSync } from "@/composables/importChainSync"
import { assembleFullBackup, collectRestoreErrors, MAX_SEALABLE_TEXT_BYTES, remapNetworkIdByChain } from "@/utils/full-backup-helpers"
import type { IService } from "@/wallet/base"
import { ServiceCollection } from "@/wallet/base"
import { ConfigStore } from "@/wallet/config"
import { LoggerStore } from "@/wallet/logger"
import { NETWORK_SERVICE_NAME, type Network, NodeStatus } from "@/wallet/services/network/spec"
import { FakeFenceProfileService, LIVE_FENCE } from "./fence.fixtures"
import { AccountStateService } from "./service"
import { ACCOUNT_STATE_SERVICE_NAME, type AccountStateRestoreRecord } from "./spec"

const NOT_FOUND = "Contract artifact not found"
const classIdOf = (n: number) => `0x${n.toString(16).padStart(64, "0")}`
const addressOf = (n: number) => `0x${(n + 0x100).toString(16).padStart(64, "0")}`
const WALLET = classIdOf(1)
const APP_BIG = classIdOf(2)
const APP_SMALL = classIdOf(3)
const artifactOf = (classId: string, name: string, size: number) => ({ name, hashesTo: classId, functions: [], pad: "p".repeat(size) })

const exported = (id: string, chainId: number) =>
	({
		id,
		profileId: "p0",
		chainId,
		l1ChainId: 1,
		name: id,
		endpoints: [{ id: "primary", rpcUrl: "http://localhost:9" }],
		primaryEndpointId: "primary",
	}) as Network
const seeded = (id: string, chainId: number) => ({ ...exported(id, chainId), profileId: LIVE_FENCE.profileId })

/** One contract per class plus a second instance of the big app class, and two senders. */
const CONTRACTS = [
	{ address: addressOf(1), classId: WALLET },
	{ address: addressOf(2), classId: APP_BIG },
	{ address: addressOf(3), classId: APP_SMALL },
	{ address: addressOf(4), classId: APP_BIG },
]
const SENDERS = [addressOf(10), addressOf(11)]
const ARTIFACTS = new Map([
	[WALLET, artifactOf(WALLET, "Token", 3000)],
	[APP_BIG, artifactOf(APP_BIG, "BigApp", 6000)],
	[APP_SMALL, artifactOf(APP_SMALL, "SmallApp", 2000)],
])

class FakeNetworkService implements IService {
	public static readonly name = NETWORK_SERVICE_NAME
	public readonly name = NETWORK_SERVICE_NAME
	public constructor(private readonly rows: Network[]) {}
	public async start(): Promise<void> {}
	public async getNetworks() {
		return this.rows
	}
	public async getNetwork(id: string) {
		const row = this.rows.find((n) => n.id === id)
		if (!row) throw new Error("Network not found")
		return row
	}
	public async getNodeStatus() {
		return NodeStatus.Active
	}
}

async function startService(rows: Network[]): Promise<AccountStateService> {
	const services = new ServiceCollection()
	services.add(new FakeNetworkService(rows))
	services.add(new FakeFenceProfileService())
	const service = new AccountStateService(new LoggerStore(new ConfigStore()), undefined, async () => new Set([WALLET]))
	services.add(service)
	await services.start()
	return service
}

/** The exporting profile's PXE: its senders, contracts, instances and each class's artifact. */
async function exportingService(): Promise<AccountStateService> {
	const service = await startService([exported("aaaaaaaa", 7)])
	;(service as unknown as { pxeService: unknown }).pxeService = {
		getSenders: async () => SENDERS.map((a) => ({ toString: () => a })),
		getContracts: async () => CONTRACTS.map((c) => ({ toString: () => c.address })),
		getContractInstance: async (_info: unknown, address: { toString(): string }) => {
			const contract = CONTRACTS.find((c) => c.address === address.toString())
			return (
				contract && {
					address: contract.address,
					currentContractClassId: stdlib.classId(contract.classId),
					originalContractClassId: stdlib.classId(contract.classId),
				}
			)
		},
		getContractArtifact: async (_info: unknown, classId: { toString(): string }) => ARTIFACTS.get(classId.toString()),
	}
	return service
}

/** A fresh profile's PXE: it holds the wallet's own class only, and records what registers. */
async function freshService() {
	const service = await startService([seeded("bbbbbbbb", 7)])
	const registered: { address: string; artifact?: string }[] = []
	const senders: string[] = []
	;(service as unknown as { pxeService: unknown }).pxeService = {
		registerSender: async (_info: unknown, a: { toString(): string }) => {
			senders.push(a.toString())
			return a
		},
		registerContract: async (_info: unknown, c: { instance: { address: string }; artifact?: { name: string } }) => {
			registered.push({ address: c.instance.address, ...(c.artifact ? { artifact: c.artifact.name } : {}) })
		},
		getContractArtifact: async (_info: unknown, classId: { toString(): string }) =>
			classId.toString() === WALLET ? { ...artifactOf(WALLET, "Token (catalog)", 10), bytecode: Buffer.from([1, 2, 3]) } : undefined,
	}
	return { service, registered, senders }
}

/** Export as if the other parts left `room` bytes of the sealed file's text, then import the file
 *  into a fresh profile. */
async function exportThenImport(room: number) {
	const source = await exportingService()
	const file = await assembleFullBackup({ "wallet-version": "test" }, [
		{
			name: ACCOUNT_STATE_SERVICE_NAME,
			backup: (rest) => source.backup({ compactBytes: MAX_SEALABLE_TEXT_BYTES - room, prettyBytes: rest?.prettyBytes ?? 0 }),
		},
	])
	const data = (JSON.parse(file.compact) as { data: Record<string, unknown> }).data
	const fresh = await freshService()
	const network = seeded("bbbbbbbb", 7)
	remapNetworkIdByChain(data, [network], [ACCOUNT_STATE_SERVICE_NAME])
	const records: unknown[] = []
	await runImportChainSync({
		slice: data[ACCOUNT_STATE_SERVICE_NAME],
		deadlineAt: Date.now() + 30_000,
		createdNetworkIds: [network.id],
		restore: (slice, deadlineMs) => fresh.service.restore(slice as never, [network], LIVE_FENCE, deadlineMs),
		probe: async () => NodeStatus.Active,
		record: (r) => records.push(...r),
	})
	const part = data[ACCOUNT_STATE_SERVICE_NAME] as { classes: { classId: string }[] }
	return { ...fresh, part, records: records as AccountStateRestoreRecord[] }
}

describe("a full backup whose contract code passes what the file can carry", () => {
	test("leaves out the largest app code; every entry and sender restores, the left-out contracts read the existing error", async () => {
		const { part, registered, senders, records } = await exportThenImport(9000)
		expect(part.classes.map((c) => c.classId)).toEqual([WALLET, APP_SMALL])
		expect(senders).toEqual(SENDERS)
		expect(registered).toEqual([
			{ address: addressOf(1), artifact: "Token" },
			{ address: addressOf(3), artifact: "SmallApp" },
		])
		expect(collectRestoreErrors(ACCOUNT_STATE_SERVICE_NAME, records)).toEqual([
			{
				networkId: "bbbbbbbb",
				senders: [],
				contracts: [
					{ child: 1, restoreError: NOT_FOUND },
					{ child: 3, restoreError: NOT_FOUND },
				],
			},
		])
	})

	test("when every class must go, the wallet's own contracts restore from its catalog", async () => {
		const { part, registered, senders, records } = await exportThenImport(2500)
		expect(part.classes).toEqual([])
		expect(senders).toEqual(SENDERS)
		expect(registered).toEqual([{ address: addressOf(1), artifact: "Token (catalog)" }])
		const errors = collectRestoreErrors(ACCOUNT_STATE_SERVICE_NAME, records) as { contracts: unknown[] }[]
		expect(errors[0].contracts).toEqual([
			{ child: 1, restoreError: NOT_FOUND },
			{ child: 2, restoreError: NOT_FOUND },
			{ child: 3, restoreError: NOT_FOUND },
		])
	})
})
