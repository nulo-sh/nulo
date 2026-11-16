import { describe, expect, test } from "vitest"
import { feeAllowsSend, type SendFeeState } from "./send-fee-gate"

describe("feeAllowsSend — the account's own Fee Juice read short of the fee", () => {
	const LIMIT = "4160515300000000000"
	const state = (lastRead?: string): SendFeeState => ({
		queued: false,
		queuedCap: null,
		payer: "self",
		estimate: { maxFee: LIMIT, feeJuiceShortfall: { maxFee: LIMIT, balance: "0", ...(lastRead ? { lastRead } : {}) } },
	})

	test("a shortfall two agreeing reads confirmed refuses the send", () => {
		expect(feeAllowsSend(state())).toBe(false)
	})

	test("a shortfall the reads still disagree on allows it: the node decides at submission", () => {
		expect(feeAllowsSend(state("38163812345678901234"))).toBe(true)
	})
})
