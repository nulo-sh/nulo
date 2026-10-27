/**
 * Seals the per-profile imported-keys DEK under a CREDENTIAL-derived AES-GCM key — the 4th
 * profile-row slot.
 *
 * The DEK is the HKDF root for imported signing-key rows (`imported-account-key-box`, v2 info).
 * It is deliberately credential-rooted, never master-derived: two profiles created from the same
 * recovery phrase share the master, so any master-rooted key is decryptable by the sibling
 * profile BY CONSTRUCTION — the credential (password / passkey PRF) is the only input that
 * distinguishes them.
 *
 * Wrap-key sources (per profile variant):
 *   password: `EncryptionKey.fromPasshash(...)` sealing via its own `encrypt(payload, DEK_AAD)`
 *             (the audited PBKDF2 + AES-GCM path — no new crypto for that branch);
 *   passkey:  the profile's passkey unlock key (`passkey-unlock-key.ts`), sealed with the
 *             functions in THIS module.
 *
 * Envelope (this module): the base64 `aes-gcm-frame`, AAD = `DEK_AAD` — a wrong
 * wrap key (another profile's unlock key), a slot transplant, or corruption all fail AES-GCM
 * authentication closed. Uses `globalThis.crypto` for the same cross-env reason as
 * `mnemonic-master.ts`.
 */
import { openFrame, sealFrame } from "./aes-gcm-frame"
import { asImportedKeysDek, type ImportedKeysDek } from "./secret-types"
import { zeroize } from "./zeroize"

/** Purpose-AAD for the sealed DEK slot — shared by BOTH wrap paths (EncryptionKey for password
 *  profiles, the CryptoKey functions below for passkey profiles) so the slot can never be
 *  satisfied by a ciphertext minted for another purpose. Byte-frozen once profiles exist. */
export const IMPORTED_DEK_AAD = new TextEncoder().encode("nulo:profile-imported-dek:v1") as Uint8Array<ArrayBuffer>

export const IMPORTED_KEYS_DEK_LEN = 32

/** Mint a fresh random DEK (CSPRNG, full 256-bit). */
export function generateImportedKeysDek(): ImportedKeysDek {
	return asImportedKeysDek(globalThis.crypto.getRandomValues(new Uint8Array(IMPORTED_KEYS_DEK_LEN)))
}

/** Seal a DEK under an AES-GCM wrap key (a passkey profile's unlock key).
 *  Caller owns + zeroes `dek`. */
export async function sealDekUnderWrapKey(wrapKey: CryptoKey, dek: ImportedKeysDek): Promise<string> {
	return sealFrame(wrapKey, dek, IMPORTED_DEK_AAD)
}

/** Unseal a DEK. Throws on wrong wrap key / transplant / corruption (AES-GCM authentication) and
 *  on a wrong-length plaintext. Caller owns + zeroes the returned buffer. */
export async function unsealDekUnderWrapKey(wrapKey: CryptoKey, sealed: string): Promise<ImportedKeysDek> {
	const pt = await openFrame(wrapKey, sealed, IMPORTED_DEK_AAD)
	if (pt.length !== IMPORTED_KEYS_DEK_LEN) {
		zeroize(pt)
		throw new Error("Invalid imported-dek length")
	}
	return asImportedKeysDek(pt)
}
