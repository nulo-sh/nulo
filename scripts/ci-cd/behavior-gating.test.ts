/**
 * Anti-drift guard for the CI paths-filter gates.
 *
 * The smoke / network / build gates are DERIVED FROM THE DEPENDENCY GRAPH, not a
 * hand-curated list (see CI.md "CI gating" + implementations-plan/paths-filter-negation-fix/).
 * This test recomputes each gate's target graph from package.json and asserts the
 * live filter still covers it — so a new `@nulo/*` dependency added without gating
 * it, or a re-introduced `!` negation (the dorny `some`-quantifier footgun), fails CI.
 *
 * Wired into CI via the root `test:ci-gating` script in `_unit-tests.yml` — without
 * that step this guard would never run on a PR and the whole mechanism would be hollow.
 */
import { describe, expect, test } from "bun:test"
import { chmodSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { MOVE_APPROVED_LABEL } from "../complexity-baseline/scan"
import { runStep } from "./gh-step-harness"

const ROOT = join(import.meta.dir, "..", "..")
// apps/ vs packages/ split (FLAT layout): deployable leaves live under apps/, libs under packages/.
const APPS = new Set(["extension", "landing", "playground"])
const dirOf = (pkg: string): string => (APPS.has(pkg) ? "apps" : "packages")

/** Direct `@nulo/*` workspace deps of a package (runtime + dev — what it's built/tested from). */
function directDeps(pkg: string): string[] {
	const p = JSON.parse(readFileSync(join(ROOT, dirOf(pkg), pkg, "package.json"), "utf8"))
	return Object.keys({ ...p.dependencies, ...p.devDependencies })
		.filter((k) => k.startsWith("@nulo/"))
		.map((k) => k.slice("@nulo/".length))
}

/** Transitive `@nulo/*` dependency closure of a target (EXCLUDING the target itself). */
function transitiveDeps(target: string): string[] {
	const seen = new Set<string>()
	const walk = (pkg: string) => {
		for (const d of directDeps(pkg))
			if (!seen.has(d)) {
				seen.add(d)
				walk(d)
			}
	}
	walk(target)
	return [...seen].sort()
}

/** Parse a workflow's dorny `changes` filters — TWO-LEVEL (workflow YAML → the `with.filters` string), never regex. */
function filtersOf(workflow: string): Record<string, string[]> {
	// biome-ignore lint/suspicious/noExplicitAny: parsed-YAML shape is dynamic.
	const wf = Bun.YAML.parse(readFileSync(join(ROOT, ".github/workflows", workflow), "utf8")) as any
	for (const job of Object.values(wf.jobs)) {
		// biome-ignore lint/suspicious/noExplicitAny: parsed-YAML shape is dynamic.
		for (const step of (job as any).steps ?? []) {
			if (typeof step.uses === "string" && step.uses.includes("dorny/paths-filter") && step.with?.filters) {
				return Bun.YAML.parse(step.with.filters) as Record<string, string[]>
			}
		}
	}
	throw new Error(`no dorny/paths-filter step found in ${workflow}`)
}

/** A gate's pattern set must whole-package the target and src+manifest every transitive dep lib. */
function assertGraphCovered(patterns: string[], target: string, label: string) {
	expect(patterns, `${label}: target '${target}' must be whole-package gated`).toContain(`${dirOf(target)}/${target}/**`)
	for (const dep of transitiveDeps(target)) {
		expect(patterns, `${label}: dep lib '${dep}' src must be gated`).toContain(`packages/${dep}/src/**`)
		expect(patterns, `${label}: dep lib '${dep}' package.json must be gated`).toContain(`packages/${dep}/package.json`)
	}
}

/** A script's lines that run — comments cannot test a result or decide a gate. */
const commandLines = (run: unknown): string[] =>
	String(run ?? "")
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0 && !line.startsWith("#"))

const FILTER_WORKFLOWS = [
	"pr-quick.yml",
	"pr-extension-smoke-e2e.yml",
	"pr-extension-network-e2e.yml",
	"pr-extension-smoke-e2e-firefox.yml",
	"pr-extension-network-e2e-firefox.yml",
	"actionlint.yml",
]

/**
 * The check-run each PR workflow's aggregator job produces. Branch protection matches these BY
 * NAME (CLAUDE.md § Branching), so a renamed job that isn't repointed there blocks every merge —
 * this pin fails first. `required-checks.ts` renames the protection to the same names.
 */
const AGGREGATOR_CHECKS: Record<string, string> = {
	"pr-quick.yml": "quality-status",
	"pr-extension-smoke-e2e.yml": "extension-smoke-e2e-status",
	"pr-extension-network-e2e.yml": "extension-network-e2e-status",
	"pr-extension-smoke-e2e-firefox.yml": "extension-smoke-e2e-firefox-status",
	"pr-extension-network-e2e-firefox.yml": "extension-network-e2e-firefox-status",
}

/** The four e2e lanes, each with the labels that force it to run (the second an alias). */
const E2E_LANES = {
	"pr-extension-smoke-e2e.yml": ["e2e:extension-smoke", "e2e:smoke"],
	"pr-extension-smoke-e2e-firefox.yml": ["e2e:extension-smoke", "e2e:smoke"],
	"pr-extension-network-e2e.yml": ["e2e:extension-network", "e2e:network"],
	"pr-extension-network-e2e-firefox.yml": ["e2e:extension-network", "e2e:network"],
}

/** The gate scripts every e2e lane runs; an edit to one runs the lanes, as an edit to the lane's own YAML does. */
const GATE_SCRIPTS = ["scripts/ci-cd/e2e-decide.sh", "scripts/ci-cd/e2e-aggregate.sh"]

describe("CI aggregator check names", () => {
	test("each PR workflow's status job produces its documented check-run name", () => {
		for (const [file, name] of Object.entries(AGGREGATOR_CHECKS)) {
			// biome-ignore lint/suspicious/noExplicitAny: parsed-YAML shape is dynamic.
			const wf = Bun.YAML.parse(readFileSync(join(ROOT, ".github/workflows", file), "utf8")) as any
			expect(wf.jobs.status?.name, `${file}: jobs.status.name`).toBe(name)
			expect(wf.jobs.status?.if, `${file}: the aggregator must always run`).toBe("always()")
		}
	})

	test("the protection runbook renames onto exactly these names", async () => {
		const { RENAMES } = await import("./required-checks")
		for (const target of Object.values(RENAMES)) {
			expect(Object.values(AGGREGATOR_CHECKS), `rename target '${target}' must be a produced check`).toContain(target)
		}
	})
})

// biome-ignore lint/suspicious/noExplicitAny: parsed-YAML shape is dynamic.
const workflowOf = (file: string): any => Bun.YAML.parse(readFileSync(join(ROOT, ".github/workflows", file), "utf8"))
const NETWORK_SUITE = "_extension-network-e2e.yml"
const NETWORK_LANE = "_extension-network-e2e-lane.yml"
/** Nightly's advisory rerun of the canary files on the in-browser prover; it belongs to no lane. */
const WASM_LEG = "network-e2e-canary-wasm"

type CallerJob = {
	name?: string
	uses?: string
	if?: unknown
	needs?: unknown
	strategy?: { "fail-fast"?: unknown; matrix?: Record<string, unknown> }
	with?: Record<string, unknown>
	secrets?: unknown
}
/** One run of the network suite: the top-level job it comes from, its name down to the suite's, its inputs. */
type SuiteCall = { job: string; name: string; inputs: Record<string, unknown> }
type Scope = { inputs?: Record<string, unknown>; matrix?: Record<string, unknown> }

/**
 * The lane's complementary chaos jobs, the only lane jobs with an `if`, and that `if` evaluated on
 * the bound `chaos_seed`. A caller's expression counts as non-empty: nightly's ends in
 * `github.run_id`, which never is.
 */
const CHAOS_PAIR: Record<string, { if: string; runs: (seed: unknown) => boolean }> = {
	"network-e2e-chaos": { if: "inputs.chaos_seed == ''", runs: (seed) => seed === "" },
	"network-e2e-chaos-seeded": { if: "inputs.chaos_seed != ''", runs: (seed) => seed !== "" },
}

const REFERENCE = /\$\{\{ (inputs|matrix)\.(\w+)(?:\.(\w+))? \}\}/g

/**
 * Binds each `${{ inputs.<k> }}` and `${{ matrix.<k>[.<f>] }}` of a context the scope defines: a
 * value that is one whole reference takes the bound value and its type, a reference inside text
 * is spliced in as a string, and every other expression stays opaque text. A key the scope's
 * context lacks throws.
 */
function bind(value: unknown, scope: Scope, at: string): unknown {
	if (typeof value !== "string") return value
	const lookup = (match: string, context: "inputs" | "matrix", key: string, field?: string): unknown => {
		const values = scope[context]
		if (values === undefined) return match
		if (!(key in values)) throw new Error(`${at}: ${match} names nothing in scope`)
		const bound = values[key]
		if (field === undefined) return bound
		if (typeof bound !== "object" || bound === null || !(field in bound)) throw new Error(`${at}: ${match} names nothing in scope`)
		return (bound as Record<string, unknown>)[field]
	}
	const whole = new RegExp(`^${REFERENCE.source}$`).exec(value)
	if (whole) return lookup(whole[0], whole[1] as "inputs" | "matrix", whole[2], whole[3])
	return value.replace(REFERENCE, (match, context, key, field) => String(lookup(match, context, key, field)))
}

/** A job's matrix legs: one per value of its one literal key, or a single leg without a matrix. */
function legsOf(job: CallerJob, at: string): (Record<string, unknown> | undefined)[] {
	const matrix = job.strategy?.matrix
	if (matrix === undefined) return [undefined]
	const axes = Object.entries(matrix)
	if (axes.length !== 1 || !Array.isArray(axes[0][1])) throw new Error(`${at}: the matrix is not one literal key`)
	const [key, values] = axes[0]
	return values.map((value) => ({ [key]: value }))
}

/**
 * The suite calls one job makes: itself when it calls the suite, every job of the lane bound to
 * what it hands the lane (an input it omits takes the lane's default) when it calls the lane.
 */
function callsOf(id: string, job: CallerJob, inputs?: Record<string, unknown>, prefix = ""): Omit<SuiteCall, "job">[] {
	return legsOf(job, id).flatMap((matrix) => {
		const scope = { inputs, matrix }
		const name = `${prefix}${String(bind(job.name ?? id, scope, id))}`
		const handed = Object.fromEntries(Object.entries(job.with ?? {}).map(([key, value]) => [key, bind(value, scope, id)]))
		if (job.uses === `./.github/workflows/${NETWORK_SUITE}`) return [{ name, inputs: handed }]
		if (job.uses === `./.github/workflows/${NETWORK_LANE}`) return laneCalls(handed, `${name} / `)
		return []
	})
}

