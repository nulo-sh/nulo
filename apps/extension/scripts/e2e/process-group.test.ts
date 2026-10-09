// @vitest-environment node
import { type ChildProcess, spawn } from "node:child_process"
import { afterEach, describe, expect, test } from "vitest"
import { killProcessGroup } from "../../tests/e2e/process-group"

/** Groups a case left alive; a case that proves its group gone takes it off this list. */
const owned = new Set<number>()

function groupAlive(pgid: number): boolean {
	try {
		process.kill(-pgid, 0)
		return true
	} catch {
		return false
	}
}

/** Spawns `script` as its own group and resolves once its member printed `ready`, traps installed. */
async function spawnReadyGroup(script: string): Promise<ChildProcess> {
	const child = spawn("sh", ["-c", script], { detached: true, stdio: ["ignore", "pipe", "ignore"] })
	if (!child.pid) throw new Error("spawn failed")
	owned.add(child.pid)
	await new Promise<void>((resolve, reject) => {
		// The member holds stdout, so the pipe ends only once every member is gone; the leader may exit first.
		child.stdout?.on("data", (chunk: Buffer) => {
			if (chunk.toString().includes("ready")) resolve()
		})
		child.stdout?.once("end", () => reject(new Error("group ended before it was ready")))
	})
	return child
}

const exited = (child: ChildProcess) =>
	child.exitCode !== null || child.signalCode !== null ? Promise.resolve() : new Promise<void>((r) => child.once("exit", () => r()))

function expectGone(pgid: number): void {
	expect(groupAlive(pgid)).toBe(false)
	owned.delete(pgid)
}

afterEach(() => {
	for (const pgid of owned) {
		try {
			process.kill(-pgid, "SIGKILL")
		} catch {
			// already gone
		}
	}
	owned.clear()
})

describe.skipIf(process.platform === "win32")("killProcessGroup", () => {
	test("escalates when the leader exits cleanly on SIGTERM and a member ignores it", async () => {
		const child = await spawnReadyGroup('trap "exit 0" TERM; (trap "" TERM; echo ready; exec sleep 30) & wait')

		const result = await killProcessGroup(child, "stubborn-member", true, 300)

		expect(result).toEqual({ escalated: true, stopped: true })
		expectGone(child.pid as number)
	})

	test("(control) a group whose members all exit on SIGTERM ends with no escalation", async () => {
		const child = await spawnReadyGroup("(echo ready; exec sleep 30) & wait")

		const result = await killProcessGroup(child, "cooperative", true, 2_000)

		expect(result).toEqual({ escalated: false, stopped: true })
		expectGone(child.pid as number)
	})

	test("never signals a group whose leader exited before teardown, and reports it not stopped", async () => {
		// The member would die on SIGTERM, so its survival shows nothing was sent.
		const child = await spawnReadyGroup("(echo ready; exec sleep 30) & exit 0")
		await exited(child)

		const result = await killProcessGroup(child, "leaderless", true, 300)

		expect(result).toEqual({ escalated: false, stopped: false })
		expect(groupAlive(child.pid as number)).toBe(true)
	})
})
