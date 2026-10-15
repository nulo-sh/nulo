import { describe, expect, test } from "bun:test"
import { AUTORELEASE_PENDING_LABEL, AUTORELEASE_TAGGED_LABEL, type AutoUnstickInput, decideUnstick } from "./auto-unstick"

const MERGE = "abc123def456abc123def456abc123def456abcd"

/** A genuine stuck Release PR on push:main, with everything but tag state set. */
function stuck(overrides: Partial<AutoUnstickInput> = {}): AutoUnstickInput {
	return {
		autoUnstickEnabled: true,
		releaseCreated: false,
		eventName: "push",
		headSha: MERGE,
		mergedPr: { number: 7, merged: true, baseRef: "main", labels: [AUTORELEASE_PENDING_LABEL], mergeSha: MERGE },
		existingTagSha: null,
		...overrides,
	}
}

describe("decideUnstick — guards (no action)", () => {
	test("flag off → disabled", () => {
		expect(decideUnstick(stuck({ autoUnstickEnabled: false })).action).toBe("disabled")
	})
	test("release-please succeeded → noop", () => {
		expect(decideUnstick(stuck({ releaseCreated: true })).action).toBe("noop")
	})
	test("not a push (workflow_dispatch) → noop", () => {
		expect(decideUnstick(stuck({ eventName: "workflow_dispatch" })).action).toBe("noop")
	})
	test("ordinary push, HEAD not a merged PR → noop", () => {
		expect(decideUnstick(stuck({ mergedPr: null })).action).toBe("noop")
	})
	test("merged PR targets dev, not main → noop", () => {
		const pr = { number: 1, merged: true, baseRef: "dev", labels: [AUTORELEASE_PENDING_LABEL], mergeSha: MERGE }
		expect(decideUnstick(stuck({ mergedPr: pr })).action).toBe("noop")
	})
	test("merged PR without the autorelease:pending label → noop (not a Release PR)", () => {
		const pr = { number: 1, merged: true, baseRef: "main", labels: ["feat"], mergeSha: MERGE }
		expect(decideUnstick(stuck({ mergedPr: pr })).action).toBe("noop")
	})
	test("a Release PR whose merge commit is not HEAD → noop, never a tag at another commit", () => {
		const pr = { number: 1, merged: true, baseRef: "main", labels: [AUTORELEASE_PENDING_LABEL], mergeSha: "0".repeat(40) }
		const d = decideUnstick(stuck({ mergedPr: pr }))
		expect(d.action).toBe("noop")
		expect(d.tagSha).toBeUndefined()
	})
	test("an un-merged PR head → noop", () => {
		const pr = { number: 1, merged: false, baseRef: "main", labels: [AUTORELEASE_PENDING_LABEL], mergeSha: MERGE }
		expect(decideUnstick(stuck({ mergedPr: pr })).action).toBe("noop")
	})
})

describe("decideUnstick — the unstick itself", () => {
	test("stuck Release PR, tag missing → create at the merge SHA", () => {
		const d = decideUnstick(stuck({ existingTagSha: null }))
		expect(d.action).toBe("create")
		expect(d.tagSha).toBe(MERGE)
		expect(d.prNumber).toBe(7)
	})
	test("tag already at the merge SHA → skip (idempotent re-invoke)", () => {
		expect(decideUnstick(stuck({ existingTagSha: MERGE })).action).toBe("skip")
	})
	test("a Release PR already labeled tagged is never tagged here, only continued when its tag names HEAD", () => {
		const pr = { number: 7, merged: true, baseRef: "main", labels: [AUTORELEASE_TAGGED_LABEL], mergeSha: MERGE }
		expect(decideUnstick(stuck({ mergedPr: pr, existingTagSha: null })).action).toBe("noop")
		expect(decideUnstick(stuck({ mergedPr: pr, existingTagSha: MERGE }))).toMatchObject({ action: "skip", prNumber: undefined })
	})
	test("tag exists but points at the WRONG SHA → abort (never re-point)", () => {
		const d = decideUnstick(stuck({ existingTagSha: "0000000000000000000000000000000000000000" }))
		expect(d.action).toBe("abort")
		expect(d.reason).toMatch(/refusing to re-point/)
	})
	test("double-fire is safe: first create, second (tag now present) skips", () => {
		const first = decideUnstick(stuck({ existingTagSha: null }))
		expect(first.action).toBe("create")
		// simulate the tag now existing at the SHA the first call created
		const second = decideUnstick(stuck({ existingTagSha: first.tagSha ?? null }))
		expect(second.action).toBe("skip")
	})
})
