/**
 * `ExecutionLane` — microtask-level race + backpressure pins for the
 * lane seam, against the REAL `ExecutionMutex` (the mutex's own FIFO /
 * abort / capacity semantics are pinned in `execution-mutex.test.ts`;
 * these tests pin the LANE's choreography on top of it).
 *
 * Coverage:
 *   - capacity-reject maps to journal-failed + `TooManyPendingError`
 *   - heartbeats fire while queued
 *   - reaper-window: a queued-then-running op is not reaped (the
 *     heartbeat covers the wait; the holder's own stage transitions
 *     take over after the grant)
 * plus the sync-register invariant, cancel-during-wait, and the FIFO
 * baton release point. The cancelJob ordering contract is pinned in
 * `service.characterization.test.ts`.
 */

import { describe, expect, test, vi } from "vitest"
import { SessionEndedError, TooManyPendingError } from "@nulo/extension-messaging/errors"
import { JobCancelledSentinel } from "@nulo/wallet-core/jobs"
import { deferred } from "@nulo/wallet-core/utils"
import { journalCallTitle } from "@/utils/journal-state"
import { getTxTitle } from "@/utils/tx-enrichment"
import type { OperationRecord } from "@/wallet/services/operation-journal/spec"
import { ExecutionLane, type ExecutionLaneDeps } from "./execution-lane"
import type { ExecutionMutex } from "./execution-mutex"

const FENCE = { profileId: "p1", epoch: 0, session: 1 }

function makeLane(overrides: Partial<ExecutionLaneDeps> = {}) {
	const transitions: unknown[][] = []
	const touches: string[] = []
	const deps: ExecutionLaneDeps = {
		operationJournal: {
			// Default: every record exists and belongs to the active profile,
			// so the ownership gate passes — choreography tests stay focused.
			getOperation: vi.fn(async (id: string) => ({ id, profileId: "p1" }) as never),
			transitionOperation: vi.fn(async (...args: unknown[]) => {
				transitions.push(args)
				return {}
			}),
			touchOperation: vi.fn(async (id: string) => {
				touches.push(id)
			}),
			transitionIfStage: vi.fn(async () => ({ outcome: "stage", stage: "queued" })),
		} as never,
		getActiveProfile: vi.fn(async () => ({ id: "p1" }) as never),
		assertFence: vi.fn(async () => {}),
		peekLiveSerial: vi.fn(() => FENCE.session),
		getNetwork: vi.fn(async () => ({ chainId: 7 }) as never),
		logDebug: vi.fn(),
		logInfo: vi.fn(),
		logError: vi.fn(),
		...overrides,
	}
	return { deps, transitions, touches, lane: new ExecutionLane(deps) }
}

function controllers(lane: ExecutionLane): Map<string, { controller: AbortController; serial: number }> {
	return (lane as unknown as { activeControllers: Map<string, { controller: AbortController; serial: number }> }).activeControllers
}

function mutex(lane: ExecutionLane): ExecutionMutex {
	return (lane as unknown as { executionMutex: ExecutionMutex }).executionMutex
}

async function flushMicrotasks(rounds = 10): Promise<void> {
	for (let i = 0; i < rounds; i++) {
		await new Promise<void>((r) => queueMicrotask(r))
	}
}

describe("ExecutionLane.acquireSlot", () => {
	test("sync-register invariant + cancel-during-wait → JobCancelledSentinel, controller cleaned", async () => {
		const { lane } = makeLane()
		const holder = await lane.acquireSlot("net-1", undefined, FENCE)

		const waiting = lane.acquireSlot("net-1", "queued-2", FENCE)
		const rejection = expect(waiting).rejects.toBeInstanceOf(JobCancelledSentinel)
		await flushMicrotasks()
		// The pre-acquire controller is registered under the queued id BEFORE
		// the wait — a user-cancel during the wait always finds it.
		expect(controllers(lane).has("queued-2")).toBe(true)

		await lane.cancelJob("queued-2")
		await rejection
		const sentinel = await waiting.catch((e) => e)
		expect((sentinel as JobCancelledSentinel).jobId).toBe("queued-2")
		expect(controllers(lane).has("queued-2")).toBe(false)

		// Lane stays usable: the cancelled waiter left the queue, so release
		// → next acquire grants normally.
		holder.release()
		const next = await lane.acquireSlot("net-1", undefined, FENCE)
		next.release()
	})

	test("FIFO baton release point: onEnqueued fires while still waiting; grants stay ordered", async () => {
		const { lane } = makeLane()
		const holder = await lane.acquireSlot("net-1", undefined, FENCE)

		const grants: string[] = []
		const onEnqueuedT2 = vi.fn()
		const t2 = lane.acquireSlot("net-1", undefined, FENCE, onEnqueuedT2).then((g) => {
			grants.push("t2")
			return g
		})
		await flushMicrotasks()
		// The baton releases the moment we're enqueued — NOT at grant time.
		expect(onEnqueuedT2).toHaveBeenCalledTimes(1)
		expect(grants).toEqual([])

		const t3 = lane.acquireSlot("net-1", undefined, FENCE).then((g) => {
			grants.push("t3")
			return g
		})
		await flushMicrotasks()

		holder.release()
		const g2 = await t2
		g2.release()
		const g3 = await t3
		g3.release()
		expect(grants).toEqual(["t2", "t3"])
	})

	test("capacity reject: journal → failed + TooManyPendingError, controller cleaned (adversarial-dApp backpressure)", async () => {
		const { lane, transitions } = makeLane()
		// Same network + same origin: holder (depth 1) + 7 waiters = origin
		// depth 8 (the cap). The 9th must capacity-reject.
		const holder = await lane.acquireSlot("net-1", undefined, FENCE, undefined, "https://dapp.example")
		const waiters: Promise<unknown>[] = []
		for (let i = 0; i < 7; i++) {
			waiters.push(lane.acquireSlot("net-1", undefined, FENCE, undefined, "https://dapp.example"))
		}
		await flushMicrotasks()

		await expect(lane.acquireSlot("net-1", "q9", FENCE, undefined, "https://dapp.example")).rejects.toBeInstanceOf(TooManyPendingError)
		// The journal record terminalizes HERE (the caller's claim never runs):
		// same failed shape the silent path would otherwise leave stuck at pending.
		const failedCall = transitions.find((t) => t[0] === "q9")
		expect(failedCall?.[1]).toEqual({ stage: "failed" })
		expect(failedCall?.[2]).toMatchObject({ kind: "too_many_pending" })
		expect(controllers(lane).has("q9")).toBe(false)

		// Drain so nothing leaks into other tests.
		holder.release()
		for (const w of waiters) {
			const g = (await w) as { release: () => void }
			g.release()
		}
	})

	test("queued-wait heartbeat: fires every 30s while waiting, stops after grant (reaper-window)", async () => {
		vi.useFakeTimers()
		try {
			const { lane, touches, deps } = makeLane()
			const holder = await lane.acquireSlot("net-1", undefined, FENCE)

			const waiting = lane.acquireSlot("net-1", "queued-hb", FENCE)
			// Flush the pre-acquire awaits manually — fake timers don't gate
			// microtasks, but vi.waitFor would.
			await Promise.resolve()
			await Promise.resolve()
			await Promise.resolve()

			await vi.advanceTimersByTimeAsync(30_000)
			expect(touches).toContain("queued-hb")
			const touchesWhileQueued = touches.length
			await vi.advanceTimersByTimeAsync(30_000)
			expect(touches.length).toBeGreaterThan(touchesWhileQueued)

			// Grant: the waiter becomes the holder; the heartbeat MUST stop —
			// the reaper protection hands over to the holder's own stage
			// transitions (proving grace is 35 min).
			holder.release()
			const granted = (await waiting) as { release: () => void }
			const touchesAtGrant = touches.length
			await vi.advanceTimersByTimeAsync(120_000)
			expect(touches.length).toBe(touchesAtGrant)
			expect((deps.operationJournal.touchOperation as ReturnType<typeof vi.fn>).mock.calls.length).toBe(touchesAtGrant)
			granted.release()
		} finally {
			vi.useRealTimers()
		}
	})

	test("mutex keys are (profileId, chainId)-scoped: different chains never contend", async () => {
		const { lane, deps } = makeLane({
			getNetwork: vi.fn(async (networkId: string) => ({ chainId: networkId === "net-1" ? 1 : 2 }) as never),
		})
		const a = await lane.acquireSlot("net-1", undefined, FENCE)
		// Different chainId → different lane → grants immediately (would hang otherwise).
		const b = await lane.acquireSlot("net-2", undefined, FENCE)
		a.release()
		b.release()
		expect(deps.getNetwork).toHaveBeenCalledTimes(2)
	})
})

