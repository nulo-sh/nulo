// Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0.
/**
 * `PasswordSecretBox` — password-based encryption of the profile master secret.
 *
 * Pure class: no storage writes, no session state, no passkeys, no locking.
 * Seals the profile slot format (`profile-slots.ts`, with its `ENCRYPTION_GUARD`
 * round-trip check) under `EncryptionKey` (PBKDF2 + AES-GCM).
 *
 * ## Wrong-password semantics
 *
 * `unseal` / `unsealWithPasshash` / `reseal` **return `null`** when the
 * supplied credential can't decrypt the profile. They do NOT throw for
 * the wrong-password case. The facade is responsible for mapping
 * `null` into the specific error each RPC's contract expects:
 *
 *   - `unlockProfile`           → `throw new InvalidPasswordError()`
 *   - `changeProfilePassword`   → `throw new Error("Invalid profile old password")`
 *   - `exportPlain` (password)  → `throw new InvalidPasswordError()`
 *   - `exportMnemonic`          → `throw new Error("Invalid profile old password")`
 *   - `restorePasswordSession`  → silent close (SessionManager owns this)
 *
 * These strings / types are NOT compatibility-fluff; auth UI code
 * matches on `InvalidPasswordError` (`popup/pages/auth.vue:65-74`)
 * and the error-shape differences are observable.
 *
 * ## Null vs throw
 *
 * Only wrong-password / corrupted-ciphertext failures return null.
 * Unexpected Web Crypto errors (e.g. `importKey` rejects the passhash
 * buffer as the wrong type, or the runtime has no subtle crypto)
 * propagate as thrown exceptions. Callers should not attempt to
 * distinguish those — they're system-level bugs, not user input.
 */

import { toBase64 } from "@nulo/wallet-core/utils"
import { EncryptionKey } from "./encryption-key"
import { type EncryptedProfileSecret, openProfileSlots, type SlotCipher, sealProfileSlots } from "./profile-slots"
import type { MasterSecretBytes, Passhash } from "./secret-types"
import { zeroize } from "./zeroize"

export { ENCRYPTION_GUARD, PROFILE_AAD, type EncryptedProfileSecret } from "./profile-slots"

/** Result of a successful `seal`. Returned to callers so they can persist
 *  `encrypted` on the `Profile` record and pass `passhash` into the
 *  SessionManager's `open` fast-path (avoiding a second PBKDF2). */
export type Sealed = {
	passhash: Passhash
	encrypted: EncryptedProfileSecret
}

export class PasswordSecretBox {
	/** Encrypts `secret` + `entropy` under a key derived from `password`. Returns the
	 *  base64-encoded guard+secret+entropy triple for storage plus the passhash for
	 *  the immediate session-open. */
	public async seal(password: string, secret: MasterSecretBytes, entropy: Uint8Array<ArrayBuffer>): Promise<Sealed> {
		const passhash = await EncryptionKey.getPasshash(password)
		try {
			const key = await EncryptionKey.fromPasshash(passhash)
			const encrypted = await this.sealInternal(key, secret, entropy)
			// `passhash` ESCAPES to the caller on success (session-open fast path). Only wipe it
			// on the throw path, where the caller never receives it.
			return { passhash, encrypted }
		} catch (err) {
			zeroize(passhash)
			throw err
		}
	}

	/** Fast path for flows where the caller already has a passhash.
	 *
	 *  ## Buffer ownership
	 *
	 *  The `passhash`, `secret`, and `entropy` parameters are **caller-owned**.
	 *  This method does NOT zero them; the caller is responsible for
	 *  calling `zeroize(...)` after the last legitimate use. */
	public async sealWithPasshash(
		passhash: Passhash,
		secret: MasterSecretBytes,
		entropy: Uint8Array<ArrayBuffer>,
	): Promise<EncryptedProfileSecret> {
		const key = await EncryptionKey.fromPasshash(passhash)
		return this.sealInternal(key, secret, entropy)
	}

