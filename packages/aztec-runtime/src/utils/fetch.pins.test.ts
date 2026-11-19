/**
 * Pre-extraction pins for the timeout-fetch closure — its first tests. Every
 * error message and status-classification branch is the contract callers
 * (connectivity classification, retry policy) match on.
 */
import { createSafeJsonRpcClient } from "@aztec-labs/foundation/json-rpc/client"
import { NoRetryError } from "@aztec-labs/foundation/retry"
import { type AztecNode, AztecNodeApiSchema } from "@aztec-labs/stdlib/interfaces/client"
import { afterEach, describe, expect, test, vi } from "vitest"
import { SILENT_RPC_LOG } from "../adapters/aztec-node-factory-adapter"
import { MAX_NODE_RESPONSE_BYTES, makeFetchWithTimeout, makeSingleAttemptFetch, type TransportFailure, transportFailureOf } from "./fetch"

const realFetch = globalThis.fetch

function jsonResponse(body: unknown, init: { ok: boolean; status?: number; statusText?: string }) {
	return new Response(JSON.stringify(body), {
		status: init.status ?? (init.ok ? 200 : 500),
		statusText: init.statusText ?? "",
		headers: { "x-pin": "yes" },
	})
}

/** A body of `size` bytes streamed in 1 MiB chunks with no `content-length`, so only the counted read can bound it. */
function streamedJsonString(size: number, status: number): Response {
	const chunk = new Uint8Array(1024 * 1024).fill(0x61)
	let left = size - 2
	const body = new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(new TextEncoder().encode('"'))
		},
		pull(controller) {
			if (left === 0) {
				controller.enqueue(new TextEncoder().encode('"'))
				controller.close()
				return
			}
			const n = Math.min(left, chunk.byteLength)
			controller.enqueue(n === chunk.byteLength ? chunk : chunk.subarray(0, n))
			left -= n
		},
	})
	return new Response(body, { status })
}

afterEach(() => {
	globalThis.fetch = realFetch
	vi.restoreAllMocks()
})

