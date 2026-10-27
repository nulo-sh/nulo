// The key-holding half of the nulo.sh signup. It is reachable only through nulo-landing's service
// binding, holds a full-access Resend key, and answers every outcome in a form that reveals
// neither whether an address was already on the list nor anything Resend said.

import { BODY_CAP_BYTES, parseFields, readCapped } from "./body"
import { normalizeEmail } from "./email"
import { addContact, type ContactConfig, type Upstream } from "./resend"
import { failure, success } from "./respond"

export const ALLOWED_ORIGIN = "https://nulo.sh"

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

function configOf(env: Env): ContactConfig | null {
	const { RESEND_API_KEY: apiKey, RESEND_SEGMENT_ID: segmentId, RESEND_TOPIC_ID: topicId, CONSENT_VERSION: consentVersion } = env
	if (!apiKey || !segmentId || !topicId || !consentVersion) return null
	return { apiKey, segmentId, topicId, consentVersion }
}

async function handle(up: Upstream, request: Request, env: Env): Promise<Response> {
	const refusal = await admit(request, env)
	if (refusal) return refusal
	const bytes = await readCapped(request.body, BODY_CAP_BYTES)
	if (bytes === "too-large") return failure(413)
	const fields = bytes === "malformed" ? null : parseFields(request.headers.get("content-type"), bytes)
	if (!fields) return failure(400)
	// Before validation, so a bot learns nothing from what it typed into the decoy.
	if (fields.honeypot !== "") return success(request)
	const email = fields.email === null ? null : normalizeEmail(fields.email)
	if (!email) return failure(400)
	const config = configOf(env)
	if (!config) return failure(503)
	const outcome = await addContact(up, config, email)
	if (outcome.kind === "ok") return success(request)
	console.error("subscribe: upstream refused", outcome)
	return failure(outcome.kind === "unavailable" ? 503 : 502)
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