function laneCalls(handed: Record<string, unknown>, prefix: string): Omit<SuiteCall, "job">[] {
	const lane = workflowOf(NETWORK_LANE)
	const declared = lane.on.workflow_call.inputs as Record<string, { required?: boolean; default?: unknown }>
	for (const key of Object.keys(handed)) if (!(key in declared)) throw new Error(`the lane declares no input ${key}`)
	for (const [key, spec] of Object.entries(declared))
		if (spec.required && !(key in handed)) throw new Error(`the lane's required input ${key} is not handed`)
	const inputs = Object.fromEntries(Object.entries(declared).map(([key, spec]) => [key, key in handed ? handed[key] : spec.default]))
	return (Object.entries(lane.jobs) as [string, CallerJob][]).flatMap(([id, job]) => {
		if (job.if === undefined) return callsOf(id, job, inputs, prefix)
		const pair = CHAOS_PAIR[id]
		if (pair?.if !== job.if) throw new Error(`${NETWORK_LANE} → ${id}: an if the expander does not evaluate`)
		return pair.runs(inputs.chaos_seed) ? callsOf(id, job, inputs, prefix) : []
	})
}

/** Every network suite call a workflow makes, directly or through a lane call. */
const suiteCalls = (file: string): SuiteCall[] =>
	(Object.entries(workflowOf(file).jobs) as [string, CallerJob][]).flatMap(([id, job]) =>
		callsOf(id, job).map((call) => ({ job: id, ...call })),
	)

const PR_DISABLE_PRESTO = "${{ github.event.inputs.disable_presto == 'true' || vars.NULO_E2E_DISABLE_PRESTO == '1' }}"
const NIGHTLY_IF = "always() && needs.resolve.result == 'success' && needs.resolve.outputs.skip != 'true'"
const NIGHTLY_WITH = {
	ref: "${{ needs.resolve.outputs.sha }}",
	disable_presto: "${{ vars.NULO_E2E_DISABLE_PRESTO == '1' }}",
	chaos_seed: "${{ github.event.inputs.chaos_seed || github.run_id }}",
}
/** Every call of the network lane: the caller's job id, name, `needs` and `if` (whitespace folded), and what it hands the lane. */
const LANE_CALLERS = [
	{
		file: "pr-extension-network-e2e.yml",
		job: "network-e2e",
		name: "Run",
		needs: "changes",
		if: "needs.changes.outputs.run == 'true'",
		with: { ref: "${{ github.event.pull_request.head.sha || github.ref }}", retry: "0", disable_presto: PR_DISABLE_PRESTO },
	},
	{
		file: "pr-extension-network-e2e-firefox.yml",
		job: "network-e2e",
		name: "Run",
		needs: "changes",
		if: "needs.changes.outputs.run == 'true'",
		with: {
			ref: "${{ github.event.pull_request.head.sha || github.ref }}",
			browser: "firefox",
			retry: "0",
			disable_presto: PR_DISABLE_PRESTO,
		},
	},
	{ file: "nightly.yml", job: "network-e2e", name: "Run", needs: "resolve", if: NIGHTLY_IF, with: NIGHTLY_WITH },
	{
		file: "nightly.yml",
		job: "network-e2e-firefox",
		name: "Firefox / Run",
		needs: "resolve",
		if: NIGHTLY_IF,
		with: { ...NIGHTLY_WITH, browser: "firefox" },
	},
	{
		file: "release.yml",
		job: "network-e2e",
		name: "Run",
		needs: "resolve",
		if: "always() && needs.resolve.result == 'success' && github.event.inputs.run_network_e2e == 'true'",
		with: { ref: "${{ needs.resolve.outputs.sha }}", retry: "0", disable_presto: "${{ vars.NULO_E2E_DISABLE_PRESTO == '1' }}" },
	},
] as const
const foldSpace = (text: unknown): string => String(text).split(/\s+/).join(" ").trim()

/**
 * verify-cert-run.sh certifies a head only when every network suite job ran green, matched by its
 * full name: the caller's job name, the lane's, then the suite's. A rename at any level that the
 * script does not follow fails every certification, so its list is derived here from the workflows.
 */
describe("network suite job names", () => {
	const PR_LANE = "pr-extension-network-e2e.yml"
	const LEAF = "network suite"
	const leaf = (shard: unknown): string => (shard ? `${LEAF} (shard ${shard})` : LEAF)

	test("the reusable workflow's job is the network suite, named with its shard when it has one", () => {
		expect(workflowOf(NETWORK_SUITE).jobs["network-e2e"].name).toBe(
			`\${{ inputs.shard && format('${LEAF} (shard {0})', inputs.shard) || '${LEAF}' }}`,
		)
	})

	test("verify-cert-run.sh expects exactly the jobs the PR lane's network workflow produces", () => {
		const produced = suiteCalls(PR_LANE).map(({ name, inputs }) => `${name} / ${leaf(inputs.shard)}`)
		const script = readFileSync(join(ROOT, "scripts/ci-cd/verify-cert-run.sh"), "utf8")
		const block = /^EXPECTED_NETWORK_JOBS=\(\n([\s\S]*?)\n\)$/m.exec(script)?.[1]
		expect(block, "verify-cert-run.sh declares EXPECTED_NETWORK_JOBS").toBeDefined()
		const expected = String(block)
			.split("\n")
			.map((line) => line.trim().replace(/^"(.*)"$/, "$1"))
			.filter(Boolean)
		expect(produced.length, "the PR lane calls the suite").toBeGreaterThan(0)
		expect([...expected].sort()).toEqual([...produced].sort())
		expect(script, "the list is checked against the PR lane's runs").toContain(`if [ "$WF" = "${workflowOf(PR_LANE).name}" ]; then`)
	})
})

describe("commitlint", () => {
	const step = workflowOf("pr-quick.yml").jobs.commitlint.steps.find((s: { name?: string }) => s.name === "Lint PR commits")
	// A failing lint, so a PR that reaches it goes red and one that skips it stays green.
	const LOG_AND_FAIL = `#!/bin/sh\necho "$(basename "$0") $*" >> "$(dirname "$0")/calls"\nexit 1\n`
	const run = (base: string, head: string, author: string) =>
		runStep(step, {
			shim: LOG_AND_FAIL,
			bound: {
				"${{ github.base_ref }}": base,
				"${{ github.head_ref }}": head,
				"${{ github.event.pull_request.base.sha }}": "base-sha",
				"${{ github.event.pull_request.head.sha }}": "head-sha",
				"${{ github.event.pull_request.user.login }}": author,
			},
			setup: (dir) => {
				writeFileSync(join(dir, "bunx"), LOG_AND_FAIL)
				chmodSync(join(dir, "bunx"), 0o755)
			},
		})

	test.each([
		["a human's PR into dev", "dev", "feat/x", "alice"],
		["a human's PR from a branch named like Dependabot's", "dev", "dependabot/github_actions/actions-1", "alice"],
	])("%s lints every commit in base..head", (_, base, head, author) => {
		const { code, calls } = run(base, head, author)
		expect(calls).toEqual(["bunx commitlint --from base-sha --to head-sha --verbose"])
		expect(code).toBe(1)
	})

	test.each([
		["Dependabot's PR", "dev", "dependabot/github_actions/actions-1", "dependabot[bot]"],
		["a PR into main", "main", "dev", "alice"],
		["the main → dev sync PR", "dev", "sync/main-to-dev-1.2.0", "nulo-release[bot]"],
	])("%s is not linted", (_, base, head, author) => {
		const { code, calls } = run(base, head, author)
		expect(calls).toEqual([])
		expect(code).toBe(0)
	})
})

describe("PR concurrency", () => {
	// biome-ignore lint/suspicious/noExplicitAny: parsed-YAML shape is dynamic.
	const workflow = (file: string): any => Bun.YAML.parse(readFileSync(join(ROOT, ".github/workflows", file), "utf8"))
	const PR_WORKFLOWS = [...Object.keys(AGGREGATOR_CHECKS), "actionlint.yml"]
	const workflowFiles = (): string[] =>
		readdirSync(join(ROOT, ".github/workflows"))
			.filter((name) => name.endsWith(".yml"))
			.sort()

	// The number keeps same-named branches of two forks apart; the head commit keeps two heads of one
	// pull request apart, so a late run of an older push can neither cancel nor replace the current
	// head's run, whatever order GitHub admits them in.
	test("each PR workflow queues per pull request and head commit, and only a dispatch cancels", () => {
		for (const file of PR_WORKFLOWS) {
			const { group, "cancel-in-progress": cancel } = workflow(file).concurrency ?? {}
			expect(String(group), `${file}: concurrency.group`).toEndWith(
				"-${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}-${{ github.event.pull_request.head.sha || github.sha }}",
			)
			expect(String(group), `${file}: concurrency.group`).not.toContain("head_ref")
			expect(cancel, `${file}: concurrency.cancel-in-progress`).toBe("${{ github.event_name != 'pull_request' }}")
		}
	})

	// One of the two jobs in the repository that may cancel runs: it runs nothing it fetched, reads every
	// input from env, and skips the tokens that could not cancel anyway.
	test("pr-supersede.yml cancels from one script-only job with exactly the scope it needs", () => {
		const wf = workflow("pr-supersede.yml")
		expect(wf.on).toEqual({ pull_request: { types: ["synchronize"] } })
		expect(wf.permissions).toEqual({})
		expect(Object.keys(wf.jobs)).toEqual(["cancel-superseded"])
		const job = wf.jobs["cancel-superseded"]
		expect(job.permissions).toEqual({ actions: "write", "pull-requests": "read" })
		expect(job.if).toBe("github.event.pull_request.head.repo.full_name == github.repository && github.actor != 'dependabot[bot]'")
		// A shared group would let a late-admitted older sweep cancel the newer one.
		expect(wf.concurrency).toBeUndefined()
		expect(job.concurrency).toBeUndefined()
		expect(job.steps).toHaveLength(1)
		const [step] = job.steps
		expect(step.uses).toBeUndefined()
		expect(step.run).not.toContain("${{")
		const listed = /WORKFLOWS=\(\n([\s\S]*?)\n\s*\)/.exec(step.run)?.[1]
		expect(
			String(listed)
				.split("\n")
				.map((line) => line.trim())
				.sort(),
		).toEqual(PR_WORKFLOWS.map((file) => `.github/workflows/${file}`).sort())
	})

	test("pr-retarget.yml re-runs the e2e lanes from one script-only job with exactly the scope it needs", () => {
		const wf = workflow("pr-retarget.yml")
		expect(wf.on).toEqual({ pull_request: { types: ["edited"] } })
		expect(wf.permissions).toEqual({})
		expect(Object.keys(wf.jobs)).toEqual(["rerun-e2e"])
		const job = wf.jobs["rerun-e2e"]
		expect(job.permissions).toEqual({ actions: "write" })
		expect(job.if).toBe(
			"github.event.changes.base && github.event.pull_request.head.repo.full_name == github.repository && github.actor != 'dependabot[bot]'",
		)
		// A concurrency group would let a title edit's run replace a waiting retarget run.
		expect(wf.concurrency).toBeUndefined()
		expect(job.concurrency).toBeUndefined()
		expect(job.steps).toHaveLength(1)
		const [step] = job.steps
		expect(step.uses).toBeUndefined()
		expect(step.run).not.toContain("${{")
		const listed = /WORKFLOWS=\(\n([\s\S]*?)\n\s*\)/.exec(step.run)?.[1]
		expect(
			String(listed)
				.split("\n")
				.map((line) => line.trim())
				.sort(),
		).toEqual(Object.keys(E2E_LANES).sort())
	})

	// Every title or body edit fires `edited` as well, so a lane listening to it would re-run its
	// suites on each one.
	test("only pr-retarget.yml subscribes to `edited`", () => {
		const listeners = workflowFiles().filter((file) => {
			const on = workflow(file).on
			return ["pull_request", "pull_request_target"].some((event) => on?.[event]?.types?.includes("edited"))
		})
		expect(listeners).toEqual(["pr-retarget.yml"])
	})

	test("no other workflow can cancel or re-run a run", () => {
		const writers = workflowFiles().filter((file) => {
			const wf = workflow(file)
			const scopes = [wf.permissions, ...Object.values(wf.jobs ?? {}).map((job) => (job as { permissions?: unknown }).permissions)]
			return scopes.some(
				(scope) =>
					scope === "write-all" ||
					(typeof scope === "object" &&
						scope !== null &&
						"actions" in scope &&
						(scope as Record<string, unknown>).actions === "write"),
			)
		})
		expect(writers).toEqual(["pr-retarget.yml", "pr-supersede.yml"])
	})
})