describe("ExecutionLane.acquireTransferSlot", () => {
	test("one FIFO with dApp sends, no controller registered, the row heartbeated while it waits", async () => {
		vi.useFakeTimers()
		try {
			const { lane, touches } = makeLane()
			const dapp = await lane.acquireSlot("net-1", undefined, FENCE, undefined, "https://dapp.example")
			expect(lane.isSlotBusy("p1", 7)).toBe(true)
			let granted = false
			const transfer = lane.acquireTransferSlot("net-1", "j1", FENCE, new AbortController().signal).then((release) => {
				granted = true
				return release
			})
			await vi.advanceTimersByTimeAsync(30_000)
			expect(granted).toBe(false)
			expect(touches).toContain("j1")
			expect(controllers(lane).has("j1")).toBe(false)
			dapp.release()
			;(await transfer)()
			expect(lane.isSlotBusy("p1", 7)).toBe(false)
		} finally {
			vi.useRealTimers()
		}
	})

	test("onWait runs once as a send joins behind another, never at a free slot", async () => {
		const { lane } = makeLane()
		const signal = new AbortController().signal
		const atFree = vi.fn()
		const first = await lane.acquireTransferSlot("net-1", "j1", FENCE, signal, atFree)
		expect(atFree).not.toHaveBeenCalled()
		const behind = vi.fn()
		const second = lane.acquireTransferSlot("net-1", "j2", FENCE, signal, behind)
		await vi.waitFor(() => expect(behind).toHaveBeenCalledTimes(1))
		first()
		;(await second)()
		expect(behind).toHaveBeenCalledTimes(1)
	})

	test("an abort of the transfer's own signal ends the wait as the cancel sentinel; the lane stays usable", async () => {
		const { lane } = makeLane()
		const holder = await lane.acquireSlot("net-1", undefined, FENCE)
		const controller = new AbortController()
		const waiting = lane.acquireTransferSlot("net-1", "j1", FENCE, controller.signal)
		controller.abort()
		const sentinel = await waiting.catch((e: unknown) => e)
		expect(sentinel).toBeInstanceOf(JobCancelledSentinel)
		expect((sentinel as JobCancelledSentinel).jobId).toBe("j1")
		holder.release()
		;(await lane.acquireTransferSlot("net-1", "j2", FENCE, new AbortController().signal))()
	})

	test("popup sends have their own bucket: past it the next one is refused, never queued", async () => {
		const { lane, transitions } = makeLane()
		const signal = new AbortController().signal
		const holder = await lane.acquireTransferSlot("net-1", "j0", FENCE, signal)
		const waiters = Array.from({ length: 7 }, (_, i) => lane.acquireTransferSlot("net-1", `j${i + 1}`, FENCE, signal))
		await expect(lane.acquireTransferSlot("net-1", "j8", FENCE, signal)).rejects.toBeInstanceOf(TooManyPendingError)
		expect(transitions).toEqual([])
		// A dApp origin is not counted against the popup bucket.
		const dapp = lane.acquireSlot("net-1", undefined, FENCE, undefined, "https://dapp.example")
		holder()
		for (const w of waiters) (await w)()
		;(await dapp).release()
	})

	test("takeEstimateSlot waits behind an estimate, and refuses while a send holds or waits for the slot", async () => {
		const { lane } = makeLane()
		const first = lane.takeEstimateSlot("p1", 7) as Promise<() => void>
		expect(lane.isSlotBusy("p1", 7)).toBe(true)
		expect(lane.isSendInSlot("p1", 7)).toBe(false)
		let secondGranted = false
		const second = (lane.takeEstimateSlot("p1", 7) as Promise<() => void>).then((release) => {
			secondGranted = true
			return release
		})
		let dappGranted = false
		const dapp = lane.acquireSlot("net-1", undefined, FENCE, undefined, "https://dapp.example").then((s) => {
			dappGranted = true
			return s
		})
		await vi.waitFor(() => expect(lane.isSendInSlot("p1", 7)).toBe(true))
		expect(lane.takeEstimateSlot("p1", 7)).toBeUndefined()
		expect(secondGranted).toBe(false)
		;(await first)()
		const releaseSecond = await second
		await Promise.resolve()
		expect(dappGranted).toBe(false)
		releaseSecond()
		;(await dapp).release()
		expect(lane.isSlotBusy("p1", 7)).toBe(false)
	})

	test("an estimate's abort while it waits ends the wait as the cancel sentinel", async () => {
		const { lane } = makeLane()
		const first = lane.takeEstimateSlot("p1", 7) as Promise<() => void>
		const controller = new AbortController()
		const waiting = lane.takeEstimateSlot("p1", 7, controller.signal)
		controller.abort()
		await expect(waiting).rejects.toBeInstanceOf(JobCancelledSentinel)
		;(await first)()
		await vi.waitFor(() => expect(lane.isSlotBusy("p1", 7)).toBe(false))
	})

	test("an ended session refuses before keying or waiting", async () => {
		const { lane, deps } = makeLane({ assertFence: vi.fn(async () => Promise.reject(new SessionEndedError())) })
		await expect(lane.acquireTransferSlot("net-1", "j1", FENCE, new AbortController().signal)).rejects.toBeInstanceOf(SessionEndedError)
		expect(deps.getNetwork).not.toHaveBeenCalled()
		expect(lane.isSlotBusy("p1", 7)).toBe(false)
	})
})

