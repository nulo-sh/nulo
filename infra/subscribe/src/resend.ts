import type { Message } from "./confirmation"

export const RESEND_API = "https://api.resend.com"

const DEFAULT_RETRY_WAIT_MS = 1000
const MAX_RETRY_WAIT_MS = 2000

/** What the handler needs from the runtime, injected so tests fake Resend and the clock. */
export type Upstream = {
	fetch: (input: string, init: RequestInit) => Promise<Response>
	sleep: (ms: number) => Promise<void>
	now: () => number
	timeoutMs: number
}

export type ContactConfig = { apiKey: string; segmentId: string; topicId: string; consentVersion: string }

type Stage = "lookup" | "create" | "recheck" | "mirror" | "send"

export type Outcome = { kind: "ok" } | { kind: "unavailable"; stage: Stage } | { kind: "failed"; stage: Stage; status: number }

class Unavailable extends Error {}

/**
 * The two 409s Resend gives a send whose `Idempotency-Key` it already holds: sent (or refused) with
 * another body inside 24 h, or still in flight. Any other 409 proves nothing.
 */
const KEY_CONFLICTS = new Set(["invalid_idempotent_request", "concurrent_idempotent_requests"])

type Reply = { status: number; keyConflict: boolean }

/** `retry-after` as delta-seconds or an HTTP date, clamped to [0, 2 s]; absent or unreadable is 1 s. */
export function retryWaitMs(header: string | null, now: number): number {
	const value = header?.trim() ?? ""
	let ms = DEFAULT_RETRY_WAIT_MS
	if (/^\d+$/.test(value)) ms = Number(value) * 1000
	else if (value !== "" && !Number.isNaN(Date.parse(value))) ms = Date.parse(value) - now
	return Math.min(Math.max(ms, 0), MAX_RETRY_WAIT_MS)
}

function headersFor(config: ContactConfig, json: boolean, extra: Record<string, string>): Record<string, string> {
	return {
		accept: "application/json",
		authorization: `Bearer ${config.apiKey}`,
		// Resend refuses a request without a User-Agent with a 403.
		"user-agent": "nulo-subscribe",
		...(json ? { "content-type": "application/json" } : {}),
		...extra,
	}
}

/** Whether a 409's body names a key conflict; the body is read for that one name and dropped. */
async function isKeyConflict(response: Response): Promise<boolean> {
	const name = await response.json().then(
		(body: unknown) => (typeof body === "object" && body !== null ? (body as { name?: unknown }).name : undefined),
		() => undefined,
	)
	return typeof name === "string" && KEY_CONFLICTS.has(name)
}

/**
 * One request with a bounded wait, retried once (same headers, same body) on 429 or 5xx. Only the
 * status, and for a 409 whether it is a key conflict, leave this function.
 */
async function call(
	up: Upstream,
	config: ContactConfig,
	method: "GET" | "POST",
	path: string,
	body?: string,
	extra: Record<string, string> = {},
): Promise<Reply> {
	for (let attempt = 1; ; attempt++) {
		let response: Response
		try {
			// `manual`: Workers forward `Authorization` across a redirect to another host.
			const init: RequestInit = {
				method,
				headers: headersFor(config, body !== undefined, extra),
				body,
				redirect: "manual",
				signal: AbortSignal.timeout(up.timeoutMs),
			}
			response = await up.fetch(`${RESEND_API}${path}`, init)
		} catch {
			throw new Unavailable()
		}
		if (response.status === 409) return { status: 409, keyConflict: await isKeyConflict(response) }
		await response.body?.cancel().catch(() => {})
		if (response.status !== 429 && response.status < 500) return { status: response.status, keyConflict: false }
		if (attempt === 2) throw new Unavailable()
		await up.sleep(retryWaitMs(response.headers.get("retry-after"), up.now()))
	}
}

const isOk = (status: number) => status >= 200 && status < 300

function createBody(config: ContactConfig, email: string, now: number): string {
	return JSON.stringify({
		email,
		unsubscribed: false,
		segments: [{ id: config.segmentId }],
		topics: [{ id: config.topicId, subscription: "opt_in" }],
		properties: { source: "landing", consent_version: config.consentVersion, consented_at: new Date(now).toISOString() },
	})
}

// The SDK's own form: the address is the path segment, which `normalizeEmail` keeps URL-inert.
const contactPath = (email: string) => `/contacts/${email}`

type Progress = { stage: Stage }

/**
 * `"new"` for an address Resend does not hold; otherwise the outcome for a known one, which is never
 * written to. A new address costs a second round trip (its write), which can also fail on Resend's
 * shared rate limit; a known address makes a second read in its place, so neither its timing nor a
 * team-wide refusal tells the two apart.
 */
async function lookUp(up: Upstream, config: ContactConfig, email: string, progress: Progress): Promise<Outcome | "new"> {
	progress.stage = "lookup"
	const found = await call(up, config, "GET", contactPath(email))
	if (found.status === 404) return "new"
	if (!isOk(found.status)) return { kind: "failed", stage: "lookup", status: found.status }
	progress.stage = "mirror"
	const again = await call(up, config, "GET", contactPath(email))
	return isOk(again.status) ? { kind: "ok" } : { kind: "failed", stage: "mirror", status: again.status }
}

async function guarded(progress: Progress, steps: () => Promise<Outcome>): Promise<Outcome> {
	try {
		return await steps()
	} catch {
		return { kind: "unavailable", stage: progress.stage }
	}
}

/**
 * Adds a new address to the list and leaves a known one exactly as it is: an address that exists
 * in any state (subscribed, unsubscribed, opted out of the topic) is never written, so a withdrawal
 * can never be undone by a later confirmation.
 */
export async function addContact(up: Upstream, config: ContactConfig, email: string): Promise<Outcome> {
	const progress: Progress = { stage: "lookup" }
	return guarded(progress, async () => {
		const known = await lookUp(up, config, email, progress)
		if (known !== "new") return known
		progress.stage = "create"
		const created = await call(up, config, "POST", "/contacts", createBody(config, email, up.now()))
		if (isOk(created.status)) return { kind: "ok" }
		if (created.status < 400) return { kind: "failed", stage: "create", status: created.status }
		// Whatever 4xx Resend answers a duplicate create with, a concurrent first confirmation of the
		// same address may have won: if the contact exists now, this one succeeded too.
		progress.stage = "recheck"
		if (isOk((await call(up, config, "GET", contactPath(email))).status)) return { kind: "ok" }
		return { kind: "failed", stage: "create", status: created.status }
	})
}

/**
 * Sends the confirmation email to a new address; a known address gets no email and no write. A key
 * conflict counts as sent: a send under this key was accepted inside Resend's 24 h window, or is in
 * flight, and sending again is exactly what the key exists to refuse.
 */
export async function requestConfirmation(
	up: Upstream,
	config: ContactConfig,
	email: string,
	message: Message,
	key: string,
): Promise<Outcome> {
	const progress: Progress = { stage: "lookup" }
	return guarded(progress, async () => {
		const known = await lookUp(up, config, email, progress)
		if (known !== "new") return known
		progress.stage = "send"
		const sent = await call(up, config, "POST", "/emails", JSON.stringify({ ...message, to: email }), { "idempotency-key": key })
		if (isOk(sent.status) || sent.keyConflict) return { kind: "ok" }
		return { kind: "failed", stage: "send", status: sent.status }
	})
}
