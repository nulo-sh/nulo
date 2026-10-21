// @vitest-environment node
import { globSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, describe, expect, test, vi } from "vitest"
import type { TestSpecification } from "vitest/node"
import { assignShards } from "../../tests/e2e/shard-sequencer.ts"
import timings from "../../tests/e2e/shard-timings.json" with { type: "json" }
import smokeConfig from "../../vitest.e2e.config.ts"
import networkConfig from "../../vitest.e2e.network.config.ts"

const EXTENSION = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const LANE = path.resolve(EXTENSION, "../../.github/workflows/_extension-network-e2e-lane.yml")
const BROWSERS = ["chrome", "firefox"] as const

type Config = typeof smokeConfig
type Sequencer = new (ctx: never) => { shard(files: TestSpecification[]): Promise<TestSpecification[]> }

function selection(config: Config): string[] {
	const excluded = new Set(globSync(config.test?.exclude ?? [], { cwd: EXTENSION }))
	return globSync(config.test?.include ?? [], { cwd: EXTENSION })
		.filter((file) => !excluded.has(file))
		.sort()
}

/** The network pool: the suite less the files the lane's dedicated jobs run, which its shards `--exclude`. */
function pool(files: string[]): string[] {
	const line = readFileSync(LANE, "utf8")
		.split("\n")
		.find((text) => text.trim().startsWith("exclude_files:"))
	const dedicated = new Set(JSON.parse(line!.trim().slice("exclude_files:".length)).split(" "))
	expect(dedicated.size).toBeGreaterThan(0)
	return files.filter((file) => !dedicated.has(file))
}

const spec = (root: string) => (file: string) => ({ moduleId: path.join(root, file) }) as TestSpecification

async function shardsOf(config: Config, specs: TestSpecification[], count: number, root = EXTENSION): Promise<TestSpecification[][]> {
	const Sequencer = config.test?.sequence?.sequencer as unknown as Sequencer
	const shards: TestSpecification[][] = []
	for (let index = 1; index <= count; index++) {
		shards.push(await new Sequencer({ config: { root, shard: { index, count } } } as never).shard(specs))
	}
	return shards
}

const relative = (root: string) => (spec: TestSpecification) => path.relative(root, spec.moduleId)

afterEach(() => {
	vi.unstubAllEnvs()
})

describe.each([
	{ suite: "smoke", config: smokeConfig, count: 3 },
	{ suite: "network", config: networkConfig, count: 5 },
] as const)("the $suite config's sequencer", ({ suite, config, count }) => {
	const files = selection(config)
	const lists: string[][] = suite === "network" ? [files, pool(files)] : [files]

	test.each(BROWSERS)("hands every selected file to exactly one shard on %s", async (browser) => {
		vi.stubEnv("NULO_E2E_BROWSER", browser)
		for (const list of lists) {
			const specs = list.map(spec(EXTENSION))
			const shards = await shardsOf(config, specs, count)
			expect(shards.every((shard) => shard.length > 0)).toBe(true)
			const handed = new Map<TestSpecification, number>(specs.map((one) => [one, 0]))
			for (const one of shards.flat()) handed.set(one, (handed.get(one) ?? Number.NaN) + 1)
			expect(handed.size).toBe(specs.length)
			expect([...handed.values()].every((times) => times === 1)).toBe(true)
		}
	})

	test.each(BROWSERS)("splits by the %s record, each file keyed by its path under the context's root", async (browser) => {
		vi.stubEnv("NULO_E2E_BROWSER", browser)
		const root = path.join(path.sep, "elsewhere", "apps", "extension")
		const handed = (await shardsOf(config, files.map(spec(root)), count, root)).map((shard) => shard.map(relative(root)))
		expect(handed).toEqual(
			assignShards(files, timings[suite][browser], count).map((shard) => files.filter((file) => shard.includes(file))),
		)
	})
})

describe("assignShards", () => {
	test("puts each file, longest first, on the lightest shard", () => {
		expect(assignShards(["a", "b", "c", "d", "e"], { a: 7, b: 5, c: 4, d: 3, e: 1 }, 2)).toEqual([
			["a", "d"],
			["b", "c", "e"],
		])
	})

	test("a file the record lacks goes last, onto the lightest shard; the same file recorded goes where its cost sends it", () => {
		expect(assignShards(["a", "b", "x"], { a: 10, b: 9 }, 2)).toEqual([["a"], ["b", "x"]])
		expect(assignShards(["a", "b", "x"], { a: 10, b: 9, x: 20 }, 2)).toEqual([["x"], ["a", "b"]])
	})

	test("the split ignores the order files arrive in, the record's files and the ones it lacks alike", () => {
		const files = [...Object.keys(timings.network.chrome), "tests/e2e/network/zz-new.test.ts", "tests/e2e/network/aa-new.test.ts"]
		const turned = [...files.slice(40), ...files.slice(0, 40)].reverse()
		expect(assignShards(turned, timings.network.chrome, 5)).toEqual(assignShards(files, timings.network.chrome, 5))
	})

	test("an empty or all-zero record still gives every shard files", () => {
		const files = ["a", "b", "c", "d"]
		for (const costs of [{}, { a: 0, b: 0, c: 0, d: 0 }] as Record<string, number>[]) {
			expect(assignShards(files, costs, 3).map((shard) => shard.length)).toEqual([2, 1, 1])
		}
	})

	test.each([
		["smoke", 3],
		["network", 5],
	] as const)("on the committed %s record, no shard runs longer than another by more than its longest file", (suite, count) => {
		for (const browser of BROWSERS) {
			const costs: Record<string, number> = timings[suite][browser]
			const totals = assignShards(Object.keys(costs), costs, count).map((shard) => shard.reduce((sum, file) => sum + costs[file], 0))
			expect(Math.min(...totals), `${suite}/${browser}`).toBeGreaterThan(0)
			expect(Math.max(...totals) - Math.min(...totals), `${suite}/${browser}`).toBeLessThanOrEqual(Math.max(...Object.values(costs)))
		}
	})
})

test("the committed record holds whole, non-negative seconds for files under each suite's directory", () => {
	for (const [suite, under] of [
		["smoke", /^tests\/e2e\/[\w.-]+\.test\.ts$/],
		["network", /^tests\/e2e\/(network\/[\w./-]+|egress-guard)\.test\.ts$/],
	] as const) {
		for (const browser of BROWSERS) {
			const entries = Object.entries(timings[suite][browser])
			expect(entries.length, `${suite}/${browser}`).toBeGreaterThan(0)
			for (const [file, seconds] of entries) {
				expect(under.test(file) && !file.split("/").includes(".."), file).toBe(true)
				expect(Number.isSafeInteger(seconds) && seconds >= 0, file).toBe(true)
			}
		}
	}
})