describe("ExecutionLane fence: registration, slot refusal, mutex key", () => {
	test("registerInFlight registers only under the live serial; a dead or absent one reports live: false", () => {
		const live = { serial: 2 as number | undefined }
		const { lane } = makeLane({ peekLiveSerial: vi.fn(() => live.serial) })
		expect(lane.registerInFlight("job-dead", 1, new AbortController())).toEqual({ live: false })
		live.serial = undefined
		expect(lane.registerInFlight("job-locked", 2, new AbortController())).toEqual({ live: false })
		expect(controllers(lane).size).toBe(0)
		live.serial = 2
		const controller = new AbortController()
		expect(lane.registerInFlight("job-live", 2, controller)).toEqual({ live: true })
		expect(controllers(lane).get("job-live")).toEqual({ controller, serial: 2 })
	})

	test("acquireSlot registers the pre-acquire controller before its first await, then asserts, then keys", async () => {
		const order: string[] = []
		const harness = makeLane({
			assertFence: vi.fn(async () => {
				order.push(`assert:registered=${controllers(harness.lane).has("q1")}`)
			}),
			getNetwork: vi.fn(async () => {
				order.push("key")
				return { chainId: 7 } as never
			}),
		})
		const pending = harness.lane.acquireSlot("net-1", "q1", FENCE)
		expect(controllers(harness.lane).get("q1")?.serial).toBe(FENCE.session)
		const { release } = await pending
		release()
		expect(order).toEqual(["assert:registered=true", "key"])
	})

	test("a dead serial fails the queued record as session_ended, then throws; nothing asserted, keyed or acquired", async () => {
		const { lane, transitions, deps } = makeLane({ peekLiveSerial: vi.fn(() => 2) })
		const acquire = vi.spyOn(mutex(lane), "acquire")
		await expect(lane.acquireSlot("net-1", "q-dead", FENCE)).rejects.toBeInstanceOf(SessionEndedError)
		const failed = transitions.find((t) => t[0] === "q-dead")
		expect(failed?.[1]).toEqual({ stage: "failed" })
		expect(failed?.[2]).toMatchObject({ kind: "session_ended" })
		expect(controllers(lane).has("q-dead")).toBe(false)
		expect(deps.assertFence).not.toHaveBeenCalled()
		expect(deps.getNetwork).not.toHaveBeenCalled()
		expect(acquire).not.toHaveBeenCalled()
	})

	test("a failed assert fails the queued record as session_ended, drops the controller, never keys or acquires", async () => {
		const { lane, transitions, deps } = makeLane({
			assertFence: vi.fn(async () => {
				throw new SessionEndedError()
			}),
		})
		const acquire = vi.spyOn(mutex(lane), "acquire")
		await expect(lane.acquireSlot("net-1", "q-ended", FENCE)).rejects.toBeInstanceOf(SessionEndedError)
		const failed = transitions.find((t) => t[0] === "q-ended")
		expect(failed?.[1]).toEqual({ stage: "failed" })
		expect(failed?.[2]).toMatchObject({ kind: "session_ended" })
		expect(controllers(lane).has("q-ended")).toBe(false)
		expect(deps.getNetwork).not.toHaveBeenCalled()
		expect(acquire).not.toHaveBeenCalled()
	})

	test("the mutex key is the fence's profile even when another profile is active", async () => {
		const { lane, deps } = makeLane({ getActiveProfile: vi.fn(async () => ({ id: "p2" }) as never) })
		const acquire = vi.spyOn(mutex(lane), "acquire")
		const { release } = await lane.acquireSlot("net-1", undefined, FENCE)
		release()
		expect(acquire.mock.calls[0]?.[0]).toBe("p1:7")
		expect(deps.getActiveProfile).not.toHaveBeenCalled()
	})

	test("claimOrCreateJournal creates under the fence's profile and epoch and registers under its serial", async () => {
		const createOperation = vi.fn(async (input: unknown) => ({ id: "op-3", ...(input as object) }) as never)
		const { lane, deps } = makeLane({
			operationJournal: { createOperation } as never,
			getActiveProfile: vi.fn(async () => ({ id: "p2-successor" }) as never),
			captureProfileEpoch: vi.fn(() => 99),
		})
		const origin = { type: 1, name: "dapp" } as never
		const claimed = await lane.claimOrCreateJournal("net-1", "0xacct", origin, undefined, undefined, undefined, FENCE)
		expect(claimed.journalId).toBe("op-3")
		expect(createOperation).toHaveBeenCalledWith(expect.objectContaining({ profileId: "p1", profileEpoch: 0 }))
		expect(controllers(lane).get("op-3")).toEqual({ controller: claimed.controller, serial: FENCE.session })
		expect(deps.getActiveProfile).not.toHaveBeenCalled()
	})
})

