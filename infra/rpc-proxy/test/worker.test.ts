import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"
import { BODY_CAP_BYTES, MAX_CALLS } from "../src/body"
import { createHandler, type Env, type Fetch } from "../src/worker"
import {
	CHROME_ORIGIN,
	call,
	FIREFOX_ORIGIN,
	fakeUpstream,
	IP,
	json,
	MAINNET_SECRET,
	makeEnv,
	post,
	rpcResult,
	TESTNET_SECRET,
	WRANGLER,
} from "./fakes"

const logged: unknown[][] = []
let restore: (() => void)[] = []

beforeEach(() => {
	logged.length = 0
	restore = (["log", "info", "warn", "error", "debug", "trace"] as const).map((method) => {
		const spy = spyOn(console, method).mockImplementation((...args: unknown[]) => {
			logged.push(args)
		})
		return () => spy.mockRestore()
	})
})

// The Worker logs nothing: any line could carry an upstream URL, and with it a key.
afterEach(() => {
	for (const undo of restore) undo()
	expect(logged).toEqual([])
})

// Owned by the test, not read from the source: nothing in front of the Worker adds them.
const EXPECTED_HEADERS = {
	"cache-control": "no-store",
	"content-security-policy": "default-src 'none'; frame-ancestors 'none'",
	"cross-origin-resource-policy": "same-origin",
	"permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=(), browsing-topics=()",
	"referrer-policy": "no-referrer",
	"strict-transport-security": "max-age=63072000; includeSubDomains; preload",
	"x-content-type-options": "nosniff",
	"x-frame-options": "DENY",
}

type Answer = { status: number; headers: Headers; text: string }

/** Runs the handler; every answer, whatever its branch, carries the Worker's headers and no key. */
async function run(request: Request, env: Env, upstream: Fetch = fakeUpstream().fetch): Promise<Answer> {
	const response = await createHandler(upstream)(request, env)
	const text = await response.text()
	for (const [name, value] of Object.entries(EXPECTED_HEADERS)) expect(response.headers.get(name)).toBe(value)
	const everything = `${[...response.headers].join("\n")}\n${text}`
	for (const marker of ["TEST-KEY", "upstream.test"]) expect(everything).not.toContain(marker)
	return { status: response.status, headers: response.headers, text }
}

/** A local refusal: JSON-RPC-shaped, so the client reads it as JSON and never retries a 4xx. */
function expectRefusal(answer: Answer, status: number, code = -32000) {
	expect(answer.status).toBe(status)
	expect(answer.headers.get("content-type")).toBe("application/json")
	const body = JSON.parse(answer.text)
	expect(body).toEqual({ jsonrpc: "2.0", id: null, error: { code, message: expect.any(String) } })
}

function expectCors(answer: Answer, origin: string | null) {
	expect(answer.headers.get("access-control-allow-origin")).toBe(origin)
	expect(answer.headers.get("vary")).toBe(origin === null ? null : "Origin")
}

const BATCH = [call("aztec_getNodeInfo", 1), call("aztec_getBlockNumber", 2)]

describe("routing", () => {
	test.each([
		["rpc.nulo.sh", MAINNET_SECRET],
		["testnet.rpc.nulo.sh", TESTNET_SECRET],
	])("%s forwards to its own secret URL", async (host, secret) => {
		const upstream = fakeUpstream()
		expect((await run(json(BATCH, { host }), makeEnv(), upstream.fetch)).status).toBe(200)
		expect(upstream.requests.map((r) => r.url)).toEqual([secret])
	})

	test.each([
		["an unknown host", { host: "evil.nulo.sh" }],
		["the bare zone", { host: "nulo.sh" }],
		["a path other than /", { path: "/v1" }],
		["a path naming the other network", { path: "/testnet" }],
	])("%s answers 404 without CORS and calls nothing", async (_, options) => {
		const env = makeEnv()
		const upstream = fakeUpstream()
		const answer = await run(json(BATCH, options), env, upstream.fetch)
		expectRefusal(answer, 404)
		expectCors(answer, null)
		expect(upstream.requests).toEqual([])
		expect(env.IP_LIMITER.keys).toEqual([])
	})

	test("no header and no query of the caller's picks the upstream", async () => {
		const upstream = fakeUpstream()
		const headers = { host: "testnet.rpc.nulo.sh", "x-forwarded-host": "testnet.rpc.nulo.sh", "x-upstream": "https://evil.example" }
		const request = json(BATCH, { path: "/?upstream=https://evil.example&network=testnet", headers })
		expect((await run(request, makeEnv(), upstream.fetch)).status).toBe(200)
		expect(upstream.requests.map((r) => r.url)).toEqual([MAINNET_SECRET])
	})
})

