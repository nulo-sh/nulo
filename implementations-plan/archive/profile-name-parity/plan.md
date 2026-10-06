# Profile-name parity

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: one profile-name field shared by onboarding and the popup, in `apps/extension/src/composables/useProfileNameField.ts`, used by `apps/extension/src/composables/useProfileCreateFlow.ts` and `apps/extension/src/composables/useProfileImportFlow.ts`, with the typed name threaded through `apps/extension/src/composables/useFullBackupImport.ts`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Onboarding and the popup create and import profiles differently: onboarding asks for a name and says "Wallet", while the popup invented a name and said "Profile". The plan aligned both on "Profile" and gave both the same name experience before a profile is created.

- **Term**: "Profile" was chosen for every user-visible surface that means the account record. Identifiers that mean the Nulo app (locking, opening, connecting a dApp, the version row, the SDK's `walletId` and `walletName`, RPC method names, the `wallet-version` backup key) keep "wallet", because they name the app or a wire format.
- **Name field**: Create and Import in the popup get the onboarding input: 1 to 32 characters, trimmed, checked on submit with a shake and an inline error, focus restored. The checks live in one composable, `useProfileNameField`. Its `validate()` stays synchronous and the parent fetches the existing names inside its submit latch.
- **Full-backup import**: the typed name is threaded through `useFullBackupImport` into the profile that is restored, and the name parsed from the backup is exposed so the page can prefill the input. The prefill applies only while the input is empty, so a slow parse never overwrites typing. The restore receives a clone of the profile, never the parsed object mutated in place.
- **Duplicates**: direct Create and Import hard-block a name that matches another profile, compared case-folded after NFKC normalization. Full-backup import keeps the service's auto-suffix, so two backups with the same name can both be restored.
- **Length**: the rename popup's cap moves from 25 to 32 to match.

## Why

- The typed name on the full-backup path was silently dropped in favour of the name embedded in the backup, an existing bug in onboarding that the same change fixed for both surfaces.
- Making the name required removed the popup's auto-generated names, so without a uniqueness check two profiles called the same thing were easy to create.
- A synchronous `validate()` closes a double-submit window: with an async one, two quick clicks both pass the in-progress check before either reaches the latch.

## What shipped

- Both flows share the name field and the duplicate check through the create and import flow composables, and the rename popup caps names at 32.
- The full-backup composable accepts the optional name and returns the parsed name, both no-ops when absent.
- The onboarding titles still read "Create Wallet" and "Import Wallet" in the tree, so the wording half of the plan did not survive as written; the name field, duplicate check and name threading did.
- The e2e fixtures that relied on the old names were updated alongside, selecting by `data-testid` only.
- The new inputs use the sanitizing input mode like the rename popup. Out of scope: service-side name validation and confusable-script detection.
