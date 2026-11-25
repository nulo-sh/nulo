import { ImportedAccountUnusableError } from "@nulo/extension-messaging/errors"
import { deferred, EventHandler } from "@nulo/wallet-core/utils"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { effectScope, nextTick } from "vue"
import { useToast } from "@/composables/toast.js"
import type { EstimateStarted, ExecutionServiceClient } from "@/wallet/services/execution/client"
import { TransferType } from "@/wallet/services/transaction/client"
import { useSendEstimate } from "./useSendEstimate"

type Client = Pick<ExecutionServiceClient, "estimateTransferFee" | "cancelEstimate" | "onEstimateStarted">
type Answer = Awaited<ReturnType<ExecutionServiceClient["estimateTransferFee"]>>

const SETTINGS = { type: "fj" } as unknown as Parameters<ExecutionServiceClient["estimateTransferFee"]>[7]
const PARAMS = {
	networkId: "n1",
	accountAddress: "0xa",
	tokenId: 1,
	tokenContract: "0xc",
	transferType: TransferType.Private,
	destination: "0xd",
	amount: 5n,
	settings: SETTINGS,
}
const LANDED = { maxFee: "1000" } as unknown as Answer
const QUEUED_WITH_CAP = { queued: true, tokenSpent: false, cap: { basis: "10", cap: "20" } } as Answer
const QUEUED_SPENT = { queued: true, tokenSpent: true } as Answer
const FAILURE_LABEL = "Couldn't estimate fee. Try again."
const pending = () => new Promise<Answer>(() => {})

function setup() {
	const estimateTransferFee = vi.fn<(...args: unknown[]) => Promise<Answer>>(async () => LANDED)
	const cancelEstimate = vi.fn(async () => {})
	const onEstimateStarted = new EventHandler<EstimateStarted>()
	const executionService = { estimateTransferFee, cancelEstimate, onEstimateStarted } as unknown as Client
	const ready = vi.fn(() => true)
	const params = vi.fn(() => ({ ...PARAMS }))
	const onUnusable = vi.fn()
	const scope = effectScope()
	const estimate = scope.run(() => useSendEstimate({ executionService, instanceId: "abc123", ready, params, onUnusable }))
	if (!estimate) throw new Error("no scope")
	const tokenOf = (call: number) => estimateTransferFee.mock.calls[call]?.[8] as string
	return { estimateTransferFee, cancelEstimate, onEstimateStarted, ready, params, onUnusable, scope, estimate, tokenOf }
}

/** Runs the 0 ms timers: an unmarked start, and the clear of a task's mark. */
const nextTask = () => vi.advanceTimersByTimeAsync(0)

