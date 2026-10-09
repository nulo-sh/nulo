import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, describe, expect, test } from "vitest"
import { withReconcileLock } from "../../tests/e2e/lockfile"
import { ownIdentity } from "../../tests/e2e/owned-processes"

const DIR = mkdtempSync(path.join(tmpdir(), "nulo-reconcile-lock-test-"))
let n = 0
const lockFile = () => path.join(DIR, `reconcile-${n++}.lock`)
const tick = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

afterAll(() => rmSync(DIR, { recursive: true, force: true }))

describe.skipIf(process.platform !== "linux")("worktree reconcile lock", () => {
	// The interleaving a lock read once cannot survive: a reaper that read a dead owner, and a bare
	// run that adopts the same sandbox while the reaper is still sweeping.
	test("a reap in progress holds off an adoption until it has finished, and the adopter then sees its result", async () => {
		const file = lockFile()
		const owned = path.join(DIR, "owned.json")
		writeFileSync(owned, "dead owner")
		const events: string[] = []
		const reaper = withReconcileLock(
			async () => {
				events.push("reap starts")
				await tick(200)
				rmSync(owned)
				events.push("reap clears the lock")
			},
			{ file, pollMs: 10 },
		)
		await tick(20)
		const adopter = withReconcileLock(
			async () => {
				events.push(`adopter reads ${existsSync(owned) ? "a lock to adopt" : "no lock"}`)
			},
			{ file, pollMs: 10 },
		)
		await Promise.all([reaper, adopter])
		expect(events).toEqual(["reap starts", "reap clears the lock", "adopter reads no lock"])
		expect(existsSync(file)).toBe(false)
	})

	test("a lock left by a dead holder is replaced", async () => {
		const file = lockFile()
		writeFileSync(file, "2000000000:1 0123456789abcdef")
		expect(await withReconcileLock(async () => readFileSync(file, "utf8"), { file, waitMs: 1_000 })).toMatch(
			new RegExp(`^${ownIdentity()} [0-9a-f]{16}$`),
		)
	})

	test("a live holder, or one still being written, is waited for, then refused, and its lock is left alone", async () => {
		for (const holder of [`${ownIdentity()} 0123456789abcdef`, ""]) {
			const file = lockFile()
			writeFileSync(file, holder)
			await expect(withReconcileLock(async () => "ran", { file, waitMs: 150, pollMs: 10 })).rejects.toThrow(
				"another run in this worktree is reconciling",
			)
			expect(readFileSync(file, "utf8")).toBe(holder)
		}
	})
})
