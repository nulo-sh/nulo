import { randomUUID } from "node:crypto"
import { readFileSync, readdirSync } from "node:fs"

/**
 * Process ownership by environment marker, for every process an e2e run starts on a shared host.
 *
 * Numbers cannot carry ownership: a pid is reissued once its process is gone, a pgid once its
 * group is, and an orphan sits unattended for exactly the interval in which that happens. A random
 * marker in the spawn environment is inherited by every descendant, follows a child that leaves the
 * group, and is read back from `/proc/<pid>/environ`.
 *
 * A marked process also names its owner (`pid:start time` of the process that spawned it), and an
 * orphan sweep signals it only once that owner is dead. A record that names a live run's marker,
 * forged or stale, therefore stops nothing: those processes name their live owner. Markers are a
 * cooperative contract between runs of one user, not authentication; they keep one run's cleanup
 * off another's processes.
 */

/** Set per launch: a sandbox service or a Firefox launch. */
export const LAUNCH_ENV = "NULO_E2E_LAUNCH"
/** `<pid>:<start time>` of the process that spawned the launch. */
export const OWNER_ENV = "NULO_E2E_OWNER"
/** Set once per agent run by `agent.sh` and inherited by everything the run starts. */
export const RUN_ENV = "NULO_E2E_RUN"
export const RUN_OWNER_ENV = "NULO_E2E_RUN_OWNER"
export const WORKTREE_ENV = "NULO_E2E_WORKTREE"

export const MARKER_SHAPE = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/
export const IDENTITY_SHAPE = /^([1-9]\d*):(\d+)$/

export const newMarker = (): string => randomUUID()

/** `undefined` when the pid is gone: a dead process has no start time to compare. */
export function readStartTime(pid: number): string | undefined {
	try {
		const stat = readFileSync(`/proc/${pid}/stat`, "utf8")
		// The comm field is parenthesised and may itself contain spaces, so split after it.
		const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ")
		return fields[19]
	} catch {
		return undefined
	}
}

/**
 * `<pid>:<start time>` of this process. Sound as an identity because it is only ever compared,
 * never signalled: a reissued pid cannot share the tick its predecessor started on. `undefined` on
 * a host without `/proc`, where a launch names no owner and no sweep may signal it.
 */
export function ownIdentity(): string | undefined {
	const startTime = readStartTime(process.pid)
	return startTime ? `${process.pid}:${startTime}` : undefined
}

/** True only for a well-formed identity whose process is gone. A malformed or missing one is never
 *  dead: nothing may be signalled on the strength of an owner nobody can name. */
export function identityIsDead(identity: string | undefined): boolean {
	const match = identity?.match(IDENTITY_SHAPE)
	if (!match) return false
	return readStartTime(Number(match[1])) !== match[2]
}

/** The spawn environment of a launch this process owns. */
export function launchEnv(marker: string): Record<string, string> {
	const owner = ownIdentity()
	return { [LAUNCH_ENV]: marker, ...(owner ? { [OWNER_ENV]: owner } : {}) }
}

export type Environ = Map<string, string>
/** `gone` when the process exited; `unreadable` when it exists but its environ cannot be read
 *  (another user's, or a process that made itself non-dumpable). */
export type EnvironReader = (pid: number) => Environ | "gone" | "unreadable"

export const readEnviron: EnvironReader = (pid) => {
	let raw: string
	try {
		raw = readFileSync(`/proc/${pid}/environ`, "utf8")
	} catch (err) {
		const code = (err as NodeJS.ErrnoException).code
		return code === "ENOENT" || code === "ESRCH" ? "gone" : "unreadable"
	}
	const env: Environ = new Map()
	for (const entry of raw.split("\0")) {
		const eq = entry.indexOf("=")
		if (eq > 0) env.set(entry.slice(0, eq), entry.slice(eq + 1))
	}
	return env
}

/** `stop`: ours to signal. `keep`: marked, so it counts as alive, but not ours to signal (its owner
 *  lives). `ignore`: not part of this sweep. */
export type Verdict = "stop" | "keep" | "ignore"
export type Selector = (env: Environ) => Verdict

/** The pid of every listed process, or `undefined` when `/proc` cannot be listed. */
function listPids(): number[] | undefined {
	try {
		return readdirSync("/proc")
			.filter((name) => /^\d+$/.test(name))
			.map(Number)
	} catch {
		return undefined
	}
}

interface Scan {
	stop: number[]
	keep: number[]
	unreadable: Set<number>
}

function scan(select: Selector, read: EnvironReader): Scan | undefined {
	const pids = listPids()
	if (!pids) return undefined
	const found: Scan = { stop: [], keep: [], unreadable: new Set() }
	for (const pid of pids) {
		if (pid === process.pid) continue
		const env = read(pid)
		if (env === "gone") continue
		if (env === "unreadable") {
			found.unreadable.add(pid)
			continue
		}
		const verdict = select(env)
		if (verdict !== "ignore") found[verdict].push(pid)
	}
	return found
}

/** Every live process carrying `marker` as its launch marker. */
export function ownedProcesses(marker: string, read: EnvironReader = readEnviron): number[] {
	const found = scan((env) => (env.get(LAUNCH_ENV) === marker ? "stop" : "ignore"), read)
	return found?.stop ?? []
}

