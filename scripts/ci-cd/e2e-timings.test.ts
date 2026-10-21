import { describe, expect, test } from "bun:test"
import { onePerBranch, parseJobLog, runCosts, table } from "./e2e-timings"

// Lines as GitHub stores them: the runner's timestamp, then vitest's coloured default-reporter output.
const ESC = "\u001b"
const at = (second: number) =>
	`2026-10-20T18:${String(47 + Math.floor(second / 60)).padStart(2, "0")}:${String(second % 60).padStart(2, "0")}.0000000Z`
const banner = (second: number) =>
	`${at(second)} ${ESC}[1m${ESC}[30m${ESC}[46m RUN ${ESC}[49m${ESC}[39m${ESC}[22m ${ESC}[36mv4.1.10 ${ESC}[39m${ESC}[90m.${ESC}[39m`
const passed = (second: number, file: string, ms: number) =>
	`${at(second)}  ${ESC}[32m✓${ESC}[39m ${file} ${ESC}[2m(${ESC}[22m${ESC}[2m2 tests${ESC}[22m${ESC}[2m)${ESC}[22m${ESC}[33m ${ms}${ESC}[2mms${ESC}[22m${ESC}[39m`
const skipped = (second: number, file: string) =>
	`${at(second)}  ${ESC}[2m${ESC}[90m↓${ESC}[39m${ESC}[22m ${file} ${ESC}[2m(${ESC}[22m${ESC}[2m1 test${ESC}[22m${ESC}[2m | ${ESC}[22m${ESC}[33m1 skipped${ESC}[39m${ESC}[2m)${ESC}[22m`
const nested = (second: number) =>
	`${at(second)}    ${ESC}[32m✓${ESC}[39m a test inside the file ${ESC}[33m 1200${ESC}[2mms${ESC}[22m${ESC}[39m`
const total = (second: number, files: number) =>
	`${at(second)} ${ESC}[2m Test Files ${ESC}[22m ${ESC}[1m${ESC}[32m${files} passed${ESC}[39m${ESC}[22m${ESC}[90m (${files})${ESC}[39m`

const A = "tests/e2e/a.test.ts"
const B = "tests/e2e/b.test.ts"
const C = "tests/e2e/c.test.ts"

const costsOf = (log: string) => {
	const parsed = parseJobLog(log)
	if ("problem" in parsed) throw new Error(parsed.problem)
	return Object.fromEntries(parsed.costs)
}

describe("parseJobLog", () => {
	test("the first file costs its reported time, later files the gap since the previous file line", () => {
		const log = [
			banner(0),
			"stdout | tests/e2e/a.test.ts > a test",
			nested(40),
			passed(60, A, 10_000),
			passed(80, B, 19_000),
			skipped(81, C),
			total(82, 3),
		]
		expect(costsOf(log.join("\n"))).toEqual({ [A]: 10_000, [B]: 20_000, [C]: 1_000 })
	})

	test("a skipped first file costs nothing, though the global setup ran before it", () => {
		expect(costsOf([banner(0), skipped(50, A), passed(70, B, 19_000), total(71, 2)].join("\n"))).toEqual({ [A]: 0, [B]: 20_000 })
	})

	test("a first file claiming more than its gap costs only the gap", () => {
		expect(costsOf([banner(0), passed(5, A, 999_999_000), total(6, 1)].join("\n"))).toEqual({ [A]: 5_000 })
	})

	test("a printed line beyond vitest's count, or naming a file twice, drops the job", () => {
		const extra = parseJobLog([banner(0), passed(10, A, 9_000), passed(11, C, 1), passed(20, B, 9_000), total(21, 2)].join("\n"))
		const twice = parseJobLog([banner(0), passed(10, A, 9_000), passed(11, A, 1), total(12, 1)].join("\n"))
		expect(extra).toEqual({ problem: "3 file lines against vitest's count of 2" })
		expect(twice).toEqual({ problem: `${A} reported twice, or before the run banner` })
	})

	test("a printed file line with a printed count to match still drops the job", () => {
		const forged = [
			banner(0),
			passed(10, "tests/e2e/network/fee-methods.test.ts", 9_000),
			total(11, 2),
			passed(30, B, 19_000),
			total(31, 1),
		]
		expect(parseJobLog(forged.join("\n"))).toEqual({ problem: "2 test-file summaries" })
	})

	test("a path that leaves tests/e2e drops the job", () => {
		expect(parseJobLog([banner(0), passed(10, "tests/e2e/../../src/x.test.ts", 1), total(11, 1)].join("\n"))).toEqual({
			problem: 'unreadable file path "tests/e2e/../../src/x.test.ts"',
		})
	})

	test("a log with no file line is an error, not an empty job", () => {
		expect(() => parseJobLog([banner(0), total(1, 0)].join("\n"))).toThrow("changed its format")
	})
})

describe("runCosts", () => {
	const job = (...lines: string[]) => [banner(0), ...lines, total(99, lines.length)].join("\n")

	test("joins disjoint shards", () => {
		expect(runCosts([job(passed(10, A, 9_000)), job(passed(20, B, 9_000))])).toEqual({
			costs: new Map([
				[A, 9_000],
				[B, 9_000],
			]),
		})
	})

	test("drops the run when a file is in two shards", () => {
		expect(runCosts([job(passed(10, A, 9_000)), job(passed(20, A, 9_000))])).toEqual({ problem: `${A} ran in two shards` })
	})
})

describe("table", () => {
	test("each file's median in whole seconds, in code-unit order, without files gone from disk", () => {
		const runs = [
			new Map([
				[B, 10_400],
				[A, 1_000],
				[C, 5_000],
			]),
			new Map([[B, 12_600]]),
			new Map([
				[B, 11_000],
				[A, 2_000],
			]),
		]
		const result = table(runs, (file) => file !== C)
		expect(result).toEqual({ [A]: 2, [B]: 11 })
		expect(Object.keys(result)).toEqual([A, B])
	})
})

test("onePerBranch keeps each branch's newest run", () => {
	const runs = [
		{ id: 3, headBranch: "x" },
		{ id: 2, headBranch: "y" },
		{ id: 1, headBranch: "x" },
	]
	expect(onePerBranch(runs).map((run) => run.id)).toEqual([3, 2])
})
