// The key-holding half of the nulo.sh signup. It is reachable only through nulo-landing's service
// binding and holds a full-access Resend key. A signup sends a confirmation email; the contact is
// created only when its token comes back from the confirmation page. Answers reveal neither whether
// an address was already on the list nor anything Resend said.

import { BODY_CAP_BYTES, type Fields, parseFields, readCapped } from "./body"
import { confirmationEmail } from "./confirmation"
import { normalizeEmail } from "./email"
import { addContact, type ContactConfig, type Outcome, requestConfirmation, type Upstream } from "./resend"
import { failure, okJson, success } from "./respond"
import { readToken, sendKey, signToken } from "./token"

export const ALLOWED_ORIGIN = "https://nulo.sh"
export const SUBSCRIBE_PATH = "/api/subscribe"
export const CONFIRM_PATH = "/api/confirm"
/** A length floor, not an entropy check: the README asks for 32 random bytes. */
export const MIN_SECRET_LENGTH = 32

/** The Workers Rate Limiting binding. */
export interface RateLimit {
	limit(options: { key: string }): Promise<{ success: boolean }>
}

export interface Env {
	SUBSCRIBE_OFF?: string
	RESEND_API_KEY?: string
	RESEND_SEGMENT_ID?: string
	RESEND_TOPIC_ID?: string
	CONSENT_VERSION?: string
	CONFIRM_SECRET?: string
	IP_LIMITER: RateLimit
	GLOBAL_LIMITER: RateLimit
}

// The Origin check comes before the limiters, so cross-site posts never spend a visitor's budget.
async function admit(request: Request, env: Env): Promise<Response | null> {
	if (request.method !== "POST") return failure(405, { allow: "POST" })
	if (request.headers.get("origin") !== ALLOWED_ORIGIN) return failure(403)
	const ip = request.headers.get("cf-connecting-ip")
	if (!ip) return failure(400)
	if (!(await env.IP_LIMITER.limit({ key: ip })).success) return failure(429)
	if (!(await env.GLOBAL_LIMITER.limit({ key: "all" })).success) return failure(429)
	return null
}

type Config = ContactConfig & { confirmSecret: string }

function configOf(env: Env): Config | null {
	const { RESEND_API_KEY: apiKey, RESEND_SEGMENT_ID: segmentId, RESEND_TOPIC_ID: topicId, CONSENT_VERSION: consentVersion } = env
	const confirmSecret = env.CONFIRM_SECRET ?? ""
	if (!apiKey || !segmentId || !topicId || !consentVersion || confirmSecret.length < MIN_SECRET_LENGTH) return null
	return { apiKey, segmentId, topicId, consentVersion, confirmSecret }
}

function settle(outcome: Outcome, ok: () => Response): Response {
	if (outcome.kind === "ok") return ok()
	console.error("subscribe: upstream refused", outcome)
	return failure(outcome.kind === "unavailable" ? 503 : 502)
}

async function subscribe(up: Upstream, request: Request, env: Env, fields: Fields): Promise<Response> {
	// Before validation, so a bot learns nothing from what it typed into the decoy.
	if (fields.honeypot !== "") return success(request)
	const email = fields.email === null ? null : normalizeEmail(fields.email)
	if (!email) return failure(400)
	const config = configOf(env)
	if (!config) return failure(503)
	const token = await signToken(config.confirmSecret, email, up.now())
	const key = await sendKey(config.confirmSecret, email)
	return settle(await requestConfirmation(up, config, email, confirmationEmail(token), key), () => success(request))
}

// Every token that does not verify gets the same 400, so a caller cannot tell expired from forged.
async function confirm(up: Upstream, _request: Request, env: Env, fields: Fields): Promise<Response> {
	const config = configOf(env)
	if (!config) return failure(503)
	const email = fields.token === null ? null : await readToken(config.confirmSecret, fields.token, up.now())
	if (!email) return failure(400)
	return settle(await addContact(up, config, email), okJson)
}

const ROUTES = new Map([
	[SUBSCRIBE_PATH, subscribe],
	[CONFIRM_PATH, confirm],
])

async function handle(up: Upstream, request: Request, env: Env): Promise<Response> {
	const route = ROUTES.get(new URL(request.url).pathname)
	if (!route) return failure(404)
	const refusal = await admit(request, env)
	if (refusal) return refusal
	const bytes = await readCapped(request.body, BODY_CAP_BYTES)
	if (bytes === "too-large") return failure(413)
	const fields = bytes === "malformed" ? null : parseFields(request.headers.get("content-type"), bytes)
	if (!fields) return failure(400)
	return route(up, request, env, fields)
}

export function createHandler(up: Upstream): (request: Request, env: Env) => Promise<Response> {
	return async (request, env) => {
		// The kill switch: nothing is read, counted or called while it is on.
		if (env.SUBSCRIBE_OFF === "1") return failure(503)
		try {
			return await handle(up, request, env)
		} catch (error) {
			// The name only: a parser's message can quote the body it refused.
			console.error("subscribe: unexpected failure", { error: error instanceof Error ? error.name : typeof error })
			return failure(503)
		}
	}
}

export default {
	fetch: createHandler({
		fetch: (input, init) => fetch(input, init),
		sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
		now: () => Date.now(),
		timeoutMs: 5000,
	}),
}
