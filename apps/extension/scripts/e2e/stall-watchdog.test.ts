import { spawn } from "node:child_process"
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs"
import { createRequire } from "node:module"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, describe, expect, test } from "vitest"
import { FORK_ENTRY } from "../../tests/e2e/stall-watchdog"

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "stall-watchdog")
const vitestBin = path.join(path.dirname(createRequire(import.meta.url).resolve("vitest/package.json")), "vitest.mjs")
const DEADLINE_MS = 90_000

type Run = { code: number | null; ms: number; output: string; stateDir: string }
const cleanups: (() => void)[] = []

afterEach(() => {
	for (const cleanup of cleanups.splice(0)) cleanup()
})

/** One nested vitest run on Node, the e2e runtime, killed at the deadline if it never ends. */
function nestedRun(...files: string[]): Promise<Run> {
	const stateDir = mkdtempSync(path.join(os.tmpdir(), "stall-watchdog-"))
	cleanups.push(() => rmSync(stateDir, { recursive: true, force: true }))
	const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("VITEST") && key !== "NODE_OPTIONS"))
	const child = spawn("node", [vitestBin, "run", "--root", fixtures, "--config", path.join(fixtures, "vitest.config.ts")], {
		env: { ...env, STALL_FIXTURES: files.join(","), STALL_STATE_DIR: stateDir },
		stdio: ["ignore", "pipe", "pipe"],
		detached: true,
	})
	let output = ""
	child.stdout.on("data", (chunk) => (output += chunk))
	child.stderr.on("data", (chunk) => (output += chunk))
	const start = Date.now()
	return new Promise((resolve) => {
		const deadline = setTimeout(() => process.kill(-(child.pid ?? 0), "SIGKILL"), DEADLINE_MS)
		child.on("exit", (code) => {
			clearTimeout(deadline)
			resolve({ code, ms: Date.now() - start, output, stateDir })
		})
	})
}

/** Forks of the nested run still alive: its state dir in their environ, the fork entry in their argv. */
function survivingForks(stateDir: string): number[] {
	return readdirSync("/proc")
		.filter((name) => /^\d+$/.test(name))
		.filter((pid) => {
			try {
				return (
					readFileSync(`/proc/${pid}/environ`, "utf8").split("\0").includes(`STALL_STATE_DIR=${stateDir}`) &&
					readFileSync(`/proc/${pid}/cmdline`, "utf8").includes(FORK_ENTRY)
				)
			} catch {
				return false
			}
		})
		.map(Number)
}

function detachedChild(run: Run): number {
	const pid = Number(readFileSync(path.join(run.stateDir, "detached.pid"), "utf8"))
	cleanups.push(() => {
		try {
			process.kill(pid, "SIGKILL")
		} catch {}
	})
	return pid
}

const alive = (pid: number) => {
	try {
		process.kill(pid, 0)
		return true
	} catch {
		return false
	}
}

describe.skipIf(process.platform !== "linux")("stall watchdog", () => {
	test("a silent run fails, names the file, starts no other, and kills only its forks", { timeout: 120_000 }, async () => {
		const run = await nestedRun("a-spin.fixture.ts", "b-after.fixture.ts")
		const detached = detachedChild(run)
		const state = (name: string) => path.join(run.stateDir, name)

		expect(run.code, run.output).not.toBeNull()
		expect(run.code, run.output).not.toBe(0)
		expect(run.ms).toBeLessThan(DEADLINE_MS)
		expect(readFileSync(state("stalled"), "utf8")).toContain("a-spin.fixture.ts")
		expect(run.output).toMatch(/\[stall-watchdog\] killing fork \d+/)
		expect(existsSync(state("after-ran")), "a file started after the stall").toBe(false)
		expect(existsSync(state("teardown-ran")), "global teardown never ran").toBe(true)
		expect(survivingForks(run.stateDir)).toEqual([])
		expect(alive(detached)).toBe(true)
	})

	test("a run that keeps logging or retrying is never cancelled", { timeout: 120_000 }, async () => {
		const run = await nestedRun("progress.fixture.ts", "retry.fixture.ts")
		detachedChild(run)

		expect(run.code, run.output).toBe(0)
		expect(existsSync(path.join(run.stateDir, "stalled"))).toBe(false)
		expect(run.output).not.toContain("no progress")
	})
})
