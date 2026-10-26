/**
 * Which processes belong to an agent session, read from `/proc`: every process that inherited the
 * session's directory in its environment (the runner, its forks, Firefox and its driver), and every
 * Chrome process naming the session's own dist copy or its browser's own profile directory on its
 * command line, since Chrome overwrites its environment and only its first process loads the
 * extension. Nothing else is ever signalled: the directory, the dist copy and the profile are unique
 * to the session's launch.
 */
import { readdirSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
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

/** What marks a process as the session's. */
export interface Marks {
	dir: string
	ext: string
	/** The profile directory Puppeteer made for the session's Chrome, when the session recorded it. */
	userDataDir?: string
}

/** A profile directory Puppeteer makes for one launch; nothing else is taken as one. */
export const isLaunchProfile = (path: string, tmp: string = tmpdir()): boolean =>
	["chrome", "firefox"].some((b) => {
		const prefix = join(tmp, `puppeteer_dev_${b}_profile-`)
		return path.startsWith(prefix) && /^[A-Za-z0-9]{1,64}$/.test(path.slice(prefix.length))
	})

/** The profile directory a browser was launched with, from its argument list. */
export function profileDirOf(args: readonly string[], tmp: string = tmpdir()): string | undefined {
	for (const [i, arg] of args.entries()) {
		const dir = arg.startsWith("--user-data-dir=")
			? arg.slice("--user-data-dir=".length)
			: arg === "--profile"
				? args[i + 1]
				: undefined
		if (dir && isLaunchProfile(dir, tmp)) return dir
	}
	return undefined
}

export interface Owned {
	pid: number
	how: "environ" | "cmdline"
}

/** Whether `pid` is the session's: its environment names the directory, or its command line names
 *  the dist copy or the browser's profile exactly. */
export function ownedBy(pid: number, marks: Marks, env: EnvironReader = readEnviron, cmd: CmdlineReader = readCmdline): Owned | undefined {
	const environ = env(pid)
	if (environ !== "gone" && environ !== "unreadable" && environ.get(SESSION_ENV) === marks.dir) return { pid, how: "environ" }
	const named = new Set([`--load-extension=${marks.ext}`, `--disable-extensions-except=${marks.ext}`])
	if (marks.userDataDir) named.add(`--user-data-dir=${marks.userDataDir}`)
	if (cmd(pid)?.some((a) => named.has(a))) return { pid, how: "cmdline" }
	return undefined
}

/** Every live process of the session, this process excepted. */
export function sessionProcesses(marks: Marks, env: EnvironReader = readEnviron, cmd: CmdlineReader = readCmdline): Owned[] {
	let pids: number[]
	try {
		pids = readdirSync("/proc")
			.filter((name) => /^\d+$/.test(name))
			.map(Number)
	} catch {
		return []
	}
	return pids.filter((pid) => pid !== process.pid).flatMap((pid) => ownedBy(pid, marks, env, cmd) ?? [])
}

/** Whether the process `pid` started at `start` still runs: a reissued pid has another start. */
export const stillTheSame = (pid: number | undefined, start: string | undefined): boolean =>
	pid !== undefined && start !== undefined && readStartTime(pid) === start

/** Signals one owned process after reading its ownership again: one leading its own group is
 *  signalled as that group, so what it started goes with it, while it still leads it; a group the
 *  launcher itself shares is never signalled whole. A group whose leader is gone is never signalled,
 *  since its number may be another's by then: its members are found and signalled one by one. */
export function signalOwned(o: Owned, marks: Marks, signal: NodeJS.Signals): void {
	if (!ownedBy(o.pid, marks)) return
	const pgid = groupOf(o.pid)
	const leads = pgid === o.pid && pgid !== groupOf(process.pid)
	try {
		process.kill(leads ? -o.pid : o.pid, signal)
	} catch {
		// Gone between the read and the signal.
	}
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** SIGTERM to every process of the session, then SIGKILL to what outlives `graceMs`; returns what
 *  is still running after both, and the groups those processes are in. */
export async function sweepSession(marks: Marks, graceMs = 5_000): Promise<{ left: Owned[]; groups: number[] }> {
	for (const signal of ["SIGTERM", "SIGKILL"] as const) {
		if (!sessionProcesses(marks).length) break
		for (const o of sessionProcesses(marks)) signalOwned(o, marks, signal)
		const until = Date.now() + graceMs
		while (Date.now() < until && sessionProcesses(marks).length) await sleep(100)
	}
	const left = sessionProcesses(marks)
	return { left, groups: [...new Set(left.flatMap((o) => groupOf(o.pid) ?? []))] }
}
