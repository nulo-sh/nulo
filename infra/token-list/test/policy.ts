// What every response of the token-list host must carry, owned by the tests and hand-written so a
// weakened header in public/_headers moves the implementation without moving the expectation.
export const TOKENS_HOST = "tokens.nulo.sh"
export const LIST_PATH = "/v1/list.json"

export const EXPECTED_HEADERS: Record<string, string> = {
	// Wallets fetch from a background page with no host permission; CORS `*` without credentials is
	// what lets that read succeed, and no cookie exists on this host to leak.
	"access-control-allow-origin": "*",
	"cache-control": "public, max-age=300",
	"x-content-type-options": "nosniff",
	"content-security-policy": "default-src 'none'",
	"strict-transport-security": "max-age=31536000; includeSubDomains",
	"referrer-policy": "no-referrer",
}
