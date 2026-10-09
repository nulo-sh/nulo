/**
 * Code and config never cite a review, an audit round or a milestone: a comment states the invariant,
 * and provenance lives in git history and the PR (CLAUDE.md § Code-comment style). A bare `phase N`
 * (live runtime phases) and plan paths are allowed.
 */
import { describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = join(import.meta.dir, "..", "..")
const SCOPE = ["apps", "packages", "scripts", ".github", ".githooks"]
const SKIPPED = /\.(md|json|svg)$/
const SELF = "scripts/ci-cd/workflow-refs.test.ts"

const FAMILIES: { name: string; pattern: RegExp }[] = [
	{
		name: "a review or audit finding or round",
		pattern: /review (finding|confirmed)|audit round|\bper audit\b|\b(round|r) ?[0-9]+('s)? (audit|review|finding)s?\b/i,
	},
	{
		name: "a reviewer named with a review word",
		pattern: /\b(codex|opus|fable|sonnet|claude|kimi|gemini)('s)? (review|reviewer|audit|round|lens|finding|pass)/i,
	},
	{
		name: "a milestone tag",
		pattern: /\b[MA][0-9]+\.[0-9]+\b|\bpre-A[0-9]+\b|\b[Pp]hase [0-9]+[a-z]\b|\bPR-[0-9]+\b|\bStage [A-Z]\b|\bArc [0-9]+\b/,
	},
]

/** The family a line's workflow reference belongs to, or null for a clean line. */
function workflowReference(line: string): string | null {
	return FAMILIES.find(({ pattern }) => pattern.test(line))?.name ?? null
}

/** Every tracked text file in scope, read from the checkout. */
function trackedFiles(): string[] {
	const run = spawnSync("git", ["ls-files", "-z", "--", ...SCOPE], { cwd: ROOT, encoding: "utf8" })
	if (run.status !== 0) throw new Error(`git ls-files: ${run.stderr}`)
	return run.stdout.split("\0").filter((path) => path !== "" && path !== SELF && !SKIPPED.test(path) && existsSync(join(ROOT, path)))
}

function scan(files: string[]): string[] {
	const found: string[] = []
	for (const path of files) {
		const text = readFileSync(join(ROOT, path), "utf8")
		if (text.includes("\0")) continue
		text.split("\n").forEach((line, i) => {
			const family = workflowReference(line)
			if (family) found.push(`${path}:${i + 1}: ${family}: ${line.trim()}`)
		})
	}
	return found
}

describe("workflow references in code and config", () => {
	test("the tree carries none", () => {
		const files = trackedFiles()
		expect(files.length).toBeGreaterThan(1500)
		expect(files).toContain("apps/extension/scripts/e2e/agent.sh")
		expect(scan(files)).toEqual([])
	})

	test.each([
		["// see the review finding", "a review or audit finding or round"],
		["# trap left out (review CONFIRMED x5)", "a review or audit finding or round"],
		["/* fixed in audit round 2 */", "a review or audit finding or round"],
		['// retry removed (per audit "zero retries")', "a review or audit finding or round"],
		["* The R1 audits' bricking class", "a review or audit finding or round"],
		["// raised by the Codex review", "a reviewer named with a review word"],
		["// Opus lens: keep this", "a reviewer named with a review word"],
		["// landed in M4.10", "a milestone tag"],
		["// since A11.1", "a milestone tag"],
		["// pre-A11 layout", "a milestone tag"],
		["// added in phase 4b", "a milestone tag"],
		["// from PR-2", "a milestone tag"],
		["// Stage D only", "a milestone tag"],
		["// Arc 3 adds the guard", "a milestone tag"],
	])("refuses %p", (line, family) => {
		expect(workflowReference(line)).toBe(family)
	})

	test.each([
		"// phase 1 runs before the session opens",
		"// See implementations-plan/archive/journal-stage-restructure/plan.md.",
		"// reviewer sign-off in the PR description",
		"/** Stage a single value write. */",
		"// review the diff before you merge it",
		"// the audit gate refuses an unacknowledged advisory",
		"const round2 = round(1.25, 2)",
	])("allows %p", (line) => {
		expect(workflowReference(line)).toBeNull()
	})
})
