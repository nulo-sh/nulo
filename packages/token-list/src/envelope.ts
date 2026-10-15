/**
 * The `nulo-token-list-envelope/1` wire format: a signed, opaque payload. WebCrypto only, and no
 * import outside this package, so `sign-cli.ts` runs with `bun --no-install` (pinned by
 * `import-closure.test.ts`).
 *
 * The signature covers `DOMAIN_PREFIX` followed by the exact payload bytes, so a signature made for
 * any other Nulo purpose with the same key can never verify here, and the payload is verified
 * before a single byte of it is parsed.
 */

export const ENVELOPE_FORMAT = "nulo-token-list-envelope/1"
export const PAYLOAD_FORMAT = "nulo-token-list/1"
export const DOMAIN_PREFIX = `${PAYLOAD_FORMAT}\n`
/** Upper bound on the envelope's UTF-8 size, enforced before `JSON.parse` sees it. */
export const MAX_ENVELOPE_BYTES = 64 * 1024

const KEY_ID = /^[a-z0-9][a-z0-9-]{0,31}$/
const BASE64URL = /^[A-Za-z0-9_-]*$/
const ED25519_SIGNATURE_BYTES = 64
const ED25519_KEY_BYTES = 32
/** RFC 8410 PKCS#8 wrapper for a bare 32-byte Ed25519 seed; WebCrypto imports no raw private key. */
const PKCS8_ED25519_PREFIX = Uint8Array.from([
	0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20,
])

export type Envelope = { format: typeof ENVELOPE_FORMAT; keyId: string; payload: string; signature: string }
export type PinnedKey = { keyId: string; publicKey: string }

export type EnvelopeRefusal = "oversize" | "malformed-envelope" | "unknown-key" | "bad-key" | "bad-signature" | "verify-unsupported"

/** A refused envelope. `reason` is a fixed category, safe to log; nothing from the bytes is kept. */
export class EnvelopeError extends Error {
	constructor(readonly reason: EnvelopeRefusal) {
		super(`token list envelope refused: ${reason}`)
		this.name = "EnvelopeError"
	}
}

/** Unpadded base64url, the only spelling the format admits. */
export function encodeBase64Url(bytes: Uint8Array): string {
	let binary = ""
	for (const byte of bytes) binary += String.fromCharCode(byte)
	return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")
}

/** Decodes canonical unpadded base64url, or returns `undefined`: one value has exactly one spelling. */
export function decodeBase64Url(text: string): Uint8Array<ArrayBuffer> | undefined {
	if (!BASE64URL.test(text) || text.length % 4 === 1) return undefined
	const padded = text.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - (text.length % 4)) % 4)
	let binary: string
	try {
		binary = atob(padded)
	} catch {
		return undefined
	}
	const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
	return encodeBase64Url(bytes) === text ? bytes : undefined
}

