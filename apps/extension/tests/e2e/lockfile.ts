/**
 * Per-worktree ownership lockfile for the e2e setup.
 *
 * Two jobs:
 *  - **Orphan cleanup.** When a previous `bun run e2e:agent` run was killed
 *    abnormally (Ctrl-C, OOM, machine sleep), its anvil/aztec/playground
 *    children may still be alive on the previous run's ports. The lockfile
 *    records their launch markers so the next run can reap them.
 *  - **Stable-port reuse.** When the user runs `vitest` directly (no agent
 *    wrapper) with the same env vars across runs, setup reuses the prior
 *    sandbox if every check passes:
 *      • lock present
 *      • bakedLocalRpcUrl matches current BUILT_LOCAL_RPC_URL
 *      • PIDs alive
 *      • L1ContractAddresses on the candidate sandbox match what the lock
 *        recorded — proves we're talking to OUR sandbox, not a stranger
 *        that drifted onto the same port.
 *    `bun run e2e:agent` always allocates fresh ports, so it never hits
 *    the reuse path; orphan cleanup is the value there.
 */
import { randomBytes } from "node:crypto"
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync, existsSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { IDENTITY_SHAPE, MARKER_SHAPE, identityIsDead, ownIdentity } from "./owned-processes"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const E2E_STATE_DIR = path.resolve(__dirname, "../../.e2e-state")
/** The checkout this harness runs from: the worktree a run's registry rows and markers name. */
export const REPO_ROOT = path.resolve(__dirname, "../../../..")
const LOCK_PATH = path.join(E2E_STATE_DIR, "owned.json")
const RECONCILE_PATH = path.join(E2E_STATE_DIR, "reconcile.lock")

/**
 * Real-disk root for per-run aztec data dirs. Deliberately NOT tmpdir()/`/tmp` — that is
 * RAM-backed tmpfs, so a run killed before teardown orphans a process holding its multi-GB LMDB
 * store open as a deleted-but-open file, pinning that RAM until the holder dies (fills swap,
 * thrashes the box, breaks the agent's own tooling). Disk + the OS page cache gives RAM-speed hot
 * reads adaptively (evicts under pressure instead of OOMing), so it is not meaningfully slower —
 * and under many parallel agents it is faster, since tmpfs steals RAM from proving/Chrome. Override
 * with `NULO_E2E_DATA_ROOT` (e.g. a CI runner that wants a specific mount). Reaped by `e2e:reap`.
 */
export const E2E_DATA_ROOT = process.env.NULO_E2E_DATA_ROOT ?? path.join(homedir(), ".cache", "nulo-e2e")

export const SANDBOX_SERVICES = ["anvil", "aztec", "playground"] as const
export type SandboxService = (typeof SANDBOX_SERVICES)[number]

export interface OwnedPorts {
	anvil: number
	aztec: number
	aztecAdmin: number
	aztecP2P: number
	playground: number
}

export interface OwnedState {
	startedAt: string
	bakedLocalRpcUrl: string
	ports: OwnedPorts
	/** For health and log lines only: ownership is the markers, never these numbers. */
	pids: Partial<Record<SandboxService, number>>
	/** Each recorded pid's `/proc` start time, which tells the service from a later holder of its pid. */
	starts?: Partial<Record<SandboxService, string>>
	/** The node's run dir, stamped with its marker; the node writes under `<dir>/data`. A lock
	 *  written before markers existed names the data dir itself, unstamped. */
	aztecDataDir: string
	/** Each service's launch marker. Absent on a lock written before markers existed, which no
	 *  sweep ever signals. */
	markers?: Partial<Record<SandboxService, string>>
	/** `<pid>:<start time>` of the vitest process that holds the sandbox: the one that started it,
	 *  or the one that reused it last. No sweep touches the sandbox while it lives. */
	owner?: string
	/** Recorded post-deploy. Used as the identity assertion on reuse. */
	l1ContractAddresses?: Record<string, string>
	/** Address book emitted to .test-config.json. Persisted so the reuse
	 *  path can recreate that file (teardown deletes it). A lock from before `tokenClassId` lacks it. */
	deployedConfig?: {
		nodeUrl: string
		tokenAddress: string
		tokenClassId?: string
		sponsoredFpcAddress: string
		minterAddress: string
	}
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v)
const isPid = (v: unknown) => Number.isInteger(v) && (v as number) > 0
const isStringRecord = (v: unknown) => isObject(v) && Object.values(v).every((x) => typeof x === "string")

function hasValidServices(lock: Record<string, unknown>): boolean {
	const { pids, starts, markers } = lock
	if (!isObject(pids) || !Object.values(pids).every((pid) => pid === undefined || isPid(pid))) return false
	if (starts !== undefined && !(isObject(starts) && Object.values(starts).every((t) => typeof t === "string" && /^\d+$/.test(t))))
		return false
	if (markers === undefined) return true
	return (
		isObject(markers) &&
		Object.entries(markers).every(
			([k, m]) => SANDBOX_SERVICES.includes(k as SandboxService) && typeof m === "string" && MARKER_SHAPE.test(m),
		)
	)
}

