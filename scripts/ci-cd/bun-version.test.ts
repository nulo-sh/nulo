/**
 * One Bun version, root package.json's `packageManager`, for every CI setup step and every file that
 * restates it. Each `oven-sh/setup-bun` step reads the file, the setup-bun composite keys its install
 * cache on the version setup installed, and a restatement a bump leaves behind fails here. Two sites
 * stay manual (CLAUDE.md, Dependency policy): the `BUN_VERSION` variable of each Workers Build, which
 * lives in the Cloudflare dashboard, and `SOURCE-BUILD.md`'s ARM64 archive hash. setup-bun reads the
 * file at the workspace root, so every job that sets up Bun checks out root package.json there.
 *
 * Wired into CI via the root `test:ci-gating` script.
 */
import { describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = join(import.meta.dir, "..", "..")
const read = (path: string) => readFileSync(join(ROOT, path), "utf8")
const SETUP_BUN = "oven-sh/setup-bun@"

type Step = { id?: string; uses?: string; with?: Record<string, unknown> }
type Site = { where: string; steps: Step[] }
type Action = { runs: { steps?: Step[] } }
type Workflow = { jobs?: Record<string, { steps?: Step[] }> }
type TextFile = { path: string; text: string }

/** An exact version is what lets setup-bun build the release URL without asking the GitHub API. */
function managerFindings(packageManager: string): string[] {
	return /^bun@\d+\.\d+\.\d+$/.test(packageManager) ? [] : [`packageManager ${packageManager} is not an exact bun@X.Y.Z`]
}

/** Every job and composite action, with its own steps. */
function setupSites(): Site[] {
	const parse = <T>(path: string): T => Bun.YAML.parse(read(path)) as T
	const workflows = readdirSync(join(ROOT, ".github/workflows")).filter((file) => /\.ya?ml$/.test(file))
	return [
		...workflows.flatMap((file) =>
			Object.entries(parse<Workflow>(`.github/workflows/${file}`).jobs ?? {}).map(([name, job]) => ({
				where: `${file}#${name}`,
				steps: job.steps ?? [],
			})),
		),
		...readdirSync(join(ROOT, ".github/actions")).map((dir) => ({
			where: `.github/actions/${dir}`,
			steps: parse<Action>(`.github/actions/${dir}/action.yml`).runs.steps ?? [],
		})),
	]
}

function stepFindings(sites: Site[]): string[] {
	const setups = sites.flatMap(({ where, steps }) => steps.filter((s) => s.uses?.startsWith(SETUP_BUN)).map((s) => ({ where, s })))
	return setups.flatMap(({ where, s }) => [
		...(s.with?.["bun-version-file"] === "package.json" ? [] : [`${where}: setup-bun does not read package.json`]),
		...(s.with?.["bun-version"] === undefined ? [] : [`${where}: setup-bun names its own version`]),
	])
}

/** The composite's install cache must be keyed on the version setup installed, never a literal. */
function cacheKeyFindings(action: Action): string[] {
	const steps = action.runs.steps ?? []
	const id = steps.find((s) => s.uses?.startsWith(SETUP_BUN))?.id
	const cache = steps.find((s) => s.uses?.startsWith("actions/cache@"))?.with ?? {}
	const keys = [String(cache.key ?? ""), String(cache["restore-keys"] ?? "").split("\n")[0]]
	const output = `steps.${id}.outputs.bun-version`
	return keys.flatMap((key) =>
		id !== undefined && key.includes(output) && !/\d+\.\d+\.\d+/.test(key) ? [] : [`cache key ${key} is not keyed on ${output}`],
	)
}

/** Each way this repository spells the Bun it runs; the version is the first group. */
const RESTATEMENTS = [
	/(?<![\w/-])bun@(\d+\.\d+\.\d+)/g,
	/(?<![\w-])bun-v(\d+\.\d+\.\d+)/g,
	/\bbun --version\s+#\s*(\d+\.\d+\.\d+)/g,
	/\bBUN_VERSION=(\d+\.\d+\.\d+)/g,
	/(?<![\w-])bun-version:\s*(\d+\.\d+\.\d+)/g,
	/"@types\/bun":\s*"([^"]*)"/g,
	/(?<![\w/-])bun\/(\d+\.\d+\.\d+)\//g,
]
/** History and resolved lockfiles record what ran, not what runs; this file spells versions to refuse. */
const UNCHECKED = /^implementations-plan\/|^scripts\/ci-cd\/bun-version\.test\.ts$|(^|\/)(CHANGELOG\.md|bun\.lock|package-lock\.json)$/

function trackedTextFiles(): TextFile[] {
	const run = spawnSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8" })
	if (run.status !== 0) throw new Error(`git ls-files: ${run.stderr}`)
	return run.stdout
		.split("\0")
		.filter((path) => path !== "" && !UNCHECKED.test(path) && existsSync(join(ROOT, path)))
		.map((path) => ({ path, text: read(path) }))
}

/** Every restatement in the files, `path:line  match`, with whether it names `version`. */
function restatements(files: TextFile[], version: string): { at: string; matches: boolean }[] {
	return files.flatMap(({ path, text }) =>
		RESTATEMENTS.flatMap((pattern) =>
			[...text.matchAll(pattern)].map((m) => ({
				at: `${path}:${text.slice(0, m.index).split("\n").length}  ${m[0]}`,
				matches: m[1] === version,
			})),
		),
	)
}

