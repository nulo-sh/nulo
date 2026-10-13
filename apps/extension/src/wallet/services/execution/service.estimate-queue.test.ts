/**
 * A transfer estimate that a send in flight would invalidate, or that would wait behind a proof,
 * answers "queued" before admission: it holds no admission slot and leaves its token unused, so the
 * popup can ask again with it. The boundary of a send queued against a fee cap sits here too.
 */
import { describe, expect, test, vi } from "vitest"
import { InvalidWalletArgumentsError } from "@nulo/extension-messaging/errors"
import { QueuedFeeAnswers } from "./queued-fee-cap"
import { OriginType, TransferType, type Tx } from "@/wallet/services/transaction/spec"
import { SendSequencer } from "./send-sequencer"
import { ExecutionService } from "./service"

const SCOPE = { chainId: 7, account: "0xme" }
const KEYS = new Set(["seq:0xtoken:0xme"])

/** A Send-page send of the token by `p1` on chain 7, whose recorded fee is `estimatedFee`. */
const sent = (estimatedFee: string, createdAt = 1): Tx =>
	({
		chainId: 7,
		profileId: "p1",
		account: "0xme",
		createdAt,
		estimatedFee,
		origin: { type: OriginType.UI },
		calls: [{ contract: "0xtoken", method: "transfer_private_to_private", args: [] }],
	}) as unknown as Tx

function makeFacade(rows: Tx[] = []) {
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
		tokenService: { getTokenRaw: async () => ({ contract: "0xtoken" }) },
		transactionService: { getTransactions: vi.fn(async () => rows) },
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

	test("a queued answer offers the cap over the last fee of this token's sends, and none without one", async () => {
		const withBasis = makeFacade([sent("4000000000000000000", 1), sent("3577824000000000000", 2)])
		withBasis.sendSequencer.enter(SCOPE, KEYS)
		expect(await withBasis.estimate()).toEqual({
			queued: true,
			tokenSpent: false,
			cap: { basis: "3577824000000000000", cap: "4472280000000000000" },
		})

		const without = makeFacade()
		without.sendSequencer.enter(SCOPE, KEYS)
		expect(await without.estimate()).toEqual({ queued: true, tokenSpent: false })
	})

	test("once clear, admits the token and estimates with the transfer's sequence", async () => {
		const { admit, estimateFee, estimate } = makeFacade()
		expect(await estimate()).toMatchObject({ maxFee: "1" })
		expect(admit).toHaveBeenCalledWith("tok-1", "p1", "send")
		expect(estimateFee).toHaveBeenCalledWith(expect.anything(), expect.anything(), { scope: SCOPE, keys: KEYS })
	})
})

describe("ExecutionService.executeTransfer's fee cap", () => {
	test.each([
		["a number", 1000],
		["a decimal point", "1000.5"],
		["a leading zero", "01000"],
		["40 digits", "1".repeat(40)],
	])("refuses %s before the Terms check, so no proof starts", async (_name, feeCap) => {
		const assertCurrent = vi.fn(async () => {})
		const execute = vi.fn(async () => "0xhash")
		const facade = Object.assign(Object.create(ExecutionService.prototype), {
			ensureInitialized: async () => {},
			legal: { assertCurrent },
			captureFence: async () => ({ profileId: "p1", epoch: 0, session: 1 }),
			transferExecutor: { execute },
		}) as ExecutionService
		const send = (cap: unknown) =>
			facade.executeTransfer("net-1", "0xme", 1, TransferType.Private, "0xyou", 5n, {} as never, undefined, cap as string)
		await expect(send(feeCap)).rejects.toBeInstanceOf(InvalidWalletArgumentsError)
		expect(assertCurrent).not.toHaveBeenCalled()
		await send("1000")
		expect(execute).toHaveBeenCalledWith(expect.anything(), undefined, expect.anything(), "1000")
	})
})

describe("ExecutionService.acceptQueuedFee", () => {
	const ASKING = { id: "j1", profileId: "p1", kind: "transfer", progress: { stage: "queued", reask: { fee: "500", cap: "400" } } }

	function makeAccepting(record: object | undefined) {
		const queuedFeeAnswers = new QueuedFeeAnswers()
		const answer = queuedFeeAnswers.wait("j1", "500", new AbortController().signal, 60_000)
		const facade = Object.assign(Object.create(ExecutionService.prototype), {
			ensureInitialized: async () => {},
			queuedFeeAnswers,
			operationJournal: { getOperation: async () => record },
			profileService: { getActiveProfile: async () => ({ id: "p1" }) },
		}) as ExecutionService
		return { facade, answer }
	}

	test("resumes the active profile's asking transfer at its fee, once", async () => {
		const { facade, answer } = makeAccepting(ASKING)
		expect(await facade.acceptQueuedFee("j1", "500")).toBe(true)
		expect(await facade.acceptQueuedFee("j1", "500")).toBe(false)
		expect(await answer).toBe("accepted")
	})

	test.each([
		["another profile's record", { ...ASKING, profileId: "p2" }, "500"],
		["a record that is not asking", { ...ASKING, progress: { stage: "queued" } }, "500"],
		["a dApp record", { ...ASKING, kind: "dapp_execute" }, "500"],
		["no record", undefined, "500"],
		["a different fee", ASKING, "501"],
	])("resumes nothing for %s", async (_name, record, fee) => {
		const { facade } = makeAccepting(record)
		expect(await facade.acceptQueuedFee("j1", fee)).toBe(false)
	})

	test("refuses a fee that is not a fee amount", async () => {
		const { facade } = makeAccepting(ASKING)
		await expect(facade.acceptQueuedFee("j1", "5e2")).rejects.toBeInstanceOf(InvalidWalletArgumentsError)
	})
})
