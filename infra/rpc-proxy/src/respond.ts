// Nothing sits in front of this Worker to add headers, so every answer carries its own policy.
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
	"cache-control": "no-store",
	"content-security-policy": "default-src 'none'; frame-ancestors 'none'",
	"cross-origin-resource-policy": "same-origin",
	"permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=(), browsing-topics=()",
	"referrer-policy": "no-referrer",
	"strict-transport-security": "max-age=63072000; includeSubDomains; preload",
	"x-content-type-options": "nosniff",
	"x-frame-options": "DENY",
}

export type HeaderMap = Readonly<Record<string, string>>

/**
 * A local refusal, shaped as a JSON-RPC error: the node client retries a 5xx and any body it cannot
 * parse, and gives up on a 4xx whose body is JSON. The message is fixed text, never caller input.
 */
export function refuse(status: number, code: number, message: string, cors: HeaderMap, extra: HeaderMap = {}): Response {
	const body = JSON.stringify({ jsonrpc: "2.0", id: null, error: { code, message } })
	return new Response(body, { status, headers: { ...SECURITY_HEADERS, ...cors, ...extra, "content-type": "application/json" } })
}
