import type { PasskeyCredentialData } from "@nulo/wallet-crypto"
import type { ProfileInfo } from "@/wallet/services/profile/client"
import { type NewPasskeyDisplay, newCreateInput, type PasskeyRequest } from "@/wallet/services/passkey/spec"

/**
 * The page's two steps of an in-page passkey create, injected so the helper is testable apart
 * from the `managers.*` proxy: the page's `PasskeyCeremonyDialog`, then the background's create.
 */
export interface CreatePasskeyProfileDeps {
	runCeremony: (req: PasskeyRequest) => Promise<PasskeyCredentialData>
	createPasskeyProfile: (name: string, credData: PasskeyCredentialData) => Promise<ProfileInfo>
}

/** A credential an earlier attempt minted but could not confirm, and the PRF input that attempt
 *  asked for. */
export interface SavedPasskeyCredential {
	credentialId: string
	prfSalt: string
}

/** The new profile, and the passkey answer it was made from: the phrase stage opens the profile's
 *  recovery phrase with it once, with no second prompt, then drops it. */
export type CreatedPasskeyProfile = { profile: ProfileInfo; credentialData: PasskeyCredentialData }

/**
 * The prompt a new profile's passkey step runs, at a PRF input minted here for that profile: a create
 * (or, with `saved`, the confirmation of the credential an earlier attempt minted, at that attempt's
 * input), or with `existing` a discovery get any Nulo passkey on the device may answer.
 */
export function newProfilePasskeyRequest(
	display: NewPasskeyDisplay,
	opts: { existing?: boolean; saved?: SavedPasskeyCredential } = {},
): PasskeyRequest {
	const input = newCreateInput()
	if (opts.existing) return { mode: "discover", prfSalt: input.prfSalt, ...display }
	return {
		mode: "create",
		userHandle: input.userHandle,
		prfSalt: opts.saved?.prfSalt ?? input.prfSalt,
		credentialId: opts.saved?.credentialId,
		...display,
	}
}

/**
 * Creates a passkey profile from the page: runs {@link newProfilePasskeyRequest}'s prompt and hands
 * the answer to the background, which allocates the id and seals the new phrase under it.
 *
 * @throws UserRejectedError if the ceremony was cancelled before a passkey was created; a later
 *   cancel arrives as `PasskeyUnconfirmedError` with that cause.
 * @throws Other Error from the service-client.
 */
export async function createPasskeyProfileInPage(
	name: string,
	deps: CreatePasskeyProfileDeps,
	saved?: SavedPasskeyCredential,
	existing = false,
): Promise<CreatedPasskeyProfile> {
	const credentialData = await deps.runCeremony(newProfilePasskeyRequest({ step: "create", profileName: name }, { existing, saved }))
	return { profile: await deps.createPasskeyProfile(name, credentialData), credentialData }
}
