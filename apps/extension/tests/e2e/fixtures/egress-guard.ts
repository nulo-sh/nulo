/**
 * The smoke suite's egress guard: every HTTP, HTTPS and WebSocket request a guarded browser makes
 * for a host outside the machine reaches this loopback proxy, which refuses it and records the
 * host. A per-launch canary, reachable only on a direct path, proves the routing held.
 *
 * Built on `node:net` rather than `node:http`, so the unit test on Bun and the e2e run on Node take
 * one code path. The module never opens an outbound connection: it answers, and nothing else.
 */
import { randomBytes } from "node:crypto"
import { type Server, type Socket, createServer } from "node:net"
import { reservePort } from "../../../scripts/e2e/resolve-ports"
import { REPO_ROOT } from "../lockfile"
import { PortClaimConflict, claimPorts, registeredPorts, releasePorts } from "../port-registry"
import type { BrowserKind } from "./browser/selection"

export interface EgressAttempt {
	host: string
	port: number
	count: number
}

export interface EgressGuard {
	port: number
	/** One entry per canonical `host:port`; a path or query is never stored. */
	attempts(): readonly EgressAttempt[]
	/** More distinct `host:port` pairs arrived than the record keeps. */
	overflowed(): boolean
	/** Idempotent. Classifies any unfinished request, then ends every socket within 2 s. */
	stop(): Promise<void>
}

export interface EgressCanary {
	port: number
	connections(): number
	stop(): Promise<void>
}

/** Resolves to loopback only for a direct path: neither browser's proxy rule lists it as direct. */
export const EGRESS_CANARY_HOST = "egress-canary.test"
export const EGRESS_PROBE_HOST = "egress-probe.test"
/** The control spec's link-local literal: Chrome bypasses a proxy for these unless told not to. */
export const EGRESS_LINK_LOCAL_HOST = "169.254.0.1"
/** Recorded for a request that does not parse; no list accepts it. */
export const MALFORMED = "<malformed>"

/** Wallet and spec hosts the smoke build tries and the guard refuses, each with why it is tried. */
export const DECLARED_REFUSALS: ReadonlyMap<string, string> = new Map([
	["lb.drpc.live", "the default Testnet node: the background reads its status at popup start, the offscreen PXE on Home"],
	["api.coingecko.com", "the price fetch on profile create, unlock, popup open with an incomplete cache, and every 3 min"],
	[EGRESS_CANARY_HOST, "the per-launch canary, fired from an extension page"],
	[EGRESS_PROBE_HOST, "the control spec's background probe"],
	[EGRESS_LINK_LOCAL_HOST, "the control spec's link-local probe"],
])

/**
 * Hosts a browser reaches on its own, whatever the wallet does. Exact names, never a domain, so a
 * wallet dependency that calls a new host under a vendor's domain still fails the run.
 */
export const BROWSER_OWN_HOSTS: ReadonlyMap<string, { browser: BrowserKind; why: string }> = new Map([
	["accounts.google.com", { browser: "chrome", why: "account sign-in state" }],
	["android.clients.google.com", { browser: "chrome", why: "device check-in" }],
	["clients2.google.com", { browser: "chrome", why: "extension and component update checks" }],
	["update.googleapis.com", { browser: "chrome", why: "the component updater" }],
	["www.google.com", { browser: "chrome", why: "the default search provider's preconnect" }],
	["content-signature-2.cdn.mozilla.net", { browser: "firefox", why: "remote settings signature checks" }],
	["firefox.settings.services.mozilla.com", { browser: "firefox", why: "remote settings" }],
])

const HEAD_LIMIT = 8 * 1024
const HEAD_DEADLINE_MS = 5_000
const STOP_DEADLINE_MS = 2_000
const MAX_DISTINCT = 256
const CLAIM_ATTEMPTS = 3

const FORBIDDEN = "HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n"
const BAD_REQUEST = "HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n"

/**
 * The target a proxy request head names, canonicalised by WHATWG URL parsing (lowercase, IPv6 in
 * brackets, punycode), or undefined when the head does not parse as `CONNECT host:port` or an
 * absolute-form `http://` request.
 */
