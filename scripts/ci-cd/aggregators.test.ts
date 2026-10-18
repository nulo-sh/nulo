/**
 * Behavioral pin for the aggregators outside the e2e lanes: `quality-status` (pr-quick.yml),
 * actionlint.yml's `Status` and release.yml's `status`, plus release's `attach-assets` guard; for
 * nightly.yml's `status` and its `publish-nightly` guard; and for the four PR e2e lanes, whose
 * `changes` job decides through `e2e-decide.sh` and whose `status` runs `e2e-aggregate.sh` on
 * `toJSON(needs)`, run here wiring and script together, a draft whose diff touches the lane's
 * surface included.
 *
 * Each must fail closed (nightly's `status` aside, held to its own rule below): pass only when every
 * need ended exactly as its own `if:` asks, so a gate that never ran (skipped for the wrong reason,
 * cancelled before a runner, an empty result) reds the check. A text pin cannot show that, so this
 * runs each aggregator's own script with its expressions bound to a world a run can produce: every
 * legitimate world must pass, and any one need ending any other way, or any control output it reads
 * being malformed, must fail.
 *
 * Wired into CI via the root `test:ci-gating` script in `_unit-tests.yml`.
 */
import { describe, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const ROOT = join(import.meta.dir, "..", "..")

/** What `needs.<job>.result` can read: GitHub's four results, and the empty string seen when a job never ran. */
const RESULTS = ["success", "failure", "cancelled", "skipped", ""] as const

/** The value of each expression an aggregator's `env:` binds, keyed by the expression's text. */
type World = Record<string, string>

// biome-ignore lint/suspicious/noExplicitAny: parsed-YAML shape is dynamic.
const workflow = (file: string): any => Bun.YAML.parse(readFileSync(join(ROOT, ".github/workflows", file), "utf8"))

interface Aggregator {
	file: string
	if: unknown
	/** `continue-on-error` on the job, then on the step, and the step's own `if:`: any of them could hide a red script. */
	suppressors: unknown[]
	needs: string[]
	/** Every other job in the workflow: each must be a need, or advisory by name. */
	jobs: string[]
	run: string
	env: Record<string, string>
}

function aggregator(file: string): Aggregator {
	const { jobs } = workflow(file)
	const job = jobs.status
	const steps: { run: string; env?: Record<string, string>; if?: unknown; "continue-on-error"?: unknown }[] = job.steps
	expect(steps, `${file}: the aggregator is one step`).toHaveLength(1)
	return {
		file,
		if: job.if,
		suppressors: [job["continue-on-error"], steps[0]["continue-on-error"], steps[0].if],
		needs: [job.needs].flat(),
		jobs: Object.keys(jobs).filter((name) => name !== "status"),
		run: steps[0].run,
		env: steps[0].env ?? {},
	}
}

/** The one expression an env value holds; a value with anything around it could not be bound from a world. */
function expressionOf(file: string, key: string, value: string): string {
	const match = /^\$\{\{ (.+) \}\}$/.exec(value)
	if (!match) throw new Error(`${file}: env ${key} must be exactly one \${{ }} expression, got ${value}`)
	return match[1]
}

/**
 * Run the script as the runner does: each inline `${{ }}` replaced by its value first, then `bash -e`
 * from the repository root with an environment of only `PATH`, `extra` and the bound `env:`.
 */
function exitCode(agg: Pick<Aggregator, "file" | "run" | "env">, world: World, extra: Record<string, string> = {}): number {
	const worldValue = (expression: string): string => {
		if (!(expression in world)) throw new Error(`${agg.file}: no world value for ${expression}`)
		return world[expression]
	}
	const env: Record<string, string> = { PATH: process.env.PATH ?? "/usr/bin:/bin", ...extra }
	for (const [key, value] of Object.entries(agg.env)) env[key] = worldValue(expressionOf(agg.file, key, value))
	const script = agg.run.replace(/\$\{\{ (.+?) \}\}/g, (_, expression: string) => worldValue(expression))
	return Bun.spawnSync(["bash", "--noprofile", "--norc", "-e", "-c", script], { cwd: ROOT, env, stdout: "ignore", stderr: "ignore" })
		.exitCode
}

/** Every need `success`, except the ones a world's conditions skip. */
const results = (needs: string[], skipped: string[]): World =>
	Object.fromEntries(needs.map((job) => [`needs.${job}.result`, skipped.includes(job) ? "skipped" : "success"]))

const QUALITY = aggregator("pr-quick.yml")
const quality = (event: string, extension: string, landing: string, skipped: string[], base = "dev"): World => ({
	"github.event_name": event,
	"github.base_ref": event === "pull_request" ? base : "",
	"needs.changes.outputs.needs-extension-build": extension,
	"needs.changes.outputs.needs-landing-build": landing,
	...results(QUALITY.needs, skipped),
})

const ACTIONLINT = aggregator("actionlint.yml")
const lint = (workflows: string, shell: string, skipped: string[]): World => ({
	"needs.changes.outputs.workflows": workflows,
	"needs.changes.outputs.shell": shell,
	...results(ACTIONLINT.needs, skipped),
})

const RELEASE = aggregator("release.yml")
const NOT_ASKED = ["network-e2e", "publish-chrome-store", "publish-firefox-amo"]
const STORES = ["publish-chrome-store", "publish-firefox-amo"]
const release = (context: World, skipped: string[]): World => ({
	"github.event_name": "workflow_dispatch",
	"github.event.inputs.run_network_e2e": "",
	"github.event.inputs.publish_chrome": "",
	"github.event.inputs.publish_firefox": "",
	"needs.release-please.outputs.release_created": "",
	"needs.auto-unstick.outputs.unstuck": "",
	"needs.resolve.outputs.is_prerelease": "false",
	"needs.resolve.outputs.on_main": "true",
	"needs.select-assets.outputs.source": "build",
	...context,
	...results(RELEASE.needs, skipped),
})
/** A push never selects: select-assets skips and writes no source. */
const push = (context: World, skipped: string[]): World =>
	release({ "github.event_name": "push", "needs.select-assets.outputs.source": "", ...context }, [...skipped, "select-assets"])
const asked = (value: string): World => ({
	"github.event.inputs.run_network_e2e": value,
	"github.event.inputs.publish_chrome": value,
	"github.event.inputs.publish_firefox": value,
})
const PUSH_WITHOUT_RELEASE = push(
	{
		"needs.auto-unstick.outputs.unstuck": "false",
		"needs.resolve.outputs.is_prerelease": "",
		"needs.resolve.outputs.on_main": "",
	},
	RELEASE.needs.filter((job) => job !== "release-please" && job !== "auto-unstick"),
)
const PUSH_RESCUED = push({ "needs.auto-unstick.outputs.unstuck": "true" }, NOT_ASKED)
const STORE_SUBMISSION = release(asked("true"), ["release-please", "auto-unstick"])
/** A store dispatch on a published release: its own checked bytes are smoked and shipped, so nothing builds. */
const PUBLISHED_SUBMISSION = release({ ...asked("true"), "needs.select-assets.outputs.source": "published" }, [
	"release-please",
	"auto-unstick",
	"build-chrome",
	"build-firefox",
])

const CASES: { file: string; agg: Aggregator; advisory: string[]; worlds: Record<string, World> }[] = [
	{
		file: QUALITY.file,
		agg: QUALITY,
		advisory: ["preview-comment"],
		worlds: {
			"a PR that builds everything": quality("pull_request", "true", "true", ["launch-legal"]),
			"a PR that builds the extension only": quality("pull_request", "true", "false", ["build-landing", "launch-legal"]),
			"a PR that builds nothing": quality("pull_request", "false", "false", [
				"build-chrome",
				"build-firefox",
				"build-landing",
				"build-storybook",
				"launch-legal",
			]),
			"a promote or Release PR into main": quality("pull_request", "true", "true", [], "main"),
			"a manual dispatch": quality("workflow_dispatch", "true", "true", ["commitlint", "launch-legal"]),
		},
	},
	{
		file: ACTIONLINT.file,
		agg: ACTIONLINT,
		advisory: [],
		worlds: {
			"a change to workflows and shell scripts": lint("true", "true", []),
			"a change to workflows only": lint("true", "false", ["shellcheck"]),
			"a change to neither": lint("false", "false", ["actionlint", "shellcheck"]),
		},
	},
	{
		file: RELEASE.file,
		agg: RELEASE,
		advisory: ["release-pr-lockfile", "sync-main-to-dev"],
		worlds: {
			"a push that only refreshes the Release PR": PUSH_WITHOUT_RELEASE,
			"a push release-please tagged": push({ "needs.release-please.outputs.release_created": "true" }, [
				"auto-unstick",
				...NOT_ASKED,
			]),
			"a push the auto-unstick rescued": PUSH_RESCUED,
			"a republish": release(asked("false"), ["release-please", "auto-unstick", ...NOT_ASKED]),
			"a store submission with the network suite": STORE_SUBMISSION,
			"a store submission of a published release's own bytes": PUBLISHED_SUBMISSION,
			"a Chrome store submission alone": release(
				{
					"github.event.inputs.run_network_e2e": "false",
					"github.event.inputs.publish_chrome": "true",
					"github.event.inputs.publish_firefox": "false",
				},
				["release-please", "auto-unstick", "network-e2e", "publish-firefox-amo"],
			),
			"a Firefox store submission with the network suite": release(
				{
					"github.event.inputs.run_network_e2e": "true",
					"github.event.inputs.publish_chrome": "false",
					"github.event.inputs.publish_firefox": "true",
				},
				["release-please", "auto-unstick", "publish-chrome-store"],
			),
			"a prerelease that asked for both stores": release({ ...asked("true"), "needs.resolve.outputs.is_prerelease": "true" }, [
				"release-please",
				"auto-unstick",
				...STORES,
			]),
			"a stable tag off main that asked for both stores": release({ ...asked("true"), "needs.resolve.outputs.on_main": "false" }, [
				"release-please",
				"auto-unstick",
				...STORES,
			]),
		},
	},
]

describe.each(CASES)("$file aggregator", ({ agg, advisory, worlds }) => {
	test("always runs, nothing can hide a red script, and it waits on every job but the advisory ones", () => {
		expect(agg.if).toBe("always()")
		expect(agg.suppressors).toEqual([undefined, undefined, undefined])
		expect([...agg.needs].sort()).toEqual(agg.jobs.filter((job) => !advisory.includes(job)).sort())
	})

	test("binds exactly its needs' results through env, with no expression in its script", () => {
		const bound = Object.entries(agg.env)
			.map(([key, value]) => expressionOf(agg.file, key, value))
			.filter((expression) => /^needs\.[\w-]+\.result$/.test(expression))
		expect(bound.sort()).toEqual(agg.needs.map((job) => `needs.${job}.result`).sort())
		expect(agg.run).not.toContain("${{")
	})

	test.each(Object.entries(worlds))("passes %s", (_, world) => {
		expect(exitCode(agg, world)).toBe(0)
	})

	test.each(Object.entries(worlds))("fails %s once any one need ends otherwise", (_, world) => {
		expectEveryOtherResultFails(agg, world)
	})
})

function expectEveryOtherResultFails(agg: Aggregator, world: World): void {
	for (const job of agg.needs) {
		const key = `needs.${job}.result`
		for (const result of RESULTS.filter((r) => r !== world[key])) {
			expect(exitCode(agg, { ...world, [key]: result }), `${job} '${result}'`).not.toBe(0)
		}
	}
}

// nightly.yml's `status` passes a skipped stage by design: a quiet day skips every gate, and a stage
// behind a red one skips while that one reds the run. So it is held to what it states, against every
// need, and to the exact set it waits on: a job added to the workflow gates the nightly, or is named
// advisory here.
const NIGHTLY = aggregator("nightly.yml")
const NIGHTLY_ADVISORY = ["dup-trend", "rp-host-live", "network-e2e-canary-wasm", "token-list-host-live"]
const NIGHTLY_WORLDS: Record<string, World> = {
	"a green night": results(NIGHTLY.needs, []),
	"a quiet day": results(
		NIGHTLY.needs,
		NIGHTLY.needs.filter((job) => job !== "resolve"),
	),
}

describe("nightly.yml gates", () => {
	test("status always runs, nothing can hide a red script, and it waits on every job but the advisory reports", () => {
		expect(NIGHTLY.if).toBe("always()")
		expect(NIGHTLY.suppressors).toEqual([undefined, undefined, undefined])
		expect([...NIGHTLY.needs].sort()).toEqual(NIGHTLY.jobs.filter((job) => !NIGHTLY_ADVISORY.includes(job)).sort())
	})

	// An advisory job that some gate waited on would decide the publish through that gate.
	test("no job waits on an advisory one", () => {
		const { jobs } = workflow("nightly.yml")
		for (const advisory of NIGHTLY_ADVISORY) {
			expect(jobs[advisory], `${advisory} is a nightly job`).toBeDefined()
			const waiting = Object.keys(jobs).filter((name) => [jobs[name].needs ?? []].flat().includes(advisory))
			expect(waiting, `jobs waiting on ${advisory}`).toEqual([])
		}
	})

	test.each(Object.entries(NIGHTLY_WORLDS))("status passes %s", (_, world) => {
		expect(exitCode(NIGHTLY, world)).toBe(0)
	})

	test.each(Object.entries(NIGHTLY_WORLDS))("status fails %s once any one need fails or is cancelled", (_, world) => {
		for (const job of NIGHTLY.needs) {
			for (const result of ["failure", "cancelled"]) {
				expect(exitCode(NIGHTLY, { ...world, [`needs.${job}.result`]: result }), `${job} '${result}'`).not.toBe(0)
			}
		}
	})

	// Enumerating success, not rejecting failure: a gate that skipped or was cancelled must not publish.
	test("publish-nightly runs only past every gate status reads, each exactly success, never from a cancelled run", () => {
		const { jobs } = workflow("nightly.yml")
		const publish = jobs["publish-nightly"]
		const needs: string[] = [publish.needs].flat()
		const dependents = Object.keys(jobs).filter((name) => [jobs[name].needs ?? []].flat().includes("publish-nightly"))
		expect([...needs].sort()).toEqual(NIGHTLY.needs.filter((job) => job !== "publish-nightly" && !dependents.includes(job)).sort())
		const clauses = String(publish.if)
			.split("&&")
			.map((clause) => clause.trim())
		const expected = [
			"always()",
			"!cancelled()",
			"needs.resolve.outputs.skip != 'true'",
			...needs.map((need) => `needs.${need}.result == 'success'`),
		]
		expect(clauses.sort()).toEqual(expected.sort())
	})
})

// A malformed control output would otherwise decide which stages are due. Each world below is what
// a run really produces with that output malformed: every job whose `if:` compares the output with
// 'true' or 'false' skips, so the world agrees with itself and only the output's own check can fail it.
const RESCUE_CHAIN = RELEASE.needs.filter((job) => job !== "release-please" && job !== "auto-unstick")
test.each([
	[
		"needs.changes.outputs.needs-extension-build",
		QUALITY,
		quality("pull_request", "true", "true", ["launch-legal"]),
		["build-chrome", "build-firefox", "build-storybook"],
	],
	["needs.changes.outputs.needs-landing-build", QUALITY, quality("pull_request", "true", "true", ["launch-legal"]), ["build-landing"]],
	["needs.changes.outputs.workflows", ACTIONLINT, lint("true", "true", []), ["actionlint"]],
	["needs.changes.outputs.shell", ACTIONLINT, lint("true", "true", []), ["shellcheck"]],
	["needs.auto-unstick.outputs.unstuck", RELEASE, PUSH_WITHOUT_RELEASE, []],
	["needs.auto-unstick.outputs.unstuck", RELEASE, PUSH_RESCUED, RESCUE_CHAIN],
	["needs.resolve.outputs.is_prerelease", RELEASE, STORE_SUBMISSION, STORES],
	["needs.resolve.outputs.on_main", RELEASE, STORE_SUBMISSION, STORES],
	// No build, smoke or attach-assets takes an unknown source; the store jobs wait on attach-assets.
	[
		"needs.select-assets.outputs.source",
		RELEASE,
		STORE_SUBMISSION,
		["build-chrome", "build-firefox", "smoke-against-artifact", "smoke-firefox-against-artifact", "attach-assets", ...STORES],
	],
] as const)("%s: a malformed control output fails the check", (output, agg, world, skips) => {
	expect(exitCode(agg, world)).toBe(0)
	const skipped = Object.fromEntries(skips.map((job) => [`needs.${job}.result`, "skipped"]))
	for (const value of ["", "yes"]) expect(exitCode(agg, { ...world, ...skipped, [output]: value }), `'${value}'`).not.toBe(0)
})

test("release_created may be empty, but nothing else that is not true or false", () => {
	expect(exitCode(RELEASE, PUSH_WITHOUT_RELEASE)).toBe(0)
	expect(exitCode(RELEASE, { ...PUSH_WITHOUT_RELEASE, "needs.release-please.outputs.release_created": "yes" })).not.toBe(0)
})

/** The opt-in network suite must be exactly what the dispatch asked for; every other gate exactly `success`. */
const NETWORK_CLAUSE = "needs.network-e2e.result == (github.event.inputs.run_network_e2e == 'true' && 'success' || 'skipped')"
/** select-assets ran exactly on a dispatch. */
const SELECTED = "needs.select-assets.result == (github.event_name == 'workflow_dispatch' && 'success' || 'skipped')"
/** A dispatch's source is one select-assets can write; a failed, cancelled or empty select matches neither. */
const SOURCE_KNOWN =
	"(github.event_name == 'push' || needs.select-assets.outputs.source == 'build' || needs.select-assets.outputs.source == 'published')"
const BUILDS = "(github.event_name == 'push' || needs.select-assets.outputs.source == 'build')"
/** A build ran exactly when the bytes are this run's own. */
const built = (browser: string): string =>
	`needs.build-${browser}.result == (needs.select-assets.outputs.source == 'published' && 'skipped' || 'success')`
const BROWSERS = ["chrome", "firefox"]
const TOKENS: [string, string][] = [
	[NETWORK_CLAUSE, "NETWORK"],
	[SELECTED, "SELECTED"],
	[SOURCE_KNOWN, "SOURCE_KNOWN"],
	[BUILDS, "BUILDS"],
	...BROWSERS.map((browser): [string, string] => [built(browser), `BUILT ${browser}`]),
]
/** A job's `if:` as its sorted `&&` clauses, each compound clause above read as one token. */
const clausesOf = (condition: unknown): string[] =>
	TOKENS.reduce((text, [clause, token]) => text.replaceAll(clause, token), String(condition).split(/\s+/).join(" ").trim())
		.split("&&")
		.map((clause) => clause.trim())
		.sort()
const succeeded = (...jobs: string[]): string[] => jobs.map((job) => `needs.${job}.result == 'success'`)

// Each consumer of select-assets takes SELECTED and SOURCE_KNOWN, so a dispatch whose select failed,
// was cancelled or wrote no source runs no smoke and no attach-assets, not only a red status.
describe("release's source-bound stages", () => {
	const { jobs } = workflow("release.yml")

	test("attach-assets publishes only past gates that all ended as asked, and never from a cancelled run", () => {
		const job = jobs["attach-assets"]
		expect([job.needs].flat().sort()).toEqual(
			[
				"resolve",
				"lint-and-typecheck",
				"unit-tests",
				"network-e2e",
				"select-assets",
				"build-chrome",
				"build-firefox",
				"smoke-against-artifact",
				"smoke-firefox-against-artifact",
				"release-notes",
			].sort(),
		)
		expect(clausesOf(job.if)).toEqual(
			[
				"always()",
				"!cancelled()",
				"NETWORK",
				"SELECTED",
				"SOURCE_KNOWN",
				"BUILT chrome",
				"BUILT firefox",
				...succeeded(
					"resolve",
					"lint-and-typecheck",
					"unit-tests",
					"smoke-against-artifact",
					"smoke-firefox-against-artifact",
					"release-notes",
				),
			].sort(),
		)
	})

	test.each(BROWSERS)("build-%s runs past the gates, on a push or a dispatch that selected the build", (browser) => {
		const job = jobs[`build-${browser}`]
		expect([job.needs].flat().sort()).toEqual(["resolve", "lint-and-typecheck", "unit-tests", "select-assets"].sort())
		expect(clausesOf(job.if)).toEqual(
			["always()", "SELECTED", "BUILDS", ...succeeded("resolve", "lint-and-typecheck", "unit-tests")].sort(),
		)
	})

	test.each([
		["smoke-against-artifact", "chrome"],
		["smoke-firefox-against-artifact", "firefox"],
	])("%s runs on the source select-assets chose, its build exactly when that is the build", (name, browser) => {
		const job = jobs[name]
		expect([job.needs].flat().sort()).toEqual(["resolve", `build-${browser}`, "select-assets"].sort())
		expect(clausesOf(job.if)).toEqual(["always()", "SELECTED", "SOURCE_KNOWN", `BUILT ${browser}`, ...succeeded("resolve")].sort())
	})
})

// The opt-in suite is one call of the PR lanes' lane (behavior-gating.test.ts pins its jobs), so the
// one clause above reads every lane job; a second job calling the suite is one it never reads.
test("release runs the network suite in the one job attach-assets and status read", () => {
	const { jobs } = workflow("release.yml")
	const callers = Object.keys(jobs).filter((name) => /\/_extension-network-e2e(-lane)?\.yml(@.*)?$/.test(String(jobs[name].uses)))
	expect(callers).toEqual(["network-e2e"])
	expect(jobs["network-e2e"].uses).toBe("./.github/workflows/_extension-network-e2e-lane.yml")
})

// The four PR e2e lanes. Each `status` checks out `e2e-aggregate.sh` at this run's commit and runs it
// on `toJSON(needs)`; each smoke lane's three shards reach it as the one `smoke` result, so a failed or
// cancelled shard arrives as `failure` or `cancelled`. Every table below runs the lane's own wiring
// and the shared script together.
const E2E_LANES = [
	{ file: "pr-extension-smoke-e2e.yml", surface: "smoke-surface" },
	{ file: "pr-extension-smoke-e2e-firefox.yml", surface: "smoke-surface" },
	{ file: "pr-extension-network-e2e.yml", surface: "extension-network" },
	{ file: "pr-extension-network-e2e-firefox.yml", surface: "extension-network" },
]

const STATUS_CHECKOUT = {
	uses: "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1",
	with: {
		ref: "${{ github.sha }}",
		"persist-credentials": false,
		"sparse-checkout": "/scripts/ci-cd/e2e-aggregate.sh",
		"sparse-checkout-cone-mode": false,
	},
}

type LaneAggregator = Aggregator & { workflowName: string }

function laneAggregator(file: string): LaneAggregator {
	const wf = workflow(file)
	const job = wf.jobs.status
	const [checkout, step, ...rest] = job.steps
	expect(rest, `${file}: the aggregator is the checkout and one step`).toEqual([])
	expect(checkout, `${file}: the status checkout`).toEqual(STATUS_CHECKOUT)
	return {
		file,
		if: job.if,
		suppressors: [job["continue-on-error"], step["continue-on-error"], step.if],
		needs: [job.needs].flat(),
		jobs: Object.keys(wf.jobs).filter((name) => name !== "status"),
		run: step.run,
		env: step.env ?? {},
		workflowName: wf.name,
	}
}

type Needs = Record<string, { result?: unknown; outputs?: Record<string, string> }>

/** What `toJSON(needs)` holds when the gate said `run`: `changes` succeeded, every suite as asked. */
function laneNeeds(agg: LaneAggregator, run: string, suites: "success" | "skipped", readAttempt = "1"): Needs {
	const need = (job: string): Needs[string] =>
		job === "changes" ? { result: "success", outputs: { run, "read-attempt": readAttempt } } : { result: suites, outputs: {} }
	return Object.fromEntries(agg.needs.map((job) => [job, need(job)]))
}

/** Runs the aggregator as the runner does, `needs` given whole or as the raw text standing for it. */
function laneExit(agg: LaneAggregator, needs: Needs | string, attempt = "1"): number {
	const json = typeof needs === "string" ? needs : JSON.stringify(needs, null, 2)
	return exitCode(agg, { "toJSON(needs)": json }, { GITHUB_RUN_ATTEMPT: attempt, GITHUB_WORKFLOW: agg.workflowName })
}

const LANE_WORLDS = [
	["a run of every suite", "true", "success"],
	["a gate that skipped the suites", "false", "skipped"],
] as const

describe.each(E2E_LANES.map(({ file }) => laneAggregator(file)))("$file aggregator", (agg) => {
	test("always runs, nothing can hide a red script, and it waits on every job", () => {
		expect(agg.if).toBe("always()")
		expect(agg.suppressors).toEqual([undefined, undefined, undefined])
		expect([...agg.needs].sort()).toEqual([...agg.jobs].sort())
	})

	test.each(LANE_WORLDS)("passes %s", (_, run, suites) => {
		expect(laneExit(agg, laneNeeds(agg, run, suites))).toBe(0)
	})

	test.each(LANE_WORLDS)("fails %s once any one need ends otherwise", (_, run, suites) => {
		const world = laneNeeds(agg, run, suites)
		for (const job of agg.needs) {
			for (const result of RESULTS.filter((r) => r !== world[job].result)) {
				expect(laneExit(agg, { ...world, [job]: { ...world[job], result } }), `${job} '${result}'`).not.toBe(0)
			}
		}
	})

	// What a run produces with that output malformed: no suite's `if:` compares equal, so all skip.
	test("a malformed or missing run output fails the check", () => {
		for (const run of ["", "yes", "True"]) expect(laneExit(agg, laneNeeds(agg, run, "skipped")), `'${run}'`).not.toBe(0)
		const world = laneNeeds(agg, "true", "success")
		expect(laneExit(agg, { ...world, changes: { result: "success", outputs: { "read-attempt": "1" } } })).not.toBe(0)
	})

	test("fails on needs it cannot read: a result null or missing, malformed JSON, no suite", () => {
		const world = laneNeeds(agg, "true", "success")
		for (const job of agg.needs) {
			const { result: _, ...missing } = world[job]
			expect(laneExit(agg, { ...world, [job]: { ...world[job], result: null } }), `${job} null`).not.toBe(0)
			expect(laneExit(agg, { ...world, [job]: missing }), `${job} missing`).not.toBe(0)
		}
		const json = JSON.stringify(world)
		for (const text of ["", json.slice(0, -1), `[${json}]`]) expect(laneExit(agg, text), text).not.toBe(0)
		expect(laneExit(agg, { changes: world.changes }), "no suite").not.toBe(0)
	})

	// A re-run of `status` alone carries the earlier attempt's gate, so a skip decided on labels read
	// before a label was added could pass; a re-run of failed suites keeps its ran gate.
	test("accepts skipped suites only on labels read in this attempt", () => {
		expect(laneExit(agg, laneNeeds(agg, "false", "skipped", "2"), "2")).toBe(0)
		expect(laneExit(agg, laneNeeds(agg, "false", "skipped", "1"), "2")).not.toBe(0)
		expect(laneExit(agg, laneNeeds(agg, "false", "skipped", ""), "1")).not.toBe(0)
		expect(laneExit(agg, laneNeeds(agg, "true", "success", "1"), "2")).toBe(0)
	})
})

const LABEL_HIT = "steps.live.outputs.label-hit"
const BASE = "steps.live.outputs.base"
const surfaceOf = (surface: string): string => `steps.override.outputs.full || steps.filter.outputs.${surface}`

/** Runs a lane's gate step in `changes`: its exit code, and what it wrote to `$GITHUB_OUTPUT`. */
function decide(file: string, world: World): { code: number; output: string } {
	const step = workflow(file).jobs.changes.steps.find((s: { id?: string }) => s.id === "gate")
	const dir = mkdtempSync(join(tmpdir(), "decide-"))
	try {
		const output = join(dir, "output")
		const code = exitCode({ file, run: step.run, env: step.env ?? {} }, world, { GITHUB_OUTPUT: output })
		return { code, output: code === 0 ? readFileSync(output, "utf8").trim() : "" }
	} finally {
		rmSync(dir, { recursive: true, force: true })
	}
}

function decided(file: string, world: World): string {
	const { code, output } = decide(file, world)
	expect(code, `${file}: decide`).toBe(0)
	return output
}

const prWorld = (surface: string, over: World = {}): World => ({
	"github.event_name": "pull_request",
	[BASE]: "dev",
	[surfaceOf(surface)]: "false",
	[LABEL_HIT]: "false",
	...over,
})

// The live read always writes true or false; anything else is a wiring fault, and reading it as
// false would skip a suite the labels ask for.
test.each(E2E_LANES)("$file decides from the live label and base, and refuses a malformed one", ({ file, surface }) => {
	expect(decided(file, prWorld(surface, { [LABEL_HIT]: "true" }))).toBe("run=true")
	expect(decided(file, prWorld(surface))).toBe("run=false")
	expect(decided(file, prWorld(surface, { [surfaceOf(surface)]: "true" })), "the paths filter runs it").toBe("run=true")
	for (const value of ["", "yes", "True"]) expect(decide(file, prWorld(surface, { [LABEL_HIT]: value })).code, `'${value}'`).not.toBe(0)
	expect(decided(file, prWorld(surface, { [BASE]: "main" })), "the live base forces main's run").toBe("run=true")
	expect(decide(file, prWorld(surface, { [BASE]: "" })).code, "an empty base").not.toBe(0)
})

// A required aggregator passes when its gate skipped the suites. A gate that skipped a draft would
// pass it, and once marked ready the PR would merge on that pass while its suites still ran. So each
// lane's gate step runs here bound to a draft whose diff touches its surface: it must ask for the
// suites, and the aggregator must then fail on them skipped. A draft-flag read in the YAML spelled any
// other way than the one this world binds has no value here, and throws; behavior-gating.test.ts
// refuses one in the two scripts.
test.each(E2E_LANES)("$file runs a draft's suites, and its aggregator fails on them skipped", ({ file, surface }) => {
	const draft: World = { ...prWorld(surface, { [surfaceOf(surface)]: "true" }), "github.event.pull_request.draft": "true" }
	expect(decided(file, draft)).toBe("run=true")
	const agg = laneAggregator(file)
	expect(laneExit(agg, laneNeeds(agg, "true", "success"))).toBe(0)
	expect(laneExit(agg, laneNeeds(agg, "true", "skipped"))).not.toBe(0)
})
