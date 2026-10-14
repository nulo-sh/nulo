import { afterEach, describe, expect, test, vi } from "vitest"
import { AccountFeePaymentMethodOptions } from "@aztec-labs/entrypoints/account"
import { FpcType } from "@/wallet/services/fpc/spec"
import { OriginType, TransferType, type Tx, type TxCall } from "@/wallet/services/transaction/spec"
import { QueuedFeeAnswers, type SendShape, queuedFeeBasis, queuedFeeCap, queuedFeePayer, sendShapeOf } from "./queued-fee-cap"

const NOW = 1_000_000
const TOKEN = "0xToken"
const FPC = "0xFpcAddress"

const transfer = (contract: string, type = TransferType.Private): TxCall[] => [
	{ contract, method: "transfer_private_to_private", args: [], transfers: [{ type, from: "0xme", to: "0xyou" } as never] },
]

/** A private send of TOKEN by `p1` on chain 7, paid from public Fee Juice at Urgent. */
function row(overrides: Partial<Tx> = {}): Tx {
	return {
		chainId: 7,
		profileId: "p1",
		account: "0xme",
		createdAt: 10,
		estimatedFee: "3577824000000000000",
		feePaymentMethod: AccountFeePaymentMethodOptions.PREEXISTING_FEE_JUICE,
		priorityLevel: "urgent",
		origin: { type: OriginType.UI },
		calls: transfer("0xtoken"),
		...overrides,
	} as Tx
}

const URGENT_FJ: SendShape = {
	transferType: TransferType.Private,
	feePaymentMethod: AccountFeePaymentMethodOptions.PREEXISTING_FEE_JUICE,
	priorityLevel: "urgent",
}

const basisOf = (rows: Tx[], shape: SendShape = URGENT_FJ) => queuedFeeBasis(rows, "p1", 7, TOKEN, shape, NOW)

describe("queuedFeeBasis", () => {
	test("is the newest valid row's fee, whatever the row order", () => {
		expect(basisOf([row({ createdAt: 30, estimatedFee: "3" }), row({ createdAt: 10, estimatedFee: "1" })])).toBe("3")
		expect(basisOf([row({ createdAt: 10, estimatedFee: "1" }), row({ createdAt: 30, estimatedFee: "3" })])).toBe("3")
	})

	test.each([
		["another profile's", { profileId: "p2" }],
		["an ambiguous", { ambiguous: true }],
		["another chain's", { chainId: 8 }],
		["another token's", { calls: transfer("0xother") }],
		["a dApp's", { origin: { type: OriginType.DAPP, name: "app" } }],
		["a future-dated", { createdAt: NOW + 1 }],
		["a fee-less", { estimatedFee: undefined }],
		["a zero-fee", { estimatedFee: "0" }],
		["a non-decimal-fee", { estimatedFee: "0x10" }],
		["a 40-digit-fee", { estimatedFee: "1".repeat(40) }],
	] as const)("never reads %s row, even when it is the newest", (_name, overrides) => {
		expect(basisOf([row({ createdAt: 5, estimatedFee: "2" }), row({ createdAt: 20, ...overrides } as Partial<Tx>)])).toBe("2")
	})

	test("is none with no valid row", () => {
		expect(basisOf([row({ profileId: "p2" })])).toBeUndefined()
	})

	test.each([
		["another privacy's", { calls: transfer("0xtoken", TransferType.Public) }],
		["another fee method's", { feePaymentMethod: AccountFeePaymentMethodOptions.EXTERNAL }],
		["another fee contract's", { feeSpender: FPC }],
		["another speed's", { priorityLevel: "normal" }],
		["a speedless", { priorityLevel: undefined }],
	] as const)("never reads %s row, even when it is the newest", (_name, overrides) => {
		expect(basisOf([row({ createdAt: 5, estimatedFee: "2" }), row({ createdAt: 20, ...overrides } as Partial<Tx>)])).toBe("2")
	})

	test("a request that names no speed matches a Normal row, and a fee contract matches in any letter case", () => {
		const normal = sendShapeOf({ paymentMethod: { kind: "fj" } }, TransferType.Private, undefined)
		expect(basisOf([row({ priorityLevel: "normal", estimatedFee: "4" })], normal)).toBe("4")
		const viaFpc = sendShapeOf({ paymentMethod: { kind: "fpc", fpcId: "f1" }, priorityLevel: "urgent" }, TransferType.Private, FPC)
		const paid = row({ feePaymentMethod: AccountFeePaymentMethodOptions.EXTERNAL, feeSpender: FPC.toLowerCase(), estimatedFee: "5" })
		expect(basisOf([paid], viaFpc)).toBe("5")
	})
})