describe("fetchOnce (via makeSingleAttemptFetch) reject oracle", () => {
	test("abort maps to the timeout message", async () => {
		globalThis.fetch = vi.fn(async () => {
			throw new DOMException("aborted", "AbortError")
		}) as typeof fetch
		await expect(makeSingleAttemptFetch(1234)("http://host:1", {})).rejects.toThrowError(
			"Request to http://host:1 timed out after 1234ms",
		)
	})

	test("a non-abort network failure maps to the host-prefixed message", async () => {
		globalThis.fetch = vi.fn(async () => {
			throw new TypeError("fetch failed")
		}) as typeof fetch
		await expect(makeSingleAttemptFetch(1000)("http://host:1", {})).rejects.toThrowError(
			"Error fetching from host http://host:1: TypeError: fetch failed",
		)
	})

	test("4xx rejects with NoRetryError carrying the server message", async () => {
		globalThis.fetch = vi.fn(async () =>
			jsonResponse({ error: { message: "bad params" } }, { ok: false, status: 400, statusText: "Bad Request" }),
		) as typeof fetch
		const err = await makeSingleAttemptFetch(1000)("http://h", {}).catch((e) => e)
		expect(err).toBeInstanceOf(NoRetryError)
		expect(err.message).toBe("Error 400 from server http://h: bad params")
	})

	test("noRetry=true makes even a 5xx a NoRetryError", async () => {
		globalThis.fetch = vi.fn(async () => jsonResponse({ error: { message: "boom" } }, { ok: false, status: 500 })) as typeof fetch
		const err = await makeSingleAttemptFetch(1000)("http://h", {}, {}, true).catch((e) => e)
		expect(err).toBeInstanceOf(NoRetryError)
		expect(err.message).toBe("Error 500 from server http://h: boom")
	})

	test("5xx (retryable) rejects with a PLAIN Error, statusText fallback when no error body", async () => {
		globalThis.fetch = vi.fn(async () => jsonResponse({}, { ok: false, status: 503, statusText: "Unavailable" })) as typeof fetch
		const err = await makeSingleAttemptFetch(1000)("http://h", {}).catch((e) => e)
		expect(err).toBeInstanceOf(Error)
		expect(err).not.toBeInstanceOf(NoRetryError)
		expect(err.message).toBe("Error 503 from server http://h: Unavailable")
	})

	test("unparseable body on a NON-ok response surfaces the statusText", async () => {
		globalThis.fetch = vi.fn(async () => new Response("nope", { status: 500, statusText: "Bad Gateway-ish" })) as typeof fetch
		await expect(makeSingleAttemptFetch(1000)("http://h", {})).rejects.toThrowError("Bad Gateway-ish")
	})

	test("unparseable body on an OK response is its own failure", async () => {
		globalThis.fetch = vi.fn(async () => new Response("nope", { status: 200 })) as typeof fetch
		await expect(makeSingleAttemptFetch(1000)("http://h", {})).rejects.toThrowError("Failed to parse body as JSON")
	})

	test("success passes the parsed body + live headers through, and sends extraHeaders", async () => {
		const spy = vi.fn(async () => jsonResponse({ result: 7 }, { ok: true }))
		globalThis.fetch = spy as unknown as typeof fetch
		const out = await makeSingleAttemptFetch(1000)("http://h", { m: 1 }, { "x-extra": "1" })
		expect(out.response).toEqual({ result: 7 })
		expect(out.headers.get("x-pin")).toBe("yes")
		const init = (spy.mock.calls[0] as unknown[])?.[1] as RequestInit
		expect((init.headers as Record<string, string>)["x-extra"]).toBe("1")
		expect((init.headers as Record<string, string>)["content-type"]).toBe("application/json")
		expect(init.signal).toBeInstanceOf(AbortSignal)
	})

	test("the abort timer stays armed through a PENDING body read: a stalled body still times out", async () => {
		// fetch resolves fast, but the body read hangs; the AbortController fires
		// mid-read and the (aborted) read rejects INTO the json-parse catch —
		// surfacing as the parse-failure message on an ok response (current
		// behavior, pinned so the extraction can't move clearTimeout ahead of
		// the body read).
		vi.useFakeTimers()
		try {
			let signal: AbortSignal | undefined
			globalThis.fetch = vi.fn(async (_h: unknown, init: RequestInit) => {
				signal = init.signal as AbortSignal
				const body = new ReadableStream<Uint8Array>({
					start(controller) {
						signal?.addEventListener("abort", () => controller.error(new Error("body read aborted")))
					},
				})
				return new Response(body, { status: 200 })
			}) as unknown as typeof fetch
			const pending = makeSingleAttemptFetch(50)("http://h", {})
			const settled = expect(pending).rejects.toThrowError("Failed to parse body as JSON")
			await vi.advanceTimersByTimeAsync(60)
			await settled
			expect(signal?.aborted).toBe(true)
		} finally {
			vi.useRealTimers()
		}
	})
})

describe("the node reply byte budget", () => {
	test.each([200, 503])("a reply over the budget with status %i is a NoRetryError and is fetched once", async (status) => {
		const spy = vi.fn(async () => streamedJsonString(MAX_NODE_RESPONSE_BYTES + 1, status))
		globalThis.fetch = spy as unknown as typeof fetch
		const err = await makeFetchWithTimeout(60_000)("http://h", {}).catch((e) => e)
		expect(err).toBeInstanceOf(NoRetryError)
		expect(err.message).toBe(`Response body is over its ${MAX_NODE_RESPONSE_BYTES}-byte budget`)
		expect(spy).toHaveBeenCalledOnce()
	})

	test("a reply at the budget parses (control)", async () => {
		globalThis.fetch = vi.fn(async () => streamedJsonString(MAX_NODE_RESPONSE_BYTES, 200)) as unknown as typeof fetch
		const out = await makeSingleAttemptFetch(60_000)("http://h", {})
		expect((out.response as unknown as string).length).toBe(MAX_NODE_RESPONSE_BYTES - 2)
	})
})

