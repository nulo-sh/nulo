import { describe, expect, test, vi } from "vitest"
import { EventHandler } from "@nulo/wallet-core/utils"
import type { EstimateStarted } from "@/wallet/services/execution/spec"
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

	test("each queued answer reaches onQueued as the wallet gave it, its cap included", async () => {
		const capped = { queued: true, tokenSpent: false, cap: { basis: "4", cap: "5" } }
		const ask = vi.fn().mockResolvedValueOnce(capped).mockResolvedValueOnce({ queued: true, tokenSpent: true })
		const onQueued = vi.fn()
		await expect(estimateWhenClear(ask, new AbortController().signal, { onQueued, pollMs: 1 })).rejects.toBeInstanceOf(EstimateRequeue)
		expect(onQueued.mock.calls).toEqual([[capped], [{ queued: true, tokenSpent: true }]])
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

	test("the start of this attempt's run reaches onStarted while it is live; another token's never does, and the watch ends with the call", async () => {
		const events = new EventHandler<EstimateStarted>()
		const onStarted = vi.fn()
		let answer: (value: object) => void = () => {}
		const running = estimateWhenClear(() => new Promise<object>((resolve) => (answer = resolve)), new AbortController().signal, {
			start: { events, estimateToken: "mine", onStarted },
		})
		events.invoke({ estimateToken: "other" })
		expect(onStarted).not.toHaveBeenCalled()
		events.invoke({ estimateToken: "mine" })
		expect(onStarted).toHaveBeenCalledOnce()
		answer(ESTIMATE)
		await running
		events.invoke({ estimateToken: "mine" })
		expect(onStarted).toHaveBeenCalledOnce()
	})

	test("a superseded attempt whose call is still pending ignores its own run's start", async () => {
		const events = new EventHandler<EstimateStarted>()
		const onStarted = vi.fn()
		const controller = new AbortController()
		void estimateWhenClear(() => new Promise<object>(() => {}), controller.signal, {
			start: { events, estimateToken: "old", onStarted },
		})
		controller.abort()
		events.invoke({ estimateToken: "old" })
		expect(onStarted).not.toHaveBeenCalled()
	})
})
