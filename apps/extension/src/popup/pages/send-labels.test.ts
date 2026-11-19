import { describe, expect, test } from "vitest"
import { type SendButtonState, sendButtonLabel } from "./send-labels"

const OFF: SendButtonState = {
	sending: false,
	allowed: false,
	estimating: false,
	amountEmpty: false,
	amountRefused: false,
	feeRefused: false,
}

describe("sendButtonLabel", () => {
	test.each([
		[{ allowed: true }, "Review send"],
		[{ sending: true, allowed: true }, "CONFIRMING"],
		[{ amountEmpty: true }, "Enter an amount"],
		[{ amountRefused: true }, "Fix the amount"],
		[{ feeRefused: true }, "Fix the fee"],
		[{ estimating: true }, "Estimating fee"],
		[{}, "Review send"],
	] as [Partial<SendButtonState>, string][])("%o reads %s", (state, label) => {
		expect(sendButtonLabel({ ...OFF, ...state })).toBe(label)
	})

	test("names the first thing missing in the order a person fixes them", () => {
		expect(sendButtonLabel({ ...OFF, amountEmpty: true, feeRefused: true, estimating: true })).toBe("Enter an amount")
		expect(sendButtonLabel({ ...OFF, amountRefused: true, feeRefused: true })).toBe("Fix the amount")
		expect(sendButtonLabel({ ...OFF, feeRefused: true, estimating: true })).toBe("Fix the fee")
	})
})
