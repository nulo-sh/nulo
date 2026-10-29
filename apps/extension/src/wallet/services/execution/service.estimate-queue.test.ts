/**
 * A transfer estimate that a send in flight would invalidate, or that would wait behind a proof,
 * answers "queued" before admission: it holds no admission slot and leaves its token unused, so the
 * popup can ask again with it. The boundary of a send queued against a fee cap sits here too.
 */
import { describe, expect, test, vi } from "vitest"
import { AccountFeePaymentMethodOptions } from "@aztec-labs/entrypoints/account"
import { InvalidWalletArgumentsError } from "@nulo/extension-messaging/errors"
import type { FeeSettings } from "@nulo/wallet-bridge"
import { QueuedFeeAnswers } from "./queued-fee-cap"
import { OriginType, TransferType, type Tx } from "@/wallet/services/transaction/spec"
import { JobCancelledSentinel } from "@nulo/wallet-core/jobs"
import { ChainTipGate } from "./chain-tip-gate"
import { EstimateCancelRegistry } from "./estimate-cancel-registry"
import { ExecutionLane } from "./execution-lane"
import { SendSequencer } from "./send-sequencer"
import { ExecutionService } from "./service"

const SCOPE = { chainId: 7, account: "0xme" }
const TOKEN_CONTRACT = `0x${"1a".repeat(32)}`
const KEYS = new Set([`seq:${TOKEN_CONTRACT}:0xme`])

/** A Send-page private send of the token by `p1` on chain 7, paid from public Fee Juice at
 *  `priorityLevel`, whose recorded fee is `estimatedFee`. */
const sent = (estimatedFee: string, createdAt = 1, priorityLevel = "urgent"): Tx =>
	({
		chainId: 7,
		profileId: "p1",
		account: "0xme",
		createdAt,
		estimatedFee,
		feePaymentMethod: AccountFeePaymentMethodOptions.PREEXISTING_FEE_JUICE,
		priorityLevel,
		origin: { type: OriginType.UI },
		calls: [
			{
				contract: TOKEN_CONTRACT,
				method: "transfer_private_to_private",
				args: [],
				transfers: [{ type: TransferType.Private, from: "0xme", to: "0xyou" }],
			},
		],
	}) as unknown as Tx

const URGENT_FJ = { paymentMethod: { kind: "fj" }, priorityLevel: "urgent" } as const

