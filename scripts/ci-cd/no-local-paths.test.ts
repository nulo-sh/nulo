/**
 * The home-path guard in CI. Its other caller, the pre-commit hook, is skipped by `--no-verify`.
 * Wired into CI via the root `test:ci-gating` script in `_unit-tests.yml`.
 */
import { describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const ROOT = join(import.meta.dir, "..", "..")
const GUARD = join(ROOT, "scripts", "check-no-local-paths.sh")

const guard = (cwd: string) => Bun.spawnSync(["bash", GUARD], { cwd, stdout: "pipe", stderr: "pipe" })
const git = (cwd: string, ...args: string[]) => {
	const run = Bun.spawnSync(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" })
	if (run.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${run.stderr.toString()}`)
}

describe("check-no-local-paths.sh", () => {
	test("the tree carries no home path", () => {
		const run = guard(ROOT)
		expect(run.exitCode, run.stderr.toString()).toBe(0)
	})

	test("a tracked file naming a home path fails the guard, and passes once the path is gone", () => {
		const repo = mkdtempSync(join(tmpdir(), "nulo-home-path-"))
		try {
			git(repo, "init", "--quiet")
			// Assembled here so this file never carries the shapes it tests for.
			const leaks: Record<string, string[]> = {
				"linux.md": ["", "home", "someone", "notes.md"],
				"mounted.md": ["", "mnt", "data", "someone", "notes.md"],
			}
			for (const [file, parts] of Object.entries(leaks)) writeFileSync(join(repo, file), `see ${parts.join("/")}\n`)
			git(repo, "add", ".")
			const refused = guard(repo)
			expect(refused.exitCode).toBe(1)
			for (const file of Object.keys(leaks)) expect(refused.stderr.toString()).toContain(file)

			for (const file of Object.keys(leaks)) writeFileSync(join(repo, file), "see docs/notes.md\n")
			expect(guard(repo).exitCode).toBe(0)
		} finally {
			rmSync(repo, { recursive: true, force: true })
		}
	})
})
