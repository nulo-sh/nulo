import type { PasskeyCredentialData } from "@nulo/wallet-crypto"
import type { PasskeyRequest, PasskeyStep } from "@/wallet/services/passkey/spec"
import type { ProfileServiceClient } from "@/wallet/services/profile/client"

/**
 * Asks a stored profile's passkey at that profile's own credential and PRF input, never through a
 * picker. `undefined`, with no prompt shown, when `isCurrent()` is false once the lookup settles; a
 * rejected lookup or ceremony rejects. `profileName` is read only after that check, so a getter that
 * reads the store reads the name the prompt is for. The caller re-checks its fence after the answer.
 */
export async function askProfilePasskey(
	runCeremony: (request: PasskeyRequest) => Promise<PasskeyCredentialData>,
	profiles: Pick<ProfileServiceClient, "getPasskeyUnlockParams">,
	ask: { profileId: string; step: PasskeyStep; profileName: () => string | undefined },
	isCurrent: () => boolean,
): Promise<PasskeyCredentialData | undefined> {
	const { credentialId, prfSalt } = await profiles.getPasskeyUnlockParams(ask.profileId)
	if (!isCurrent()) return undefined
	return runCeremony({ mode: "get", credentialId, prfSalt, step: ask.step, profileName: ask.profileName() })
}
