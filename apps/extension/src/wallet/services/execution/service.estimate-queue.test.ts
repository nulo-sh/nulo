/**
 * A transfer estimate that a send in flight would invalidate, or that would wait behind a proof,
 * answers "queued" before admission: it holds no admission slot and leaves its token unused, so the
 * popup can ask again with it.
 */
import { describe, expect, test, vi } from "vitest"
import { TransferType } from "@/wallet/services/transaction/spec"
import { SendSequencer } from "./send-sequencer"
import { ExecutionService } from "./service"

const SCOPE = { chainId: 7, account: "0xme" }
const KEYS = new Set(["seq:0xtoken:0xme"])

function makeFacade() {
	const sendSequencer = new SendSequencer({ pendingTxs: () => [], sleep: async () => {}, now: () => 0 })
	const admit = vi.fn(async () => new AbortController().signal)
	const estimateFee = vi.fn(async () => ({ maxFee: "1", maxFeeFormatted: "1", gasDetails: {} }))
	const lane = { isSlotBusy: vi.fn(() => false) }
	const facade = Object.assign(Object.create(ExecutionService.prototype), {
		ensureInitialized: async () => {},
		sendSequencer,
		transferExecutor: { sequence: vi.fn(async () => ({ scope: SCOPE, keys: KEYS })), estimateFee },
		profileService: { getActiveProfile: async () => ({ id: "p1" }) },
		lane,
		estimateCancel: { admit, settle: vi.fn() },
	}) as ExecutionService
	const estimate = () => facade.estimateTransferFee("net-1", "0xme", 1, TransferType.Private, "0xyou", 5n, {} as never, "tok-1")
	return { facade, sendSequencer, lane, admit, estimateFee, estimate }
}

describe("ExecutionService.estimateTransferFee while a send holds the transfer's chain state", () => {
	test("answers queued with its token unspent, admitting and estimating nothing", async () => {
		const { sendSequencer, admit, estimateFee, estimate } = makeFacade()
		sendSequencer.enter(SCOPE, KEYS)
		expect(await estimate()).toEqual({ queued: true, tokenSpent: false })
		expect(admit).not.toHaveBeenCalled()
		expect(estimateFee).not.toHaveBeenCalled()
	})

	test("a send holding the slot (proving, so the PXE is busy) answers queued too", async () => {
		const { lane, admit, estimate } = makeFacade()
		lane.isSlotBusy.mockReturnValue(true)
		expect(await estimate()).toEqual({ queued: true, tokenSpent: false })
		expect(lane.isSlotBusy).toHaveBeenCalledWith("p1", 7)
		expect(admit).not.toHaveBeenCalled()
	})

	test("once clear, admits the token and estimates with the transfer's sequence", async () => {
		const { admit, estimateFee, estimate } = makeFacade()
		expect(await estimate()).toMatchObject({ maxFee: "1" })
		expect(admit).toHaveBeenCalledWith("tok-1", "p1", "send")
		expect(estimateFee).toHaveBeenCalledWith(expect.anything(), expect.anything(), { scope: SCOPE, keys: KEYS })
	})
})