describe("ExecutionLane.abandonDeadSessions", () => {
	test("cancels a dead serial's record before aborting it; a live serial and a record past `submitting` keep running", async () => {
		const stages: Record<string, string> = { dead: "proving", broadcasting: "submitting", live: "proving" }
		const dead = new AbortController()
		const broadcasting = new AbortController()
		const live = new AbortController()
		let abortedBeforeTransition: boolean | undefined
		const transitionIfStage = vi.fn(async (id: string, allowed: readonly string[]) => {
			if (id === "dead") abortedBeforeTransition = dead.signal.aborted
			if (!allowed.includes(stages[id] ?? "")) return { outcome: "stage", stage: stages[id] }
			stages[id] = "cancelled"
			return { outcome: "transitioned", record: {} }
		})
		const session = { serial: 1 }
		const { lane } = makeLane({
			operationJournal: { transitionIfStage } as never,
			peekLiveSerial: vi.fn(() => session.serial),
		})
		lane.registerInFlight("dead", 1, dead)
		lane.registerInFlight("broadcasting", 1, broadcasting)
		session.serial = 2
		lane.registerInFlight("live", 2, live)

		await lane.abandonDeadSessions()

		expect(stages).toEqual({ dead: "cancelled", broadcasting: "submitting", live: "proving" })
		expect(transitionIfStage.mock.calls.map(([id]) => id)).toEqual(["dead", "broadcasting"])
		expect(abortedBeforeTransition).toBe(false)
		expect([dead, broadcasting, live].map((c) => c.signal.aborted)).toEqual([true, false, false])
		expect([...controllers(lane).keys()]).toEqual(["broadcasting", "live"])
	})

	test("a journal failure on one record is logged by id, and the sweep still cancels the next", async () => {
		const failure = new Error("storage down")
		const transitionIfStage = vi.fn(async (id: string) => {
			if (id === "first") throw failure
			return { outcome: "transitioned", record: {} }
		})
		const session = { serial: 1 as number | undefined }
		const { lane, deps } = makeLane({
			operationJournal: { transitionIfStage } as never,
			peekLiveSerial: vi.fn(() => session.serial),
		})
		const first = new AbortController()
		const second = new AbortController()
		lane.registerInFlight("first", 1, first)
		lane.registerInFlight("second", 1, second)
		session.serial = undefined

		await expect(lane.abandonDeadSessions()).resolves.toBeUndefined()

		expect(deps.logError).toHaveBeenCalledWith(expect.any(String), { journalId: "first", error: failure })
		expect([first, second].map((c) => c.signal.aborted)).toEqual([false, true])
	})
})

describe("ExecutionLane.beginJournal fence threading", () => {
	test("with a fence: uses the AUTHORIZATION-time profileId+epoch, never re-reads the active profile", async () => {
		// After the FIFO wait the active profile can be a successor that reused
		// the deleted profile's id — re-capturing here would file the stale
		// operation into the wrong incarnation.
		const createOperation = vi.fn(async (input: unknown) => ({ id: "op-1", ...(input as object) }) as never)
		const { lane, deps } = makeLane({
			operationJournal: { createOperation } as never,
			getActiveProfile: vi.fn(async () => ({ id: "p2-successor" }) as never),
			captureProfileEpoch: vi.fn(() => 99),
		})

		const id = await lane.beginJournal("net-1", "0xacct", { type: 1, name: "dapp" } as never, undefined, {
			profileId: "p1",
			epoch: 0,
			session: 1,
		})

		expect(id).toBe("op-1")
		expect(createOperation).toHaveBeenCalledWith(expect.objectContaining({ profileId: "p1", profileEpoch: 0 }))
		expect(deps.getActiveProfile).not.toHaveBeenCalled()
		expect(deps.captureProfileEpoch).not.toHaveBeenCalled()
	})

	test("without a fence: falls back to the active profile + a fresh epoch capture", async () => {
		const createOperation = vi.fn(async (input: unknown) => ({ id: "op-2", ...(input as object) }) as never)
		const { lane } = makeLane({
			operationJournal: { createOperation } as never,
			captureProfileEpoch: vi.fn(() => 3),
		})

		const id = await lane.beginJournal("net-1", "0xacct", { type: 1, name: "dapp" } as never)

		expect(id).toBe("op-2")
		expect(createOperation).toHaveBeenCalledWith(expect.objectContaining({ profileId: "p1", profileEpoch: 3 }))
	})
})

