import type { ChildProcess } from "node:child_process"

type StopSignal = "SIGTERM" | "SIGKILL"

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** A zombie member still counts until it is reaped. */
function isGroupAlive(pgid: number): boolean {
	try {
		process.kill(-pgid, 0)
		return true
	} catch (err) {
		return (err as NodeJS.ErrnoException).code === "EPERM"
	}
}

function isGone(child: ChildProcess, pgid: number): boolean {
	const leaderExited = child.exitCode !== null || child.signalCode !== null
	return leaderExited && !isGroupAlive(pgid)
}

async function waitUntilGone(child: ChildProcess, pgid: number, ms: number): Promise<boolean> {
	const deadline = Date.now() + ms
	while (!isGone(child, pgid)) {
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
 * Stops a child this run spawned `detached` (so it leads its own group) and still holds: SIGTERM to
 * the group, then SIGKILL to the group if any member outlives `graceMs`, the leader's exit alone not
 * being enough. While any member lives its group id cannot be reused, so the group signalled is the
 * one the run created; a pid read back from a lock carries no such proof and never comes here.
 */
export async function killProcessGroup(
	child: ChildProcess | null,
	label: string,
	weStarted: boolean,
	graceMs = 5_000,
): Promise<{ escalated: boolean }> {
	if (!child?.pid || !weStarted) return { escalated: false }
	const pgid = child.pid
	console.log(`[e2e-setup] Stopping ${label} (pid=${pgid})...`)
	signal(child, pgid, "SIGTERM")
	if (await waitUntilGone(child, pgid, graceMs)) return { escalated: false }
	console.warn(`[e2e-setup] ${label}'s process group outlived SIGTERM; sending SIGKILL`)
	signal(child, pgid, "SIGKILL")
	// The caller removes the run's data directory next; a member still dying could write to it.
	await waitUntilGone(child, pgid, 2_000)
	return { escalated: true }
}
