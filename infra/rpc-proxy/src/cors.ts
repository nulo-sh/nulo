import type { HeaderMap } from "./respond"

// Shapes, not ids: an unpacked Chrome build gets its own 32 letters a-p, and Firefox a UUID per install.
const EXTENSION_ORIGIN = /^(chrome-extension:\/\/[a-p]{32}|moz-extension:\/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/

/**
 * The CORS headers every later answer carries (none without an Origin), or `null` to refuse. A web
 * page's simple POST reaches the server unpreflighted, so the refusal happens here, not in the
 * browser; a caller without an Origin could forge one, and is left to the limiter.
 */
export function originVerdict(origin: string | null): HeaderMap | null {
	if (origin === null) return {}
	if (!EXTENSION_ORIGIN.test(origin)) return null
	return { "access-control-allow-origin": origin, vary: "Origin" }
}

export const PREFLIGHT: HeaderMap = {
	"access-control-allow-methods": "POST",
	"access-control-allow-headers": "content-type",
	"access-control-max-age": "7200",
}
