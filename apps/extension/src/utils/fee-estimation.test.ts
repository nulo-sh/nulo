/**
 * The one fee format: amounts at six decimals, half-up; USD only from a usable quote, never a guessed
 * rate; balances truncated at their surface's precision.
 */

import { describe, expect, test } from "vitest"
import { BALANCE_DECIMALS, FEE_READOUT_UNIT, feeDisplay, feeFigure, feeText, formatGasBalance } from "./fee-estimation"

const FJ = 10n ** 18n // 1 Fee Juice (18 decimals)

describe("feeDisplay — the amount", () => {
	test("rounds half-up at the sixth decimal, from the wire's decimal string or a bigint", () => {
		// Truncation would print 3.577823; half-up carries the tail.
		expect(feeDisplay("3577823500000000001", undefined).amount).toBe("3.577824")
		expect(feeDisplay(3577823500000000001n, undefined).amount).toBe("3.577824")
		expect(feeDisplay(3454999999999999n, undefined).amount).toBe("0.003455")
		expect(feeDisplay(3577823499999999999n, undefined).amount).toBe("3.577823")
	})

	test("a zero fee, and one below half a readout unit, print 0", () => {
		expect(feeDisplay(0n, undefined).amount).toBe("0")
		expect(feeDisplay(FEE_READOUT_UNIT / 2n - 1n, undefined).amount).toBe("0")
	})

	test("one readout unit is the last printed digit", () => {
		expect(FEE_READOUT_UNIT).toBe(10n ** 12n)
		expect(feeDisplay(FEE_READOUT_UNIT, undefined).amount).toBe("0.000001")
	})
})

describe("feeDisplay — the USD", () => {
	test("prices a fee at the live rate, half-up to 3 decimals", () => {
		expect(feeDisplay((35n * FJ) / 10n, 0.02).usd).toBe("$0.070")
		expect(feeDisplay(FJ, 0.0147).usd).toBe("$0.015")
	})

	test("a sub-$0.001 fee says so, and a zero fee is $0.000", () => {
		expect(feeDisplay(1n, 0.02).usd).toBe("<$0.001")
		expect(feeDisplay(0n, 0.02).usd).toBe("$0.000")
	})

	test("no usable quote, no USD: absent, zero, negative or not a number", () => {
		for (const usd of [undefined, 0, -1, Number.NaN, Number.POSITIVE_INFINITY]) expect(feeDisplay(FJ, usd).usd).toBeNull()
	})
})

describe("the one fee grammar", () => {
	test("`~X FJ`, then the USD in parentheses only with a quote", () => {
		expect(feeFigure(feeDisplay(FJ, 0.06))).toBe("~1 FJ")
		expect(feeText(feeDisplay(FJ, 0.06))).toBe("~1 FJ ($0.060)")
		expect(feeText(feeDisplay(FJ, undefined))).toBe("~1 FJ")
	})
})

describe("formatGasBalance — per-surface precision, truncated", () => {
	test("Send's precision is the default", () => {
		expect(BALANCE_DECIMALS.send).toBe(4)
		expect(formatGasBalance((421239n * 10n ** 14n).toString())).toBe("42.1239")
		expect(formatGasBalance((99999n * 10n ** 14n).toString())).toBe("9.9999")
	})

	test("Home's precision truncates, never rounds", () => {
		expect(BALANCE_DECIMALS.home).toBe(2)
		expect(formatGasBalance((421239n * 10n ** 14n).toString(), BALANCE_DECIMALS.home)).toBe("42.12")
		expect(formatGasBalance((99n * 10n ** 16n).toString(), BALANCE_DECIMALS.home)).toBe("0.99")
	})
})
