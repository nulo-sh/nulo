import { describe, expect, test, vi } from "vitest"
import { EstimateRequeue, estimateWhenClear } from "./estimate-when-clear"

const ESTIMATE = { maxFee: "1" }

describe("estimateWhenClear", () => {
	test("asks again with the same call while queued with an unspent token, then returns the estimate", async () => {
		const ask = vi
			.fn()
			.mockResolvedValueOnce({ queued: true, tokenSpent: false })
			.mockResolvedValueOnce({ queued: true, tokenSpent: false })
			.mockResolvedValueOnce(ESTIMATE)
		const onQueued = vi.fn()
		expect(await estimateWhenClear(ask, new AbortController().signal, { onQueued, pollMs: 1 })).toBe(ESTIMATE)
		expect(ask).toHaveBeenCalledTimes(3)
		expect(onQueued).toHaveBeenCalledTimes(2)
	})

	test("a spent token reports queued, then asks for a fresh estimate instead of asking again", async () => {
		const ask = vi.fn().mockResolvedValue({ queued: true, tokenSpent: true })
		const onQueued = vi.fn()
		await expect(estimateWhenClear(ask, new AbortController().signal, { onQueued, pollMs: 1 })).rejects.toBeInstanceOf(EstimateRequeue)
		expect(ask).toHaveBeenCalledOnce()
		expect(onQueued).toHaveBeenCalledOnce()
	})

	test("an abort stops the polling; a real failure passes through without reporting queued", async () => {
		const controller = new AbortController()
		const ask = vi.fn(async () => {
			controller.abort()
			return { queued: true as const, tokenSpent: false }
		})
		await expect(estimateWhenClear(ask, controller.signal, { pollMs: 60_000 })).rejects.toThrow()
		expect(ask).toHaveBeenCalledOnce()
		const failure = new Error("empty balance")
		const onQueued = vi.fn()
		await expect(estimateWhenClear(() => Promise.reject(failure), new AbortController().signal, { onQueued })).rejects.toBe(failure)
		expect(onQueued).not.toHaveBeenCalled()
	})
})
