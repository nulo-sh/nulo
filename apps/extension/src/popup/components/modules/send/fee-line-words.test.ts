import { describe, expect, test } from "vitest"
import { QUEUED_FEE_COPY, QUEUED_SPONSORED_COPY, UNVOUCHED_FEE_SENTENCE } from "@/components/composite/send/publish-facts"
import { feeLine, feeLineFigure, feeLineWords } from "./fee-line-words"

const PRICED = { amount: "0.00214", usd: "$0.027" }
const UNPRICED = { amount: "0.00214", usd: null }
const TINY = { amount: "0.0000412", usd: "<$0.001" }

describe("feeLineFigure", () => {
	test("dollars first, the Fee Juice in brackets", () => {
		expect(feeLineFigure(PRICED)).toBe("≈ $0.027 (0.00214 FJ)")
	})

	test("below a tenth of a cent there is nothing to round, so no ≈", () => {
		expect(feeLineFigure(TINY)).toBe("<$0.001 (0.0000412 FJ)")
	})

	test("with no quote the Fee Juice alone", () => {
		expect(feeLineFigure(UNPRICED)).toBe("~0.00214 FJ")
	})
})

describe("feeLineWords", () => {
	test("a paid fee ends with the method that pays it", () => {
		expect(feeLineWords("private_fpc", PRICED)).toEqual({ value: "≈ $0.027 (0.00214 FJ), private Fee Juice", note: null })
		expect(feeLineWords("fj", UNPRICED)).toEqual({ value: "~0.00214 FJ, public Fee Juice", note: null })
	})

	test("sponsored reads Nothing · Sponsored over the sponsor's cost, nothing struck", () => {
		expect(feeLineWords("sponsor", PRICED)).toEqual({ value: "Nothing · Sponsored", note: "The sponsor covers ≈ $0.027 (0.00214 FJ)" })
		expect(feeLineWords("sponsor", TINY).note).toBe("The sponsor covers <$0.001 (0.0000412 FJ)")
	})

	test("sponsored and queued names no cost", () => {
		expect(feeLineWords("sponsor", null, { queued: true })).toEqual({ value: "Nothing · Sponsored", note: QUEUED_SPONSORED_COPY })
	})

	test("a hand-added sponsor's cost is never named", () => {
		expect(feeLineWords("unvouched", PRICED, { name: "My FPC" })).toEqual({ value: "—, My FPC", note: UNVOUCHED_FEE_SENTENCE })
	})
})

describe("feeLine", () => {
	const CAP = { about: PRICED, cap: { amount: "0.004", usd: "$0.05" } }

	test("a known fee reads its words; no payer yet reads —", () => {
		expect(feeLine({ payer: "fj", display: PRICED })).toEqual({
			kind: "words",
			value: "≈ $0.027 (0.00214 FJ), public Fee Juice",
			note: null,
		})
		expect(feeLine({ payer: null, display: PRICED })).toEqual({ kind: "words", value: "—", note: null })
	})

	test("an estimate with no figure yet: the bar, then slow; a failed one says so; a figure outranks both", () => {
		expect(feeLine({ payer: "fj", display: null, estimating: true })).toEqual({ kind: "bar" })
		expect(feeLine({ payer: "fj", display: null, estimating: true, slow: true })).toEqual({ kind: "slow" })
		expect(feeLine({ payer: "fj", display: null, failed: true })).toEqual({ kind: "failed" })
		expect(feeLine({ payer: "fj", display: PRICED, failed: true }).kind).toBe("words")
	})

	test("queued: against its cap, with the sponsor paying, or behind the earlier send, each tagged", () => {
		const queued = { display: null, estimating: true, queued: true }
		expect(feeLine({ ...queued, payer: "private_fpc", queuedCap: CAP })).toEqual({
			kind: "words",
			value: "≈ $0.027 (0.00214 FJ), private Fee Juice",
			note: "Goes out after your earlier send, for at most $0.05 (0.004 FJ).",
			queue: "cap",
		})
		expect(feeLine({ ...queued, payer: "sponsor", queuedSponsored: true })).toEqual({
			kind: "words",
			value: "Nothing · Sponsored",
			note: QUEUED_SPONSORED_COPY,
			queue: "sponsored",
		})
		expect(feeLine({ ...queued, payer: "fj" })).toEqual({ kind: "words", value: QUEUED_FEE_COPY, note: null, queue: "behind" })
	})
})
