/**
 * Behavioral pin for the aggregators outside the e2e lanes: `quality-status` (pr-quick.yml),
 * actionlint.yml's `Status` and release.yml's `status`, plus release's `attach-assets` guard; for the
 * sharded PR smoke lanes' `extension-smoke-e2e-status` and its Firefox twin; and, for every PR e2e
 * lane, that a draft whose diff touches the lane's surface gets its suites run, not skipped.
 *
 * Each must fail closed: pass only when every need ended exactly as its own `if:` asks, so a gate
 * that never ran (skipped for the wrong reason, cancelled before a runner, an empty result) reds
 * the check. A text pin cannot show that, so this runs each aggregator's own script with its
 * expressions bound to a world a run can produce: every legitimate world must pass, and any one need
 * ending any other way, or any control output it reads being malformed, must fail.
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
 * with an environment of only `PATH`, `extra` and the bound `env:`.
 */
function exitCode(agg: Pick<Aggregator, "file" | "run" | "env">, world: World, extra: Record<string, string> = {}): number {
	const valueOf = (expression: string): string => {
		if (!(expression in world)) throw new Error(`${agg.file}: no world value for ${expression}`)
		return world[expression]
	}
	const env: Record<string, string> = { PATH: process.env.PATH ?? "/usr/bin:/bin", ...extra }
	for (const [key, value] of Object.entries(agg.env)) env[key] = valueOf(expressionOf(agg.file, key, value))
	const script = agg.run.replace(/\$\{\{ (.+?) \}\}/g, (_, expression: string) => valueOf(expression))
	return Bun.spawnSync(["bash", "--noprofile", "--norc", "-e", "-c", script], { env, stdout: "ignore", stderr: "ignore" }).exitCode
}

/** Every need `success`, except the ones a world's conditions skip. */
const results = (needs: string[], skipped: string[]): World =>
	Object.fromEntries(needs.map((job) => [`needs.${job}.result`, skipped.includes(job) ? "skipped" : "success"]))

const QUALITY = aggregator("pr-quick.yml")
const quality = (event: string, extension: string, landing: string, skipped: string[]): World => ({
	"github.event_name": event,
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
	...context,
	...results(RELEASE.needs, skipped),
})
const asked = (value: string): World => ({
	"github.event.inputs.run_network_e2e": value,
	"github.event.inputs.publish_chrome": value,
	"github.event.inputs.publish_firefox": value,
})
const PUSH_WITHOUT_RELEASE = release(
	{
		"github.event_name": "push",
		"needs.auto-unstick.outputs.unstuck": "false",
		"needs.resolve.outputs.is_prerelease": "",
		"needs.resolve.outputs.on_main": "",
	},
	RELEASE.needs.filter((job) => job !== "release-please" && job !== "auto-unstick"),
)
const PUSH_RESCUED = release({ "github.event_name": "push", "needs.auto-unstick.outputs.unstuck": "true" }, NOT_ASKED)
const STORE_SUBMISSION = release(asked("true"), ["release-please", "auto-unstick"])

