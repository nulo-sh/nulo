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

async function spawnGroup(script: string): Promise<ChildProcess> {
	const child = spawn("sh", ["-c", script], { detached: true, stdio: "ignore" })
	if (!child.pid) throw new Error("spawn failed")
	spawned.push(child.pid)
	return child
}

const exited = (child: ChildProcess) =>
	child.exitCode !== null || child.signalCode !== null ? Promise.resolve() : new Promise<void>((r) => child.once("exit", () => r()))

afterEach(() => {
	for (const pgid of spawned.splice(0)) {
		try {
			process.kill(-pgid, "SIGKILL")
		} catch {
			// already gone
		}
	}
})

describe.skipIf(process.platform === "win32")("killProcessGroup", () => {
	test("escalates to SIGKILL when the leader has exited and a member ignores SIGTERM", async () => {
		const child = await spawnGroup('trap "" TERM; sleep 30 & exit 0')
		// A zombie leader still answers kill(pid, 0); wait for the real exit.
		await exited(child)
		expect(groupAlive(child.pid as number)).toBe(true)

		const result = await killProcessGroup(child, "trap-term", true, 300)

		expect(result).toEqual({ escalated: true })
		await vi.waitFor(() => expect(groupAlive(child.pid as number)).toBe(false), { timeout: 2_000 })
	})

	test("(control) a group whose members all exit on SIGTERM ends with no escalation", async () => {
		const child = await spawnGroup("sleep 30 & wait")
		await vi.waitFor(() => expect(groupAlive(child.pid as number)).toBe(true))

		const result = await killProcessGroup(child, "cooperative", true, 2_000)

		expect(result).toEqual({ escalated: false })
		expect(groupAlive(child.pid as number)).toBe(false)
	})
})
