/**
 * What the jobs that hold a release credential may run. A job with an App token, `id-token: write`
 * or `attestations: write` hands that credential, or a signing certificate, to every step it runs,
 * so each check below is a finding function over every workflow and composite action: a control
 * loosened anywhere fails here. Each is also run on a mutated copy, because a check that finds
 * nothing on any input passes on the real files too.
 *
 * Wired into CI via the root `test:ci-gating` script.
 */
import { describe, expect, test } from "bun:test"
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { SOURCE_COMMIT } from "../release/attach-assets-run"

const ROOT = join(import.meta.dir, "..", "..")

type Step = { id?: string; uses?: string; with?: Record<string, unknown>; run?: string; if?: unknown; "working-directory"?: string }
type Defaults = { run?: { "working-directory"?: string } }
type Job = {
	uses?: string
	permissions?: unknown
	env?: Record<string, unknown>
	defaults?: Defaults
	steps?: Step[]
	needs?: unknown
	if?: unknown
}
type Workflow = { permissions?: unknown; env?: Record<string, unknown>; defaults?: Defaults; jobs: Record<string, Job> }
type Action = { runs: { steps?: Step[] } }
/** Every workflow by file name, and every local composite action by its `uses:` path. */
type Tree = { workflows: Record<string, Workflow>; actions: Record<string, Action> }

const parse = <T>(path: string): T => Bun.YAML.parse(readFileSync(join(ROOT, path), "utf8")) as T

function loadTree(): Tree {
	const workflows: Record<string, Workflow> = {}
	for (const file of readdirSync(join(ROOT, ".github/workflows")).filter((f) => f.endsWith(".yml"))) {
		workflows[file] = parse<Workflow>(`.github/workflows/${file}`)
	}
	const actions: Record<string, Action> = {}
	for (const dir of readdirSync(join(ROOT, ".github/actions")))
		actions[`./.github/actions/${dir}`] = parse<Action>(`.github/actions/${dir}/action.yml`)
	return { workflows, actions }
}

const TREE = loadTree()
const MINT = "actions/create-github-app-token@"
const SETUP_BUN = "./.github/actions/setup-bun"
const RELEASE_PLEASE = "googleapis/release-please-action@"

/** Every job that runs its own steps, as `file#job`. A reusable-workflow call is checked in its own file. */
function* jobs(tree: Tree): Generator<{ where: string; wf: Workflow; job: Job }> {
	for (const [file, wf] of Object.entries(tree.workflows)) {
		for (const [name, job] of Object.entries(wf.jobs ?? {})) if (!job.uses) yield { where: `${file}#${name}`, wf, job }
	}
}

/** A job's steps with each local composite action's own steps, but `skip`'s, after the step that runs it. */
function expanded(tree: Tree, job: Job, skip?: string): Step[] {
	return (job.steps ?? []).flatMap((step) => [
		step,
		...(step.uses?.startsWith("./") && step.uses !== skip ? (tree.actions[step.uses]?.runs.steps ?? []) : []),
	])
}

const thirdParty = (steps: Step[]): string[] =>
	[
		...new Set(
			steps.flatMap((s) => (s.uses && !s.uses.startsWith("./") && !s.uses.startsWith("actions/") ? [s.uses.split("@")[0]] : [])),
		),
	].sort()

function privileged(job: Job, wf: Workflow): boolean {
	const declared = job.permissions ?? wf.permissions ?? {}
	if (declared === "write-all") return true
	const permissions = declared as Record<string, unknown>
	const signs = permissions["id-token"] === "write" || permissions.attestations === "write"
	return signs || (job.steps ?? []).some((s) => s.uses?.startsWith(MINT))
}

/** The exact permission set of each App token; none may name another owner or repository. */
const MINTS: Record<string, Record<string, string>> = {
	"release.yml#release-please": { "permission-contents": "write", "permission-issues": "write", "permission-pull-requests": "write" },
	"release.yml#auto-unstick": { "permission-contents": "write", "permission-pull-requests": "write" },
	"release.yml#sync-main-to-dev": { "permission-contents": "write", "permission-pull-requests": "write" },
	"release-prerelease.yml#release-please": {
		"permission-contents": "write",
		"permission-issues": "write",
		"permission-pull-requests": "write",
	},
	"_release-pr-lockfile.yml#lock-version": { "permission-contents": "write" },
}

function mintStepFindings(where: string, step: Step): string[] {
	const granted = Object.fromEntries(Object.entries(step.with ?? {}).filter(([key]) => key.startsWith("permission-")))
	const findings = ["owner", "repositories"].filter((key) => step.with?.[key] !== undefined).map((key) => `${where}: sets ${key}`)
	if (!MINTS[where]) findings.push(`${where}: an App token this test does not pin`)
	else if (!Bun.deepEquals(granted, MINTS[where])) findings.push(`${where}: mints ${JSON.stringify(granted)}`)
	return findings
}

