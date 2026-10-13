import type { PinnedKey } from "./envelope"

/** Stands in until the key ceremony; not base64url, so it refuses every envelope as `bad-key`. */
export const PLACEHOLDER_PUBLIC_KEY = "placeholder: run the key ceremony"

/**
 * The keys a list may be signed with. `nulo-ci-1` signs in the `token-list` environment;
 * `nulo-recovery-1` stays offline in 1Password and signs only through a keyed run after a rotation.
 * Removing a key here is the rotation: a release without it discards any list it signed.
 */
export const PINNED_KEYS: readonly PinnedKey[] = [
	{ keyId: "nulo-ci-1", publicKey: PLACEHOLDER_PUBLIC_KEY },
	{ keyId: "nulo-recovery-1", publicKey: PLACEHOLDER_PUBLIC_KEY },
]
