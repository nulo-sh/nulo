/**
 * Every legacy IndexedDB delete in PxeService, pinned per site: the blocked policy (the boot
 * sweep skips, erasure waits 5 s then rejects), the rejection reason, the warn arguments, the
 * deletion order, how often `databases()` is listed, and the microtask distance from each IDB
 * event to the next observable step. The stub fires a request's events only when told to.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("./known-artifacts", () => ({
	loadProductionKnownArtifacts: async () => ({ artifacts: new Map(), instances: new Map() }),
}))
vi.mock("./note-schemas", () => ({
	loadProductionNoteSchemas: async () => new Map<string, unknown>(),
}))
const h = vi.hoisted(() => ({
	calls: [] as string[],
	onDelete: undefined as ((name: string) => void) | undefined,
	onList: undefined as (() => void) | undefined,
}))
vi.mock("./opfs-store", async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	listChainStoreDirs: async () => [],
	removeChainStoreDir: async () => {
		h.calls.push("removeChainStoreDir")
	},
	removeProfileStoreDirs: async () => {
		h.calls.push("removeProfileStoreDirs")
	},
}))

import { type ILogger, LogLevel } from "@nulo/wallet-core/logger"
import type { ReadWriteGuard } from "@nulo/wallet-core/utils"
import { PxeService } from "./service"

type Outcome = "success" | "blocked" | "error" | "error-null" | "manual"
type FakeReq = { onsuccess?: () => void; onerror?: () => void; onblocked?: () => void; error?: unknown }
type Listing = IDBDatabaseInfo[] | Promise<IDBDatabaseInfo[]>
type Internals = {
	sweepOrphanStores(): Promise<void>
	storeKeys: Map<string, Uint8Array>
	profileLifecycles: Map<string, { current?: { kind: string; gen: string }; dead: Set<string> }>
	profileBarriers: Map<string, unknown>
	getProfileBarrier(profileId: string): ReadWriteGuard
}

const boom = new Error("boom")
const db = (name: string): IDBDatabaseInfo => ({ name, version: 1 })
const P1_1 = db("pxe/p1/1")
const P1_2 = db("pxe/p1/2")
const P2_1 = db("pxe/p2/1")
const P10_1 = db("pxe/p10/1")
const KEYVAL = db("keyval-store")

let outcomes: Record<string, Outcome> = {}
let listings: Listing[] = []
const reqs = new Map<string, FakeReq>()
const warns: unknown[][] = []

const logger: ILogger = {
	log: (_source, level, ...data) => {
		if (level === LogLevel.Warn) warns.push(data)
	},
}

function fire(req: FakeReq, outcome: Outcome): void {
	if (outcome === "success") req.onsuccess?.()
	if (outcome === "blocked") req.onblocked?.()
	if (outcome === "error") {
		req.error = boom
		req.onerror?.()
	}
	if (outcome === "error-null") req.onerror?.()
}

function installIdb(): void {
	vi.stubGlobal("indexedDB", {
		databases: () => {
			h.calls.push("databases")
			h.onList?.()
			const next = listings.shift()
			if (next === undefined) throw new Error("unscripted databases() call")
			return next instanceof Promise ? next : Promise.resolve(next)
		},
		deleteDatabase: (name: string) => {
			h.calls.push(`delete:${name}`)
			h.onDelete?.(name)
			const req: FakeReq = {}
			reqs.set(name, req)
			const outcome = outcomes[name] ?? "success"
			if (outcome !== "manual") queueMicrotask(() => fire(req, outcome))
			return req
		},
	})
}

function req(name: string): FakeReq {
	const r = reqs.get(name)
	if (!r) throw new Error(`no delete request for ${name}`)
	return r
}

function makeService(): PxeService {
	const service = new PxeService({ connect: async () => {}, getProfiles: async () => [] }, logger, {
		createChainRuntime: async () => {
			throw new Error("unused")
		},
	})
	const raw = service as unknown as { initialized: boolean; registry: unknown }
	raw.initialized = true
	raw.registry = {
		dispose: async () => {
			h.calls.push("dispose")
		},
		disposeProfile: async () => {
			h.calls.push("disposeProfile")
		},
	}
	return service
}

const internals = (service: PxeService) => service as unknown as Internals

async function until(reached: () => boolean): Promise<void> {
	for (let i = 0; i < 500; i++) {
		if (reached()) return
		await Promise.resolve()
	}
	throw new Error("state never reached")
}

const listed = (n: number) => () => h.calls.filter((c) => c === "databases").length === n

function gate<T>(): { promise: Promise<T>; open: (value: T) => void } {
	let open: (value: T) => void = () => {}
	const promise = new Promise<T>((resolve) => {
		open = resolve
	})
	return { promise, open }
}

/** Counts microtasks from its creation; `watched()` is the first tick `watch` held. */
function tickCounter(watch?: () => boolean) {
	let ticks = 0
	let firstWatched = -1
	const spin = () => {
		ticks++
		if (firstWatched < 0 && watch?.()) firstWatched = ticks
		if (ticks < 500) queueMicrotask(spin)
	}
	queueMicrotask(spin)
	return { now: () => ticks, watched: () => firstWatched }
}

