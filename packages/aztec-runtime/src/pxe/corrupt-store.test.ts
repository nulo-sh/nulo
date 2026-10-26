/**
 * A PXE chain store that reads as corrupt (`SqliteCorruptionError`: no key recovers the image) is
 * purged and reopened for a fresh sync, never left failing every later op. Drives the real
 * `PxeService` and `ChainRuntimeRegistry` over a fake disk of per-(profile, chain) store images.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("./known-artifacts", () => ({
	loadProductionKnownArtifacts: async () => ({ artifacts: new Map(), instances: new Map() }),
}))
vi.mock("./note-schemas", () => ({
	loadProductionNoteSchemas: async () => new Map<string, unknown>(),
}))
const removeChainStoreDir = vi.fn(async (_coords: { profileId: string; chainId: number }) => {})
vi.mock("./opfs-store", async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	removeChainStoreDir: (coords: { profileId: string; chainId: number }) => removeChainStoreDir(coords),
}))

import { type AztecSQLiteOPFSStore, SqliteCorruptionError } from "@aztec-labs/kv-store/sqlite-opfs"
import type { PXE } from "@aztec-labs/pxe/client/bundle"
import type { AztecAddress } from "@aztec-labs/stdlib/aztec-address"
import type { AztecNode } from "@aztec-labs/stdlib/interfaces/client"
import { type ILogger, LogLevel } from "@nulo/wallet-core/logger"
import { ChainRuntime, type NetworkInfo, type PxeFactory } from "./chain-runtime"
import { chainDataDir } from "./chain-coordinates"
import { PxeService, type IProfileReader } from "./service"

const network: NetworkInfo = { profileId: "p1", chainId: 31337, rpcUrl: "http://localhost:8080" }
const siblings: NetworkInfo[] = [
	{ ...network, chainId: 1 },
	{ ...network, profileId: "p2" },
]
const address = "0x000000000000000000000000000000000000000000000000000000000000ab12" as unknown as AztecAddress
const PURGED = "PXE chain store read as corrupt: purged for a fresh sync"

const corruption = () => new SqliteCorruptionError("SQLITE_CORRUPT: sqlite3 result code 11: database disk image is malformed")
/** How the PXE hands a store's error on: bare, from its init's concurrent writes, or as a
 *  simulation's root cause. */
const ERRORS = {
	corrupt: corruption,
	aggregate: () => new AggregateError([corruption(), corruption()], "2 of 3 concurrent operations failed"),
	wrapped: () => new Error("Simulation error", { cause: new Error("oracle failed", { cause: corruption() }) }),
	other: () => new Error("node unreachable"),
}

type Fault = { at: "open" | "read"; error: keyof typeof ERRORS }
type Image = { fault?: Fault; reads: number; gate?: Promise<void> }

/** One image per store dir, failing as its fault says. Unlinking a dir drops its image; the next
 *  open creates one with the next of `fresh`'s faults, or a sound one. */
function fakeDisk(...fresh: Fault[]) {
	const images = new Map<string, Image>()
	const events: string[] = []
	removeChainStoreDir.mockImplementation(async (coords) => {
		events.push(`unlink ${chainDataDir(coords)}`)
		images.delete(chainDataDir(coords))
	})
	const imageOf = (n: NetworkInfo): Image => {
		const image = images.get(chainDataDir(n)) ?? { fault: fresh.shift(), reads: 0 }
		images.set(chainDataDir(n), image)
		return image
	}
	const fail = (image: Image, at: Fault["at"]) => {
		if (image.fault?.at === at) throw ERRORS[image.fault.error]()
	}
	const factory: PxeFactory = {
		createChainRuntime: async (n) => {
			const dir = chainDataDir(n)
			const image = imageOf(n)
			events.push(`open ${dir}`)
			fail(image, "open")
			const read = async () => {
				image.reads++
				await image.gate
				fail(image, "read")
			}
			const pxe = { getContractInstance: read, registerTaggingSecretSource: read } as unknown as PXE
			const store = { close: async () => void events.push(`close ${dir}`) } as unknown as AztecSQLiteOPFSStore
			return new ChainRuntime(n.chainId, {} as AztecNode, pxe, n.rpcUrl, store)
		},
	}
	return { factory, events, imageOf }
}

