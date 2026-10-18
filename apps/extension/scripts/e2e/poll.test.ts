import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { PollTimeoutError, pollUntil } from "../../tests/e2e/fixtures/poll"

describe("pollUntil", () => {
	beforeEach(() => vi.useFakeTimers())
	afterEach(() => vi.useRealTimers())

	test("resolves with the first value done accepts, probing once per interval", async () => {
		let n = 0
		const probe = vi.fn(async () => ++n)
		const polled = pollUntil(probe, (v) => v === 3, { label: "three", timeoutMs: 1_000, intervalMs: 100 })

		await vi.advanceTimersByTimeAsync(200)
		await expect(polled).resolves.toBe(3)
		expect(probe).toHaveBeenCalledTimes(3)
	})

	test("throws PollTimeoutError naming the label, the budget and the last value", async () => {
		const polled = pollUntil(
			async () => ({ stage: "proving" }),
			() => false,
			{ label: "the send sealed", timeoutMs: 500, intervalMs: 100 },
		)
		const outcome = polled.catch((error: unknown) => error)

		await vi.advanceTimersByTimeAsync(500)
		const error = await outcome
		expect(error).toBeInstanceOf(PollTimeoutError)
		expect(error).toMatchObject({ label: "the send sealed", timeoutMs: 500, last: { stage: "proving" } })
		expect((error as Error).message).toBe('the send sealed: not within 500 ms; last: {"stage":"proving"}')
	})

	test("a probe's throw ends the poll at once, before the deadline", async () => {
		const probe = vi.fn(async () => {
			throw new Error("dropped")
		})
		const start = Date.now()
		const outcome = pollUntil(probe, () => false, { label: "never", timeoutMs: 10_000, intervalMs: 100 }).catch((e: unknown) => e)

		expect(await outcome).toEqual(new Error("dropped"))
		expect(probe).toHaveBeenCalledOnce()
		expect(Date.now()).toBe(start)
	})

	test("two phases sharing one deadline time out at that deadline", async () => {
		const start = Date.now()
		const deadline = start + 1_000
		let ready = false
		setTimeout(() => {
			ready = true
		}, 300)
		const phases = (async () => {
			await pollUntil(
				async () => ready,
				(v) => v,
				{ label: "phase one", timeoutMs: deadline - Date.now(), intervalMs: 100 },
			)
			return pollUntil(
				async () => false,
				(v) => v,
				{ label: "phase two", timeoutMs: deadline - Date.now(), intervalMs: 100 },
			)
		})().catch((error: unknown) => ({ error, at: Date.now() - start }))

		await vi.advanceTimersByTimeAsync(1_000)
		expect(await phases).toMatchObject({ error: { label: "phase two", timeoutMs: 700 }, at: 1_000 })
	})
})
