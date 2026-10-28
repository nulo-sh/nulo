/**
 * FPC write fences: `addFpc` and the `getFpcs` protocol-discovery writes
 * capture the deletion fence and a network liveness mark at their entry and
 * assert both flush against the row write — a deletion, network delete or
 * reset completing during the PXE work must never land a row. The discovery,
 * which no user action asks for, is also bound to its session: a lock refuses it.
 * An address edit writes over the row as it stands once its PXE checks end.
 *
 * A purge or sweep is awaited while a registration is parked, so one that
 * waited on the registration times the case out instead of racing a timer.
 */
import { describe, expect, test, vi } from "vitest"
import { FakeBrowserApi } from "@nulo/wallet-core/testing"
import { deferred } from "@nulo/wallet-core/utils"
import { PxeStoreKeyMissingError } from "@nulo/extension-messaging/errors"
import { ServiceCollection } from "@/wallet/base"
import { ConfigStore } from "@/wallet/config"
import { LoggerStore } from "@/wallet/logger"
import { type ExecutionFence, ProfileDeletionState } from "@/wallet/services/profile/profile-deletion-state"
import { PROFILE_SERVICE_NAME } from "@/wallet/services/profile/spec"
import { NETWORK_SERVICE_NAME } from "@/wallet/services/network/spec"
import { svc } from "../composition-harness"
import { recordWrites } from "../storage-write-log"
import { rowKeysForEveryProfile } from "@/wallet/storage/sealed-entity-storage.testing"

vi.mock("@/wallet/services/execution/contract-resolver", () => ({
	ensureRegistered: async () => {},
}))
// The discovery branch derives protocol instances with real Poseidon hashing,
// which cannot run in this vitest env (bb.js std::bad_cast — the composition
// boundary). The pins exercise fence ORDERING; protocol-fpcs.test.ts pins the derivation.
vi.mock("@aztec-labs/stdlib/contract", async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	getContractInstanceFromInstantiationParams: async (artifact: { functions: Array<{ name: string }> }) => ({
		address: {
			toString: () => (artifact.functions.some((f) => f.name === "sponsor_unconditionally") ? "0xsponsored" : "0xprivate"),
		},
	}),
}))

import { FpcService, FpcType } from "./service"
import { FPC_STORAGE_ROOT } from "./spec"

/** One key for every profile, as the profile fakes hold it. */
const ROW_KEY_FAKE = await rowKeysForEveryProfile()

const SPONSOR_ARTIFACT = { functions: [{ name: "sponsor_unconditionally", parameters: [], returnTypes: [] }] }
const NETWORK = {
	id: "n1",
	profileId: "p1",
	chainId: 1,
	l1ChainId: 1,
	name: "N",
	primaryEndpointId: "e1",
	endpoints: [{ id: "e1", rpcUrl: "https://n.example/" }],
}

/** The liveness contract `NetworkService` offers: a mark, and reservations counted since it. */
function makeReservations() {
	const state = { count: 0, open: false }
	return {
		reserve: () => {
			state.count++
			state.open = true
		},
		release: () => {
			state.open = false
		},
		isNetworkLive: async (_id: string, since?: number) => !state.open && (since === undefined || since === state.count),
		captureLiveness: async () => (state.open ? undefined : state.count),
	}
}

