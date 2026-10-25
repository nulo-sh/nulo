// Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0.
import { asBase64CredentialId, type Base64CredentialId, type Base64SecretPrf } from "./secret-types"
import { fromBase64, toBase64 } from "@nulo/wallet-core/utils"
import { derivePasskeyUnlockKey } from "./passkey-unlock-key"
import { zeroize } from "./zeroize"

/** A passkey's answer to one prompt, as the popup hands it to the background. Wire-safe strings. */
export type PasskeyCredentialData = {
	/** WebAuthn credential id (base64). */
	id: Base64CredentialId
	/** PRF output (base64, 32 bytes). */
	prf: Base64SecretPrf
	/** The PRF input the passkey evaluated (base64, 32 bytes): the `prfSalt` of the profile the
	 *  prompt was for. */
	prfSalt: string
}

/**
 * A passkey answer with its PRF output already turned into the unlock key for the input it was
 * evaluated for. The output's bytes are wiped once the key exists; the key is non-extractable.
 */
export class PasskeyCredential {
	public readonly id: Base64CredentialId
	/** Canonical base64 of the 32-byte PRF input the passkey evaluated. */
	public readonly prfSalt: string
	private readonly unlockKey: CryptoKey

	private constructor(id: Base64CredentialId, prfSalt: string, unlockKey: CryptoKey) {
		this.id = id
		this.prfSalt = prfSalt
		this.unlockKey = unlockKey
	}

	/** Throws when the output or the input is not 32 bytes. */
	public static async create(data: PasskeyCredentialData): Promise<PasskeyCredential> {
		const prf = fromBase64(data.prf)
		const prfSalt = fromBase64(data.prfSalt)
		try {
			return new PasskeyCredential(asBase64CredentialId(data.id), toBase64(prfSalt), await derivePasskeyUnlockKey(prf, prfSalt))
		} finally {
			zeroize(prf)
		}
	}

	/** The unlock key when the passkey evaluated `prfSalt`, else `null`: an answer for one profile's
	 *  input never keys another's. */
	public unlockKeyFor(prfSalt: string): CryptoKey | null {
		return prfSalt === this.prfSalt ? this.unlockKey : null
	}
}
