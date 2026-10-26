/**
 * Which processes belong to an agent session, read from `/proc`: every process that inherited the
 * session's directory in its environment (the runner, its forks, Firefox and its driver), and every
 * Chrome loading the session's own dist copy, which Chrome names on its command line since it
 * overwrites its environment. Nothing else is ever signalled: the session's directory and dist copy
 * are unique to its launch.
 */
import { readdirSync, readFileSync } from "node:fs"
import { type EnvironReader, readEnviron, readStartTime } from "../../owned-processes"

/** Set on the runner the launcher spawns and inherited by everything it starts. */
export const SESSION_ENV = "NULO_E2E_CHAOS_SESSION"

export type CmdlineReader = (pid: number) => string[] | undefined

export const readCmdline: CmdlineReader = (pid) => {
	try {
		return readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0").filter(Boolean)
	} catch {
		return undefined
	}
}

/** The process group `pid` leads or belongs to, read from `/proc/<pid>/stat`. */
export function groupOf(pid: number): number | undefined {
	try {
		const stat = readFileSync(`/proc/${pid}/stat`, "utf8")
		return Number(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[2])
	} catch {
		return undefined
	}
}

export interface Owned {
	pid: number
	how: "environ" | "cmdline"
}

/** Whether `pid` is the session's: its environment names `dir`, or its command line loads `ext`. */
export function ownedBy(
	pid: number,
	dir: string,
	ext: string,
	env: EnvironReader = readEnviron,
	cmd: CmdlineReader = readCmdline,
): Owned | undefined {
	const environ = env(pid)
	if (environ !== "gone" && environ !== "unreadable" && environ.get(SESSION_ENV) === dir) return { pid, how: "environ" }
	const args = cmd(pid)
	if (args?.some((a) => a === `--load-extension=${ext}` || a === `--disable-extensions-except=${ext}`)) return { pid, how: "cmdline" }
	return undefined
}

/** Every live process of the session, this process excepted. */
export function sessionProcesses(dir: string, ext: string, env: EnvironReader = readEnviron, cmd: CmdlineReader = readCmdline): Owned[] {
	let pids: number[]
	try {
		pids = readdirSync("/proc")
			.filter((name) => /^\d+$/.test(name))
			.map(Number)
	} catch {
		return []
	}
	return pids.filter((pid) => pid !== process.pid).flatMap((pid) => ownedBy(pid, dir, ext, env, cmd) ?? [])
}

/** Whether the process `pid` started at `start` still runs: a reissued pid has another start. */
export const stillTheSame = (pid: number | undefined, start: string | undefined): boolean =>
	pid !== undefined && start !== undefined && readStartTime(pid) === start

const groupAlive = (pgid: number): boolean => {
	try {
		process.kill(-pgid, 0)
		return true
	} catch {
		return false
	}
}

/** Signals one owned process after reading its ownership again: a whole Chrome leading its own group
 *  is signalled as that group, so its renderers go with it; a group the launcher itself shares is
 *  never signalled whole. */
export function signalOwned(o: Owned, dir: string, ext: string, signal: NodeJS.Signals): number | undefined {
	if (!ownedBy(o.pid, dir, ext)) return undefined
	const pgid = groupOf(o.pid)
	const leads = pgid === o.pid && pgid !== groupOf(process.pid)
	try {
		process.kill(leads ? -o.pid : o.pid, signal)
		return leads ? o.pid : undefined
	} catch {
		return undefined
	}
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const anyAlive = (dir: string, ext: string, groups: ReadonlySet<number>): boolean =>
	sessionProcesses(dir, ext).length > 0 || [...groups].some(groupAlive)

/** One round: `signal` to every process of the session and every group signalled before, then a
 *  wait of up to `graceMs` for all of them to go. */
async function sweepRound(dir: string, ext: string, signal: NodeJS.Signals, groups: Set<number>, graceMs: number): Promise<void> {
	for (const o of sessionProcesses(dir, ext)) {
		const g = signalOwned(o, dir, ext, signal)
		if (g !== undefined) groups.add(g)
	}
	if (signal === "SIGKILL") for (const g of groups) if (groupAlive(g)) process.kill(-g, "SIGKILL")
	const until = Date.now() + graceMs
	while (Date.now() < until && anyAlive(dir, ext, groups)) await sleep(100)
}

/** SIGTERM to every process of the session, then SIGKILL to what outlives `graceMs`; returns what
 *  is still running after both, and every group it signalled that still has a member. */
export async function sweepSession(dir: string, ext: string, graceMs = 5_000): Promise<{ left: Owned[]; groups: number[] }> {
	const groups = new Set<number>()
	for (const signal of ["SIGTERM", "SIGKILL"] as const) {
		if (!anyAlive(dir, ext, groups)) break
		await sweepRound(dir, ext, signal, groups, graceMs)
	}
	return { left: sessionProcesses(dir, ext), groups: [...groups].filter(groupAlive) }
}