function mintFindings(tree: Tree): string[] {
	const findings: string[] = []
	const seen = new Set<string>()
	for (const { where, job } of jobs(tree)) {
		for (const step of (job.steps ?? []).filter((s) => s.uses?.startsWith(MINT))) {
			seen.add(where)
			findings.push(...mintStepFindings(where, step))
		}
	}
	return [...findings, ...Object.keys(MINTS).flatMap((where) => (seen.has(where) ? [] : [`${where}: its pinned App token is gone`]))]
}

/** release-please maintains Release PRs only; a run that tagged or released would bypass the publish checks. */
function releasePleaseFindings(tree: Tree): string[] {
	const findings: string[] = []
	for (const { where, job } of jobs(tree)) {
		for (const step of (job.steps ?? []).filter((s) => s.uses?.startsWith(RELEASE_PLEASE))) {
			if (step.with?.["skip-github-release"] !== true) findings.push(`${where}: release-please may create a GitHub Release`)
		}
	}
	return findings
}

/** The third-party actions each credentialed job may run, composites expanded; GitHub's own `actions/*` are not listed. */
const THIRD_PARTY: Record<string, string[]> = {
	"release.yml#release-please": ["googleapis/release-please-action"],
	"release.yml#auto-unstick": ["oven-sh/setup-bun"],
	"release.yml#sync-main-to-dev": ["oven-sh/setup-bun"],
	"release.yml#attach-assets": ["oven-sh/setup-bun"],
	"release.yml#publish-chrome-store": ["google-github-actions/auth", "oven-sh/setup-bun"],
	"release-prerelease.yml#release-please": ["googleapis/release-please-action"],
	"_release-pr-lockfile.yml#lock-version": ["oven-sh/setup-bun"],
	"store-check.yml#chrome": ["google-github-actions/auth", "oven-sh/setup-bun"],
	"publish-packages.yml#publish": [],
	"nightly.yml#publish-nightly": ["oven-sh/setup-bun"],
}

function credentialedJobFindings(tree: Tree, where: string, wf: Workflow, job: Job): string[] {
	const steps = expanded(tree, job)
	const findings = steps
		.filter((s) => s.uses?.startsWith("actions/checkout@") && s.with?.["persist-credentials"] !== false)
		.map(() => `${where}: a checkout keeps its token in .git/config`)
	if (job.env?.GH_TOKEN !== undefined || wf.env?.GH_TOKEN !== undefined) findings.push(`${where}: GH_TOKEN reaches every step`)
	const expected = THIRD_PARTY[where]
	if (!expected) findings.push(`${where}: holds a credential this test does not list`)
	else if (!Bun.deepEquals(thirdParty(steps), [...expected].sort()))
		findings.push(`${where}: runs ${thirdParty(steps).join(", ") || "none"}`)
	return findings
}

function credentialedFindings(tree: Tree): string[] {
	const held = [...jobs(tree)].filter(({ wf, job }) => privileged(job, wf))
	const findings = held.flatMap(({ where, wf, job }) => credentialedJobFindings(tree, where, wf, job))
	const listed = Object.keys(THIRD_PARTY).filter((where) => !held.some((h) => h.where === where))
	return [...findings, ...listed.map((where) => `${where}: listed, but holds no credential`)]
}

/** The jobs that tag or publish: Bun built-ins only, from the workflow's own revision. */
const CLEAN = ["release.yml#auto-unstick", "release.yml#attach-assets", "release.yml#sync-main-to-dev", "nightly.yml#publish-nightly"]
const INSTALLS = /\b(bun|npm|pnpm|yarn)\s+(install|i|ci|add)\b|\bbunx\b|\bnpx\b/

function cleanStepFindings(where: string, step: Step): string[] {
	const findings: string[] = []
	if (step.uses?.startsWith("./") && (step.uses !== SETUP_BUN || step.with?.install !== "false")) {
		findings.push(`${where}: ${step.uses} may install dependencies`)
	}
	if (INSTALLS.test(step.run ?? "")) findings.push(`${where}: installs dependencies`)
	if (step.uses?.startsWith("actions/checkout@") && step.with?.ref !== undefined) findings.push(`${where}: checks out another revision`)
	return findings
}

function cleanFindings(tree: Tree): string[] {
	const composite = tree.actions[SETUP_BUN]?.runs.steps ?? []
	const findings = composite
		.filter((s) => INSTALLS.test(s.run ?? "") && s.if !== "inputs.install == 'true'")
		.map(() => `${SETUP_BUN}: installs whatever its install input says`)
	if (composite.some((s) => s.uses?.startsWith("oven-sh/setup-bun@") && s.with?.token !== ""))
		findings.push(`${SETUP_BUN}: hands Bun's setup the job's token`)
	const byWhere = new Map([...jobs(tree)].map(({ where, job }) => [where, job]))
	for (const where of CLEAN) {
		const job = byWhere.get(where)
		if (!job) {
			findings.push(`${where}: missing`)
			continue
		}
		findings.push(...(job.steps ?? []).flatMap((step) => cleanStepFindings(where, step)))
		const others = thirdParty(expanded(tree, job)).filter((uses) => uses !== "oven-sh/setup-bun")
		if (others.length) findings.push(`${where}: runs ${others.join(", ")}`)
	}
	return findings
}

