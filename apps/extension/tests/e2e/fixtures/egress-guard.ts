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

/** Every attempt that neither the declared refusals nor the running browser's own hosts accept, as `host:port`. */
export function undeclared(attempts: readonly EgressAttempt[], browserOwnHosts: ReadonlyMap<string, string>): string[] {
	return attempts
		.filter(({ host }) => !DECLARED_REFUSALS.has(host) && !browserOwnHosts.has(host))
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

const CANARY_PROBE_BUDGET_MS = 5_000

/** Why a launch's egress record fails it, or undefined when it does not. */
export function egressFailure(
	{ attempts, overflowed, canaryConnections }: { attempts: readonly EgressAttempt[]; overflowed: boolean; canaryConnections: number },
	traffic: { browser: string; ownHosts: ReadonlyMap<string, string> },
): string | undefined {
	if (canaryConnections > 0) {
		return `${canaryConnections} connection(s) reached ${EGRESS_CANARY_HOST} directly: ${traffic.browser}'s proxy routing did not hold`
	}
	if (overflowed) return `more than ${MAX_DISTINCT} distinct hosts were tried; the record stopped counting new ones`
	const hosts = undeclared(attempts, traffic.ownHosts)
	if (hosts.length === 0) return undefined
	return [
		`${traffic.browser} tried ${hosts.length} host(s) outside the machine that no list declares: ${hosts.join(", ")}.`,
		"A host the wallet or a spec now tries: add it to DECLARED_REFUSALS with why (tests/e2e/fixtures/egress-guard.ts).",
		`A host the browser reaches on its own: add the exact name to its driver's ownHosts with why (tests/e2e/fixtures/browser/${traffic.browser}.ts).`,
	].join("\n")
}

/**
 * Closes the launch, then stops the guard and the canary, then judges what they saw. Stopping comes
 * before the snapshot so an unfinished request is classified; the listeners stop however the close
 * went, and a close that threw is reported beside an egress failure, never instead of it.
 */
export async function closeAfterEgressCheck(
	close: () => Promise<void>,
	{
		guard,
		canary,
		label,
		traffic,
	}: { guard: EgressGuard; canary: EgressCanary; label: string; traffic: Parameters<typeof egressFailure>[1] },
): Promise<void> {
	let closeError: unknown
	try {
		await close()
	} catch (err) {
		closeError = err
	} finally {
		await Promise.all([guard.stop(), canary.stop()])
	}
	const failure = egressFailure(
		{ attempts: guard.attempts(), overflowed: guard.overflowed(), canaryConnections: canary.connections() },
		traffic,
	)
	if (failure) {
		const also = closeError === undefined ? "" : `\nThe close before the check failed too: ${String(closeError)}`
		throw new Error(`egress guard: ${label}: ${failure}${also}`, { cause: closeError })
	}
	if (closeError !== undefined) throw closeError
}

export interface GuardedLaunchDeps<B, S, L extends { close(): Promise<void> }> {
	/** Names the launch in a failure: the test file, and the test when there is one. */
	label: string
	traffic: Parameters<typeof egressFailure>[1]
	launch(egress: { guardPort: number }): Promise<{ value: B; close(): Promise<void> }>
	settle(value: B): Promise<S>
	/** Fires a request for `url` from an extension page and returns once `recorded()` holds or the budget passes. */
	probeCanary(value: B, settled: S, url: string, recorded: () => boolean, budgetMs: number): Promise<void>
	/** Wraps the browser close in the launch's other close-time checks; the egress check runs after them. */
	wrapClose(closeBrowser: () => Promise<void>, value: B, settled: S): L
	startGuard?: () => Promise<EgressGuard>
	startCanary?: () => Promise<EgressCanary>
}

export interface GuardedLaunch<B, S, L> {
	value: B
	settled: S
	wrapped: L
	guard: EgressGuard
	canary: EgressCanary
	/** The first call closes and checks; a later one is the wrapped close alone. */
	close(): Promise<void>
}

/**
 * Owns the guard, the canary and the browser from start to stop: every path out of a failed launch
 * stops all three. Once settled, an extension page fires the canary, which must reach the guard and
 * never the canary itself, so a launch whose routing failed or fell back to direct never runs a test.
 */
export async function ownGuardedLaunch<B, S, L extends { close(): Promise<void> }>(
	deps: GuardedLaunchDeps<B, S, L>,
): Promise<GuardedLaunch<B, S, L>> {
	const guard = await (deps.startGuard ?? startEgressGuard)()
	let canary: EgressCanary | undefined
	let launched: { value: B; close(): Promise<void> } | undefined
	try {
		canary = await (deps.startCanary ?? startEgressCanary)()
		launched = await deps.launch({ guardPort: guard.port })
		const settled = await deps.settle(launched.value)
		const recorded = () => guard.attempts().some(({ host }) => host === EGRESS_CANARY_HOST)
		await deps.probeCanary(launched.value, settled, canaryUrl(canary.port), recorded, CANARY_PROBE_BUDGET_MS)
		if (canary.connections() > 0 || !recorded()) {
			const why = canary.connections() > 0 ? "went direct" : `never reached the guard within ${CANARY_PROBE_BUDGET_MS / 1000}s`
			throw new Error(`egress guard: ${deps.label}: the canary request ${why}, so this launch's routing is not proven`)
		}
		const wrapped = deps.wrapClose(launched.close, launched.value, settled)
		const checked = { guard, canary, label: deps.label, traffic: deps.traffic }
		let closed = false
		const close = () => {
			if (closed) return wrapped.close()
			closed = true
			return closeAfterEgressCheck(() => wrapped.close(), checked)
		}
		return { value: launched.value, settled, wrapped, guard, canary, close }
	} catch (err) {
		await launched?.close().catch(() => {})
		await Promise.all([guard.stop(), canary?.stop()])
		throw err
	}
}
