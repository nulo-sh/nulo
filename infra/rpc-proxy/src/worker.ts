// A reverse proxy holding the paid provider URLs, whose key is in the path. Each host is bound to
// one secret; nothing a caller sends chooses the upstream, and the secret leaves the Worker only as
// the destination of one fetch per request: never logged, echoed, or followed through a redirect.

import { BODY_CAP_BYTES, parseCalls, readCapped } from "./body"
import { originVerdict, PREFLIGHT } from "./cors"
import { type HeaderMap, refuse, SECURITY_HEADERS } from "./respond"

/** The Workers Rate Limiting binding. */
export interface RateLimit {
	limit(options: { key: string }): Promise<{ success: boolean }>
}

export interface Env {
	PROXY_OFF?: string
	DRPC_MAINNET_URL?: string
	DRPC_TESTNET_URL?: string
	IP_LIMITER: RateLimit
}

export type Fetch = (input: string, init: RequestInit) => Promise<Response>

type SecretName = "DRPC_MAINNET_URL" | "DRPC_TESTNET_URL"

export const UPSTREAMS: ReadonlyMap<string, SecretName> = new Map([
	["rpc.nulo.sh", "DRPC_MAINNET_URL"],
	["testnet.rpc.nulo.sh", "DRPC_TESTNET_URL"],
])

const SERVER_ERROR = -32000

function secretUrl(value: string | undefined): string | null {
	if (!value) return null
	try {
		return new URL(value).protocol === "https:" ? value : null
	} catch {
		return null
	}
}

/**
 * The upstream's answer with headers built fresh: its `content-type` and the `x-aztec-*` version
 * headers the client checks (exposed, or a browser hides them), and nothing else of its own.
 */
function answer(upstream: Response, cors: HeaderMap): Response {
	const headers: Record<string, string> = { ...SECURITY_HEADERS, ...cors }
	const contentType = upstream.headers.get("content-type")
	if (contentType !== null) headers["content-type"] = contentType
	const versions = [...upstream.headers].filter(([name]) => name.startsWith("x-aztec-"))
	for (const [name, value] of versions) headers[name] = value
	if (versions.length > 0) headers["access-control-expose-headers"] = versions.map(([name]) => name).join(", ")
	return new Response(upstream.body, { status: upstream.status, headers })
}

/** An IPv6 client counts by its /64, the block one host is given; IPv4 by its address. */
export function limiterKey(ip: string): string {
	if (!ip.includes(":") || ip.includes(".")) return ip
	const [head, tail] = ip.toLowerCase().split("::")
	const left = head ? head.split(":") : []
	const right = tail ? tail.split(":") : []
	const groups = tail === undefined ? left : [...left, ...Array(8 - left.length - right.length).fill("0"), ...right]
	return `${groups
		.slice(0, 4)
		.map((group) => group.replace(/^0+(?=.)/, ""))
		.join(":")}::/64`
}

async function admit(request: Request, env: Env, cors: HeaderMap): Promise<Response | null> {
	if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...SECURITY_HEADERS, ...cors, ...PREFLIGHT } })
	if (request.method !== "POST") return refuse(405, SERVER_ERROR, "method not allowed", cors, { allow: "POST" })
	const ip = request.headers.get("cf-connecting-ip")
	if (!ip) return refuse(400, SERVER_ERROR, "no client address", cors)
	if (!(await env.IP_LIMITER.limit({ key: limiterKey(ip) })).success) return refuse(429, SERVER_ERROR, "rate limited", cors)
	return null
}

// No retry and no timeout of its own: a resent `aztec_sendTx` is the client's decision, never the proxy's.
async function forward(up: Fetch, request: Request, env: Env, secretName: SecretName, cors: HeaderMap): Promise<Response> {
	const bytes = await readCapped(request.body, BODY_CAP_BYTES)
	if (bytes === "too-large") return refuse(413, SERVER_ERROR, "body too large", cors)
	if (bytes === "malformed") return refuse(400, -32700, "parse error", cors)
	const refusal = parseCalls(bytes)
	if (refusal) return refuse(400, refusal.code, refusal.message, cors)
	const secret = secretUrl(env[secretName])
	if (!secret) return refuse(503, SERVER_ERROR, "upstream not configured", cors)
	let upstream: Response
	try {
		upstream = await up(secret, { method: "POST", body: bytes, headers: { "content-type": "application/json" }, redirect: "manual" })
	} catch {
		return refuse(502, SERVER_ERROR, "upstream unreachable", cors)
	}
	// A redirect's target is unvetted, and its Location may quote the secret path.
	if (upstream.status >= 300 && upstream.status < 400) return refuse(502, SERVER_ERROR, "upstream redirected", cors)
	return answer(upstream, cors)
}

export function createHandler(up: Fetch): (request: Request, env: Env) => Promise<Response> {
	return async (request, env) => {
		const url = new URL(request.url)
		const secretName = UPSTREAMS.get(url.hostname)
		if (!secretName || url.pathname !== "/") return refuse(404, SERVER_ERROR, "not found", {})
		const cors = originVerdict(request.headers.get("origin"))
		if (cors === null) return refuse(403, SERVER_ERROR, "origin not allowed", {})
		// The kill switch: nothing is read, counted or called while it is on.
		if (env.PROXY_OFF === "1") return refuse(503, SERVER_ERROR, "proxy off", cors)
		try {
			return (await admit(request, env, cors)) ?? (await forward(up, request, env, secretName, cors))
		} catch {
			// Nothing is logged: an error's text could quote the upstream URL.
			return refuse(503, SERVER_ERROR, "proxy failure", cors)
		}
	}
}

export default { fetch: createHandler((input, init) => fetch(input, init)) }
