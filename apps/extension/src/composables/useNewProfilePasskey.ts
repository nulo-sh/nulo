import type { PasskeyCredentialData } from "@nulo/wallet-crypto"
import { classifyPasskeyFailure } from "@/utils/passkey-copy"
import type { PasskeyDisplay, PasskeyRequest } from "@/wallet/services/passkey/spec"
import { newProfilePasskeyRequest, type SavedPasskeyCredential } from "@/wallet/utils/create-passkey-profile"
import { PasskeyUnconfirmedError } from "@/wallet/utils/passkey-errors"

export type UnlockMethod = "passkey" | "password"

/** What a new profile is sealed under: the password typed, or a passkey answer for it. */
export type NewProfileUnlock =
	| { password: string; credentialData?: undefined }
	| { password?: undefined; credentialData: PasskeyCredentialData }

/**
 * The passkey a profile is about to be sealed under, asked through the page's ceremony at a PRF input
 * minted for it: a new passkey, or with `existing` one the person already has. A create the
 * authenticator saved but could not confirm is confirmed by the next create for the same profile name
 * instead of minting another, unless it gave no PRF; `forget()` once the step that used the answer
 * succeeded. Page memory only: never persisted or logged.
 *
 * C1: holds no service client and registers no lifecycle hook.
 */
export function useNewProfilePasskey(runCeremony: (request: PasskeyRequest) => Promise<PasskeyCredentialData>) {
	let unconfirmed: { name: string; credential: SavedPasskeyCredential } | null = null

	async function ask(display: PasskeyDisplay, existing = false): Promise<PasskeyCredentialData> {
		const name = display.profileName ?? ""
		const saved = !existing && unconfirmed?.name === name ? unconfirmed.credential : undefined
		try {
			return await runCeremony(newProfilePasskeyRequest(display, { existing, saved }))
		} catch (error) {
			if (error instanceof PasskeyUnconfirmedError) {
				unconfirmed =
					classifyPasskeyFailure(error) === "no-prf"
						? null
						: { name, credential: { credentialId: error.credentialId, prfSalt: error.prfSalt } }
			}
			throw error
		}
	}

	function forget() {
		unconfirmed = null
	}

	return { ask, forget }
}
