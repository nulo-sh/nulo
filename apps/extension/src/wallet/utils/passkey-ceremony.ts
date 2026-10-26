// Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0.
/**
 * Pure helper that runs the WebAuthn passkey ceremony from a popup-side
 * frame, returning the `PasskeyCredentialData` shape the wallet's
 * `PasskeyService.materializeCredential` consumes.
 *
 * Single source of truth for the WebAuthn parameter shape and PRF
 * extension wiring: the in-page dialog (PATH A) and the passkey window
 * (PATH B, where Firefox's toolbar panel sends its steps) both call this, so
 * the two ceremony hosts never diverge — a regression in either calls the
 * same code.
 */

import { asBase64CredentialId, asBase64SecretPrf, type PasskeyCredentialData } from "@nulo/wallet-crypto"
import { PASSKEY_TIMEOUT, type PasskeyRequest, RP_ID } from "@/wallet/services/passkey/spec"
import { fromBase64, fromHex, toBase64 } from "@/wallet/utils"
import { PASSKEY_USER_NAME } from "./passkey-label"
import { PasskeyPrfError, PasskeyUnconfirmedError } from "./passkey-errors"

function encodeBase64(buf: BufferSource): string {
	const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
	return toBase64(bytes)
}

/** The PRF extension input: evaluate at the profile's own `prfSalt`. */
function prfEval(prfSalt: string): AuthenticationExtensionsClientInputs {
	return { prf: { eval: { first: fromBase64(prfSalt) } } }
}

export function buildCreateOptions(userHandle: string, prfSalt: string): PublicKeyCredentialCreationOptions {
	const challenge = crypto.getRandomValues(new Uint8Array(32))
	return {
		challenge,
		rp: {
			name: "Nulo",
			id: RP_ID,
		},
		// `user.name` and `user.displayName` carry the same label, so the credential renders alike
		// whichever field a password manager shows.
		user: {
			id: fromHex(userHandle),
			name: PASSKEY_USER_NAME,
			displayName: PASSKEY_USER_NAME,
		},
		// ES256 first, RS256 as the fallback the spec asks for. Key material is the PRF output, never
		// the credential's signature, so the algorithm an authenticator picks changes nothing else.
		pubKeyCredParams: [
			{ type: "public-key", alg: -7 },
			{ type: "public-key", alg: -257 },
		],
		authenticatorSelection: {
			residentKey: "required",
			userVerification: "required",
			requireResidentKey: true,
		},
		timeout: PASSKEY_TIMEOUT,
		extensions: prfEval(prfSalt),
	}
}

export function buildGetOptions(credentialId: string, prfSalt: string): PublicKeyCredentialRequestOptions {
	return {
		challenge: crypto.getRandomValues(new Uint8Array(32)),
		rpId: RP_ID,
		userVerification: "required",
		timeout: PASSKEY_TIMEOUT,
		allowCredentials: [{ id: fromBase64(credentialId), type: "public-key" }],
		extensions: prfEval(prfSalt),
	}
}

/**
 * Run the create-mode ceremony. Once the credential exists, every failure is a
 * `PasskeyUnconfirmedError` carrying its id and the input it was asked for, so a retry confirms it
 * instead of minting another.
 */
async function runCreate(userHandle: string, prfSalt: string, signal?: AbortSignal): Promise<PasskeyCredentialData> {
	const publicKey = buildCreateOptions(userHandle, prfSalt)
	const credential = await navigator.credentials.create({ publicKey, signal })
	if (!credential) throw new Error("Failed to create passkey credential")
	if (!(credential instanceof PublicKeyCredential)) throw new Error("Unexpected credential type")
	const id = asBase64CredentialId(encodeBase64(credential.rawId))
	const ext = credential.getClientExtensionResults()
	if (!ext.prf) throw new PasskeyUnconfirmedError(id, prfSalt, new PasskeyPrfError("Passkey PRF not available"))

	if (ext.prf.results) {
		return { id, prf: asBase64SecretPrf(encodeBase64(ext.prf.results.first)), prfSalt }
	}

	// Some authenticators expose PRF only on assertion, so the new credential is confirmed by a
	// second prompt at the same input.
	return await confirmMinted(id, prfSalt, signal)
}

/** Confirms a credential a create already minted, at the input the create asked for. Every failure
 *  is a `PasskeyUnconfirmedError` with this attempt's cause: the credential still exists, and a
 *  caller can tell a credential whose authenticator has no PRF from a prompt that was dismissed. */
export async function confirmMinted(credentialId: string, prfSalt: string, signal?: AbortSignal): Promise<PasskeyCredentialData> {
	try {
		const assertion = await runGet(credentialId, prfSalt, signal)
		if (assertion.id !== credentialId) throw new Error("Passkey PRF fallback returned a different credential")
		return assertion
	} catch (cause) {
		throw new PasskeyUnconfirmedError(credentialId, prfSalt, cause)
	}
}

async function runGet(credentialId: string, prfSalt: string, signal?: AbortSignal): Promise<PasskeyCredentialData> {
	const publicKey = buildGetOptions(credentialId, prfSalt)
	const assertion = await navigator.credentials.get({ publicKey, signal })
	if (!assertion) throw new Error("Failed to get passkey assertion")
	if (!(assertion instanceof PublicKeyCredential)) throw new Error("Unexpected assertion type")
	const ext = assertion.getClientExtensionResults()
	if (!ext.prf) throw new PasskeyPrfError("Passkey PRF not available")
	if (!ext.prf.results) throw new PasskeyPrfError("Passkey PRF has no results")
	return {
		id: asBase64CredentialId(encodeBase64(assertion.rawId)),
		prf: asBase64SecretPrf(encodeBase64(ext.prf.results.first)),
		prfSalt,
	}
}

/**
 * Run a passkey ceremony for the given request. The answer reports the PRF input the request
 * asked for, the one the passkey evaluated.
 *
 * `signal` is forwarded to `navigator.credentials.{create,get}` so the
 * caller can abort the ceremony cleanly via `AbortController.abort()`.
 * Aborts surface as DOMException("AbortError").
 */
export async function runPasskeyCeremony(request: PasskeyRequest, signal?: AbortSignal): Promise<PasskeyCredentialData> {
	if (request.mode === "create") {
		if (request.credentialId) return await confirmMinted(request.credentialId, request.prfSalt, signal)
		return await runCreate(request.userHandle, request.prfSalt, signal)
	}
	return await runGet(request.credentialId, request.prfSalt, signal)
}
