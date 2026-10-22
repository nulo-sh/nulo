/**
 * Unit tests for `BalanceRefreshOutbox` over an in-memory repository and a controllable lock ticket,
 * isolating a ticket revoked during the anchor's re-read. The drain's state machine runs against the
 * real service lock in `service.scenarios.test.ts`.
 */
import { describe, expect, test, vi } from "vitest"
import { BalanceRefreshOutbox, type BalanceRefreshOutboxDeps } from "./balance-outbox"
import { type IncomingBalanceOutboxRow, balanceOutboxKey } from "./spec"

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
