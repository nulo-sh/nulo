import { afterEach, describe, expect, test, vi } from "vitest"
import { chaosSeed, prng } from "../../tests/e2e/fixtures/chaos-seed"

describe("the chaos seed", () => {
	afterEach(() => vi.restoreAllMocks())

	test.each([
		["not a number", "abc"],
		["not a number", "NaN"],
		["another spelling of a number", "0x1f"],
		["another spelling of a number", "1e3"],
		["a number that is no nonnegative integer", "-5"],
		["a number that is no nonnegative integer", "1.5"],
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

// The CI chaos jobs replay these two seeds; a changed generator would map them to other actions.
describe("the chaos PRNG", () => {
	test.each([
		[1095865833, [0.38920108415186405, 0.0987296774983406, 0.4315389657858759, 0.6025572880171239]],
		[1960252198, [0.23286163853481412, 0.7186746371444315, 0.30999295762740076, 0.15680969995446503]],
	])("seed %i draws its recorded first outputs", (seed, expected) => {
		const next = prng(seed)
		expect(expected.map(() => next())).toEqual(expected)
	})
})