describe("forwarding", () => {
	test("forwards the bytes unchanged with only a fresh content-type, and follows no redirect", async () => {
		const upstream = fakeUpstream()
		const bytes = new TextEncoder().encode(' [ {"jsonrpc":"2.0","id":7,"method":"aztec_getTxReceipt","params":["0x0abc","é"]} ] ')
		const request = post(bytes, {
			headers: {
				cookie: "session=1",
				"user-agent": "Mozilla/5.0 probe",
				"x-forwarded-for": IP,
				"x-real-ip": IP,
				authorization: "Bearer caller",
				"x-aztec-rollupVersion": "1",
			},
		})
		expect((await run(request, makeEnv(), upstream.fetch)).status).toBe(200)
		const [sent] = upstream.requests
		expect(sent.method).toBe("POST")
		expect(sent.body).toEqual(bytes)
		expect(sent.headers).toEqual([["content-type", "application/json"]])
		expect(sent.redirect).toBe("manual")
	})

	test.each([
		["an upstream 500", call("aztec_getNodeInfo"), 500],
		["aztec_sendTx", call("aztec_sendTx"), 200],
	])("makes exactly one upstream call on %s and passes its status and body through", async (_, entry, status) => {
		const upstream = fakeUpstream(() => rpcResult(status))
		const answer = await run(json([entry]), makeEnv(), upstream.fetch)
		expect(answer.status).toBe(status)
		expect(answer.text).toBe(await rpcResult().text())
		expect(upstream.requests).toHaveLength(1)
	})

	test("keeps the upstream's content-type and x-aztec-* headers, exposes them, and drops the rest", async () => {
		const upstream = fakeUpstream(() =>
			rpcResult(200, {
				"content-type": "application/json; charset=utf-8",
				"x-aztec-rollupVersion": "4",
				"x-aztec-packageVersion": "6.0.0",
				"set-cookie": "provider=1",
				"cache-control": "public, max-age=60",
				"access-control-allow-origin": "*",
				location: MAINNET_SECRET,
				server: "provider",
			}),
		)
		const answer = await run(json(BATCH), makeEnv(), upstream.fetch)
		expect(answer.headers.get("content-type")).toBe("application/json; charset=utf-8")
		expect(answer.headers.get("x-aztec-rollupversion")).toBe("4")
		expect(answer.headers.get("x-aztec-packageversion")).toBe("6.0.0")
		expect(answer.headers.get("access-control-expose-headers")?.split(", ").sort()).toEqual([
			"x-aztec-packageversion",
			"x-aztec-rollupversion",
		])
		for (const dropped of ["set-cookie", "server", "location"]) expect(answer.headers.get(dropped)).toBeNull()
		expectCors(answer, CHROME_ORIGIN)
	})

	test("a thrown fetch and a redirect each answer 502, and the redirect's target never reaches the caller", async () => {
		const thrown = await run(json(BATCH), makeEnv(), async () => {
			throw new TypeError(`fetch failed: ${MAINNET_SECRET}`)
		})
		expectRefusal(thrown, 502)
		const redirect = fakeUpstream(() => new Response(null, { status: 307, headers: { location: MAINNET_SECRET } }))
		expectRefusal(await run(json(BATCH), makeEnv(), redirect.fetch), 502)
		expect(redirect.requests).toHaveLength(1)
	})

	test.each([
		["unset", { DRPC_MAINNET_URL: undefined }],
		["not https", { DRPC_MAINNET_URL: "http://upstream.test/mainnet/MAINNET-TEST-KEY" }],
		["not a URL", { DRPC_MAINNET_URL: "MAINNET-TEST-KEY" }],
	])("a host whose secret is %s answers 503 and calls nothing", async (_, overrides) => {
		const upstream = fakeUpstream()
		expectRefusal(await run(json(BATCH), makeEnv(overrides), upstream.fetch), 503)
		expect(upstream.requests).toEqual([])
	})
})