export function proxyTarget(head: string): { host: string; port: number } | undefined {
	const lineEnd = head.indexOf("\r\n")
	const match = /^([A-Z]+) (\S+) HTTP\/1\.[01]$/.exec(lineEnd === -1 ? head : head.slice(0, lineEnd))
	if (!match) return undefined
	const [, method, target] = match
	try {
		if (method === "CONNECT") {
			if (!/^[^/?#@\s]+:\d{1,5}$/.test(target)) return undefined
			const url = new URL(`https://${target}`)
			return url.hostname ? { host: url.hostname, port: Number(url.port || 443) } : undefined
		}
		if (!/^http:\/\//i.test(target)) return undefined
		const url = new URL(target)
		return url.hostname ? { host: url.hostname, port: Number(url.port || 80) } : undefined
	} catch {
		return undefined
	}
}

/** Every attempt no list accepts, as `host:port`. A browser's own host passes only for that browser. */
export function undeclared(attempts: readonly EgressAttempt[], browser: BrowserKind): string[] {
	return attempts
		.filter(({ host }) => !DECLARED_REFUSALS.has(host) && BROWSER_OWN_HOSTS.get(host)?.browser !== browser)
		.map(({ host, port }) => `${host}:${port}`)
		.sort()
}

/** Whether the run's global setup armed the guard. Only the smoke setup provides `true`. */
export const guardArmed = (provided: unknown): boolean => provided === true

export const canaryUrl = (port: number, scheme = "https"): string => `${scheme}://${EGRESS_CANARY_HOST}:${port}/`

function listen(server: Server, port: number): Promise<void> {
	return new Promise((resolve, reject) => {
		server.once("error", reject)
		server.listen(port, "127.0.0.1", () => {
			server.off("error", reject)
			resolve()
		})
	})
}

const closeServer = (server: Server): Promise<void> => new Promise((resolve) => server.close(() => resolve()))

/**
 * Binds a loopback listener on a port drawn as the harness draws its own, then claims it in the host
 * registry for this worker's life. Bound before the claim, so no other run can take the port between
 * the two; a claim conflict means another tool listed it meanwhile, and the draw starts over.
 */
export async function listenClaimed(
	make: () => Server,
	service: string,
): Promise<{ server: Server; port: number; release: () => Promise<void> }> {
	const runId = `nulo-e2e-${service}-${process.pid}-${randomBytes(4).toString("hex")}`
	for (let attempt = 1; ; attempt++) {
		const reservation = await reservePort(registeredPorts())
		await reservation.release()
		const server = make()
		try {
			await listen(server, reservation.port)
			await claimPorts({ runId, ports: { [service]: reservation.port }, ownerPid: process.pid, worktree: REPO_ROOT })
			return {
				server,
				port: reservation.port,
				release: async () => {
					await releasePorts(runId)
				},
			}
		} catch (err) {
			if (server.listening) await closeServer(server)
			const retriable = err instanceof PortClaimConflict || (err as NodeJS.ErrnoException | undefined)?.code === "EADDRINUSE"
			if (!retriable || attempt >= CLAIM_ATTEMPTS) throw err
		}
	}
}

/** Ends every socket, destroying what is still open at the deadline, then closes the server. */
async function shutDown(server: Server, sockets: Map<Socket, () => void>): Promise<void> {
	const closed = closeServer(server)
	for (const [socket, settle] of sockets) {
		settle()
		socket.end()
	}
	const deadline = setTimeout(() => {
		for (const socket of sockets.keys()) socket.destroy()
	}, STOP_DEADLINE_MS)
	await closed
	clearTimeout(deadline)
}

export async function startEgressGuard(): Promise<EgressGuard> {
	const record = new Map<string, EgressAttempt>()
	let overflow = false
	/** Each open socket and the call that classifies it if the guard stops first. */
	const sockets = new Map<Socket, () => void>()

	const note = (host: string, port: number) => {
		const entry = record.get(`${host}:${port}`)
		if (entry) entry.count++
		else if (record.size >= MAX_DISTINCT) overflow = true
		else record.set(`${host}:${port}`, { host, port, count: 1 })
	}

	const handle = (socket: Socket) => {
		let head = Buffer.alloc(0)
		let answered = false
		// Answers, then keeps reading until the peer closes: a reset over unread request bytes is
		// what makes a browser fail over to a direct connection.
		const answer = (reply?: string) => {
			if (answered) return
			answered = true
			clearTimeout(timer)
			if (reply) socket.end(reply)
			else socket.end()
		}
		const refuseMalformed = () => {
			if (!answered) note(MALFORMED, 0)
			answer(BAD_REQUEST)
		}
		// A connection that never sent a byte is a speculative preconnect: it records nothing.
		const settle = () => (head.length > 0 ? refuseMalformed() : answer())
		const timer = setTimeout(settle, HEAD_DEADLINE_MS)
		sockets.set(socket, settle)
		socket.on("error", () => {})
		socket.on("close", () => {
			clearTimeout(timer)
			sockets.delete(socket)
		})
		socket.on("end", settle)
		socket.on("data", (chunk: Buffer) => {
			if (answered) return
			head = Buffer.concat([head, chunk])
			const end = head.indexOf("\r\n\r\n")
			if (end === -1 || end + 4 > HEAD_LIMIT) {
				if (head.length > HEAD_LIMIT) refuseMalformed()
				return
			}
			const target = proxyTarget(head.subarray(0, end).toString("latin1"))
			if (!target) return refuseMalformed()
			note(target.host, target.port)
			answer(FORBIDDEN)
		})
	}

	const { server, port, release } = await listenClaimed(() => createServer(handle), "egress-guard")
	let stopping: Promise<void> | undefined
	return {
		port,
		attempts: () => [...record.values()].map((entry) => ({ ...entry })),
		overflowed: () => overflow,
		stop: () => {
			stopping ??= shutDown(server, sockets).finally(release)
			return stopping
		},
	}
}

/** Counts TCP connections: a TLS handshake that never completes still counts. */
export async function startEgressCanary(): Promise<EgressCanary> {
	let count = 0
	const sockets = new Map<Socket, () => void>()
	const handle = (socket: Socket) => {
		count++
		sockets.set(socket, () => {})
		socket.on("error", () => {})
		socket.on("close", () => sockets.delete(socket))
		socket.resume()
		socket.end()
	}
	const { server, port, release } = await listenClaimed(() => createServer(handle), "egress-canary")
	let stopping: Promise<void> | undefined
	return {
		port,
		connections: () => count,
		stop: () => {
			stopping ??= shutDown(server, sockets).finally(release)
			return stopping
		},
	}
}
