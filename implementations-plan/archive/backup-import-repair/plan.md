# Backup import repair

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: The profile service's late-activation step in `apps/extension/src/wallet/services/profile/service.ts`, the import composable `apps/extension/src/composables/useFullBackupImport.ts`, the activation wait `apps/extension/src/composables/waitForProfileActive.ts` and the import page `apps/extension/src/popup/pages/import.vue`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Opening the session is a separate last step. `restore()` writes the profile and opens nothing. After the composable has restored every backup slice (networks, accounts and the rest), it calls `finalizeRestore(profileId, password)`, which opens the session for the imported profile. A password profile re-derives its key from the password. A passkey profile reuses the secret recovered during `restore()`, held only in memory, so the person sees no second authenticator prompt.

The import page then waits for the imported profile specifically to become the active one, with a timeout. If the timeout fires, it sends the person to the unlock screen with a toast that says the profile was imported. Success shows a toast, and the button reads "Finishing import…" during the hand-off. Failures use the existing inline banner only.

## Why

A full-backup import used to leave the person on the import screen with no button to press. `restore()` deliberately never opened a session, and the app flips to "logged in" only when a session opens, so the page's completion wait never ended. The profile was in storage, so a reload and a manual unlock recovered it, but the hand-off was broken on every entry path.

Opening the session inside `restore()` was the obvious fix and the wrong one. The session-opened event makes the shell seed default networks and create a default account for the empty profile while the composable is still restoring the backup's own, so the two writers race into the same storage with duplicate chain ids and addresses. Late activation avoids that by construction.

The wait had to key on the imported profile's id, not on "some profile is logged in", or it passes at once for a person who was already unlocked as another profile. The duplicate-account check also never matched, because the messaging layer rebuilds a thrown error as an `Error` object and the code compared it to a string. Duplicates now roll the new profile back (network rows are purged by the profile-deleted cascade) and show "An account from this backup is already in your wallet".

## What shipped

- `finalizeRestore` on the profile service, its spec and client, replacing the untyped cast in the composable.
- A password-profile `restore()` that seals inside the `try`, so the finally block always zeroes both buffers.
- The composable's rollback on a duplicate account, a re-throw on any other account failure, and one profile client kept for the whole function.
- `waitForProfileActive` and the page's success toast, timeout fallback and loading button.
- Unit and component cases for each branch, including the duplicate rollback, which fails against the old comparison, and smoke coverage in `apps/extension/tests/e2e/import-paths.test.ts`.