/**
 * `stopped`: two scans a poll apart found nothing the selector claims. `retained`: something it
 * claims outlived the sweep, or is not ours to signal. `unknown`: `/proc` could not be listed, or a
 * process the sweep had seen as claimed can no longer be read, so nothing proves it gone.
 */
export type SweepStatus = "stopped" | "retained" | "unknown"

export interface SweepOptions {
	graceMs?: number
	killGraceMs?: number
	read?: EnvironReader
	pollMs?: number
}

/** SIGTERM, then SIGKILL to whatever outlived the grace period. */
export async function sweep(select: Selector, opts: SweepOptions = {}): Promise<SweepStatus> {
	const seen = new Set<number>()
	const term = await sweepPhase(select, "SIGTERM", opts.graceMs ?? 5_000, seen, opts)
	if (term !== "retained") return term
	return sweepPhase(select, "SIGKILL", opts.killGraceMs ?? 2_000, seen, opts)
}

/** One poll: signal what is newly claimed, then judge what the scan saw. `clear` when nothing
 *  claimed is live and nothing seen has become unreadable. */
function poll(
	select: Selector,
	signal: NodeJS.Signals,
	read: EnvironReader,
	seen: Set<number>,
	signalled: Set<number>,
): SweepStatus | { clear: boolean; doubt: boolean } {
	const found = scan(select, read)
	if (!found) return "unknown"
	for (const pid of [...found.stop, ...found.keep]) seen.add(pid)
	for (const pid of found.stop) if (!signalled.has(pid) && signalIfStill(pid, select, signal, read)) signalled.add(pid)
	// Nothing left to signal and something that is not ours to: waiting changes nothing.
	if (found.stop.length === 0 && found.keep.length > 0) return "retained"
	const doubt = [...seen].some((pid) => found.unreadable.has(pid))
	return { clear: found.stop.length === 0 && !doubt, doubt }
}

/**
 * Signals each claimed process once, rescanning until two scans a poll apart find none. A process
 * inside execve reads an empty environ until the kernel has set up its new image, so it is
 * signalled when a later scan finds it. A killed process stays in `/proc` until it is reaped, so
 * SIGKILL is waited out as well.
 */
async function sweepPhase(
	select: Selector,
	signal: NodeJS.Signals,
	timeoutMs: number,
	seen: Set<number>,
	opts: SweepOptions,
): Promise<SweepStatus> {
	const read = opts.read ?? readEnviron
	const deadline = Date.now() + timeoutMs
	const signalled = new Set<number>()
	let clearScans = 0
	for (;;) {
		const result = poll(select, signal, read, seen, signalled)
		if (typeof result === "string") return result
		clearScans = result.clear ? clearScans + 1 : 0
		if (clearScans === 2) return "stopped"
		if (Date.now() >= deadline) return result.doubt ? "unknown" : "retained"
		await new Promise((resolve) => setTimeout(resolve, opts.pollMs ?? 100))
	}
}

/**
 * The same sweep without waiting, for an exit hook that cannot await: SIGTERM to each claimed
 * process once. Whatever survives is left for the next run's sweep.
 */
export function sweepOnce(select: Selector, signal: NodeJS.Signals = "SIGTERM", read: EnvironReader = readEnviron): void {
	for (const pid of scan(select, read)?.stop ?? []) signalIfStill(pid, select, signal, read)
}

/** Whether the signal was sent. A whole `/proc` scan separates finding a pid from signalling it,
 *  long enough for it to exit and be reissued, so the environ is read again first: one read between
 *  the check and the signal is as narrow as it gets without a pidfd, which the runtime lacks. */
function signalIfStill(pid: number, select: Selector, signal: NodeJS.Signals, read: EnvironReader): boolean {
	const env = read(pid)
	if (env === "gone" || env === "unreadable" || select(env) !== "stop") return false
	try {
		process.kill(pid, signal)
		return true
	} catch {
		// Gone since the re-check, or not ours to signal: the next scan decides.
		return false
	}
}

/** A launch's processes, signalled only when they name this process as their owner: teardown of
 *  a launch this run started. */
export const selfLaunch =
	(marker: string, self = ownIdentity()): Selector =>
	(env) => {
		if (env.get(LAUNCH_ENV) !== marker) return "ignore"
		return self !== undefined && env.get(OWNER_ENV) === self ? "stop" : "keep"
	}

/** A launch's processes, signalled only once the owner each one names is dead: the sweep of a
 *  record left by a run that may or may not still be alive. */
export const orphanedLaunch =
	(marker: string): Selector =>
	(env) => {
		if (env.get(LAUNCH_ENV) !== marker) return "ignore"
		return identityIsDead(env.get(OWNER_ENV)) ? "stop" : "keep"
	}

/**
 * Processes of a dead agent run in `worktree`: forks, Chrome, anything that inherited the run's
 * marker. A launch-marked process is left to its own sweep, which honours its record's owner (a
 * reused sandbox outlives the run that started it). A live run's processes, this run's included,
 * are no concern of this sweep.
 */
export const deadRunIn =
	(worktree: string): Selector =>
	(env) => {
		if (env.get(WORKTREE_ENV) !== worktree || !MARKER_SHAPE.test(env.get(RUN_ENV) ?? "")) return "ignore"
		if (env.has(LAUNCH_ENV)) return "ignore"
		return identityIsDead(env.get(RUN_OWNER_ENV)) ? "stop" : "ignore"
	}
