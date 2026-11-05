// The confirmation link's token: `<payload>.<mac>`, both unpadded base64url. The payload names the
// address and the submission time; the MAC covers the encoded payload string, so a re-encoding of
// the same bytes fails it. Nothing is stored: the token is the whole pending signup.

import { normalizeEmail } from "./email"

export const TOKEN_TTL_MS = 24 * 60 * 60 * 1000
/** Clock skew tolerated between the Worker that signed a token and the one reading it. */
const MAX_SKEW_MS = 5 * 60 * 1000
export const MAX_TOKEN_LENGTH = 1024

const encoder = new TextEncoder()

export function toBase64Url(bytes: Uint8Array): string {
	let binary = ""
	for (const byte of bytes) binary += String.fromCharCode(byte)
	return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
	if (!/^[A-Za-z0-9_-]+$/.test(text)) return null
	try {
		return Uint8Array.from(atob(text.replaceAll("-", "+").replaceAll("_", "/")), (c) => c.charCodeAt(0))
	} catch {
		return null
	}
}

function hmacKey(secret: string): Promise<CryptoKey> {
	return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"])
}

// Each use signs under its own label, so a token's MAC can never serve as a send key or the reverse.
const labelled = (label: "token" | "send", data: string) => encoder.encode(`${label}\n${data}`)

async function sign(secret: string, label: "token" | "send", data: string): Promise<string> {
	return toBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret), labelled(label, data))))
}

export async function signToken(secret: string, email: string, submittedAt: number): Promise<string> {
	const payload = toBase64Url(encoder.encode(JSON.stringify({ e: email, t: submittedAt })))
	return `${payload}.${await sign(secret, "token", payload)}`
}

function claimsOf(payload: string): { e: string; t: number } | null {
	const bytes = fromBase64Url(payload)
	if (!bytes) return null
	let parsed: unknown
	try {
		parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes))
	} catch {
		return null
	}
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null
	const { e, t } = parsed as Record<string, unknown>
	return typeof e === "string" && typeof t === "number" && Number.isSafeInteger(t) ? { e, t } : null
}

/**
 * The address a token confirms, or `null` for any token that is over-long, malformed, forged,
 * expired or dated ahead of `now`. Callers answer every `null` alike, so nobody learns which.
 */
export async function readToken(secret: string, token: string, now: number): Promise<string | null> {
	if (token.length > MAX_TOKEN_LENGTH) return null
	const parts = token.split(".")
	if (parts.length !== 2) return null
	const [payload, mac] = parts as [string, string]
	const signature = fromBase64Url(mac)
	if (!signature) return null
	// WebCrypto's verify compares in constant time; the payload is parsed only once it is authentic.
	const authentic = await crypto.subtle.verify("HMAC", await hmacKey(secret), signature, labelled("token", payload)).catch(() => false)
	const claims = authentic ? claimsOf(payload) : null
	if (!claims || normalizeEmail(claims.e) !== claims.e) return null
	if (claims.t - now > MAX_SKEW_MS || now - claims.t > TOKEN_TTL_MS) return null
	return claims.e
}

/**
 * Resend's `Idempotency-Key` for the confirmation email: one per exact address and secret, so a repeat
 * inside Resend's 24 h window sends nothing. Opaque, so the key never shows the address.
 */
export async function sendKey(secret: string, email: string): Promise<string> {
	return `confirm/${await sign(secret, "send", email)}`
}