/**
 * The jobs that set up Bun and install nothing. With no node_modules, Bun fetches a bare import from
 * npm at run time, past bun.lock and the age gate, unless the call passes `--no-install` or the
 * bunfig.toml in its working directory (Bun reads no other) sets `install.auto = "disable"`. A job
 * that checks out another revision reads that revision's file, which may predate the setting.
 * Blind spot: a Bun process that a script starts itself is not read (source-rebuild.sh's, after its
 * own install).
 */
const NO_INSTALL = [
	"_release-pr-lockfile.yml#lock-version",
	"nightly.yml#publish-nightly",
	"pr-quick.yml#changes",
	"pr-quick.yml#preview-comment",
	"release.yml#attach-assets",
	"release.yml#auto-unstick",
	"release.yml#publish-chrome-store",
	"release.yml#publish-firefox-amo",
	"release.yml#sync-main-to-dev",
	"source-rebuild.yml#rebuild-arm64",
	"source-rebuild.yml#rebuild-x64",
	"store-check.yml#chrome",
	"store-check.yml#firefox",
	"verify-store-copies.yml#compare",
]
const BUN_CALL = /(?<=^|[\s;&|(])bun(?=\s|$)/m
const CHANGES_DIRECTORY = /(^|[\s;&|(])(cd|pushd)\s/m
const flagged = (args: string[], flags: string): boolean => args.some((arg) => new RegExp(`^(${flags})(=|$)`).test(arg))

function installsNothing(job: Job): boolean {
	const steps = job.steps ?? []
	const bunAlone = steps.some(
		(s) => (s.uses === SETUP_BUN && String(s.with?.install) === "false") || s.uses?.startsWith("oven-sh/setup-bun@"),
	)
	return bunAlone && !steps.some((s) => INSTALLS.test(s.run ?? ""))
}

/** Every checkout is this workflow's revision, at the root, with the root's bunfig.toml in it (cone mode keeps root files). */
function readsOwnBunfig(job: Job): boolean {
	const checkouts = (job.steps ?? []).filter((s) => s.uses?.startsWith("actions/checkout@"))
	return (
		checkouts.length > 0 &&
		checkouts.every(({ with: options = {} }) => {
			if (["ref", "path", "repository"].some((key) => options[key] !== undefined)) return false
			if (options["sparse-checkout"] === undefined || String(options["sparse-checkout-cone-mode"]) !== "false") return true
			return String(options["sparse-checkout"])
				.split("\n")
				.map((line) => line.trim())
				.includes("/bunfig.toml")
		})
	)
}

/** Why the Bun call at `index` of `run` may auto-install, if it may. */
function bunCallFinding(run: string, index: number, own: boolean, moved: boolean): string | undefined {
	const args = run
		.slice(index + "bun".length)
		.split(/&&|[;|\n]/)[0]
		.trim()
		.split(/\s+/)
	if (args[0] === "--no-install") return flagged(args, "--install|-i") ? "overrides --no-install" : undefined
	if (!own) return "runs Bun without --no-install where its own revision's bunfig.toml may be missing"
	if (moved) return "runs Bun outside the checkout root"
	if (flagged(args, "--cwd") || CHANGES_DIRECTORY.test(run.slice(0, index))) return "runs Bun after changing directory"
	if (flagged(args, "--config|-c|--install|-i")) return "overrides Bun's configuration"
	return undefined
}

function autoInstallFindings(tree: Tree, bunfig: string, listed: readonly string[] = NO_INSTALL): string[] {
	const install = (Bun.TOML.parse(bunfig) as { install?: { auto?: unknown } }).install
	const findings = install?.auto === "disable" ? [] : ["bunfig.toml: Bun may auto-install a missing import"]
	const selected = [...jobs(tree)].filter(({ job }) => installsNothing(job))
	for (const { where, wf, job } of selected) {
		const own = readsOwnBunfig(job)
		for (const step of expanded(tree, job, SETUP_BUN)) {
			const run = step.run ?? ""
			const moved =
				(step["working-directory"] ?? job.defaults?.run?.["working-directory"] ?? wf.defaults?.run?.["working-directory"]) !==
				undefined
			for (const call of run.matchAll(new RegExp(BUN_CALL, "gm"))) {
				const reason = bunCallFinding(run, call.index, own, moved)
				if (reason) findings.push(`${where}: ${reason}`)
			}
		}
	}
	const names = selected.map(({ where }) => where)
	findings.push(
		...names.filter((where) => !listed.includes(where)).map((where) => `${where}: installs nothing, and NO_INSTALL does not list it`),
	)
	findings.push(
		...listed
			.filter((where) => !names.includes(where))
			.map((where) => `${where}: listed in NO_INSTALL, but not a job that installs nothing`),
	)
	return [...new Set(findings)]
}

const writes = (permissions: unknown): boolean =>
	permissions === "write-all" || (typeof permissions === "object" && permissions !== null && Object.values(permissions).includes("write"))
const needsOf = (job: Job | undefined): string[] => [job?.needs ?? []].flat() as string[]

/** git-cliff runs in a read-only job that a dispatch (release-please skipped) still reaches, and its result gates the publish. */
const NOTES = [
	{
		file: "release.yml",
		notes: "release-notes",
		publish: "attach-assets",
		guard: "always() && !cancelled() && needs.resolve.result == 'success'",
	},
	{
		file: "nightly.yml",
		notes: "nightly-notes",
		publish: "publish-nightly",
		guard: "always() && !cancelled() && needs.resolve.result == 'success' && needs.resolve.outputs.skip != 'true'",
	},
]

function notesJobFindings(tree: Tree, { file, notes, publish, guard }: (typeof NOTES)[number]): string[] {
	const wf = tree.workflows[file]
	const job = wf.jobs[notes]
	const where = `${file}#${notes}`
	if (!job) return [`${where}: missing`]
	const findings: string[] = []
	if (job.if !== guard) findings.push(`${where}: guarded by ${String(job.if)}`)
	if (writes(job.permissions ?? wf.permissions)) findings.push(`${where}: holds a write token`)
	const publisher = wf.jobs[publish]
	if (!needsOf(publisher).includes(notes) || !String(publisher?.if).includes(`needs.${notes}.result == 'success'`)) {
		findings.push(`${file}#${publish}: publishes without its notes`)
	}
	if (!needsOf(wf.jobs.status).includes(notes)) findings.push(`${file}#status: does not read ${notes}`)
	return findings
}

function notesFindings(tree: Tree): string[] {
	const allowed = new Set(NOTES.map(({ file, notes }) => `${file}#${notes}`))
	const cliff = [...jobs(tree)]
		.filter(({ where, job }) => !allowed.has(where) && (job.steps ?? []).some((s) => s.uses?.startsWith("orhun/git-cliff-action@")))
		.map(({ where }) => `${where}: runs git-cliff`)
	return [...NOTES.flatMap((entry) => notesJobFindings(tree, entry)), ...cliff]
}

const ATTEST = "actions/attest-build-provenance@4d101475d8b20a2381f78447822ac1eab6504dd8"
const RUNNER = "bun scripts/release/attach-assets-run.ts"
const PUBLISH_GUARD = "steps.plan.outputs.action == 'publish' && env.DRY_RUN != 'true'"
const SIGNING = { contents: "write", "id-token": "write", attestations: "write" }
const SUBJECTS = [
	"dist/release/nulo-chrome-${{ env.VERSION }}.zip",
	"dist/release/nulo-firefox-${{ env.VERSION }}.zip",
	"dist/release/SHASUMS256.txt",
]
/** The two publish jobs: the assets are attested after plan, and only on the path that publishes them. */
const PUBLISHERS = [
	{ where: "release.yml#attach-assets", apply: `${RUNNER} apply --expect publish` },
	{ where: "nightly.yml#publish-nightly", apply: `${RUNNER} apply --expect publish --target "$SHA"` },
]

function publisherFindings(tree: Tree, { where, apply }: (typeof PUBLISHERS)[number]): string[] {
	const [file, name] = where.split("#")
	const job = tree.workflows[file].jobs[name]
	const steps = job.steps ?? []
	const plan = steps.findIndex((s) => s.run === `${RUNNER} plan`)
	const attest = steps.findIndex((s) => s.uses === ATTEST)
	const applied = steps.findIndex((s) => s.run === apply)
	const findings: string[] = []
	if (!Bun.deepEquals(job.permissions, SIGNING)) findings.push(`${where}: permissions ${JSON.stringify(job.permissions)}`)
	if (!(plan >= 0 && plan < attest && attest < applied)) findings.push(`${where}: plan, attest and apply are not in that order`)
	if (steps[attest]?.if !== PUBLISH_GUARD || steps[applied]?.if !== PUBLISH_GUARD)
		findings.push(`${where}: attests or publishes off the publish path`)
	const subjects = String(steps[attest]?.with?.["subject-path"] ?? "")
		.trim()
		.split("\n")
	if (!Bun.deepEquals(subjects, SUBJECTS)) findings.push(`${where}: attests ${subjects.join(", ")}`)
	return findings
}

const VERIFY_GUARD = "steps.plan.outputs.action == 'use-published' && env.DRY_RUN != 'true'"
const SHIPPED = "${{ steps.published.outputs.dir || 'dist/release' }}/"

/** A store submission on a published release ships the bytes verify-published checked, never this run's rebuild. */
function storeBytesFindings(tree: Tree): string[] {
	const steps = tree.workflows["release.yml"].jobs["attach-assets"].steps ?? []
	const verify = steps.find((s) => s.run === `${RUNNER} verify-published`)
	const upload = steps.find((s) => s.uses?.startsWith("actions/upload-artifact@") && String(s.with?.name).startsWith("release-"))
	const paths = String(upload?.with?.path ?? "")
		.trim()
		.split("\n")
		.map((p) => p.trim())
	const findings: string[] = []
	if (verify?.id !== "published" || verify.if !== VERIFY_GUARD)
		findings.push("attach-assets: a published release can skip verify-published")
	if (paths.length !== 3 || !paths.every((p) => p.startsWith(SHIPPED)))
		findings.push("attach-assets: the store artifact is not the checked bytes")
	return findings
}

/** Every release write goes through the runner: `gh release` would publish or replace without its checks. */
function releaseWriteFindings(tree: Tree): string[] {
	return [...jobs(tree)].flatMap(({ where, job }) =>
		(job.steps ?? [])
			.filter((s) => /\bgh\s+release\s+(create|upload|edit|delete)\b/.test(s.run ?? ""))
			.map(() => `${where}: writes a release with gh`),
	)
}

/** The release notes print the attestation check for the tagged commit, which the runner fills in. */
function cliffFindings(toml: string): string[] {
	const checks = toml.match(/gh attestation verify [^`]+/g) ?? []
	const findings =
		checks.length === 2 ? [] : [`cliff.toml: ${checks.length} attestation checks, expected the prerelease and the stable one`]
	for (const check of checks) {
		if (!check.includes(`--source-digest ${SOURCE_COMMIT} `))
			findings.push(`cliff.toml: a check without --source-digest ${SOURCE_COMMIT}`)
		if (!check.includes("--repo nulo-sh/nulo --signer-workflow nulo-sh/nulo/.github/workflows/"))
			findings.push("cliff.toml: a check without this repository's workflow")
		if (!check.includes("--deny-self-hosted-runners")) findings.push("cliff.toml: a check that accepts self-hosted runners")
	}
	return findings
}

const CLIFF = readFileSync(join(ROOT, "cliff.toml"), "utf8")
const BUNFIG = readFileSync(join(ROOT, "bunfig.toml"), "utf8")
const AUTO_LINE = /^auto = "disable"\n/m

/** A copy of the tree with one edit applied. */
function mutated(edit: (tree: Tree) => void): Tree {
	const copy = structuredClone(TREE)
	edit(copy)
	return copy
}

/** Removes a key the way a reviewer deleting its YAML line would. */
const unset = (object: Record<string, unknown> | undefined, key: string) => Object.assign(object ?? {}, { [key]: undefined })

const step = (tree: Tree, where: string, prefix: string): Step => {
	const [file, name] = where.split("#")
	const found = tree.workflows[file].jobs[name].steps?.find((s) => s.uses?.startsWith(prefix))
	if (!found) throw new Error(`${where}: no ${prefix} step`)
	return found
}

describe("App tokens", () => {
	test("each mint grants exactly its pinned permissions, on this repository only", () => {
		expect(mintFindings(TREE)).toEqual([])
	})
	test.each([
		[
			"a widened set",
			(t: Tree) => Object.assign(step(t, "release.yml#auto-unstick", MINT).with ?? {}, { "permission-workflows": "write" }),
		],
		["no set at all", (t: Tree) => unset(step(t, "release.yml#sync-main-to-dev", MINT).with, "permission-contents")],
		[
			"another repository",
			(t: Tree) => Object.assign(step(t, "_release-pr-lockfile.yml#lock-version", MINT).with ?? {}, { repositories: "other" }),
		],
	])("finds %s", (_, edit) => {
		expect(mintFindings(mutated(edit)).length).toBeGreaterThan(0)
	})
})

describe("release-please", () => {
	test("never creates a GitHub Release, on main or dev", () => {
		const steps = [...jobs(TREE)].flatMap(({ job }) => (job.steps ?? []).filter((s) => s.uses?.startsWith(RELEASE_PLEASE)))
		expect(steps).toHaveLength(2)
		expect(releasePleaseFindings(TREE)).toEqual([])
	})
	test("finds a release-please step allowed to release", () => {
		const edit = (t: Tree) => unset(step(t, "release-prerelease.yml#release-please", RELEASE_PLEASE).with, "skip-github-release")
		expect(releasePleaseFindings(mutated(edit))).toEqual([
			"release-prerelease.yml#release-please: release-please may create a GitHub Release",
		])
	})
})

describe("credentialed jobs", () => {
	test("keep no token in .git/config, scope GH_TOKEN to steps, and run only their listed third-party actions", () => {
		expect(credentialedFindings(TREE)).toEqual([])
	})
	test.each([
		[
			"a persisted checkout",
			(t: Tree) => Object.assign(step(t, "store-check.yml#chrome", "actions/checkout@").with ?? {}, { "persist-credentials": true }),
		],
		["a job-wide GH_TOKEN", (t: Tree) => Object.assign(t.workflows["release.yml"].jobs["auto-unstick"], { env: { GH_TOKEN: "x" } })],
		[
			"an unlisted action",
			(t: Tree) =>
				t.workflows["release.yml"].jobs["sync-main-to-dev"].steps?.push({
					uses: "someone/else@0000000000000000000000000000000000000000",
				}),
		],
		[
			"a new credentialed job",
			(t: Tree) => Object.assign(t.workflows["release.yml"].jobs["release-notes"], { permissions: { "id-token": "write" } }),
		],
		[
			"a job granted write-all",
			(t: Tree) => Object.assign(t.workflows["release.yml"].jobs["release-notes"], { permissions: "write-all" }),
		],
	])("finds %s", (_, edit) => {
		expect(credentialedFindings(mutated(edit)).length).toBeGreaterThan(0)
	})
})

describe("jobs that tag or publish", () => {
	test("install no dependencies, check out the workflow's own revision and run no third-party action but Bun's setup", () => {
		expect(cleanFindings(TREE)).toEqual([])
	})
	test.each([
		["the composite with its install on", (t: Tree) => unset(step(t, "release.yml#attach-assets", SETUP_BUN).with, "install")],
		[
			"an unguarded install in the composite",
			(t: Tree) =>
				Object.assign(t.actions[SETUP_BUN].runs.steps?.find((s) => s.run?.includes("bun install")) ?? {}, { if: undefined }),
		],
		[
			"an install step",
			(t: Tree) => t.workflows["nightly.yml"].jobs["publish-nightly"].steps?.push({ run: "bun install --frozen-lockfile" }),
		],
		[
			"Bun's setup with the job's token",
			(t: Tree) => unset(t.actions[SETUP_BUN].runs.steps?.find((s) => s.uses?.startsWith("oven-sh/setup-bun@"))?.with, "token"),
		],
		[
			"a checkout of the tag",
			(t: Tree) => Object.assign(step(t, "release.yml#auto-unstick", "actions/checkout@").with ?? {}, { ref: "v1.2.3" }),
		],
		[
			"a third-party action",
			(t: Tree) =>
				t.workflows["release.yml"].jobs["attach-assets"].steps?.push({
					uses: "orhun/git-cliff-action@a9a95522b26fe6403f7bb24031f21fb573d0f5ff",
				}),
		],
	])("finds %s", (_, edit) => {
		expect(cleanFindings(mutated(edit)).length).toBeGreaterThan(0)
	})
})

describe("jobs that install nothing", () => {
	test("reach every Bun call with --no-install or the root bunfig.toml's auto-install refusal", () => {
		expect(autoInstallFindings(TREE, BUNFIG)).toEqual([])
	})
	const runStep = (t: Tree, where: string, pattern: RegExp): Step => {
		const [file, name] = where.split("#")
		const found = t.workflows[file].jobs[name].steps?.find((s) => pattern.test(s.run ?? ""))
		if (!found) throw new Error(`${where}: no step runs ${pattern}`)
		return found
	}
	const onTree = (edit: (t: Tree) => void) => () => autoInstallFindings(mutated(edit), BUNFIG)
	const STORE_PUBLISH =
		"release.yml#publish-chrome-store: runs Bun without --no-install where its own revision's bunfig.toml may be missing"
	test.each([
		[
			"a bunfig.toml without the refusal",
			() => autoInstallFindings(TREE, BUNFIG.replace(AUTO_LINE, "")),
			"bunfig.toml: Bun may auto-install a missing import",
		],
		[
			"a store publisher without --no-install",
			onTree((t) => {
				const s = runStep(t, "release.yml#publish-chrome-store", /publish-chrome-store-run/)
				s.run = s.run?.replace("bun --no-install ", "bun ")
			}),
			STORE_PUBLISH,
		],
		[
			"the preview comment's script without --no-install",
			onTree((t) => {
				const s = runStep(t, "pr-quick.yml#preview-comment", /preview-comment\.ts/)
				s.run = s.run?.replace("bun --no-install scripts/", "bun scripts/")
			}),
			"pr-quick.yml#preview-comment: runs Bun without --no-install where its own revision's bunfig.toml may be missing",
		],
		[
			"a Bun call after cd",
			onTree((t) => {
				const s = runStep(t, "release.yml#attach-assets", /cd dist\/release/)
				s.run = `${s.run}bun scripts/release/zip-reproducible.ts a b\n`
			}),
			"release.yml#attach-assets: runs Bun after changing directory",
		],
		[
			"a Bun step in another directory",
			onTree((t) => Object.assign(runStep(t, "release.yml#auto-unstick", BUN_CALL), { "working-directory": "dist" })),
			"release.yml#auto-unstick: runs Bun outside the checkout root",
		],
		[
			"a Bun call with --cwd",
			onTree((t) => {
				const s = runStep(t, "release.yml#sync-main-to-dev", BUN_CALL)
				s.run = s.run?.replace(BUN_CALL, "bun --cwd dist")
			}),
			"release.yml#sync-main-to-dev: runs Bun after changing directory",
		],
		[
			"a checkout into a subdirectory",
			onTree((t) => Object.assign(step(t, "_release-pr-lockfile.yml#lock-version", "actions/checkout@").with ?? {}, { path: "src" })),
			"_release-pr-lockfile.yml#lock-version: runs Bun without --no-install where its own revision's bunfig.toml may be missing",
		],
		[
			"a non-cone sparse checkout without bunfig.toml",
			onTree((t) =>
				Object.assign(step(t, "store-check.yml#chrome", "actions/checkout@").with ?? {}, {
					"sparse-checkout": "/scripts/release/\n",
					"sparse-checkout-cone-mode": false,
				}),
			),
			"store-check.yml#chrome: runs Bun without --no-install where its own revision's bunfig.toml may be missing",
		],
		[
			"a job-wide working directory",
			onTree((t) =>
				Object.assign(t.workflows["nightly.yml"].jobs["publish-nightly"], { defaults: { run: { "working-directory": "dist" } } }),
			),
			"nightly.yml#publish-nightly: runs Bun outside the checkout root",
		],
		[
			"a Bun call with another configuration",
			onTree((t) => {
				const s = runStep(t, "release.yml#auto-unstick", BUN_CALL)
				s.run = s.run?.replace(BUN_CALL, "bun --config other.toml")
			}),
			"release.yml#auto-unstick: overrides Bun's configuration",
		],
		[
			"--no-install undone by --install",
			onTree((t) => {
				const s = runStep(t, "release.yml#publish-firefox-amo", /publish-firefox-amo-run/)
				s.run = s.run?.replace("bun --no-install ", "bun --no-install --install=force ")
			}),
			"release.yml#publish-firefox-amo: overrides --no-install",
		],
		[
			"a no-install job NO_INSTALL does not list",
			() =>
				autoInstallFindings(
					TREE,
					BUNFIG,
					NO_INSTALL.filter((where) => where !== "release.yml#attach-assets"),
				),
			"release.yml#attach-assets: installs nothing, and NO_INSTALL does not list it",
		],
	])("finds %s", (_, findings, expected) => {
		expect(findings()).toEqual([expected])
	})

	// Counts registry requests: Bun's error text is the same for a refused install and a failed one.
	async function registryRequests(bunfig: string): Promise<{ exit: number; requests: string[] }> {
		const requests: string[] = []
		const server = Bun.serve({
			hostname: "127.0.0.1",
			port: 0,
			fetch(req) {
				requests.push(new URL(req.url).pathname)
				return new Response("not found", { status: 404 })
			},
		})
		const dir = mkdtempSync(join(tmpdir(), "nulo-auto-install-"))
		let proc: ReturnType<typeof Bun.spawn> | undefined
		try {
			for (let d = dir; d !== dirname(d); d = dirname(d)) expect(existsSync(join(d, "node_modules"))).toBe(false)
			writeFileSync(join(dir, "s.ts"), 'import pad from "left-pad-nulo-probe-zz"\nconsole.log(pad)\n')
			writeFileSync(join(dir, "bunfig.toml"), bunfig)
			proc = Bun.spawn([process.execPath, "s.ts"], {
				cwd: dir,
				// No user-level .bunfig.toml or .npmrc, and the only registry is the server above.
				env: {
					PATH: process.env.PATH,
					HOME: dir,
					TMPDIR: dir,
					BUN_INSTALL_CACHE_DIR: join(dir, "cache"),
					BUN_CONFIG_REGISTRY: `http://127.0.0.1:${server.port}/`,
				},
				stdout: "ignore",
				stderr: "ignore",
			})
			return { exit: await proc.exited, requests }
		} finally {
			if (proc?.exitCode === null) proc.kill()
			server.stop(true)
			rmSync(dir, { recursive: true, force: true })
		}
	}

	test("Bun refuses a bare import under the committed bunfig.toml without asking the registry", async () => {
		const { exit, requests } = await registryRequests(BUNFIG)
		expect(exit).not.toBe(0)
		expect(requests).toEqual([])
	})

	test("Bun asks the registry for it once the refusal is removed", async () => {
		const allowing = BUNFIG.replace(AUTO_LINE, "")
		expect(allowing).not.toBe(BUNFIG)
		const { requests } = await registryRequests(allowing)
		expect(requests).toContainEqual(expect.stringContaining("left-pad-nulo-probe-zz"))
	})
})