/** The lock is a file any process on this host can write, and it names processes to stop and a
 *  directory to delete, so anything not shaped like one is treated as unreadable. */
export function isOwnedState(value: unknown): value is OwnedState {
	if (!isObject(value)) return false
	const { ports, owner, l1ContractAddresses, deployedConfig } = value
	if (typeof value.startedAt !== "string" || typeof value.bakedLocalRpcUrl !== "string" || typeof value.aztecDataDir !== "string")
		return false
	if (!isObject(ports) || !["anvil", "aztec", "aztecAdmin", "aztecP2P", "playground"].every((k) => isPid(ports[k]))) return false
	if (owner !== undefined && !(typeof owner === "string" && IDENTITY_SHAPE.test(owner))) return false
	if (l1ContractAddresses !== undefined && !isStringRecord(l1ContractAddresses)) return false
	if (deployedConfig !== undefined && !isStringRecord(deployedConfig)) return false
	return hasValidServices(value)
}

export function readLock(): OwnedState | undefined {
	try {
		if (!existsSync(LOCK_PATH)) return undefined
		const parsed: unknown = JSON.parse(readFileSync(LOCK_PATH, "utf-8"))
		return isOwnedState(parsed) ? parsed : undefined
	} catch {
		return undefined
	}
}

export function writeLock(state: OwnedState): void {
	mkdirSync(E2E_STATE_DIR, { recursive: true })
	const tmp = `${LOCK_PATH}.tmp`
	writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`, "utf-8")
	// Atomic rename so a crash mid-write never leaves a torn JSON file.
	renameSync(tmp, LOCK_PATH)
}

export function clearLock(): void {
	try {
		rmSync(LOCK_PATH, { force: true })
	} catch {
		// ignore
	}
}

/** `process.kill(pid, 0)` returns true if the pid is alive (and we have
 *  permission to signal it). Returns false otherwise. Cheap, no side effects. */
export function isPidAlive(pid: number | undefined): boolean {
	if (typeof pid !== "number" || pid <= 0) return false
	try {
		process.kill(pid, 0)
		return true
	} catch {
		return false
	}
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export interface ReconcileLockOptions {
	file?: string
	waitMs?: number
	pollMs?: number
}

/**
 * Runs `fn` holding this worktree's reconcile lock. Reading `owned.json`, acting on the owner it
 * names and writing a new owner into it must be one step: two setups, or a setup and `e2e:reap`,
 * that interleave it can each act on the same dead owner, one reaping the sandbox the other has
 * just adopted. A dead holder's lock is replaced; a live holder is waited for up to `waitMs`.
 */
export async function withReconcileLock<T>(fn: () => Promise<T>, opts: ReconcileLockOptions = {}): Promise<T> {
	const file = opts.file ?? RECONCILE_PATH
	const holder = `${ownIdentity() ?? process.pid} ${randomBytes(8).toString("hex")}`
	await acquireReconcileLock(file, holder, opts.waitMs ?? 120_000, opts.pollMs ?? 250)
	try {
		return await fn()
	} finally {
		if (readHolder(file) === holder) rmSync(file, { force: true })
	}
}

async function acquireReconcileLock(file: string, holder: string, waitMs: number, pollMs: number): Promise<void> {
	mkdirSync(path.dirname(file), { recursive: true })
	const deadline = Date.now() + waitMs
	for (;;) {
		try {
			writeFileSync(file, holder, { encoding: "utf8", flag: "wx" })
			return
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err
		}
		const current = readHolder(file)
		if (current === undefined) continue
		// Re-read right before the unlink: a holder that replaced the dead one meanwhile stays.
		if (holderIsDead(current) && readHolder(file) === current) {
			rmSync(file, { force: true })
			continue
		}
		if (Date.now() >= deadline)
			throw new Error(
				`[e2e-setup] another run in this worktree is reconciling its sandbox (${file} held by "${current}"); if none is, delete that file`,
			)
		await sleep(pollMs)
	}
}

function readHolder(file: string): string | undefined {
	try {
		return readFileSync(file, "utf8")
	} catch {
		return undefined
	}
}

/** A holder not yet fully written, or not shaped like one, is never dead. Without `/proc` the
 *  holder is a bare pid, judged by liveness. */
function holderIsDead(holder: string): boolean {
	const id = holder.match(/^(\S+) [0-9a-f]{16}$/)?.[1]
	if (!id) return false
	return IDENTITY_SHAPE.test(id) ? identityIsDead(id) : /^[1-9]\d*$/.test(id) && !isPidAlive(Number(id))
}
