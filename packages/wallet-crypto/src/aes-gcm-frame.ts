/**
 * The AES-256-GCM frame every row box in this package writes: base64
 * `version(1)=1 ‖ iv(12) ‖ ciphertext ‖ tag(16)`, with a fresh CSPRNG 96-bit IV per seal (one
 * repeated (key, IV) pair leaks both plaintexts' XOR and the GHASH subkey). The leading byte is
 * the framing version, orthogonal to any KDF label the caller binds. The frame bytes are pinned
 * by key-vectors.test.ts against node:crypto references: every stored box is in this form.
 *
 * Uses `globalThis.crypto` for the same cross-env reason as `mnemonic-master.ts`.
 */
import { fromBase64, toBase64 } from "@nulo/wallet-core/utils"
import { zeroize } from "./zeroize"

const FRAME_VERSION = 1
const IV_LENGTH = 12
const HEADER_LENGTH = 1 + IV_LENGTH

const gcmParams = (iv: Uint8Array<ArrayBuffer>, aad: Uint8Array<ArrayBuffer> | undefined): AesGcmParams =>
	aad ? { name: "AES-GCM", iv, additionalData: aad } : { name: "AES-GCM", iv }

/** Seal `plaintext` under `key`, binding `aad` when given. Returns the base64 frame. */
export async function sealFrame(key: CryptoKey, plaintext: Uint8Array<ArrayBuffer>, aad?: Uint8Array<ArrayBuffer>): Promise<string> {
	const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_LENGTH))
	const ct = new Uint8Array(await globalThis.crypto.subtle.encrypt(gcmParams(iv, aad), key, plaintext))
	const out = new Uint8Array(HEADER_LENGTH + ct.length)
	out[0] = FRAME_VERSION
	out.set(iv, 1)
	out.set(ct, HEADER_LENGTH)
	return toBase64(out)
}

/** Open a base64 frame. Throws on malformed base64, an unknown version, a short frame, a wrong
 *  key, a different `aad` or any corruption (GCM authentication). Caller owns + zeroes the result. */
export async function openFrame(key: CryptoKey, frame: string, aad?: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
	const bytes = fromBase64(frame)
	try {
		if (bytes.length < HEADER_LENGTH || bytes[0] !== FRAME_VERSION) throw new Error("Invalid AES-GCM frame")
		const iv = bytes.slice(1, HEADER_LENGTH)
		const ct = bytes.subarray(HEADER_LENGTH)
		return new Uint8Array(await globalThis.crypto.subtle.decrypt(gcmParams(iv, aad), key, ct)) as Uint8Array<ArrayBuffer>
	} finally {
		// Wipe the decoded frame on every path: a wrong key or a transplant is the common
		// adversarial case, and it throws.
		zeroize(bytes)
	}
}