describe("ExecutionLane.cancelJob ownership (the profile is the sole principal)", () => {
	function makeOwnershipLane(opts: { activeProfile?: string; recordProfile?: string }) {
		const transitions: unknown[][] = []
		const harness = makeLane({
			getActiveProfile: vi.fn(async () => (opts.activeProfile ? ({ id: opts.activeProfile } as never) : undefined)),
			operationJournal: {
				getOperation: vi.fn(async () =>
					opts.recordProfile ? ({ id: "job-1", profileId: opts.recordProfile } as never) : undefined,
				),
				transitionOperation: vi.fn(async (...args: unknown[]) => {
					transitions.push(args)
					return {}
				}),
				touchOperation: vi.fn(async () => {}),
			} as never,
		})
		return { ...harness, transitions }
	}

	test("matching profile → cancels: transition + abort + controller removed", async () => {
		const { lane, transitions } = makeOwnershipLane({ activeProfile: "p1", recordProfile: "p1" })
		const controller = new AbortController()
		lane.registerInFlight("job-1", FENCE.session, controller)
		await lane.cancelJob("job-1")
		expect(transitions.find((t) => t[0] === "job-1")?.[1]).toEqual({ stage: "cancelled" })
		expect(controller.signal.aborted).toBe(true)
		expect(controllers(lane).has("job-1")).toBe(false)
	})

	test("foreign profile → silent drop: no transition, no abort (indistinguishable from unknown id)", async () => {
		const { lane, transitions } = makeOwnershipLane({ activeProfile: "p1", recordProfile: "p2" })
		const controller = new AbortController()
		lane.registerInFlight("job-1", FENCE.session, controller)
		await lane.cancelJob("job-1")
		expect(transitions).toEqual([])
		expect(controller.signal.aborted).toBe(false)
	})

	test("record absent → silent drop before any journal write", async () => {
		const { lane, transitions } = makeOwnershipLane({ activeProfile: "p1", recordProfile: undefined })
		await lane.cancelJob("ghost")
		expect(transitions).toEqual([])
	})

	test("locked wallet (no active profile) → silent drop, even for a real record", async () => {
		const { lane, transitions } = makeOwnershipLane({ activeProfile: undefined, recordProfile: "p1" })
		const controller = new AbortController()
		lane.registerInFlight("job-1", FENCE.session, controller)
		await lane.cancelJob("job-1")
		expect(transitions).toEqual([])
		expect(controller.signal.aborted).toBe(false)
	})
})

function queuedWaiters(lane: ExecutionLane): Map<string, number> {
	return (lane as unknown as { queuedWaiters: Map<string, number> }).queuedWaiters
}

describe("pre-claim wait heartbeat", () => {
	test("a pre-claim waiter is touched across the queued grace without any acquireSlot call", async () => {
		vi.useFakeTimers()
		try {
			const { lane, touches } = makeLane()
			lane.beginQueuedWait("pre-1")
			await vi.advanceTimersByTimeAsync(30_000)
			expect(touches).toContain("pre-1")
			const count = touches.length
			await vi.advanceTimersByTimeAsync(10 * 60_000) // the whole queued grace
			expect(touches.length).toBeGreaterThan(count) // still vouched-for
			lane.endQueuedWait("pre-1")
		} finally {
			vi.useRealTimers()
		}
	})

	test("the lease expires: a waiter past the ceiling stops being touched and is removed; a younger one continues", async () => {
		vi.useFakeTimers()
		try {
			const { lane, touches } = makeLane()
			lane.beginQueuedWait("old")
			await vi.advanceTimersByTimeAsync(89 * 60_000) // just inside the 90-min ceiling
			expect(touches.filter((t) => t === "old").length).toBeGreaterThan(0)
			lane.beginQueuedWait("young")
			await vi.advanceTimersByTimeAsync(5 * 60_000) // crosses old's ceiling
			expect(queuedWaiters(lane).has("old")).toBe(false) // lease expired — removed
			const oldTouches = touches.filter((t) => t === "old").length
			await vi.advanceTimersByTimeAsync(60_000)
			expect(touches.filter((t) => t === "old").length).toBe(oldTouches) // never touched again
			expect(queuedWaiters(lane).has("young")).toBe(true) // younger waiter unaffected
			lane.endQueuedWait("young")
		} finally {
			vi.useRealTimers()
		}
	})

	test("lease expiry of the LAST waiter stops the heartbeat timer (no zombie interval)", async () => {
		vi.useFakeTimers()
		try {
			const { lane } = makeLane()
			const timer = () => (lane as unknown as { executionHeartbeatTimer?: unknown }).executionHeartbeatTimer
			lane.beginQueuedWait("solo")
			expect(timer()).toBeDefined()
			await vi.advanceTimersByTimeAsync(95 * 60_000) // past the 90-min ceiling
			// endQueuedWait never fires for a lease-removed entry — the trailing
			// stop check inside the heartbeat is the ONLY path that can clear
			// the interval once the collections empty this way.
			expect(queuedWaiters(lane).size).toBe(0)
			expect(timer()).toBeUndefined()
		} finally {
			vi.useRealTimers()
		}
	})

	test("ownership migrates at mutex enqueue: the queued entry vanishes, the execution wait takes over", async () => {
		const { lane } = makeLane()
		lane.beginQueuedWait("mig-1")
		expect(queuedWaiters(lane).has("mig-1")).toBe(true)
		const holder = await lane.acquireSlot("net-1", undefined, FENCE)
		const waiting = lane.acquireSlot("net-1", "mig-1", FENCE) // enqueue → migration
		await flushMicrotasks()
		expect(queuedWaiters(lane).has("mig-1")).toBe(false) // exactly one owner
		holder.release()
		const granted = (await waiting) as { release: () => void }
		granted.release()
	})

	test("a pre-acquire cancelJob prunes the queued waiter (cap-bypass growth closed)", async () => {
		const { lane, deps } = makeLane({
			operationJournal: {
				getOperation: vi.fn(async (id: string) => ({ id, profileId: "p1", progress: { stage: "queued" } }) as never),
				transitionOperation: vi.fn(async () => ({})),
				touchOperation: vi.fn(async () => {}),
			} as never,
		})
		lane.beginQueuedWait("cancel-1")
		expect(queuedWaiters(lane).has("cancel-1")).toBe(true)
		await lane.cancelJob("cancel-1") // no controller registered — pre-acquire
		expect(queuedWaiters(lane).has("cancel-1")).toBe(false)
		expect(deps.operationJournal.transitionOperation).toHaveBeenCalled()
	})
})

