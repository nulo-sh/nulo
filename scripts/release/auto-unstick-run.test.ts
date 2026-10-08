import { describe, expect, test } from "bun:test"
import { AUTORELEASE_PENDING_LABEL, AUTORELEASE_TAGGED_LABEL } from "./auto-unstick"
import { type MergedPrRef, parseAutoUnstickFlag, type RunUnstickOpts, runUnstick, type UnstickIO } from "./auto-unstick-run"

const MERGE = "abc123def456abc123def456abc123def456abcd"

/** A genuine stuck Release PR: merged into main, carries the autorelease:pending label. */
function releasePr(overrides: Partial<MergedPrRef> = {}): MergedPrRef {
	return { number: 7, merged: true, baseRef: "main", labels: [AUTORELEASE_PENDING_LABEL], mergeSha: MERGE, ...overrides }
}

interface Calls {
	resolveMergedPr: string[]
	resolveTagSha: string[]
	createTag: Array<{ tag: string; sha: string; message: string }>
	relabelPr: Array<{ prNumber: number; add: string; remove: string }>
}

/** A recording fake IO. `pr` / `tagSha` script what resolution returns. */
function fakeIO(script: { pr?: MergedPrRef | null; tagSha?: string | null } = {}): { io: UnstickIO; calls: Calls } {
	const calls: Calls = { resolveMergedPr: [], resolveTagSha: [], createTag: [], relabelPr: [] }
	const io: UnstickIO = {
		async resolveMergedPr(headSha) {
			calls.resolveMergedPr.push(headSha)
			return script.pr ?? null
		},
		async resolveTagSha(tag) {
			calls.resolveTagSha.push(tag)
			return script.tagSha ?? null
		},
		async createTag(tag, sha, message) {
			calls.createTag.push({ tag, sha, message })
		},
		async relabelPr(prNumber, add, remove) {
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
	test("flag off → disabled, NO resolution calls (default path)", async () => {
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
