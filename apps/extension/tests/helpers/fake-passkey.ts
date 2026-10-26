import { asBase64CredentialId, asBase64SecretPrf, newPrfSalt, PasskeyCredential, type PasskeyCredentialData } from "@nulo/wallet-crypto"
import { toBase64 } from "@nulo/wallet-core/utils"

/**
 * An authenticator's PRF stand-in: the same credential at the same input always answers the same
 * 32 bytes, and another credential or another input answers others, as the real extension does.
 */
export async function fakePrf(credentialId: string, prfSalt: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`fake-prf|${credentialId}|${prfSalt}`))
	return toBase64(new Uint8Array(digest))
}

/** What the page hands the background after `credentialId` answered at `prfSalt`. */
export async function fakePasskeyAnswer(credentialId: string, prfSalt: string): Promise<PasskeyCredentialData> {
	return { id: asBase64CredentialId(credentialId), prf: asBase64SecretPrf(await fakePrf(credentialId, prfSalt)), prfSalt }
}

/** The background's view of that answer. */
export async function fakePasskeyCredential(credentialId: string, prfSalt: string): Promise<PasskeyCredential> {
	return PasskeyCredential.create(await fakePasskeyAnswer(credentialId, prfSalt))
}

/** A fresh PRF input, encoded as a row stores it. */
export const freshPrfSalt = (): string => toBase64(newPrfSalt())
