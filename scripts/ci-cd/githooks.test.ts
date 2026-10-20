/**
 * The git hooks run the worktree's installed Biome and commitlint on Bun and, before `bun install`,
 * refuse with one line while running nothing. No hook, package script or root script calls a runner
 * that can fetch a package from npm.
 */
import { afterAll, describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, dirname, join } from "node:path"

const ROOT = join(import.meta.dir, "..", "..")
const GIT = Bun.which("git") ?? "git"
const BUN_DIR = dirname(process.execPath)

const HOOKS = ["pre-commit", "commit-msg"] as const
type Hook = (typeof HOOKS)[number]
const TOOL: Record<Hook, string> = { "pre-commit": "biome", "commit-msg": "commitlint" }
const ARGS: Record<Hook, string> = {
	"pre-commit": "check --staged --no-errors-on-unmatched",
	"commit-msg": "--edit .git/COMMIT_EDITMSG",
}
const REFUSAL: Record<Hook, string> = {
	"pre-commit": "pre-commit: Biome is not installed in this worktree. Run bun install first.",
	"commit-msg": "commit-msg: commitlint is not installed in this worktree. Run bun install first.",
}
const GIT_CONFIG = [
	"-c",
	"core.hooksPath=.githooks",
	"-c",
	"commit.gpgsign=false",
	"-c",
	"user.name=fixture",
	"-c",
	"user.email=fixture@example.invalid",
]
/** The runner pattern `release-integrity.test.ts` refuses in its clean jobs, without the installs. */
const RUNNER = /\bbunx\b|\bbun\s+(-\S+\s+)*(x|create)\s|\bnpx\b/

interface Fixture {
	dir: string
	repo: string
	record: string
	sentinels: string
}

const made: string[] = []
afterAll(() => {
	for (const dir of made) rmSync(dir, { recursive: true, force: true })
})

function writeExecutable(path: string, text: string): void {
	mkdirSync(dirname(path), { recursive: true })
	writeFileSync(path, text)
	chmodSync(path, 0o755)
}

