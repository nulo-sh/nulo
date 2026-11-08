/**
 * Timeout-wrapped fetch for Aztec node RPC calls.
 *
 * The Aztec SDK's default fetch (`makeFetch([1, 2, 3], false)`) has retry
 * logic but NO per-request timeout. If the node is unresponsive, each
 * attempt (and its retries) hang forever — freezing the PXE and the
 * entire wallet.
 *
 * This module mirrors the SDK's `defaultFetch` exactly (jsonStringify,
 * NoRetryError for 4xx) but adds a per-request AbortController timeout.
 * It then wraps with the SDK's own `retry` + `makeBackoff` for retries.
 */

import { jsonStringify } from "@aztec-labs/foundation/json-rpc"
import { NoRetryError, makeBackoff, retry } from "@aztec-labs/foundation/retry"
import { ResponseTooLargeError, readBodyCapped } from "@nulo/wallet-core/utils"

/** Default timeout per individual HTTP request (ms). */
export const DEFAULT_REQUEST_TIMEOUT_MS = 60_000

/** The most a node reply may carry before it is parsed: a budget, not a protocol maximum. One body
 *  answers a batch of up to 100 calls, and the largest single replies (a contract class, tx effects,
 *  tagged logs) stay under 1 MB. */
export const MAX_NODE_RESPONSE_BYTES = 32 * 1024 * 1024

/**
 * Why a node request failed, when the failure is the endpoint's and not the node's own answer:
 * - `unreachable`: the request never got an answer (refused, DNS, TLS, CORS);
 * - `timeout`: the per-attempt abort fired, while dispatching or reading the body;
 * - `server`: a non-ok status outside 4xx (5xx in practice), whatever the body;
 * - `malformed`: a body that is not JSON on any other status, an HTML 429 page included;
 * - `overloaded`: HTTP 408, 425 or 429 with a JSON body;
 * - `refused`: any other 4xx with a JSON body carrying no reserved JSON-RPC code, or a 200 whose
 *   body is a single JSON-RPC error object with a non-reserved code (a provider gateway's refusal).
 * A reply the node itself produced (a reserved code), a body over the byte budget or a success has no kind.
 */
export type TransportFailure = "unreachable" | "timeout" | "server" | "malformed" | "overloaded" | "refused"

const TRANSPORT_FAILURE = Symbol("nulo.transportFailure")

/** JSON-RPC 2.0 reserves −32768..−32000 for the server itself; the Aztec node answers only inside it,
 *  and a provider gateway's own refusals (dRPC's 26, 30, 31, 35) fall outside. */
export function isReservedRpcCode(code: unknown): boolean {
	return typeof code === "number" && code >= -32768 && code <= -32000
}

/** Tags `error` with `kind`, the shape the fetch throws; for tests and fakes that stand in for a node client. */
export function withTransportFailure<E extends Error>(error: E, kind: TransportFailure): E {
	Object.defineProperty(error, TRANSPORT_FAILURE, { value: kind })
	return error
}

function kindOn(value: unknown): TransportFailure | undefined {
	return typeof value === "object" && value !== null
		? (value as { [TRANSPORT_FAILURE]?: TransportFailure })[TRANSPORT_FAILURE]
		: undefined
}

/**
 * The kind of a fetch error, read from the error itself or, for a node client's caller, from the
 * client's `cause.data`, where the SDK puts the fetch's own error object for every entry of a
 * failed batch (so the entries of one failed request share it).
 */
export function transportFailureOf(error: unknown): TransportFailure | undefined {
	const cause = typeof error === "object" && error !== null ? (error as { cause?: unknown }).cause : undefined
	const data = typeof cause === "object" && cause !== null ? (cause as { data?: unknown }).data : undefined
	return kindOn(error) ?? kindOn(data)
}

/**
 * JSON-RPC fetch signature expected by `createAztecNodeClient`.
 */
type JsonRpcFetch = (
	host: string,
	body: unknown,
	extraHeaders?: Record<string, string>,
	noRetry?: boolean,
) => Promise<{ response: unknown; headers: { get: (header: string) => string | null | undefined } }>

/**
 * Single-attempt fetch with timeout. Mirrors the SDK's `defaultFetch` but
 * adds an AbortController that fires after `timeoutMs`.
 */
function fetchOnce(timeoutMs: number): JsonRpcFetch {
	// Both awaits and the timeout `finally` stay inline: the abort signal must
	// remain live through a pending body read (pinned), so no helper may
	// own either await. The classifiers below are synchronous.
	return async (host, body, extraHeaders = {}, noRetry = false) => {
		const controller = new AbortController()
		const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

		try {
			let resp: Response
			try {
				resp = await fetch(host, {
					method: "POST",
					body: jsonStringify(body),
					headers: { "content-type": "application/json", ...extraHeaders },
					signal: controller.signal,
				})
			} catch (err: unknown) {
				throw mapFetchDispatchFailure(err, host, timeoutMs)
			}

			let responseJson: unknown
			try {
				responseJson = JSON.parse(await readBodyCapped(resp, MAX_NODE_RESPONSE_BYTES))
			} catch (err: unknown) {
				throw mapBodyFailure(err, resp, controller.signal.aborted)
			}

			if (!resp.ok) throw classifyRpcFailure(resp, host, responseJson, noRetry)
			const refusal = gatewayRefusal(resp, host, responseJson)
			if (refusal) throw refusal

			return { response: responseJson, headers: resp.headers }
		} finally {
			clearTimeout(timeoutId)
		}
	}
}

