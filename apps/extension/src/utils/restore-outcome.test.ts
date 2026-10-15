import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import {
	admitRestoreOutcome,
	armRestoreOutcome,
	clearRestoreOutcome,
	finishRestoreOutcome,
	RESTORE_OUTCOME_LEASE_MS,
	readRestoreOutcome,
} from "./restore-outcome"
import { restoreOutcomeKey } from "./profile-ui-keys"

const CHECKSUM = "ab".repeat(32)
const KEY = restoreOutcomeKey("p1")

let store: Map<string, unknown>
let writes: number

/** `navigator.locks` granting each name to one holder at a time, in request order. */
function fifoLocks() {
	const tails = new Map<string, Promise<unknown>>()
	return {
		request: (name: string, fn: () => Promise<unknown>) => {
			const run = (tails.get(name) ?? Promise.resolve()).then(fn)
			tails.set(
				name,
				run.catch(() => {}),
			)
			return run
		},
	}
}

beforeEach(() => {
	store = new Map()
	writes = 0
	vi.stubGlobal("navigator", { locks: fifoLocks() })
	vi.stubGlobal("chrome", {
		storage: {
			local: {
				get: vi.fn(async (key: string) => (store.has(key) ? { [key]: structuredClone(store.get(key)) } : {})),
				set: vi.fn(async (items: Record<string, unknown>) => {
					writes++
					for (const [k, v] of Object.entries(items)) store.set(k, structuredClone(v))
				}),
				remove: vi.fn(async (keys: string | string[]) => {
					writes++
					for (const k of [keys].flat()) store.delete(k)
				}),
			},
		},
	})
})

afterEach(() => {
	vi.unstubAllGlobals()
	vi.useRealTimers()
})

const valid = (over: Record<string, unknown> = {}) => ({
	run: "0123456789abcdef0123456789abcdef",
	backup: CHECKSUM,
	networkIds: ["3f2a9c1e"],
	leaseUntil: 0,
	...over,
})

describe("the stored record", () => {
	test.each([
		["not an object", "3f2a9c1e"],
		["an array", [valid()]],
		["a short run token", valid({ run: "abc" })],
		["an upper-case checksum", valid({ backup: CHECKSUM.toUpperCase() })],
		["no networks", valid({ networkIds: [] })],
		["65 networks", valid({ networkIds: Array.from({ length: 65 }, (_, i) => `n${i}`) })],
		["a network id of 65 characters", valid({ networkIds: ["x".repeat(65)] })],
		["a network id that is not text", valid({ networkIds: [7] })],
		["a lease that is not a number", valid({ leaseUntil: "soon" })],
		["an infinite lease", valid({ leaseUntil: Number.POSITIVE_INFINITY })],
	])("%s reads as absent and is removed", async (_label, raw) => {
		store.set(KEY, raw)
		expect(await readRestoreOutcome("p1")).toBeUndefined()
		expect(store.has(KEY)).toBe(false)
	})

	test("a well-formed record is read back and kept", async () => {
		store.set(KEY, valid())
		expect(await readRestoreOutcome("p1")).toEqual(valid())
		expect(store.get(KEY)).toEqual(valid())
	})

	test("a lease further ahead than any run takes reads as ended", async () => {
		const now = 1_000_000
		store.set(KEY, valid({ leaseUntil: now + RESTORE_OUTCOME_LEASE_MS + 1 }))
		expect((await readRestoreOutcome("p1", now))?.leaseUntil).toBe(0)
		store.set(KEY, valid({ leaseUntil: now + RESTORE_OUTCOME_LEASE_MS }))
		expect((await readRestoreOutcome("p1", now))?.leaseUntil).toBe(now + RESTORE_OUTCOME_LEASE_MS)
	})
})

describe("a run's life", () => {
	test("arming leases the networks to the run and replaces any earlier record", async () => {
		store.set(KEY, valid({ networkIds: ["old"] }))
		const before = Date.now()
		const run = await armRestoreOutcome("p1", CHECKSUM, ["3f2a9c1e", "3f2a9c1e", "0badc0de"])

		const record = await readRestoreOutcome("p1")
		expect(record).toMatchObject({ run, backup: CHECKSUM, networkIds: ["3f2a9c1e", "0badc0de"] })
		expect(record?.leaseUntil).toBeGreaterThanOrEqual(before + RESTORE_OUTCOME_LEASE_MS)
		expect(record?.leaseUntil).toBeLessThanOrEqual(Date.now() + RESTORE_OUTCOME_LEASE_MS)
	})

	test("arming no network writes nothing", async () => {
		expect(await armRestoreOutcome("p1", CHECKSUM, [])).toBeUndefined()
		expect(writes).toBe(0)
	})

	test("a full success leaves no record", async () => {
		const run = (await armRestoreOutcome("p1", CHECKSUM, ["a", "b"])) as string
		expect(await admitRestoreOutcome("p1", run)).toMatchObject({ run, networkIds: ["a", "b"] })
		await finishRestoreOutcome("p1", run, ["a", "b"])
		expect(store.has(KEY)).toBe(false)
	})

	test("a partial success keeps the rest with the lease released", async () => {
		const run = (await armRestoreOutcome("p1", CHECKSUM, ["a", "b"])) as string
		await finishRestoreOutcome("p1", run, ["a"])
		expect(store.get(KEY)).toEqual({ run, backup: CHECKSUM, networkIds: ["b"], leaseUntil: 0 })
	})

	test("admit and finish write nothing for another run's record, or none", async () => {
		const other = "f".repeat(32)
		await armRestoreOutcome("p1", CHECKSUM, ["a"])
		const armed = store.get(KEY)
		writes = 0

		expect(await admitRestoreOutcome("p1", other)).toBeUndefined()
		await finishRestoreOutcome("p1", other, ["a"])
		expect(store.get(KEY)).toEqual(armed)

		store.delete(KEY)
		expect(await admitRestoreOutcome("p1", other)).toBeUndefined()
		await finishRestoreOutcome("p1", other, ["a"])
		expect(writes).toBe(0)
		expect(store.has(KEY)).toBe(false)
	})

	test("a Dismiss queued behind a finish leaves no record", async () => {
		const run = (await armRestoreOutcome("p1", CHECKSUM, ["a", "b"])) as string
		const finishing = finishRestoreOutcome("p1", run, ["a"])
		const dismissing = clearRestoreOutcome("p1")
		await Promise.all([finishing, dismissing])
		expect(store.has(KEY)).toBe(false)
	})

	test("a finish queued behind a Dismiss writes nothing back", async () => {
		const run = (await armRestoreOutcome("p1", CHECKSUM, ["a", "b"])) as string
		const dismissing = clearRestoreOutcome("p1")
		const finishing = finishRestoreOutcome("p1", run, ["a"])
		await Promise.all([dismissing, finishing])
		expect(store.has(KEY)).toBe(false)
	})

	test("profiles keep separate records", async () => {
		await armRestoreOutcome("p1", CHECKSUM, ["a"])
		await armRestoreOutcome("p10", CHECKSUM, ["b"])
		await clearRestoreOutcome("p1")
		expect(await readRestoreOutcome("p1")).toBeUndefined()
		expect((await readRestoreOutcome("p10"))?.networkIds).toEqual(["b"])
	})
})