function makeFacade(rows: Tx[] = [], feeSpender?: string) {
	const sendSequencer = new SendSequencer({ pendingTxs: () => [], sleep: async () => {}, now: () => 0 })
	const node = { tip: 0, reads: 0 }
	const chainTipGate = new ChainTipGate({
		readTip: async () => {
			node.reads += 1
			return node.tip
		},
		sleep: () => new Promise((r) => setTimeout(r, 0)),
		now: () => 0,
		logDebug: () => {},
	})
	const admit = vi.fn(async () => new AbortController().signal)
	const estimateFee = vi.fn(async () => ({ maxFee: "1", gasDetails: {} }))
	const lane = { isSlotBusy: vi.fn(() => false) }
	const emit = vi.fn()
	const facade = Object.assign(Object.create(ExecutionService.prototype), {
		ensureInitialized: async () => {},
		sendSequencer,
		chainTipGate,
		transferExecutor: { sequence: vi.fn(async () => ({ scope: SCOPE, keys: KEYS, feeSpender })), estimateFee },
		profileService: { getActiveProfile: async () => ({ id: "p1" }) },
		lane,
		estimateCancel: { admit, settle: vi.fn() },
		transactionService: { transactionsOf: vi.fn(async () => rows) },
		emit,
	}) as ExecutionService
	const estimateWith = (feeSettings: FeeSettings) =>
		facade.estimateTransferFee("net-1", "0xme", 1, TOKEN_CONTRACT, TransferType.Private, "0xyou", 5n, feeSettings, "tok-1")
	const estimate = () => estimateWith(URGENT_FJ)
	return { facade, sendSequencer, chainTipGate, node, lane, admit, estimateFee, estimate, estimateWith, emit }
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

	test("a queued answer offers the cap over the last fee of this token's like sends, and none without one", async () => {
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

		// The newest send of the token went at another speed: the older Urgent one is the basis.
		const unlike = makeFacade([sent("3577824000000000000", 1), sent("1000000000000000000", 2, "normal")])
		unlike.sendSequencer.enter(SCOPE, KEYS)
		expect(await unlike.estimate()).toMatchObject({ queued: true, cap: { basis: "3577824000000000000" } })

		// Through a fee contract, the sequence's spender picks its own sends over the sponsor's newer one.
		const viaFpc = (estimatedFee: string, createdAt: number, feeSpender?: string): Tx =>
			({ ...sent(estimatedFee, createdAt), feePaymentMethod: AccountFeePaymentMethodOptions.EXTERNAL, feeSpender }) as Tx
		const privateFpc = makeFacade([viaFpc("3577824000000000000", 1, "0xFPC"), viaFpc("1000000000000000000", 2)], "0xfpc")
		privateFpc.sendSequencer.enter(SCOPE, KEYS)
		const fpcSettings = { paymentMethod: { kind: "fpc", fpcId: "f1" }, priorityLevel: "urgent" } as const
		expect(await privateFpc.estimateWith(fpcSettings)).toMatchObject({ queued: true, cap: { basis: "3577824000000000000" } })

		// A predecessor's block the node lacks queues the send the same way, so it offers the cap too.
		const lagging = makeFacade([sent("3577824000000000000")])
		lagging.chainTipGate.observe({
			hash: "0xtx",
			chainId: 7,
			account: "0xme",
			networkId: "net-1",
			block: { number: 7, hash: "0xb" },
			calls: [{ contract: TOKEN_CONTRACT, method: "swap", args: [] }],
		})
		await new Promise((r) => setTimeout(r, 0))
		expect(await lagging.estimate()).toMatchObject({ queued: true, cap: { cap: "4472280000000000000" } })
	})

	test("a predecessor's block the PXE's node lacks answers queued and reads the tip; once read, it estimates", async () => {
		const { chainTipGate, node, admit, estimateFee, estimate } = makeFacade()
		node.tip = 6
		const swap = { contract: TOKEN_CONTRACT, method: "swap", args: [] }
		chainTipGate.observe({
			hash: "0xtx",
			chainId: 7,
			account: "0xme",
			networkId: "net-1",
			block: { number: 7, hash: "0xb" },
			calls: [swap],
		})
		await new Promise((r) => setTimeout(r, 0))
		const readsBefore = node.reads
		expect(await estimate()).toEqual({ queued: true, tokenSpent: false })
		expect(node.reads).toBe(readsBefore + 1)
		expect(admit).not.toHaveBeenCalled()
		// Each queued answer reads the tip for the popup's next ask.
		node.tip = 7
		expect(await estimate()).toEqual({ queued: true, tokenSpent: false })
		await new Promise((r) => setTimeout(r, 0))
		expect(await estimate()).toMatchObject({ maxFee: "1" })
		expect(estimateFee).toHaveBeenCalledTimes(1)
	})

	test("once clear, admits the token and estimates with the transfer's sequence, reporting its start by token", async () => {
		const { admit, estimateFee, estimate, emit } = makeFacade()
		expect(await estimate()).toMatchObject({ maxFee: "1" })
		expect(admit).toHaveBeenCalledWith("tok-1", "p1", "send")
		expect(estimateFee).toHaveBeenCalledWith(expect.anything(), expect.anything(), { scope: SCOPE, keys: KEYS }, expect.any(Function))
		expect(emit).not.toHaveBeenCalled()
		;((estimateFee.mock.calls[0] as unknown[])[3] as () => void)()
		expect(emit).toHaveBeenCalledExactlyOnceWith("onEstimateStarted", { estimateToken: "tok-1" })
	})
})

