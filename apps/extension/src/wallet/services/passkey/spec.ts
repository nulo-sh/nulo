// Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0.
import { getRandomHex, toBase64 } from "@nulo/wallet-core/utils"
import { newPrfSalt, type PasskeyCredentialData } from "@nulo/wallet-crypto"

export const PASSKEY_SERVICE_NAME = "passkey"
export const PASSKEY_TIMEOUT = 60_000 * 3 // 3 minutes

/**
 * WebAuthn Relying Party ID. **Crypto-bound**: changing this value
 * invalidates every existing passkey credential ever issued by this
 * extension. Keep in sync with `manifest.config.ts:host_permissions`.
 * The build-step gate `scripts/check-rp-id.ts` enforces the sync; CI
 * fails the build on drift.
 *
 * If a fork repurposes this extension under a different domain, change
 * BOTH this constant and the manifest entry, and accept that ALL
 * existing passkey wallets become unrecoverable.
 *
 * A dedicated content-less host: WebAuthn lets any origin whose registrable
 * domain suffix-matches the RP ID assert with the credential and evaluate its
 * PRF, so the apex and the application subdomains must not be eligible. The
 * host and every `*.passkey.nulo.sh` descendant serve no script, ever.
 *
 * Single source of truth — every WebAuthn options object that needs an
 * `rpId` imports this constant. The AST drift scanner catches any
 * future literal of this value in WebAuthn-options-shaped positions.
 */
export const RP_ID = "passkey.nulo.sh"

// `PasskeyCredentialData` lives in `@nulo/wallet-crypto`; re-exported for call sites importing
// from here. This module owns only the service-layer concerns (request shape, method contracts,
// timeout).
export type { PasskeyCredentialData } from "@nulo/wallet-crypto"

/** The wallet step a passkey prompt serves. Display only: it names the step on the passkey screen. */
export type PasskeyStep = "unlock" | "create" | "import" | "restore" | "reveal" | "export" | "accountFile" | "unlockMethod"

/** What the passkey screen names: the step and the profile it is for. Shown, never logged, never
 *  part of a decision. */
export type PasskeyDisplay = {
	step: PasskeyStep
	profileName?: string
}

/** A new passkey's display: its profile's name also names the passkey (`passkeyUserName`). */
export type NewPasskeyDisplay = PasskeyDisplay & { profileName: string }

/** Every prompt evaluates the PRF at `prfSalt` (base64, 32 bytes), the input of the profile it is
 *  for, and its answer reports that input back. */
export type PasskeyRequest = PasskeyDisplay &
	(
		| {
				mode: "create"
				profileName: string
				/** Random, per credential: it names no profile, since the profile id is allocated when the
				 *  profile is saved. */
				userHandle: string
				prfSalt: string
				/** A credential an earlier attempt of this create minted but could not confirm: the
				 *  ceremony confirms it instead of minting another. Set only by the in-page create. */
				credentialId?: string
		  }
		| {
				mode: "get"
				credentialId: string
				prfSalt: string
		  }
		| {
				/** A `get` any Nulo passkey on the device may answer: a passkey the person already has,
				 *  evaluated at a new profile's own fresh input, never another profile's. */
				mode: "discover"
				prfSalt: string
		  }
	)

/** A fresh create's inputs, minted where the create starts: the page (PATH A) or the background
 *  (PATH B). The user handle is 16 random bytes; `prfSalt` is the new profile's own PRF input. */
export function newCreateInput(): { userHandle: string; prfSalt: string } {
	return { userHandle: getRandomHex(32), prfSalt: toBase64(newPrfSalt()) }
}

/** How the step behind a resolved request ended, as the step itself reported it. */
export type PasskeyStepOutcome = "done" | "failed"

export type Methods = {
	/**
	 * Returns details for the pending request so the passkey window can proceed (PATH B).
	 * @param requestId Pending request identifier.
	 */
	getPendingRequest(requestId: string): PasskeyRequest

	/**
	 * Hands the passkey window's WebAuthn result to the step that asked (PATH B) and answers once that
	 * step has ended. Refused as an unknown id when the request was already answered, cancelled or
	 * replaced; `"failed"` when it was cancelled while its credential was being built, or when the
	 * result reports another PRF input than the request's.
	 * @param requestId Pending request identifier.
	 * @param result The credential id, the PRF output and the input it was evaluated for.
	 */
	resolvePasskeyRequest(requestId: string, result: PasskeyCredentialData): PasskeyStepOutcome

	/**
	 * Cancels a pending request on the user's behalf: its owner sees a `UserRejectedError`.
	 * @param requestId Pending request identifier.
	 */
	rejectPasskeyRequest(requestId: string): void
}

// PATH A note: `PasskeyService.materializeCredential(data)` is a SW-internal method (NOT in
// `Methods`) that wraps `PasskeyCredential.create` for popup-driven flows. The popup runs WebAuthn
// itself via `src/wallet/utils/passkey-ceremony.ts` and hands the result to the profile service,
// which materializes it before use. `PasskeyCredential` holds a `CryptoKey`, so it can't cross the
// RPC boundary; it stays SW-internal.
