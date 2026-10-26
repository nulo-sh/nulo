import type { PasskeyCredentialData } from "@nulo/wallet-crypto"
import type { ProfileInfo } from "@/wallet/services/profile/client"
import { newCreateInput, type PasskeyRequest } from "@/wallet/services/passkey/spec"

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
 * Creates a passkey profile from the page: mints the PRF input, runs the create, and hands the
 * answer to the background, which allocates the id and seals the new phrase under it. With `saved`,
 * it confirms that credential at its own input instead of minting another.
 *
 * @throws UserRejectedError if the ceremony was cancelled before a passkey was created; a later
 *   cancel arrives as `PasskeyUnconfirmedError` with that cause.
 * @throws Other Error from the service-client.
 */
export async function createPasskeyProfileInPage(
	name: string,
	deps: CreatePasskeyProfileDeps,
	saved?: SavedPasskeyCredential,
): Promise<CreatedPasskeyProfile> {
	const input = newCreateInput()
	const credentialData = await deps.runCeremony({
		mode: "create",
		userHandle: input.userHandle,
		prfSalt: saved?.prfSalt ?? input.prfSalt,
		credentialId: saved?.credentialId,
		step: "create",
		profileName: name,
	})
	return { profile: await deps.createPasskeyProfile(name, credentialData), credentialData }
}