/**
 * Each e2e lane decides from the labels the pull request carries when its `changes` job runs, and
 * the complexity ratchet from those it carries when the unit-tests job runs. An event's own label
 * list is a snapshot that a late run of an older event would decide from, so no workflow or action
 * may read it, and a run whose head the pull request has moved past stops itself.
 */
describe("live labels", () => {
	// biome-ignore lint/suspicious/noExplicitAny: parsed-YAML shape is dynamic.
	const workflow = (file: string): any => Bun.YAML.parse(readFileSync(join(ROOT, ".github/workflows", file), "utf8"))
	const SCRIPT = "bash scripts/ci-cd/live-labels.sh"
	const snapshotReads = (text: string): string[] =>
		text.split("\n").filter((line) => /github\.event\.(pull_request\.labels|label)\b/.test(line))
	const ciFiles = (): string[] =>
		[".github/workflows", ".github/actions"].flatMap((dir) =>
			(readdirSync(join(ROOT, dir), { recursive: true }) as string[])
				.filter((name) => /\.ya?ml$/.test(name))
				.map((name) => join(dir, name)),
		)

	test("no workflow or action reads an event's label snapshot", () => {
		const planted = "          LABEL_HIT: ${{ contains(github.event.pull_request.labels.*.name, 'e2e:smoke') }}"
		expect(snapshotReads(`run: echo\n${planted}`)).toEqual([planted])
		const files = ciFiles()
		expect(files.length).toBeGreaterThan(10)
		for (const file of files) expect(snapshotReads(readFileSync(join(ROOT, file), "utf8")), file).toEqual([])
	})

	test("every lane reads its own two labels live and decides from that output alone", () => {
		for (const [file, labels] of Object.entries(E2E_LANES)) {
			const { changes } = workflow(file).jobs
			const live = changes.steps.find((step: { id?: string }) => step.id === "live")
			expect(live?.run, file).toBe(`${SCRIPT} ${labels.join(" ")}`)
			expect(live?.if, `${file}: runs on every event`).toBeUndefined()
			expect(live?.["continue-on-error"], file).toBeUndefined()
			expect(live?.env, file).toEqual({
				GH_TOKEN: "${{ github.token }}",
				EVENT: "${{ github.event_name }}",
				REPO: "${{ github.repository }}",
				PR: "${{ github.event.pull_request.number }}",
				HEAD_SHA: "${{ github.event.pull_request.head.sha }}",
			})
			expect(changes.outputs, `${file}: the gate's verdict and the attempt it read in, with no fallback`).toEqual({
				run: "${{ steps.gate.outputs.run }}",
				"read-attempt": "${{ steps.live.outputs.read-attempt }}",
			})
			// The gate is the last step, so it reads the live labels, the filter and the dispatch override.
			const [surface, ...others] = Object.keys(filtersOf(file))
			expect(others, `${file}: one paths filter`).toEqual([])
			const gate = changes.steps.at(-1)
			expect(gate, `${file}: the gate step`).toEqual({
				name: "Decide",
				id: "gate",
				env: {
					EVENT: "${{ github.event_name }}",
					BASE: "${{ steps.live.outputs.base }}",
					LABEL_HIT: "${{ steps.live.outputs.label-hit }}",
					SURFACE: `\${{ steps.override.outputs.full || steps.filter.outputs.${surface} }}`,
				},
				run: "bash scripts/ci-cd/e2e-decide.sh",
			})
			expect(workflow(file).jobs.decide, `${file}: no separate decide job`).toBeUndefined()
		}
	})

	test("the unit-tests job reads the move-approval label live, directly before the ratchet runs", () => {
		const { steps } = workflow("_unit-tests.yml").jobs["unit-tests"]
		const at = steps.findIndex((step: { id?: string }) => step.id === "live")
		const live = steps[at]
		expect(live?.run).toBe(
			[
				"if [ -f scripts/ci-cd/live-labels.sh ]; then",
				`  ${SCRIPT} ${MOVE_APPROVED_LABEL}`,
				"else",
				'  echo "scripts/ci-cd/live-labels.sh not present on this ref — skipping."',
				"fi",
				"",
			].join("\n"),
		)
		expect(live.if).toBe("github.event_name == 'pull_request'")
		expect(live["continue-on-error"]).toBeUndefined()
		expect(live.env).toEqual({
			GH_TOKEN: "${{ github.token }}",
			EVENT: "${{ github.event_name }}",
			REPO: "${{ github.repository }}",
			PR: "${{ github.event.pull_request.number }}",
			HEAD_SHA: "${{ github.event.pull_request.head.sha }}",
		})
		const ratchet = steps[at + 1]
		expect(ratchet.run).toContain("bun run test:ci-gating")
		expect(ratchet.env).toEqual({ BASELINE_MOVE_APPROVED: "${{ steps.live.outputs.label-hit }}" })
		const quick = workflow("pr-quick.yml")
		expect(quick.jobs["unit-tests"].uses).toBe("./.github/workflows/_unit-tests.yml")
		expect((quick.jobs["unit-tests"].permissions ?? quick.permissions)["pull-requests"]).toBe("read")
	})

	/**
	 * Runs the live step's script under a `gh` that records its calls and answers with `bodies` in
	 * order (the last one repeats), or fails with `failure`.
	 */
	function runLive(args: string[], env: Record<string, string>, gh: { bodies?: unknown[]; failure?: string }) {
		const dir = mkdtempSync(join(tmpdir(), "live-labels-"))
		try {
			const log = join(dir, "calls")
			const output = join(dir, "output")
			const bodies = gh.bodies ?? [{}]
			for (const [i, body] of bodies.entries()) writeFileSync(join(dir, `body-${i + 1}.json`), JSON.stringify(body))
			writeFileSync(log, "")
			writeFileSync(output, "")
			const shim = gh.failure
				? `echo "$*" >> "${log}"; echo "gh: ${gh.failure}" >&2; exit 1`
				: `echo "$*" >> "${log}"; n=$(wc -l < "${log}"); [ "$n" -gt ${bodies.length} ] && n=${bodies.length}; cat "${dir}/body-$n.json"`
			writeFileSync(join(dir, "gh"), `#!/usr/bin/env bash\n${shim}\n`)
			chmodSync(join(dir, "gh"), 0o755)
			const run = Bun.spawnSync(["bash", "scripts/ci-cd/live-labels.sh", ...args], {
				cwd: ROOT,
				env: { PATH: `${dir}:${process.env.PATH}`, GITHUB_OUTPUT: output, GITHUB_RUN_ATTEMPT: "2", RETRY_PAUSE: "0", ...env },
			})
			return {
				code: run.exitCode,
				stdout: run.stdout.toString(),
				output: readFileSync(output, "utf8").trim(),
				calls: readFileSync(log, "utf8").split("\n").filter(Boolean),
			}
		} finally {
			rmSync(dir, { recursive: true, force: true })
		}
	}

	const HEAD = "a".repeat(40)
	const pr = { EVENT: "pull_request", REPO: "nulo-sh/nulo", PR: "7", HEAD_SHA: HEAD, GH_TOKEN: "t" }
	const body = (labels: string[], head = HEAD) => ({
		head: { sha: head },
		base: { ref: "main" },
		labels: labels.map((name) => ({ name })),
	})
	const outputs = (hit: boolean, base: string) => `label-hit=${hit}\nbase=${base}\nread-attempt=2`

	test.each(Object.entries(E2E_LANES))("%s: the live labels and base decide, read once from the pull request", (_, labels) => {
		const alias = runLive(labels, pr, { bodies: [body(["docs", labels[1]])] })
		expect([alias.code, alias.output, alias.calls]).toEqual([0, outputs(true, "main"), ["api repos/nulo-sh/nulo/pulls/7"]])
		const unrelated = runLive(labels, pr, { bodies: [body(["docs", "e2e:other"])] })
		expect([unrelated.code, unrelated.output]).toEqual([0, outputs(false, "main")])
		const dispatch = runLive(labels, { ...pr, EVENT: "workflow_dispatch", PR: "", HEAD_SHA: "" }, { failure: "unused" })
		expect([dispatch.code, dispatch.output, dispatch.calls]).toEqual([0, outputs(false, ""), []])
	})

	test("a run whose head the pull request moved past stops, whatever its labels, after one late read", () => {
		const labels = E2E_LANES["pr-extension-smoke-e2e.yml"]
		const moved = runLive(labels, pr, { bodies: [body(["e2e:smoke"], "b".repeat(40))] })
		expect([moved.code === 0, moved.output, moved.calls.length]).toEqual([false, "", 2])
		expect(moved.stdout).toContain(`superseded by ${"b".repeat(40)}`)
		const lagging = runLive(labels, pr, { bodies: [body([], "c".repeat(40)), body(["e2e:smoke"])] })
		expect([lagging.code, lagging.output, lagging.calls.length], "an endpoint that trailed the push").toEqual([
			0,
			outputs(true, "main"),
			2,
		])
	})

	test("an unreadable pull request fails closed: one retry for a rate limit or server error, none for a refusal", () => {
		const labels = E2E_LANES["pr-extension-network-e2e.yml"]
		for (const failure of ["API rate limit exceeded (HTTP 403)", "HTTP 502: Bad Gateway", "connection reset by peer"]) {
			const run = runLive(labels, pr, { failure })
			expect([run.code === 0, run.output, run.calls.length], failure).toEqual([false, "", 2])
		}
		const missing = runLive(labels, pr, { failure: "Not Found (HTTP 404)" })
		expect([missing.code === 0, missing.output, missing.calls.length]).toEqual([false, "", 1])
		for (const malformed of [
			{ head: { sha: HEAD }, base: { ref: "dev" } },
			{ head: { sha: HEAD }, labels: [] },
		]) {
			const run = runLive(labels, pr, { bodies: [malformed] })
			expect([run.code === 0, run.output], JSON.stringify(malformed)).toEqual([false, ""])
		}
	})
})

