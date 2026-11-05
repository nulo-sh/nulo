import { createPinia, setActivePinia } from "pinia"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { effectScope, nextTick, ref } from "vue"
import { deferred } from "@nulo/wallet-core/utils"
import { usePopupStore } from "@/stores/popup.store"
import type { OperationRecord } from "@/wallet/services/operation-journal/spec"
import { REVIEW_ARM_MS } from "./useSendReview"
import { useReaskReview } from "./useReaskReview"

const FEE = "880000000000000000"
const CAP = "800000000000000000"
const RECIPIENT = `0x${"b".repeat(64)}`

function asking(id = "op-r", progress: Record<string, unknown> = {}): OperationRecord {
	return {
		id,
		kind: "transfer",
		origin: "popup",
		profileId: "p",
		accountAddress: "0xa",
		tokenId: 42,
		amountRaw: "1500000",
		transferType: 0,
		recipientAddress: RECIPIENT,
		error: null,
		terminalAt: null,
		attempts: 0,
		createdAt: 1,
		updatedAt: 1,
		progress: { stage: "queued", reask: { fee: FEE, cap: CAP, payer: { type: "private_fpc", fpcId: "fpc-1", isProtocol: true } } },
		...(Object.keys(progress).length ? { progress } : {}),
	} as unknown as OperationRecord
}

function harness(ops: OperationRecord[] = [asking()]) {
	const rows = ref(ops)
	const usd = ref<number | undefined>(0.0147)
	const acceptQueuedFee = vi.fn<(jobId: string, fee: string) => Promise<unknown>>(async () => true)
	const scope = effectScope()
	const reask = scope.run(() =>
		useReaskReview({
			acceptQueuedFee,
			findOp: (id) => rows.value.find((op) => op.id === id),
			usdRate: () => usd.value,
			amountOf: () => "1.5",
			symbolOf: () => "USDC",
		}),
	)
	if (!reask) throw new Error("no scope")
	return { rows, usd, acceptQueuedFee, reask, popups: usePopupStore(), stop: () => scope.stop() }
}

beforeEach(() => setActivePinia(createPinia()))
afterEach(() => vi.useRealTimers())

describe("useReaskReview — opening", () => {
	test("opens the sheet on what the record holds now, priced at the quote it opens with", () => {
		const h = harness()
		h.reask.open("op-r")
		expect(h.reask.opened.value).toMatchObject({ id: "op-r", fee: FEE, amount: "1.5", symbol: "USDC", recipientAddress: RECIPIENT })
		expect(h.reask.opened.value?.sheet.reask).toEqual({ now: "~0.88 FJ ($0.013)", cap: "~0.8 FJ ($0.012)" })
		expect([h.reask.isOpen.value, h.reask.order.value, h.reask.depth.value]).toEqual([true, 0, 1])
		h.usd.value = 1
		expect(h.reask.opened.value?.sheet.reask.now).toBe("~0.88 FJ ($0.013)")
	})

	test("a job the feed does not show, or a record it cannot draw, opens nothing", () => {
		const h = harness([asking("op-r", { stage: "pending" })])
		h.reask.open("op-missing")
		h.reask.open("op-r")
		expect(h.reask.opened.value).toBeNull()
		expect(h.popups.len).toBe(0)
	})

	test("opening again while open takes the new snapshot and keeps the one slot", () => {
		const h = harness([asking("op-1"), asking("op-2")])
		h.reask.open("op-1")
		h.reask.open("op-2")
		expect(h.reask.opened.value?.id).toBe("op-2")
		expect(h.popups.len).toBe(1)
	})

	test("its place in the popup stack follows what opens over it", () => {
		const h = harness()
		h.reask.open("op-r")
		h.popups.open("other")
		expect([h.reask.order.value, h.reask.depth.value]).toEqual([0, 2])
	})
})

describe("useReaskReview — sending", () => {
	test("accepts the fee it opened with once, a press while sending included, then closes", async () => {
		const h = harness()
		const answer = deferred<boolean>()
		h.acceptQueuedFee.mockReturnValue(answer.promise)
		h.reask.open("op-r")
		const first = h.reask.send()
		void h.reask.send()
		expect(h.reask.sending.value).toBe(true)
		answer.resolve(true)
		await first
		expect(h.acceptQueuedFee.mock.calls).toEqual([["op-r", FEE]])
		expect([h.reask.sending.value, h.reask.isOpen.value]).toEqual([false, false])
		expect(h.reask.opened.value?.id, "stays drawn so focus returns to its row").toBe("op-r")
	})

	test("a refused accept closes the sheet and settles quietly", async () => {
		const h = harness()
		h.acceptQueuedFee.mockRejectedValue(new Error("port closed"))
		h.reask.open("op-r")
		await expect(h.reask.send()).resolves.toBeUndefined()
		expect([h.reask.sending.value, h.reask.isOpen.value]).toEqual([false, false])
	})

	test("with nothing opened, or the sheet closed, a press makes no call", async () => {
		const h = harness()
		await h.reask.send()
		h.reask.open("op-r")
		h.reask.close()
		await h.reask.send()
		expect(h.acceptQueuedFee).not.toHaveBeenCalled()
	})
})

describe("useReaskReview — the record moving under it", () => {
	test("a changed fee closes the sheet; the same fee read again keeps it", async () => {
		const h = harness()
		h.reask.open("op-r")
		h.rows.value = [asking()]
		await nextTick()
		expect(h.reask.isOpen.value).toBe(true)
		h.rows.value = [asking("op-r", { stage: "queued", reask: { fee: "890000000000000000", cap: CAP, payer: { type: "fj" } } })]
		await nextTick()
		expect(h.reask.isOpen.value).toBe(false)
	})

	test("the record leaving the re-ask state, or leaving the feed, closes the sheet", async () => {
		const h = harness()
		h.reask.open("op-r")
		h.rows.value = [asking("op-r", { stage: "pending" })]
		await nextTick()
		expect(h.reask.isOpen.value).toBe(false)

		h.reask.open("op-r")
		expect(h.reask.isOpen.value).toBe(false)
		h.rows.value = [asking()]
		await nextTick()
		h.reask.open("op-r")
		expect(h.reask.isOpen.value).toBe(true)
		h.rows.value = []
		await nextTick()
		expect(h.reask.isOpen.value).toBe(false)
	})
})

describe("useReaskReview — reset and arming", () => {
	test("reset() closes and forgets the snapshot; a send still out keeps sending, blocks the next press and closes the next sheet", async () => {
		const h = harness()
		const answer = deferred<boolean>()
		h.acceptQueuedFee.mockReturnValueOnce(answer.promise)
		h.reask.open("op-r")
		const out = h.reask.send()
		h.reask.reset()
		expect([h.reask.opened.value, h.reask.isOpen.value, h.reask.sending.value]).toEqual([null, false, true])

		h.reask.open("op-r")
		await h.reask.send()
		expect(h.acceptQueuedFee).toHaveBeenCalledTimes(1)
		answer.resolve(true)
		await out
		expect([h.reask.isOpen.value, h.reask.sending.value]).toEqual([false, false])
	})

	test("the button arms only after the usual pause while the sheet is open and on top", async () => {
		vi.useFakeTimers()
		const h = harness()
		h.reask.open("op-r")
		await vi.advanceTimersByTimeAsync(REVIEW_ARM_MS - 1)
		expect(h.reask.ready.value).toBe(false)
		await vi.advanceTimersByTimeAsync(1)
		expect(h.reask.ready.value).toBe(true)
		h.popups.open("other")
		await nextTick()
		expect(h.reask.ready.value).toBe(false)
		h.stop()
	})
})