const restatementFindings = (files: TextFile[], version: string): string[] =>
	restatements(files, version)
		.filter(({ matches }) => !matches)
		.map(({ at }) => `${at} is not ${version}`)

/** The reviewer's x86_64 archive hash and the Docker runner's pin name the same release asset. */
function hashFindings(sourceBuild: string, pins: string): string[] {
	const documented = /bun-linux-x64\.zip`\s*\|\s*`([0-9a-f]{64})`/.exec(sourceBuild)?.[1]
	const pinned = /^([0-9a-f]{64}) {2}bun\/[^/]+\/bun-linux-x64\.zip$/m.exec(pins)?.[1]
	return documented !== undefined && documented === pinned ? [] : ["SOURCE-BUILD.md's x86_64 hash is not the Docker runner's Bun pin"]
}

const packageManager: string = JSON.parse(read("package.json")).packageManager
const version = packageManager.replace(/^bun@/, "")
const [major, minor, patch] = version.split(".")
/** A Bun version nothing should name, whatever the current one is. */
const otherBun = `${major}.${minor}.${Number(patch) + 1}`
const SOURCE_BUILD = "apps/extension/store/SOURCE-BUILD.md"
const PINS = "apps/extension/scripts/e2e/docker-ci-like.pins.sha256"
const composite = Bun.YAML.parse(read(".github/actions/setup-bun/action.yml")) as Action

describe("the Bun version", () => {
	test("package.json#packageManager names an exact release", () => {
		expect(managerFindings(packageManager)).toEqual([])
	})

	test("every setup-bun step reads package.json and names no version of its own", () => {
		const sites = setupSites()
		expect(sites.flatMap(({ steps }) => steps).filter((s) => s.uses?.startsWith(SETUP_BUN)).length).toBeGreaterThanOrEqual(10)
		expect(stepFindings(sites)).toEqual([])
	})

	test("the composite keys its install cache on the version setup installed", () => {
		expect(cacheKeyFindings(composite)).toEqual([])
	})

	test("every file that restates the version names packageManager's", () => {
		const files = trackedTextFiles()
		const found = restatements(files, version).map(({ at }) => at.split(":")[0])
		expect([...new Set(found)]).toEqual(
			expect.arrayContaining([
				"package.json",
				"apps/extension/package.json",
				"apps/playground/package.json",
				"infra/subscribe/package.json",
				"apps/extension/scripts/e2e/docker-ci-like.sh",
				PINS,
				SOURCE_BUILD,
				"infra/token-list/README.md",
				"infra/subscribe/README.md",
			]),
		)
		expect(restatementFindings(files, version)).toEqual([])
		expect(hashFindings(read(SOURCE_BUILD), read(PINS))).toEqual([])
	})

	test("a setup-bun pin to a commit is not a restatement", () => {
		const text = "uses: oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6 # v2.2.0\n"
		expect(restatements([{ path: "x.yml", text }], version)).toEqual([])
	})

	test.each([
		["a range", "bun@1.4"],
		["a dist-tag", "bun@latest"],
		["a corepack hash", `bun@${version}+sha256.0000`],
	])("a packageManager with %s is refused", (_, value) => {
		expect(managerFindings(value)).toEqual([`packageManager ${value} is not an exact bun@X.Y.Z`])
	})

	test.each([
		[
			"its own version",
			{ "bun-version": otherBun, token: "" },
			["setup-bun does not read package.json", "setup-bun names its own version"],
		],
		["both a file and a version", { "bun-version-file": "package.json", "bun-version": otherBun }, ["setup-bun names its own version"]],
	])("a setup step with %s is refused", (_, inputs, problems) => {
		const site = { where: "x.yml#job", steps: [{ uses: `${SETUP_BUN}0c5077e51419868618aeaa5fe8019c62421857d6`, with: inputs }] }
		expect(stepFindings([site])).toEqual(problems.map((problem) => `x.yml#job: ${problem}`))
	})

	test("a composite cache keyed on a version literal is refused", () => {
		const copy: Action = structuredClone(composite)
		const cache = copy.runs.steps?.find((s) => s.uses?.startsWith("actions/cache@"))
		if (cache?.with) cache.with.key = `\${{ runner.os }}-bun-${otherBun}-\${{ hashFiles('bun.lock') }}`
		expect(cacheKeyFindings(copy)).toHaveLength(1)
	})

	test.each([
		["a manifest", "apps/x/package.json", `"@types/bun": "${otherBun}"`],
		["a manifest range", "apps/x/package.json", `"@types/bun": "^${version}"`],
		["a release URL", "docs/x.md", `https://github.com/oven-sh/bun/releases/download/bun-v${otherBun}/bun-linux-x64.zip`],
		["a version check", "docs/x.md", `bun --version   # ${otherBun}`],
		["a Workers Build variable", "infra/x/README.md", `build variable \`BUN_VERSION=${otherBun}\``],
		["a pin key", "x.sha256", `${"0".repeat(64)}  bun/${otherBun}/bun-linux-x64.zip`],
	])("%s one release off is refused", (_, path, text) => {
		expect(restatementFindings([{ path, text }], version)).toHaveLength(1)
	})

	test("a reviewer hash that differs from the Docker pin is refused", () => {
		const stale = read(SOURCE_BUILD).replace(/(bun-linux-x64\.zip`\s*\|\s*`)[0-9a-f]{64}/, `$1${"0".repeat(64)}`)
		expect(hashFindings(stale, read(PINS))).toHaveLength(1)
	})
})