/** A clean environment: no inherited `GIT_*`, no user or system git config. */
function cleanEnv(fx: Fixture, path: string, extra: Record<string, string> = {}): Record<string, string> {
	return { PATH: path, HOME: fx.dir, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", RECORD: fx.record, ...extra }
}

function git(fx: Fixture, ...args: string[]): void {
	const run = spawnSync(GIT, [...GIT_CONFIG, ...args], { cwd: fx.repo, env: cleanEnv(fx, BUN_DIR), encoding: "utf8" })
	if (run.status !== 0) throw new Error(`git ${args.join(" ")}: ${run.stderr}`)
}

/** A repo holding only `hook`, a staged file in `sub/`, and sentinels that record any call and fail. */
function fixture(hook: Hook, sentinels: string[], body = readFileSync(join(ROOT, ".githooks", hook), "utf8")): Fixture {
	const dir = mkdtempSync(join(tmpdir(), "nulo-githooks-"))
	made.push(dir)
	const fx = { dir, repo: join(dir, "repo"), record: join(dir, "record"), sentinels: join(dir, "sentinels") }
	writeExecutable(join(fx.repo, ".githooks", hook), body)
	for (const name of sentinels) writeExecutable(join(fx.sentinels, name), `#!/bin/sh\necho "${name} $*" >> "$RECORD"\nexit 1\n`)
	mkdirSync(join(fx.repo, "sub"))
	writeFileSync(join(fx.repo, "sub", "file.txt"), "x\n")
	git(fx, "init", "-q")
	git(fx, "add", "sub/file.txt")
	return fx
}

function commit(fx: Fixture, path: string, extra?: Record<string, string>) {
	return spawnSync(GIT, [...GIT_CONFIG, "commit", "-q", "-m", "fix: a change"], {
		cwd: join(fx.repo, "sub"),
		env: cleanEnv(fx, path, extra),
		encoding: "utf8",
	})
}

function recorded(fx: Fixture): string[] {
	try {
		return readFileSync(fx.record, "utf8").trim().split("\n")
	} catch {
		return []
	}
}

/** An installed launcher stand-in that records its arguments and exits with `TOOL_EXIT`. */
function install(fx: Fixture, hook: Hook): void {
	const tool = TOOL[hook]
	const line = `${tool} \${process.argv.slice(2).join(" ")}\n`
	writeExecutable(
		join(fx.repo, "node_modules", ".bin", tool),
		`require("node:fs").appendFileSync(process.env.RECORD, \`${line}\`)\nprocess.exit(Number(process.env.TOOL_EXIT))\n`,
	)
	if (hook !== "pre-commit") return
	writeExecutable(join(fx.repo, "scripts", "check-no-local-paths.sh"), `#!/bin/sh\necho "paths" >> "$RECORD"\n`)
	writeExecutable(
		join(fx.repo, "scripts", "complexity-baseline", "check.ts"),
		`require("node:fs").appendFileSync(process.env.RECORD, "complexity " + process.argv.slice(2).join(" ") + "\\n")\n`,
	)
}

function tracked(...pathspecs: string[]): string[] {
	const run = spawnSync(GIT, ["ls-files", "-z", "--", ...pathspecs], { cwd: ROOT, encoding: "utf8" })
	if (run.status !== 0) throw new Error(`git ls-files: ${run.stderr}`)
	return run.stdout.split("\0").filter((path) => path !== "")
}

function danglingLauncher(fx: Fixture, hook: Hook): void {
	mkdirSync(join(fx.repo, "node_modules", ".bin"), { recursive: true })
	symlinkSync(join("..", "gone", TOOL[hook]), join(fx.repo, "node_modules", ".bin", TOOL[hook]))
}

describe("git hooks before bun install", () => {
	const states: [string, (fx: Fixture, hook: Hook) => void][] = [
		["no node_modules", () => {}],
		["a dangling launcher link", danglingLauncher],
	]

	for (const hook of HOOKS) {
		for (const [state, arrange] of states) {
			test(`${hook} with ${state} refuses with one line and runs nothing`, () => {
				const fx = fixture(hook, ["bun", "bunx", "npx", "node"])
				arrange(fx, hook)
				const run = commit(fx, fx.sentinels)
				expect(run.status).not.toBe(0)
				expect(run.stderr.trim()).toBe(REFUSAL[hook])
				expect(recorded(fx)).toEqual([])
			})
		}
	}

	test("a hook that reaches bunx is caught by the sentinels", () => {
		const fx = fixture("pre-commit", ["bun", "bunx", "npx", "node"], "#!/bin/sh\nbunx biome check --staged\n")
		expect(commit(fx, fx.sentinels).status).not.toBe(0)
		expect(recorded(fx)).toEqual(["bunx biome check --staged"])
	})
})

describe("git hooks after bun install", () => {
	for (const hook of HOOKS) {
		const later = hook === "pre-commit" ? ["paths", "complexity --staged"] : []

		test(`${hook} runs the worktree's ${TOOL[hook]} with its arguments`, () => {
			const fx = fixture(hook, ["bunx", "npx", "node"])
			install(fx, hook)
			const run = commit(fx, `${fx.sentinels}:${BUN_DIR}`, { TOOL_EXIT: "0" })
			expect(run.status, run.stderr).toBe(0)
			expect(recorded(fx)).toEqual([`${TOOL[hook]} ${ARGS[hook]}`, ...later])
		})

		test(`${hook} refuses the commit when ${TOOL[hook]} fails`, () => {
			const fx = fixture(hook, ["bunx", "npx", "node"])
			install(fx, hook)
			const run = commit(fx, `${fx.sentinels}:${BUN_DIR}`, { TOOL_EXIT: "1" })
			expect(run.status).not.toBe(0)
			expect(recorded(fx)).toEqual([`${TOOL[hook]} ${ARGS[hook]}`])
		})
	}
})

describe("runners", () => {
	test("each hook runs its tool as the worktree's installed launcher on Bun", () => {
		for (const hook of HOOKS) {
			const text = readFileSync(join(ROOT, ".githooks", hook), "utf8")
			expect(text).toContain(`bun --no-install ./node_modules/.bin/${TOOL[hook]} `)
		}
	})

	test("no hook, package script or root script calls a runner that can fetch", () => {
		const sources = tracked(".githooks", "scripts")
			.filter((path) => !/\.(test\.ts|md)$/.test(path))
			.map((path) => [path, readFileSync(join(ROOT, path), "utf8")] as const)
		const scripts = tracked("*package.json")
			.filter((path) => basename(path) === "package.json")
			.flatMap((path) => {
				const entries = Object.entries(JSON.parse(readFileSync(join(ROOT, path), "utf8")).scripts ?? {})
				return entries.map(([name, command]) => [`${path}#${name}`, String(command)] as const)
			})
		const found = [...sources, ...scripts].filter(([, text]) => RUNNER.test(text.replace(/\\\n/g, " ")))
		expect(found.map(([where]) => where)).toEqual([])
	})
})
