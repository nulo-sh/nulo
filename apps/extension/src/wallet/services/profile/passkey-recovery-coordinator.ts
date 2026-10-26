// Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0.
/**
 * `PasskeyRecoveryCoordinator` — the passkey side of the profile flow: one shape for a passkey
 * answer whichever host ran the prompt.
 *
 *   - PATH A: the page ran the prompt and hands over its `PasskeyCredentialData`.
 *   - PATH B: the passkey window runs it (`PasskeyService.createKey` / `getKey`), and the answer
 *     comes with the `finish` that tells the window how the step ended.
 *
 * Pure coordinator: no storage, no session state, no passwords, no locking. The facade serializes
 * cross-collaborator workflows.
 *
 * ## Lock scope contract
 *
 * WebAuthn prompts take up to 3 minutes (the user must physically touch the authenticator). The
 * `ProfileService` lock has a 5-minute safety force-release; holding it across a WebAuthn prompt is
 * legal in theory but pathological in practice. Every passkey path follows the same shape:
 * **callers MUST run the prompt unlocked**, then re-enter the lock for storage writes.
 */

import type { PasskeyDisplay } from "@/wallet/services/passkey/spec"
import type { PasskeyHandOver, PasskeyService } from "@/wallet/services/passkey/service"
import type { PasskeyCredential, PasskeyCredentialData } from "@nulo/wallet-crypto"

/** A passkey answer: its unlock key is bound to the PRF input the passkey evaluated
 *  (`PasskeyCredential.unlockKeyFor`). */
export type PasskeyAnswer = {
	credential: PasskeyCredential
	/** PATH B: tells the passkey window how the step ended. PATH A ran no window. */
	finish?: PasskeyHandOver["finish"]
}

export class PasskeyRecoveryCoordinator {
	public constructor(private readonly passkeys: PasskeyService) {}

	/** PATH B create of a new credential, evaluating the PRF at `prfSalt`. */
	public createInWindow(userHandle: string, prfSalt: string, display: PasskeyDisplay): Promise<PasskeyAnswer> {
		return this.passkeys.createKey(userHandle, prfSalt, display)
	}

	/** PATH B `get` bound to `credentialId`, evaluating the PRF at `prfSalt`. */
	public getInWindow(credentialId: string, prfSalt: string, display: PasskeyDisplay): Promise<PasskeyAnswer> {
		return this.passkeys.getKey(credentialId, prfSalt, display)
	}

	/** PATH B discovery get: a passkey the person already has, evaluating the PRF at `prfSalt`. */
	public discoverInWindow(prfSalt: string, display: PasskeyDisplay): Promise<PasskeyAnswer> {
		return this.passkeys.discoverKey(prfSalt, display)
	}

	/** PATH A: the page's answer, materialized here. Throws when the output or its input is not
	 *  32 bytes. */
	public async fromCredentialData(data: PasskeyCredentialData): Promise<PasskeyAnswer> {
		return { credential: await this.passkeys.materializeCredential(data) }
	}
}
