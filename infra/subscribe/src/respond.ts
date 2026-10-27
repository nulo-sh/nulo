// A response this Worker generates never passes through nulo-landing's `_headers`, so it carries
// its own policy, the landing's framing and transport rules included.
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
	"cache-control": "no-store",
	"content-security-policy": "default-src 'none'; frame-ancestors 'none'",
	"cross-origin-resource-policy": "same-origin",
	"referrer-policy": "no-referrer",
	"strict-transport-security": "max-age=63072000; includeSubDomains; preload",
	"x-content-type-options": "nosniff",
	"x-frame-options": "DENY",
}

export const SUCCESS_PATH = "/subscribed"

function respond(status: number, body: string | null, extra: Record<string, string> = {}): Response {
	return new Response(body, { status, headers: { ...SECURITY_HEADERS, ...extra } })
}

/** Every refusal has the same body: the status is the whole answer, never upstream text. */
export function failure(status: number, extra: Record<string, string> = {}): Response {
	return respond(status, '{"ok":false}', { "content-type": "application/json", ...extra })
}

function wantsJson(request: Request): boolean {
	return (request.headers.get("accept") ?? "").includes("application/json") || request.headers.get("sec-fetch-mode") === "cors"
}

/**
 * The one success answer, whatever happened upstream: a new address, a known one and a filled
 * honeypot are indistinguishable by status, headers and body. A plain form post is sent on to the
 * static confirmation page.
 */
export function success(request: Request): Response {
	if (wantsJson(request)) return respond(200, '{"ok":true}', { "content-type": "application/json" })
	return respond(303, null, { location: SUCCESS_PATH })
}
