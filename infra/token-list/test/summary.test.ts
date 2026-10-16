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

function repository() {
	const root = mkdtempSync(join(tmpdir(), "token-list-summary-"))
	repos.push(root)
	const git = (args: string[], input?: string) => {
		const run = spawnSync("git", ["-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", ...args], {
			cwd: root,
			encoding: "utf8",
			input,
		})
		if (run.status !== 0) throw new Error(run.stderr)
		return run.stdout.trim()
	}
	git(["init", "-q", "-b", "main"])
	git(["config", "user.email", "test@example.invalid"])
	git(["config", "user.name", "test"])
	const commit = (subject: string, files: Record<string, string> = {}) => {
		for (const [path, text] of Object.entries(files)) {
			mkdirSync(dirname(join(root, path)), { recursive: true })
			writeFileSync(join(root, path), text)
		}
		git(["add", "-A"])
		git(["commit", "-q", "-m", subject])
		return git(["rev-parse", "HEAD"]).slice(0, 12)
	}
	return { root, git, commit }
}

describe("signingChanges: the range starts at the parent of the commit that first carried the list before the current one", () => {
	test("an edit that landed between a run and its squash-merged publish is listed", () => {
		const { root, commit } = repository()
		commit("root", { [OTHER]: "r" })
		const previous = commit("publish-a", { [ENVELOPE]: "A" })
		commit("edit-in-run", { [SCRIPT]: "1" })
		commit("edit-after-run", { [SCRIPT]: "2" })
		commit("publish-b", { [ENVELOPE]: "B" })
		const out = signingChanges(root)
		expect(out).toContain(`Since the parent of ${previous}`)
		expect(out).toContain("edit-after-run")
	})

	test("an edit in the publishing commit is listed", () => {
		const { root, commit } = repository()
		commit("root", { [OTHER]: "r" })
		commit("publish-a", { [ENVELOPE]: "A" })
		commit("publish-b-with-edit", { [ENVELOPE]: "B", [SCRIPT]: "1" })
		expect(signingChanges(root)).toContain("publish-b-with-edit")
	})

	test("an edit stays listed when a later commit touches the envelope without changing its bytes", () => {
		const { root, commit } = repository()
		commit("root", { [OTHER]: "r" })
		commit("publish-a", { [ENVELOPE]: "A" })
		commit("publish-b", { [ENVELOPE]: "B" })
		commit("unpublished-edit", { [SCRIPT]: "1" })
		chmodSync(join(root, ENVELOPE), 0o755)
		commit("envelope-mode-only")
		expect(signingChanges(root)).toContain("unpublished-edit")
	})

	test("a commit that restores older envelope bytes moves no base", () => {
		const { root, commit } = repository()
		commit("root", { [OTHER]: "r" })
		commit("publish-a", { [ENVELOPE]: "A" })
		commit("publish-b", { [ENVELOPE]: "B" })
		commit("edit-after-b", { [SCRIPT]: "1" })
		commit("publish-c", { [ENVELOPE]: "C" })
		commit("restore-b", { [ENVELOPE]: "B" })
		expect(signingChanges(root)).toContain("edit-after-b")
	})

	test("an edit stays listed when a merge keeps older bytes and a later commit restores the side branch's", () => {
		const { root, git, commit } = repository()
		commit("root", { [OTHER]: "r" })
		commit("publish-a", { [ENVELOPE]: "A" })
		commit("publish-b", { [ENVELOPE]: "B" })
		git(["switch", "-q", "-c", "side"])
		commit("side-publish-c", { [ENVELOPE]: "C" })
		git(["switch", "-q", "main"])
		commit("edit-on-main", { [SCRIPT]: "1" })
		git(["merge", "-q", "--no-ff", "-s", "ours", "side", "-m", "merge-keeps-b"])
		commit("restore-c", { [ENVELOPE]: "C" })
		expect(signingChanges(root)).toContain("edit-on-main")
	})

	test("an edit stays listed when another branch copies the previous list's bytes after it", () => {
		const { root, git, commit } = repository()
		commit("root", { [OTHER]: "r" })
		commit("publish-z", { [ENVELOPE]: "Z" })
		git(["switch", "-q", "-c", "side"])
		const previous = commit("publish-a", { [ENVELOPE]: "A" })
		commit("publish-b", { [ENVELOPE]: "B" })
		git(["switch", "-q", "main"])
		commit("edit-on-main", { [SCRIPT]: "1" })
		commit("main-copies-a", { [ENVELOPE]: "A" })
		git(["merge", "-q", "--no-ff", "-X", "theirs", "side", "-m", "merge-takes-b"])
		const out = signingChanges(root)
		expect(out).toContain(`Since the parent of ${previous}`)
		expect(out).toContain("edit-on-main")
	})

	test("an edit and its revert are both listed, though they cancel in the diff", () => {
		const { root, commit } = repository()
		commit("root", { [OTHER]: "r", [SCRIPT]: "0" })
		commit("publish-a", { [ENVELOPE]: "A" })
		commit("publish-b", { [ENVELOPE]: "B" })
		commit("edit", { [SCRIPT]: "1" })
		commit("revert-edit", { [SCRIPT]: "0" })
		const out = signingChanges(root)
		expect(out).toContain("revert-edit")
		expect(out).not.toMatch(/^No signing-relevant change/)
	})

	test("a first publish lists a signing-path edit older than 50 commits", () => {
		const { root, git } = repository()
		const commits = Array.from({ length: 56 }, (_, i) => {
			const subject = i === 0 ? "oldest-edit" : `edit-${i}`
			return [
				"commit refs/heads/main",
				`mark :${i + 1}`,
				`committer test <test@example.invalid> ${1_700_000_000 + i} +0000`,
				`data ${subject.length}`,
				subject,
				...(i === 0 ? [] : [`from :${i}`]),
				`M 100644 inline ${SCRIPT}`,
				`data ${String(i).length}`,
				String(i),
				"",
			].join("\n")
		})
		git(["fast-import", "--quiet"], commits.join("\n"))
		const out = signingChanges(root)
		expect(out).toMatch(/^First publish/)
		expect(out).toContain("oldest-edit")
	})

	test("a shallow clone is refused rather than read as a first publish", () => {
		const { root, commit } = repository()
		commit("publish-a", { [ENVELOPE]: "A" })
		commit("publish-b", { [ENVELOPE]: "B" })
		const shallow = mkdtempSync(join(tmpdir(), "token-list-shallow-"))
		repos.push(shallow)
		const clone = spawnSync("git", ["clone", "-q", "--depth", "1", `file://${root}`, shallow], { encoding: "utf8" })
		expect(clone.status).toBe(0)
		expect(() => signingChanges(shallow)).toThrow("signingChanges needs the full history")
	})
})

