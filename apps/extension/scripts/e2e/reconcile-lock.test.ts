import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { afterAll, describe, expect, test } from "vitest"
import { withReconcileLock } from "../../tests/e2e/lockfile"
import { ownIdentity } from "../../tests/e2e/owned-processes"

const MODULE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../tests/e2e/lockfile.ts")
const DEAD_HOLDER = "2000000000:1 0123456789abcdef"
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
		writeFileSync(file, DEAD_HOLDER)
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

	// Every waiter finds the same dead holder at once: only one may break it, or a slower breaker
	// unlinks the lock the faster one has just taken and both enter.
	test("waiters in separate processes that all find one dead holder never overlap", async () => {
		const file = lockFile()
		writeFileSync(file, DEAD_HOLDER)
		const log = path.join(DIR, "critical.log")
		const script = path.join(DIR, "waiter.mjs")
		writeFileSync(
			script,
			`import { appendFileSync } from "node:fs"
const { withReconcileLock } = await import(${JSON.stringify(MODULE)})
const { LOCK: file, LOG: log, ID: id } = process.env
const spin = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
for (let i = 0; i < 3; i++) {
	await withReconcileLock(async () => {
		appendFileSync(log, id + " enter\\n")
		spin(15)
		appendFileSync(log, id + " exit\\n")
	}, { file, waitMs: 15000, pollMs: 2 })
}
`,
		)
		const exits = await Promise.all(
			[1, 2, 3, 4].map(
				(id) =>
					new Promise<number | null>((resolve) => {
						const child = spawn(process.execPath, [script], {
							stdio: "inherit",
							env: { ...process.env, LOCK: file, LOG: log, ID: String(id) },
						})
						child.once("exit", resolve)
					}),
			),
		)
		expect(exits).toEqual([0, 0, 0, 0])
		const events = readFileSync(log, "utf8").trim().split("\n")
		expect(events).toHaveLength(24)
		for (let i = 0; i < events.length; i += 2) {
			const [id, what] = events[i].split(" ")
			expect([what, events[i + 1]]).toEqual(["enter", `${id} exit`])
		}
		expect(existsSync(file)).toBe(false)
	})

	// The interleaving the separate-process case can only hit by chance: a breaker that read the dead
	// holder while another was mid-break must not unlink what is there by the time it acts.
	test("while another waiter holds the break for a dead holder, no one else unlinks its lock", async () => {
		const file = lockFile()
		writeFileSync(file, DEAD_HOLDER)
		const breaking = `${file}.break-${createHash("sha256").update(DEAD_HOLDER).digest("hex").slice(0, 16)}`
		writeFileSync(breaking, "")
		await expect(withReconcileLock(async () => "ran", { file, waitMs: 150, pollMs: 10 })).rejects.toThrow(
			"another run in this worktree is reconciling",
		)
		expect(readFileSync(file, "utf8")).toBe(DEAD_HOLDER)
		rmSync(breaking)
		expect(await withReconcileLock(async () => "ran", { file, waitMs: 1_000 })).toBe("ran")
	})

	test("a lock that cannot be read fails at once instead of spinning", async () => {
		const file = lockFile()
		writeFileSync(file, DEAD_HOLDER)
		chmodSync(file, 0o000)
		await expect(withReconcileLock(async () => "ran", { file, waitMs: 60_000 })).rejects.toThrow(/EACCES/)
		chmodSync(file, 0o600)
	})
})