describe("CI behavior-gating guard", () => {
	const smoke = filtersOf("pr-extension-smoke-e2e.yml")["smoke-surface"]
	const network = filtersOf("pr-extension-network-e2e.yml")["extension-network"]
	const quick = filtersOf("pr-quick.yml")

	test("NO `!` negation patterns anywhere (the dorny some-quantifier footgun)", () => {
		for (const wf of FILTER_WORKFLOWS) {
			for (const [name, pats] of Object.entries(filtersOf(wf))) {
				for (const p of pats) {
					expect(p.startsWith("!"), `${wf} → filter '${name}' has a forbidden negation: ${p}`).toBe(false)
				}
			}
		}
	})

	test("smoke-surface covers the extension graph", () => {
		assertGraphCovered(smoke, "extension", "smoke-surface")
	})

	test("extension-network covers the extension graph + the playground harness", () => {
		assertGraphCovered(network, "extension", "extension-network")
		expect(network, "network must gate the playground dApp harness").toContain("apps/playground/**")
	})

	test("needs-extension-build (pr-quick filter union) covers the extension graph", () => {
		const union = [...quick["core-foundation"], ...quick["aztec-runtime"], ...quick["wallet-bridge"], ...quick.extension]
		assertGraphCovered(union, "extension", "needs-extension-build")
	})

	test("a notices-generator change rebuilds both targets, and every build asserts the file shipped", () => {
		const inputs = ["src/**", "package.json", "texts/**", "bin/**", "expected-minimum.txt"].map(
			(path) => `packages/third-party-notices/${path}`,
		)
		// Beyond src + manifest: the licence texts and the expected-minimum list are build inputs too.
		for (const input of inputs) {
			expect(quick.extension, `extension build: ${input}`).toContain(input)
		}
		// biome-ignore lint/suspicious/noExplicitAny: parsed-YAML shape is dynamic.
		const wf = Bun.YAML.parse(readFileSync(join(ROOT, ".github/workflows/_build-extension.yml"), "utf8")) as any
		const steps: { name?: string; run?: string }[] = wf.jobs.build.steps
		const assertion = steps.findIndex((step) => step.run?.includes("third-party-notices/bin/check-minimum.ts"))
		const firstUpload = steps.findIndex((step) => step.name?.startsWith("Upload"))
		expect(assertion, "the assertion step exists").toBeGreaterThan(-1)
		expect(assertion, "an artifact without notices is never uploaded").toBeLessThan(firstUpload)
	})

	test("an extension build builds both targets, so the preview comment links both", () => {
		// biome-ignore lint/suspicious/noExplicitAny: parsed-YAML shape is dynamic.
		const wf = Bun.YAML.parse(readFileSync(join(ROOT, ".github/workflows/pr-quick.yml"), "utf8")) as any
		expect(wf.jobs["build-chrome"].if).toBe("needs.changes.outputs.needs-extension-build == 'true'")
		expect(wf.jobs["build-firefox"].if).toBe(wf.jobs["build-chrome"].if)
	})

	test("Storybook builds wherever the extension does, and reports nothing to Storybook", () => {
		// biome-ignore lint/suspicious/noExplicitAny: parsed-YAML shape is dynamic.
		const wf = Bun.YAML.parse(readFileSync(join(ROOT, ".github/workflows/pr-quick.yml"), "utf8")) as any
		const job = wf.jobs["build-storybook"]
		expect(job.if).toBe(wf.jobs["build-chrome"].if)
		const build = job.steps.find((step: { run?: string }) => step.run?.includes("build-storybook"))
		expect(build?.env?.STORYBOOK_DISABLE_TELEMETRY).toBe("1")
	})

	test("every pull request into main runs the launch check with its live assertion switched on", () => {
		// biome-ignore lint/suspicious/noExplicitAny: parsed-YAML shape is dynamic.
		const wf = Bun.YAML.parse(readFileSync(join(ROOT, ".github/workflows/pr-quick.yml"), "utf8")) as any
		const job = wf.jobs["launch-legal"]
		expect(job.if).toBe("github.event_name == 'pull_request' && github.base_ref == 'main'")
		const check = job.steps.find((step: { run?: string }) => step.run?.includes("launch.test.ts"))
		expect(check?.["working-directory"]).toBe("packages/legal")
		expect(check?.env?.NULO_LAUNCH_GATE, "without it the live assertion skips and the job passes").toBe("1")
		expect(readFileSync(join(ROOT, "packages/legal/src/launch.test.ts"), "utf8")).toContain("process.env.NULO_LAUNCH_GATE")
		const notice = job.steps.find((step: { run?: string }) => step.run?.includes("legal-pages.test.ts"))
		expect(notice?.["working-directory"]).toBe("apps/landing")
		expect(notice?.env?.NULO_LAUNCH_GATE, "the website notice is outside the wallet's launch check").toBe("1")
		expect(readFileSync(join(ROOT, "apps/landing/scripts/legal-pages.test.ts"), "utf8")).toContain("process.env.NULO_LAUNCH_GATE")
		expect(wf.jobs.status.needs).toContain("launch-legal")
	})

	test("landing build covers the landing graph and the documents it renders, and is wired into the aggregator", () => {
		assertGraphCovered(quick.landing, "landing", "landing")
		expect(quick.landing, "a Terms edit must rebuild the pages generated from it").toContain("legal/**")
		// biome-ignore lint/suspicious/noExplicitAny: parsed-YAML shape is dynamic.
		const wf = Bun.YAML.parse(readFileSync(join(ROOT, ".github/workflows/pr-quick.yml"), "utf8")) as any
		expect(wf.jobs["build-landing"].if).toContain("needs-landing-build")
		expect(wf.jobs.changes.outputs["needs-landing-build"]).toBeDefined()
		expect(wf.jobs.status.needs, "a red landing build must red quality-status").toContain("build-landing")
		expect(JSON.stringify(wf.jobs.status.steps)).toContain("needs.build-landing.result")
	})

	test("each e2e lane's filter covers the gate scripts it runs", () => {
		for (const file of Object.keys(E2E_LANES)) {
			const [patterns] = Object.values(filtersOf(file))
			for (const script of GATE_SCRIPTS) expect(patterns, `${file} → ${script}`).toContain(script)
		}
	})

	test("cross-cutting inputs (patches + root build inputs) gate the e2e suites", () => {
		for (const [label, pats] of [
			["smoke", smoke],
			["network", network],
		] as const) {
			expect(pats, `${label}: patches/** rewrites installed deps`).toContain("patches/**")
			for (const root of ["package.json", "bun.lock", "bunfig.toml", "tsconfig.json"]) {
				expect(pats, `${label}: root input ${root}`).toContain(root)
			}
		}
	})

	// The shard pool / dedicated-job partition of the network suite is pinned on the lane under
	// "network lane" below.

	// The self-pay phase gate — the wallet simulating and sending as the account a dApp names,
	// with the node's setup allow-list enforced — must keep running on every PR: the matrix in a
	// dedicated heavy job at retry 0 (a retry would re-mask an intermittent wallet regression),
	// the cheap two-account simulate in the shard pool (never excluded, so it cannot drop out).
	test("network-e2e keeps the self-pay phase gate in place at retry 0", () => {
		const words = (v: unknown): string[] => (typeof v === "string" ? v.split(/\s+/).filter(Boolean) : [])
		const calls = suiteCalls("pr-extension-network-e2e.yml")

		const matrix = calls.filter(({ inputs }) => words(inputs.test_files).includes("tests/e2e/network/selfpay-phase.test.ts"))
		expect(
			matrix.map(({ inputs }) => [inputs.retry, inputs.proverless]),
			"selfpay-phase runs in one dedicated job, proverless like the other heavy fee flows, at retry 0",
		).toEqual([["0", true]])

		const pool = calls.filter(({ inputs }) => inputs.exclude_files)
		expect(pool.length, "the shard pool").toBeGreaterThan(0)
		for (const { name, inputs } of pool) {
			expect(words(inputs.exclude_files), `${name}: sim-from-selfpay stays in the shard pool`).not.toContain(
				"tests/e2e/network/sim-from-selfpay.test.ts",
			)
			expect(inputs.retry, `${name} runs at retry 0`).toBe("0")
		}
		expect(existsSync(join(ROOT, "apps/extension/tests/e2e/network/sim-from-selfpay.test.ts")), "sim-from-selfpay exists").toBe(true)
		expect(existsSync(join(ROOT, "apps/extension/tests/e2e/network/selfpay-phase.test.ts")), "selfpay-phase exists").toBe(true)
	})

	test("both reusable suites take their retry count from one input, empty by default, as NULO_E2E_RETRY", () => {
		// biome-ignore lint/suspicious/noExplicitAny: parsed-YAML shape is dynamic.
		const reusable = (file: string): any => Bun.YAML.parse(readFileSync(join(ROOT, ".github/workflows", file), "utf8"))
		const smoke = reusable("_extension-smoke-e2e.yml")
		const network = reusable("_extension-network-e2e.yml")
		for (const wf of [smoke, network]) expect(wf.on.workflow_call.inputs.retry).toMatchObject({ type: "string", default: "" })
		// biome-ignore lint/suspicious/noExplicitAny: parsed-YAML shape is dynamic.
		const run = smoke.jobs.smoke.steps.find((step: any) => step.name === "Run smoke e2e")
		expect(run.env.NULO_E2E_RETRY).toBe("${{ inputs.retry }}")
		expect(network.jobs["network-e2e"].env.NULO_E2E_RETRY).toBe("${{ inputs.retry }}")
	})
})

/**
 * The Firefox lanes are twins of the Chrome ones (PR aggregators required on dev, the smoke one on
 * main too), and the release's smoke of the shipped Firefox zip gates its assets. Two ways that can
 * rot silently: a twin drifts from the lane it mirrors (a file stops running on Firefox and nothing
 * says so), or a Firefox job slips into, or out of, the needs of an aggregator or publish step.
 * Nightly's gates are pinned by running them, in aggregators.test.ts.
 */
