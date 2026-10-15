/**
 * The repo's commitlint config through the installed CLI, run on Bun so the test needs no Node on PATH:
 * CLAUDE.md asks for a lower-case subject, and the conventional preset alone lets an upper-case word through.
 */
import { describe, expect, test } from "bun:test"
import { join } from "node:path"

const ROOT = join(import.meta.dir, "..", "..")
const COMMITLINT = join(ROOT, "node_modules", ".bin", "commitlint")

const lint = (message: string) =>
	Bun.spawnSync([process.execPath, COMMITLINT], { cwd: ROOT, stdin: Buffer.from(message), stdout: "pipe", stderr: "pipe" })

describe(".commitlintrc.json", () => {
	test("a subject with an upper-case word is refused", () => {
		const run = lint("fix: handle PXE errors")
		expect(run.exitCode).toBe(1)
		expect(run.stdout.toString()).toContain("subject-case")
	})

	test("the same subject in lower case passes", () => {
		const run = lint("fix: handle pxe errors")
		expect(run.exitCode, run.stdout.toString()).toBe(0)
	})
})
