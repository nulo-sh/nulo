/**
 * Client for the host port registry, `~/.agents/ports.md`: the table every agent on this host reads
 * to see which ports another run holds, and the one place a run claims its ports before anything
 * listens on them.
 *
 * Other repositories' tooling writes the same file, so its format and its lock are a contract this
 * module matches rather than defines: rows `| port | service | owner (run) | worktree | pid-hint |
 * claimed |`, rewritten only while `<registry>.lock` exists, created with `open(..., "wx")`. Those
 * writers treat a lock older than 15 s as abandoned and delete it. This client never breaks a lock:
 * any break of a path lock can remove one taken after the breaker judged it stale, and nothing done
 * afterwards can keep a third writer out of the emptied path. It waits longer than their 15 s and
 * then fails closed.
 *
 * Only rows this repository writes (`nulo-e2e-*`) are ever parsed whole or dropped; every other line
 * is copied through byte for byte, and every port any line lists is treated as taken.
 */
import { randomBytes } from "node:crypto"
import {
	chmodSync,
	closeSync,
	existsSync,
	mkdirSync,
	openSync,
	readFileSync,
	realpathSync,
	renameSync,
	rmSync,
	statSync,
	unlinkSync,
	writeFileSync,
	writeSync,
} from "node:fs"
import { homedir } from "node:os"
import path from "node:path"

export const SERVICE_PREFIX = "nulo-e2e-"

const HEADER = [
	"# Ports registry — who is RUNNING what, where (atomic-locked)",
	"| port | service | owner (run) | worktree | pid-hint | claimed |",
	"|---|---|---|---|---|---|",
]

const DEFAULT_LOCK_WAIT_MS = 30_000
const DEFAULT_POLL_MS = 100
/** Linux's ceiling for `pid_max`; a larger pid-hint names no process. */
const PID_MAX = 4_194_304

export interface RegistryOptions {
	/** Defaults to `NULO_E2E_PORT_REGISTRY`, then `~/.agents/ports.md`. */
	file?: string
	lockWaitMs?: number
	pollMs?: number
}

export interface PortClaim {
	runId: string
	/** Service name (the row gets `nulo-e2e-<service>`) to port. */
	ports: Record<string, number>
	/** The process whose life the claim lasts: a row whose owner is dead is dropped by the next claim. */
	ownerPid: number
	worktree: string
}

export class PortClaimConflict extends Error {
	constructor(readonly ports: number[]) {
		super(`ports already listed in the host registry: ${ports.join(", ")}`)
	}
}

export class RegistryLocked extends Error {
	constructor(lockPath: string) {
		super(
			`${lockPath} stayed held: ${describeLock(lockPath)}. Its writer may still be running; if no registry writer is, remove the lock by hand`,
		)
	}
}

export function registryPath(file?: string): string {
	return file ?? process.env.NULO_E2E_PORT_REGISTRY ?? path.join(homedir(), ".agents", "ports.md")
}

/** The first cell as an integer, read the way the other writers read it, so a line they would
 *  count as a claim is one this client counts too. */
function firstCellPort(line: string): number | undefined {
	const port = Number.parseInt(line.split("|")[1]?.trim() ?? "", 10)
	return Number.isInteger(port) ? port : undefined
}

/** Every port the registry lists, any owner; empty when the file is absent. Read without the lock,
 *  so it is a hint for drawing ports, never the check a claim rests on. */
export function registeredPorts(file?: string): Set<number> {
	const ports = new Set<number>()
	let text: string
	try {
		text = readFileSync(registryPath(file), "utf8")
	} catch {
		return ports
	}
	for (const line of text.split("\n")) {
		const port = firstCellPort(line)
		if (port !== undefined) ports.add(port)
	}
	return ports
}

interface OwnRow {
	port: number
	runId: string
	worktree: string
	pidHint: string
}