/** Tracks a promise's outcome without awaiting it, so a rejection is always observed. */
function observe(run: Promise<unknown>): { outcome: () => unknown } {
	let outcome: unknown = "pending"
	run.then(
		() => {
			outcome = "resolved"
		},
		(err: unknown) => {
			outcome = err
		},
	)
	return { outcome: () => outcome }
}

beforeEach(() => {
	h.calls.length = 0
	h.onDelete = undefined
	h.onList = undefined
	outcomes = {}
	listings = []
	reqs.clear()
	warns.length = 0
	vi.stubGlobal("chrome", { runtime: { onMessage: { addListener: () => {} } } })
	installIdb()
})
afterEach(() => {
	vi.useRealTimers()
	vi.unstubAllGlobals()
})

describe("boot sweep: best-effort, skips a blocked delete", () => {
	const sweep = (service: PxeService) => internals(service).sweepOrphanStores()

	test("deletes every legacy DB last-first and never keyval-store", async () => {
		listings = [[P1_1, P2_1, KEYVAL]]
		await sweep(makeService())
		expect(h.calls).toEqual(["databases", "delete:pxe/p2/1", "delete:pxe/p1/1"])
		expect(warns).toEqual([])
	})

	test("a blocked legacy DB warns with two arguments and the sweep still resolves", async () => {
		listings = [[P1_1, P2_1, KEYVAL]]
		outcomes = { "pxe/p1/1": "manual" }
		const run = sweep(makeService())
		await until(() => reqs.has("pxe/p1/1"))
		req("pxe/p1/1").onblocked?.()
		expect(warns).toEqual([["deleteDatabase blocked (DB still in use):", "pxe/p1/1"]])
		await expect(run).resolves.toBeUndefined()
		expect(h.calls).toEqual(["databases", "delete:pxe/p2/1", "delete:pxe/p1/1"])
	})

	test("a legacy DB error with no request error rejects with that raw undefined", async () => {
		listings = [[P1_1]]
		outcomes = { "pxe/p1/1": "error-null" }
		await expect(sweep(makeService())).rejects.toBeUndefined()
	})

	test("await shape: the first delete follows the boot listing by a fixed tick", async () => {
		const boot = gate<IDBDatabaseInfo[]>()
		listings = [boot.promise]
		const run = sweep(makeService())
		await until(listed(1))
		const counter = tickCounter()
		let firstDeleteAt = -1
		h.onDelete = (name) => {
			if (name === "pxe/p1/1") firstDeleteAt = counter.now()
		}
		boot.open([P1_1, KEYVAL])
		await run
		expect(firstDeleteAt).toBe(1)
	})
})

