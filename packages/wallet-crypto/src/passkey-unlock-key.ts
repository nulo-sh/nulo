/**
 * A passkey profile's unlock key: the key its slots and DEK are sealed under, rebuilt at every
 * unlock from the passkey's PRF output for the profile's own `prfSalt`.
 *
 * `prfSalt` is 32 random bytes per profile, stored plaintext on the row. It is both the PRF input
 * the passkey evaluates and the HKDF salt here, so two profiles never share an unlock key even on
 * one passkey. No profile or credential id enters the derivation: the random salt separates
 * profiles, and the envelope MAC binds the row's id.
 */

/** Byte length of a PRF output and of a `prfSalt`. */
export const PRF_BYTES = 32

const PASSKEY_UNLOCK_INFO = new TextEncoder().encode("nulo:passkey-unlock:v1")

/** A fresh `prfSalt` (CSPRNG). */
export function newPrfSalt(): Uint8Array<ArrayBuffer> {
	return globalThis.crypto.getRandomValues(new Uint8Array(PRF_BYTES))
}

/** HKDF-SHA256(ikm = PRF output, salt = `prfSalt`, info `nulo:passkey-unlock:v1`) into a
 *  non-extractable AES-256-GCM key. Throws when either input is not 32 bytes: a short PRF result
 *  never yields a key. The caller owns and zeroes `prf`. */
export async function derivePasskeyUnlockKey(prf: Uint8Array<ArrayBuffer>, prfSalt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
	if (prf.byteLength !== PRF_BYTES) throw new Error("Invalid passkey PRF output length")
	if (prfSalt.byteLength !== PRF_BYTES) throw new Error("Invalid passkey PRF salt length")
	const base = await globalThis.crypto.subtle.importKey("raw", prf, "HKDF", false, ["deriveKey"])
	return globalThis.crypto.subtle.deriveKey(
		{ name: "HKDF", hash: "SHA-256", salt: prfSalt, info: PASSKEY_UNLOCK_INFO },
		base,
		{ name: "AES-GCM", length: 256 },
		false,
		["encrypt", "decrypt"],
	)
}
