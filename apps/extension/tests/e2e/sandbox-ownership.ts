import type { ChildProcess } from "node:child_process"
import { lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import { E2E_DATA_ROOT, type OwnedState, SANDBOX_SERVICES, isPidAlive } from "./lockfile"
import {
	type EnvironReader,
	LAUNCH_ENV,
	type SweepOptions,
	type SweepStatus,
	deadRunIn,
	identityIsDead,
	orphanedLaunch,
	ownIdentity,
	readEnviron,
	selfLaunch,
	sweep,
	sweepOnce,
} from "./owned-processes"
import { killProcessGroup } from "./process-group"

/**
 * Teardown and orphan reaping for the sandbox services (anvil, the node, the playground), by the
 * launch marker each one is spawned with. A group signal reaches a group only while its leader
 * lives; the marker reaches every descendant, a leaderless group's included.
 */

const RUN_DIR_PREFIX = "nulo-aztec-"
const RUN_DIR_STAMP = ".nulo-launch"

/** A run dir under {@link E2E_DATA_ROOT}, named for this process so the dir sweep can tell a dead
 *  run's from a live one's. Not created: the node's start does that. */
export const plannedRunDir = (): string => path.join(E2E_DATA_ROOT, `${RUN_DIR_PREFIX}${process.pid}-${Date.now()}`)

/** Creates the run dir stamped with the node's marker; the node writes under `<dir>/data`, so the
 *  stamp sits outside anything the node writes or wipes. */
export function createRunDir(dir: string, marker: string): string {
	mkdirSync(dir, { recursive: true })
	writeFileSync(path.join(dir, RUN_DIR_STAMP), marker, "utf8")
	const data = path.join(dir, "data")
	mkdirSync(data, { recursive: true })
	return data
}

/** The canonical path to delete, or `undefined` when the lock has no right to it: a lock names a
 *  directory to remove recursively, so the claim is checked against the filesystem, not the
 *  string. Directly under the root, with the prefix, stamped with this marker. */
export function deletableRunDir(dir: string, marker: string | undefined): string | undefined {
	if (!marker) return undefined
	try {
		const real = realpathSync(dir)
		if (path.dirname(real) !== realpathSync(E2E_DATA_ROOT) || !path.basename(real).startsWith(RUN_DIR_PREFIX)) return undefined
		return readFileSync(path.join(real, RUN_DIR_STAMP), "utf8") === marker ? real : undefined
	} catch {
		return undefined
	}
}

const hasProc = (): boolean => {
	try {
		return lstatSync("/proc/self").isSymbolicLink()
	} catch {
		return false
	}
}

/**
 * Teardown of a service this run started: its group while the leader lives, then every process
 * carrying its marker. The status is the sweep's; on a host without `/proc` it is the group's.
 */
export async function stopService(
	child: ChildProcess | null,
	label: string,
	weStarted: boolean,
	marker: string | undefined,
	opts: SweepOptions = {},
): Promise<SweepStatus> {
	if (!weStarted) return "stopped"
	const group = await killProcessGroup(child, label, weStarted)
	const self = ownIdentity()
	if (!marker || !self || !hasProc()) return group.stopped ? "stopped" : "retained"
	const status = await sweep(selfLaunch(marker, self), opts)
	if (status !== "stopped")
		console.warn(`[e2e-setup] ${label}'s marked processes are ${status} after teardown; its lock and data dir stay`)
	return status
}

/**
 * The exit hook's stop, synchronous: SIGTERM to the group while its leader is unreaped (the leader
 * pins the group id), else SIGTERM to each process still carrying the marker. Whatever survives is
 * left to the next run's sweep.
 */
export function stopServiceOnExit(
	child: ChildProcess | null,
	weStarted: boolean,
	marker: string | undefined,
	read: EnvironReader = readEnviron,
): void {
	if (!weStarted) return
	if (child?.pid && child.exitCode === null && child.signalCode === null) {
		try {
			process.kill(-child.pid, "SIGTERM")
		} catch {
			// Already gone.
		}
		return
	}
	const self = ownIdentity()
	if (marker && self) sweepOnce(selfLaunch(marker, self), "SIGTERM", read)
}

export type ReapOutcome = { cleared: true } | { cleared: false; reason: string }

/**
 * Reap the sandbox a prior run in this worktree left behind, by its lock. Signals only processes
 * that carry a service's marker AND name an owner that is dead, and nothing at all while the lock's
 * own owner lives (a run in progress, or one that reused the sandbox). A lock written before
 * markers existed is never signalled. Deletes the run dir only once every service is stopped. The
 * caller clears the lock on `cleared`.
 */
export async function reapPriorRun(lock: OwnedState, opts: SweepOptions = {}): Promise<ReapOutcome> {
	if (!lock.markers || !lock.owner) return reapUnmarked(lock)
	if (!identityIsDead(lock.owner)) return { cleared: false, reason: `its owner ${lock.owner} is alive` }
	const statuses: string[] = []
	for (const service of SANDBOX_SERVICES) {
		const marker = lock.markers[service]
		if (!marker) continue
		const status = await sweep(orphanedLaunch(marker), opts)
		if (status !== "stopped") statuses.push(`${service} ${status}`)
	}
	if (statuses.length > 0) return { cleared: false, reason: `not every service stopped (${statuses.join(", ")})` }
	const dir = deletableRunDir(lock.aztecDataDir, lock.markers.aztec)
	if (dir) rmSync(dir, { recursive: true, force: true })
	return { cleared: true }
}

function reapUnmarked(lock: OwnedState): ReapOutcome {
	const live = SANDBOX_SERVICES.flatMap((service) => (isPidAlive(lock.pids[service]) ? [`${service} pid ${lock.pids[service]}`] : []))
	if (live.length === 0) return { cleared: true }
	return { cleared: false, reason: `it carries no markers and records live processes (${live.join(", ")}); check and stop them by hand` }
}

/** Every process of a dead agent run in `worktree` (forks, Chrome) not owned by a launch sweep. */
export function sweepDeadRuns(worktree: string, opts: SweepOptions = {}): Promise<SweepStatus> {
	return sweep(deadRunIn(worktree), opts)
}

interface ProcessTable {
	cmdlines: string[]
	launchMarkers: Set<string>
}

function readProcessTable(read: EnvironReader): ProcessTable | undefined {
	let pids: string[]
	try {
		pids = readdirSync("/proc").filter((name) => /^\d+$/.test(name))
	} catch {
		return undefined
	}
	const table: ProcessTable = { cmdlines: [], launchMarkers: new Set() }
	for (const pid of pids) {
		try {
			table.cmdlines.push(readFileSync(`/proc/${pid}/cmdline`, "utf8"))
		} catch {
			// Exited since it was listed.
		}
		const env = read(Number(pid))
		const marker = typeof env === "string" ? undefined : env.get(LAUNCH_ENV)
		if (marker) table.launchMarkers.add(marker)
	}
	return table
}

/** Whether any argument names `dir` or a path inside it, bare or as `--flag=<dir>`. */
function namesDir(cmdline: string, dir: string): boolean {
	return cmdline.split("\0").some((arg) => {
		const value = arg.slice(arg.indexOf("=") + 1)
		return value === dir || value.startsWith(`${dir}/`)
	})
}

/**
 * Remove `nulo-aztec-<pid>-<ts>` run dirs nothing uses any more: the pid in the name is dead, no
 * process's command line names the path (the node gets it, or its `data` subdir, as
 * `--data-directory`), and no live process carries the marker it is stamped with. An unlistable
 * `/proc` keeps every dir.
 */
export function sweepOrphanDataDirs(read: EnvironReader = readEnviron): string[] {
	let names: string[]
	try {
		names = readdirSync(E2E_DATA_ROOT)
	} catch {
		return []
	}
	const candidates = names.filter((name) => {
		const pid = name.match(/^nulo-aztec-(\d+)-\d+$/)?.[1]
		return pid !== undefined && !isPidAlive(Number(pid))
	})
	if (candidates.length === 0) return []
	const table = readProcessTable(read)
	if (!table) return []
	const removed: string[] = []
	for (const name of candidates) {
		const full = path.join(E2E_DATA_ROOT, name)
		if (!isPlainDir(full) || table.cmdlines.some((cmdline) => namesDir(cmdline, full))) continue
		const stamp = readStamp(full)
		if (stamp && table.launchMarkers.has(stamp)) continue
		rmSync(full, { recursive: true, force: true })
		removed.push(full)
	}
	return removed
}

function isPlainDir(p: string): boolean {
	try {
		return lstatSync(p).isDirectory()
	} catch {
		return false
	}
}

function readStamp(dir: string): string | undefined {
	try {
		return readFileSync(path.join(dir, RUN_DIR_STAMP), "utf8")
	} catch {
		return undefined
	}
}