describe("retry-wrapper interaction (makeFetchWithTimeout)", () => {
	test("retryable failures retry; a later success wins", async () => {
		let calls = 0
		globalThis.fetch = vi.fn(async () => {
			calls++
			if (calls === 1) return jsonResponse({ error: { message: "flaky" } }, { ok: false, status: 500 })
			return jsonResponse({ result: 42 }, { ok: true })
		}) as typeof fetch
		vi.useFakeTimers()
		try {
			const pending = makeFetchWithTimeout(1000)("http://h", {})
			await vi.advanceTimersByTimeAsync(5000)
			const out = await pending
			expect(out.response).toEqual({ result: 42 })
			expect(calls).toBe(2)
		} finally {
			vi.useRealTimers()
		}
	})

	test("a 4xx NoRetryError stops immediately — exactly one attempt", async () => {
		let calls = 0
		globalThis.fetch = vi.fn(async () => {
			calls++
			return jsonResponse({ error: { message: "bad" } }, { ok: false, status: 404 })
		}) as typeof fetch
		await expect(makeFetchWithTimeout(1000)("http://h", {})).rejects.toThrowError("Error 404 from server http://h: bad")
		expect(calls).toBe(1)
	})
})

describe("retryWhile (makeFetchWithTimeout)", () => {
	function refusingFetch(): { calls: () => number } {
		let calls = 0
		globalThis.fetch = vi.fn(async () => {
			calls++
			throw new TypeError(`refused #${calls}`)
		}) as typeof fetch
		return { calls: () => calls }
	}

	/** The outcome once `ms` of fake time has passed, or `undefined` if still pending then. */
	async function settleWithin(pending: Promise<unknown>, ms: number): Promise<Error | undefined> {
		let error: Error | undefined
		pending.catch((e: Error) => {
			error = e
		})
		await vi.advanceTimersByTimeAsync(ms)
		return error
	}

	// Retries stopped means no backoff sleep either: the call rejects with no time passing.
	test.each([
		{ allowed: false, calls: 1, ms: 0 },
		{ allowed: true, calls: 4, ms: 6_000 },
	])(
		"a network failure with retryWhile $allowed makes $calls attempt(s) and rejects with the last one's error",
		async ({ allowed, calls, ms }) => {
			const node = refusingFetch()
			vi.useFakeTimers()
			try {
				const error = await settleWithin(makeFetchWithTimeout(1000, { retryWhile: () => allowed })("http://h", {}), ms)
				expect(error?.message).toBe(`Error fetching from host http://h: TypeError: refused #${calls}`)
				expect(node.calls()).toBe(calls)
			} finally {
				vi.useRealTimers()
			}
		},
	)

	test("a stop raised during the backoff sleep dispatches nothing when the sleep ends", async () => {
		const node = refusingFetch()
		let allowed = true
		vi.useFakeTimers()
		try {
			const outcome = makeFetchWithTimeout(1000, { retryWhile: () => allowed })("http://h", {}).catch((e: Error) => e)
			await vi.advanceTimersByTimeAsync(500)
			expect(node.calls()).toBe(1)
			allowed = false
			await vi.advanceTimersByTimeAsync(10_000)
			expect(((await outcome) as Error).message).toBe("Error fetching from host http://h: TypeError: refused #1")
			expect(node.calls()).toBe(1)
		} finally {
			vi.useRealTimers()
		}
	})

	test("a first attempt runs and resolves even with retries stopped", async () => {
		globalThis.fetch = vi.fn(async () => jsonResponse({ result: 9 }, { ok: true })) as typeof fetch
		const out = await makeFetchWithTimeout(1000, { retryWhile: () => false })("http://h", {})
		expect(out.response).toEqual({ result: 9 })
	})
})

