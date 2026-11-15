import { describe, expect, test } from "vitest"
import { QUEUED_FEE_COPY, QUEUED_SPONSORED_COPY, UNVOUCHED_FEE_SENTENCE } from "@/components/composite/send/publish-facts"
import { feeText } from "@/utils/fee-estimation"
import { feeLine, feeLineNotes, feeLineWords } from "./fee-line-words"

const PRICED = { amount: "0.00214", usd: "$0.027" }
const UNPRICED = { amount: "0.00214", usd: null }
const TINY = { amount: "0.0000412", usd: "<$0.001" }
const plain = (text: string) => ({ text, figure: null })

describe("feeLineWords", () => {
	test("a paid fee prints in the wallet's one grammar, its dollars when priced, then the method that pays it", () => {
		expect(feeLineWords("private_fpc", PRICED)).toEqual({
			value: { text: "~0.00214 FJ ($0.027), private Fee Juice", figure: "~0.00214 FJ ($0.027)" },
			note: null,
		})
		expect(feeLineWords("fj", TINY).value).toEqual({
			text: "~0.0000412 FJ (<$0.001), public Fee Juice",
			figure: "~0.0000412 FJ (<$0.001)",
		})
	})

	test("no price: the Fee Juice alone, nothing reserved for dollars", () => {
		expect(feeLineWords("fj", UNPRICED).value).toEqual({ text: "~0.00214 FJ, public Fee Juice", figure: "~0.00214 FJ" })
		expect(feeLineWords("sponsor", UNPRICED).note).toEqual({ text: "The sponsor covers ~0.00214 FJ", figure: "~0.00214 FJ" })
	})

	test("every figure is the one helper's", () => {
		for (const display of [PRICED, UNPRICED, TINY]) {
			expect(feeLineWords("private_fpc", display).value.figure).toBe(feeText(display))
			expect(feeLineWords("sponsor", display).note?.figure).toBe(feeText(display))
		}
	})

	test("sponsored reads Nothing · Sponsored over the sponsor's cost with its dollars, nothing struck", () => {
		expect(feeLineWords("sponsor", PRICED)).toEqual({
			value: plain("Nothing · Sponsored"),
			note: { text: "The sponsor covers ~0.00214 FJ ($0.027)", figure: "~0.00214 FJ ($0.027)" },
		})
	})

	test("sponsored and queued names no cost", () => {
		expect(feeLineWords("sponsor", null, { queued: true })).toEqual({
			value: plain("Nothing · Sponsored"),
			note: plain(QUEUED_SPONSORED_COPY),
		})
	})

	test("a hand-added sponsor's cost is never named", () => {
		expect(feeLineWords("unvouched", PRICED, { name: "My FPC" })).toEqual({
			value: plain("—, My FPC"),
			note: plain(UNVOUCHED_FEE_SENTENCE),
		})
	})
})

describe("feeLine", () => {
	const CAP = { about: PRICED, cap: { amount: "0.004", usd: "$0.050" } }

	test("a known fee reads its words; no payer yet reads —", () => {
		expect(feeLine({ payer: "fj", display: PRICED })).toEqual({
			kind: "words",
			value: { text: "~0.00214 FJ ($0.027), public Fee Juice", figure: "~0.00214 FJ ($0.027)" },
			note: null,
		})
		expect(feeLine({ payer: null, display: PRICED })).toEqual({ kind: "words", value: plain("—"), note: null })
	})

	test("an estimate with no figure yet: the bar, then slow; a failed one says so; a figure outranks both", () => {
		expect(feeLine({ payer: "fj", display: null, estimating: true })).toEqual({ kind: "bar" })
		expect(feeLine({ payer: "fj", display: null, estimating: true, slow: true })).toEqual({ kind: "slow" })
		expect(feeLine({ payer: "fj", display: null, failed: true })).toEqual({ kind: "failed" })
		expect(feeLine({ payer: "fj", display: PRICED, failed: true }).kind).toBe("words")
	})

	test("queued: against its cap, both figures with their dollars, with the sponsor paying, or behind the earlier send, each tagged", () => {
		const queued = { display: null, estimating: true, queued: true }
		expect(feeLine({ ...queued, payer: "private_fpc", queuedCap: CAP })).toEqual({
			kind: "words",
			value: { text: "~0.00214 FJ ($0.027), private Fee Juice", figure: "~0.00214 FJ ($0.027)" },
			note: { text: "Goes out after your earlier send, for at most ~0.004 FJ ($0.050).", figure: "~0.004 FJ ($0.050)" },
			queue: "cap",
		})
		expect(feeLine({ ...queued, payer: "sponsor", queuedSponsored: true })).toEqual({
			kind: "words",
			value: plain("Nothing · Sponsored"),
			note: plain(QUEUED_SPONSORED_COPY),
			queue: "sponsored",
		})
		expect(feeLine({ ...queued, payer: "fj" })).toEqual({ kind: "words", value: plain(QUEUED_FEE_COPY), note: null, queue: "behind" })
	})

	test("the notes: the line's own, then the card's notices as it words them", () => {
		const line = feeLine({ payer: "sponsor", display: PRICED })
		expect(feeLineNotes(line, [plain("first")])).toEqual([
			{ text: "The sponsor covers ~0.00214 FJ ($0.027)", figure: "~0.00214 FJ ($0.027)" },
			plain("first"),
		])
	})
})
