import { afterEach, describe, expect, test, vi } from "vitest"
import { chaosSeed } from "../../tests/e2e/fixtures/chaos-seed"

describe("the send-chaos seed", () => {
	afterEach(() => vi.restoreAllMocks())

	test.each([
		["not a number", "abc"],
		["not a number", "NaN"],
		["another spelling of a number", "0x1f"],
		["another spelling of a number", "1e3"],
		["another spelling of a number", "-5"],
		["another spelling of a number", "1.5"],
		["another spelling of a number", " 12"],
		["past the safe integers", "9007199254740992"],
	])("refuses %s: %j", (_, raw) => {
		expect(() => chaosSeed(raw)).toThrow(`NULO_E2E_CHAOS_SEED=${JSON.stringify(raw)} is not a decimal integer seed`)
	})

	test.each(["1095865833", "1960252198", "37919470569", "0", "9007199254740991"])("runs %s as given", (raw) => {
		expect(chaosSeed(raw)).toBe(Number(raw))
	})

	test.each([undefined, ""])("draws a seed below 2^31 when the variable is %j", (raw) => {
		vi.spyOn(Math, "random").mockReturnValue(0.5)
		expect(chaosSeed(raw)).toBe(2 ** 30)
	})
})