describe("Firefox lanes", () => {
	// biome-ignore lint/suspicious/noExplicitAny: parsed-YAML shape is dynamic.
	const workflow = (file: string): any => Bun.YAML.parse(readFileSync(join(ROOT, ".github/workflows", file), "utf8"))
	const words = (v: unknown): string[] => (typeof v === "string" ? v.split(/\s+/).filter(Boolean) : [])
	type SuiteJob = { uses?: string; with?: Record<string, unknown>; strategy?: unknown; needs?: unknown; if?: unknown; secrets?: unknown }
	const TWINS = [
		{ chrome: "pr-extension-smoke-e2e.yml", firefox: "pr-extension-smoke-e2e-firefox.yml", filter: "smoke-surface" },
		{ chrome: "pr-extension-network-e2e.yml", firefox: "pr-extension-network-e2e-firefox.yml", filter: "extension-network" },
	]

	test("each Firefox filter is its Chrome twin's, re-pointed at its own file, plus geckodriver", () => {
		for (const { chrome, firefox, filter } of TWINS) {
			const expected = filtersOf(chrome)
				[filter].map((pattern) => (pattern === `.github/workflows/${chrome}` ? `.github/workflows/${firefox}` : pattern))
				.concat(".github/actions/setup-geckodriver/**")
			expect([...filtersOf(firefox)[filter]].sort(), firefox).toEqual([...expected].sort())
		}
	})

	test("every Firefox PR suite job runs exactly the Chrome job's files on firefox", () => {
		for (const { chrome, firefox } of TWINS) {
			const [chromeJobs, firefoxJobs] = [workflow(chrome).jobs, workflow(firefox).jobs]
			expect(Object.keys(firefoxJobs), firefox).toEqual(Object.keys(chromeJobs))
			for (const [name, job] of Object.entries(chromeJobs) as [string, SuiteJob][]) {
				if (!job.uses) continue
				const twin: SuiteJob = firefoxJobs[name]
				expect(job.with?.browser, `${chrome} → ${name} stays on the default browser`).toBeUndefined()
				// Whole-shape equality: a dropped shard, input, dependency or condition is a lost file.
				const { test_files: chromeFiles, ...chromeWith } = job.with ?? {}
				const { test_files: firefoxFiles, ...firefoxWith } = twin.with ?? {}
				expect(firefoxWith, `${firefox} → ${name} with`).toEqual({ ...chromeWith, browser: "firefox" })
				expect(words(firefoxFiles), `${firefox} → ${name} test_files`).toEqual(words(chromeFiles))
				for (const key of ["uses", "strategy", "needs", "if", "secrets"] as const) {
					expect(twin[key], `${firefox} → ${name} ${key}`).toEqual(job[key])
				}
			}
		}
	})

	// A lane's aggregator passes when its gate skips the suites, so a twin whose gate skips where its
	// Chrome lane runs passes a head its Firefox suites never ran on.
	test("the Firefox PR lanes hold no write scope, and trigger, decide and aggregate exactly like their Chrome twins", () => {
		for (const { chrome, firefox } of TWINS) {
			const [chromeWf, wf] = [workflow(chrome), workflow(firefox)]
			expect(wf.permissions, firefox).toEqual({ contents: "read" })
			for (const [name, job] of Object.entries(wf.jobs) as [string, { permissions?: unknown }][]) {
				const want = name === "changes" ? { contents: "read", "pull-requests": "read" } : undefined
				expect(job.permissions, `${firefox} → ${name}`).toEqual(want)
			}
			expect(wf.on, `${firefox} triggers`).toEqual(chromeWf.on)
			expect(wf.jobs.changes.steps.at(-1), `${firefox} → the gate step`).toEqual(chromeWf.jobs.changes.steps.at(-1))
			const { name: _, ...status } = wf.jobs.status
			const { name: __, ...chromeStatus } = chromeWf.jobs.status
			expect(status, `${firefox} → status`).toEqual(chromeStatus)
		}
	})

	/** Every key and string the runner evaluates or executes: names, descriptions and shell comments aside. */
	const evaluated = (node: unknown, key = ""): string[] => {
		if (typeof node === "string") return key === "name" || key === "description" ? [] : key === "run" ? commandLines(node) : [node]
		if (Array.isArray(node)) return node.flatMap((item) => evaluated(item))
		if (typeof node !== "object" || node === null) return []
		return Object.entries(node).flatMap(([k, v]) => [k, ...evaluated(v, k)])
	}

	// A draft runs every e2e lane as the same PR ready would: a gate that skipped it would pass the
	// draft, and once marked ready the PR would merge on that pass while its suites still ran.
	test("no PR e2e lane reads the draft flag", () => {
		for (const file of TWINS.flatMap(({ chrome, firefox }) => [chrome, firefox])) {
			const reads = evaluated(workflow(file)).filter((text) => /draft/i.test(text))
			expect(reads, file).toEqual([])
		}
		// A script reaches the flag through the event payload, which the YAML scan above never sees.
		for (const script of GATE_SCRIPTS) {
			const reads = commandLines(readFileSync(join(ROOT, script), "utf8")).filter((line) => /draft|GITHUB_EVENT_PATH/i.test(line))
			expect(reads, script).toEqual([])
		}
	})

	// Exact, not a /firefox/ denylist: quality-status legitimately needs `build-firefox`.
	test("the required extension aggregators wait on exactly the Chrome suites", () => {
		expect(workflow("pr-extension-smoke-e2e.yml").jobs.status.needs).toEqual(["changes", "smoke"])
		expect(workflow("pr-extension-network-e2e.yml").jobs.status.needs).toEqual(["changes", "network-e2e"])
	})

	test("only release.yml's assets and status wait on a Firefox job there: the smoke of the shipped zip", () => {
		// biome-ignore lint/suspicious/noExplicitAny: parsed-YAML shape is dynamic.
		const waitsOnFirefox = (jobs: Record<string, any>) => {
			const firefoxJobs = Object.keys(jobs).filter((name) => jobs[name].with?.browser === "firefox")
			const waiting = Object.entries(jobs).map(([name, job]) => [
				name,
				[job.needs ?? []].flat().filter((need: string) => firefoxJobs.includes(need)),
			])
			return { firefoxJobs, waiting: Object.fromEntries(waiting.filter(([, needs]) => needs.length > 0)) }
		}
		const { jobs } = workflow("release.yml")
		const release = waitsOnFirefox(jobs)
		expect(release.firefoxJobs).toEqual(["smoke-firefox-against-artifact"])
		expect(release.waiting).toEqual({
			"attach-assets": ["smoke-firefox-against-artifact"],
			status: ["smoke-firefox-against-artifact"],
		})
		// A need the aggregator never reads would let a red smoke through a green status; aggregators.test.ts
		// proves each bound result is checked.
		expect(Object.values(jobs.status.steps[0].env)).toContain("${{ needs.smoke-firefox-against-artifact.result }}")
		expect(jobs["attach-assets"].if).toContain("needs.smoke-firefox-against-artifact.result == 'success'")
	})

	test("the shared pieces default to chrome, and the browser caches share no key prefix", () => {
		for (const file of ["_extension-smoke-e2e.yml", "_extension-network-e2e.yml", "_extension-network-e2e-lane.yml"]) {
			expect(workflow(file).on.workflow_call.inputs.browser.default, file).toBe("chrome")
		}
		// biome-ignore lint/suspicious/noExplicitAny: parsed-YAML shape is dynamic.
		const action = Bun.YAML.parse(readFileSync(join(ROOT, ".github/actions/setup-puppeteer/action.yml"), "utf8")) as any
		expect(action.inputs.browser.default).toBe("chrome")
		// biome-ignore lint/suspicious/noExplicitAny: parsed-YAML shape is dynamic.
		const caches = action.runs.steps.filter((step: any) => String(step.uses).startsWith("actions/cache@"))
		const [chrome, firefox] = ["chrome", "firefox"].map((browser) =>
			// biome-ignore lint/suspicious/noExplicitAny: parsed-YAML shape is dynamic.
			caches.find((step: any) => step.if === `inputs.browser == '${browser}'`),
		)
		const chromePrefix = String(chrome.with["restore-keys"]).trim()
		expect(chromePrefix.length).toBeGreaterThan(0)
		expect(String(firefox.with.key).startsWith(chromePrefix), "a Firefox key Chrome's restore prefix would match").toBe(false)
		expect(firefox.with["restore-keys"]).toBeUndefined()
	})
})

/**
 * A sharded suite runs only the files its matrix names: an index skipped or repeated, or a count
 * the list disagrees with, leaves files unrun while the aggregator stays green.
 */
describe("shard matrices", () => {
	test("every shard matrix runs 1/N to N/N once, each runner handed its own shard and label", () => {
		type MatrixJob = { strategy?: { matrix?: { shard?: unknown[] } }; with?: Record<string, unknown> }
		let checked = 0
		for (const file of readdirSync(join(ROOT, ".github/workflows")).filter((name) => name.endsWith(".yml"))) {
			// biome-ignore lint/suspicious/noExplicitAny: parsed-YAML shape is dynamic.
			const wf = Bun.YAML.parse(readFileSync(join(ROOT, ".github/workflows", file), "utf8")) as any
			for (const [name, job] of Object.entries(wf.jobs ?? {}) as [string, MatrixJob][]) {
				const shards = job.strategy?.matrix?.shard
				if (!shards) continue
				const want = shards.map((_, i) => ({ id: `${i + 1}/${shards.length}`, label: `${i + 1}-of-${shards.length}` }))
				expect(shards, `${file} → ${name}`).toEqual(want)
				// An `exclude` (or any other key) could drop a shard from both twins while the list above holds.
				expect(Object.keys(job.strategy?.matrix ?? {}), `${file} → ${name} matrix keys`).toEqual(["shard"])
				expect(job.with?.shard, `${file} → ${name} shard`).toBe("${{ matrix.shard.id }}")
				expect(job.with?.shard_label, `${file} → ${name} shard_label`).toBe("${{ matrix.shard.label }}")
				checked++
			}
		}
		expect(checked, "the scan found the sharded suites").toBeGreaterThan(0)
	})
})

/**
 * What a lane caller may vary, each input whole, description aside. The partition, its labels and the
 * fixed seeds are the lane's alone; a caller that omits an input runs on these defaults, the suite's own.
 */
const LANE_INPUTS: Record<string, { required: boolean; type: string; default?: unknown }> = {
	ref: { required: true, type: "string" },
	browser: { required: false, type: "string", default: "chrome" },
	retry: { required: false, type: "string", default: "" },
	disable_presto: { required: false, type: "boolean", default: false },
	chaos_seed: { required: false, type: "string", default: "" },
}
const LANE_JOB_KEYS = ["name", "strategy", "uses", "with"]