describe("sendShapeOf", () => {
	test("records each method as the fee strategy builds it; an app's own payment has no shape", () => {
		const optionOf = (paymentMethod: never) => sendShapeOf({ paymentMethod }, TransferType.Public, undefined)?.feePaymentMethod
		expect(optionOf({ kind: "fj" } as never)).toBe(AccountFeePaymentMethodOptions.PREEXISTING_FEE_JUICE)
		expect(optionOf({ kind: "fjwc", claimAmount: "1", claimSecret: "0x1", messageLeafIndex: "0" } as never)).toBe(
			AccountFeePaymentMethodOptions.FEE_JUICE_WITH_CLAIM,
		)
		expect(optionOf({ kind: "fpc", fpcId: "f1" } as never)).toBe(AccountFeePaymentMethodOptions.EXTERNAL)
		expect(sendShapeOf({ paymentMethod: { kind: "embedded" } }, TransferType.Public, undefined)).toBeUndefined()
	})
})

describe("queuedFeeCap", () => {
	test("adds 25% and rounds down to the readout's six decimals", () => {
		// 3.577824 FJ × 1.25 = 4.47228 exactly; one base unit more still shows and caps at 4.47228.
		expect(queuedFeeCap("3577824000000000000")).toBe("4472280000000000000")
		expect(queuedFeeCap("3577824000000000001")).toBe("4472280000000000000")
		expect(queuedFeeCap("3577824999999999999")).toBe("4472281000000000000")
	})

	test("is none when the cap rounds to 0 or is wider than a fee", () => {
		expect(queuedFeeCap("799999999999")).toBeUndefined()
		expect(queuedFeeCap("9".repeat(39))).toBeUndefined()
	})
})

describe("queuedFeePayer", () => {
	test("names Fee Juice, or the fee contract the send was ordered against", () => {
		expect(queuedFeePayer(undefined)).toEqual({ type: "fj", isProtocol: false })
		const privateFpc = { infoData: { id: "fpc-1", type: FpcType.PrivateFpc, isProtocol: true } } as never
		expect(queuedFeePayer(privateFpc)).toEqual({ type: "private_fpc", fpcId: "fpc-1", isProtocol: true })
		const sponsor = { infoData: { id: "fpc-2", type: FpcType.DefaultSponsoredFpc } } as never
		expect(queuedFeePayer(sponsor)).toEqual({ type: "fpc", fpcId: "fpc-2", isProtocol: false })
	})
})

describe("QueuedFeeAnswers", () => {
	afterEach(() => {
		vi.useRealTimers()
	})

	test("an accept with the waiting fee resumes it once; a stale fee, no waiter or a second accept resumes nothing", async () => {
		const answers = new QueuedFeeAnswers()
		const answer = answers.wait("j1", "500", new AbortController().signal, 60_000)
		expect(answers.accept("j1", "499")).toBe(false)
		expect(answers.accept("j2", "500")).toBe(false)
		expect(answers.accept("j1", "500")).toBe(true)
		expect(answers.accept("j1", "500")).toBe(false)
		expect(await answer).toBe("accepted")
	})

	test("an abort answers aborted, at once when already aborted, and removes the waiter", async () => {
		const answers = new QueuedFeeAnswers()
		const controller = new AbortController()
		const answer = answers.wait("j1", "500", controller.signal, 60_000)
		controller.abort()
		expect(await answer).toBe("aborted")
		expect(answers.accept("j1", "500")).toBe(false)
		expect(await answers.wait("j2", "500", controller.signal, 60_000)).toBe("aborted")
		expect(answers.accept("j2", "500")).toBe(false)
	})

	test("the deadline answers expired and removes the waiter", async () => {
		vi.useFakeTimers()
		const answers = new QueuedFeeAnswers()
		const answer = answers.wait("j1", "500", new AbortController().signal, 1_000)
		vi.advanceTimersByTime(1_000)
		expect(await answer).toBe("expired")
		expect(answers.accept("j1", "500")).toBe(false)
	})

	test("an accept past the deadline, before its timer has fired, expires the waiter instead", async () => {
		vi.useFakeTimers()
		const answers = new QueuedFeeAnswers()
		const answer = answers.wait("j1", "500", new AbortController().signal, 1_000)
		vi.setSystemTime(Date.now() + 1_000)
		expect(answers.accept("j1", "500")).toBe(false)
		expect(await answer).toBe("expired")
	})

	test("a dropped waiter can no longer be accepted", async () => {
		const answers = new QueuedFeeAnswers()
		const answer = answers.wait("j1", "500", new AbortController().signal, 60_000)
		answers.drop("j1")
		expect(answers.accept("j1", "500")).toBe(false)
		expect(await answer).toBe("aborted")
	})
})