describe("ExecutionLane: the call a record reads by", () => {
	const TOKEN = `0x${"0d".repeat(32)}`
	const CLASS = `0x${"0e".repeat(32)}`
	const FEE = `0x${"0f".repeat(32)}`

	test("beginJournal titles and names the record by one primary of the calls it is given", async () => {
		const createOperation = vi.fn(async (input: unknown) => ({ id: "op-1", ...(input as object) }) as never)
		const { lane } = makeLane({ operationJournal: { createOperation } as never })
		const calls = [
			{ method: "claim_and_end_setup", call: { contract: FEE, argCount: 0 } },
			{ method: "transfer_in_public", call: { contract: TOKEN, argCount: 4 } },
		]
		await lane.beginJournal("net-1", "0xacct", { type: 1, name: "dapp" } as never, calls, FENCE)
		expect(createOperation).toHaveBeenCalledWith(
			expect.objectContaining({ title: "transfer_in_public", call: { contract: TOKEN, argCount: 4 } }),
		)
	})

	test("a build writes the title and the call of its primary in one write, past an unnamed call and a fee call", async () => {
		const setOperationMeta = vi.fn(async () => ({}))
		const { lane, deps } = makeLane({ operationJournal: { setOperationMeta } as never })
		await lane.recordBuiltCall("j1", [
			{ contract: TOKEN, method: "", args: [] },
			{ contract: FEE, method: "sponsor_unconditionally", args: [1], classId: CLASS },
			{ contract: TOKEN, method: "transfer_in_public", args: [1, 2, 3, 4], classId: CLASS },
		])
		expect(setOperationMeta.mock.calls).toEqual([
			["j1", { title: "transfer_in_public", call: { contract: TOKEN, argCount: 4, classId: CLASS } }],
		])
		expect(deps.logDebug).not.toHaveBeenCalled()
	})

	test("the record a build names reads as the settled row of the same calls will", async () => {
		const OTHER = `0x${"0c".repeat(32)}`
		const tokens = [{ contract: TOKEN, classId: CLASS }]
		const transfer = (contract: string, classId: string, args = [1, 2, 3, 4]) => ({
			contract,
			method: "transfer_in_public",
			args,
			classId,
		})
		const lists = [
			[{ contract: FEE, method: "sponsor_unconditionally", args: [1], classId: CLASS }, transfer(TOKEN, CLASS)],
			[{ contract: FEE, method: "sponsor_unconditionally", args: [1], classId: CLASS }],
			[transfer(OTHER, CLASS)],
			[transfer(TOKEN, `0x${"0a".repeat(32)}`)],
			[transfer(TOKEN, CLASS, [1, 2, 3])],
			[{ contract: OTHER, method: "claim", args: [1, 2] }],
			[
				{ contract: TOKEN, method: "approve", args: [1] },
				{ contract: TOKEN, method: "mint_to_public", args: [1, 2], classId: CLASS },
			],
		]
		for (const txCalls of lists) {
			const setOperationMeta = vi.fn(async () => ({}))
			const { lane } = makeLane({ operationJournal: { setOperationMeta } as never })
			await lane.recordBuiltCall("j1", txCalls)
			const [, meta] = setOperationMeta.mock.calls[0] as unknown as [string, Pick<OperationRecord, "title" | "call">]
			const record = { kind: "dapp_execute", ...meta } as OperationRecord
			expect(journalCallTitle(record, tokens)).toBe(getTxTitle(txCalls, tokens))
		}
	})

	test("a refused or unreadable write never fails the send, and logs one fixed line at debug", async () => {
		const setOperationMeta = vi.fn(async () => {
			throw new Error("refused")
		})
		const { lane, deps } = makeLane({ operationJournal: { setOperationMeta } as never })
		await expect(lane.recordBuiltCall("j1", [{ contract: TOKEN, method: "transfer_in_public", args: [] }])).resolves.toBeUndefined()
		await lane.recordBuiltCall("j1", [{ contract: "0xc", method: "transfer_in_public", args: [] }])
		await lane.recordBuiltCall(undefined, [{ contract: TOKEN, method: "transfer_in_public", args: [] }])
		expect(setOperationMeta).toHaveBeenCalledTimes(1)
		expect(vi.mocked(deps.logDebug).mock.calls).toEqual([["journal call not recorded"], ["journal call not recorded"]])
		expect(deps.logError).not.toHaveBeenCalled()
	})
})

describe("ExecutionLane.commitJournal", () => {
	test("writes like markJournal, but a refused write or a missing id rejects instead of logging", async () => {
		const { lane, transitions, deps } = makeLane()
		await lane.commitJournal("j1", { stage: "submitting", txHash: "0xh", submittedEndpointUrl: "https://rpc" })
		expect(transitions).toEqual([["j1", { stage: "submitting", txHash: "0xh", submittedEndpointUrl: "https://rpc" }]])
		const refused = new Error("storage write failed")
		;(deps.operationJournal.transitionOperation as ReturnType<typeof vi.fn>).mockRejectedValueOnce(refused)
		await expect(lane.commitJournal("j1", { stage: "submitting", txHash: "0xh" })).rejects.toBe(refused)
		await expect(lane.commitJournal(undefined, { stage: "submitting", txHash: "0xh" })).rejects.toThrow()
		expect(deps.logError).not.toHaveBeenCalled()
	})
})

