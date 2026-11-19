import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { AUTORELEASE_PENDING_LABEL, AUTORELEASE_TAGGED_LABEL } from "./auto-unstick"
import { type MergedPrRef, parseAutoUnstickFlag, type RunUnstickOpts, realUnstickIO, runUnstick, type UnstickIO } from "./auto-unstick-run"
import { fakeGh } from "./fake-gh"

const MERGE = "abc123def456abc123def456abc123def456abcd"

/** A genuine stuck Release PR: merged into main, carries the autorelease:pending label. */
function releasePr(overrides: Partial<MergedPrRef> = {}): MergedPrRef {
	return { number: 7, merged: true, baseRef: "main", labels: [AUTORELEASE_PENDING_LABEL], mergeSha: MERGE, ...overrides }
}

const FILLED = "# Terms\n\n**Version 1.0 — effective 3 June 2027**\n"
const BLANK = "# Terms\n\n**Version 1.0 — effective «FILL: effective date»**\n"
const NOTES = "What changed for you.\n\n- One change.\n"

interface Calls {
	/** Every IO call by name, in the order the runner made them. */
	order: string[]
	readFileAt: Array<{ sha: string; path: string }>
	resolveMergedPr: string[]
	resolveTagSha: string[]
	createTag: Array<{ tag: string; sha: string; message: string }>
	relabelPr: Array<{ prNumber: number; add: string; remove: string }>
}

/**
 * A recording fake IO. `pr` / `tagSha` script what resolution returns; `files` what the merge commit
 * holds; `notes` the text of any `release-notes/` file there (absent when null).
 */
function fakeIO(script: { pr?: MergedPrRef | null; tagSha?: string | null; files?: Record<string, string>; notes?: string | null } = {}): {
	io: UnstickIO
	calls: Calls
} {
	const calls: Calls = { order: [], readFileAt: [], resolveMergedPr: [], resolveTagSha: [], createTag: [], relabelPr: [] }
	const files = script.files ?? { "legal/terms.md": FILLED, "legal/privacy.md": FILLED }
	const io: UnstickIO = {
		async resolveMergedPr(headSha) {
			calls.order.push("resolveMergedPr")
			calls.resolveMergedPr.push(headSha)
			return script.pr ?? null
		},
		async resolveTagSha(tag) {
			calls.order.push("resolveTagSha")
			calls.resolveTagSha.push(tag)
			return script.tagSha ?? null
		},
		async readFileAt(sha, path) {
			calls.order.push("readFileAt")
			calls.readFileAt.push({ sha, path })
			const notes = script.notes === undefined ? NOTES : (script.notes ?? undefined)
			const text = path.startsWith("release-notes/") ? notes : files[path]
			if (text === undefined) throw new Error(`no ${path} at ${sha}`)
			return text
		},
		async createTag(tag, sha, message) {
			calls.order.push("createTag")
			calls.createTag.push({ tag, sha, message })
		},
		async relabelPr(prNumber, add, remove) {
			calls.order.push("relabelPr")
			calls.relabelPr.push({ prNumber, add, remove })
		},
		log() {},
	}
	return { io, calls }
}

function opts(over: Partial<RunUnstickOpts> & Pick<RunUnstickOpts, "io">): RunUnstickOpts {
	return {
		autoUnstickEnabled: true,
		releaseCreated: false,
		eventName: "push",
		headSha: MERGE,
		version: "0.24.0",
		...over,
	}
}

describe("parseAutoUnstickFlag — on by default; the variable only turns it off", () => {
	test("unset or empty → on: deleting the variable never strands a release", () => {
		for (const raw of [undefined, "", "  "]) expect(parseAutoUnstickFlag(raw), String(raw)).toEqual({ enabled: true })
	})

	test("on, true, 1 → on, in any case and with whitespace", () => {
		for (const raw of ["on", "TRUE", " 1 "]) expect(parseAutoUnstickFlag(raw), raw).toEqual({ enabled: true })
	})

	test("off, false, 0 → off, without a warning", () => {
		for (const raw of ["off", "False", " 0"]) expect(parseAutoUnstickFlag(raw), raw).toEqual({ enabled: false })
	})

	test("any other value → off with a warning: a typo meant to disable never enables", () => {
		for (const raw of ["of", "no", "disabled"]) {
			const flag = parseAutoUnstickFlag(raw)
			expect(flag.enabled, raw).toBe(false)
			expect(flag.warning, raw).toContain("stays off")
		}
	})
})

