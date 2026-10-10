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

/**
 * verify-cert-run.sh certifies a head only when every network suite job ran green, matched by its
 * full name: the caller's job name, then the reusable workflow's. A rename on either side that the
 * script does not follow fails every certification, so its list is derived here from the workflows.
 */
describe("network suite job names", () => {
	// biome-ignore lint/suspicious/noExplicitAny: parsed-YAML shape is dynamic.
	const workflow = (file: string): any => Bun.YAML.parse(readFileSync(join(ROOT, ".github/workflows", file), "utf8"))
	const SUITE = "_extension-network-e2e.yml"
	const PR_LANE = "pr-extension-network-e2e.yml"
	const LEAF = "network suite"
	const leaf = (shard: string): string => (shard ? `${LEAF} (shard ${shard})` : LEAF)

	test("the reusable workflow's job is the network suite, named with its shard when it has one", () => {
		expect(workflow(SUITE).jobs["network-e2e"].name).toBe(
			`\${{ inputs.shard && format('${LEAF} (shard {0})', inputs.shard) || '${LEAF}' }}`,
		)
	})

	test("verify-cert-run.sh expects exactly the jobs the PR lane's network workflow produces", () => {
		type Caller = { name?: string; uses?: string; with?: { shard?: string }; strategy?: { matrix?: { shard?: { id: string }[] } } }
		const lane = workflow(PR_LANE)
		const produced = (Object.values(lane.jobs) as Caller[])
			.filter((job) => String(job.uses).endsWith(`/${SUITE}`))
			.flatMap((job) =>
				(job.strategy?.matrix?.shard?.map((shard) => shard.id) ?? [""]).map((id) => {
					const bind = (value: unknown) => String(value ?? "").replace("${{ matrix.shard.id }}", id)
					return `${bind(job.name)} / ${leaf(bind(job.with?.shard))}`
				}),
			)
		const script = readFileSync(join(ROOT, "scripts/ci-cd/verify-cert-run.sh"), "utf8")
		const block = /^EXPECTED_NETWORK_JOBS=\(\n([\s\S]*?)\n\)$/m.exec(script)?.[1]
		expect(block, "verify-cert-run.sh declares EXPECTED_NETWORK_JOBS").toBeDefined()
		const expected = String(block)
			.split("\n")
			.map((line) => line.trim().replace(/^"(.*)"$/, "$1"))
			.filter(Boolean)
		expect(produced.length, "the PR lane calls the suite").toBeGreaterThan(0)
		expect([...expected].sort()).toEqual([...produced].sort())
		expect(script, "the list is checked against the PR lane's runs").toContain(`if [ "$WF" = "${lane.name}" ]; then`)
	})
})