describe("ExecutionService.executeTransfer's fee figure", () => {
	function makeFacade() {
		const assertCurrent = vi.fn(async () => {})
		const execute = vi.fn(async () => "0xhash")
		const facade = Object.assign(Object.create(ExecutionService.prototype), {
			ensureInitialized: async () => {},
			legal: { assertCurrent },
			captureFence: async () => ({ profileId: "p1", epoch: 0, session: 1 }),
			transferExecutor: { execute },
		}) as ExecutionService
		const send = (feeCap: unknown, shownFee: unknown) =>
			facade.executeTransfer(
				"net-1",
				"0xme",
				1,
				TOKEN_CONTRACT,
				TransferType.Private,
				"0xyou",
				5n,
				{} as never,
				undefined,
				feeCap as string,
				shownFee as string,
			)
		return { send, assertCurrent, execute }
	}

	test.each([
		["a number", 1000],
		["a decimal point", "1000.5"],
		["a leading zero", "01000"],
		["40 digits", "1".repeat(40)],
	])("refuses %s as either figure before the Terms check, so no proof starts", async (_name, fee) => {
		const { send, assertCurrent, execute } = makeFacade()
		await expect(send(fee, undefined)).rejects.toBeInstanceOf(InvalidWalletArgumentsError)
		await expect(send(undefined, fee)).rejects.toBeInstanceOf(InvalidWalletArgumentsError)
		expect(assertCurrent).not.toHaveBeenCalled()
		expect(execute).not.toHaveBeenCalled()
	})

	test("refuses a cap and a shown fee together: a send is held to one figure", async () => {
		const { send, assertCurrent, execute } = makeFacade()
		await expect(send("1000", "1000")).rejects.toBeInstanceOf(InvalidWalletArgumentsError)
		expect(assertCurrent).not.toHaveBeenCalled()
		expect(execute).not.toHaveBeenCalled()
	})

	test("holds a cap to the cap rule and a shown fee to the estimate rule", async () => {
		const { send, execute } = makeFacade()
		await send("1000", undefined)
		await send(undefined, "1000")
		await send(undefined, undefined)
		expect(execute.mock.calls.map((c) => (c as unknown[])[3])).toEqual([
			{ fee: "1000", rule: "cap" },
			{ fee: "1000", rule: "estimate" },
			undefined,
		])
	})
})