describe("runUnstick — zero-API short-circuit on the common path", () => {
	test("flag off → disabled, NO resolution calls", async () => {
		const { io, calls } = fakeIO({ pr: releasePr() })
		const r = await runUnstick(opts({ io, autoUnstickEnabled: false }))
		expect(r.action).toBe("disabled")
		expect(r.exitCode).toBe(0)
		expect(r.performed).toBe(false)
		expect(r.continues).toBe(false)
		expect(calls.resolveMergedPr).toHaveLength(0)
		expect(calls.resolveTagSha).toHaveLength(0)
	})

	test("release-please succeeded → noop, no resolution", async () => {
		const { io, calls } = fakeIO({ pr: releasePr() })
		const r = await runUnstick(opts({ io, releaseCreated: true }))
		expect(r.action).toBe("noop")
		expect(calls.resolveMergedPr).toHaveLength(0)
	})

	test("not a push (workflow_dispatch) → noop, no resolution", async () => {
		const { io, calls } = fakeIO({ pr: releasePr() })
		const r = await runUnstick(opts({ io, eventName: "workflow_dispatch" }))
		expect(r.action).toBe("noop")
		expect(calls.resolveMergedPr).toHaveLength(0)
	})

	test("eligible but HEAD is not a merged PR → noop (PR resolved, tag NOT)", async () => {
		const { io, calls } = fakeIO({ pr: null })
		const r = await runUnstick(opts({ io }))
		expect(r.action).toBe("noop")
		expect(calls.resolveMergedPr).toHaveLength(1)
		expect(calls.resolveTagSha).toHaveLength(0)
	})
})