describe("PR concurrency", () => {
	// biome-ignore lint/suspicious/noExplicitAny: parsed-YAML shape is dynamic.
	const workflow = (file: string): any => Bun.YAML.parse(readFileSync(join(ROOT, ".github/workflows", file), "utf8"))
	const PR_WORKFLOWS = [...Object.keys(AGGREGATOR_CHECKS), "actionlint.yml"]

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

	// The one job in the repository that may cancel runs: it runs nothing it fetched, reads every input
	// from env, and skips the tokens that could not cancel anyway.
	test("pr-supersede.yml cancels from one script-only job with exactly the scope it needs", () => {
		const wf = workflow("pr-supersede.yml")
		expect(wf.on).toEqual({ pull_request: { types: ["synchronize"] } })
		expect(wf.permissions).toEqual({})
		expect(Object.keys(wf.jobs)).toEqual(["cancel-superseded"])
		const job = wf.jobs["cancel-superseded"]
		expect(job.permissions).toEqual({ actions: "write", "pull-requests": "read" })
		expect(job.if).toBe("github.event.pull_request.head.repo.full_name == github.repository && github.actor != 'dependabot[bot]'")
		expect(job.concurrency).toEqual({ group: "pr-supersede-${{ github.event.pull_request.number }}", "cancel-in-progress": true })
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

	test("no other workflow can cancel or re-run a run", () => {
		for (const file of readdirSync(join(ROOT, ".github/workflows")).filter((name) => name.endsWith(".yml"))) {
			if (file === "pr-supersede.yml") continue
			const wf = workflow(file)
			const scopes = [wf.permissions, ...Object.values(wf.jobs ?? {}).map((job) => (job as { permissions?: unknown }).permissions)]
			for (const scope of scopes) {
				expect(
					scope === "write-all" ||
						(typeof scope === "object" &&
							scope !== null &&
							"actions" in scope &&
							(scope as Record<string, unknown>).actions === "write"),
					file,
				).toBe(false)
			}
		}
	})
})

/**
 * Each e2e lane decides from the labels the pull request carries when its `changes` job runs. An
 * event's own label list is a snapshot that a late run of an older event would decide from, so no
 * workflow or action may read it, and a run whose head the pull request has moved past stops itself.
 */
describe("live labels", () => {
	// biome-ignore lint/suspicious/noExplicitAny: parsed-YAML shape is dynamic.
	const workflow = (file: string): any => Bun.YAML.parse(readFileSync(join(ROOT, ".github/workflows", file), "utf8"))
	const LANES = {
		"pr-extension-smoke-e2e.yml": ["e2e:extension-smoke", "e2e:smoke"],
		"pr-extension-smoke-e2e-firefox.yml": ["e2e:extension-smoke", "e2e:smoke"],
		"pr-extension-network-e2e.yml": ["e2e:extension-network", "e2e:network"],
		"pr-extension-network-e2e-firefox.yml": ["e2e:extension-network", "e2e:network"],
	}
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
		for (const [file, labels] of Object.entries(LANES)) {
			const { changes, decide } = workflow(file).jobs
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
			expect(changes.outputs["label-hit"], `${file}: no fallback`).toBe("${{ steps.live.outputs.label-hit }}")
			expect(decide.steps[0].env.LABEL_HIT, file).toBe("${{ needs.changes.outputs.label-hit }}")
		}
	})

	/** Runs the live step's script under a `gh` that records its calls and answers from `body`, or fails with `failure`. */
	function runLive(args: string[], env: Record<string, string>, gh: { body?: unknown; failure?: string }) {
		const dir = mkdtempSync(join(tmpdir(), "live-labels-"))
		try {
			const log = join(dir, "calls")
			const output = join(dir, "output")
			writeFileSync(join(dir, "body.json"), JSON.stringify(gh.body ?? {}))
			writeFileSync(log, "")
			writeFileSync(output, "")
			const shim = gh.failure
				? `echo "$*" >> "${log}"; echo "gh: ${gh.failure}" >&2; exit 1`
				: `echo "$*" >> "${log}"; cat "${join(dir, "body.json")}"`
			writeFileSync(join(dir, "gh"), `#!/usr/bin/env bash\n${shim}\n`)
			chmodSync(join(dir, "gh"), 0o755)
			const run = Bun.spawnSync(["bash", "scripts/ci-cd/live-labels.sh", ...args], {
				cwd: ROOT,
				env: { PATH: `${dir}:${process.env.PATH}`, GITHUB_OUTPUT: output, RETRY_PAUSE: "0", ...env },
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
	const body = (labels: string[], head = HEAD) => ({ head: { sha: head }, labels: labels.map((name) => ({ name })) })

	test.each(Object.entries(LANES))("%s: the live labels decide, read once from the pull request", (_, labels) => {
		const alias = runLive(labels, pr, { body: body(["docs", labels[1]]) })
		expect([alias.code, alias.output, alias.calls]).toEqual([0, "label-hit=true", ["api repos/nulo-sh/nulo/pulls/7"]])
		const unrelated = runLive(labels, pr, { body: body(["docs", "e2e:other"]) })
		expect([unrelated.code, unrelated.output]).toEqual([0, "label-hit=false"])
		const dispatch = runLive(labels, { ...pr, EVENT: "workflow_dispatch", PR: "", HEAD_SHA: "" }, { failure: "unused" })
		expect([dispatch.code, dispatch.output, dispatch.calls]).toEqual([0, "label-hit=false", []])
	})

	test("a run whose head the pull request moved past stops, whatever its labels", () => {
		const moved = runLive(LANES["pr-extension-smoke-e2e.yml"], pr, { body: body(["e2e:smoke"], "b".repeat(40)) })
		expect(moved.code).not.toBe(0)
		expect(moved.stdout).toContain(`superseded by ${"b".repeat(40)}`)
		expect(moved.output).toBe("")
	})

	test("an unreadable pull request fails closed: one retry for a rate limit or server error, none for a refusal", () => {
		const labels = LANES["pr-extension-network-e2e.yml"]
		for (const failure of ["API rate limit exceeded (HTTP 403)", "HTTP 502: Bad Gateway", "connection reset by peer"]) {
			const run = runLive(labels, pr, { failure })
			expect([run.code === 0, run.output, run.calls.length], failure).toEqual([false, "", 2])
		}
		const missing = runLive(labels, pr, { failure: "Not Found (HTTP 404)" })
		expect([missing.code === 0, missing.output, missing.calls.length]).toEqual([false, "", 1])
		const malformed = runLive(labels, pr, { body: { head: { sha: HEAD } } })
		expect([malformed.code === 0, malformed.output]).toEqual([false, ""])
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

	// The shard pool / dedicated-job partition of the network suite is pinned per lane under
	// "canary lanes" below.

	// The self-pay phase gate — the wallet simulating and sending as the account a dApp names,
	// with the node's setup allow-list enforced — must keep running on every PR: the matrix in a
	// dedicated heavy job at retry 0 (a retry would re-mask an intermittent wallet regression),
	// the cheap two-account simulate in the shard pool (never excluded, so it cannot drop out).
	test("network-e2e keeps the self-pay phase gate in place at retry 0", () => {
		// biome-ignore lint/suspicious/noExplicitAny: parsed-YAML shape is dynamic.
		const wf = Bun.YAML.parse(readFileSync(join(ROOT, ".github/workflows/pr-extension-network-e2e.yml"), "utf8")) as any
		const words = (v: unknown): string[] => (typeof v === "string" ? v.split(/\s+/).filter(Boolean) : [])
		// biome-ignore lint/suspicious/noExplicitAny: parsed-YAML shape is dynamic.
		const jobs = Object.entries(wf.jobs) as [string, any][]

		const matrix = jobs.find(([, job]) => words(job.with?.test_files).includes("tests/e2e/network/selfpay-phase.test.ts"))
		expect(matrix, "selfpay-phase must run in a dedicated test_files job").toBeDefined()
		expect(String(matrix?.[1].with?.retry), "selfpay-phase runs at retry 0").toBe("0")
		expect(matrix?.[1].with?.proverless, "selfpay-phase runs proverless like the other heavy fee flows").toBe(true)

		const pool = jobs.find(([, job]) => job.with?.exclude_files)
		expect(words(pool?.[1].with?.exclude_files), "sim-from-selfpay stays in the shard pool").not.toContain(
			"tests/e2e/network/sim-from-selfpay.test.ts",
		)
		expect(String(pool?.[1].with?.retry), "the shard pool runs at retry 0").toBe("0")
		expect(existsSync(join(ROOT, "apps/extension/tests/e2e/network/sim-from-selfpay.test.ts")), "sim-from-selfpay exists").toBe(true)
		expect(existsSync(join(ROOT, "apps/extension/tests/e2e/network/selfpay-phase.test.ts")), "selfpay-phase exists").toBe(true)
	})
})

/**
 * The Firefox lanes are twins of the Chrome ones (PR aggregators required on dev, the smoke one on
 * main too, nightly jobs advisory), and the release's smoke of the shipped Firefox zip gates its
 * assets. Two ways that can rot silently: a twin drifts from the lane it mirrors (a file stops
 * running on Firefox and nothing says so), or a Firefox job slips into, or out of, the needs of an
 * aggregator or publish step.
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
	test("the Firefox PR lanes hold no write scope, and trigger and decide exactly like their Chrome twins", () => {
		type Decide = { steps: { run?: string }[] }
		const runnable = (job: Decide) => ({ ...job, steps: job.steps.map((step) => ({ ...step, run: commandLines(step.run) })) })
		for (const { chrome, firefox } of TWINS) {
			const [chromeWf, wf] = [workflow(chrome), workflow(firefox)]
			expect(wf.permissions, firefox).toEqual({ contents: "read" })
			for (const [name, job] of Object.entries(wf.jobs) as [string, { permissions?: unknown }][]) {
				const want = name === "changes" ? { contents: "read", "pull-requests": "read" } : undefined
				expect(job.permissions, `${firefox} → ${name}`).toEqual(want)
			}
			expect(wf.on, `${firefox} triggers`).toEqual(chromeWf.on)
			expect(runnable(wf.jobs.decide), `${firefox} → decide`).toEqual(runnable(chromeWf.jobs.decide))
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
	})

	// Exact, not a /firefox/ denylist: quality-status legitimately needs `build-firefox`.
	test("the required extension aggregators wait on exactly the Chrome suites", () => {
		expect(workflow("pr-extension-smoke-e2e.yml").jobs.status.needs).toEqual(["changes", "decide", "smoke"])
		expect(workflow("pr-extension-network-e2e.yml").jobs.status.needs).toEqual([
			"changes",
			"decide",
			"network-e2e",
			"network-e2e-heavy",
			"network-e2e-heavy-concurrent",
			"network-e2e-canary",
		])
	})

	test("only the release's assets and status wait on a Firefox job: the smoke of the shipped zip", () => {
		// biome-ignore lint/suspicious/noExplicitAny: parsed-YAML shape is dynamic.
		const waitsOnFirefox = (jobs: Record<string, any>) => {
			const firefoxJobs = Object.keys(jobs).filter((name) => jobs[name].with?.browser === "firefox")
			const waiting = Object.entries(jobs).map(([name, job]) => [
				name,
				[job.needs ?? []].flat().filter((need: string) => firefoxJobs.includes(need)),
			])
			return { firefoxJobs, waiting: Object.fromEntries(waiting.filter(([, needs]) => needs.length > 0)) }
		}
		const nightly = waitsOnFirefox(workflow("nightly.yml").jobs)
		expect(nightly.firefoxJobs, "nightly.yml runs Firefox").toContain("smoke-firefox-against-artifact")
		expect(nightly.waiting, "nightly.yml: nothing waits on a Firefox job").toEqual({})
		for (const gate of ["status", "publish-nightly"]) expect(workflow("nightly.yml").jobs[gate], `nightly.yml → ${gate}`).toBeDefined()

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

	test("nightly's Firefox network jobs mirror its Chrome ones", () => {
		const { jobs } = workflow("nightly.yml")
		for (const name of ["network-e2e", "network-e2e-heavy", "network-e2e-heavy-concurrent", "network-e2e-canary"]) {
			const [chrome, firefox] = [jobs[name], jobs[`${name}-firefox`]]
			expect(firefox, `nightly.yml → ${name}-firefox`).toBeDefined()
			expect(firefox.with.browser).toBe("firefox")
			expect(words(firefox.with.exclude_files)).toEqual(words(chrome.with.exclude_files))
			expect(words(firefox.with.test_files)).toEqual(words(chrome.with.test_files))
			expect(firefox.strategy).toEqual(chrome.strategy)
		}
	})

	test("the shared pieces default to chrome, and the browser caches share no key prefix", () => {
		for (const file of ["_extension-smoke-e2e.yml", "_extension-network-e2e.yml"]) {
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
 * The canary lanes — the prover-ON jobs every @aztec bump is gated on — run both execution
 * canaries on both browsers. What could rot silently: a canary dropped from one lane's list, left
 * in a proverless pool, or moved into a proverless job; a lane whose aggregator waits on a job but
 * never reads its result; the reusable workflow's results assertion silenced, or its label match
 * narrowed so that a lane escapes it.
 */
describe("canary lanes", () => {
	// biome-ignore lint/suspicious/noExplicitAny: parsed-YAML shape is dynamic.
	const workflow = (file: string): any => Bun.YAML.parse(readFileSync(join(ROOT, ".github/workflows", file), "utf8"))
	const words = (v: unknown): string[] => (typeof v === "string" ? v.split(/\s+/).filter(Boolean) : [])
	const SUITE = "_extension-network-e2e.yml"
	const LANES = [
		{ file: "pr-extension-network-e2e.yml", browser: "chrome" },
		{ file: "pr-extension-network-e2e-firefox.yml", browser: "firefox" },
		{ file: "nightly.yml", browser: "chrome" },
		{ file: "nightly.yml", browser: "firefox" },
	] as const
	type SuiteJob = { uses?: string; with?: Record<string, unknown> }
	/** A lane is one browser's network suite in one caller: the shard pool plus its dedicated jobs. */
	const laneJobs = (file: string, browser: string): [string, SuiteJob][] =>
		(Object.entries(workflow(file).jobs) as [string, SuiteJob][]).filter(
			([, job]) => String(job.uses).endsWith(SUITE) && (job.with?.browser ?? "chrome") === browser,
		)
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

	// "Prover-ON" is the `proverless` input, not the job being dedicated: a heavy job is dedicated too.
	test("every canary runs prover-ON under a canary label in every lane, and is out of that lane's pool", () => {
		for (const { file, browser } of LANES) {
			const jobs = laneJobs(file, browser)
			const pools = jobs.filter(([, job]) => job.with?.exclude_files)
			expect(
				pools.map(([name]) => name),
				`${file} ${browser}: one shard pool`,
			).toHaveLength(1)
			const excluded = words(pools[0][1].with?.exclude_files)
			for (const canary of canaryFiles) {
				const carriers = jobs.filter(([, job]) => words(job.with?.test_files).includes(canary))
				expect(
					carriers.map(([name]) => name),
					`${file} ${browser}: ${canary} runs in one dedicated job`,
				).toHaveLength(1)
				const [, job] = carriers[0]
				expect(job.with?.proverless, `${file} ${browser}: ${canary} runs prover-ON`).not.toBe(true)
				expect(String(job.with?.shard_label), `${file} ${browser}: ${canary}'s job is a canary lane`).toStartWith("canary")
				expect(excluded, `${file} ${browser}: ${canary} is out of the shard pool`).toContain(canary)
			}
		}
	})

	// A file in a dedicated job's list but not the pool's runs twice; one in neither never runs.
	test("each lane's shard pool excludes exactly the union of its dedicated jobs' files", () => {
		for (const { file, browser } of LANES) {
			const jobs = laneJobs(file, browser)
			const excluded = jobs.flatMap(([, job]) => words(job.with?.exclude_files))
			const dedicated = jobs.flatMap(([, job]) => words(job.with?.test_files))
			expect(dedicated.length, `${file} ${browser}: dedicated jobs exist`).toBeGreaterThan(0)
			expect([...excluded].sort(), `${file} ${browser}: exclude_files == union of test_files`).toEqual([...new Set(dedicated)].sort())
		}
	})

	const PR_LANE = "pr-extension-network-e2e.yml"
	type CopiedJob = SuiteJob & {
		name?: string
		if?: unknown
		secrets?: unknown
		strategy?: { "fail-fast"?: unknown; matrix?: Record<string, unknown> }
	}

	// Nightly keeps its own retry policy and adds the chaos job, but splits the suite as the PR lane
	// does: a file moved between jobs on one side only runs under another job's conditions on the other.
	test("nightly runs the PR lane's jobs, file for file, on both browsers", () => {
		const pr = Object.fromEntries(laneJobs(PR_LANE, "chrome")) as Record<string, CopiedJob>
		for (const browser of ["chrome", "firefox"]) {
			const nightly = Object.fromEntries(
				laneJobs("nightly.yml", browser)
					.filter(([, job]) => job.with?.chaos !== true)
					.map(([name, job]) => [name.replace(/-firefox$/, ""), job]),
			) as Record<string, CopiedJob>
			expect(Object.keys(nightly).sort(), `nightly.yml ${browser}: jobs`).toEqual(Object.keys(pr).sort())
			for (const [name, job] of Object.entries(pr)) {
				const copy = nightly[name]
				const at = `nightly.yml ${browser} → ${name}`
				expect(words(copy.with?.test_files), `${at} test_files`).toEqual(words(job.with?.test_files))
				expect(copy.with?.proverless, `${at} proverless`).toBe(job.with?.proverless)
				expect(copy.with?.shard_label, `${at} shard_label`).toBe(job.with?.shard_label)
				expect(copy.strategy, `${at} strategy`).toEqual(job.strategy)
			}
		}
	})

	// One matrix job, so attach-assets and status read the whole opt-in suite as one result; its legs
	// are the PR lane's calls, so every pin on that lane above holds for the release's run too.
	test("release's opt-in network run is the PR lane: one leg per PR job and shard, with its inputs", () => {
		const defaults = workflow(SUITE).on.workflow_call.inputs as Record<string, { default?: unknown }>
		type Call = { name: string; inputs: Record<string, unknown> }
		/** Inputs left at the suite's default dropped, file lists split; `ref` and the kill switch are pinned below. */
		const normalized = ({ name, inputs }: Call) => ({
			name,
			inputs: Object.fromEntries(
				Object.entries(inputs)
					.filter(([key, value]) => key !== "ref" && key !== "disable_presto" && value !== defaults[key]?.default)
					.map(([key, value]) => [key, key.endsWith("_files") ? words(value) : value]),
			),
		})
		const byName = (a: Call, b: Call) => a.name.localeCompare(b.name)

		const pr: Call[] = (laneJobs(PR_LANE, "chrome") as [string, CopiedJob][]).flatMap(([, job]) => {
			const shards = job.strategy?.matrix?.shard as { id: string; label: string }[] | undefined
			if (!shards) return [{ name: String(job.name), inputs: job.with ?? {} }]
			return shards.map((shard) => ({
				name: String(job.name).replace("${{ matrix.shard.id }}", shard.id),
				inputs: { ...job.with, shard: shard.id, shard_label: shard.label },
			}))
		})

		const job: CopiedJob = workflow("release.yml").jobs["network-e2e"]
		expect(Object.keys(job.strategy?.matrix ?? {}), "one matrix key").toEqual(["leg"])
		expect(job.strategy?.["fail-fast"], "a red leg never cancels the others").toBe(false)
		const legs = job.strategy?.matrix?.leg as Record<string, unknown>[]
		/** A `${{ matrix.leg.<key> }}` input takes the leg's own value, typed; a key the leg lacks reads undefined and fails. */
		const bind = (value: unknown, leg: Record<string, unknown>) => {
			const key = typeof value === "string" ? /^\$\{\{ matrix\.leg\.(\w+) \}\}$/.exec(value)?.[1] : undefined
			return key === undefined ? value : leg[key]
		}
		const release: Call[] = legs.map((leg) => ({
			name: String(job.name).replace("${{ matrix.leg.name }}", String(leg.name)),
			inputs: Object.fromEntries(Object.entries(job.with ?? {}).map(([key, value]) => [key, bind(value, leg)])),
		}))
		expect(release.map(normalized).sort(byName)).toEqual(pr.map(normalized).sort(byName))

		const [, prPool] = laneJobs(PR_LANE, "chrome")[0]
		expect(job.uses).toBe(prPool.uses)
		expect(job.secrets).toEqual((prPool as CopiedJob).secrets)
		expect(job.with?.ref).toBe("${{ needs.resolve.outputs.sha }}")
		expect(job.with?.disable_presto).toBe("${{ !matrix.leg.proverless && vars.NULO_E2E_DISABLE_PRESTO == '1' }}")
		expect(String(job.if).split(/\s+/).join(" ").trim(), "opt-in only").toBe(
			"always() && needs.resolve.result == 'success' && github.event.inputs.run_network_e2e == 'true'",
		)
	})

	// The same-token matrix holds the node's block production, which a shard's files share; the chaos
	// run is a nightly lead whose seed fixes its actions, not their timing.
	test("the same-token matrix runs proverless in a dedicated job, and the chaos run only in nightly's advisory jobs", () => {
		const matrix = "tests/e2e/network/same-token-concurrent-sends.test.ts"
		const chaos = "tests/e2e/network/send-chaos.test.ts"
		for (const { file, browser } of LANES) {
			const jobs = laneJobs(file, browser)
			const carriers = jobs.filter(([, job]) => words(job.with?.test_files).includes(matrix))
			expect(
				carriers.map(([, job]) => job.with?.proverless),
				`${file} ${browser}: ${matrix}`,
			).toEqual([true])
			const chaosJobs = jobs.filter(([, job]) => job.with?.chaos === true)
			expect(
				chaosJobs.map(([, job]) => words(job.with?.test_files)),
				`${file} ${browser}: chaos`,
			).toEqual(file === "nightly.yml" ? [[chaos]] : [])
		}
		const { jobs } = workflow("nightly.yml")
		for (const gate of ["publish-nightly", "status"]) {
			const needs = [jobs[gate].needs ?? []].flat()
			expect(
				needs.filter((need: string) => need.includes("chaos")),
				`nightly.yml → ${gate}`,
			).toEqual([])
		}
	})

	// The reusable workflow folds newlines before `read -ra`; a block-scalar list is refused here as well,
	// since the whitespace-splitting pins above would accept one that the steps then mis-parse.
	test("every file list is one line", () => {
		for (const { file, browser } of LANES) {
			for (const [name, job] of laneJobs(file, browser)) {
				for (const key of ["test_files", "exclude_files"] as const) {
					const value = job.with?.[key]
					if (value !== undefined) expect(String(value), `${file} → ${name} ${key}`).not.toContain("\n")
				}
			}
		}
	})

	/** The jobs an aggregator's script actually tests: the operands of its `for r in …; do` lists and of
	 *  its direct `[ "${{ needs.x.result }}" …` checks — an echo or a comment naming a result does not count. */
	function resultsTested(run: unknown): string[] {
		const commands = commandLines(run).join("\n")
		const inLoops = [...commands.matchAll(/for r in([\s\S]*?);\s*do/g)].flatMap((loop) =>
			[...loop[1].matchAll(/needs\.([\w-]+)\.result/g)].map((token) => token[1]),
		)
		const direct = [...commands.matchAll(/\[ "\$\{\{ needs\.([\w-]+)\.result \}\}" /g)].map((token) => token[1])
		return [...new Set([...inLoops, ...direct])].sort()
	}

	// A job in `needs` that the loop never tests can be red under a green aggregator.
	test("every job an aggregator waits on is tested in its result loop, and nothing else is", () => {
		for (const [file, aggregator] of [
			["pr-extension-network-e2e.yml", "status"],
			["pr-extension-network-e2e-firefox.yml", "status"],
			["nightly.yml", "status"],
		] as const) {
			const job = workflow(file).jobs[aggregator]
			const script = (job.steps as { run?: string }[]).map((step) => step.run ?? "").join("\n")
			expect(resultsTested(script), `${file} → ${aggregator} tests exactly its needs`).toEqual([...[job.needs ?? []].flat()].sort())
		}
		// The publish gate enumerates success: `!= 'failure'` would let a skipped or cancelled gate publish.
		const publish = workflow("nightly.yml").jobs["publish-nightly"]
		for (const need of [publish.needs ?? []].flat()) {
			expect(String(publish.if), `nightly.yml → publish-nightly requires needs.${need}.result == 'success'`).toContain(
				`needs.${need}.result == 'success'`,
			)
		}
	})

	// Pinned whole, not by fragment: a narrower condition, a `continue-on-error` or a commented-out call
	// would each keep the fragment while disarming the step.
	test("the reusable workflow asserts canary results on every canary* label, like its zero-proofs check", () => {
		type Step = { name?: string; if?: string; run?: string; env?: Record<string, string>; "continue-on-error"?: unknown }
		const job = workflow(SUITE).jobs["network-e2e"]
		expect(job["continue-on-error"], "the suite job fails when a step does").toBeUndefined()
		const steps = job.steps as Step[]
		const results = steps.find((step) => step.name === "Assert canary results")
		expect(results, "the results step exists").toBeDefined()
		expect(results?.if).toBe("${{ always() && !cancelled() && startsWith(inputs.shard_label, 'canary') }}")
		expect(results?.["continue-on-error"], "a red assertion is a red job").toBeUndefined()
		expect(commandLines(results?.run)).toContain(
			'bun scripts/ci-cd/assert-canary-results.ts "${RUNNER_TEMP}/canary-results.json" "${TEST_FILE_LIST[@]}"',
		)
		const run = steps.find((step) => step.name === "Run network e2e via agent")
		expect(run?.env?.NULO_E2E_RESULTS_FILE, "a canary* run writes the report").toBe(
			"${{ startsWith(inputs.shard_label, 'canary') && format('{0}/canary-results.json', runner.temp) || '' }}",
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
