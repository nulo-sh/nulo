import type { ChildProcess } from "node:child_process"

type StopSignal = "SIGTERM" | "SIGKILL"

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const hasExited = (child: ChildProcess) => child.exitCode !== null || child.signalCode !== null

/** A zombie member still counts until it is reaped. */
function isGroupAlive(pgid: number): boolean {
	try {
		process.kill(-pgid, 0)
		return true
	} catch (err) {
		return (err as NodeJS.ErrnoException).code === "EPERM"
	}
}

async function waitUntilGone(child: ChildProcess, pgid: number, ms: number): Promise<boolean> {
	const deadline = Date.now() + ms
	while (!hasExited(child) || isGroupAlive(pgid)) {
		if (Date.now() >= deadline) return false
		await sleep(100)
	}
	return true
}

function signal(child: ChildProcess, pgid: number, sig: StopSignal): void {
	try {
		process.kill(-pgid, sig)
	} catch {
		try {
			child.kill(sig)
		} catch {
			// ignore
		}
	}
}

/**
 * Stops a child this run spawned `detached`, so it leads its own group: SIGTERM to the group, then
 * SIGKILL if any member outlives `graceMs`. Only a group whose leader was alive when teardown began
 * is escalated: its id cannot be reused while any member lives, whereas a group whose leader had
 * already exited may have emptied and its id passed to another run's group, so it gets SIGTERM
 * only. `stopped` is false while any member may still run.
 */
export async function killProcessGroup(
	child: ChildProcess | null,
	label: string,
	weStarted: boolean,
	graceMs = 5_000,
): Promise<{ escalated: boolean; stopped: boolean }> {
	if (!child?.pid || !weStarted) return { escalated: false, stopped: true }
	const pgid = child.pid
	const leaderAliveOnEntry = !hasExited(child)
	console.log(`[e2e-setup] Stopping ${label} (pid=${pgid})...`)
	signal(child, pgid, "SIGTERM")
	if (await waitUntilGone(child, pgid, graceMs)) return { escalated: false, stopped: true }
	if (!leaderAliveOnEntry) {
		console.warn(`[e2e-setup] ${label}'s leader exited before teardown, so its group is not escalated`)
		return { escalated: false, stopped: false }
	}
	console.warn(`[e2e-setup] ${label}'s process group outlived SIGTERM; sending SIGKILL`)
	signal(child, pgid, "SIGKILL")
	return { escalated: true, stopped: await waitUntilGone(child, pgid, 2_000) }
}
