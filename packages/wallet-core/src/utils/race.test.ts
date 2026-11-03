import { afterEach, describe, expect, test, vi } from "vitest"
import { collectUnhandledRejections, trackAbortListeners } from "../testing"
import { deferred } from "./deferred"
import { raceAbort, raceTimeout } from "./race"

afterEach(() => {
	vi.useRealTimers()
})

/** Microtask turns from `work` resolving to the line after `wait`'s await. */
async function turnsToResume(wait: (work: Promise<void>) => Promise<unknown>): Promise<number> {
	const work = deferred()
	let turns = 0
	let resumedAt: number | undefined
	const caller = (async () => {
		await wait(work.promise)
		resumedAt = turns
	})()
	work.resolve()
	const tick = () => {
		if (resumedAt !== undefined || turns >= 50) return
		turns++
		queueMicrotask(tick)
	}
	queueMicrotask(tick)
	await caller
	return resumedAt ?? Number.NaN
}

describe("raceTimeout", () => {
	test("work that wins gives its value, leaves no timer and never calls onTimeout", async () => {
		vi.useFakeTimers()
		const onTimeout = vi.fn(() => "late")
		await expect(raceTimeout(Promise.resolve(7), 1_000, onTimeout)).resolves.toBe(7)
		expect(vi.getTimerCount()).toBe(0)
		await vi.advanceTimersByTimeAsync(2_000)
		expect(onTimeout).not.toHaveBeenCalled()
	})

	test("work that rejects first gives its reason and leaves no timer", async () => {
		vi.useFakeTimers()
		const reason = new Error("down")
		await expect(raceTimeout(Promise.reject(reason), 1_000, () => "late")).rejects.toBe(reason)
		expect(vi.getTimerCount()).toBe(0)
	})

	test("a timer that wins gives onTimeout's value, called once", async () => {
		vi.useFakeTimers()
		const onTimeout = vi.fn(() => "late" as const)
		const raced = raceTimeout(new Promise<number>(() => {}), 1_000, onTimeout)
		await vi.advanceTimersByTimeAsync(999)
		expect(onTimeout).not.toHaveBeenCalled()
		await vi.advanceTimersByTimeAsync(1)
		await expect(raced).resolves.toBe("late")
		expect(onTimeout).toHaveBeenCalledOnce()
	})

	test("onTimeout's throw rejects the race, and the work's later rejection stays handled", async () => {
		const work = deferred<number>()
		const expired = new Error("expired")
		const unhandled = await collectUnhandledRejections(async () => {
			const raced = raceTimeout(work.promise, 5, () => {
				throw expired
			})
			await expect(raced).rejects.toBe(expired)
			work.reject(new Error("late failure"))
		})
		expect(unhandled).toEqual([])
	})

	test("a caller resumes on the same turn as with a hand-built race", async () => {
		vi.useFakeTimers()
		const handBuilt = await turnsToResume(async (work) => {
			let timer: ReturnType<typeof setTimeout> | undefined
			const expiry = new Promise<never>((_, reject) => {
				timer = setTimeout(() => reject(new Error("expired")), 1_000)
			})
			try {
				await Promise.race([work, expiry])
			} finally {
				clearTimeout(timer)
			}
		})
		const helper = await turnsToResume(async (work) => {
			await raceTimeout(work, 1_000, () => undefined)
		})
		expect(handBuilt).toBeGreaterThan(0)
		expect(helper).toBe(handBuilt)
		expect(vi.getTimerCount()).toBe(0)
	})
})

describe("raceAbort", () => {
	test.each([
		["fulfils", () => Promise.resolve(1)],
		["rejects", () => Promise.reject(new Error("down"))],
	])("a promise that %s first gives settled and leaves no listener", async (_label, make) => {
		const controller = new AbortController()
		const listeners = trackAbortListeners(controller.signal)
		await expect(raceAbort(make(), controller.signal)).resolves.toBe("settled")
		expect(listeners()).toBe(0)
	})

	test("an abort while the promise is pending gives aborted and leaves no listener", async () => {
		const controller = new AbortController()
		const listeners = trackAbortListeners(controller.signal)
		const raced = raceAbort(new Promise(() => {}), controller.signal)
		expect(listeners()).toBe(1)
		controller.abort()
		await expect(raced).resolves.toBe("aborted")
		expect(listeners()).toBe(0)
	})

	test.each([
		["already aborted", true],
		["aborted while pending", false],
	])("a promise that rejects after the signal was %s gives aborted, with no unhandled rejection", async (_label, abortFirst) => {
		const controller = new AbortController()
		const listeners = trackAbortListeners(controller.signal)
		const work = deferred()
		if (abortFirst) controller.abort()
		const unhandled = await collectUnhandledRejections(async () => {
			const raced = raceAbort(work.promise, controller.signal)
			controller.abort()
			await expect(raced).resolves.toBe("aborted")
			work.reject(new Error("late failure"))
		})
		expect(unhandled).toEqual([])
		expect(listeners()).toBe(0)
	})

	test("a caller resumes on the same turn as with a hand-built settle-or-abort race", async () => {
		const signal = new AbortController().signal
		const handBuilt = await turnsToResume(
			(work) =>
				new Promise<void>((resolve) => {
					const done = () => {
						signal.removeEventListener("abort", done)
						resolve()
					}
					signal.addEventListener("abort", done, { once: true })
					void work.finally(done)
				}),
		)
		const helper = await turnsToResume((work) => raceAbort(work, signal))
		expect(handBuilt).toBeGreaterThan(0)
		expect(helper).toBe(handBuilt)
	})
})
