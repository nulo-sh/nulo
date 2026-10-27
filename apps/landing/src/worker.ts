/**
 * The `nulo-landing` Worker. `run_worker_first` sends it `/api/*` only; every other path is the
 * static assets. It holds no secret: the subscribe Worker behind the `SUBSCRIBE` service binding
 * owns the mailing-list key and checks the request's `Origin`, so the request is passed on as
 * received, headers and body untouched.
 */

export interface Env {
	/** Absent under a local dev server that runs without the subscribe Worker. */
	SUBSCRIBE?: { fetch(request: Request): Promise<Response> }
}

// Nothing here inherits `public/_headers`, which Cloudflare applies to static assets only.
export const OWN_HEADERS: Readonly<Record<string, string>> = {
	"cache-control": "no-store",
	"x-content-type-options": "nosniff",
	"referrer-policy": "no-referrer",
	"content-security-policy": "default-src 'none'",
}

function own(status: number, extra: Record<string, string> = {}): Response {
	return new Response(null, { status, headers: { ...OWN_HEADERS, ...extra } })
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		if (new URL(request.url).pathname !== "/api/subscribe") return own(404)
		if (request.method !== "POST") return own(405, { allow: "POST" })
		if (!env.SUBSCRIBE) return own(503)
		try {
			return await env.SUBSCRIBE.fetch(request)
		} catch {
			return own(503)
		}
	},
}