describe("useSendEstimate", () => {
	beforeEach(() => {
		vi.useFakeTimers()
		vi.spyOn(console, "debug").mockImplementation(() => {})
		vi.spyOn(console, "error").mockImplementation(() => {})
	})
	afterEach(() => {
		useToast().closeToast()
		vi.useRealTimers()
		vi.restoreAllMocks()
	})

	test("in a task pauseThisTask marked a request waits 800 ms; unmarked, it starts at the end of its task, with the params", async () => {
		const h = setup()
		h.estimate.pauseThisTask()
		h.estimate.request()
		await vi.advanceTimersByTimeAsync(799)
		expect(h.estimateTransferFee).not.toHaveBeenCalled()
		await vi.advanceTimersByTimeAsync(1)
		expect(h.estimateTransferFee).toHaveBeenCalledExactlyOnceWith("n1", "0xa", 1, "0xc", 0, "0xd", 5n, SETTINGS, expect.any(String))
		expect(console.debug).toHaveBeenCalledWith("[send:abc123] estimateTransferFee firing")
		expect(h.estimate.feeEstimate.value).toEqual(LANDED)
		expect(h.estimate.isEstimating.value).toBe(false)

		// The answer marked its own task; a 0 ms timer set during a fake tick runs 1 ms later.
		await vi.advanceTimersByTimeAsync(1)
		h.estimate.request()
		expect(h.estimateTransferFee).toHaveBeenCalledTimes(1)
		await nextTask()
		expect(h.estimateTransferFee).toHaveBeenCalledTimes(2)
		expect(h.params).toHaveBeenCalledTimes(2)
		h.scope.stop()
	})

	test("startWaiting starts the estimate still waiting its pause after the flush, and creates none", async () => {
		const h = setup()
		h.estimate.pauseThisTask()
		h.estimate.request()
		await vi.advanceTimersByTimeAsync(300)
		expect(h.estimateTransferFee).not.toHaveBeenCalled()
		h.estimate.startWaiting()
		await nextTick()
		expect(h.estimateTransferFee).toHaveBeenCalledTimes(1)
		await vi.advanceTimersByTimeAsync(1000)
		expect(h.estimateTransferFee).toHaveBeenCalledTimes(1)

		h.estimate.startWaiting()
		await nextTick()
		await nextTask()
		expect(h.estimateTransferFee).toHaveBeenCalledTimes(1)
		h.scope.stop()
	})

	test("a form that is not ready cancels: no question, the landed estimate cleared and remote-cancelled", async () => {
		const h = setup()
		h.estimate.request()
		await nextTask()
		expect(h.estimate.feeEstimate.value).toEqual(LANDED)
		const landed = h.tokenOf(0)

		h.ready.mockReturnValue(false)
		h.estimate.request()
		expect(h.estimate.feeEstimate.value).toBeNull()
		expect(h.estimate.isEstimating.value).toBe(false)
		expect(h.cancelEstimate).toHaveBeenCalledExactlyOnceWith(landed)
		await vi.advanceTimersByTimeAsync(1000)
		expect(h.estimateTransferFee).toHaveBeenCalledTimes(1)
		expect(h.params).toHaveBeenCalledTimes(1)
		h.scope.stop()
	})

	test("a failure logs, marks failed and opens one error snack; the next request closes it", async () => {
		const h = setup()
		const boom = new Error("boom")
		h.estimateTransferFee.mockRejectedValueOnce(boom)
		h.estimate.request()
		await nextTask()
		expect(console.error).toHaveBeenCalledWith("[send:abc123] estimateTransferFee failed:", boom)
		expect(h.estimate.estimateFailed.value).toBe(true)
		expect(useToast().toast.value).toMatchObject({ kind: "error", label: FAILURE_LABEL })

		h.estimate.request()
		expect(h.estimate.estimateFailed.value).toBe(false)
		expect(useToast().toast.value).toBeNull()
		h.scope.stop()
	})

	test("the next request leaves a snack that replaced the failure's open", async () => {
		const h = setup()
		h.estimateTransferFee.mockRejectedValueOnce(new Error("boom"))
		h.estimate.request()
		await nextTask()
		useToast().openToast({ kind: "info", label: "another" })

		h.estimate.request()
		expect(h.estimate.estimateFailed.value).toBe(false)
		expect(useToast().toast.value).toMatchObject({ kind: "info", label: "another" })
		h.scope.stop()
	})

	test("a queued answer sets the flag and its cap; the run's start event clears both", async () => {
		const h = setup()
		h.estimateTransferFee.mockResolvedValueOnce(QUEUED_WITH_CAP).mockReturnValueOnce(pending())
		h.estimate.request()
		await nextTask()
		expect(h.estimate.feeQueued.value).toBe(true)
		expect(h.estimate.queuedCap.value).toEqual({ basis: "10", cap: "20" })

		h.onEstimateStarted.invoke({ estimateToken: "another-token" })
		expect(h.estimate.feeQueued.value).toBe(true)
		h.onEstimateStarted.invoke({ estimateToken: h.tokenOf(0) })
		expect(h.estimate.feeQueued.value).toBe(false)
		expect(h.estimate.queuedCap.value).toBeNull()
		h.scope.stop()
	})

	test("a new question clears the queued flag and its cap at once, while the engine stays estimating", async () => {
		const h = setup()
		h.estimateTransferFee.mockResolvedValueOnce(QUEUED_WITH_CAP).mockReturnValue(pending())
		h.estimate.request()
		await nextTask()
		expect(h.estimate.feeQueued.value).toBe(true)

		h.estimate.request()
		expect(h.estimate.isEstimating.value).toBe(true)
		expect(h.estimate.feeQueued.value).toBe(false)
		expect(h.estimate.queuedCap.value).toBeNull()
		h.scope.stop()
	})

	test("a spent token's answer keeps the cap and re-asks the same params with a fresh token after the pause", async () => {
		const h = setup()
		h.estimateTransferFee.mockResolvedValueOnce(QUEUED_WITH_CAP).mockResolvedValueOnce(QUEUED_SPENT).mockReturnValueOnce(pending())
		h.estimate.request()
		await nextTask()
		await vi.advanceTimersByTimeAsync(2_000)
		expect(h.estimateTransferFee).toHaveBeenCalledTimes(2)
		expect(h.estimate.feeQueued.value).toBe(true)
		expect(h.estimate.queuedCap.value).toEqual({ basis: "10", cap: "20" })
		expect(h.estimate.isEstimating.value).toBe(true)

		await vi.advanceTimersByTimeAsync(799)
		expect(h.estimateTransferFee).toHaveBeenCalledTimes(2)
		await vi.advanceTimersByTimeAsync(1)
		expect(h.estimateTransferFee).toHaveBeenCalledTimes(3)
		expect(h.estimateTransferFee.mock.calls[2]?.slice(0, 8)).toEqual(h.estimateTransferFee.mock.calls[0]?.slice(0, 8))
		expect(h.tokenOf(2)).not.toBe(h.tokenOf(0))
		expect(h.params).toHaveBeenCalledTimes(1)
		expect(h.estimate.feeQueued.value).toBe(true)
		expect(h.estimate.estimateFailed.value).toBe(false)
		expect(useToast().toast.value).toBeNull()
		h.scope.stop()
	})

	test("a superseded question's queued answer sets nothing; the current one's does", async () => {
		const h = setup()
		const first = deferred<Answer>()
		const second = deferred<Answer>()
		h.estimateTransferFee.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
		h.estimate.request()
		await nextTask()
		h.estimate.request()
		await nextTask()
		first.resolve(QUEUED_WITH_CAP)
		await vi.advanceTimersByTimeAsync(0)
		expect(h.estimate.feeQueued.value).toBe(false)

		second.resolve(QUEUED_WITH_CAP)
		await vi.advanceTimersByTimeAsync(0)
		expect(h.estimate.feeQueued.value).toBe(true)
		h.scope.stop()
	})

	test("an account whose key does not open calls onUnusable, with no snack, no failure mark and no error line", async () => {
		const h = setup()
		h.estimateTransferFee.mockRejectedValueOnce(new ImportedAccountUnusableError("key does not open"))
		h.estimate.request()
		await nextTask()
		expect(h.onUnusable).toHaveBeenCalledOnce()
		expect(h.estimate.estimateFailed.value).toBe(false)
		expect(useToast().toast.value).toBeNull()
		expect(console.error).not.toHaveBeenCalled()
		h.scope.stop()
	})

	test("the slow clock says slow at 20 s, restarts on each request, and stops once the estimate lands", async () => {
		const h = setup()
		const landing = deferred<Answer>()
		h.estimateTransferFee.mockReturnValueOnce(pending()).mockReturnValueOnce(landing.promise)
		h.estimate.request()
		await vi.advanceTimersByTimeAsync(19_999)
		expect(h.estimate.estimateSlow.value).toBe(false)
		await vi.advanceTimersByTimeAsync(1)
		expect(h.estimate.estimateSlow.value).toBe(true)

		h.estimate.request()
		expect(h.estimate.estimateSlow.value).toBe(false)
		await vi.advanceTimersByTimeAsync(19_999)
		landing.resolve(LANDED)
		await vi.advanceTimersByTimeAsync(1_000)
		expect(h.estimate.feeEstimate.value).toEqual(LANDED)
		expect(h.estimate.estimateSlow.value).toBe(false)
		h.scope.stop()
	})

	test("the queued flag never outlives the estimate: a cancel clears it at the flush", async () => {
		const h = setup()
		h.estimateTransferFee.mockResolvedValueOnce(QUEUED_WITH_CAP).mockReturnValueOnce(pending())
		h.estimate.request()
		await nextTask()
		expect(h.estimate.feeQueued.value).toBe(true)

		h.ready.mockReturnValue(false)
		h.estimate.request()
		expect(h.estimate.feeQueued.value).toBe(true)
		await nextTick()
		expect(h.estimate.feeQueued.value).toBe(false)
		expect(h.estimate.queuedCap.value).toBeNull()
		h.scope.stop()
	})

	test("dispose remote-cancels the estimate it owns and stops the slow clock, though the scope's watchers never flush", async () => {
		const h = setup()
		h.estimateTransferFee.mockReturnValueOnce(pending())
		h.estimate.request()
		await nextTask()
		h.estimate.dispose()
		h.scope.stop()
		expect(h.cancelEstimate).toHaveBeenCalledExactlyOnceWith(h.tokenOf(0))
		expect(h.estimate.isEstimating.value).toBe(false)
		await vi.advanceTimersByTimeAsync(20_000)
		expect(h.estimate.estimateSlow.value).toBe(false)
	})

	test("handoff gives the landed estimate to the send: dispose then sends no remote cancel", async () => {
		const h = setup()
		h.estimate.request()
		await nextTask()
		expect(h.estimate.handoff()).toBe(h.tokenOf(0))
		h.estimate.dispose()
		h.scope.stop()
		expect(h.cancelEstimate).not.toHaveBeenCalled()
	})
})
