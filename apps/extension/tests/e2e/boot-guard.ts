import type { ChildProcess } from "node:child_process"
import { readFileSync, readdirSync, readlinkSync, realpathSync } from "node:fs"
import { createServer } from "node:net"
import path from "node:path"
import { PollTimeoutError, pollUntil } from "./fixtures/poll"
import { type EnvironReader, ownedProcesses, readEnviron } from "./owned-processes"

/**
 * Boot rules for a run whose ports were claimed in the host registry moments before (an agent run,
 * which has a run id). A listener on one of them cannot be this run's, and nothing can prove what
 * it is, so it is refused rather than adopted. A bare run (no run id) still adopts the services a
 * developer started on its fixed ports.
 */

/** The run id `agent.sh` exports once `resolve-ports` has claimed the pack; absent on a bare run. */
export const claimedRunId = (): string | undefined => process.env.NULO_E2E_RUN_ID || undefined

/** Adopting an answering listener is a bare run's convenience only. */
export async function mayAdopt(runId: string | undefined, answers: () => Promise<boolean>): Promise<boolean> {
	return runId === undefined && (await answers())
}

/** Resolves when nothing listens on `port`, on any address. */
function isFree(port: number): Promise<boolean> {
	return new Promise((resolve) => {
		const srv = createServer()
		srv.unref()
		srv.once("error", () => resolve(false))
		// No host: the dual-stack wildcard, which a listener on any local address blocks.
		srv.listen(port, () => srv.close(() => resolve(true)))
	})
}

/** Throws naming the first service whose claimed port something already listens on. */
export async function assertPackFree(ports: Record<string, number>): Promise<void> {
	for (const [service, port] of Object.entries(ports)) {
		if (!(await isFree(port)))
			throw new Error(
				`[e2e-setup] ${service}'s claimed port ${port} is already in use; this run will not adopt a listener it did not start`,
			)
	}
}

const TCP_LISTEN = "0A"

/** Inodes of the sockets listening on `port`, IPv4 and IPv6, or `undefined` without `/proc/net`. */
function listeningInodes(port: number): Set<string> | undefined {
	const inodes = new Set<string>()
	let readable = false
	for (const table of ["/proc/net/tcp", "/proc/net/tcp6"]) {
		let text: string
		try {
			text = readFileSync(table, "utf8")
		} catch {
			continue
		}
		readable = true
		for (const line of text.split("\n").slice(1)) {
			// sl local_address rem_address st tx:rx tr:when retrnsmt uid timeout inode
			const [, local, , state, , , , , , inode] = line.trim().split(/\s+/)
			if (state === TCP_LISTEN && Number.parseInt(local?.split(":")[1] ?? "", 16) === port) inodes.add(inode)
		}
	}
	return readable ? inodes : undefined
}

/** What each of `pid`'s open fds points at; `unreadable` when `/proc` refuses a live process's
 *  list. */
function fdTargets(pid: number, read: EnvironReader): string[] | "gone" | "unreadable" {
	let fds: string[]
	try {
		fds = readdirSync(`/proc/${pid}/fd`)
	} catch {
		return read(pid) === "gone" ? "gone" : "unreadable"
	}
	return fds.flatMap((fd) => {
		try {
			return readlinkSync(`/proc/${pid}/fd/${fd}`)
		} catch {
			// Closed between the listing and the read.
			return []
		}
	})
}

function socketInodes(pid: number): string[] {
	const targets = fdTargets(pid, readEnviron)
	return typeof targets === "string" ? [] : targets.flatMap((target) => target.match(/^socket:\[(\d+)\]$/)?.[1] ?? [])
}

/**
 * Whether every socket listening on `port` is held by a process carrying `marker`: a probe that
 * answers proves only that something listens, and a stranger can bind the port between the pack's
 * bind test and the service's own bind. `undefined` where `/proc` cannot say.
 */
export function listenerIsOurs(port: number, marker: string, read: EnvironReader = readEnviron): boolean | undefined {
	const listening = listeningInodes(port)
	if (!listening) return undefined
	const ours = new Set(ownedProcesses(marker, read).flatMap(socketInodes))
	return listening.size > 0 && [...listening].every((inode) => ours.has(inode))
}

export interface NodeStores {
	inside: string[]
	outside: string[]
	/** Marked processes whose open files `/proc` would not list. */
	unreadable: number[]
}

const DELETED = " (deleted)"

/** The LMDB files among fd targets; `/proc` appends ` (deleted)` to an unlinked file's path. */
const lmdbFiles = (targets: string[]) =>
	targets.map((target) => (target.endsWith(DELETED) ? target.slice(0, -DELETED.length) : target)).filter((file) => file.endsWith(".mdb"))