describe("release notes", () => {
	test("git-cliff runs only in a read-only notes job that dispatches reach and the publish waits on", () => {
		expect(notesFindings(TREE)).toEqual([])
	})
	test.each([
		[
			"a notes job a dispatch skips",
			(t: Tree) => Object.assign(t.workflows["release.yml"].jobs["release-notes"], { if: "needs.resolve.result == 'success'" }),
		],
		[
			"a notes job with a write token",
			(t: Tree) => Object.assign(t.workflows["nightly.yml"].jobs["nightly-notes"], { permissions: { contents: "write" } }),
		],
		[
			"a publish that ignores its notes",
			(t: Tree) => Object.assign(t.workflows["release.yml"].jobs["attach-assets"], { if: "always()" }),
		],
		[
			"git-cliff in the publishing job",
			(t: Tree) =>
				t.workflows["nightly.yml"].jobs["publish-nightly"].steps?.push({
					uses: "orhun/git-cliff-action@a9a95522b26fe6403f7bb24031f21fb573d0f5ff",
				}),
		],
	])("finds %s", (_, edit) => {
		expect(notesFindings(mutated(edit)).length).toBeGreaterThan(0)
	})
})

describe("attestations", () => {
	test("each publish job attests the three assets after plan and before the publish, on the publish path only", () => {
		expect(PUBLISHERS.flatMap((p) => publisherFindings(TREE, p))).toEqual([])
		expect(releaseWriteFindings(TREE)).toEqual([])
		expect(storeBytesFindings(TREE)).toEqual([])
	})
	const attestStep = (t: Tree, where: string) => step(t, where, ATTEST)
	test.each([
		[
			"an attestation on a dry run",
			(t: Tree) => Object.assign(attestStep(t, "release.yml#attach-assets"), { if: "steps.plan.outputs.action == 'publish'" }),
		],
		[
			"an attestation after the publish",
			(t: Tree) => {
				const steps = t.workflows["nightly.yml"].jobs["publish-nightly"].steps ?? []
				steps.push(...steps.splice(steps.indexOf(attestStep(t, "nightly.yml#publish-nightly")), 1))
			},
		],
		[
			"a missing subject",
			(t: Tree) =>
				Object.assign(attestStep(t, "release.yml#attach-assets").with ?? {}, { "subject-path": SUBJECTS.slice(0, 2).join("\n") }),
		],
		[
			"a widened job token",
			(t: Tree) =>
				Object.assign(t.workflows["nightly.yml"].jobs["publish-nightly"], { permissions: { ...SIGNING, actions: "write" } }),
		],
	])("finds %s", (_, edit) => {
		const t = mutated(edit)
		expect(PUBLISHERS.flatMap((p) => publisherFindings(t, p)).length).toBeGreaterThan(0)
	})
	const attachStep = (t: Tree, find: (s: Step) => boolean) => t.workflows["release.yml"].jobs["attach-assets"].steps?.find(find) ?? {}
	test.each([
		[
			"a published release shipped unchecked",
			(t: Tree) =>
				Object.assign(
					attachStep(t, (s) => s.id === "published"),
					{ if: "env.DRY_RUN != 'true' && false" },
				),
		],
		[
			"a store artifact made from the rebuild",
			(t: Tree) =>
				Object.assign(attachStep(t, (s) => s.uses?.startsWith("actions/upload-artifact@") === true).with ?? {}, {
					path: "dist/release/nulo-chrome-x.zip\ndist/release/nulo-firefox-x.zip\ndist/release/SHASUMS256.txt",
				}),
		],
	])("finds %s", (_, edit) => {
		expect(storeBytesFindings(mutated(edit)).length).toBeGreaterThan(0)
	})
	test("finds a release written with gh", () => {
		const edit = (t: Tree) =>
			t.workflows["release.yml"].jobs["attach-assets"].steps?.push({ run: 'gh release upload "$TAG" x.zip --clobber' })
		expect(releaseWriteFindings(mutated(edit))).toEqual(["release.yml#attach-assets: writes a release with gh"])
	})
})

describe("release notes' attestation check", () => {
	test("names this repository's workflow and the tagged commit, which the runner writes in", () => {
		expect(cliffFindings(CLIFF)).toEqual([])
	})
	test("finds a check that names git-cliff's commit instead", () => {
		expect(cliffFindings(CLIFF.replace(`--source-digest ${SOURCE_COMMIT}`, "--source-digest {{ commit_id }}")).length).toBeGreaterThan(
			0,
		)
	})
})
