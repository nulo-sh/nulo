/**
 * A JSON-RPC relay in front of one node, for specs that make an endpoint fail on cue: it forwards
 * each request unchanged unless a rule matches it, and counts what it received. It listens on a
 * loopback port claimed in the host registry and keeps that port across `kill` and `restore`, so a
 * killed endpoint comes back at the same URL.
 *
 * Browser-free: the sandbox suite drives it from Node, next to a server-entrypoint PXE.
 */
import type { IncomingMessage, Server, ServerResponse } from "node:http"
import { createServer } from "node:http"
import type { Socket } from "node:net"
import { listenClaimed } from "./egress-guard"

/** What a matching request gets instead of the upstream's answer. `kill` resets its connection and
 *  stops the relay listening until `restore`; `hold` parks the request until `release` forwards it. */
export type RelayFault =
	| { readonly kind: "reply"; readonly status: number; readonly body: string }
	| { readonly kind: "blackhole" }
	| { readonly kind: "delay"; readonly ms: number }
	| { readonly kind: "kill" }
	| { readonly kind: "hold" }

export interface RelayRule {
	readonly fault: RelayFault
	/** Bare method names (`getBlock`, not `aztec_getBlock`); a request matches when any of its
	 *  entries calls one, or every entry with `entries: "every"`. Every request matches when absent. */
	readonly methods?: readonly string[]
	readonly entries?: "any" | "every"
	/** A request matches only when its body contains this text, compared case-insensitively. */
	readonly carrying?: string
	/** How many matching requests the rule lets through to older rules and the upstream first. */
	readonly after?: number
	/** How many matching requests the rule takes before it retires; unlimited when absent. */
	readonly times?: number
}

/** A request as the relay received it: when (`Date.now()`), its place in the order every relay
 *  of this process received requests, and its body, lower-cased. */
export interface Received {
	readonly at: number
	readonly seq: number
	readonly body: string
}

/** Orders requests across relays where two can share a millisecond. */
let receivedSoFar = 0

export interface RelayRuleHandle {
	/** How many requests the rule has answered with its fault. */
	taken(): number
	/** The requests it took, in order. */
	took(): readonly Received[]
}

type RelayReply = Extract<RelayFault, { kind: "reply" }>

const errorBody = (code: number, message: string) => JSON.stringify({ jsonrpc: "2.0", id: null, error: { code, message } })

/** A received request's calls, each its method as sent and its params as JSON, lower-cased;
 *  empty for a body that is not JSON-RPC. */
export function callsOf(request: Received): { method: string; params: string }[] {
	try {
		const parsed = JSON.parse(request.body) as unknown
		const entries = (Array.isArray(parsed) ? parsed : [parsed]) as { method?: unknown; params?: unknown }[]
		return entries.map((e) => ({ method: String(e.method), params: JSON.stringify(e.params ?? []) }))
	} catch {
		return []
	}
}

/** How many requests carried a receipt read of `txHash`, a batch counted once. */
export const receiptReads = (relay: RpcRelay, txHash: string): number =>
	relay.received().filter((r) => callsOf(r).some((c) => c.method === "aztec_gettxreceipt" && c.params.includes(txHash.toLowerCase())))
		.length

/** How many submissions the relay received, a batch's entries counted one by one. */
export const sendTxCount = (relay: RpcRelay): number => relay.methods().filter((m) => m.endsWith("_sendTx")).length

/** The answers a failing endpoint gives, each classified by the node fetch as the kind it names. */
export const RELAY_REPLIES = {
	server: { kind: "reply", status: 500, body: "upstream exploded" },
	overloaded: { kind: "reply", status: 429, body: errorBody(429, "Too many requests") },
	/** A gateway's refusal: a 4xx JSON error with a code outside the JSON-RPC reserved range. */
	refused: { kind: "reply", status: 400, body: errorBody(35, "method is not available") },
	malformed: { kind: "reply", status: 200, body: "<html>not json</html>" },
} as const satisfies Record<string, RelayFault>