describe("the body", () => {
	/** A one-call batch padded to exactly `size` bytes. */
	function batchOf(size: number): string {
		const shell = JSON.stringify([{ ...call(), params: [""] }])
		return shell.replace('[""]', `["${"a".repeat(size - shell.length)}"]`)
	}

	test("a body of exactly the cap is forwarded; one byte more is a 413", async () => {
		const upstream = fakeUpstream()
		const exact = batchOf(BODY_CAP_BYTES)
		expect(exact.length).toBe(BODY_CAP_BYTES)
		expect((await run(post(exact), makeEnv(), upstream.fetch)).status).toBe(200)
		expect(upstream.requests[0].body.byteLength).toBe(BODY_CAP_BYTES)
		const answer = await run(post(batchOf(BODY_CAP_BYTES + 1)), makeEnv(), upstream.fetch)
		expectRefusal(answer, 413)
		expectCors(answer, CHROME_ORIGIN)
		expect(upstream.requests).toHaveLength(1)
	})

	// The client sends a batch while its entries' summed length stays under 1 MiB; ASCII adds the
	// array's brackets and 99 commas.
	test("the largest batch the client sends is forwarded", async () => {
		const upstream = fakeUpstream()
		const entries = Array.from({ length: MAX_CALLS }, (_, i) => ({ ...call("aztec_getBlockNumber", i), params: [""] }))
		const lengths = entries.map((entry) => JSON.stringify(entry).length)
		const pad = 1024 * 1024 - 1 - lengths.reduce((a, b) => a + b, 0)
		entries[0].params = ["a".repeat(pad)]
		const body = JSON.stringify(entries)
		expect(body.length).toBe(1024 * 1024 - 1 + MAX_CALLS + 1)
		expect((await run(post(body), makeEnv(), upstream.fetch)).status).toBe(200)
		expect(upstream.requests).toHaveLength(1)
	})

	test("a body past the cap is a 413 even when Content-Length lies, and the stream is not pulled past it", async () => {
		// Large rather than endless, so a reader that ignores the cap fails on the status, not a hang.
		const chunk = 64 * 1024
		let pulls = 0
		const stream = new ReadableStream<Uint8Array>({
			pull(controller) {
				if (++pulls > 64) controller.close()
				else controller.enqueue(new Uint8Array(chunk).fill(0x20))
			},
		})
		const request = new Request("https://rpc.nulo.sh/", {
			method: "POST",
			body: stream,
			headers: { origin: CHROME_ORIGIN, "cf-connecting-ip": IP, "content-type": "application/json", "content-length": "10" },
			duplex: "half",
		} as RequestInit)
		const upstream = fakeUpstream()
		expectRefusal(await run(request, makeEnv(), upstream.fetch), 413)
		expect(pulls).toBeLessThanOrEqual(BODY_CAP_BYTES / chunk + 2)
		expect(upstream.requests).toEqual([])
	})

	test.each([
		["one call object", call(), 200],
		[`${MAX_CALLS} calls`, Array.from({ length: MAX_CALLS }, (_, i) => call("aztec_getBlockNumber", i)), 200],
	])("%s is forwarded", async (_, body, status) => {
		const upstream = fakeUpstream()
		expect((await run(json(body), makeEnv(), upstream.fetch)).status).toBe(status)
		expect(upstream.requests).toHaveLength(1)
	})

	test.each([
		["a method outside the node's schema in a batch", [call(), call("node_getNodeInfo")], -32601],
		["an admin method", [call("aztecAdmin_setConfig")], -32601],
		["a method that is not a string", [call(), { ...call(), method: 7 }], -32600],
		["a non-object entry", [call(), "aztec_getNodeInfo"], -32600],
		["a null entry", [call(), null], -32600],
		["an empty array", [], -32600],
		[`${MAX_CALLS + 1} calls`, Array.from({ length: MAX_CALLS + 1 }, (_, i) => call("aztec_getBlockNumber", i)), -32600],
		["a JSON string", "aztec_getNodeInfo", -32600],
	])("%s is a 400 and calls nothing", async (_, body, code) => {
		const upstream = fakeUpstream()
		expectRefusal(await run(json(body), makeEnv(), upstream.fetch), 400, code)
		expect(upstream.requests).toEqual([])
	})

	test.each([
		["not JSON", new TextEncoder().encode('[{"method":"aztec_getNodeInfo"}')],
		["not UTF-8", new Uint8Array([0x5b, 0x22, 0xff, 0xfe, 0x22, 0x5d])],
		["empty", new Uint8Array(0)],
	])("a body that is %s is a 400 and calls nothing", async (_, bytes) => {
		const upstream = fakeUpstream()
		expectRefusal(await run(post(bytes), makeEnv(), upstream.fetch), 400, -32700)
		expect(upstream.requests).toEqual([])
	})
})