describe("ExecutionService transfer entry points: the token contract", () => {
	function makeEntry() {
		const assertCurrent = vi.fn(async () => {})
		const execute = vi.fn(async () => "0xhash")
		const sequence = vi.fn(async () => ({ scope: SCOPE, keys: KEYS }))
		const facade = Object.assign(Object.create(ExecutionService.prototype), {
			ensureInitialized: async () => {},
			legal: { assertCurrent },
			captureFence: async () => ({ profileId: "p1", epoch: 0, session: 1 }),
			transferExecutor: { execute, sequence },
		}) as ExecutionService
		const send = (contract: unknown) =>
			facade.executeTransfer("net-1", "0xme", 1, contract as string, TransferType.Private, "0xyou", 5n, URGENT_FJ)
		const estimate = (contract: unknown) =>
			facade.estimateTransferFee("net-1", "0xme", 1, contract as string, TransferType.Private, "0xyou", 5n, URGENT_FJ)
		return { send, estimate, assertCurrent, execute, sequence }
	}

	test.each([
		["a short hex string", "0xtoken"],
		["a value at the field modulus or above", `0x${"f".repeat(64)}`],
		["a number", 7],
	])("both refuse %s before anything runs", async (_name, contract) => {
		const { send, estimate, assertCurrent, execute, sequence } = makeEntry()
		await expect(send(contract)).rejects.toBeInstanceOf(InvalidWalletArgumentsError)
		await expect(estimate(contract)).rejects.toBeInstanceOf(InvalidWalletArgumentsError)
		expect(assertCurrent).not.toHaveBeenCalled()
		expect(execute).not.toHaveBeenCalled()
		expect(sequence).not.toHaveBeenCalled()
	})

	test("control: a field address in upper case reaches the executor in its lower-case spelling", async () => {
		const { send, execute } = makeEntry()
		await send(TOKEN_CONTRACT.toUpperCase().replace("0X", "0x"))
		expect(execute).toHaveBeenCalledWith(
			expect.objectContaining({ tokenContract: TOKEN_CONTRACT }),
			undefined,
			expect.anything(),
			undefined,
		)
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

describe("ExecutionService window estimates and previews: the slot of the request's chain", () => {
	const FENCE = { profileId: "p1", epoch: 0, session: 1 }

	function makeWindow() {
		const lane = new ExecutionLane({
			operationJournal: { touchOperation: vi.fn(async () => {}) } as never,
			getActiveProfile: async () => ({ id: "p1" }) as never,
			assertFence: async () => {},
			peekLiveSerial: () => FENCE.session,
			getNetwork: async () => ({ chainId: 7 }) as never,
			logDebug: () => {},
			logInfo: () => {},
			logError: () => {},
		})
		const registry = new EstimateCancelRegistry({ evictStash: () => {}, logDebug: () => {} })
		const runs: { finish: () => void }[] = []
		const running = vi.fn(
			(_op: unknown, ...rest: unknown[]) =>
				new Promise((resolve, reject) => {
					const signal = rest.find((r) => r instanceof AbortSignal) as AbortSignal
					signal.addEventListener("abort", () => reject(new JobCancelledSentinel("tok-1")))
					runs.push({ finish: () => resolve({ maxFee: "1", gasDetails: {}, previewId: "pv-1", discoveredAuthwits: [] }) })
				}),
		)
		const source = {
			materializeStoredOperation: vi.fn(async () => ({ networkId: "net-1" })),
			refusalOf: () => undefined,
			recordRefusal: () => {},
		}
		const facade = Object.assign(Object.create(ExecutionService.prototype), {
			ensureInitialized: async () => {},
			profileService: { getActiveProfile: async () => ({ id: "p1" }) },
			networkService: { getNetwork: async () => ({ chainId: 7 }) },
			services: { get: () => source },
			lane,
			estimateCancel: registry,
			pxeService: { offscreenSettled: () => undefined },
			dappSendExecutor: { estimateOperationFee: running, previewOperationAuthwits: running },
			logDebug: () => {},
			emit: vi.fn(),
		}) as ExecutionService
		const calls = {
			estimateOperationFee: () => facade.estimateOperationFee("ix-1", 0, URGENT_FJ, "tok-1"),
			previewOperationAuthwits: () => facade.previewOperationAuthwits("ix-1", 0, "tok-1"),
		}
		/** A send joining the slot's line, as a dApp send or a Send-page transfer does. */
		const send = () => lane.acquireTransferSlot("net-1", `j-${Math.random()}`, FENCE, new AbortController().signal)
		return { facade, lane, registry, running, runs, calls, send, emit: (facade as unknown as { emit: ReturnType<typeof vi.fn> }).emit }
	}

	const METHODS = ["estimateOperationFee", "previewOperationAuthwits"] as const
	const tick = () => new Promise((r) => setTimeout(r, 0))

	test.each(METHODS)(
		"%s answers queued while a send holds the slot, and the same token runs once it is free, reporting its start",
		async (method) => {
			const { registry, running, runs, calls, send, emit } = makeWindow()
			const release = await send()
			expect(await calls[method]()).toEqual({ queued: true, tokenSpent: false })
			expect(running).not.toHaveBeenCalled()
			expect(registry.unsettledCount("p1")).toBe(0)
			expect(emit).not.toHaveBeenCalled()
			release()
			const answer = calls[method]()
			await tick()
			expect(emit).toHaveBeenCalledExactlyOnceWith("onEstimateStarted", { estimateToken: "tok-1" })
			runs[0]!.finish()
			expect(await answer).toMatchObject({ maxFee: "1" })
			expect(running).toHaveBeenCalledTimes(1)
		},
	)

	test.each(METHODS)("%s answers queued while a send waits for the slot, so it never runs ahead of one", async (method) => {
		const { running, calls, send } = makeWindow()
		const release = await send()
		const waiting = send()
		release()
		expect(await calls[method]()).toEqual({ queued: true, tokenSpent: false })
		expect(running).not.toHaveBeenCalled()
		;(await waiting)()
	})

	test.each(METHODS)("%s holds the slot while it runs: a send arriving meanwhile is granted after it", async (method) => {
		const { lane, runs, calls, send } = makeWindow()
		const answer = calls[method]()
		await tick()
		expect(lane.isSlotBusy("p1", 7)).toBe(true)
		let granted = false
		const sending = send().then((release) => {
			granted = true
			return release
		})
		await tick()
		expect(granted).toBe(false)
		runs[0]!.finish()
		await answer
		;(await sending)()
		expect(granted).toBe(true)
	})

	test.each(METHODS)("%s cancelled while it runs frees the slot for the next send", async (method) => {
		const { facade, lane, calls, send } = makeWindow()
		const answer = calls[method]()
		await tick()
		const sending = send()
		await facade.cancelEstimate("tok-1")
		await expect(answer).rejects.toMatchObject({ name: "JobCancelledError" })
		;(await sending)()
		expect(lane.isSlotBusy("p1", 7)).toBe(false)
	})
})
