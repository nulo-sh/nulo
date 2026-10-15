import { describe, expect, test } from "vitest"
import { type FeeSettingsReaders, type FeeSettings, isPriorityLevel, refuseUnknownPriorities } from "./fee"

describe("isPriorityLevel", () => {
	test.each(["normal", "fast", "urgent"])("%s is a speed level", (level) => {
		expect(isPriorityLevel(level)).toBe(true)
	})

	test.each(["constructor", "toString", "__proto__", "", "Normal", 2])("%j is not", (value) => {
		expect(isPriorityLevel(value)).toBe(false)
	})
})

describe("refuseUnknownPriorities", () => {
	type Methods = { pay(fee: FeeSettings, note: string): void; read(): void }
	const READERS = { pay: ([fee]) => [fee] } satisfies FeeSettingsReaders<Methods>
	const fee = (priorityLevel: unknown) => ({ paymentMethod: { kind: "fj" }, priorityLevel })

	test.each([
		["an unknown name", "bogus"],
		["a prototype name", "constructor"],
		["a non-string", 2],
		["an empty string", ""],
	])("%s is refused as INVALID_PARAMS naming only the method", (_label, level) => {
		expect(() => refuseUnknownPriorities(READERS, "pay", [fee(level), "note"])).toThrow(
			expect.objectContaining({ code: "INVALID_PARAMS", message: "Invalid arguments for wallet method: pay" }),
		)
	})

	test.each([
		["a speed level", [fee("fast"), "note"]],
		["an absent level", [{ paymentMethod: { kind: "fj" } }, "note"]],
		["fee settings that are not an object", ["fj", "note"]],
		["no arguments", []],
	])("%s passes", (_label, params) => {
		expect(() => refuseUnknownPriorities(READERS, "pay", params)).not.toThrow()
	})

	test("a method with no reader is not read", () => {
		expect(() => refuseUnknownPriorities(READERS, "read", [fee("bogus")])).not.toThrow()
		expect(() => refuseUnknownPriorities(READERS, "toString", [fee("bogus")])).not.toThrow()
	})
})