describe("ExecutionLane.parkSlot", () => {
	const ORIGIN = "https://dapp.example"
	/** The executor's wait: it ends as the cancel sentinel when the record's controller aborts. */
	const waitUntil = (wake: Promise<void>, controller?: AbortController) => () =>
		new Promise<void>((resolve, reject) => {
			const cancel = () => reject(new JobCancelledSentinel("q-1"))
			if (controller?.signal.aborted) cancel()
			controller?.signal.addEventListener("abort", cancel)
			void wake.then(resolve)
		})

	test("hands the slot on while it waits, keeps its counted place, and re-enters behind the line in its origin's bucket", async () => {
		const { lane } = makeLane()
		const parked = await lane.acquireSlot("net-1", "q-1", FENCE, undefined, ORIGIN)
		const wake = deferred()
		const back = lane.parkSlot(parked.release, "net-1", "q-1", FENCE, parked.preController, ORIGIN, waitUntil(wake.promise))
		const others = Array.from({ length: 7 }, () => lane.acquireSlot("net-1", undefined, FENCE, undefined, ORIGIN))
		const next = await others[0]
		// The parked request still counts: with seven more of its origin, an eighth is refused.
		await expect(lane.acquireSlot("net-1", undefined, FENCE, undefined, ORIGIN)).rejects.toBeInstanceOf(TooManyPendingError)
		wake.resolve()
		let reentered = false
		void back.then(() => {
			reentered = true
		})
		await flushMicrotasks()
		expect(reentered).toBe(false)
		next.release()
		for (const other of others.slice(1)) (await other).release()
		;(await back)()
		expect(reentered).toBe(true)
		expect(lane.isSlotBusy("p1", 7)).toBe(false)
	})

	test("keeps one registered controller and the record vouched for; a silent-path record reads queued while it waits", async () => {
		vi.useFakeTimers()
		try {
			const { lane, touches, deps } = makeLane()
			const register = vi.spyOn(lane, "registerInFlight")
			const parked = await lane.acquireSlot("net-1", "q-1", FENCE, undefined, ORIGIN)
			const wake = deferred()
			const back = lane.parkSlot(parked.release, "net-1", "q-1", FENCE, parked.preController, ORIGIN, waitUntil(wake.promise))
			await vi.advanceTimersByTimeAsync(30_000)
			expect(touches).toContain("q-1")
			expect(deps.operationJournal.transitionIfStage).toHaveBeenCalledWith("q-1", ["pending"], { stage: "queued" })
			expect(controllers(lane).get("q-1")?.controller).toBe(parked.preController)
			wake.resolve()
			const release = await back
			expect(register).toHaveBeenCalledTimes(1)
			const touched = touches.length
			await vi.advanceTimersByTimeAsync(60_000)
			expect(touches.length).toBe(touched)
			release()
		} finally {
			vi.useRealTimers()
		}
	})

	test("runs the wait only once the record's queued write settles", async () => {
		const { lane, deps } = makeLane()
		const parked = await lane.acquireSlot("net-1", "q-1", FENCE, undefined, ORIGIN)
		const written = deferred<unknown>()
		;(deps.operationJournal.transitionIfStage as ReturnType<typeof vi.fn>).mockReturnValueOnce(written.promise)
		const wait = vi.fn(async () => {})
		const back = lane.parkSlot(parked.release, "net-1", "q-1", FENCE, parked.preController, ORIGIN, wait)
		await flushMicrotasks()
		expect(wait).not.toHaveBeenCalled()
		written.resolve({ outcome: "transitioned", record: {} })
		;(await back)()
		expect(wait).toHaveBeenCalledTimes(1)
	})

	/** A journal whose transitions obey the stages the FSM allows from pre-submit. */
	function sessionLane(assertFence: ExecutionLaneDeps["assertFence"]) {
		const stages: Record<string, string> = { "q-1": "queued" }
		const transitionIfStage = vi.fn(async (id: string, allowed: readonly string[], progress: { stage: string }) => {
			if (!allowed.includes(stages[id] ?? "")) return { outcome: "stage", stage: stages[id] }
			stages[id] = progress.stage
			return { outcome: "transitioned", record: {} }
		})
		const transitionOperation = vi.fn(async (id: string, progress: { stage: string }) => {
			if (stages[id] === "cancelled" || stages[id] === "failed") throw new Error("illegal transition")
			stages[id] = progress.stage
		})
		const session = { serial: FENCE.session }
		const harness = makeLane({
			operationJournal: { transitionIfStage, transitionOperation, touchOperation: vi.fn(async () => {}) } as never,
			peekLiveSerial: vi.fn(() => session.serial),
			assertFence,
		})
		return { ...harness, stages, session, transitionIfStage }
	}

	test("a session that ends while parked, sweep first: cancelled, then nothing overwrites it, and the place is given back", async () => {
		const { lane, stages, session, deps } = sessionLane(vi.fn(async () => {}))
		const parked = await lane.acquireSlot("net-1", "q-1", FENCE, undefined, ORIGIN)
		const back = lane.parkSlot(
			parked.release,
			"net-1",
			"q-1",
			FENCE,
			parked.preController,
			ORIGIN,
			waitUntil(new Promise(() => {}), parked.preController),
		)
		session.serial = 2
		await lane.abandonDeadSessions()
		await expect(back).rejects.toBeInstanceOf(JobCancelledSentinel)
		expect(stages["q-1"]).toBe("cancelled")
		expect(controllers(lane).has("q-1")).toBe(false)
		expect(deps.assertFence).toHaveBeenCalledTimes(1)
		const holders = Array.from({ length: 8 }, () => lane.acquireSlot("net-1", undefined, FENCE, undefined, ORIGIN))
		for (const holder of holders) (await holder).release()
	})

	test("a session that ends while parked, fence first: session_ended, and the later sweep finds nothing to cancel", async () => {
		const ended = { now: false }
		const { lane, stages, session, transitionIfStage } = sessionLane(
			vi.fn(async () => {
				if (ended.now) throw new SessionEndedError()
			}),
		)
		const parked = await lane.acquireSlot("net-1", "q-1", FENCE, undefined, ORIGIN)
		const wake = deferred()
		const back = lane.parkSlot(parked.release, "net-1", "q-1", FENCE, parked.preController, ORIGIN, waitUntil(wake.promise))
		ended.now = true
		wake.resolve()
		await expect(back).rejects.toBeInstanceOf(SessionEndedError)
		expect(stages["q-1"]).toBe("failed")
		expect(controllers(lane).has("q-1")).toBe(false)
		session.serial = 2
		await lane.abandonDeadSessions()
		expect(transitionIfStage).not.toHaveBeenCalledWith("q-1", expect.anything(), { stage: "cancelled" })
		expect(stages["q-1"]).toBe("failed")

		// With no record there is nothing to fail; the place is still given back.
		ended.now = false
		const recordless = await lane.acquireSlot("net-1", undefined, FENCE, undefined, ORIGIN)
		ended.now = true
		await expect(
			lane.parkSlot(recordless.release, "net-1", undefined, FENCE, undefined, ORIGIN, async () => {}),
		).rejects.toBeInstanceOf(SessionEndedError)
		ended.now = false
		const holders = Array.from({ length: 8 }, () => lane.acquireSlot("net-1", undefined, FENCE, undefined, ORIGIN))
		for (const holder of holders) (await holder).release()
	})
})

