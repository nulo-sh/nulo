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

import {
	asBase64CredentialId,
	asBase64SecretPrf,
	asHexUserHandle,
	type PasskeyCredentialData,
	PASSKEY_PRF_LABEL,
} from "@nulo/wallet-crypto"
import { PASSKEY_TIMEOUT, type PasskeyRequest, RP_ID } from "@/wallet/services/passkey/spec"
import { bytesToHex, fromBase64, fromHex, toBase64 } from "@/wallet/utils"
import { formatPasskeyUserName } from "./passkey-label"
import { PasskeyPrfError, PasskeyUnconfirmedError } from "./passkey-errors"

function encodeBase64(buf: BufferSource): string {
	const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
	return toBase64(bytes)
}

function decodeBase64(b64: string): Uint8Array {
	return fromBase64(b64)
}

async function buildPrfInput(): Promise<ArrayBuffer> {
	const te = new TextEncoder()
	return await crypto.subtle.digest("SHA-256", te.encode(PASSKEY_PRF_LABEL))
}

export async function buildCreateOptions(userHandle: string, name: string): Promise<PublicKeyCredentialCreationOptions> {
	const challenge = crypto.getRandomValues(new Uint8Array(32))
	const prfInput = await buildPrfInput()
	const userHandleBytes = fromHex(userHandle)
	// The label shown by iCloud Keychain / password managers. `user.name` and
	// `user.displayName` carry the same value so the credential renders
	// consistently regardless of which field a given manager surfaces.
	const label = formatPasskeyUserName(name, userHandle)
	return {
		challenge,
		rp: {
			name: "Nulo",
			id: RP_ID,
		},
		user: {
			id: userHandleBytes,
			name: label,
			displayName: label,
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
		extensions: { prf: { eval: { first: new Uint8Array(prfInput) } } },
	}
}

export async function buildGetOptions(credentialId?: string): Promise<PublicKeyCredentialRequestOptions> {
	const challenge = crypto.getRandomValues(new Uint8Array(32))
	const prfInput = await buildPrfInput()
	const opts: PublicKeyCredentialRequestOptions = {
		challenge,
		rpId: RP_ID,
		userVerification: "required",
		timeout: PASSKEY_TIMEOUT,
		extensions: { prf: { eval: { first: new Uint8Array(prfInput) } } },
	}
	if (credentialId) {
		// Cast through unknown — `Uint8Array<ArrayBufferLike>` from
		// `Uint8Array.from` upcasts to BufferSource at runtime; TS's stricter
		// generic-typed-array narrowing in @types/dom misses this. Mirrors the
		// pre-extraction code in `windows/passkey/index.vue` which compiled
		// without this cast under the same target.
		opts.allowCredentials = [{ id: decodeBase64(credentialId) as unknown as BufferSource, type: "public-key" }]
	}
	return opts
}

/**
 * Run the create-mode ceremony. Once the credential exists, every failure is a
 * `PasskeyUnconfirmedError` carrying its id, so a retry confirms it instead of minting another.
 */
async function runCreate(userHandle: string, name: string, signal?: AbortSignal): Promise<PasskeyCredentialData> {
	const publicKey = await buildCreateOptions(userHandle, name)
	const credential = await navigator.credentials.create({ publicKey, signal })
	if (!credential) throw new Error("Failed to create passkey credential")
	if (!(credential instanceof PublicKeyCredential)) throw new Error("Unexpected credential type")
	const id = asBase64CredentialId(encodeBase64(credential.rawId))
	const ext = credential.getClientExtensionResults()
	if (!ext.prf) throw new PasskeyUnconfirmedError(id, userHandle, new PasskeyPrfError("Passkey PRF not available"))

	if (ext.prf.results) {
		return {
			id,
			prf: asBase64SecretPrf(encodeBase64(ext.prf.results.first)),
			userHandle: asHexUserHandle(userHandle),
		}
	}

	// Some authenticators expose PRF only on assertion, so the new credential is confirmed by a
	// second prompt.
	return await confirmMinted(id, userHandle, signal)
}

/** Confirms a credential a create already minted; when that fails, the credential still exists
 *  and only needs confirming again. */
async function confirmMinted(credentialId: string, userHandle: string, signal?: AbortSignal): Promise<PasskeyCredentialData> {
	try {
		return await confirmCreatedCredential(credentialId, userHandle, signal)
	} catch (cause) {
		throw new PasskeyUnconfirmedError(credentialId, userHandle, cause)
	}
}

async function runGet(credentialId: string | undefined, signal?: AbortSignal): Promise<PasskeyCredentialData> {
	const publicKey = await buildGetOptions(credentialId)
	const assertion = await navigator.credentials.get({ publicKey, signal })
	if (!assertion) throw new Error("Failed to get passkey assertion")
	if (!(assertion instanceof PublicKeyCredential)) throw new Error("Unexpected assertion type")
	const ext = assertion.getClientExtensionResults()
	if (!ext.prf) throw new PasskeyPrfError("Passkey PRF not available")
	if (!ext.prf.results) throw new PasskeyPrfError("Passkey PRF has no results")
	if (!(assertion.response instanceof AuthenticatorAssertionResponse)) throw new Error("Unexpected assertion response type")
	const userHandleOption = assertion.response.userHandle
	return {
		id: asBase64CredentialId(encodeBase64(assertion.rawId)),
		prf: asBase64SecretPrf(encodeBase64(ext.prf.results.first)),
		userHandle: userHandleOption ? asHexUserHandle(bytesToHex(new Uint8Array(userHandleOption))) : undefined,
	}
}

/**
 * Reads the PRF of a credential `create` just minted, through an assertion pinned to it. A
 * different credential is refused, and the registration's handle replaces the one a pinned
 * assertion may legally omit: a missing handle would mint a second profile identity.
 */
export async function confirmCreatedCredential(
	credentialId: string,
	userHandle: string,
	signal?: AbortSignal,
): Promise<PasskeyCredentialData> {
	const assertion = await runGet(credentialId, signal)
	if (assertion.id !== credentialId) throw new Error("Passkey PRF fallback returned a different credential")
	return { ...assertion, userHandle: asHexUserHandle(userHandle) }
}

/**
 * Run a passkey ceremony for the given request, returning the credential
 * data the wallet needs to derive a master secret.
 *
 * `signal` is forwarded to `navigator.credentials.{create,get}` so the
 * caller can abort the ceremony cleanly via `AbortController.abort()`.
 * Aborts surface as DOMException("AbortError").
 */
export async function runPasskeyCeremony(request: PasskeyRequest, signal?: AbortSignal): Promise<PasskeyCredentialData> {
	if (request.mode === "create") {
		if (request.credentialId) return await confirmMinted(request.credentialId, request.userHandle, signal)
		return await runCreate(request.userHandle, request.name, signal)
	}
	return await runGet(request.credentialId, signal)
}
