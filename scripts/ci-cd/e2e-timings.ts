#!/usr/bin/env bun
/**
 * Rewrites `apps/extension/tests/e2e/shard-timings.json`, the per-file costs the e2e shard
 * sequencer splits by, from CI: for each PR e2e lane, the newest first-attempt green run of each
 * branch among the lane's latest green runs, read from its shard jobs' logs.
 *
 *   bun scripts/ci-cd/e2e-timings.ts
 *
 * Needs a `gh` login that can read the repository's Actions logs. Logs are parsed in memory and
 * never written. It also prints each run's shard spread, which is how a stale record shows.
 */
import { existsSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { stripVTControlCharacters } from "node:util"

export type Suite = "smoke" | "network"
export type Browser = "chrome" | "firefox"
export type Table = Record<string, number>
export type TimingsRecord = { generated: string; runs: Record<string, number[]> } & Record<Suite, Record<Browser, Table>>

const ROOT = join(import.meta.dir, "../..")
const EXTENSION = join(ROOT, "apps/extension")
export const RECORD = join(EXTENSION, "tests/e2e/shard-timings.json")
const LATEST_GREEN_RUNS = 10

export const LANES: readonly { workflow: string; suite: Suite; browser: Browser }[] = [
	{ workflow: "pr-extension-smoke-e2e.yml", suite: "smoke", browser: "chrome" },
	{ workflow: "pr-extension-smoke-e2e-firefox.yml", suite: "smoke", browser: "firefox" },
	{ workflow: "pr-extension-network-e2e.yml", suite: "network", browser: "chrome" },
	{ workflow: "pr-extension-network-e2e-firefox.yml", suite: "network", browser: "firefox" },
]

const SHARD_JOB = /^Run \/ shard (\d+)\/(\d+) \//
const TIMESTAMP = /^\d{4}-\d\d-\d\dT[\d:.]+Z$/
const TEST_FILE = /^tests\/e2e\/[\w./-]+\.test\.ts$/
const REPORTED = /^(\d+)ms$/

type Parsed = { costs: Map<string, number> } | { problem: string }
type Line =
	| { at: number; kind: "banner" }
	| { at: number; kind: "total"; files: number }
	| { at: number; kind: "file"; file: string; reportedMs: number }

function classify(raw: string): Line | { problem: string } | undefined {
	const line = stripVTControlCharacters(raw).trimEnd()
	const space = line.indexOf(" ")
	if (space < 0 || !TIMESTAMP.test(line.slice(0, space))) return undefined
	const at = Date.parse(line.slice(0, space))
	const rest = line.slice(space + 1)
	if (rest.startsWith(" RUN  v")) return { at, kind: "banner" }
	if (rest.startsWith(" Test Files ")) return { at, kind: "total", files: Number(rest.slice(rest.lastIndexOf("(") + 1, -1)) }
	if (!rest.startsWith(" ✓ ") && !rest.startsWith(" ↓ ")) return undefined
	const tokens = rest.trim().split(" ")
	const file = tokens[1]
	if (!TEST_FILE.test(file) || file.split("/").includes("..")) return { problem: `unreadable file path ${JSON.stringify(file)}` }
	// A skipped file prints no duration.
	const reported = REPORTED.exec(tokens[tokens.length - 1])
	return { at, kind: "file", file, reportedMs: reported ? Number(reported[1]) : 0 }
}

/**
 * One shard job's file costs in ms, read from the default reporter's file lines. A file costs the
 * time since the previous file line; the first file's gap holds the global setup, so it costs its
 * reported time capped by that gap. Every cost is a span between the runner's own timestamps, so a
 * line a test prints can move time between files but never add any. A printed file line breaks
 * vitest's file count, and a printed count makes two summaries, so either drops the job.
 * Throws when no file line matches: the reporter's format has changed.
 */
export function parseJobLog(log: string): Parsed {
	const lines = log.split("\n").map(classify)
	const problem = lines.find((line) => line !== undefined && "problem" in line)
	if (problem) return problem as { problem: string }
	const read = lines.filter((line): line is Line => line !== undefined)
	const files = read.filter((line) => line.kind === "file")
	if (files.length === 0) throw new Error("no reporter file line in a shard job's log: has vitest's default reporter changed its format?")
	const totals = read.filter((line) => line.kind === "total")
	if (totals.length !== 1) return { problem: `${totals.length} test-file summaries` }
	const total = totals[0]
	let previous = read.find((line) => line.kind === "banner")?.at ?? Number.NaN
	const costs = new Map<string, number>()
	for (const line of files) {
		const gap = line.at - previous
		if (costs.has(line.file) || !(gap >= 0)) return { problem: `${line.file} reported twice, or before the run banner` }
		costs.set(line.file, costs.size > 0 ? gap : Math.min(line.reportedMs, gap))
		previous = line.at
	}
	if (total.files !== costs.size) return { problem: `${costs.size} file lines against vitest's count of ${total.files}` }
	return { costs }
}

/** One run's costs across its shard jobs, refused when any job is or when a file is in two shards. */
export function runCosts(logs: string[]): Parsed {
	const costs = new Map<string, number>()
	for (const log of logs) {
		const job = parseJobLog(log)
		if ("problem" in job) return job
		for (const [file, ms] of job.costs) {
			if (costs.has(file)) return { problem: `${file} ran in two shards` }
			costs.set(file, ms)
		}
	}
	return { costs }
}

const median = (values: number[]) => {
	const sorted = [...values].sort((a, b) => a - b)
	const mid = sorted.length >> 1
	return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/** Each file's median cost over the runs, in whole seconds, keyed in code-unit order; files gone from disk are dropped. */
export function table(runs: Map<string, number>[], exists: (file: string) => boolean): Table {
	const samples = new Map<string, number[]>()
	for (const run of runs) for (const [file, ms] of run) samples.set(file, [...(samples.get(file) ?? []), ms])
	const files = [...samples.keys()].filter(exists).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
	return Object.fromEntries(files.map((file) => [file, Math.round(median(samples.get(file)!) / 1000)]))
}

/** The newest run of each branch, from candidates listed newest first. */
export function onePerBranch<T extends { headBranch: string }>(candidates: T[]): T[] {
	const newest = new Map<string, T>()
	for (const run of candidates) if (!newest.has(run.headBranch)) newest.set(run.headBranch, run)
	return [...newest.values()]
}

async function gh(...args: string[]): Promise<string> {
	const child = Bun.spawn(["gh", ...args], { stdout: "pipe", stderr: "pipe" })
	const [out, err, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
	if (code !== 0) throw new Error(`gh ${args.join(" ")} failed: ${err.trim()}`)
	return out
}

type Job = { id: number; name: string; conclusion: string; started_at: string; completed_at: string }

/** A run's shard jobs when every index 1..n ran and passed, else undefined. */
function shardJobs(jobs: Job[]): Job[] | undefined {
	const shards = jobs.filter((job) => SHARD_JOB.test(job.name))
	const count = Number(SHARD_JOB.exec(shards[0]?.name ?? "")?.[2])
	const indexes = new Set(shards.map((job) => Number(SHARD_JOB.exec(job.name)![1])))
	const complete = shards.length === count && indexes.size === count && shards.every((job) => job.conclusion === "success")
	return complete ? shards.sort((a, b) => Number(SHARD_JOB.exec(a.name)![1]) - Number(SHARD_JOB.exec(b.name)![1])) : undefined
}

async function laneRuns(workflow: string): Promise<{ id: number; costs: Map<string, number> }[]> {
	const listed = JSON.parse(
		await gh(
			"run",
			"list",
			"--workflow",
			workflow,
			"--status",
			"success",
			"--limit",
			String(LATEST_GREEN_RUNS),
			"--json",
			"databaseId,attempt,headBranch",
		),
	) as { databaseId: number; attempt: number; headBranch: string }[]
	const eligible: { databaseId: number; headBranch: string; shards: Job[] }[] = []
	for (const run of listed.filter((candidate) => candidate.attempt === 1)) {
		const { jobs } = JSON.parse(await gh("api", `repos/{owner}/{repo}/actions/runs/${run.databaseId}/jobs?per_page=100`)) as {
			jobs: Job[]
		}
		const shards = shardJobs(jobs)
		if (shards) eligible.push({ ...run, shards })
	}
	const kept: { id: number; costs: Map<string, number> }[] = []
	for (const run of onePerBranch(eligible)) {
		const logs = await Promise.all(run.shards.map((job) => gh("api", `repos/{owner}/{repo}/actions/jobs/${job.id}/logs`)))
		const result = runCosts(logs)
		if ("problem" in result) {
			console.log(`  run ${run.databaseId} (${run.headBranch}) dropped: ${result.problem}`)
			continue
		}
		kept.push({ id: run.databaseId, costs: result.costs })
		const seconds = run.shards.map((job) => Math.round((Date.parse(job.completed_at) - Date.parse(job.started_at)) / 1000))
		console.log(
			`  run ${run.databaseId} (${run.headBranch}): spread ${Math.max(...seconds) - Math.min(...seconds)} s (${seconds.join(" / ")})`,
		)
	}
	if (kept.length === 0) throw new Error(`${workflow}: no usable run among its latest ${LATEST_GREEN_RUNS} green runs`)
	return kept
}

if (import.meta.main) {
	const record = { generated: new Date().toISOString().slice(0, 10), runs: {}, smoke: {}, network: {} } as TimingsRecord
	for (const lane of LANES) {
		console.log(`${lane.workflow}:`)
		const runs = await laneRuns(lane.workflow)
		record.runs[lane.workflow] = runs.map((run) => run.id)
		record[lane.suite][lane.browser] = table(
			runs.map((run) => run.costs),
			(file) => existsSync(join(EXTENSION, file)),
		)
	}
	writeFileSync(RECORD, `${JSON.stringify(record, null, "\t")}\n`)
	// Biome owns the committed shape (it folds short arrays onto one line), so the record is its output.
	const format = Bun.spawnSync(["bun", "--no-install", join(ROOT, "node_modules/.bin/biome"), "format", "--write", RECORD], {
		stdio: ["ignore", "inherit", "inherit"],
	})
	if (format.exitCode !== 0) throw new Error("biome could not format the record")
	console.log(`wrote ${RECORD.slice(ROOT.length + 1)}`)
}
