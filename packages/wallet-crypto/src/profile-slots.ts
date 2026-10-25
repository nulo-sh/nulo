// Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0.
/**
 * The three sealed slots a profile row carries, `guard`, `secret` (the master) and `entropy`, sealed
 * under the row's unlock: PBKDF2 frames under a password (`PasswordSecretBox`), AES-GCM frames under
 * a passkey's unlock key (`passkey-secret-box`). One format, so both unlocks share the guard check,
 * the purpose AADs and the wrong-key semantics.
 *
 * Opening returns `null`, never a throw, when the key is wrong or a slot was corrupted or moved to
 * another slot. A slot moved between two rows sealed under the same key opens: the words↔master
 * pairing check and the envelope MAC catch that, not this module.
 */

import { array_equals } from "@nulo/wallet-core/utils"
import { asBase64Ciphertext, asMasterSecretBytes, type Base64Ciphertext, type MasterSecretBytes } from "./secret-types"
import { zeroize } from "./zeroize"

/** Fixed-plaintext round-trip check. Sealing encrypts this under the
 *  row's key and persists the ciphertext as `guard`; opening
 *  decrypts `guard` and compares against this constant byte-for-byte.
 *  A mismatch means the supplied credential is wrong. The value itself
 *  doesn't carry secrets — it just has to be stable. Locked by the V2
 *  derivation vector and every profile row on disk. **DO NOT CHANGE.** */
export const ENCRYPTION_GUARD = new Uint8Array([6, 11, 20, 20, 22, 4, 20, 22])

/** AES-GCM additional-authenticated-data purpose tags for the three profile ciphertexts.
 *  Purpose-only ON PURPOSE (no profileId: create/import/restore finalize ids after sealing) —
 *  a ciphertext swapped between the `secret` and `entropy` slots fails authentication instead
 *  of decrypting into the wrong meaning. Byte-frozen once profiles exist. */
export const PROFILE_AAD = {
	guard: new TextEncoder().encode("nulo:profile-guard:v2") as Uint8Array<ArrayBuffer>,
	secret: new TextEncoder().encode("nulo:profile-master:v2") as Uint8Array<ArrayBuffer>,
	entropy: new TextEncoder().encode("nulo:profile-entropy:v1") as Uint8Array<ArrayBuffer>,
} as const

/** Encrypted form of the master secret + its source entropy as persisted on a Profile record.
 *
 *  Fields are base64-encoded. The encoding is FROZEN — the storage-layer
 *  tests pin it. Do not switch to hex / raw bytes without a migration. */
export type EncryptedProfileSecret = {
	/** Base64-encoded ciphertext of `ENCRYPTION_GUARD` under the row's unlock key. On unseal this
	 *  is decrypted first and byte-compared to `ENCRYPTION_GUARD`; a mismatch means the supplied
	 *  credential is wrong. */
	guard: Base64Ciphertext
	/** Base64-encoded ciphertext of the raw 32-byte master secret under
	 *  the same key as `guard` (AAD: PROFILE_AAD.secret). */
	secret: Base64Ciphertext
	/** Base64-encoded ciphertext of the 32-byte BIP-39 entropy behind the recovery phrase,
	 *  under the same key (AAD: PROFILE_AAD.entropy). REQUIRED under the entropy-originated
	 *  model: the master derives one-way from the words, so the words can only be re-displayed
	 *  from stored entropy. */
	entropy: Base64Ciphertext
}

/** One unlock key's way of sealing a slot to base64 and opening it back. `open` throws on a wrong
 *  key, another slot's AAD, corruption or a frame it cannot decode. */
export type SlotCipher = {
	seal(plaintext: Uint8Array<ArrayBuffer>, aad: Uint8Array<ArrayBuffer>): Promise<string>
	open(ciphertext: string, aad: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>>
}

/** Seal GUARD + secret + entropy under `cipher`, each AAD-bound to its purpose. Caller owns and
 *  zeroes `secret` and `entropy`. */
export async function sealProfileSlots(
	cipher: SlotCipher,
	secret: MasterSecretBytes,
	entropy: Uint8Array<ArrayBuffer>,
): Promise<EncryptedProfileSecret> {
	if (entropy.byteLength !== 32) throw new Error("Invalid entropy length")
	return {
		guard: asBase64Ciphertext(await cipher.seal(ENCRYPTION_GUARD as Uint8Array<ArrayBuffer>, PROFILE_AAD.guard)),
		secret: asBase64Ciphertext(await cipher.seal(secret, PROFILE_AAD.secret)),
		entropy: asBase64Ciphertext(await cipher.seal(entropy, PROFILE_AAD.entropy)),
	}
}

/** Open GUARD and verify it, then secret + entropy. `null` on any wrong-key or corrupted-slot
 *  condition. The caller owns and zeroes the returned buffers. */
export async function openProfileSlots(
	cipher: SlotCipher,
	encrypted: EncryptedProfileSecret,
): Promise<{ secret: MasterSecretBytes; entropy: Uint8Array<ArrayBuffer> } | null> {
	const guard = await tryOpen(cipher, encrypted.guard, PROFILE_AAD.guard)
	let secret: Uint8Array<ArrayBuffer> | undefined
	let handedOff = false
	try {
		if (!guard || !array_equals(guard, ENCRYPTION_GUARD)) {
			return null
		}
		secret = await tryOpen(cipher, encrypted.secret, PROFILE_AAD.secret)
		// The guard opened, so the key is right: a null from here on is a corrupted slot or one
		// moved between slots, which the facade reports as "Profile storage corrupted".
		if (!secret) return null
		const entropy = await tryOpen(cipher, encrypted.entropy, PROFILE_AAD.entropy)
		if (!entropy) return null
		handedOff = true
		return { secret: asMasterSecretBytes(secret), entropy }
	} finally {
		// The guard is a known constant, wiped anyway; the master is wiped on every path that does
		// not hand it back, the `!entropy` return and any throw included.
		zeroize(guard)
		if (secret && !handedOff) zeroize(secret)
	}
}

async function tryOpen(cipher: SlotCipher, ciphertext: string, aad: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer> | undefined> {
	try {
		return await cipher.open(ciphertext, aad)
	} catch {
		return undefined
	}
}
