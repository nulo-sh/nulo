# Passkey ceremony in an in-page modal

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: `apps/extension/src/components/passkey/PasskeyCeremonyDialog.vue` and `apps/extension/src/composables/usePasskeyCeremony.ts` run the ceremony inside the popup, backed by the shared helper in `apps/extension/src/wallet/utils/passkey-ceremony.ts`. The window route `apps/extension/src/popup/windows/passkey/index.vue` is kept as the second host.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Run passkey registration, unlock and import in a modal inside the existing popup instead of a separate browser window. Keep the window-based path as a thin second transport for future flows where the background must ask for a passkey with no popup open, and make both hosts call one shared ceremony helper so the WebAuthn parameters cannot diverge.

The background-side methods that create, unlock or import a passkey profile accept optional credential data. When given, they materialize the credential directly. Otherwise they fall back to the window path.

## Why

Chromium's virtual authenticators are scoped to a frame tree, so a ceremony in a second window cannot see credentials registered in the popup. That blocked the lock-then-unlock and register-then-export end-to-end tests. An in-page ceremony also removes a floating secondary window, and other wallets ship this pattern.

The window path stays because the background has no DOM, and a future dApp-triggered passkey confirmation needs a host. Keeping it thin costs little and re-creating it later costs more.

Two latent bugs would have been inherited and were fixed first:

- Profile creation could regenerate its id after the credential was bound to the old one, leaving the stored profile and the credential's user handle out of sync. A conflict now raises a retryable `ProfileIdConflictError` and the caller reruns the ceremony.
- A comment claimed the unlock flow held a lock across the authenticator prompt, which was no longer true.

## What shipped

- The dialog is non-dismissible: no click-outside, and Escape, unmount and an explicit cancel all abort one `AbortController` whose signal reaches the WebAuthn call.
- Callers render the dialog with `v-if` and a page-local composable, not through the shared popup store, whose click-outside dismissal contradicts the policy.
- Cancel paths (Escape, dismount, an explicit cancel, the authenticator prompt dismissed) are normalized to the existing user-rejected error rather than matched by message text, so a cancelled ceremony returns the user to the screen they came from without an error toast.
- The window route stays as the second host and is marked as having no production caller today.
- `apps/extension/tests/e2e/passkey-paths.test.ts` covers register, lock then unlock, and register then reset then import by passkey discovery, all inside the popup's own frame tree and so on one virtual authenticator.
- A passkey round trip in a fresh extension instance or across browsers is still impossible because the PRF output is not portable. The reset-then-import test is the closest same-frame proxy, and a register, export a plain key, import test was planned but is not what the file contains.