/**
 * The LMDB files held open by every process carrying `marker` (the node and the children it
 * spawns), split by whether they lie under `dir`. Paths compare as real paths: `/proc` reports a
 * file's canonical one.
 */
export function nodeStores(dir: string, marker: string, read: EnvironReader = readEnviron): NodeStores {
	const root = `${realpathSync(dir)}${path.sep}`
	const files = new Set<string>()
	const unreadable: number[] = []
	for (const pid of ownedProcesses(marker, read)) {
		const targets = fdTargets(pid, read)
		if (targets === "unreadable") unreadable.push(pid)
		else if (targets !== "gone") for (const file of lmdbFiles(targets)) files.add(file)
	}
	const all = [...files]
	return { inside: all.filter((file) => file.startsWith(root)), outside: all.filter((file) => !file.startsWith(root)), unreadable }
}

const ADMIN_PROBE_TIMEOUT_MS = 10_000

/** `nodeAdmin_getConfig` at `url`; a JSON-RPC error answer carries no `result`. */
async function adminGetConfig(url: string, key?: string): Promise<{ status: number; result: unknown }> {
	let res: Response
	try {
		res = await fetch(url, {
			method: "POST",
			headers: { "content-type": "application/json", ...(key ? { "x-api-key": key } : {}) },
			body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "nodeAdmin_getConfig", params: [] }),
			signal: AbortSignal.timeout(ADMIN_PROBE_TIMEOUT_MS),
		})
	} catch (error) {
		throw new Error(`[e2e-setup] the admin RPC at ${url} did not answer (${error instanceof Error ? error.message : error})`, {
			cause: error,
		})
	}
	const body = (await res.json().catch(() => undefined)) as { result?: unknown } | undefined
	return { status: res.status, result: body?.result }
}

/** Throws unless the admin RPC at `url` refuses a call without `key` with a 401 and answers one carrying
 *  it. Errors name the URL, never the key. */
export async function assertAdminKeyRequired(url: string, key: string): Promise<void> {
	const keyless = await adminGetConfig(url)
	if (keyless.status !== 401)
		throw new Error(`[e2e-setup] the admin RPC at ${url} answered a call without the run's key (HTTP ${keyless.status})`)
	const keyed = await adminGetConfig(url, key)
	if (keyed.status !== 200 || typeof keyed.result !== "object" || keyed.result === null)
		throw new Error(`[e2e-setup] the admin RPC at ${url} did not answer a call with the run's key (HTTP ${keyed.status})`)
}

const hasExited = (child: ChildProcess) => child.exitCode !== null || child.signalCode !== null

/** The probe's answer, unless the child exits or the deadline passes first: a probe can hang (the
 *  node client sets no request timeout), and a hung probe must not outlast either. */
async function answerBefore(child: ChildProcess, ready: () => Promise<boolean>, deadline: number): Promise<boolean | "exited" | "timeout"> {
	let timer: NodeJS.Timeout | undefined
	let onExit: (() => void) | undefined
	try {
		return await Promise.race([
			ready().catch(() => false),
			new Promise<"exited">((resolve) => {
				onExit = () => resolve("exited")
				if (hasExited(child)) onExit()
				else child.once("exit", onExit)
			}),
			new Promise<"timeout">((resolve) => {
				timer = setTimeout(() => resolve("timeout"), Math.max(0, deadline - Date.now()))
			}),
		])
	} finally {
		clearTimeout(timer)
		if (onExit) child.off("exit", onExit)
	}
}

/**
 * Polls `ready` until it answers, failing as soon as `child` has exited: once this run's process is
 * gone, whatever answers the probe is a stranger that bound the port after it. `ours`, where it can
 * tell, must confirm the answering listener is this run's process.
 */
export async function waitWhileAlive(
	child: ChildProcess,
	ready: () => Promise<boolean>,
	what: string,
	timeoutMs: number,
	pollMs: number,
	ours: () => boolean | undefined = () => undefined,
): Promise<void> {
	const label = `Timed out waiting for ${what}`
	const deadline = Date.now() + timeoutMs
	const probe = async () => {
		const answer = await answerBefore(child, ready, deadline)
		if (answer === "exited" || hasExited(child))
			throw new Error(
				`${what}: the process this run started exited (code ${child.exitCode}, signal ${child.signalCode}) before it answered`,
			)
		if (answer === "timeout") throw new PollTimeoutError(label, timeoutMs, answer, "no answer")
		if (answer && ours() === false) throw new Error(`${what}: answered by a listener this run did not start`)
		return answer
	}
	await pollUntil(probe, (answer) => answer, { label, timeoutMs: deadline - Date.now(), intervalMs: pollMs })
}