/** A lane job's faults: see laneShapeFaults. */
function laneJobFaults(id: string, job: CallerJob & Record<string, unknown>): string[] {
	const allowed = id in CHAOS_PAIR ? [...LANE_JOB_KEYS, "if"] : LANE_JOB_KEYS
	const faults = Object.keys(job)
		.filter((key) => !allowed.includes(key))
		.map((key) => `${id}: takes ${key}`)
	if (id in CHAOS_PAIR && job.if !== CHAOS_PAIR[id].if) faults.push(`${id}: if is not ${CHAOS_PAIR[id].if}`)
	if (job.strategy !== undefined && job.strategy["fail-fast"] !== false) faults.push(`${id}: a red leg cancels the others`)
	if (job.uses !== `./.github/workflows/${NETWORK_SUITE}`) faults.push(`${id}: does not call the suite`)
	for (const key of ["ref", "browser", "retry"])
		if (job.with?.[key] !== `\${{ inputs.${key} }}`) faults.push(`${id}: ${key} is not the caller's`)
	// The kill switch reaches the prover-ON job, the only one that starts Presto.
	const killSwitch = job.with?.proverless === true ? undefined : "${{ inputs.disable_presto }}"
	if (job.with?.disable_presto !== killSwitch) faults.push(`${id}: disable_presto is not ${killSwitch ?? "absent"}`)
	return faults
}

/**
 * What lets a lane run differ from the one result its caller reads: a job that can skip (an `if`
 * or `needs` beyond the chaos pair's complementary `if`), a matrix whose red leg cancels the others,
 * a job that does not run the suite on the caller's commit, browser and retry, a kill switch that
 * misses the prover-ON job, or an input beyond LANE_INPUTS or off its default.
 */
function laneShapeFaults(lane: {
	on?: { workflow_call?: { inputs?: Record<string, object> } }
	jobs: Record<string, CallerJob>
}): string[] {
	const inputs = Object.fromEntries(
		Object.entries(lane.on?.workflow_call?.inputs ?? {}).map(
			([key, { description: _, ...spec }]: [string, { description?: unknown }]) => [key, spec],
		),
	)
	const faults = Bun.deepEquals(inputs, LANE_INPUTS, true) ? [] : [`inputs: ${JSON.stringify(inputs)}`]
	for (const [id, job] of Object.entries(lane.jobs)) faults.push(...laneJobFaults(id, job))
	for (const id of Object.keys(CHAOS_PAIR)) if (!(id in lane.jobs)) faults.push(`${id}: missing`)
	return faults
}

/**
 * The network lane holds the suite's one partition: the files the proverless shard pool runs, the
 * dedicated jobs and their files, and the fixed chaos seeds. What could rot silently: a file in
 * neither the pool nor a dedicated job, or in both; a canary moved out of its prover-ON job; a lane
 * job that skips, which its caller's one result hides; a caller handing the lane something these
 * pins never saw; a second copy of the partition beside the lane.
 */
describe("network lane", () => {
	const words = (v: unknown): string[] => (typeof v === "string" ? v.split(/\s+/).filter(Boolean) : [])
	const lane = workflowOf(NETWORK_LANE)
	const laneJobs = Object.entries(lane.jobs) as [string, CallerJob][]
	const workflowFiles = readdirSync(join(ROOT, ".github/workflows")).filter((name) => name.endsWith(".yml"))
	/** Every `<file> → <job>` that calls the given reusable workflow. */
	const callersOf = (reusable: string): string[] =>
		workflowFiles
			.flatMap((file) =>
				(Object.entries(workflowOf(file).jobs ?? {}) as [string, CallerJob][])
					.filter(([, job]) => job.uses === `./.github/workflows/${reusable}`)
					.map(([id]) => `${file} → ${id}`),
			)
			.sort()
	const canaryFiles = readdirSync(join(ROOT, "apps/extension/tests/e2e/network"))
		.filter((name) => name.endsWith("-canary.test.ts"))
		.sort()
		.map((name) => `tests/e2e/network/${name}`)

	test("the two execution canaries are on disk", () => {
		expect(canaryFiles).toEqual([
			"tests/e2e/network/frozen-account-canary.test.ts",
			"tests/e2e/network/passkey-execution-canary.test.ts",
		])
	})

	// Only nightly hands a seed: a PR or a release replays the fixed pair at its own retry.
	test("each caller hands the lane exactly its row, and nothing else calls the lane", () => {
		expect(callersOf(NETWORK_LANE)).toEqual(LANE_CALLERS.map(({ file, job }) => `${file} → ${job}`).sort())
		for (const caller of LANE_CALLERS) {
			const job: CallerJob = workflowOf(caller.file).jobs[caller.job]
			const at = `${caller.file} → ${caller.job}`
			expect(Object.keys(job).sort(), `${at} keys`).toEqual(["if", "name", "needs", "uses", "with"])
			expect(job.name, `${at} name`).toBe(caller.name)
			expect(job.needs, `${at} needs`).toEqual(caller.needs)
			expect(foldSpace(job.if), `${at} if`).toBe(caller.if)
			expect(job.with, `${at} with`).toStrictEqual(caller.with)
		}
		expect(
			LANE_CALLERS.filter((caller) => "chaos_seed" in caller.with).map(({ file }) => file),
			"only nightly hands a seed",
		).toEqual(["nightly.yml", "nightly.yml"])
	})

	test("nothing calls the suite but the lane, the soak and nightly's in-browser leg", () => {
		expect(callersOf(NETWORK_SUITE)).toEqual(
			[
				...laneJobs.map(([id]) => `${NETWORK_LANE} → ${id}`),
				"extension-network-e2e-soak.yml → soak",
				`nightly.yml → ${WASM_LEG}`,
			].sort(),
		)
	})

	test("every lane job runs whenever its caller does, on the caller's commit, browser and retry", () => {
		expect(laneShapeFaults(lane)).toEqual([])
	})

	test("the lane-shape check refuses a gated job, a matrix that fails fast, a moved default and a dropped kill switch", () => {
		const gated = structuredClone(lane)
		gated.jobs["network-e2e-canary"].if = "inputs.chaos_seed == ''"
		expect(laneShapeFaults(gated)).toEqual(["network-e2e-canary: takes if"])
		const failsFast = structuredClone(lane)
		failsFast.jobs["network-e2e"].strategy["fail-fast"] = undefined
		expect(laneShapeFaults(failsFast)).toEqual(["network-e2e: a red leg cancels the others"])
		const firefox = structuredClone(lane)
		firefox.on.workflow_call.inputs.browser.default = "firefox"
		expect(laneShapeFaults(firefox)).toHaveLength(1)
		const noKillSwitch = structuredClone(lane)
		noKillSwitch.jobs["network-e2e-canary"].with.disable_presto = undefined
		expect(laneShapeFaults(noKillSwitch)).toEqual(["network-e2e-canary: disable_presto is not ${{ inputs.disable_presto }}"])
	})

	// "Prover-ON" is the `proverless` input, not the job being dedicated: a heavy job is dedicated too.
	test("every canary runs prover-ON in one canary* job, and is out of the shard pool", () => {
		const pools = laneJobs.filter(([, job]) => job.with?.exclude_files)
		expect(
			pools.map(([id]) => id),
			"one shard pool",
		).toEqual(["network-e2e"])
		const excluded = words(pools[0][1].with?.exclude_files)
		for (const canary of canaryFiles) {
			const carriers = laneJobs.filter(([, job]) => words(job.with?.test_files).includes(canary))
			expect(
				carriers.map(([id]) => id),
				`${canary} runs in one dedicated job`,
			).toHaveLength(1)
			const [, job] = carriers[0]
			expect(job.with?.proverless, `${canary} runs prover-ON`).not.toBe(true)
			expect(String(job.with?.shard_label), `${canary}'s job is a canary lane`).toStartWith("canary")
			expect(excluded, `${canary} is out of the shard pool`).toContain(canary)
		}
	})

	// Every other prover-ON job proves natively unless the rollback variable is set, so this leg is the
	// canary files' only run on the prover users without Presto get. Its label must start with `canary`
	// for the results assertion to arm, and the suite must map `disable_presto` to neither proverless
	// nor required mode, or the leg would pass without proving in the browser. aggregators.test.ts
	// holds it advisory.
	test("nightly's in-browser leg runs the canary job's files, on the same nights, with Presto off", () => {
		const { jobs } = workflowOf("nightly.yml")
		const [leg, call] = [jobs[WASM_LEG], jobs["network-e2e"]]
		expect(leg.uses).toBe(`./.github/workflows/${NETWORK_SUITE}`)
		expect(leg.needs).toEqual(call.needs)
		expect(leg.if).toBe(call.if)
		expect(leg.strategy).toBeUndefined()
		const { test_files, ...inputs } = leg.with
		expect(words(test_files)).toEqual(words(lane.jobs["network-e2e-canary"].with.test_files))
		expect(inputs).toEqual({ ref: call.with.ref, shard_label: "canary-wasm", disable_presto: true })
		const env = workflowOf(NETWORK_SUITE).jobs["network-e2e"].env
		expect(env.NULO_E2E_PROVERLESS).toBe("${{ inputs.proverless && '1' || '' }}")
		expect(env.VITE_NULO_PRESTO_REQUIRED).toBe("${{ (inputs.disable_presto == false && inputs.proverless == false) && '1' || '' }}")
	})

	// A file in a dedicated job's list but not the pool's runs twice; one in neither never runs.
	test("the shard pool excludes exactly the union of the dedicated jobs' files", () => {
		const excluded = laneJobs.flatMap(([, job]) => words(job.with?.exclude_files))
		const dedicated = laneJobs.flatMap(([, job]) => words(job.with?.test_files))
		expect(dedicated.length, "dedicated jobs exist").toBeGreaterThan(0)
		expect([...excluded].sort(), "exclude_files == union of test_files").toEqual([...new Set(dedicated)].sort())
	})

	// The same-token matrix holds the node's block production, which a shard's files share. The chaos
	// file runs only in the chaos pair, armed by its `chaos` input; anywhere else it skips itself.
	test("the same-token matrix runs proverless in a dedicated job, and the chaos file only in the chaos pair", () => {
		const matrix = "tests/e2e/network/same-token-concurrent-sends.test.ts"
		const chaos = "tests/e2e/network/send-chaos.test.ts"
		const carriers = laneJobs.filter(([, job]) => words(job.with?.test_files).includes(matrix))
		expect(
			carriers.map(([, job]) => job.with?.proverless),
			matrix,
		).toEqual([true])
		const chaosJobs = laneJobs.filter(([, job]) => job.with?.chaos === true || words(job.with?.test_files).includes(chaos))
		expect(chaosJobs.map(([id, job]) => [id, words(job.with?.test_files), job.with?.chaos, job.with?.proverless])).toEqual(
			Object.keys(CHAOS_PAIR).map((id) => [id, [chaos], true, true]),
		)
	})

	// A PR or a release replays the fixed seeds, each leg with its own seed and logs artifact. Nightly
	// hands a seed of its own (its LANE_CALLERS row), which "Re-run failed jobs" keeps, so it runs the
	// other branch, under the name it always had.
	test("the chaos pair replays two fixed seeds, or the one seed its caller hands", () => {
		const [fixed, seeded] = Object.keys(CHAOS_PAIR).map((id) => lane.jobs[id] as CallerJob)
		expect(Object.keys(fixed.strategy?.matrix ?? {}), "one matrix key, no include or exclude").toEqual(["seed"])
		const seeds = fixed.strategy?.matrix?.seed as unknown[]
		expect(seeds, "two seeds").toHaveLength(2)
		expect(new Set(seeds).size, "distinct seeds").toBe(2)
		for (const seed of seeds) expect(seed, "a quoted decimal seed").toEqual(expect.stringMatching(/^\d{1,10}$/))
		const { chaos_seed, shard_label, ...rest } = fixed.with ?? {}
		expect([chaos_seed, shard_label]).toEqual(["${{ matrix.seed }}", "chaos-${{ matrix.seed }}"])
		expect(seeded.with, "the seeded branch differs only in its seed and label").toStrictEqual({
			...rest,
			chaos_seed: "${{ inputs.chaos_seed }}",
			shard_label: "chaos",
		})
		for (const caller of LANE_CALLERS) {
			const runs = callsOf(caller.job, workflowOf(caller.file).jobs[caller.job])
				.filter(({ inputs }) => inputs.chaos === true)
				.map(({ name, inputs }) => [name, inputs.chaos_seed])
			const want =
				"chaos_seed" in caller.with
					? [[`${caller.name} / chaos / sends`, caller.with.chaos_seed]]
					: seeds.map((seed) => [`${caller.name} / chaos / seed ${seed}`, seed])
			expect(runs, `${caller.file} → ${caller.job}`).toEqual(want)
		}
	})

	// The reusable workflow folds newlines before `read -ra`; a block-scalar list is refused here as well,
	// since the whitespace-splitting pins above would accept one that the steps then mis-parse.
	test("every file list is one line", () => {
		for (const [id, job] of laneJobs) {
			for (const key of ["test_files", "exclude_files"] as const) {
				const value = job.with?.[key]
				if (value !== undefined) expect(String(value), `${id} ${key}`).not.toContain("\n")
			}
		}
	})

	// A job in `needs` that the aggregator never reads can be red under a green check, so each lane
	// hands the shared script every need at once: the suite list lives in `needs` alone.
	test("every e2e aggregator reads all its needs through toJSON(needs), and runs the shared script", () => {
		for (const file of Object.keys(E2E_LANES)) {
			const steps = workflowOf(file).jobs.status.steps as { name?: string; run?: string; env?: Record<string, string> }[]
			const runs = steps.filter((step) => step.run !== undefined)
			expect(runs, file).toEqual([
				{ name: "Aggregate results", env: { NEEDS: "${{ toJSON(needs) }}" }, run: "bash scripts/ci-cd/e2e-aggregate.sh" },
			])
		}
	})

	// Pinned whole, not by fragment: a narrower condition, a `continue-on-error` or a commented-out call
	// would each keep the fragment while disarming the step.
	test("the reusable workflow asserts the results of every chaos job, every canary* label and every soak* label", () => {
		type Step = { name?: string; if?: string; run?: string; env?: Record<string, string>; "continue-on-error"?: unknown }
		const job = workflowOf(NETWORK_SUITE).jobs["network-e2e"]
		expect(job["continue-on-error"], "the suite job fails when a step does").toBeUndefined()
		const steps = job.steps as Step[]
		const results = steps.find((step) => step.name === "Assert canary results")
		expect(results, "the results step exists").toBeDefined()
		expect(results?.if).toBe("${{ always() && !cancelled() && (inputs.chaos || startsWith(inputs.shard_label, 'canary')) }}")
		expect(results?.["continue-on-error"], "a red assertion is a red job").toBeUndefined()
		expect(commandLines(results?.run)).toContain(
			'bun scripts/ci-cd/assert-canary-results.ts "${RUNNER_TEMP}/canary-results.json" "${TEST_FILE_LIST[@]}"',
		)
		const soak = steps.find((step) => step.name === "Assert soak results")
		expect(soak?.if).toBe("${{ always() && !cancelled() && startsWith(inputs.shard_label, 'soak') }}")
		expect(soak?.["continue-on-error"], "a red soak assertion is a red job").toBeUndefined()
		expect(soak?.env).toStrictEqual({ TEST_FILES: "${{ inputs.test_files }}" })
		expect(commandLines(soak?.run)).toEqual([
			`read -ra TEST_FILE_LIST <<< "\${TEST_FILES//$'\\n'/ }"`,
			'bun scripts/ci-cd/assert-canary-results.ts --allow-unlisted "${RUNNER_TEMP}/canary-results.json" "${TEST_FILE_LIST[@]}"',
		])
		const run = steps.find((step) => step.name === "Run network e2e via agent")
		expect(run?.env?.NULO_E2E_RESULTS_FILE, "a chaos, canary* or soak* run writes the report").toBe(
			"${{ (inputs.chaos || startsWith(inputs.shard_label, 'canary') || startsWith(inputs.shard_label, 'soak')) && format('{0}/canary-results.json', runner.temp) || '' }}",
		)
		expect(run?.["continue-on-error"]).toBeUndefined()
		const presto = steps.find((step) => String(step.name).startsWith("Assert presto activity"))
		expect(presto?.["continue-on-error"]).toBeUndefined()
		expect(commandLines(presto?.run), "the zero-proofs check matches canary* too").toContain(
			'if [ "$PROVE_SUCCESS" -eq 0 ] && [[ "$SHARD_LABEL" == canary* ]]; then',
		)
		expect(existsSync(join(ROOT, "scripts/ci-cd/assert-canary-results.ts"))).toBe(true)
	})
})

