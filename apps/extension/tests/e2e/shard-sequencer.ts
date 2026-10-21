import path from "node:path"
import { BaseSequencer, type TestSpecification } from "vitest/node"
import { type BrowserKind, resolveBrowserKind } from "./fixtures/browser/selection.ts"
import timings from "./shard-timings.json" with { type: "json" }

/** Seconds per file, keyed by its path relative to `apps/extension`. */
export type ShardCosts = Readonly<Record<string, number>>
export type Suite = "smoke" | "network"

// Code-unit order, never `localeCompare`: CI splits on Node, the unit tests run on Bun, and both
// must reach the same split.
const byCodeUnit = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

const median = (values: number[]) => {
	const sorted = [...values].sort((a, b) => a - b)
	const mid = sorted.length >> 1
	return sorted.length === 0 ? 0 : sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * Splits `files` into `count` shards of near-equal cost: the record's files longest first, each onto
 * the lightest shard (ties: fewer files, then the lower index), then the files it lacks, by path, at
 * its median cost. The split depends on the set of files and the record only, never their order, so
 * every shard job of a run computes the same one, and each file lands in exactly one shard.
 */
export function assignShards(files: readonly string[], costs: ShardCosts, count: number): string[][] {
	const shards = Array.from({ length: count }, () => ({ total: 0, files: [] as string[] }))
	const place = (file: string, cost: number) => {
		const lightest = shards.reduce((best, shard) =>
			shard.total < best.total || (shard.total === best.total && shard.files.length < best.files.length) ? shard : best,
		)
		lightest.files.push(file)
		lightest.total += cost
	}
	const known = files.filter((file) => Object.hasOwn(costs, file))
	const unknown = files.filter((file) => !Object.hasOwn(costs, file)).sort(byCodeUnit)
	for (const file of known.sort((a, b) => costs[b] - costs[a] || byCodeUnit(a, b))) place(file, costs[file])
	const fallback = median(Object.values(costs))
	for (const file of unknown) place(file, fallback)
	return shards.map((shard) => shard.files)
}

/**
 * The sequencer of one e2e suite: vitest's own, except that `--shard=i/n` takes the i-th of the
 * shards `assignShards` builds from that suite's recorded costs for the browser under test, in
 * place of vitest's split by path hash. The record is `scripts/ci-cd/e2e-timings.ts`'s output.
 */
export function shardSequencer(suite: Suite) {
	const tables: Readonly<Record<BrowserKind, ShardCosts>> = timings[suite]
	return class ShardSequencer extends BaseSequencer {
		override async shard(files: TestSpecification[]): Promise<TestSpecification[]> {
			// Vitest calls shard() only when `--shard` is set.
			const { index, count } = this.ctx.config.shard!
			const paths = files.map((spec) => path.relative(this.ctx.config.root, spec.moduleId).split(path.sep).join("/"))
			const mine = new Set(assignShards(paths, tables[resolveBrowserKind()], count)[index - 1])
			return files.filter((_, i) => mine.has(paths[i]))
		}
	}
}
