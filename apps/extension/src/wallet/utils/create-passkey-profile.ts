import { ProfileIdConflictError } from "@nulo/extension-messaging/errors"
import type { PasskeyCredentialData } from "@nulo/wallet-crypto"
import type { ProfileInfo } from "@/wallet/services/profile/client"
import type { PasskeyRequest } from "@/wallet/services/passkey/spec"

/**
 * Dependencies for creating a passkey-typed profile with the
 * ProfileIdConflictError retry handshake. All three are injected
 * explicitly so the helper is fully testable and decoupled from the
 * `managers.*` global proxy.
 *
 *   - runCeremony: hand off to the page's PasskeyCeremonyDialog (mode:
 *     "create" with the pre-reserved userHandle).
 *   - generateProfileId: ask the SW to reserve a fresh profile id.
 *   - createPasskeyProfile: persist the new profile with the collected
 *     credential.
 */
export interface CreatePasskeyProfileDeps {
	runCeremony: (req: PasskeyRequest) => Promise<PasskeyCredentialData>
	generateProfileId: () => Promise<string>
	createPasskeyProfile: (name: string, credData: PasskeyCredentialData) => Promise<ProfileInfo>
}

/** A credential an earlier attempt minted under `userHandle` (its profile id) but could not confirm. */
export interface SavedPasskeyCredential {
	credentialId: string
	userHandle: string
}

/**
 * Create a passkey-typed profile with a single retry on
 * `ProfileIdConflictError`. With `saved`, the first attempt confirms that credential under its own
 * id instead of minting another; a conflict on that id falls back to a fresh id and a fresh create.
 *
 * The pre-reserved id can be claimed by another flow during the
 * WebAuthn prompt. On conflict, we re-run the entire ceremony with a
 * fresh id (and therefore a fresh credential) to keep the credential's
 * userHandle in sync with the persisted profile id.
 *
 * Scope is bounded to (a) reserve an id, (b) run the ceremony,
 * (c) call createPasskeyProfile, (d) retry once on conflict. The caller
 * owns ALL post-create side effects — `chrome.storage.local` writes,
 * bootstrap orchestration, routing, etc.
 *
 * @throws ProfileIdConflictError if both attempts hit the conflict.
 * @throws UserRejectedError if the ceremony was cancelled before a passkey was created; a later
 *   cancel arrives as `PasskeyUnconfirmedError` with that cause.
 * @throws Other Error from the service-client.
 */
export async function createPasskeyProfileWithRetry(
	name: string,
	deps: CreatePasskeyProfileDeps,
	saved?: SavedPasskeyCredential,
): Promise<ProfileInfo> {
	const MAX_RETRIES = 1
	for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
		const pinned = attempt === 0 ? saved : undefined
		const profileId = pinned?.userHandle ?? (await deps.generateProfileId())
		const credData = await deps.runCeremony({
			mode: "create",
			userHandle: profileId,
			name,
			step: "create",
			profileName: name,
			credentialId: pinned?.credentialId,
		})
		try {
			return await deps.createPasskeyProfile(name, credData)
		} catch (e) {
			if (e instanceof ProfileIdConflictError && attempt < MAX_RETRIES) {
				continue
			}
			throw e
		}
	}
	throw new Error("createPasskeyProfile retried beyond MAX_RETRIES")
}