describe("profile erasure: verified, waits 5 s on a blocked delete then rejects", () => {
	test("the full ordered erase: prefix DBs in the order of one listing, and keyval-store left alone", async () => {
		listings = [[P1_1, P1_2, KEYVAL]]
		const service = makeService()
		await service.clearProfileState("p1", "gen-1")
		expect(h.calls).toEqual(["disposeProfile", "removeProfileStoreDirs", "databases", "delete:pxe/p1/1", "delete:pxe/p1/2"])
		expect(internals(service).profileLifecycles.get("p1")).toEqual({ dead: new Set(["gen-1"]) })
		expect(internals(service).profileBarriers.has("p1")).toBe(false)
		expect(warns).toEqual([])
	})

	test("crypto-erase and the OPFS removal both precede the first database listing", async () => {
		listings = [[P1_1, KEYVAL], [KEYVAL], [KEYVAL]]
		const service = makeService()
		internals(service).storeKeys.set("p1", new Uint8Array(32))
		internals(service).storeKeys.set("p2", new Uint8Array(32))
		let atFirstListing: { p1Key: boolean; opfsRemoved: boolean } | undefined
		h.onList = () => {
			atFirstListing ??= { p1Key: internals(service).storeKeys.has("p1"), opfsRemoved: h.calls.includes("removeProfileStoreDirs") }
		}
		await service.clearProfileState("p1", "gen-1")
		expect(atFirstListing).toEqual({ p1Key: false, opfsRemoved: true })
		expect(internals(service).storeKeys.has("p2")).toBe(true)
	})

	test("beside profiles p2 and p10, neither sibling is deleted", async () => {
		listings = [[P1_1, P2_1, P10_1, KEYVAL]]
		await makeService().clearProfileState("p1", "gen-1")
		expect(h.calls).toEqual(["disposeProfile", "removeProfileStoreDirs", "databases", "delete:pxe/p1/1"])
	})

	test("a keyval-store held open by a page that proved never blocks the erase", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
		listings = [[P1_1, KEYVAL], [KEYVAL], [KEYVAL]]
		outcomes = { "keyval-store": "blocked" }
		const service = makeService()
		const run = observe(service.clearProfileState("p1", "gen-1"))
		await until(() => run.outcome() !== "pending")
		expect(run.outcome()).toBe("resolved")
		expect(h.calls).not.toContain("delete:keyval-store")
		expect(internals(service).profileLifecycles.get("p1")).toEqual({ dead: new Set(["gen-1"]) })
		expect(internals(service).profileBarriers.has("p1")).toBe(false)
	})

	test("blocked profile DB: the timer arms at the blocked event, rejects at 5,000 ms, and the profile stays fenced", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
		listings = [[P1_1, KEYVAL]]
		outcomes = { "pxe/p1/1": "manual" }
		const service = makeService()
		const run = observe(service.clearProfileState("p1", "gen-1"))
		await until(() => reqs.has("pxe/p1/1"))
		expect(vi.getTimerCount()).toBe(0)
		req("pxe/p1/1").onblocked?.()
		expect(warns).toEqual([["deleteDatabase blocked (waiting for close):", "pxe/p1/1"]])
		await vi.advanceTimersByTimeAsync(4_999)
		expect(run.outcome()).toBe("pending")
		await vi.advanceTimersByTimeAsync(1)
		expect(run.outcome()).toEqual(new Error("deleteDatabase blocked past timeout: pxe/p1/1"))
		expect(internals(service).profileLifecycles.get("p1")).toEqual({ current: { kind: "deleting", gen: "gen-1" }, dead: new Set() })
		expect(internals(service).profileBarriers.has("p1")).toBe(true)
		await expect(
			internals(service)
				.getProfileBarrier("p1")
				.read(async () => "read ran"),
		).resolves.toBe("read ran")
	})

	test("blocked then success resolves and leaves no deletion timer", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
		listings = [[P1_1], [], []]
		outcomes = { "pxe/p1/1": "manual" }
		const run = makeService().clearProfileState("p1", "gen-1")
		await until(() => reqs.has("pxe/p1/1"))
		req("pxe/p1/1").onblocked?.()
		expect(vi.getTimerCount()).toBe(1)
		req("pxe/p1/1").onsuccess?.()
		await run
		expect(vi.getTimerCount()).toBe(0)
	})

	test("blocked then error rejects with that error and leaves no deletion timer", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
		listings = [[P1_1]]
		outcomes = { "pxe/p1/1": "manual" }
		const run = observe(makeService().clearProfileState("p1", "gen-1"))
		await until(() => reqs.has("pxe/p1/1"))
		req("pxe/p1/1").onblocked?.()
		const r = req("pxe/p1/1")
		r.error = boom
		r.onerror?.()
		await until(() => run.outcome() !== "pending")
		expect(run.outcome()).toBe(boom)
		expect(vi.getTimerCount()).toBe(0)
	})

	test("an error rejects with the request's error, or a named Error when none is set", async () => {
		listings = [[P1_1]]
		outcomes = { "pxe/p1/1": "error" }
		await expect(makeService().clearProfileState("p1", "gen-1")).rejects.toBe(boom)

		listings = [[P1_1]]
		outcomes = { "pxe/p1/1": "error-null" }
		await expect(makeService().clearProfileState("p1", "gen-1")).rejects.toEqual(new Error("deleteDatabase failed: pxe/p1/1"))
	})

	test("await shape: lifecycle and barrier release follow the last profile DB's success by fixed ticks", async () => {
		listings = [[P1_1, KEYVAL]]
		outcomes = { "pxe/p1/1": "manual" }
		const service = makeService()
		const run = service.clearProfileState("p1", "gen-1")
		await until(() => reqs.has("pxe/p1/1"))
		let readAt = -1
		const counter = tickCounter(() => internals(service).profileLifecycles.get("p1")?.dead.has("gen-1") === true)
		const read = internals(service)
			.getProfileBarrier("p1")
			.read(async () => {
				readAt = counter.now()
			})
		req("pxe/p1/1").onsuccess?.()
		await run
		await read
		expect({ deletedAt: counter.watched(), readAt }).toEqual({ deletedAt: 2, readAt: 2 })
	})
})