describe("signingChanges controls", () => {
	test("two envelope-only publishes read no signing-relevant change", () => {
		const { root, commit } = repository()
		commit("root", { [OTHER]: "r", [SCRIPT]: "0" })
		const previous = commit("publish-a", { [ENVELOPE]: "A" })
		commit("publish-b", { [ENVELOPE]: "B" })
		expect(signingChanges(root)).toBe(
			`No signing-relevant change since the list before the current one was first published (${previous}).\n`,
		)
	})

	test("an edit before the previous list's publish is not listed again", () => {
		const { root, commit } = repository()
		commit("root", { [OTHER]: "r" })
		commit("publish-a", { [ENVELOPE]: "A" })
		commit("edit-before-b", { [SCRIPT]: "1" })
		commit("publish-b", { [ENVELOPE]: "B" })
		commit("edit-after-b", { [SCRIPT]: "2" })
		commit("publish-c", { [ENVELOPE]: "C" })
		const out = signingChanges(root)
		expect(out).toContain("edit-after-b")
		expect(out).not.toContain("edit-before-b")
	})

	test("no envelope, or a single publish, lists as a first publish", () => {
		const none = repository()
		none.commit("edit", { [SCRIPT]: "1" })
		expect(signingChanges(none.root)).toMatch(/^First publish: every commit touching the signing paths\.\n\n```\n\w+ edit\n```\n$/)
		const single = repository()
		single.commit("root", { [OTHER]: "r", [SCRIPT]: "0" })
		single.commit("publish-a", { [ENVELOPE]: "A" })
		expect(signingChanges(single.root)).toMatch(/^First publish/)
	})
})
