import { describe, expect, test } from "vitest"
import { isFinalRefusal } from "./final-refusal"

describe("isFinalRefusal", () => {
	test.each([
		["Invalid tx: Existing nullifier", true],
		["Invalid tx: Invalid expiration timestamp", true],
		["Invalid tx: ", false],
		["Existing nullifier", false],
		["Invalid tx: Existing nullifier, Insufficient fee payer balance", false],
		["Invalid tx: existing nullifier", false],
		["Invalid tx: Insufficient fee payer balance", false],
		["Invalid tx: Invalid proof", false],
		["Cannot accept tx: node has no connected peers to propagate it", false],
	])("%j → %s", (message, final) => {
		expect(isFinalRefusal(message)).toBe(final)
	})

	test("a record with no message is not one", () => {
		expect(isFinalRefusal(undefined)).toBe(false)
	})
})
