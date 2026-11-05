import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { Env, Fetch, RateLimit } from "../src/worker"

export const WRANGLER = JSON.parse(readFileSync(join(import.meta.dir, "../wrangler.jsonc"), "utf8").replace(/^\s*\/\/.*$/gm, ""))

// Markers no response and no log line may carry.
export const MAINNET_SECRET = "https://upstream.test/mainnet/MAINNET-TEST-KEY"
export const TESTNET_SECRET = "https://upstream.test/testnet/TESTNET-TEST-KEY"
export const IP = "203.0.113.77"

export const CHROME_ORIGIN = `chrome-extension://${"abcdefghijklmnop".repeat(2)}`
export const FIREFOX_ORIGIN = "moz-extension://4b5d07a1-1c2e-4f0e-9b7a-0123456789ab"

export type Recorded = { url: string; method: string; headers: [string, string][]; body: Uint8Array; redirect: RequestInit["redirect"] }

/** A limiter enforcing the limit wrangler.jsonc declares for its binding. */
export function limiter(name: string): RateLimit & { keys: string[] } {
	const { limit } = WRANGLER.ratelimits.find((r: { name: string }) => r.name === name).simple
	const counts = new Map<string, number>()
	const keys: string[] = []
	return {
		keys,
		async limit({ key }) {
			keys.push(key)
			const n = (counts.get(key) ?? 0) + 1
			counts.set(key, n)
			return { success: n <= limit }
		},
	}
}

export function makeEnv(overrides: Partial<Env> = {}): Env & { IP_LIMITER: ReturnType<typeof limiter> } {
	return {
		...WRANGLER.vars,
		DRPC_MAINNET_URL: MAINNET_SECRET,
		DRPC_TESTNET_URL: TESTNET_SECRET,
		IP_LIMITER: limiter("IP_LIMITER"),
		...overrides,
	}
}

export function fakeUpstream(answer: (request: Recorded) => Response | Promise<Response> = () => rpcResult()) {
	const requests: Recorded[] = []
	const fetch: Fetch = async (input, init) => {
		const body = init.body instanceof Uint8Array ? init.body : new Uint8Array(await new Response(init.body).arrayBuffer())
		const recorded = {
			url: input,
			method: init.method ?? "GET",
			headers: [...new Headers(init.headers).entries()],
			body,
			redirect: init.redirect,
		}
		requests.push(recorded)
		return answer(recorded)
	}
	return { fetch, requests }
}

export const rpcResult = (status = 200, headers: Record<string, string> = { "content-type": "application/json" }) =>
	new Response('[{"jsonrpc":"2.0","id":1,"result":{"nodeVersion":"6.0.0"}}]', { status, headers })

export const call = (method = "aztec_getNodeInfo", id = 1) => ({ jsonrpc: "2.0", id, method, params: [] })

export function post(
	body: RequestInit["body"],
	{
		host = "rpc.nulo.sh",
		path = "/",
		origin = CHROME_ORIGIN,
		headers = {},
	}: { host?: string; path?: string; origin?: string | null; headers?: Record<string, string> } = {},
): Request {
	return new Request(`https://${host}${path}`, {
		method: "POST",
		body,
		headers: { "content-type": "application/json", "cf-connecting-ip": IP, ...(origin === null ? {} : { origin }), ...headers },
	})
}

export const json = (value: unknown, options?: Parameters<typeof post>[1]) => post(JSON.stringify(value), options)
