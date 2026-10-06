# Passkey modal for export and import

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: passkey profiles run the full-backup export and import ceremonies in the page's `PasskeyCeremonyDialog` modal and hand the credential to the service: `apps/extension/src/popup/pages/settings/security/export/full.vue`, `apps/extension/src/composables/useFullBackupImport.ts` and `apps/extension/src/wallet/services/profile/service.ts`, covered by `apps/extension/tests/e2e/passkey-backup.test.ts`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Move the last two popup-originated passkey ceremonies, export of a full backup and import of one, from a service-worker-opened window to the in-page modal the create, unlock and import-discovery flows already use. The popup runs the ceremony and passes `credentialData` to `exportPlain` and `restore`.

The window fallback is removed from those two methods: for a passkey profile `credentialData` is required and a missing value throws. Keeping a shim would have preserved a second code path nobody exercised. `confirmProfileOperation` stays, because the confirm popup is still a caller. The ceremony is threaded into the import composable as a "do the thing" function supplied by the page, matching the composable conventions.

## Why

Two flows still used the older window path, which made them inconsistent with the rest of the wallet and unreachable by the virtual authenticator e2e, whose credentials are scoped to a frame tree. The modal runs in the same frame tree as registration, so a credential created at register is reachable by later export and import in the same session.

Review found problems the first draft would have shipped:

- Swapping in `recoverFromCredentialData` without binding the credential would let a buggy or hostile popup supply data for a different key. Export now checks the recovered credential id against the profile's stored one, and restore checks it against the id recorded in the backup, failing with an invalid-profile or mismatch error. The recovered secret is zeroed in export, which does not need it.
- A cancelled ceremony surfaced as a failure toast on import and left export on a dead screen. Cancel is now silent: export returns to its agreement gate and import resets its status so the form is usable.
- The existing backup e2e runs against a password profile, so editing it would have lost the password smoke and not tested the new path. A separate passkey test was added.

## What shipped

- `exportPlain` and `restore` accept `credentialData`; the wire change is additive, with no new RPC methods.
- The export page and the import composable run their ceremonies in the modal and treat a user rejection as a silent cancel.
- Service integration cases for the export and restore paths and the two mismatch rejections.
- An e2e file covering the export modal, the cancel reset and an in-session export and import round trip through a synthetic backup.

Cross-extension round trips stay untestable because PRF output is not portable between extension instances; see `apps/extension/tests/e2e/PRF-NON-PORTABLE.md`.