async function makeHarness() {
	const api = new FakeBrowserApi()
	api.reset()
	const deletionState = new ProfileDeletionState()
	const reservations = makeReservations()
	// The row keys outlive a lock, as `ProfileService.rowKeys` keeps them: only the fence sees it.
	const session: { serial: number | undefined } = { serial: 1 }
	const services = new ServiceCollection()
	services.add(
		svc(PROFILE_SERVICE_NAME, {
			...ROW_KEY_FAKE,
			getDeletionState: () => deletionState,
			getActiveProfile: async () => ({ id: "p1" }),
			captureExecutionFence: async () => ({ profileId: "p1", epoch: deletionState.capture("p1"), session: session.serial }),
			isFenceLive: (fence: ExecutionFence) =>
				session.serial !== undefined &&
				fence.session === session.serial &&
				fence.profileId === "p1" &&
				deletionState.isCurrent(fence.profileId, fence.epoch),
		}),
	)
	services.add(
		svc(NETWORK_SERVICE_NAME, {
			registerChainPurgeSubscriber: () => {},
			getNetwork: async () => NETWORK,
			getNetworks: async () => [NETWORK],
			isNetworkLive: reservations.isNetworkLive,
			captureLiveness: reservations.captureLiveness,
		}),
	)
	const service = new FpcService(new LoggerStore(new ConfigStore()), api)
	services.add(service)
	await services.start()
	// Pre-seed the protocol-address cache so no real Poseidon derivation runs.
	;(service as unknown as { protocolAddresses: Map<number, unknown> }).protocolAddresses.set(1, {
		sponsored: "0xsponsored",
		private: "0xprivate",
	})
	const lock = () => {
		session.serial = undefined
	}
	return { api, deletionState, reservations, service, lock }
}

type Harness = Awaited<ReturnType<typeof makeHarness>>

function setPxe(h: Harness, pxe: Record<string, unknown>) {
	;(h.service as unknown as { pxeService: unknown }).pxeService = { getPXE: () => pxe }
}

type Registration = { instance: { address: { toString(): string } } }

/** The messages the service logs, per level. */
function spyLogs(h: Harness) {
	const logged = { debug: [] as string[], warn: [] as string[], error: [] as string[] }
	const service = h.service as unknown as Record<"logDebug" | "logWarn" | "logError", (message: string) => void>
	for (const [level, method] of [
		["debug", "logDebug"],
		["warn", "logWarn"],
		["error", "logError"],
	] as const) {
		vi.spyOn(service, method).mockImplementation((message) => void logged[level].push(message))
	}
	return logged
}

const macrotask = () => new Promise((resolve) => setTimeout(resolve, 0))

async function fpcRowCount(api: FakeBrowserApi): Promise<number> {
	const raw = await api.storage.local.get(null)
	return Object.keys(raw).filter((k) => k.startsWith("nulo:core:fpcs@")).length
}

