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

type Stage = "lookup" | "create" | "recheck" | "mirror"

export type Outcome = { kind: "ok" } | { kind: "unavailable"; stage: Stage } | { kind: "failed"; stage: Stage; status: number }

class Unavailable extends Error {}

/** `retry-after` as delta-seconds or an HTTP date, clamped to [0, 2 s]; absent or unreadable is 1 s. */
export function retryWaitMs(header: string | null, now: number): number {
	const value = header?.trim() ?? ""
	let ms = DEFAULT_RETRY_WAIT_MS
	if (/^\d+$/.test(value)) ms = Number(value) * 1000
	else if (value !== "" && !Number.isNaN(Date.parse(value))) ms = Date.parse(value) - now
	return Math.min(Math.max(ms, 0), MAX_RETRY_WAIT_MS)
}

function headersFor(config: ContactConfig, json: boolean): Record<string, string> {
	return {
		accept: "application/json",
		authorization: `Bearer ${config.apiKey}`,
		// Resend refuses a request without a User-Agent with a 403.
		"user-agent": "nulo-subscribe",
		...(json ? { "content-type": "application/json" } : {}),
	}
}

/** One request with a bounded wait, retried once on 429 or 5xx. Only the status leaves this function. */
async function call(up: Upstream, config: ContactConfig, method: "GET" | "POST", path: string, body?: string): Promise<number> {
	for (let attempt = 1; ; attempt++) {
		let response: Response
		try {
			// `manual`: Workers forward `Authorization` across a redirect to another host.
			const init: RequestInit = {
				method,
				headers: headersFor(config, body !== undefined),
				body,
				redirect: "manual",
				signal: AbortSignal.timeout(up.timeoutMs),
			}
			response = await up.fetch(`${RESEND_API}${path}`, init)
		} catch {
			throw new Unavailable()
		}
		await response.body?.cancel().catch(() => {})
		if (response.status !== 429 && response.status < 500) return response.status
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

/**
 * Adds a new address to the list and leaves a known one exactly as it is: an address that exists
 * in any state (subscribed, unsubscribed, opted out of the topic) is never written, so a withdrawal
 * can never be undone by a later submission.
 */
export async function addContact(up: Upstream, config: ContactConfig, email: string): Promise<Outcome> {
	// The SDK's own form: the address is the path segment, which `normalizeEmail` keeps URL-inert.
	const path = `/contacts/${email}`
	let stage: Stage = "lookup"
	try {
		const found = await call(up, config, "GET", path)
		if (isOk(found)) {
			// A new address costs a second round trip, the create, which can also fail on Resend's shared
			// rate limit. A known address makes a second read in its place, so neither its timing nor an
			// upstream refusal an attacker induces tells the two apart.
			stage = "mirror"
			await call(up, config, "GET", path)
			return { kind: "ok" }
		}
		if (found !== 404) return { kind: "failed", stage, status: found }
		stage = "create"
		const created = await call(up, config, "POST", "/contacts", createBody(config, email, up.now()))
		if (isOk(created)) return { kind: "ok" }
		// Whatever Resend answers a duplicate create with, a concurrent first submission of the same
		// address may have won: if the contact exists now, this submission succeeded too.
		stage = "recheck"
		if (isOk(await call(up, config, "GET", path))) return { kind: "ok" }
		return { kind: "failed", stage: "create", status: created }
	} catch {
		return { kind: "unavailable", stage }
	}
}
