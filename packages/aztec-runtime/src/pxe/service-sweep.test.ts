/**
 * The deferred orphan-store sweep: a same-id re-import provisioning after the
 * sweep's snapshots must keep its store.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("./known-artifacts", () => ({
	loadProductionKnownArtifacts: async () => ({ artifacts: new Map(), instances: new Map() }),
}))
vi.mock("./note-schemas", () => ({
	loadProductionNoteSchemas: async () => new Map<string, unknown>(),
}))
const removeProfileStoreDirs = vi.fn(async (_profileId: string) => {})
vi.mock("./opfs-store", async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	listChainStoreDirs: async () => [{ profileId: "p1", chainId: 1 }],
	removeProfileStoreDirs: (profileId: string) => removeProfileStoreDirs(profileId),
}))

import type { ILogger } from "@nulo/wallet-core/logger"
import { PxeService, type IProfileReader } from "./service"

const noopLogger: ILogger = { log: () => {} }
const KEY_B64 = btoa(String.fromCharCode(...new Uint8Array(32)))

function makeSweepService(profiles: IProfileReader): PxeService {
	const service = new PxeService(profiles, noopLogger, {
		createChainRuntime: async () => {
			throw new Error("unused")
		},
	})
	;(service as unknown as { initialized: boolean }).initialized = true
	return service
}

const sweep = (service: PxeService) => (service as unknown as { sweepOrphanStores: () => Promise<void> }).sweepOrphanStores()

describe("PxeService orphan-store sweep — recheck at commit", () => {
	beforeEach(() => {
		removeProfileStoreDirs.mockClear()
		vi.stubGlobal("chrome", { runtime: { onMessage: { addListener: () => {} } } })
	})
	afterEach(() => vi.unstubAllGlobals())

	test("a profile provisioned after the profiles snapshot is NOT removed as an orphan", async () => {
		let service: PxeService = null!
		const profiles: IProfileReader = {
			connect: async () => {},
			getProfiles: async () => {
				// The re-import completes while the sweep is between its snapshot
				// and the removal: the successor provisions (lifecycle goes live).
				await service.provisionChainStoreKey("p1", KEY_B64, "gen-fresh")
				return []
			},
		}
		service = makeSweepService(profiles)

		await sweep(service)

		expect(removeProfileStoreDirs).not.toHaveBeenCalled()
	})

	test("a profile whose only incarnations this document erased is not swept", async () => {
		const service = makeSweepService({ connect: async () => {}, getProfiles: async () => [] })
		await service.provisionChainStoreKey("p1", KEY_B64, "gen-1")
		await service.clearProfileState("p1", "gen-1")
		removeProfileStoreDirs.mockClear()

		await sweep(service)

		expect(removeProfileStoreDirs).not.toHaveBeenCalled()
	})

	test("removal waits for the profile's write barrier — a held read (store-open in flight) delays it", async () => {
		const profiles: IProfileReader = {
			connect: async () => {},
			getProfiles: async () => [],
		}
		const service = makeSweepService(profiles)
		// Simulate a successor store-open in flight: registry.ensure runs under
		// barrier.read, so a held read must block the sweep's recursive remove.
		const barrier = (
			service as unknown as { getProfileBarrier: (id: string) => { read: <T>(fn: () => Promise<T>) => Promise<T> } }
		).getProfileBarrier("p1")
		let releaseRead: () => void = () => {}
		const readHeld = barrier.read(
			() =>
				new Promise<void>((resolve) => {
					releaseRead = resolve
				}),
		)

		const run = sweep(service)
		await new Promise((r) => setTimeout(r, 10))
		expect(removeProfileStoreDirs).not.toHaveBeenCalled()

		releaseRead()
		await readHeld
		await run
		expect(removeProfileStoreDirs).toHaveBeenCalledWith("p1")
	})

	test("a genuinely orphaned profile dir (no lifecycle entry, no row) IS removed", async () => {
		const profiles: IProfileReader = {
			connect: async () => {},
			getProfiles: async () => [],
		}
		const service = makeSweepService(profiles)

		await sweep(service)

		expect(removeProfileStoreDirs).toHaveBeenCalledWith("p1")
	})
})