export interface RpcRelay {
	readonly url: string
	/** HTTP requests received, a faulted one included. */
	requests(): number
	/** Every JSON-RPC method received, as sent (`aztec_getBlock`), in order. */
	methods(): readonly string[]
	/** How many received bodies contain `text`, compared case-insensitively. */
	carried(text: string): number
	/** Every request received, in order. */
	received(): readonly Received[]
	/** Requests a `hold` parks whose client still waits for the answer. */
	held(): number
	/** Forwards every parked request whose client still waits, or gives each `answer` instead;
	 *  resolves once each is answered. */
	release(answer?: RelayReply): Promise<void>
	/** Adds a rule; the newest matching rule wins. */
	fail(rule: RelayRule): RelayRuleHandle
	/** Drops every rule; requests already held by a blackhole or a hold stay held. */
	clear(): void
	/** Answers a batch of more than `maxEntries` entries with `refusal` instead of forwarding it. */
	cap(maxEntries: number | undefined, refusal?: RelayFault): void
	/** Answers `getChainTips` and `getBlockNumber` with the upstream's values at this moment until `unfreeze`. */
	freeze(): Promise<void>
	unfreeze(): void
	/** Resets every connection and stops listening; the port stays claimed. */
	kill(): Promise<void>
	/** Listens again on the same port. */
	restore(): Promise<void>
	/** Kills, then releases the port. */
	close(): Promise<void>
}

interface Entry {
	readonly id: unknown
	readonly method: string
}

interface Parked {
	readonly body: string
	readonly entries: readonly Entry[] | undefined
	readonly res: ServerResponse
}

const FROZEN = new Set(["getChainTips", "getBlockNumber"])

/** The method's name without its namespace: `aztec_getBlock` → `getBlock`. */
const bare = (method: string) => method.slice(method.indexOf("_") + 1)

function entriesOf(body: string): Entry[] | undefined {
	try {
		const parsed = JSON.parse(body) as unknown
		const list = Array.isArray(parsed) ? parsed : [parsed]
		return list.map((e) => {
			const entry = (e ?? {}) as { id?: unknown; method?: unknown }
			return { id: entry.id, method: typeof entry.method === "string" ? entry.method : "<no-method>" }
		})
	} catch {
		return undefined
	}
}

/** `body` is lower-cased. */
function matches(rule: RelayRule, entries: readonly Entry[] | undefined, body: string): boolean {
	const names = rule.methods
	const calls = (e: Entry) => names?.includes(bare(e.method)) === true
	if (names && !(rule.entries === "every" ? entries?.length && entries.every(calls) : entries?.some(calls))) return false
	return rule.carrying === undefined || body.includes(rule.carrying.toLowerCase())
}

function reply(res: ServerResponse, answer: RelayReply): void {
	res.writeHead(answer.status, { "content-type": "application/json" }).end(answer.body)
}

async function readBody(req: IncomingMessage): Promise<string> {
	let body = ""
	for await (const chunk of req) body += String(chunk)
	return body
}

async function postUpstream(upstream: string, body: string): Promise<{ status: number; text: string }> {
	const res = await fetch(upstream, { method: "POST", headers: { "content-type": "application/json" }, body })
	return { status: res.status, text: await res.text() }
}

/** Replaces each frozen entry's result with the value captured at the freeze. */
function patchFrozen(text: string, entries: readonly Entry[], frozen: ReadonlyMap<string, unknown>): string {
	const byId = new Map(entries.map((e) => [JSON.stringify(e.id), bare(e.method)]))
	let parsed: unknown
	try {
		parsed = JSON.parse(text)
	} catch {
		return text
	}
	const patch = (reply: { id?: unknown; result?: unknown }) => {
		const method = byId.get(JSON.stringify(reply.id))
		if (method === undefined || !frozen.has(method) || !("result" in reply)) return reply
		return { ...reply, result: frozen.get(method) }
	}
	return JSON.stringify(Array.isArray(parsed) ? parsed.map(patch) : patch(parsed as { id?: unknown }))
}