describe("runUnstick — the unstick itself", () => {
	test("stuck Release PR, tag missing → create tag + relabel, and no release (attach-assets owns it)", async () => {
		const { io, calls } = fakeIO({ pr: releasePr(), tagSha: null })
		const r = await runUnstick(opts({ io }))
		expect(r.action).toBe("create")
		expect(r.performed).toBe(true)
		expect(r.continues).toBe(true)
		expect(r.exitCode).toBe(0)
		expect(calls.createTag).toEqual([{ tag: "v0.24.0", sha: MERGE, message: "Release 0.24.0" }])
		expect(calls.relabelPr).toEqual([{ prNumber: 7, add: AUTORELEASE_TAGGED_LABEL, remove: AUTORELEASE_PENDING_LABEL }])
	})

	test("tag already at the merge SHA → skip (no 2nd tag), HEALS the label and continues the publish", async () => {
		// A prior run may have created the tag then died before the relabel finished.
		const { io, calls } = fakeIO({ pr: releasePr(), tagSha: MERGE })
		const r = await runUnstick(opts({ io }))
		expect(r.action).toBe("skip")
		expect(r.performed).toBe(false)
		expect(r.continues).toBe(true)
		expect(r.exitCode).toBe(0)
		expect(calls.createTag).toHaveLength(0)
		expect(calls.relabelPr).toEqual([{ prNumber: 7, add: AUTORELEASE_TAGGED_LABEL, remove: AUTORELEASE_PENDING_LABEL }])
	})

	test("the relabel landed but its attempt died: the retry continues the publish without touching the PR", async () => {
		const { io, calls } = fakeIO({ pr: releasePr({ labels: [AUTORELEASE_TAGGED_LABEL] }), tagSha: MERGE })
		const r = await runUnstick(opts({ io }))
		expect({ action: r.action, continues: r.continues }).toEqual({ action: "skip", continues: true })
		expect(calls.createTag).toHaveLength(0)
		expect(calls.relabelPr).toHaveLength(0)
	})

	test("tag exists but points at the WRONG SHA → abort, exit 1, no tag write", async () => {
		const { io, calls } = fakeIO({ pr: releasePr(), tagSha: "0000000000000000000000000000000000000000" })
		const r = await runUnstick(opts({ io }))
		expect(r.action).toBe("abort")
		expect(r.exitCode).toBe(1)
		expect(r.continues).toBe(false)
		expect(calls.createTag).toHaveLength(0)
	})

	test("double-fire is idempotent: 2nd run (tag now present) skips, no 2nd tag", async () => {
		const first = fakeIO({ pr: releasePr(), tagSha: null })
		expect((await runUnstick(opts({ io: first.io }))).action).toBe("create")
		// the tag the first run created now exists at the merge SHA
		const second = fakeIO({ pr: releasePr(), tagSha: MERGE })
		const r2 = await runUnstick(opts({ io: second.io }))
		expect(r2.action).toBe("skip")
		expect(second.calls.createTag).toHaveLength(0)
		expect(second.calls.relabelPr).toHaveLength(1)
	})

	test("a prerelease version (rc) → its own tag", async () => {
		const { io, calls } = fakeIO({ pr: releasePr(), tagSha: null })
		const r = await runUnstick(opts({ io, version: "0.24.0-rc.1" }))
		expect(r.action).toBe("create")
		expect(calls.createTag[0].tag).toBe("v0.24.0-rc.1")
	})

	test("a promote PR (base main, NO autorelease:pending label) → noop, no tag", async () => {
		// main also advances via `release: promote dev → main` merge commits; those
		// are NOT release-please Release PRs and must never trip the unstick.
		const promote = releasePr({ labels: ["release"] })
		const { io, calls } = fakeIO({ pr: promote, tagSha: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef" })
		const r = await runUnstick(opts({ io }))
		expect(r.action).toBe("noop")
		expect(calls.createTag).toHaveLength(0)
	})
})

describe("runUnstick — no launch with a blank in the legal documents", () => {
	test("a stable 1.0.0 whose merge commit holds a «FILL» gets no tag, keeps its label and exits red with the recovery", async () => {
		const { io, calls } = fakeIO({ pr: releasePr(), files: { "legal/terms.md": BLANK, "legal/privacy.md": FILLED } })
		const r = await runUnstick(opts({ io, version: "1.0.0" }))
		expect({ action: r.action, performed: r.performed, continues: r.continues, exitCode: r.exitCode }).toEqual({
			action: "refused",
			performed: false,
			continues: false,
			exitCode: 1,
		})
		expect(r.reason).toContain("legal/terms.md:3:")
		expect(r.reason).toContain("No tag was created")
		expect(r.reason).toContain("Troubleshooting")
		expect(calls.createTag).toHaveLength(0)
		expect(calls.relabelPr).toHaveLength(0)
	})

	test("it reads both documents and the release notes at the merge commit before it writes anything", async () => {
		const { io, calls } = fakeIO({ pr: releasePr() })
		expect((await runUnstick(opts({ io, version: "1.0.0" }))).action).toBe("create")
		expect(calls.readFileAt).toEqual([
			{ sha: MERGE, path: "legal/terms.md" },
			{ sha: MERGE, path: "legal/privacy.md" },
			{ sha: MERGE, path: "release-notes/1.0.0.md" },
		])
		expect(calls.order).toEqual([
			"resolveMergedPr",
			"resolveTagSha",
			"readFileAt",
			"readFileAt",
			"readFileAt",
			"createTag",
			"relabelPr",
		])
	})

	test("a filled 1.0.0 and a 0.x release with a «FILL» are tagged as before", async () => {
		const filled = fakeIO({ pr: releasePr() })
		expect((await runUnstick(opts({ io: filled.io, version: "1.0.0" }))).action).toBe("create")
		expect(filled.calls.createTag).toEqual([{ tag: "v1.0.0", sha: MERGE, message: "Release 1.0.0" }])
		const early = fakeIO({ pr: releasePr(), files: { "legal/terms.md": BLANK, "legal/privacy.md": BLANK } })
		expect((await runUnstick(opts({ io: early.io, version: "0.31.0" }))).action).toBe("create")
		expect(early.calls.createTag).toEqual([{ tag: "v0.31.0", sha: MERGE, message: "Release 0.31.0" }])
	})

	test("a document missing at the merge commit fails the run before any tag", async () => {
		const { io, calls } = fakeIO({ pr: releasePr(), files: { "legal/terms.md": FILLED } })
		await expect(runUnstick(opts({ io, version: "1.0.0" }))).rejects.toThrow(/legal\/privacy\.md/)
		expect(calls.createTag).toHaveLength(0)
	})

	test("a stable whose merge commit lacks its release notes, or holds notes that cannot ship, gets no tag", async () => {
		for (const notes of [null, "## Heading\n"]) {
			const { io, calls } = fakeIO({ pr: releasePr(), notes })
			const r = await runUnstick(opts({ io, version: "1.3.0" }))
			expect({ action: r.action, exitCode: r.exitCode }).toEqual({ action: "refused", exitCode: 1 })
			expect(r.reason).toContain("release-notes/1.3.0.md")
			expect(r.reason).toContain("No tag was created")
			expect(calls.createTag).toHaveLength(0)
			expect(calls.relabelPr).toHaveLength(0)
		}
	})

	test("the job installs nothing, so the check is loaded by relative path from a file that imports nothing", () => {
		const read = (path: string) => readFileSync(join(import.meta.dir, path), "utf8")
		expect(read("auto-unstick-run.ts")).toContain('from "../../packages/legal/src/launch"')
		expect(read("../../packages/legal/src/launch.ts")).not.toMatch(/^\s*import\b|\brequire\(|\bimport\(|\bfrom\s*["']/m)
	})
})

describe("the gh lookup", () => {
	const lookup = (sha: string) => `api repos/o/r/commits/${sha}/pulls --jq .[]`

	test("a failed lookup throws, an empty answer is no PR, and only the PR this commit merged counts, reading no further", async () => {
		const pr = (number: number, mergeSha: string) =>
			JSON.stringify({
				number,
				merged_at: "2026-11-01T00:00:00Z",
				base: { ref: "main" },
				labels: [{ name: "x" }],
				merge_commit_sha: mergeSha,
			})
		const gh = fakeGh([
			{ args: lookup("f00"), stderr: "HTTP 502\n", exit: 4 },
			{ args: lookup("e00") },
			{ args: lookup("m00"), stdout: `${pr(3, "other")}\n\n${pr(7, "m00")}\nnot json\n` },
		])
		try {
			const io = realUnstickIO("o/r")
			expect(await io.resolveMergedPr("f00").catch((e: Error) => e.message)).toBe(
				"gh api commits/f00/pulls failed (exit 4): HTTP 502",
			)
			expect(await io.resolveMergedPr("e00")).toBeNull()
			expect(await io.resolveMergedPr("m00")).toEqual({ number: 7, merged: true, baseRef: "main", labels: ["x"], mergeSha: "m00" })
		} finally {
			gh.restore()
		}
	})
})