function loggedService(factory: PxeFactory) {
	const calls: unknown[][] = []
	const logger: ILogger = { log: (...args: unknown[]) => void calls.push(args) }
	const profiles: IProfileReader = { connect: async () => {}, getProfiles: async () => [] }
	const service = new PxeService(profiles, logger, factory)
	;(service as unknown as { initialized: boolean }).initialized = true
	const at = (level: LogLevel) => calls.filter((c) => c[1] === level)
	return { service, warnings: () => at(LogLevel.Warn).map((c) => c.slice(2)), errors: () => at(LogLevel.Error) }
}

const OPS = {
	read: (service: PxeService) => service.getContractInstance(network, address, { pxeOnly: true }),
	write: (service: PxeService) => service.registerSender(network, address),
}
const dir = chainDataDir(network)

beforeEach(() => {
	removeChainStoreDir.mockReset()
	vi.stubGlobal("chrome", {
		runtime: { onMessage: { addListener: () => {}, removeListener: () => {} }, sendMessage: () => Promise.resolve() },
	})
})
afterEach(() => vi.unstubAllGlobals())

describe("a PXE chain store that reads as corrupt is purged and reopened", () => {
	test.each([
		{ at: "open", error: "corrupt", op: "read" },
		{ at: "open", error: "corrupt", op: "write" },
		{ at: "read", error: "corrupt", op: "read" },
		{ at: "read", error: "corrupt", op: "write" },
		{ at: "open", error: "aggregate", op: "read" },
		{ at: "read", error: "wrapped", op: "write" },
	] as const)("$error at $at, met by a $op: one store purged, reopened, the op served", async ({ at, error, op }) => {
		const disk = fakeDisk()
		const { service, warnings, errors } = loggedService(disk.factory)
		for (const sibling of siblings) await service.getContractInstance(sibling, address, { pxeOnly: true })
		disk.imageOf(network).fault = { at, error }
		disk.events.length = 0

		await OPS[op](service)

		const closed = at === "read" ? [`close ${dir}`] : []
		expect(disk.events).toEqual([`open ${dir}`, ...closed, `unlink ${dir}`, `open ${dir}`])
		expect(warnings()).toEqual([[PURGED, { chainId: network.chainId }]])
		expect(errors()).toEqual([])
		// The sibling stores and the fresh one stay bound: serving them again opens and closes nothing.
		const settled = [...disk.events]
		for (const sibling of siblings) await service.getContractInstance(sibling, address, { pxeOnly: true })
		await OPS[op](service)
		expect(disk.events).toEqual(settled)
	})

	test("two reads that meet the same corrupt store purge it once; the second is served by the fresh one", async () => {
		const disk = fakeDisk()
		const { service, warnings } = loggedService(disk.factory)
		await OPS.read(service)
		const image = disk.imageOf(network)
		let release: () => void = () => {}
		image.gate = new Promise((resolve) => {
			release = resolve
		})
		image.fault = { at: "read", error: "corrupt" }
		disk.events.length = 0

		const reads = [OPS.read(service), OPS.read(service)]
		await vi.waitFor(() => expect(image.reads).toBe(3))
		release()

		await expect(Promise.all(reads)).resolves.toHaveLength(2)
		expect(disk.events).toEqual([`close ${dir}`, `unlink ${dir}`, `open ${dir}`])
		expect(warnings()).toHaveLength(1)
	})

	test.each([
		{ first: "open", second: "open", op: "read" },
		{ first: "open", second: "read", op: "read" },
		{ first: "read", second: "open", op: "read" },
		{ first: "read", second: "read", op: "write" },
	] as const)(
		"a store corrupt at $first, then at $second after its purge, fails the $op with one purge",
		async ({ first, second, op }) => {
			const disk = fakeDisk({ at: first, error: "corrupt" }, { at: second, error: "corrupt" })
			const { service, warnings, errors } = loggedService(disk.factory)

			await expect(OPS[op](service)).rejects.toBeInstanceOf(SqliteCorruptionError)

			expect(disk.events.filter((e) => e.startsWith("unlink"))).toEqual([`unlink ${dir}`])
			expect(warnings()).toHaveLength(1)
			expect(errors()).toHaveLength(1)
		},
	)

	test("any other store failure still rethrows and purges nothing", async () => {
		const disk = fakeDisk({ at: "read", error: "other" })
		const { service, warnings, errors } = loggedService(disk.factory)

		await expect(OPS.read(service)).rejects.toThrow("node unreachable")
		await expect(OPS.write(service)).rejects.toThrow("node unreachable")

		expect(disk.events).toEqual([`open ${dir}`])
		expect(removeChainStoreDir).not.toHaveBeenCalled()
		expect(warnings()).toEqual([])
		expect(errors()).toHaveLength(2)
	})
})
