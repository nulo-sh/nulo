import { afterEach, describe, expect, test, vi } from "vitest"
import { FpcType } from "@/wallet/services/fpc/spec"
import { OriginType, type Tx } from "@/wallet/services/transaction/spec"
import { isFeeAmount, QueuedFeeAnswers, queuedFeeBasis, queuedFeeCap, queuedFeePayer } from "./queued-fee-cap"

const NOW = 1_000_000
const TOKEN = "0xToken"

/** A Send-page send of TOKEN by `p1` on chain 7. */
function row(overrides: Partial<Tx> = {}): Tx {
	return {
		chainId: 7,
		profileId: "p1",
		account: "0xme",
		createdAt: 10,
		estimatedFee: "3577824000000000000",
		origin: { type: OriginType.UI },
		calls: [{ contract: "0xtoken", method: "transfer_private_to_private", args: [] }],
		...overrides,
	} as Tx
}

const basisOf = (rows: Tx[]) => queuedFeeBasis(rows, "p1", 7, TOKEN, NOW)

describe("queuedFeeBasis", () => {
	test("is the newest valid row's fee, whatever the row order", () => {
		expect(basisOf([row({ createdAt: 30, estimatedFee: "3" }), row({ createdAt: 10, estimatedFee: "1" })])).toBe("3")
		expect(basisOf([row({ createdAt: 10, estimatedFee: "1" }), row({ createdAt: 30, estimatedFee: "3" })])).toBe("3")
	})

	test.each([
		["another profile's", { profileId: "p2" }],
		["an ambiguous", { ambiguous: true }],
		["another chain's", { chainId: 8 }],
		["another token's", { calls: [{ contract: "0xother", method: "transfer", args: [] }] }],
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

describe("isFeeAmount", () => {
	test("takes a positive integer of at most 39 digits, nothing else", () => {
		expect(isFeeAmount("1")).toBe(true)
		expect(isFeeAmount("9".repeat(39))).toBe(true)
		for (const refused of ["0", "01", "1.5", "-1", "1e3", "", " 1", "9".repeat(40), 1, null]) {
			expect(isFeeAmount(refused), String(refused)).toBe(false)
		}
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

	test("a dropped waiter can no longer be accepted", async () => {
		const answers = new QueuedFeeAnswers()
		const answer = answers.wait("j1", "500", new AbortController().signal, 60_000)
		answers.drop("j1")
		expect(answers.accept("j1", "500")).toBe(false)
		expect(await answer).toBe("aborted")
	})
})