/**
 * The soak repeats named network files at retry 0, so `prep` must refuse every input it can judge
 * before a build: a list that names no file or names something vitest would read as an option, a
 * filter or a missing file, and a repeat count or retry the run would not honour. `gen` runs here as
 * the runner runs it, and the first test holds the wiring that hands it exactly the dispatch inputs.
 */
describe("network soak", () => {
	const SOAK = "extension-network-e2e-soak.yml"
	const soak = workflowOf(SOAK)
	const gen = soak.jobs.prep.steps.find((step: { id?: string }) => step.id === "gen")
	const TOKENIZE = `read -ra TEST_FILE_LIST <<< "\${TEST_FILES//$'\\n'/ }"`
	const NETWORK_FILE = "tests/e2e/network/cap-request-basic.test.ts"
	const EGRESS_GUARD = "tests/e2e/egress-guard.test.ts"
	type Dispatch = { TEST_FILES: string; REPEATS: string; RETRY: string }
	const named = (files: string): Dispatch => ({ TEST_FILES: files, REPEATS: "5", RETRY: "0" })

	function prep(dispatch: Dispatch): { code: number; iterations?: string; said: string } {
		const dir = mkdtempSync(join(tmpdir(), "soak-prep-"))
		try {
			const output = join(dir, "output")
			writeFileSync(output, "")
			const env = { PATH: process.env.PATH ?? "/usr/bin:/bin", GITHUB_OUTPUT: output, ...dispatch }
			const run = Bun.spawnSync(["bash", "--noprofile", "--norc", "-c", gen.run], { cwd: ROOT, env, stdout: "pipe", stderr: "pipe" })
			const iterations = /^iterations=(.*)$/m.exec(readFileSync(output, "utf8"))?.[1]
			return { code: run.exitCode, iterations, said: run.stdout.toString() }
		} finally {
			rmSync(dir, { recursive: true, force: true })
		}
	}
	function refused(dispatch: Dispatch): string {
		const { code, iterations, said } = prep(dispatch)
		expect(code, JSON.stringify(dispatch)).not.toBe(0)
		expect(iterations, JSON.stringify(dispatch)).toBeUndefined()
		return said
	}

	test("prep, the iterations and the status read exactly the dispatch inputs", () => {
		const inputs = soak.on.workflow_dispatch.inputs
		expect(Object.keys(inputs).sort()).toEqual(["disable_presto", "proverless", "repeats", "retry", "test_files"])
		expect(inputs.test_files.required).toBe(true)
		expect(inputs.test_files.default).toBeUndefined()
		expect(soak.jobs.prep.steps[0]).toStrictEqual({
			uses: "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1",
			with: { "persist-credentials": false, "sparse-checkout": "apps/extension/tests/e2e" },
		})
		expect(gen.env).toStrictEqual({
			TEST_FILES: "${{ inputs.test_files }}",
			REPEATS: "${{ inputs.repeats }}",
			RETRY: "${{ inputs.retry }}",
		})
		expect(soak.jobs.prep.outputs).toStrictEqual({ iterations: "${{ steps.gen.outputs.iterations }}" })
		expect(soak.jobs.soak.needs).toBe("prep")
		expect(soak.jobs.soak.strategy).toStrictEqual({
			"fail-fast": false,
			"max-parallel": 1,
			matrix: { iteration: "${{ fromJSON(needs.prep.outputs.iterations) }}" },
		})
		expect(soak.jobs.soak.uses).toBe(`./.github/workflows/${NETWORK_SUITE}`)
		expect(soak.jobs.soak.with).toStrictEqual({
			ref: "${{ github.ref }}",
			shard_label: "soak-${{ matrix.iteration }}",
			test_files: "${{ inputs.test_files }}",
			proverless: "${{ inputs.proverless }}",
			disable_presto: "${{ inputs.disable_presto }}",
			retry: "${{ inputs.retry }}",
		})
		const status = soak.jobs.status
		expect(status.needs).toEqual(["prep", "soak"])
		expect(status.if).toBe("always()")
		expect(status.steps[0].env).toStrictEqual({
			PREP: "${{ needs.prep.result }}",
			SOAK: "${{ needs.soak.result }}",
			REPEATS: "${{ inputs.repeats }}",
			RETRY: "${{ inputs.retry }}",
		})
		const suite = workflowOf(NETWORK_SUITE).jobs["network-e2e"].steps as { name?: string; run?: string }[]
		const suiteRun = suite.find((step) => step.name === "Run network e2e via agent")
		for (const script of [gen.run, status.steps[0].run]) expect(script).not.toContain("${{")
		for (const script of [gen.run, suiteRun?.run]) expect(commandLines(script)).toContain(TOKENIZE)
	})

	test("refuses a list that names no file, and names the whole-suite instruments", () => {
		for (const files of ["", "   ", " \n\t "]) {
			const said = refused(named(files))
			for (const lane of ["pr-extension-network-e2e.yml", "pr-extension-network-e2e-firefox.yml"])
				expect(said).toContain(`'${workflowOf(lane).name}'`)
		}
	})

	test("refuses a token that is not a network test file at this commit", () => {
		expect(existsSync(join(ROOT, "apps/extension/tests/e2e/accounts.test.ts")), "the smoke file exists").toBe(true)
		for (const files of [
			"--passWithNoTests",
			`${NETWORK_FILE} --exclude=**`,
			"tests/e2e/network",
			"tests/e2e/network/../network/cap-request-basic.test.ts",
			"tests/e2e/network/*.test.ts",
			"tests/e2e/accounts.test.ts",
			`${NETWORK_FILE} tests/e2e/network/cap-request-basci.test.ts`,
		])
			refused(named(files))
	})

	test("refuses a repeat count outside 1 to 25 and a retry beyond one digit", () => {
		for (const REPEATS of ["0", "26", "5x", "05", ""]) refused({ ...named(NETWORK_FILE), REPEATS })
		for (const RETRY of ["abc", "10", "-1"]) refused({ ...named(NETWORK_FILE), RETRY })
	})

	// `startsWith` in Actions ignores case, so a lane job labelled `Soak…` would arm the strict read-back.
	test("no network suite call but the soak's carries a soak* label", () => {
		const callers = readdirSync(join(ROOT, ".github/workflows")).filter((file) => {
			const jobs = Object.values(workflowOf(file).jobs ?? {}) as CallerJob[]
			return (
				file !== SOAK &&
				jobs.some(
					(job) => job.uses === `./.github/workflows/${NETWORK_LANE}` || job.uses === `./.github/workflows/${NETWORK_SUITE}`,
				)
			)
		})
		expect(callers.length, "the lane, its callers and nightly's in-browser leg").toBeGreaterThan(3)
		for (const file of callers.filter((file) => file !== NETWORK_LANE))
			for (const call of suiteCalls(file)) expect(String(call.inputs.shard_label), `${file} → ${call.name}`).not.toMatch(/^soak/i)
	})

	test("builds one iteration per repeat for named network files", () => {
		const files = `${NETWORK_FILE}\n${EGRESS_GUARD}`
		expect(prep({ TEST_FILES: files, REPEATS: "1", RETRY: "" })).toMatchObject({ code: 0, iterations: '["1"]' })
		const all = prep({ TEST_FILES: files, REPEATS: "25", RETRY: "9" })
		expect(all.code).toBe(0)
		expect(JSON.parse(String(all.iterations))).toEqual(Array.from({ length: 25 }, (_, i) => String(i + 1)))
		expect(prep({ TEST_FILES: files, REPEATS: "3", RETRY: "0" }).iterations).toBe('["1","2","3"]')
	})
})

