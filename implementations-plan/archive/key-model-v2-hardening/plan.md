# Key model v2 hardening

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: The passkey master is reduced from 512 bits, imported signing keys are rooted in a per-profile key sealed under the profile credential, importing a phrase that already exists asks for confirmation, and the missing account import and export e2e plus a passkey execution canary exist (`packages/wallet-crypto/src/passkey-credential.ts`, `apps/extension/src/wallet/services/profile/service.ts`, `apps/extension/tests/e2e/`).
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Four deliverables on top of the key-model-v2 work, written as two further stacked changes.

- **Passkey entropy.** `deriveMasterSecret` asks HKDF for 512 bits and reduces all 64 bytes, as the mnemonic path does. The frozen KDF spec gains a byte-precise passkey clause, so the regime tripwire covers both derivation branches.
- **Imported-keys key.** Each profile has a random imported-keys key sealed under the profile credential (the password-derived wrap key, or an HKDF-derived wrap key for passkeys). It is the HKDF root of the rows holding imported signing keys.
- **Duplicate-phrase guard.** A one-way fingerprint of the master sits on every profile row. Mnemonic import and full-backup restore throw a typed `DuplicateWalletError` on a match, and the UI shows a confirm dialog and retries with `allowDuplicate`.
- **Missing e2e and a canary.** See below.

## Why

- Reducing 32 bytes modulo the field order leaves residues with five or six preimages, a 20 percent relative skew. A 64-byte input brings the bias to about 2^-258.
- Two profiles that share a phrase share the master, so anything derived from the master alone is readable by the sibling profile. The credential is the only input that tells them apart, so it is the only valid root for imported keys.
- Because the fingerprint check is a guardrail only, the isolation guarantee rests entirely on the credential-rooted key.

## What shipped

- The passkey change rotates every passkey profile's addresses and PXE store key, and invalidates account-export files minted before it. The spec text now says the in-place redefinition window closes at the first shipped build. The pinned vector for the new reduce is recomputed by an independent script from raw WebCrypto, not captured from the implementation.
- The imported-keys primitives that were master-rooted were deleted. Password change refuses, rather than self-heals, when the stored MAC no longer covers the key: a MAC failure cannot tell a replaced slot from a corrupted MAC field, and a fresh key would silently destroy recoverable keys. Export stays available as the non-destructive repair path.
- `DuplicateWalletError` is registered in the messaging package's error reconstruction, with a round-trip test. The fingerprint check and the row commit run under one lock.

### Duplicate-phrase guard

A choice, never a hard block: a matching phrase warns and the person may continue, on mnemonic import and on full-backup restore. The check runs service-side, since the popup never holds a master. Passkeys retry without a second ceremony, because the caller already holds the credential data. The only hard refusal is the same passkey credential landing twice, which has no legitimate use. `duplicate-phrase-import.test.ts` drives the confirm flow.

## Lessons

### E2E coverage

The previous plan's gate named three account export and import smoke tests that were never written. They exist now: round trip into a second profile (plain and encrypted, pasted and from a file), tamper rejection, and same-profile duplicate rejection (`account-import-export.test.ts`). A coverage audit against the tree found seven further behaviours with no e2e, and all now have one. An imported key survives lock and a real service-worker kill, a password change reseals the key and the old password stops working, a MAC tamper leaves a derived-only unlock, restore rewraps imported rows onto a fresh key, the guard works on the backup path, and a file-imported account signs and proves in a second profile. The new passkey execution canary (`apps/extension/tests/e2e/network/passkey-execution-canary.test.ts`) registers a passkey profile through a virtual authenticator, deploys with a real proof, consumes an authwit, and signs again after a worker restart that re-runs the ceremony.