/** A row this repository wrote, parsed whole; anything else is not ours to drop. */
function parseOwnRow(line: string): OwnRow | undefined {
	const parts = line.split("|")
	if (parts.length !== 8 || parts[0] !== "" || parts[7] !== "") return undefined
	const [port, service, runId, worktree, pidHint] = parts.slice(1, 6).map((cell) => cell.trim())
	if (!/^\d{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535) return undefined
	if (!service.startsWith(SERVICE_PREFIX)) return undefined
	return { port: Number(port), runId, worktree, pidHint }
}

/** True only when the kernel says no such process. A hint that is not a plain positive pid, or a
 *  process this user may not signal, keeps its row. This is never a signal: `kill(pid, 0)` only asks. */
function ownerIsDead(pidHint: string): boolean {
	if (!/^\d+$/.test(pidHint)) return false
	const pid = Number(pidHint)
	if (pid <= 0 || pid > PID_MAX) return false
	try {
		process.kill(pid, 0)
		return false
	} catch (err) {
		return (err as NodeJS.ErrnoException).code === "ESRCH"
	}
}

const isDeadOwnRow = (line: string): boolean => {
	const row = parseOwnRow(line)
	return row !== undefined && ownerIsDead(row.pidHint)
}

function describeLock(lockPath: string): string {
	try {
		const ageS = Math.round((Date.now() - statSync(lockPath).mtimeMs) / 1000)
		const content = readFileSync(lockPath, "utf8").trim()
		return `age ${ageS}s, ${content ? `holder "${content}"` : "no holder recorded (another tool's lock)"}`
	} catch {
		return "released while being read"
	}
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export interface RegistryLock {
	/** Unlinks the lock only while it still holds this holder's token, so a lock another writer took
	 *  after breaking ours is never removed. */
	release(): void
}

/** Takes `<registry>.lock`, waiting up to `lockWaitMs`; throws {@link RegistryLocked} after that. */
export async function acquireRegistryLock(opts: RegistryOptions = {}): Promise<RegistryLock> {
	const lockPath = `${registryPath(opts.file)}.lock`
	const content = `nulo-e2e ${process.pid} ${randomBytes(8).toString("hex")}\n`
	const deadline = Date.now() + (opts.lockWaitMs ?? DEFAULT_LOCK_WAIT_MS)
	for (;;) {
		let fd: number | undefined
		try {
			fd = openSync(lockPath, "wx", 0o600)
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err
		}
		if (fd !== undefined) {
			try {
				writeSync(fd, content)
			} finally {
				closeSync(fd)
			}
			return { release: () => releaseLockIfOurs(lockPath, content) }
		}
		if (Date.now() >= deadline) throw new RegistryLocked(lockPath)
		await sleep(opts.pollMs ?? DEFAULT_POLL_MS)
	}
}

function releaseLockIfOurs(lockPath: string, content: string): void {
	try {
		if (readFileSync(lockPath, "utf8") === content) unlinkSync(lockPath)
	} catch {
		// Already gone.
	}
}

/**
 * Rewrites the registry under its lock. `mutate` gets the file's lines (header included; the last
 * is `""` when the file ends in a newline) and returns the new lines, or `undefined` to write
 * nothing. The rewrite goes through a rename, so a reader never sees a torn file and a writer
 * killed mid-write leaves the old one whole.
 */
export async function withRegistry(
	mutate: (lines: string[] | undefined) => string[] | undefined,
	opts: RegistryOptions = {},
): Promise<void> {
	const file = registryPath(opts.file)
	// A fresh CI runner has no `~/.agents`; the lock cannot be created without it.
	mkdirSync(path.dirname(file), { recursive: true })
	const lock = await acquireRegistryLock(opts)
	try {
		const current = existsSync(file) ? readFileSync(file, "utf8") : undefined
		const next = mutate(current?.split("\n"))
		if (next === undefined) return
		const text = next.join("\n")
		if (text === current) return
		const target = current === undefined ? file : realpathSync(file)
		const tmp = `${target}.${SERVICE_PREFIX}${randomBytes(6).toString("hex")}.tmp`
		try {
			writeFileSync(tmp, text, "utf8")
			// The rename replaces the inode, so the file would take the umask's mode instead of its own.
			if (current !== undefined) chmodSync(tmp, statSync(target).mode & 0o777)
			renameSync(tmp, target)
		} finally {
			rmSync(tmp, { force: true })
		}
	} finally {
		lock.release()
	}
}

/** A table cell holds no `|` or newline; anything else would split or end the row. */
function assertCell(value: string, name: string): void {
	if (value.length === 0 || /[|\r\n]/.test(value))
		throw new Error(`registry cell ${name} must be non-empty and hold no '|' or newline: ${JSON.stringify(value)}`)
}

/** Appends rows before the trailing empty line a newline-terminated file splits into. */
function appendRows(lines: string[] | undefined, rows: string[]): string[] {
	const base = lines === undefined || lines.every((l) => l.trim() === "") ? [...HEADER, ""] : lines
	const end = base[base.length - 1] === "" ? base.length - 1 : base.length
	return [...base.slice(0, end), ...rows, ""]
}

/**
 * Under the lock: drops `nulo-e2e-*` rows whose owner is dead, refuses with
 * {@link PortClaimConflict} (writing nothing) when any line lists a wanted port, and otherwise
 * appends one row per service.
 */
export async function claimPorts(claim: PortClaim, opts: RegistryOptions = {}): Promise<void> {
	assertCell(claim.runId, "runId")
	assertCell(claim.worktree, "worktree")
	if (!Number.isInteger(claim.ownerPid) || claim.ownerPid <= 0) throw new Error(`invalid owner pid ${claim.ownerPid}`)
	const entries = Object.entries(claim.ports)
	for (const [service, port] of entries) {
		assertCell(service, "service")
		if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`invalid port ${port} for ${service}`)
	}
	if (new Set(entries.map(([, port]) => port)).size !== entries.length) throw new Error("a claim lists one port twice")

	const claimed = new Date().toISOString()
	const rows = entries.map(
		([service, port]) =>
			`| ${port} | ${SERVICE_PREFIX}${service} | ${claim.runId} | ${claim.worktree} | ${claim.ownerPid} | ${claimed} |`,
	)
	let conflicts: number[] = []
	await withRegistry((lines) => {
		const kept = lines?.filter((line) => !isDeadOwnRow(line))
		const listed = new Set((kept ?? []).map(firstCellPort))
		conflicts = entries.map(([, port]) => port).filter((port) => listed.has(port))
		return conflicts.length > 0 ? undefined : appendRows(kept, rows)
	}, opts)
	if (conflicts.length > 0) throw new PortClaimConflict(conflicts)
}

/** Drops the `nulo-e2e-*` rows `drop` accepts, under the lock. The count dropped, or `undefined`
 *  when the lock never came free or the file could not be rewritten; never throws, so a registry
 *  problem cannot change a finished run's exit status. */
async function dropOwnRows(drop: (row: OwnRow) => boolean, opts: RegistryOptions): Promise<number | undefined> {
	let dropped = 0
	try {
		await withRegistry((lines) => {
			if (lines === undefined) return undefined
			const kept = lines.filter((line) => {
				const row = parseOwnRow(line)
				return row === undefined || !drop(row)
			})
			dropped = lines.length - kept.length
			return kept
		}, opts)
		return dropped
	} catch (err) {
		console.warn(`[port-registry] ${err instanceof Error ? err.message : String(err)}`)
		return undefined
	}
}

/** Drops this run's rows. `false` when they could not be dropped; the next claim on the host drops
 *  them once the run's owner is dead. */
export async function releasePorts(runId: string, opts: RegistryOptions = {}): Promise<boolean> {
	return (await dropOwnRows((row) => row.runId === runId, opts)) !== undefined
}

/** Drops this worktree's rows whose owner is dead, and only those: a live run's rows, or another
 *  worktree's, are never released here. The count dropped, or `undefined` as {@link releasePorts}. */
export function releaseDeadRows(worktree: string, opts: RegistryOptions = {}): Promise<number | undefined> {
	return dropOwnRows((row) => row.worktree === worktree && ownerIsDead(row.pidHint), opts)
}