describe("ExecutionLane.joinOriginLine", () => {
	const ORIGIN = "https://dapp.example"

	test("a later send of an origin is behind every earlier one until each starts or ends; another origin or chain never is", async () => {
		const { lane } = makeLane()
		const first = lane.joinOriginLine(FENCE, 7, ORIGIN)
		const second = lane.joinOriginLine(FENCE, 7, ORIGIN)
		const third = lane.joinOriginLine(FENCE, 7, ORIGIN)
		const otherOrigin = lane.joinOriginLine(FENCE, 7, "https://other.example")
		const otherChain = lane.joinOriginLine(FENCE, 8, ORIGIN)
		expect([first.behind(), second.behind(), third.behind(), otherOrigin.behind(), otherChain.behind()]).toEqual([
			false,
			true,
			true,
			false,
			false,
		])
		let thirdFree = false
		const waited = third.earlierDone(new AbortController().signal).then((free) => {
			thirdFree = free
		})
		second.leave()
		await flushMicrotasks()
		expect(thirdFree).toBe(false)
		expect(third.behind()).toBe(true)
		first.leave()
		first.leave()
		await waited
		expect(thirdFree).toBe(true)
		expect(third.behind()).toBe(false)
		third.leave()
	})

	test("an abort ends the wait for earlier sends with false", async () => {
		const { lane } = makeLane()
		const first = lane.joinOriginLine(FENCE, 7, ORIGIN)
		const second = lane.joinOriginLine(FENCE, 7, ORIGIN)
		const abort = new AbortController()
		const waited = second.earlierDone(abort.signal)
		abort.abort()
		expect(await waited).toBe(false)
		expect(second.behind()).toBe(true)
		first.leave()
		second.leave()
	})
})

describe("ExecutionLane.failUnclaimed", () => {
	test("fails only a record still queued or pending, never for a cancel or with no record, and never throws", async () => {
		const { lane, deps } = makeLane()
		const transitionIfStage = deps.operationJournal.transitionIfStage as ReturnType<typeof vi.fn>
		await lane.failUnclaimed("q-1", new Error("fence broke"))
		expect(transitionIfStage).toHaveBeenCalledWith(
			"q-1",
			["queued", "pending"],
			{ stage: "failed" },
			expect.objectContaining({ kind: "dapp_execute" }),
		)
		transitionIfStage.mockClear()
		await lane.failUnclaimed("q-1", new JobCancelledSentinel("q-1"))
		await lane.failUnclaimed(undefined, new Error("no record"))
		expect(transitionIfStage).not.toHaveBeenCalled()
		transitionIfStage.mockRejectedValueOnce(new Error("journal down"))
		await expect(lane.failUnclaimed("q-1", new Error("x"))).resolves.toBeUndefined()
		expect(deps.logError).toHaveBeenCalledTimes(1)
	})
})

describe("ExecutionLane.reclaimParked", () => {
	test.each([
		["a queued record is claimed back", { outcome: "transitioned" }],
		["a record still pending stays", { outcome: "stage", stage: "pending" }],
	])("%s", async (_case, result) => {
		const { lane, deps } = makeLane()
		const transitionIfStage = deps.operationJournal.transitionIfStage as ReturnType<typeof vi.fn>
		transitionIfStage.mockResolvedValueOnce(result)
		await expect(lane.reclaimParked("j-1")).resolves.toBeUndefined()
		expect(transitionIfStage).toHaveBeenCalledWith("j-1", ["queued"], { stage: "pending" })
	})

	test("a cancel that landed first ends the send cancelled; any other stage or a gone record ends it", async () => {
		const { lane, deps } = makeLane()
		const transitionIfStage = deps.operationJournal.transitionIfStage as ReturnType<typeof vi.fn>
		transitionIfStage.mockResolvedValueOnce({ outcome: "stage", stage: "cancelled" })
		await expect(lane.reclaimParked("j-1")).rejects.toBeInstanceOf(JobCancelledSentinel)
		transitionIfStage.mockResolvedValueOnce({ outcome: "stage", stage: "failed" })
		await expect(lane.reclaimParked("j-1")).rejects.toThrow("A waiting dApp send lost its record")
		transitionIfStage.mockResolvedValueOnce({ outcome: "missing" })
		await expect(lane.reclaimParked("j-1")).rejects.toThrow("A waiting dApp send lost its record")
	})
})

describe("ExecutionLane.cancelQuestion", () => {
	const asking = (progress: object) => {
		const transitions: unknown[][] = []
		const harness = makeLane({
			operationJournal: {
				getOperation: vi.fn(async () => ({ id: "j-1", profileId: "p1", progress }) as never),
				transitionOperation: vi.fn(async (...args: unknown[]) => {
					transitions.push(args)
					return {}
				}),
				touchOperation: vi.fn(async () => {}),
			} as never,
		})
		const controller = new AbortController()
		harness.lane.registerInFlight("j-1", FENCE.session, controller)
		return { ...harness, transitions, controller }
	}
	const REASK = { fee: "21", cap: "16", payer: { type: "fj", isProtocol: false } }

	test("cancels a send still asking that figure", async () => {
		const h = asking({ stage: "queued", reask: REASK })
		await h.lane.cancelQuestion("j-1", "21")
		expect(h.transitions.find((t) => t[0] === "j-1")?.[1]).toEqual({ stage: "cancelled" })
		expect(h.controller.signal.aborted).toBe(true)
	})

	test.each([
		["another figure", { stage: "queued", reask: { ...REASK, fee: "25" } }],
		["no question", { stage: "queued" }],
		["a send already past it", { stage: "simulating" }],
	])("leaves a send asking %s", async (_case, progress) => {
		const h = asking(progress)
		await h.lane.cancelQuestion("j-1", "21")
		expect(h.transitions).toEqual([])
		expect(h.controller.signal.aborted).toBe(false)
	})
})