	/** Decrypts and returns the raw master secret + entropy, or `null` if the
	 *  password is wrong or the ciphertext is corrupted. */
	public async unseal(
		password: string,
		encrypted: EncryptedProfileSecret,
	): Promise<{ secret: MasterSecretBytes; entropy: Uint8Array<ArrayBuffer> } | null> {
		const passhash = await EncryptionKey.getPasshash(password)
		try {
			const key = await EncryptionKey.fromPasshash(passhash)
			return await this.unsealInternal(key, encrypted)
		} finally {
			zeroize(passhash)
		}
	}

	/** Decrypts with a caller-held `passhash` (the unsalted SHA-256 of the password), skipping
	 *  only that hash; each decryption still runs PBKDF2. Never fed from storage: a session
	 *  restores through `SessionSecretBox`, not through this method.
	 *
	 *  ## Buffer ownership
	 *
	 *  The `passhash` parameter is **caller-owned**. This method does
	 *  NOT zero it; the caller is responsible for calling
	 *  `zeroize(...)` after the last legitimate use. */
	public async unsealWithPasshash(
		passhash: Passhash,
		encrypted: EncryptedProfileSecret,
	): Promise<{ secret: MasterSecretBytes; entropy: Uint8Array<ArrayBuffer> } | null> {
		const key = await EncryptionKey.fromPasshash(passhash)
		return this.unsealInternal(key, encrypted)
	}

	/** Re-encrypts the master secret AND entropy under a new password — always both, atomically:
	 *  a reseal that missed `entropy` would leave the recovery phrase decryptable under the
	 *  RETIRED password. Returns the new encrypted blob + new passhash, or `null` if
	 *  the old password was wrong. Used by `changeProfilePassword`.
	 *
	 *  ## Buffer ownership
	 *
	 *  `oldPasshash` is locally derived and zeroed in finally. The
	 *  returned `passhash` (newPasshash) ESCAPES — caller owns it and
	 *  must zero it after the last legitimate use. */
	public async reseal(oldPassword: string, newPassword: string, encrypted: EncryptedProfileSecret): Promise<Sealed | null> {
		const oldPasshash = await EncryptionKey.getPasshash(oldPassword)
		let unsealed: { secret: MasterSecretBytes; entropy: Uint8Array<ArrayBuffer> } | null = null
		try {
			const oldKey = await EncryptionKey.fromPasshash(oldPasshash)
			unsealed = await this.unsealInternal(oldKey, encrypted)
			if (!unsealed) return null

			const newPasshash = await EncryptionKey.getPasshash(newPassword)
			try {
				const newKey = await EncryptionKey.fromPasshash(newPasshash)
				const newEncrypted = await this.sealInternal(newKey, unsealed.secret, unsealed.entropy)
				// newPasshash ESCAPES on success (caller owns it); wipe it only if sealing throws.
				return { passhash: newPasshash, encrypted: newEncrypted }
			} catch (err) {
				zeroize(newPasshash)
				throw err
			}
		} finally {
			zeroize(oldPasshash)
			if (unsealed) {
				zeroize(unsealed.secret)
				zeroize(unsealed.entropy)
			}
		}
	}

	private sealInternal(key: EncryptionKey, secret: MasterSecretBytes, entropy: Uint8Array<ArrayBuffer>): Promise<EncryptedProfileSecret> {
		return sealProfileSlots(passwordCipher(key), secret, entropy)
	}

	private unsealInternal(
		key: EncryptionKey,
		encrypted: EncryptedProfileSecret,
	): Promise<{ secret: MasterSecretBytes; entropy: Uint8Array<ArrayBuffer> } | null> {
		return openProfileSlots(passwordCipher(key), encrypted)
	}
}

/** Version-0 `EncryptionKey` frames (a PBKDF2-600k key per frame), base64 as every password row
 *  stores them. */
function passwordCipher(key: EncryptionKey): SlotCipher {
	return {
		seal: async (plaintext, aad) => toBase64(new Uint8Array((await key.encrypt(plaintext, aad)).buffer)),
		open: (ciphertext, aad) => key.decrypt(Buffer.from(ciphertext, "base64") as Uint8Array<ArrayBuffer>, aad),
	}
}