/** The failure kind a routed node reads to decide whether a call may move to another endpoint. Each
 *  row also pins today's attempt count, which tagging must leave unchanged. */
describe("transport failure kinds (makeFetchWithTimeout)", () => {
	/** Runs one call to completion under fake timers and returns its error and the attempts it made. */
	async function failedCall(reply: () => Response | Promise<Response>): Promise<{ error: unknown; attempts: number }> {
		let attempts = 0
		globalThis.fetch = vi.fn(async () => {
			attempts++
			return reply()
		}) as unknown as typeof fetch
		vi.useFakeTimers()
		try {
			const outcome = makeFetchWithTimeout(1000)("http://h", [{ jsonrpc: "2.0", id: 0, method: "m", params: [] }]).then(
				() => undefined,
				(e: unknown) => e,
			)
			await vi.advanceTimersByTimeAsync(10_000)
			return { error: await outcome, attempts }
		} finally {
			vi.useRealTimers()
		}
	}

	const json = (body: unknown, status: number) => new Response(JSON.stringify(body), { status })
	const html = (status: number) => new Response("<html>busy</html>", { status, headers: { "content-type": "text/html" } })

	test.each<{ name: string; reply: () => Response; kind: TransportFailure | undefined; attempts: number }>([
		{ name: "HTTP 500 with a JSON body", reply: () => json({ error: { message: "boom" } }, 500), kind: "server", attempts: 4 },
		{ name: "HTTP 502 with an HTML body", reply: () => html(502), kind: "server", attempts: 4 },
		{ name: "a 200 that is not JSON", reply: () => new Response("nope", { status: 200 }), kind: "malformed", attempts: 4 },
		{ name: "an HTML 429 page", reply: () => html(429), kind: "malformed", attempts: 4 },
		{ name: "an HTML 404 page", reply: () => html(404), kind: "malformed", attempts: 4 },
		{
			name: "HTTP 429 with a JSON body",
			reply: () => json({ error: { code: 429, message: "slow down" } }, 429),
			kind: "overloaded",
			attempts: 1,
		},
		{ name: "HTTP 408 with a JSON body", reply: () => json({}, 408), kind: "overloaded", attempts: 1 },
		{ name: "HTTP 425 with a JSON body", reply: () => json({}, 425), kind: "overloaded", attempts: 1 },
		{
			name: "a gateway's HTTP 400 batch refusal (every entry code 31)",
			reply: () =>
				json(
					[0, 1].map((id) => ({ jsonrpc: "2.0", id, error: { code: 31, message: "batch too large" } })),
					400,
				),
			kind: "refused",
			attempts: 1,
		},
		{
			name: "HTTP 403 with a non-reserved code",
			reply: () => json({ error: { code: 35, message: "no" } }, 403),
			kind: "refused",
			attempts: 1,
		},
		{ name: "HTTP 401 with no JSON-RPC code", reply: () => json({ message: "unauthorized" }, 401), kind: "refused", attempts: 1 },
		{
			name: "a 200 JSON-RPC error object with a non-reserved code",
			reply: () => json({ jsonrpc: "2.0", id: null, error: { code: 26, message: "limit" } }, 200),
			kind: "refused",
			attempts: 1,
		},
		{
			name: "the node's own HTTP 400 (reserved code)",
			reply: () =>
				json(
					{ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Batch request exceeds maximum allowed size of 100" } },
					400,
				),
			kind: undefined,
			attempts: 1,
		},
		{
			name: "a gateway batch carrying one reserved code",
			reply: () => json([{ jsonrpc: "2.0", id: 0, error: { code: -32602, message: "invalid params" } }], 400),
			kind: undefined,
			attempts: 1,
		},
	])("$name is $kind after $attempts attempt(s)", async ({ reply, kind, attempts }) => {
		const call = await failedCall(reply)
		expect(call.error).toBeInstanceOf(Error)
		expect(transportFailureOf(call.error)).toBe(kind)
		expect(call.attempts).toBe(attempts)
	})

	test("a refused 200 error object is a NoRetryError; one with a reserved code still resolves (control)", async () => {
		const refused = await failedCall(() => json({ jsonrpc: "2.0", id: null, error: { code: 26, message: "limit" } }, 200))
		expect(refused.error).toBeInstanceOf(NoRetryError)
		globalThis.fetch = vi.fn(async () =>
			json({ jsonrpc: "2.0", id: null, error: { code: -32603, message: "internal" } }, 200),
		) as typeof fetch
		const out = await makeSingleAttemptFetch(1000)("http://h", [])
		expect(out.response).toEqual({ jsonrpc: "2.0", id: null, error: { code: -32603, message: "internal" } })
	})

	test.each<{ name: string; thrown: () => unknown; kind: TransportFailure }>([
		{ name: "a refused connection", thrown: () => new TypeError("fetch failed"), kind: "unreachable" },
		{ name: "the abort", thrown: () => new DOMException("aborted", "AbortError"), kind: "timeout" },
	])("$name is $kind after 4 attempts", async ({ thrown, kind }) => {
		const call = await failedCall(() => {
			throw thrown()
		})
		expect(transportFailureOf(call.error)).toBe(kind)
		expect(call.attempts).toBe(4)
	})

	test("an abort during the body read is a timeout and keeps today's message", async () => {
		vi.useFakeTimers()
		try {
			globalThis.fetch = vi.fn(async (_h: unknown, init: RequestInit) => {
				const signal = init.signal as AbortSignal
				const body = new ReadableStream<Uint8Array>({
					start(controller) {
						signal.addEventListener("abort", () => controller.error(new Error("body read aborted")))
					},
				})
				return new Response(body, { status: 200 })
			}) as unknown as typeof fetch
			const pending = makeSingleAttemptFetch(50)("http://h", {}).catch((e: unknown) => e)
			await vi.advanceTimersByTimeAsync(60)
			const error = await pending
			expect((error as Error).message).toBe("Failed to parse body as JSON")
			expect(transportFailureOf(error)).toBe("timeout")
		} finally {
			vi.useRealTimers()
		}
	})

	test("a body over the budget has no kind: the same reply would come from any endpoint", async () => {
		globalThis.fetch = vi.fn(async () => streamedJsonString(MAX_NODE_RESPONSE_BYTES + 1, 200)) as unknown as typeof fetch
		const error = await makeSingleAttemptFetch(60_000)("http://h", {}).catch((e: unknown) => e)
		expect(error).toBeInstanceOf(NoRetryError)
		expect(transportFailureOf(error)).toBeUndefined()
	})

	test("the kind reaches every caller of a failed batch through the client's `cause.data`", async () => {
		globalThis.fetch = vi.fn(async () => json({ error: { message: "boom" } }, 503)) as typeof fetch
		const node = createSafeJsonRpcClient<AztecNode>("http://h", AztecNodeApiSchema, {
			namespaceMethods: "aztec",
			fetch: makeSingleAttemptFetch(1000),
			log: SILENT_RPC_LOG,
		})
		const [a, b] = await Promise.all([node.getBlockNumber().catch((e: unknown) => e), node.getChainTips().catch((e: unknown) => e)])
		expect(transportFailureOf(a)).toBe("server")
		expect(transportFailureOf(b)).toBe("server")
		expect((a as Error & { cause: { data: unknown } }).cause.data).toBe((b as Error & { cause: { data: unknown } }).cause.data)
		expect(transportFailureOf(new Error("the node's own answer", { cause: { code: -32603, message: "x" } }))).toBeUndefined()
	})
})