/** Map a dispatch-phase failure: an abort is the timeout; anything else keeps
 *  the SDK-compatible host-prefixed message. */
function mapFetchDispatchFailure(err: unknown, host: string, timeoutMs: number): Error {
	if (err instanceof DOMException && err.name === "AbortError") {
		return withTransportFailure(new Error(`Request to ${host} timed out after ${timeoutMs}ms`), "timeout")
	}
	return withTransportFailure(new Error(`Error fetching from host ${host}: ${err}`), "unreachable")
}

/** An oversize body is terminal on any status, since a retry would read the same reply; any other
 *  read or parse failure keeps the SDK-compatible messages. */
function mapBodyFailure(err: unknown, resp: Response, aborted: boolean): Error {
	if (err instanceof ResponseTooLargeError) return new NoRetryError(err.message)
	const kind: TransportFailure = aborted ? "timeout" : resp.status >= 500 ? "server" : "malformed"
	if (!resp.ok) return withTransportFailure(new Error(resp.statusText), kind)
	return withTransportFailure(new Error(`Failed to parse body as JSON`), kind)
}

function rpcErrorOf(entry: unknown): { code?: unknown; message?: unknown } | undefined {
	const error = typeof entry === "object" && entry !== null ? (entry as { error?: unknown }).error : undefined
	return typeof error === "object" && error !== null ? error : undefined
}

/** Status classification for a non-ok response: 4xx (or an explicit noRetry)
 *  is terminal, everything else stays retryable. */
function classifyRpcFailure(resp: Response, host: string, responseJson: unknown, noRetry: boolean): Error {
	const message = Array.isArray(responseJson) ? undefined : rpcErrorOf(responseJson)?.message
	const errorMessage = `Error ${resp.status} from server ${host}: ${typeof message === "string" ? message : resp.statusText}`
	const is4xx = resp.status >= 400 && resp.status < 500
	const error = noRetry || is4xx ? new NoRetryError(errorMessage) : new Error(errorMessage)
	if (!is4xx) return withTransportFailure(error, "server")
	if (resp.status === 408 || resp.status === 425 || resp.status === 429) return withTransportFailure(error, "overloaded")
	const entries = Array.isArray(responseJson) ? responseJson : [responseJson]
	return entries.some((entry) => isReservedRpcCode(rpcErrorOf(entry)?.code)) ? error : withTransportFailure(error, "refused")
}

/** A 200 whose body is one JSON-RPC error object with a non-reserved code: a provider gateway
 *  refusing the whole request. The client fails every entry of such a reply without a retry, so
 *  throwing it here as terminal changes nothing on one endpoint and lets a router see the refusal. */
function gatewayRefusal(resp: Response, host: string, responseJson: unknown): Error | undefined {
	if (Array.isArray(responseJson)) return undefined
	const error = rpcErrorOf(responseJson)
	if (error === undefined || typeof error.code !== "number" || isReservedRpcCode(error.code)) return undefined
	const message = typeof error.message === "string" ? error.message : resp.statusText
	return withTransportFailure(new NoRetryError(`Error ${resp.status} from server ${host}: ${message}`), "refused")
}

/**
 * Single-attempt variant: the AbortController timeout WITHOUT the retry
 * wrapper. For connectivity probes that must settle within a caller-owned
 * budget — the retry chain would multiply the budget by the attempt count
 * and keep sockets alive after the caller has moved on.
 */
export function makeSingleAttemptFetch(timeoutMs: number): JsonRpcFetch {
	return fetchOnce(timeoutMs)
}

/** Retry policy for `makeFetchWithTimeout`. */
export interface RetryOptions {
	/** Asked before each retry of a failed attempt; `false` ends the retries and the call rejects
	 *  with that attempt's own error. The first attempt always runs. */
	retryWhile?: () => boolean
}

/**
 * Create a JSON-RPC fetch function with per-request timeout AND retry logic.
 *
 * Matches the SDK's `makeFetch([1, 2, 3], false)` behavior:
 * - Retries with exponential backoff on 5xx / network errors
 * - Stops immediately on 4xx (NoRetryError)
 * - Adds per-request timeout via AbortController (the SDK lacks this)
 */
export function makeFetchWithTimeout(
	timeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS,
	{ retryWhile = () => true }: RetryOptions = {},
): JsonRpcFetch {
	const once = fetchOnce(timeoutMs)
	return async (host, body, extraHeaders = {}, noRetry) => {
		let failed: { error: unknown } | undefined
		return await retry(
			async () => {
				// The SDK's `retry` sleeps, then calls again without asking the backoff, so a stop
				// raised during the sleep is only seen here.
				if (failed && !retryWhile()) throw failed.error
				try {
					return await once(host, body, extraHeaders, noRetry ?? false)
				} catch (error) {
					failed = { error }
					throw error
				}
			},
			`JsonRpcClient request to ${host}`,
			backoffWhile(makeBackoff([1, 2, 3]), retryWhile),
			undefined,
			false,
		)
	}
}

/** `backoff`, ended as soon as `retryWhile` answers false, so no sleep is scheduled after a stop. */
function* backoffWhile(backoff: Generator<number, void>, retryWhile: () => boolean): Generator<number, void> {
	for (const seconds of backoff) {
		if (!retryWhile()) return
		yield seconds
	}
}