/** The exact bytes a signature covers. */
export function signedMessage(payload: Uint8Array): Uint8Array<ArrayBuffer> {
	const prefix = new TextEncoder().encode(DOMAIN_PREFIX)
	const message = new Uint8Array(prefix.length + payload.length)
	message.set(prefix)
	message.set(payload, prefix.length)
	return message
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> | undefined {
	if (!/^[0-9a-f]*$/.test(hex) || hex.length % 2 !== 0) return undefined
	return Uint8Array.from({ length: hex.length / 2 }, (_, i) => Number.parseInt(hex.slice(2 * i, 2 * i + 2), 16))
}

/** Imports a 32-byte Ed25519 seed given as 64 lower-case hex digits, `0x`-prefixed or bare (the
 *  1Password `generate hex32` form). The error never echoes the value. */
export async function importSeed(seedHex: string): Promise<CryptoKey> {
	const seed = hexToBytes(seedHex.startsWith("0x") ? seedHex.slice(2) : seedHex)
	if (seed?.length !== ED25519_KEY_BYTES) throw new Error("signing seed must be 64 lower-case hex digits")
	const pkcs8 = new Uint8Array(PKCS8_ED25519_PREFIX.length + seed.length)
	pkcs8.set(PKCS8_ED25519_PREFIX)
	pkcs8.set(seed, PKCS8_ED25519_PREFIX.length)
	try {
		return await crypto.subtle.importKey("pkcs8", pkcs8, { name: "Ed25519" }, true, ["sign"])
	} finally {
		seed.fill(0)
		pkcs8.fill(0)
	}
}

/** The base64url raw public key of an extractable Ed25519 private key. */
export async function publicKeyOf(privateKey: CryptoKey): Promise<string> {
	const jwk = await crypto.subtle.exportKey("jwk", privateKey)
	if (typeof jwk.x !== "string" || decodeBase64Url(jwk.x)?.length !== ED25519_KEY_BYTES) {
		throw new Error("could not derive the Ed25519 public key")
	}
	return jwk.x
}

/** Signs `payload` and returns the envelope. The caller serializes it. */
export async function signEnvelope(payload: Uint8Array, privateKey: CryptoKey, keyId: string): Promise<Envelope> {
	if (!KEY_ID.test(keyId)) throw new Error("keyId must match [a-z0-9][a-z0-9-]{0,31}")
	const signature = new Uint8Array(await crypto.subtle.sign({ name: "Ed25519" }, privateKey, signedMessage(payload)))
	return { format: ENVELOPE_FORMAT, keyId, payload: encodeBase64Url(payload), signature: encodeBase64Url(signature) }
}

function readEnvelope(text: string): Envelope {
	if (new TextEncoder().encode(text).length > MAX_ENVELOPE_BYTES) throw new EnvelopeError("oversize")
	let value: unknown
	try {
		value = JSON.parse(text)
	} catch {
		throw new EnvelopeError("malformed-envelope")
	}
	if (typeof value !== "object" || value === null || Array.isArray(value)) throw new EnvelopeError("malformed-envelope")
	const { format, keyId, payload, signature } = value as Record<string, unknown>
	const wellFormed =
		format === ENVELOPE_FORMAT && typeof keyId === "string" && typeof payload === "string" && typeof signature === "string"
	if (!wellFormed || !KEY_ID.test(keyId)) throw new EnvelopeError("malformed-envelope")
	return { format, keyId, payload, signature }
}

async function importPublicKey(publicKey: string): Promise<CryptoKey> {
	const raw = decodeBase64Url(publicKey)
	if (raw?.length !== ED25519_KEY_BYTES) throw new EnvelopeError("bad-key")
	try {
		return await crypto.subtle.importKey("raw", raw, { name: "Ed25519" }, false, ["verify"])
	} catch (error) {
		throw new EnvelopeError(isUnsupported(error) ? "verify-unsupported" : "bad-key")
	}
}

function isUnsupported(error: unknown): boolean {
	return error instanceof Error && error.name === "NotSupportedError"
}

/**
 * Verifies an envelope against the pinned keys and returns its payload bytes, unparsed. Throws an
 * `EnvelopeError` for every refusal: oversize, malformed, an unpinned `keyId`, a bad signature, or
 * a runtime without Ed25519 (`verify-unsupported`, so a caller can back off instead of retrying).
 */
export async function verifyEnvelope(
	text: string,
	keys: readonly PinnedKey[],
): Promise<{ keyId: string; payload: Uint8Array<ArrayBuffer> }> {
	const envelope = readEnvelope(text)
	const pinned = keys.find((key) => key.keyId === envelope.keyId)
	if (!pinned) throw new EnvelopeError("unknown-key")
	const payload = decodeBase64Url(envelope.payload)
	const signature = decodeBase64Url(envelope.signature)
	if (!payload || signature?.length !== ED25519_SIGNATURE_BYTES) throw new EnvelopeError("malformed-envelope")
	const key = await importPublicKey(pinned.publicKey)
	let valid: boolean
	try {
		valid = await crypto.subtle.verify({ name: "Ed25519" }, key, signature, signedMessage(payload))
	} catch (error) {
		throw new EnvelopeError(isUnsupported(error) ? "verify-unsupported" : "bad-signature")
	}
	if (!valid) throw new EnvelopeError("bad-signature")
	return { keyId: envelope.keyId, payload }
}
