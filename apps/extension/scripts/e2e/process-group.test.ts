// @vitest-environment node
import { type ChildProcess, spawn } from "node:child_process"
import { afterEach, describe, expect, test, vi } from "vitest"
import { killProcessGroup } from "../../tests/e2e/process-group"

const spawned: number[] = []

function groupAlive(pgid: number): boolean {
	try {
		process.kill(-pgid, 0)
		return true
	} catch {
		return false
	}
}

function spawnGroup(script: string): ChildProcess {
	const child = spawn("sh", ["-c", script], { detached: true, stdio: "ignore" })
	if (!child.pid) throw new Error("spawn failed")
	spawned.push(child.pid)
	return child
}

const exited = (child: ChildProcess) =>
	child.exitCode !== null || child.signalCode !== null ? Promise.resolve() : new Promise<void>((r) => child.once("exit", () => r()))

// A member that ignores SIGTERM, under a leader that waits for it.
const STUBBORN_MEMBER = '(trap "" TERM; exec sleep 30) &'

afterEach(() => {
	// Only a group a failed case left alive; a gone group's id may already be another process's.
	for (const pgid of spawned.splice(0)) {
		if (!groupAlive(pgid)) continue
		try {
			process.kill(-pgid, "SIGKILL")
		} catch {
			// already gone
		}
	}
})

describe.skipIf(process.platform === "win32")("killProcessGroup", () => {
	test("escalates when the leader exits cleanly on SIGTERM and a member ignores it", async () => {
		const child = spawnGroup(`trap "exit 0" TERM; ${STUBBORN_MEMBER} wait`)
		await vi.waitFor(() => expect(groupAlive(child.pid as number)).toBe(true))

		const result = await killProcessGroup(child, "stubborn-member", true, 300)

		expect(result).toEqual({ escalated: true, stopped: true })
		expect(groupAlive(child.pid as number)).toBe(false)
	})

	test("(control) a group whose members all exit on SIGTERM ends with no escalation", async () => {
		const child = spawnGroup("sleep 30 & wait")
		await vi.waitFor(() => expect(groupAlive(child.pid as number)).toBe(true))

		const result = await killProcessGroup(child, "cooperative", true, 2_000)

		expect(result).toEqual({ escalated: false, stopped: true })
		expect(groupAlive(child.pid as number)).toBe(false)
	})

	test("never escalates a group whose leader exited before teardown, and reports it not stopped", async () => {
		const child = spawnGroup(`${STUBBORN_MEMBER} exit 0`)
		// A zombie leader still answers kill(pid, 0); wait for the real exit.
		await exited(child)

		const result = await killProcessGroup(child, "leaderless", true, 300)

		expect(result).toEqual({ escalated: false, stopped: false })
		expect(groupAlive(child.pid as number)).toBe(true)
	})
})
