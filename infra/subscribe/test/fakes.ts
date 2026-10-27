import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { Upstream } from "../src/resend"
import { ALLOWED_ORIGIN, type Env, type RateLimit } from "../src/worker"

export const WRANGLER = JSON.parse(readFileSync(join(import.meta.dir, "../wrangler.jsonc"), "utf8").replace(/^\s*\/\/.*$/gm, ""))

// Markers the console spy hunts for: none of them may reach a log line.
export const ADDRESS = "  Probe.Person+launch@Example.COM "
export const NORMALIZED = "Probe.Person+launch@example.com"
export const IP = "203.0.113.77"
export const UPSTREAM_TEXT = "resend-said-something-private"
export const TEST_KEY = "test-key-not-a-secret"

export type Recorded = { method: string; url: string; headers: Headers; body: string }

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

export function makeEnv(
	overrides: Partial<Env> = {},
): Env & { IP_LIMITER: ReturnType<typeof limiter>; GLOBAL_LIMITER: ReturnType<typeof limiter> } {
	return {
		...WRANGLER.vars,
		RESEND_API_KEY: TEST_KEY,
		IP_LIMITER: limiter("IP_LIMITER"),
		GLOBAL_LIMITER: limiter("GLOBAL_LIMITER"),
		...overrides,
	}
}

export type Answer = Response | Promise<Response>

/**
 * A fake Resend answering each request through `answer`, recording every request and every sleep.
 * Its clock advances only through `sleep` and `advance`.
 */
export function fakeUpstream(answer: (request: Recorded, init: RequestInit) => Answer, timeoutMs = 5000) {
	const requests: Recorded[] = []
	const sleeps: number[] = []
	let clock = Date.parse("2026-10-27T12:00:00.000Z")
	const up: Upstream = {
		async fetch(input, init) {
			const request = new Request(input, init)
			const recorded = { method: request.method, url: request.url, headers: request.headers, body: await request.text() }
			requests.push(recorded)
			return answer(recorded, init)
		},
		async sleep(ms) {
			sleeps.push(ms)
			clock += ms
		},
		now: () => clock,
		timeoutMs,
	}
	return { up, requests, sleeps, advance: (ms: number) => (clock += ms) }
}

export const reply = (status: number, headers: Record<string, string> = {}) =>
	new Response(JSON.stringify({ statusCode: status, message: `${UPSTREAM_TEXT} ${NORMALIZED}`, name: "x" }), { status, headers })

/** A Resend contact list with one contact per address, answering a duplicate create with `duplicateStatus`. */
export function resendStore(duplicateStatus: number) {
	const contacts = new Map<string, unknown>()
	let createAttempts = 0
	const answer = (request: Recorded): Response => {
		const url = new URL(request.url)
		if (request.method === "GET") {
			const email = url.pathname.slice("/contacts/".length)
			return contacts.has(email) ? Response.json({ object: "contact", email, unsubscribed: false }) : reply(404)
		}
		createAttempts++
		const body = JSON.parse(request.body)
		if (contacts.has(body.email)) return reply(duplicateStatus)
		contacts.set(body.email, body)
		return Response.json({ object: "contact", id: crypto.randomUUID() }, { status: 201 })
	}
	return { contacts, answer, attempts: () => createAttempts }
}

export function post(
	body: RequestInit["body"],
	{ contentType = "application/x-www-form-urlencoded", headers = {} }: { contentType?: string; headers?: Record<string, string> } = {},
): Request {
	return new Request("https://nulo.sh/api/subscribe", {
		method: "POST",
		body,
		headers: { origin: ALLOWED_ORIGIN, "cf-connecting-ip": IP, "content-type": contentType, ...headers },
	})
}

export const form = (fields: Record<string, string>, headers: Record<string, string> = {}) =>
	post(new URLSearchParams(fields).toString(), { headers })

export const json = (value: unknown, headers: Record<string, string> = {}) =>
	post(JSON.stringify(value), { contentType: "application/json", headers: { accept: "application/json", ...headers } })
