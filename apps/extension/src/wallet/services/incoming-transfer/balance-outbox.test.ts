/**
 * Unit tests for `BalanceRefreshOutbox` over an in-memory repository and a controllable lock ticket,
 * isolating a ticket revoked during the anchor's re-read. The drain's state machine runs against the
 * real service lock in `service.scenarios.test.ts`.
 */
import { describe, expect, test, vi } from "vitest"
import { BalanceRefreshOutbox, type BalanceRefreshOutboxDeps } from "./balance-outbox"
import { type IncomingBalanceOutboxRow, balanceOutboxKey } from "./spec"
import { TaskStatus } from "@/wallet/services/task/spec"

const KEY = balanceOutboxKey("p1", "n1", "0xa", 1)

function makeOutbox(opts: { revokeOnReRead: boolean }) {
	const rows = new Map<string, IncomingBalanceOutboxRow>([[KEY, { dirtyAt: 100 }]])
	let current = true
	let reads = 0
	const repo: BalanceRefreshOutboxDeps["repo"] = {
		getOutbox: async (p, n, a, t) => {
			reads += 1
			// The anchor's re-read is the row's second read; a watchdog handoff during it revokes the ticket.
			if (reads === 2 && opts.revokeOnReRead) current = false
			return rows.get(balanceOutboxKey(p, n, a, t))
		},
		setOutbox: vi.fn(async (p: string, n: string, a: string, t: number, row: IncomingBalanceOutboxRow, fence?: () => boolean) => {
			if (fence && !fence()) return false
			rows.set(balanceOutboxKey(p, n, a, t), row)
			return true
		}),
		deleteOutbox: async (p, n, a, t, fence) => {
			if (fence && !fence()) return false
			return rows.delete(balanceOutboxKey(p, n, a, t))
		},
		listOutbox: async () => [...rows],
	}
	const outbox = new BalanceRefreshOutbox({
		repo,
		activeProfile: async () => ({ id: "p1" }),
		withLock: (fn) => fn(() => current),
		tokenBalances: { requestBalanceRefresh: async () => ({ taskId: "T1" }) },
		tasks: { getTaskSync: vi.fn() },
		warn: () => {},
	})
	return { outbox, rows, repo }
}

describe("BalanceRefreshOutbox — the anchor's ticket check", () => {
	test("a ticket revoked during the re-read leaves the row unanchored", async () => {
		const { outbox, rows, repo } = makeOutbox({ revokeOnReRead: true })

		await outbox.drain()

		expect(repo.setOutbox).not.toHaveBeenCalled()
		expect(rows.get(KEY)).toEqual({ dirtyAt: 100 })
	})

	test("a ticket still current at the write anchors the fresh task", async () => {
		const { outbox, rows } = makeOutbox({ revokeOnReRead: false })

		await outbox.drain()

		expect(rows.get(KEY)).toEqual({ dirtyAt: 100, pendingTaskId: "T1" })
	})
})

describe("BalanceRefreshOutbox — the dirty mark's fence", () => {
	test("a mark its caller's fence refuses writes nothing", async () => {
		const { outbox, rows } = makeOutbox({ revokeOnReRead: false })

		expect(await outbox.markDirty("p1", "n1", "0xa", 1, () => false)).toBe(false)

		expect(rows.get(KEY)).toEqual({ dirtyAt: 100 })
	})
})