describe("FPC creation fences", () => {
	test("addFpc: a deletion completing DURING the artifact fetch rejects the write (entry-capture pin)", async () => {
		const h = await makeHarness()
		const gate = deferred<unknown>()
		;(h.service as unknown as { pxeService: unknown }).pxeService = {
			getPXE: () => ({
				getContractInstance: async () => ({ currentContractClassId: "c1" }),
				getContractArtifact: () => gate.promise,
			}),
		}

		const writes = recordWrites(h.api.storage.local, "nulo:core:fpcs@")
		const run = h.service.addFpc("n1", FpcType.DefaultSponsoredFpc, `0x${"11".repeat(32)}`, "New")
		await new Promise((r) => setTimeout(r, 0))
		h.deletionState.beginDeletion("p1")
		h.deletionState.release("p1")
		gate.resolve(SPONSOR_ARTIFACT)

		await expect(run).rejects.toThrow(/^profile p1 is being deleted — write rejected \(epoch 0 → 1\)$/)
		writes.restore()
		expect(writes.log).toEqual([])
		expect(await fpcRowCount(h.api)).toBe(0)
	})

	test("addFpc: a lock completing DURING the artifact fetch still stores the row the user asked for", async () => {
		const h = await makeHarness()
		const gate = deferred<unknown>()
		setPxe(h, {
			getContractInstance: async () => ({ currentContractClassId: "c1" }),
			getContractArtifact: () => gate.promise,
		})
		const emitted: unknown[] = []
		h.service.onFpcAdded.add((f) => emitted.push(f))

		const run = h.service.addFpc("n1", FpcType.DefaultSponsoredFpc, `0x${"11".repeat(32)}`, "New")
		await macrotask()
		h.lock()
		gate.resolve(SPONSOR_ARTIFACT)

		await expect(run).resolves.toMatchObject({ name: "New", profileId: "p1" })
		expect(emitted).toHaveLength(1)
		expect(await fpcRowCount(h.api)).toBe(1)
	})

	test("getFpcs discovery: stores one row per protocol FPC and returns both as protocol rows", async () => {
		const h = await makeHarness()
		const registered: string[] = []
		setPxe(h, { registerContract: async ({ instance }: Registration) => void registered.push(instance.address.toString()) })

		const fpcs = await h.service.getFpcs(1)
		expect(registered).toEqual(["0xsponsored", "0xprivate"])
		expect(fpcs.map((f) => [f.type, f.address, f.isProtocol])).toEqual(
			expect.arrayContaining([
				[FpcType.DefaultSponsoredFpc, "0xsponsored", true],
				[FpcType.PrivateFpc, "0xprivate", true],
			]),
		)
		expect(await fpcRowCount(h.api)).toBe(2)
	})

	test("getFpcs discovery: a profile purge settles while the registration is parked, and the discovery then writes NO row", async () => {
		// Discovery is best-effort per item (throws are caught + logged), so the
		// observable contract is: zero rows land for the deleted profile.
		const h = await makeHarness()
		const reached = deferred<void>()
		const gate = deferred<void>()
		setPxe(h, {
			registerContract: () => {
				reached.resolve()
				return gate.promise
			},
		})
		const writes = recordWrites(h.api.storage.local, "nulo:core:fpcs@")

		const run = h.service.getFpcs(1)
		try {
			await reached.promise
			h.deletionState.beginDeletion("p1")
			await h.service.purgeForProfile("p1")
			h.deletionState.release("p1")
		} finally {
			gate.resolve()
		}

		await run
		writes.restore()
		expect(writes.log).toEqual([])
		expect(await fpcRowCount(h.api)).toBe(0)
	})

	test("getFpcs discovery: two concurrent discoveries store one row per protocol FPC", async () => {
		const h = await makeHarness()
		const gate = deferred<void>()
		setPxe(h, { registerContract: () => gate.promise })

		const runs = Promise.all([h.service.getFpcs(1), h.service.getFpcs(1)])
		await macrotask()
		gate.resolve()

		for (const fpcs of await runs) {
			expect(fpcs.map((f) => f.type).sort()).toEqual([FpcType.DefaultSponsoredFpc, FpcType.PrivateFpc])
		}
		expect(await fpcRowCount(h.api)).toBe(2)
	})

	test("getFpcs discovery: a network reset that completes during a registration leaves NO row", async () => {
		const h = await makeHarness()
		const reached = deferred<void>()
		const gate = deferred<void>()
		setPxe(h, {
			registerContract: async ({ instance }: Registration) => {
				if (instance.address.toString() !== "0xprivate") return
				reached.resolve()
				await gate.promise
			},
		})

		const run = h.service.getFpcs(1)
		try {
			await reached.promise
			expect(await fpcRowCount(h.api)).toBe(1)
			h.reservations.reserve()
			await h.service.clearChainState("p1", 1)
			h.reservations.release()
		} finally {
			gate.resolve()
		}

		const fpcs = await run
		expect(fpcs).toEqual([])
		expect(await fpcRowCount(h.api)).toBe(0)
	})

	test("getFpcs discovery: a network reset during one registration stops the next one", async () => {
		const h = await makeHarness()
		const reached = deferred<void>()
		const gate = deferred<void>()
		const registered: string[] = []
		setPxe(h, {
			registerContract: async ({ instance }: Registration) => {
				registered.push(instance.address.toString())
				reached.resolve()
				await gate.promise
			},
		})

		const run = h.service.getFpcs(1)
		try {
			await reached.promise
			h.reservations.reserve()
			await h.service.clearChainState("p1", 1)
			h.reservations.release()
		} finally {
			gate.resolve()
		}

		expect(await run).toEqual([])
		expect(registered).toEqual(["0xsponsored"])
		expect(await fpcRowCount(h.api)).toBe(0)
	})

	test("getFpcs discovery: a lock landing during a registration stores NO row for the locked profile", async () => {
		const h = await makeHarness()
		const reached = deferred<void>()
		const gate = deferred<void>()
		const registered: string[] = []
		setPxe(h, {
			registerContract: async ({ instance }: Registration) => {
				registered.push(instance.address.toString())
				reached.resolve()
				await gate.promise
			},
		})
		const writes = recordWrites(h.api.storage.local, "nulo:core:fpcs@")

		const run = h.service.getFpcs(1)
		await reached.promise
		h.lock()
		gate.resolve()

		await run
		writes.restore()
		expect(writes.log).toEqual([])
		expect(registered).toEqual(["0xsponsored"])
		expect(await fpcRowCount(h.api)).toBe(0)
	})

	test("getFpcs discovery: a lock landing while the row is sealed stores NO row for the locked profile", async () => {
		const h = await makeHarness()
		setPxe(h, { registerContract: async () => {} })
		// The liveness read between the row's seal and its commit is the last await before the write.
		const network = (h.service as unknown as { networkService: { isNetworkLive: (id: string, since?: number) => Promise<boolean> } })
			.networkService
		const isNetworkLive = network.isNetworkLive
		let reads = 0
		network.isNetworkLive = async (id, since) => {
			if (++reads === 2) h.lock()
			return isNetworkLive(id, since)
		}
		const writes = recordWrites(h.api.storage.local, "nulo:core:fpcs@")

		await h.service.getFpcs(1)
		writes.restore()
		expect(writes.log).toEqual([])
		expect(await fpcRowCount(h.api)).toBe(0)
		expect(reads).toBe(2)
	})

	test("getFpcs discovery: a registration the lock refused ends the discovery at debug, with no warn or error line", async () => {
		const h = await makeHarness()
		const registered: string[] = []
		setPxe(h, {
			registerContract: async ({ instance }: Registration) => {
				registered.push(instance.address.toString())
				h.lock()
				throw new PxeStoreKeyMissingError("PXE_STORE_KEY_MISSING: no store key provisioned for profile p1")
			},
		})
		const logged = spyLogs(h)

		await h.service.getFpcs(1)
		expect(registered).toEqual(["0xsponsored"])
		expect(logged.warn).toEqual([])
		expect(logged.error).toEqual([])
		expect(logged.debug).toContain("Protocol FPC discovery stopped: its session ended")
		expect(await fpcRowCount(h.api)).toBe(0)
	})

	test("getFpcs discovery: a network reset during a registration ends the discovery at debug, with no warn or error line", async () => {
		const h = await makeHarness()
		const reached = deferred<void>()
		const gate = deferred<void>()
		setPxe(h, {
			registerContract: async () => {
				reached.resolve()
				await gate.promise
			},
		})
		const logged = spyLogs(h)

		const run = h.service.getFpcs(1)
		try {
			await reached.promise
			h.reservations.reserve()
			await h.service.clearChainState("p1", 1)
			h.reservations.release()
		} finally {
			gate.resolve()
		}

		await run
		expect(logged.warn).toEqual([])
		expect(logged.error).toEqual([])
		expect(logged.debug).toContain("Protocol FPC discovery stopped: its network was reset or removed")
		expect(await fpcRowCount(h.api)).toBe(0)
	})

	test("getFpcs discovery: a registration that fails while its session is live is still logged at error", async () => {
		const h = await makeHarness()
		setPxe(h, {
			registerContract: async () => {
				throw new Error("node unreachable")
			},
		})
		const logged = spyLogs(h)

		await h.service.getFpcs(1)
		expect(logged.error).toEqual(["Failed to discover FPC 0xsponsored", "Failed to discover FPC 0xprivate"])
		expect(logged.debug).not.toContain("Protocol FPC discovery stopped: its session ended")
		expect(logged.debug).not.toContain("Protocol FPC discovery stopped: its network was reset or removed")
		expect(await fpcRowCount(h.api)).toBe(0)
	})

	test("getFpcs discovery: a liveness read that fails after a registration failure leaves that failure at error", async () => {
		const h = await makeHarness()
		setPxe(h, {
			registerContract: async () => {
				throw new Error("node unreachable")
			},
		})
		// Each item reads liveness before its registration, then again in its failure path.
		const network = (h.service as unknown as { networkService: { isNetworkLive: (id: string, since?: number) => Promise<boolean> } })
			.networkService
		const isNetworkLive = network.isNetworkLive
		let reads = 0
		network.isNetworkLive = async (id, since) => {
			if (++reads % 2 === 0) throw new Error("storage unreadable")
			return isNetworkLive(id, since)
		}
		const logged = spyLogs(h)

		await h.service.getFpcs(1)
		expect(logged.error).toEqual(["Failed to discover FPC 0xsponsored", "Failed to discover FPC 0xprivate"])
		expect(logged.debug).not.toContain("Protocol FPC discovery stopped: its network was reset or removed")
	})

	test("getFpcs discovery: admitted while its network is reserved, it registers nothing and stores NO row", async () => {
		const h = await makeHarness()
		const registered: string[] = []
		setPxe(h, { registerContract: async ({ instance }: Registration) => void registered.push(instance.address.toString()) })

		h.reservations.reserve()
		expect(await h.service.getFpcs(1)).toEqual([])
		expect(registered).toEqual([])
		expect(await fpcRowCount(h.api)).toBe(0)

		h.reservations.release()
		expect(await h.service.getFpcs(1)).toHaveLength(2)
		expect(registered).toEqual(["0xsponsored", "0xprivate"])
	})

	test("getFpcs discovery: a deletion landing DURING a protocol row write compensates it and ends the discovery at debug", async () => {
		const h = await makeHarness()
		;(h.service as unknown as { pxeService: unknown }).pxeService = {
			getPXE: () => ({ registerContract: async () => {} }),
		}
		const logged = spyLogs(h)
		let fired = false
		const writes = recordWrites(h.api.storage.local, "nulo:core:fpcs@", () => {
			if (fired) return
			fired = true
			h.deletionState.beginDeletion("p1")
		})

		await h.service.getFpcs(1)
		writes.restore()
		expect(writes.log).toHaveLength(2)
		expect(writes.log[1]).toBe(writes.log[0]?.replace(/^set:/, "remove:"))
		expect(fired).toBe(true)
		expect(logged.error).toEqual([])
		expect(logged.debug).toContain("Protocol FPC discovery stopped: its session ended")
		expect(await fpcRowCount(h.api)).toBe(0)
	})

	test("addFpc: admitted while its network is reserved, it rejects before any PXE call and stores NO row", async () => {
		const h = await makeHarness()
		let pxeCalls = 0
		setPxe(h, {
			getContractInstance: async () => {
				pxeCalls++
				return { currentContractClassId: "c1" }
			},
			// The reservation closing during the fetch is what a mark taken under it would miss.
			getContractArtifact: async () => {
				pxeCalls++
				h.reservations.release()
				return SPONSOR_ARTIFACT
			},
		})

		h.reservations.reserve()
		await expect(h.service.addFpc("n1", FpcType.DefaultSponsoredFpc, `0x${"11".repeat(32)}`, "New")).rejects.toThrow(
			/^network deleted$/,
		)
		expect(pxeCalls).toBe(0)
		expect(await fpcRowCount(h.api)).toBe(0)
	})

	test("addFpc: a deletion landing DURING the row write is compensated away before any emit", async () => {
		const h = await makeHarness()
		;(h.service as unknown as { pxeService: unknown }).pxeService = {
			getPXE: () => ({
				getContractInstance: async () => ({ currentContractClassId: "c1" }),
				getContractArtifact: async () => SPONSOR_ARTIFACT,
			}),
		}
		const emitted: unknown[] = []
		h.service.onFpcAdded.add((f) => emitted.push(f))
		const writes = recordWrites(h.api.storage.local, "nulo:core:fpcs@", () => h.deletionState.beginDeletion("p1"))

		await expect(h.service.addFpc("n1", FpcType.DefaultSponsoredFpc, `0x${"11".repeat(32)}`, "New")).rejects.toThrow(
			/^profile p1 deleted$/,
		)
		writes.restore()
		expect(writes.log).toHaveLength(2)
		expect(writes.log[1]).toBe(writes.log[0]?.replace(/^set:/, "remove:"))
		expect(emitted).toHaveLength(0)
	})
})