describe("chain purge: verified delete of exactly one chain DB", () => {
	test("dispose, OPFS removal, then the chain's own DB, with no listing", async () => {
		await makeService().clearChainState("p1", 1)
		expect(h.calls).toEqual(["dispose", "removeChainStoreDir", "delete:pxe/p1/1"])
	})

	test("blocked past 5,000 ms rejects with the timeout message", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
		outcomes = { "pxe/p1/1": "manual" }
		const run = observe(makeService().clearChainState("p1", 1))
		await until(() => reqs.has("pxe/p1/1"))
		req("pxe/p1/1").onblocked?.()
		expect(warns).toEqual([["deleteDatabase blocked (waiting for close):", "pxe/p1/1"]])
		await vi.advanceTimersByTimeAsync(4_999)
		expect(run.outcome()).toBe("pending")
		await vi.advanceTimersByTimeAsync(1)
		expect(run.outcome()).toEqual(new Error("deleteDatabase blocked past timeout: pxe/p1/1"))
	})

	test("await shape: the purge settles a fixed number of ticks after the delete succeeds", async () => {
		outcomes = { "pxe/p1/1": "manual" }
		const run = makeService().clearChainState("p1", 1)
		await until(() => reqs.has("pxe/p1/1"))
		const counter = tickCounter()
		let settledAt = -1
		run.then(() => {
			settledAt = counter.now()
		})
		req("pxe/p1/1").onsuccess?.()
		await run
		await Promise.resolve()
		expect(settledAt).toBe(6)
	})
})
