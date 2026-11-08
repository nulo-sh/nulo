import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { Upstream } from "../src/resend"
import { ALLOWED_ORIGIN, CONFIRM_PATH, type Env, type RateLimit, SUBSCRIBE_PATH } from "../src/worker"

export const WRANGLER = JSON.parse(readFileSync(join(import.meta.dir, "../wrangler.jsonc"), "utf8").replace(/^\s*\/\/.*$/gm, ""))

// Markers the console spy hunts for: none of them may reach a log line.
export const ADDRESS = "  Probe.Person+launch@Example.COM "
export const NORMALIZED = "Probe.Person+launch@example.com"
export const IP = "203.0.113.77"
export const UPSTREAM_TEXT = "resend-said-something-private"
export const TEST_KEY = "test-key-not-a-secret"
export const TEST_SECRET = "test-confirm-secret-not-a-real-one-0123"
// Every token's payload segment starts with the base64url of `{"e":"`, and every send key with this.
export const TOKEN_MARKER = "eyJlIjoi"
export const KEY_MARKER = "confirm/"

export type Recorded = { method: string; url: string; headers: Headers; body: string; redirect: Request["redirect"] }

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
		CONFIRM_SECRET: TEST_SECRET,
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
export function fakeUpstream(answer: (request: Recorded, init: RequestInit, now: number) => Answer, timeoutMs = 5000) {
	const requests: Recorded[] = []
	const sleeps: number[] = []
	let clock = Date.parse("2026-10-27T12:00:00.000Z")
	const up: Upstream = {
		async fetch(input, init) {
			const request = new Request(input, init)
			const recorded = {
				method: request.method,
				url: request.url,
				headers: request.headers,
				body: await request.text(),
				redirect: request.redirect,
			}
			requests.push(recorded)
			return answer(recorded, init, clock)
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

export const reply = (status: number, headers: Record<string, string> = {}, name = "x") =>
	new Response(JSON.stringify({ statusCode: status, message: `${UPSTREAM_TEXT} ${NORMALIZED}`, name }), { status, headers })

const KEY_LIFETIME_MS = 24 * 60 * 60 * 1000

/**
 * A Resend team: a contact list with one contact per address, and the emails it accepted. The docs
 * leave a duplicate create unspecified, so it either errors with `duplicate` or, for `"upsert"`,
 * overwrites the contact and succeeds. A send keeps its `Idempotency-Key` for 24 h from the moment
 * it is accepted: the same body again returns the first answer, another body is a 409.
 */
export function resendStore(duplicate: number | "upsert") {
	const contacts = new Map<string, unknown>()
	const emails: Recorded[] = []
	const keys = new Map<string, { body: string; id: string; at: number }>()
	let createAttempts = 0
	const send = (request: Recorded, now: number): Response => {
		const key = request.headers.get("idempotency-key") ?? ""
		const held = keys.get(key)
		if (held && now - held.at < KEY_LIFETIME_MS) {
			return held.body === request.body ? Response.json({ id: held.id }) : reply(409, {}, "invalid_idempotent_request")
		}
		const id = crypto.randomUUID()
		keys.set(key, { body: request.body, id, at: now })
		emails.push(request)
		return Response.json({ id })
	}
	const answer = (request: Recorded, _init?: RequestInit, now = 0): Response => {
		const url = new URL(request.url)
		if (request.method === "GET") {
			const email = url.pathname.slice("/contacts/".length)
			return contacts.has(email) ? Response.json({ object: "contact", email, unsubscribed: false }) : reply(404)
		}
		if (url.pathname === "/emails") return send(request, now)
		createAttempts++
		const body = JSON.parse(request.body)
		if (contacts.has(body.email) && duplicate !== "upsert") return reply(duplicate)
		contacts.set(body.email, body)
		return Response.json({ object: "contact", id: crypto.randomUUID() }, { status: 201 })
	}
	return { contacts, emails, answer, attempts: () => createAttempts }
}

export function post(
	body: RequestInit["body"],
	{
		contentType = "application/x-www-form-urlencoded",
		headers = {},
		path = SUBSCRIBE_PATH,
	}: { contentType?: string; headers?: Record<string, string>; path?: string } = {},
): Request {
	return new Request(`https://nulo.sh${path}`, {
		method: "POST",
		body,
		headers: { origin: ALLOWED_ORIGIN, "cf-connecting-ip": IP, "content-type": contentType, ...headers },
	})
}

export const form = (fields: Record<string, string>, headers: Record<string, string> = {}) =>
	post(new URLSearchParams(fields).toString(), { headers })

export const json = (value: unknown, headers: Record<string, string> = {}, path = SUBSCRIBE_PATH) =>
	post(JSON.stringify(value), { contentType: "application/json", headers: { accept: "application/json", ...headers }, path })

/** The confirmation page's request: `{ token }` as JSON to `/api/confirm`. */
export const confirmWith = (token: unknown, headers: Record<string, string> = {}) =>
	json(token === undefined ? {} : { token }, headers, CONFIRM_PATH)