describe("FpcService.getFpcImpl — only the protocol PrivateFPC can pay", () => {
	const row = (id: string, type: FpcType, address: string) => ({
		id,
		profileId: "p1",
		chainId: 1,
		type,
		address,
		name: "F",
		isProtocol: false,
	})

	/** A row already on disk (the backup slice that used to carry these is gone). */
	async function plant(h: Awaited<ReturnType<typeof makeHarness>>, fpc: ReturnType<typeof row>) {
		const { isProtocol: _isProtocol, ...stored } = fpc
		await h.api.storage.local.set({ [`${FPC_STORAGE_ROOT}@${stored.id}`]: JSON.stringify(stored) })
	}

	test("genuine PrivateFPC resolves on a COLD protocol-address cache (no prior getFpcs)", async () => {
		const h = await makeHarness()
		await plant(h, row("f-ok", FpcType.PrivateFpc, "0xprivate"))
		const fpc = await h.service.getFpcImpl("f-ok")
		expect(fpc.infoData.isProtocol).toBe(true)
	})

	test("the genuine sponsor resolves as protocol on a COLD cache, so a send through it names no spender", async () => {
		const h = await makeHarness()
		await plant(h, row("f-sp", FpcType.DefaultSponsoredFpc, "0xsponsored"))
		const fpc = await h.service.getFpcImpl("f-sp")
		expect(fpc.infoData.isProtocol).toBe(true)
	})

	test("a PrivateFPC row at any other address is refused", async () => {
		const h = await makeHarness()
		await plant(h, row("f-bad", FpcType.PrivateFpc, "0xdead"))
		await expect(h.service.getFpcImpl("f-bad")).rejects.toThrow(/not the protocol contract/)
	})

	test("a custom sponsored FPC still resolves", async () => {
		const h = await makeHarness()
		await plant(h, row("f-custom", FpcType.DefaultSponsoredFpc, "0xcafe"))
		const fpc = await h.service.getFpcImpl("f-custom")
		expect(fpc.infoData.isProtocol).toBe(false)
	})
})