/** An outbox over rows that start empty, whose listing can be held after its snapshot is taken. */
function makeListedOutbox() {
	const rows = new Map<string, IncomingBalanceOutboxRow>()
	const listing = { hold: undefined as Promise<void> | undefined, fail: false }
	const repo: BalanceRefreshOutboxDeps["repo"] = {
		getOutbox: async (p, n, a, t) => rows.get(balanceOutboxKey(p, n, a, t)),
		setOutbox: async (p, n, a, t, row, fence) => {
			if (fence && !fence()) return false
			rows.set(balanceOutboxKey(p, n, a, t), row)
			return true
		},
		deleteOutbox: async (p, n, a, t, fence) => {
			if (fence && !fence()) return false
			return rows.delete(balanceOutboxKey(p, n, a, t))
		},
		listOutbox: vi.fn(async () => {
			if (listing.fail) throw new Error("storage busy")
			const snapshot = [...rows]
			await listing.hold
			return snapshot
		}),
	}
	const deps = {
		profile: { id: "p1" } as { id: string } | undefined,
		refresh: { taskId: "T1" } as { taskId: string } | { busy: true },
		task: undefined as { status: TaskStatus; finishedAt?: number } | undefined,
	}
	const outbox = new BalanceRefreshOutbox({
		repo,
		activeProfile: async () => deps.profile,
		withLock: (fn) => fn(() => true),
		tokenBalances: { requestBalanceRefresh: async () => deps.refresh },
		tasks: {
			getTaskSync: ((id: string) => {
				if (!deps.task) throw new Error("Invalid task id")
				return { id, ...deps.task }
			}) as never,
		},
		warn: () => {},
	})
	return { outbox, rows, lists: repo.listOutbox as ReturnType<typeof vi.fn>, listing, deps }
}

describe("BalanceRefreshOutbox — drainIfMayHaveRows", () => {
	test("a drain that lists no row lets the next one skip, until a dirty write lands", async () => {
		const { outbox, rows, lists } = makeListedOutbox()

		await outbox.drainIfMayHaveRows()
		await outbox.drainIfMayHaveRows()
		expect(lists).toHaveBeenCalledTimes(1)

		await outbox.markDirty("p1", "n1", "0xa", 1)
		await outbox.drainIfMayHaveRows()
		expect(lists).toHaveBeenCalledTimes(2)
		expect(rows.get(KEY)?.pendingTaskId).toBe("T1")
	})

	test("rows a drain leaves keep the next ones running, with no new dirty write, until a drain lists none", async () => {
		const { outbox, rows, lists, deps } = makeListedOutbox()
		rows.set(KEY, { dirtyAt: 100 })
		deps.refresh = { busy: true }

		await outbox.drainIfMayHaveRows()
		expect(rows.get(KEY)).toEqual({ dirtyAt: 100 })

		deps.refresh = { taskId: "T2" }
		await outbox.drainIfMayHaveRows()
		expect(rows.get(KEY)?.pendingTaskId).toBe("T2")

		deps.task = { status: TaskStatus.Completed, finishedAt: 1 }
		await outbox.drainIfMayHaveRows()
		expect(rows.has(KEY)).toBe(false)

		await outbox.drainIfMayHaveRows()
		await outbox.drainIfMayHaveRows()
		expect(lists).toHaveBeenCalledTimes(4)
	})

	test("a dirty write that lands while a drain lists is drained by the next one", async () => {
		const { outbox, rows, lists, listing } = makeListedOutbox()
		let release: () => void = () => {}
		listing.hold = new Promise((resolve) => {
			release = resolve
		})

		const first = outbox.drainIfMayHaveRows()
		await vi.waitFor(() => expect(lists).toHaveBeenCalledTimes(1))
		await outbox.markDirty("p1", "n1", "0xa", 1)
		release()
		await first
		expect(rows.get(KEY)?.pendingTaskId).toBeUndefined()

		listing.hold = undefined
		await outbox.drainIfMayHaveRows()
		expect(rows.get(KEY)?.pendingTaskId).toBe("T1")
	})

	test.each([
		["a listing that fails", (f: ReturnType<typeof makeListedOutbox>) => (f.listing.fail = true)],
		["no active profile", (f: ReturnType<typeof makeListedOutbox>) => (f.deps.profile = undefined)],
	])("a drain that stops at %s keeps the next one running", async (_name, stop) => {
		const f = makeListedOutbox()
		await f.outbox.drainIfMayHaveRows()
		stop(f)
		await f.outbox.drain()
		f.listing.fail = false
		f.deps.profile = { id: "p1" }
		f.lists.mockClear()

		await f.outbox.drainIfMayHaveRows()
		expect(f.lists).toHaveBeenCalledTimes(1)
	})
})
