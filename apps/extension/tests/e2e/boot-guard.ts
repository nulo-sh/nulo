import type { ChildProcess } from "node:child_process"
import { readFileSync, readdirSync, readlinkSync } from "node:fs"
import { createServer } from "node:net"
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

function socketInodes(pid: number): string[] {
	try {
		return readdirSync(`/proc/${pid}/fd`).flatMap((fd) => {
			try {
				return readlinkSync(`/proc/${pid}/fd/${fd}`).match(/^socket:\[(\d+)\]$/)?.[1] ?? []
			} catch {
				return []
			}
		})
	} catch {
		return []
	}
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
	const deadline = Date.now() + timeoutMs
	for (;;) {
		const answer = await answerBefore(child, ready, deadline)
		if (answer === "exited" || hasExited(child))
			throw new Error(
				`${what}: the process this run started exited (code ${child.exitCode}, signal ${child.signalCode}) before it answered`,
			)
		if (answer === true) {
			if (ours() === false) throw new Error(`${what}: answered by a listener this run did not start`)
			return
		}
		if (answer === "timeout" || Date.now() >= deadline) throw new Error(`Timed out waiting for ${what} (${timeoutMs}ms)`)
		await new Promise((resolve) => setTimeout(resolve, pollMs))
	}
}
