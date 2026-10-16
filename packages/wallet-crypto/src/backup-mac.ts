/**
 * The check a passkey backup carries: HMAC-SHA256 over the body's checksum, keyed by its own
 * passkey's PRF. The checksum binds every field and slice of the body, so a body restores only
 * when the passkey that opens it made this check.
 */
import { fromBase64, toBase64 } from "@nulo/wallet-core/utils"
import type { PasskeyCredential } from "./passkey-credential"

const te = new TextEncoder()

export async function computeBackupMac(credential: PasskeyCredential, checksum: string): Promise<string> {
	const key = await credential.deriveBackupMacKey()
	return toBase64(new Uint8Array(await globalThis.crypto.subtle.sign("HMAC", key, te.encode(checksum))))
}

/** Constant-time via WebCrypto's own verify; a MAC that is not base64 is `false`. */
export async function verifyBackupMac(credential: PasskeyCredential, checksum: string, mac: string): Promise<boolean> {
	const key = await credential.deriveBackupMacKey()
	try {
		return await globalThis.crypto.subtle.verify("HMAC", key, fromBase64(mac), te.encode(checksum))
	} catch {
		return false
	}
}