describe("methods and preflight", () => {
	test("GET answers 405 with Allow: POST", async () => {
		const answer = await run(
			new Request("https://rpc.nulo.sh/", { headers: { origin: FIREFOX_ORIGIN, "cf-connecting-ip": IP } }),
			makeEnv(),
		)
		expectRefusal(answer, 405)
		expect(answer.headers.get("allow")).toBe("POST")
		expectCors(answer, FIREFOX_ORIGIN)
	})

	test.each([CHROME_ORIGIN, FIREFOX_ORIGIN])("a preflight from %s answers 204 and counts nothing", async (origin) => {
		const env = makeEnv()
		const upstream = fakeUpstream()
		const request = new Request("https://testnet.rpc.nulo.sh/", {
			method: "OPTIONS",
			headers: { origin, "access-control-request-method": "POST", "access-control-request-headers": "content-type" },
		})
		const answer = await run(request, env, upstream.fetch)
		expect(answer.status).toBe(204)
		expect(answer.text).toBe("")
		expect(answer.headers.get("access-control-allow-methods")).toBe("POST")
		expect(answer.headers.get("access-control-allow-headers")).toBe("content-type")
		expect(answer.headers.get("access-control-max-age")).toBe("7200")
		expectCors(answer, origin)
		expect(upstream.requests).toEqual([])
		expect(env.IP_LIMITER.keys).toEqual([])
	})
})

describe("origins", () => {
	test.each([CHROME_ORIGIN, FIREFOX_ORIGIN])(
		"%s is echoed on a success, an upstream 500, a 413, a 429 and the kill switch",
		async (origin) => {
			const ok = await run(json(BATCH, { origin }), makeEnv())
			expect(ok.status).toBe(200)
			expectCors(ok, origin)
			const failed = await run(json(BATCH, { origin }), makeEnv(), fakeUpstream(() => rpcResult(500)).fetch)
			expect(failed.status).toBe(500)
			expectCors(failed, origin)
			const large = await run(post("x".repeat(BODY_CAP_BYTES + 1), { origin }), makeEnv())
			expectRefusal(large, 413)
			expectCors(large, origin)
			const limited = await run(json(BATCH, { origin }), makeEnv({ IP_LIMITER: { limit: async () => ({ success: false }) } }))
			expectRefusal(limited, 429)
			expectCors(limited, origin)
			const off = await run(json(BATCH, { origin }), makeEnv({ PROXY_OFF: "1" }))
			expectRefusal(off, 503)
			expectCors(off, origin)
		},
	)

	test.each([
		["a web page", "https://evil.example"],
		["an opaque origin", "null"],
		["a Chrome id of 31 letters", `chrome-extension://${"a".repeat(31)}`],
		["a Chrome id outside a-p", `chrome-extension://${"q".repeat(32)}`],
		["a Chrome origin with a path", `${CHROME_ORIGIN}/`],
		["a Firefox id that is not a UUID", "moz-extension://not-a-uuid"],
		["an http origin naming an extension id", `http://${"a".repeat(32)}`],
	])("%s is refused with a 403 without CORS headers, before any limiter or upstream", async (_, origin) => {
		const env = makeEnv()
		const upstream = fakeUpstream()
		const answer = await run(json(BATCH, { origin }), env, upstream.fetch)
		expectRefusal(answer, 403)
		expectCors(answer, null)
		expect(env.IP_LIMITER.keys).toEqual([])
		expect(upstream.requests).toEqual([])
	})

	test("a caller without an Origin is served without CORS headers", async () => {
		const answer = await run(json(BATCH, { origin: null }), makeEnv())
		expect(answer.status).toBe(200)
		expectCors(answer, null)
	})
})

describe("admission", () => {
	test("the kill switch answers 503 before the method, the limiter, the body or the upstream", async () => {
		const env = makeEnv({ PROXY_OFF: "1" })
		const upstream = fakeUpstream()
		expectRefusal(await run(json(BATCH), env, upstream.fetch), 503)
		expectRefusal(await run(new Request("https://rpc.nulo.sh/", { method: "OPTIONS" }), env, upstream.fetch), 503)
		expect(env.IP_LIMITER.keys).toEqual([])
		expect(upstream.requests).toEqual([])
	})

	test("a request without a client address is a 400 and calls nothing", async () => {
		const upstream = fakeUpstream()
		const request = new Request("https://rpc.nulo.sh/", {
			method: "POST",
			body: JSON.stringify(BATCH),
			headers: { origin: CHROME_ORIGIN },
		})
		expectRefusal(await run(request, makeEnv(), upstream.fetch), 400)
		expect(upstream.requests).toEqual([])
	})

	test("the limiter is keyed on the client address, and a request over it is a 429 that calls nothing", async () => {
		const env = makeEnv()
		const upstream = fakeUpstream()
		const { limit } = WRANGLER.ratelimits[0].simple
		for (let i = 0; i < limit; i++) expect((await run(json(BATCH), env, upstream.fetch)).status).toBe(200)
		expectRefusal(await run(json(BATCH), env, upstream.fetch), 429)
		expect(new Set(env.IP_LIMITER.keys)).toEqual(new Set([IP]))
		expect(upstream.requests).toHaveLength(limit)
	})
})
