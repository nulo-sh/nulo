import { describe, expect, test } from "vitest"
import { JobProgressSchema } from "./spec"

describe("JobProgressSchema: a queued send's fee question", () => {
	const reask = {
		fee: "5008954000000000000",
		cap: "4472280000000000000",
		payer: { type: "private_fpc", fpcId: "fpc-1", isProtocol: true },
	}

	test("a queued progress with its question parses, and one without it still does", () => {
		expect(JobProgressSchema.safeParse({ stage: "queued", reask }).success).toBe(true)
		expect(JobProgressSchema.safeParse({ stage: "queued" }).success).toBe(true)
	})

	test.each([
		["a non-decimal fee", { ...reask, fee: "0x10" }],
		["a fractional cap", { ...reask, cap: "4.47" }],
		["an unknown payer", { ...reask, payer: { type: "sponsor", isProtocol: true } }],
	])("refuses %s", (_name, bad) => {
		expect(JobProgressSchema.safeParse({ stage: "queued", reask: bad }).success).toBe(false)
	})
})