describe("store copies", () => {
	const file = ".github/workflows/verify-store-copies.yml"
	// biome-ignore lint/suspicious/noExplicitAny: parsed-YAML shape is dynamic.
	const wf = Bun.YAML.parse(readFileSync(join(ROOT, file), "utf8")) as any

	test("runs weekly and on dispatch, never on a pull request or a push", () => {
		expect(Object.keys(wf.on).sort()).toEqual(["schedule", "workflow_dispatch"])
		expect(wf.on.schedule).toHaveLength(1)
	})

	test("one job, read-only, in no environment, with no secret and no installed dependency", () => {
		expect(wf.permissions).toEqual({ contents: "read" })
		expect(Object.keys(wf.jobs)).toEqual(["compare"])
		const job = wf.jobs.compare
		expect(job.permissions).toEqual({ contents: "read", attestations: "read" })
		expect(job.environment).toBeUndefined()
		expect(readFileSync(join(ROOT, file), "utf8")).not.toContain("secrets.")
		const uses = job.steps.flatMap((step: { uses?: string }) => (step.uses ? [step.uses.split("@")[0]] : []))
		expect(uses).toEqual(["actions/checkout", "./.github/actions/setup-bun"])
		expect(job.steps[0].with?.["persist-credentials"]).toBe(false)
		expect(job.steps[1].with).toEqual({ cache: "false", install: "false" })
		expect(job.steps[2].run, "with no node_modules, Bun would fetch a bare import from npm").toBe(
			'bun --no-install scripts/release/store-copy-run.ts "$STORE"',
		)
	})
})

// The environment approves a run, not its code: these pin what an approved run can do.
describe("token-list publish", () => {
	const file = ".github/workflows/publish-token-list.yml"
	const text = readFileSync(join(ROOT, file), "utf8")
	// biome-ignore lint/suspicious/noExplicitAny: parsed-YAML shape is dynamic.
	const wf = Bun.YAML.parse(text) as any
	const SIGN =
		'bun --no-install packages/token-list/src/sign-cli.ts --source infra/token-list/list.source.json --published infra/token-list/public/v1/list.json --out dist/list.json --expect-tokens-sha256 "$EXPECT_TOKENS" | tee -a "$GITHUB_OUTPUT"'

	test("runs on a dev push that changes the source and on dispatch, one run at a time, never cancelled", () => {
		expect(wf.on).toEqual({ push: { branches: ["dev"], paths: ["infra/token-list/list.source.json"] }, workflow_dispatch: null })
		expect(wf.concurrency).toEqual({ group: "publish-token-list", "cancel-in-progress": false })
		expect(wf.permissions).toEqual({ contents: "read" })
		expect(wf.jobs.prepare.if).toBe("github.ref == 'refs/heads/dev'")
	})

	test("prepare, then sign in the token-list environment, then publish-pr in release-app; only sign reads the signing key", () => {
		expect(Object.keys(wf.jobs)).toEqual(["prepare", "sign", "publish-pr"])
		expect([wf.jobs.sign.needs, wf.jobs["publish-pr"].needs]).toEqual(["prepare", "sign"])
		expect(Object.entries(wf.jobs).flatMap(([name, job]) => ((job as { environment?: unknown }).environment ? [name] : []))).toEqual([
			"sign",
			"publish-pr",
		])
		expect([wf.jobs.sign.environment, wf.jobs["publish-pr"].environment]).toEqual(["token-list", "release-app"])
		expect(text.match(/secrets\.TOKEN_LIST_SIGNING_KEY/g)).toHaveLength(1)
		const signStep = wf.jobs.sign.steps.find((step: { id?: string }) => step.id === "sign")
		expect(signStep.env.TOKEN_LIST_SIGNING_KEY).toBe("${{ secrets.TOKEN_LIST_SIGNING_KEY }}")
		expect(JSON.stringify(wf.jobs.prepare)).not.toContain("secrets.")
		for (const name of ["sign", "publish-pr"]) expect(wf.jobs[name].permissions).toEqual({ contents: "read" })
	})

	test("the signer runs exactly the pinned command: the summary's digest, the served floor, the pinned keys", () => {
		const signStep = wf.jobs.sign.steps.find((step: { id?: string }) => step.id === "sign")
		expect(signStep.run.trim().split("\n")).toEqual(["mkdir -p dist", SIGN])
		expect(signStep.env.EXPECT_TOKENS).toBe("${{ needs.prepare.outputs.tokens_sha256 }}")
		expect(wf.jobs.prepare.outputs.tokens_sha256).toBe("${{ steps.summary.outputs.tokens_sha256 }}")
	})

	// The node URL is part of the pinned line: a keyed endpoint would leak at commit, before any run.
	test("prepare's live check runs after the summary, advisory and bounded, against the keyless public node", () => {
		const steps = wf.jobs.prepare.steps
		const at = steps.findIndex((step: { id?: string }) => step.id === "summary")
		expect(steps.slice(at + 1)).toEqual([
			{
				name: "Live check (advisory)",
				"continue-on-error": true,
				"timeout-minutes": 5,
				run: 'bun infra/token-list/scripts/live-check.ts https://aztec-testnet.drpc.org >> "$GITHUB_STEP_SUMMARY"',
			},
		])
	})

	test("the publish PR is opened from the signed commit, by the script, with the App token in that step only", () => {
		const steps = wf.jobs["publish-pr"].steps
		const open = steps.at(-1)
		expect(open.run).toBe("bun --no-install infra/token-list/scripts/open-publish-pr.ts")
		expect(open.env.BASE_SHA).toBe("${{ github.sha }}")
		expect(open.env.GH_TOKEN).toBe("${{ steps.app.outputs.token }}")
		expect(wf.jobs["publish-pr"].env).toBeUndefined()
	})
})

// Bun never re-checks cached files against bun.lock, and its install runs trusted packages'
// lifecycle scripts: a poisoned cache must reach neither shipped bytes nor a job holding a write token.
describe("Bun's install cache", () => {
	// biome-ignore lint/suspicious/noExplicitAny: parsed-YAML shape is dynamic.
	const parse = (file: string): any => Bun.YAML.parse(readFileSync(join(ROOT, file), "utf8"))
	const SETUP_BUN = "./.github/actions/setup-bun"
	type Step = { uses?: string; with?: Record<string, unknown>; if?: unknown }
	type Job = { uses?: string; permissions?: unknown; steps?: Step[] }
	/** A job's own steps, or every step of the local reusable workflow it calls. */
	const stepsOf = (job: Job): Step[] =>
		job.uses?.startsWith("./.github/workflows/")
			? (Object.values(parse(job.uses.slice(2)).jobs) as Job[]).flatMap((called) => called.steps ?? [])
			: (job.steps ?? [])
	/** Any write scope (`id-token` and `attestations` included), or an App token minted whatever the block says. */
	const holdsWrite = (permissions: unknown, job: Job): boolean =>
		permissions === "write-all" ||
		(typeof permissions === "object" && permissions !== null && Object.values(permissions).includes("write")) ||
		stepsOf(job).some((step) => step.uses?.startsWith("actions/create-github-app-token@"))

	test("the composite restores it only when asked", () => {
		const action = parse(".github/actions/setup-bun/action.yml")
		expect(action.inputs.cache.default).toBe("true")
		const caches = (action.runs.steps as Step[]).filter((step) => step.uses?.startsWith("actions/cache@"))
		expect(caches.map((step) => step.if)).toEqual(["inputs.cache == 'true'"])
	})

	test("the extension build takes it on pull requests only", () => {
		const steps = stepsOf({ uses: "./.github/workflows/_build-extension.yml" }).filter((step) => step.uses === SETUP_BUN)
		expect(steps.length).toBeGreaterThan(0)
		for (const step of steps) expect(step.with?.cache).toBe("${{ github.event_name == 'pull_request' }}")
	})

	test("no job holding a write permission takes it", () => {
		const files = readdirSync(join(ROOT, ".github/workflows")).filter((file) => file.endsWith(".yml"))
		let checked = 0
		for (const file of files) {
			const wf = parse(`.github/workflows/${file}`)
			for (const [name, job] of Object.entries(wf.jobs ?? {}) as [string, Job][]) {
				// A job's own block replaces the workflow's rather than adding to it.
				if (!holdsWrite(job.permissions ?? wf.permissions, job)) continue
				for (const step of stepsOf(job).filter((step) => step.uses === SETUP_BUN)) {
					expect(step.with?.cache, `${file} → ${name}`).toBe("false")
					checked++
				}
			}
		}
		expect(checked, "the scan found the write-scoped jobs that run the composite").toBeGreaterThan(0)
	})
})