export async function startRpcRelay(upstream: string, service = "rpc-relay"): Promise<RpcRelay> {
	let requests = 0
	const methods: string[] = []
	const received: Received[] = []
	const parked = new Set<Parked>()
	let rules: Array<RelayRule & { skip: number; left: number; took: Received[] }> = []
	let batchCap: { max: number; refusal: RelayFault } | undefined
	let frozen: Map<string, unknown> | undefined
	const sockets = new Set<Socket>()

	const take = (entries: readonly Entry[] | undefined, request: Received): RelayFault | undefined => {
		if (batchCap && entries && entries.length > batchCap.max) return batchCap.refusal
		for (let i = rules.length - 1; i >= 0; i--) {
			const rule = rules[i]
			if (!rule || rule.left <= 0 || !matches(rule, entries, request.body)) continue
			if (rule.skip > 0) {
				rule.skip--
				continue
			}
			rule.left--
			rule.took.push(request)
			return rule.fault
		}
		return undefined
	}

	const forward = async (body: string, entries: readonly Entry[] | undefined, res: ServerResponse) => {
		const reply = await postUpstream(upstream, body)
		const text = frozen && entries ? patchFrozen(reply.text, entries, frozen) : reply.text
		res.writeHead(reply.status, { "content-type": "application/json" }).end(text)
	}

	const handle = async (req: IncomingMessage, res: ServerResponse) => {
		const body = await readBody(req)
		requests++
		const request = { at: Date.now(), seq: ++receivedSoFar, body: body.toLowerCase() }
		received.push(request)
		const entries = entriesOf(body)
		for (const entry of entries ?? [{ id: null, method: "<unparsed>" }]) methods.push(entry.method)
		const fault = take(entries, request)
		if (fault?.kind === "blackhole") return
		if (fault?.kind === "hold") {
			const held: Parked = { body, entries, res }
			parked.add(held)
			res.once("close", () => parked.delete(held))
			return
		}
		if (fault?.kind === "kill") {
			req.socket.destroy()
			await relay.kill()
			return
		}
		if (fault?.kind === "reply") {
			reply(res, fault)
			return
		}
		if (fault?.kind === "delay") await new Promise((resolve) => setTimeout(resolve, fault.ms))
		await forward(body, entries, res)
	}

	const { server, port, release } = await listenClaimed<Server>(
		() =>
			createServer((req, res) => {
				handle(req, res).catch(() => res.destroy())
			}),
		service,
	)
	server.on("connection", (socket: Socket) => {
		sockets.add(socket)
		socket.once("close", () => sockets.delete(socket))
	})

	let closing: Promise<void> | undefined
	const relay: RpcRelay = {
		url: `http://127.0.0.1:${port}`,
		requests: () => requests,
		methods: () => [...methods],
		carried: (text) => received.filter((r) => r.body.includes(text.toLowerCase())).length,
		received: () => [...received],
		held: () => parked.size,
		release: async (answer) => {
			const waiting = [...parked]
			parked.clear()
			const settle = async (p: Parked) => (answer ? reply(p.res, answer) : forward(p.body, p.entries, p.res))
			await Promise.all(waiting.map((p) => settle(p).catch(() => p.res.destroy())))
		},
		fail: (rule) => {
			const added = { ...rule, skip: rule.after ?? 0, left: rule.times ?? Number.POSITIVE_INFINITY, took: [] }
			rules.push(added)
			return { taken: () => added.took.length, took: () => [...added.took] }
		},
		clear: () => {
			rules = []
		},
		cap: (max, refusal = RELAY_REPLIES.refused) => {
			batchCap = max === undefined ? undefined : { max, refusal }
		},
		freeze: async () => {
			const body = JSON.stringify([...FROZEN].map((method, id) => ({ jsonrpc: "2.0", id, method: `aztec_${method}`, params: [] })))
			const replies = JSON.parse((await postUpstream(upstream, body)).text) as Array<{ id: number; result: unknown }>
			frozen = new Map([...FROZEN].map((method, id) => [method, replies.find((r) => r.id === id)?.result]))
		},
		unfreeze: () => {
			frozen = undefined
		},
		kill: async () => {
			if (!server.listening) return
			const closed = new Promise<void>((resolve) => server.close(() => resolve()))
			for (const socket of sockets) socket.destroy()
			await closed
		},
		restore: async () => {
			if (server.listening) return
			await new Promise<void>((resolve, reject) => {
				server.once("error", reject)
				server.listen(port, "127.0.0.1", () => {
					server.off("error", reject)
					resolve()
				})
			})
		},
		close: () => {
			closing ??= relay.kill().finally(release)
			return closing
		},
	}
	return relay
}
