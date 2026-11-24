import { describe, expect, test } from "vitest"
import { QUEUED_FEE_COPY, QUEUED_SPONSORED_COPY, UNVOUCHED_FEE_SENTENCE } from "@/utils/fee/publish-facts"
import { feeText } from "@/utils/fee-estimation"
import { feeLine, feeLineNotes, feeLineWords } from "./fee-line-words"

const PRICED = { amount: "0.00214", usd: "$0.027" }
const UNPRICED = { amount: "0.00214", usd: null }
const TINY = { amount: "0.0000412", usd: "<$0.001" }
const plain = (text: string) => ({ text, figure: null })

describe("feeLineWords", () => {
	test("a paid fee is the figure alone, in the wallet's one grammar, its dollars when priced; no figure yet is a dash", () => {
		expect(feeLineWords("private_fpc", PRICED)).toEqual({
			value: { text: "~0.00214 FJ ($0.027)", figure: "~0.00214 FJ ($0.027)" },
			note: null,
		})
		expect(feeLineWords("fj", TINY).value).toEqual({ text: "~0.0000412 FJ (<$0.001)", figure: "~0.0000412 FJ (<$0.001)" })
		expect(feeLineWords("private_fpc", null)).toEqual({ value: plain("—"), note: null })
	})

	test("no price: the Fee Juice alone, nothing reserved for dollars", () => {
		expect(feeLineWords("fj", UNPRICED).value).toEqual({ text: "~0.00214 FJ", figure: "~0.00214 FJ" })
		expect(feeLineWords("sponsor", UNPRICED).note).toEqual({ text: "The sponsor covers ~0.00214 FJ", figure: "~0.00214 FJ" })
	})

	test("every figure is the one helper's", () => {
		for (const display of [PRICED, UNPRICED, TINY]) {
			expect(feeLineWords("private_fpc", display).value.figure).toBe(feeText(display))
			expect(feeLineWords("sponsor", display).note?.figure).toBe(feeText(display))
		}
	})

	test("sponsored reads Nothing over the sponsor's cost with its dollars, nothing struck", () => {
		expect(feeLineWords("sponsor", PRICED)).toEqual({
			value: plain("Nothing"),
			note: { text: "The sponsor covers ~0.00214 FJ ($0.027)", figure: "~0.00214 FJ ($0.027)" },
		})
	})

	test("sponsored and queued names no cost", () => {
		expect(feeLineWords("sponsor", null, { queued: true })).toEqual({
			value: plain("Nothing"),
			note: plain(QUEUED_SPONSORED_COPY),
		})
	})

	test("a hand-added sponsor's cost is never named", () => {
		expect(feeLineWords("unvouched", PRICED)).toEqual({ value: plain("—"), note: plain(UNVOUCHED_FEE_SENTENCE) })
	})
})

describe("feeLine", () => {
	const CAP = { about: PRICED, cap: { amount: "0.004", usd: "$0.050" } }

	test("the second row names who pays as the Fee sheet titles it, a hand-added sponsor by its name; no payer yet, a dash and no method", () => {
		expect(feeLine({ payer: "fj", display: PRICED })).toEqual({
			kind: "words",
			value: { text: "~0.00214 FJ ($0.027)", figure: "~0.00214 FJ ($0.027)" },
			note: null,
			method: "Public Fee Juice",
		})
		expect(feeLine({ payer: "private_fpc", display: null }).method).toBe("Private Fee Juice")
		expect(feeLine({ payer: "sponsor", display: PRICED }).method).toBe("Sponsored")
		expect(feeLine({ payer: "unvouched", payerName: "My FPC", display: PRICED })).toEqual({
			kind: "words",
			value: plain("—"),
			note: plain(UNVOUCHED_FEE_SENTENCE),
			method: "My FPC",
		})
		expect(feeLine({ payer: null, display: PRICED })).toEqual({ kind: "words", value: plain("—"), note: null, method: null })
	})

	test("an estimate with no figure yet: the bar, then slow; a failed one says so; each keeps who pays; a figure outranks both", () => {
		const method = "Public Fee Juice"
		expect(feeLine({ payer: "fj", display: null, estimating: true })).toEqual({ kind: "bar", method })
		expect(feeLine({ payer: "fj", display: null, estimating: true, slow: true })).toEqual({ kind: "slow", method })
		expect(feeLine({ payer: "fj", display: null, failed: true })).toEqual({ kind: "failed", method })
		expect(feeLine({ payer: "fj", display: PRICED, failed: true }).kind).toBe("words")
	})

	test("queued: against its cap, both figures with their dollars, with the sponsor paying, or behind the earlier send, each tagged", () => {
		const queued = { display: null, estimating: true, queued: true }
		expect(feeLine({ ...queued, payer: "private_fpc", queuedCap: CAP })).toEqual({
			kind: "words",
			value: { text: "~0.00214 FJ ($0.027)", figure: "~0.00214 FJ ($0.027)" },
			note: { text: "Goes out after your earlier send, for at most ~0.004 FJ ($0.050).", figure: "~0.004 FJ ($0.050)" },
			queue: "cap",
			method: "Private Fee Juice",
		})
		expect(feeLine({ ...queued, payer: "sponsor", queuedSponsored: true })).toEqual({
			kind: "words",
			value: plain("Nothing"),
			note: plain(QUEUED_SPONSORED_COPY),
			queue: "sponsored",
			method: "Sponsored",
		})
		expect(feeLine({ ...queued, payer: "fj" })).toEqual({
			kind: "words",
			value: plain(QUEUED_FEE_COPY),
			note: null,
			queue: "behind",
			method: "Public Fee Juice",
		})
	})

	test("the notes: the line's own, then the card's notices as it words them", () => {
		const line = feeLine({ payer: "sponsor", display: PRICED })
		expect(feeLineNotes(line, [plain("first")])).toEqual([
			{ text: "The sponsor covers ~0.00214 FJ ($0.027)", figure: "~0.00214 FJ ($0.027)" },
			plain("first"),
		])
	})
})