const CASES: { file: string; agg: Aggregator; advisory: string[]; worlds: Record<string, World> }[] = [
	{
		file: QUALITY.file,
		agg: QUALITY,
		advisory: ["preview-comment"],
		worlds: {
			"a PR that builds everything": quality("pull_request", "true", "true", []),
			"a PR that builds the extension only": quality("pull_request", "true", "false", ["build-landing"]),
			"a PR that builds nothing": quality("pull_request", "false", "false", ["build-chrome", "build-firefox", "build-landing"]),
			"a manual dispatch": quality("workflow_dispatch", "true", "true", ["commitlint"]),
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
			"a push release-please tagged": release(
				{ "github.event_name": "push", "needs.release-please.outputs.release_created": "true" },
				["auto-unstick", ...NOT_ASKED],
			),
			"a push the auto-unstick rescued": PUSH_RESCUED,
			"a republish": release(asked("false"), ["release-please", "auto-unstick", ...NOT_ASKED]),
			"a store submission with the network suite": STORE_SUBMISSION,
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

// Each smoke lane runs its suite as one matrix job of three shards, which GitHub hands the aggregator
// as the single `needs.smoke.result`, so a failed or cancelled shard arrives as `failure` or
// `cancelled`. These scripts read their results inline.
const SMOKE = aggregator("pr-extension-smoke-e2e.yml")
const SMOKE_FIREFOX = aggregator("pr-extension-smoke-e2e-firefox.yml")
const smoke = (run: string, skipped: string[]): World => ({
	"needs.decide.outputs.run": run,
	...results(SMOKE.needs, skipped),
})
const SMOKE_WORLDS: Record<string, World> = {
	"a run of every shard": smoke("true", []),
	"a gate that skipped the suite": smoke("false", ["smoke"]),
}

describe.each([SMOKE, SMOKE_FIREFOX])("$file aggregator", (agg) => {
	test("always runs, nothing can hide a red script, and it waits on every job", () => {
		expect(agg.if).toBe("always()")
		expect(agg.suppressors).toEqual([undefined, undefined, undefined])
		expect([...agg.needs].sort()).toEqual([...agg.jobs].sort())
	})

	test.each(Object.entries(SMOKE_WORLDS))("passes %s", (_, world) => {
		expect(exitCode(agg, world)).toBe(0)
	})

	test.each(Object.entries(SMOKE_WORLDS))("fails %s once any one need ends otherwise", (_, world) => {
		expectEveryOtherResultFails(agg, world)
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
		quality("pull_request", "true", "true", []),
		["build-chrome", "build-firefox"],
	],
	["needs.changes.outputs.needs-landing-build", QUALITY, quality("pull_request", "true", "true", []), ["build-landing"]],
	["needs.changes.outputs.workflows", ACTIONLINT, lint("true", "true", []), ["actionlint"]],
	["needs.changes.outputs.shell", ACTIONLINT, lint("true", "true", []), ["shellcheck"]],
	["needs.auto-unstick.outputs.unstuck", RELEASE, PUSH_WITHOUT_RELEASE, []],
	["needs.auto-unstick.outputs.unstuck", RELEASE, PUSH_RESCUED, RESCUE_CHAIN],
	["needs.resolve.outputs.is_prerelease", RELEASE, STORE_SUBMISSION, STORES],
	["needs.resolve.outputs.on_main", RELEASE, STORE_SUBMISSION, STORES],
	["needs.decide.outputs.run", SMOKE, smoke("true", []), ["smoke"]],
	["needs.decide.outputs.run", SMOKE_FIREFOX, smoke("true", []), ["smoke"]],
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

test("release's attach-assets publishes only past gates that all ended as asked, and never from a cancelled run", () => {
	const job = workflow("release.yml").jobs["attach-assets"]
	const needs: string[] = [job.needs].flat()
	expect([...needs].sort()).toEqual(
		[
			"resolve",
			"lint-and-typecheck",
			"unit-tests",
			"network-e2e",
			"build-chrome",
			"build-firefox",
			"smoke-against-artifact",
			"smoke-firefox-against-artifact",
			"release-notes",
		].sort(),
	)
	const clauses = String(job.if)
		.replace(NETWORK_CLAUSE, "NETWORK")
		.split("&&")
		.map((clause) => clause.trim())
	const expected = [
		"always()",
		"!cancelled()",
		...needs.map((need) => (need === "network-e2e" ? "NETWORK" : `needs.${need}.result == 'success'`)),
	]
	expect(clauses.sort()).toEqual(expected.sort())
})

// The opt-in suite is one matrix job whose legs are the PR lane's jobs (behavior-gating.test.ts pins
// them), so the one clause above reads every leg; a second job calling the suite is one it never reads.
test("release runs the network suite in the one job attach-assets and status read", () => {
	const { jobs } = workflow("release.yml")
	const callers = Object.keys(jobs).filter((name) => /\/_extension-network-e2e\.yml(@.*)?$/.test(String(jobs[name].uses)))
	expect(callers).toEqual(["network-e2e"])
	expect(jobs["network-e2e"].strategy?.["fail-fast"]).toBe(false)
})

// A required aggregator passes when its gate skipped the suites. A gate that skipped a draft would
// pass it, and once marked ready the PR would merge on that pass while its suites still ran. So each
// lane's whole `Decide` step runs here bound to a draft whose diff touches its surface: it must ask
// for the suites, and the aggregator must then fail on them skipped. A draft-flag read spelled any
// other way than the one this world binds has no value here, and throws.
const E2E_LANES = [
	{ file: "pr-extension-smoke-e2e.yml", surface: "smoke-surface", label: "smoke" },
	{ file: "pr-extension-smoke-e2e-firefox.yml", surface: "smoke-surface", label: "smoke" },
	{ file: "pr-extension-network-e2e.yml", surface: "extension-network", label: "network" },
	{ file: "pr-extension-network-e2e-firefox.yml", surface: "extension-network", label: "network" },
]
const labels = (label: string): string =>
	`contains(github.event.pull_request.labels.*.name, 'e2e:extension-${label}') || contains(github.event.pull_request.labels.*.name, 'e2e:${label}')`

/** What a lane's `Decide` step writes to `$GITHUB_OUTPUT`. */
function decided(file: string, world: World): string {
	const step = workflow(file).jobs.decide.steps[0]
	const dir = mkdtempSync(join(tmpdir(), "decide-"))
	try {
		const output = join(dir, "output")
		expect(exitCode({ file, run: step.run, env: step.env ?? {} }, world, { GITHUB_OUTPUT: output }), `${file}: decide`).toBe(0)
		return readFileSync(output, "utf8").trim()
	} finally {
		rmSync(dir, { recursive: true, force: true })
	}
}

test.each(E2E_LANES)("$file runs a draft's suites, and its aggregator fails on them skipped", ({ file, surface, label }) => {
	const draft: World = {
		"github.event_name": "pull_request",
		"github.base_ref": "dev",
		"github.event.pull_request.draft": "true",
		[`needs.changes.outputs.${surface}`]: "true",
		[labels(label)]: "false",
	}
	expect(decided(file, draft)).toBe("run=true")
	const agg = aggregator(file)
	const suites = agg.needs.filter((job) => job !== "changes" && job !== "decide")
	const ran = { "needs.decide.outputs.run": "true", ...results(agg.needs, []) }
	expect(exitCode(agg, ran)).toBe(0)
	expect(exitCode(agg, { ...ran, ...results(suites, suites) })).not.toBe(0)
})