describe("FpcService.updateFpcAddress — the write lands on the row as it stands", () => {
	const OLD = `0x${"11".repeat(32)}`
	const NEW = `0x${"22".repeat(32)}`

	/** Only NEW waits on the gate, so the row's creation at OLD completes. */
	async function withUserRow(gate?: Promise<void>) {
		const h = await makeHarness()
		const reached = deferred<void>()
		setPxe(h, {
			getContractInstance: async (address: { toString(): string }) => {
				if (gate && address.toString() === NEW) {
					reached.resolve()
					await gate
				}
				return { currentContractClassId: "c1" }
			},
			getContractArtifact: async () => SPONSOR_ARTIFACT,
		})
		const { id } = await h.service.addFpc("n1", FpcType.DefaultSponsoredFpc, OLD, "Mine")
		return { h, id, reached: reached.promise }
	}

	test("a rename landing during the address check survives the edit", async () => {
		const gate = deferred<void>()
		const { h, id, reached } = await withUserRow(gate.promise)

		const edit = h.service.updateFpcAddress(id, NEW)
		await reached
		await h.service.updateFpc(id, "Renamed")
		gate.resolve()

		await expect(edit).resolves.toMatchObject({ name: "Renamed", address: NEW })
		expect(await h.service.getFpc(id)).toMatchObject({ name: "Renamed", address: NEW })
	})

	test("a delete landing during the address check rejects the edit and brings no row back", async () => {
		const gate = deferred<void>()
		const { h, id, reached } = await withUserRow(gate.promise)

		const edit = h.service.updateFpcAddress(id, NEW)
		await reached
		await h.service.deleteFpc(id)
		gate.resolve()

		await expect(edit).rejects.toThrow(/^Invalid id$/)
		expect(await fpcRowCount(h.api)).toBe(0)
	})

	test("an edit with nothing concurrent stores the new address under the same name", async () => {
		const { h, id } = await withUserRow()

		await expect(h.service.updateFpcAddress(id, NEW)).resolves.toMatchObject({ name: "Mine", address: NEW })
		expect(await fpcRowCount(h.api)).toBe(1)
	})
})
