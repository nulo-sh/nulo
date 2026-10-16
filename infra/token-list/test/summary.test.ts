// @vitest-environment node
import { spawnSync } from "node:child_process"
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterAll, describe, expect, test } from "vitest"
import { signingChanges } from "../scripts/summary"

const repos: string[] = []
afterAll(() => {
	for (const repo of repos) rmSync(repo, { recursive: true, force: true })
})

const ENVELOPE = "infra/token-list/public/v1/list.json"
const SCRIPT = "infra/token-list/scripts/sign.ts"
const OTHER = "README.md"

/** A throwaway repository: `commit` writes its files and commits them under its subject. */
function repository() {
	const root = mkdtempSync(join(tmpdir(), "token-list-summary-"))
	repos.push(root)
	const git = (...args: string[]) => {
		const run = spawnSync("git", ["-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", ...args], {
			cwd: root,
			encoding: "utf8",
		})
		if (run.status !== 0) throw new Error(run.stderr)
		return run.stdout.trim()
	}
	git("init", "-q", "-b", "main")
	git("config", "user.email", "test@example.invalid")
	git("config", "user.name", "test")
	const commit = (subject: string, files: Record<string, string> = {}) => {
		for (const [path, text] of Object.entries(files)) {
			mkdirSync(dirname(join(root, path)), { recursive: true })
			writeFileSync(join(root, path), text)
		}
		git("add", "-A")
		git("commit", "-q", "-m", subject)
		return git("rev-parse", "HEAD").slice(0, 12)
	}
	return { root, commit }
}

describe("signingChanges: the range starts at the parent of the commit that first carried the current envelope", () => {
	test("a signing-path edit in that commit is listed", () => {
		const { root, commit } = repository()
		commit("root", { [OTHER]: "r" })
		const publish = commit("publish-with-edit", { [ENVELOPE]: "A", [SCRIPT]: "1" })
		const out = signingChanges(root)
		expect(out).toContain(`Since the parent of ${publish}`)
		expect(out).toContain("publish-with-edit")
	})

	test("an earlier edit stays listed when a later commit touches the envelope without changing its bytes", () => {
		const { root, commit } = repository()
		commit("root", { [OTHER]: "r" })
		commit("publish-a", { [ENVELOPE]: "A" })
		commit("unpublished-edit", { [SCRIPT]: "1" })
		chmodSync(join(root, ENVELOPE), 0o755)
		commit("envelope-mode-only")
		expect(signingChanges(root)).toContain("unpublished-edit")
	})

	test("a commit that restores older envelope bytes moves no base", () => {
		const { root, commit } = repository()
		commit("root", { [OTHER]: "r" })
		const first = commit("publish-a", { [ENVELOPE]: "A" })
		commit("edit-after-a", { [SCRIPT]: "1" })
		commit("publish-b", { [ENVELOPE]: "B" })
		commit("restore-a", { [ENVELOPE]: "A" })
		const out = signingChanges(root)
		expect(out).toContain(`Since the parent of ${first}`)
		expect(out).toContain("edit-after-a")
	})

	test("a first publish lists a signing-path edit older than 50 commits", () => {
		const { root, commit } = repository()
		commit("oldest-edit", { [SCRIPT]: "0" })
		for (let i = 1; i <= 55; i++) commit(`edit-${i}`, { [SCRIPT]: String(i) })
		const out = signingChanges(root)
		expect(out).toMatch(/^First publish/)
		expect(out).toContain("oldest-edit")
	})
})

describe("signingChanges controls", () => {
	test("a publish touching only the envelope reads no signing-relevant change", () => {
		const { root, commit } = repository()
		commit("root", { [OTHER]: "r", [SCRIPT]: "0" })
		const publish = commit("publish-a", { [ENVELOPE]: "A" })
		expect(signingChanges(root)).toBe(`No signing-relevant change since the current list was first published (${publish}).\n`)
	})

	test("a second ordinary publish bases on itself", () => {
		const { root, commit } = repository()
		commit("root", { [OTHER]: "r" })
		commit("publish-a", { [ENVELOPE]: "A" })
		commit("edit-before-b", { [SCRIPT]: "1" })
		const second = commit("publish-b", { [ENVELOPE]: "B" })
		commit("edit-after-b", { [SCRIPT]: "2" })
		const out = signingChanges(root)
		expect(out).toContain(`Since the parent of ${second}`)
		expect(out).toContain("edit-after-b")
		expect(out).not.toContain("edit-before-b")
	})

	test("no envelope, or an envelope first carried by a root commit, lists as a first publish", () => {
		const none = repository()
		none.commit("edit", { [SCRIPT]: "1" })
		expect(signingChanges(none.root)).toMatch(/^First publish: every commit touching the signing paths\.\n\n```\n\w+ edit\n```\n$/)
		const rooted = repository()
		rooted.commit("root-publish", { [ENVELOPE]: "A", [SCRIPT]: "0" })
		expect(signingChanges(rooted.root)).toContain("root-publish")
		expect(signingChanges(rooted.root)).toMatch(/^First publish/)
	})
})
