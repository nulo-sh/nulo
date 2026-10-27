/**
 * A passkey profile's slots, in the profile slot format (`profile-slots.ts`), as version-1 AES-GCM
 * frames (`aes-gcm-frame.ts`) under the profile's passkey unlock key (`passkey-unlock-key.ts`). Its
 * DEK is sealed under the same key by `sealDekUnderWrapKey`. A password row's version-0 frames never
 * open here, nor these under `EncryptionKey`: a reader must know the row's type.
 */

import { openFrame, sealFrame } from "./aes-gcm-frame"
import { type EncryptedProfileSecret, openProfileSlots, type SlotCipher, sealProfileSlots } from "./profile-slots"
import type { MasterSecretBytes } from "./secret-types"

/** Seal the master and entropy under `unlockKey`. Caller owns and zeroes both buffers. */
export function sealPasskeySlots(
	unlockKey: CryptoKey,
	secret: MasterSecretBytes,
	entropy: Uint8Array<ArrayBuffer>,
): Promise<EncryptedProfileSecret> {
	return sealProfileSlots(frameCipher(unlockKey), secret, entropy)
}

/** Open the slots under `unlockKey`; `null` on a wrong key, a corrupted slot or one moved to
 *  another slot. Caller owns and zeroes the returned buffers. */
export function openPasskeySlots(
	unlockKey: CryptoKey,
	encrypted: EncryptedProfileSecret,
): Promise<{ secret: MasterSecretBytes; entropy: Uint8Array<ArrayBuffer> } | null> {
	return openProfileSlots(frameCipher(unlockKey), encrypted)
}

function frameCipher(key: CryptoKey): SlotCipher {
	return { seal: (plaintext, aad) => sealFrame(key, plaintext, aad), open: (ciphertext, aad) => openFrame(key, ciphertext, aad) }
}
