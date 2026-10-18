/**
 * Unit tests for `BalanceRefreshOutbox` over an in-memory repository and a controllable lock ticket:
 * the window between the anchor's re-read and its write, which the service fixture's real lock cannot
 * time. The drain's state machine runs against the real service lock in `service.scenarios.test.ts`.
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
		setOutbox: vi.fn(async (p: string, n: string, a: string, t: number, row: IncomingBalanceOutboxRow) => {
			rows.set(balanceOutboxKey(p, n, a, t), row)
		}),
		deleteOutbox: async (p, n, a, t) => {
			rows.delete(balanceOutboxKey(p, n, a, t))
		},
		listOutbox: async () => [...rows],
	}
	const outbox = new BalanceRefreshOutbox({
		repo,
		activeProfileId: async () => "p1",
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
