/**
 * The deferred orphan-store sweep's recheck-at-commit obligation: a same-id
 * re-import provisioning after the sweep's snapshots must keep its store.
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

function fireSuccess(): unknown {
	const req: Record<string, unknown> = {}
	queueMicrotask(() => (req.onsuccess as () => void)?.())
	return req
}

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
		vi.stubGlobal("indexedDB", { databases: async () => [] })
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

	test("removal waits for the profile's write barrier — a held read (store-open in flight) delays it", async () => {
		vi.stubGlobal("indexedDB", { databases: async () => [] })
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
		vi.stubGlobal("indexedDB", { databases: async () => [] })
		const profiles: IProfileReader = {
			connect: async () => {},
			getProfiles: async () => [],
		}
		const service = makeSweepService(profiles)

		await sweep(service)

		expect(removeProfileStoreDirs).toHaveBeenCalledWith("p1")
	})

	test("keyval-store survives the sweep that deletes the last legacy DB", async () => {
		const deleted: string[] = []
		vi.stubGlobal("indexedDB", {
			// A live listing: a deleted DB drops out, as it does in the browser.
			databases: async () => [{ name: "pxe/p1/1" }, { name: "keyval-store" }].filter((x) => !deleted.includes(x.name)),
			deleteDatabase: (name: string) => {
				deleted.push(name)
				return fireSuccess()
			},
		})
		const profiles: IProfileReader = {
			connect: async () => {},
			// p1 still exists so the OPFS arm skips; this test is the IDB arm's.
			getProfiles: async () => [{ id: "p1" }],
		}
		const service = makeSweepService(profiles)

		await sweep(service)

		expect(deleted).toEqual(["pxe/p1/1"])
	})
})
