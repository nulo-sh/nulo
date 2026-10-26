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

type Image = { state: "sound" | "corrupt" | "broken"; reads: number; gate?: Promise<void> }

/** One image per store dir; a store opened over a corrupt image fails where `breaks` says. Unlinking
 *  a dir drops its image, so the next open creates a sound one, unless `sticky` keeps it corrupt. */
function fakeDisk(breaks: "open" | "read", sticky = false) {
	const images = new Map<string, Image>()
	const events: string[] = []
	removeChainStoreDir.mockImplementation(async (coords) => {
		events.push(`unlink ${chainDataDir(coords)}`)
		if (!sticky) images.delete(chainDataDir(coords))
	})
	const factory: PxeFactory = {
		createChainRuntime: async (n) => {
			const dir = chainDataDir(n)
			const image = images.get(dir) ?? { state: "sound", reads: 0 }
			images.set(dir, image)
			events.push(`open ${dir}`)
			if (image.state === "corrupt" && breaks === "open") throw corruption()
			const read = async () => {
				image.reads++
				await image.gate
				if (image.state === "corrupt") throw corruption()
				if (image.state === "broken") throw new Error("node unreachable")
			}
			const pxe = {
				getContractInstance: async () => read(),
				registerTaggingSecretSource: async () => read(),
			} as unknown as PXE
			const store = { close: async () => void events.push(`close ${dir}`) } as unknown as AztecSQLiteOPFSStore
			return new ChainRuntime(n.chainId, {} as AztecNode, pxe, n.rpcUrl, store)
		},
	}
	const imageOf = (n: NetworkInfo): Image => {
		const image = images.get(chainDataDir(n)) ?? { state: "sound", reads: 0 }
		images.set(chainDataDir(n), image)
		return image
	}
	return { factory, events, imageOf }
}

function corruption(): SqliteCorruptionError {
	return new SqliteCorruptionError("SQLITE_CORRUPT: sqlite3 result code 11: database disk image is malformed")
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

beforeEach(() => {
	removeChainStoreDir.mockReset()
	vi.stubGlobal("chrome", {
		runtime: { onMessage: { addListener: () => {}, removeListener: () => {} }, sendMessage: () => Promise.resolve() },
	})
})
afterEach(() => vi.unstubAllGlobals())

describe("a PXE chain store that reads as corrupt is purged and reopened", () => {
	test.each([
		{ breaks: "open", op: "read" },
		{ breaks: "open", op: "write" },
		{ breaks: "read", op: "read" },
		{ breaks: "read", op: "write" },
	] as const)("corrupt at $breaks, met by a $op: one store purged, reopened, the op served", async ({ breaks, op }) => {
		const disk = fakeDisk(breaks)
		const { service, warnings, errors } = loggedService(disk.factory)
		for (const sibling of siblings) await service.getContractInstance(sibling, address, { pxeOnly: true })
		disk.imageOf(network).state = "corrupt"
		disk.events.length = 0

		await OPS[op](service)

		const dir = chainDataDir(network)
		const closed = breaks === "read" ? [`close ${dir}`] : []
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
		const disk = fakeDisk("read")
		const { service, warnings } = loggedService(disk.factory)
		await OPS.read(service)
		const image = disk.imageOf(network)
		let release: () => void = () => {}
		image.gate = new Promise((resolve) => {
			release = resolve
		})
		image.state = "corrupt"
		disk.events.length = 0

		const reads = [OPS.read(service), OPS.read(service)]
		await vi.waitFor(() => expect(image.reads).toBe(3))
		release()

		await expect(Promise.all(reads)).resolves.toHaveLength(2)
		const dir = chainDataDir(network)
		expect(disk.events).toEqual([`close ${dir}`, `unlink ${dir}`, `open ${dir}`])
		expect(warnings()).toHaveLength(1)
	})

	test("a store still corrupt after its purge fails the op instead of purging again", async () => {
		const disk = fakeDisk("open", true)
		const { service, warnings, errors } = loggedService(disk.factory)
		disk.imageOf(network).state = "corrupt"

		await expect(OPS.read(service)).rejects.toBeInstanceOf(SqliteCorruptionError)

		const dir = chainDataDir(network)
		expect(disk.events).toEqual([`open ${dir}`, `unlink ${dir}`, `open ${dir}`])
		expect(warnings()).toHaveLength(1)
		expect(errors()).toHaveLength(1)
	})

	test("any other store failure still rethrows and purges nothing", async () => {
		const disk = fakeDisk("read")
		const { service, warnings, errors } = loggedService(disk.factory)
		disk.imageOf(network).state = "broken"

		await expect(OPS.read(service)).rejects.toThrow("node unreachable")
		await expect(OPS.write(service)).rejects.toThrow("node unreachable")

		expect(disk.events).toEqual([`open ${chainDataDir(network)}`])
		expect(removeChainStoreDir).not.toHaveBeenCalled()
		expect(warnings()).toEqual([])
		expect(errors()).toHaveLength(2)
	})
})
