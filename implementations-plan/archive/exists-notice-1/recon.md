# exists-notice-1: recon

Base: `origin/dev` at `eb0dd17fa`. Two Explore agents (sonnet) and direct reads. Paths are under `apps/extension/src/` unless they start with `packages/` or `tests/`.

## The refusal

`wallet/services/profile/service.ts` throws `new Error("Passkey profile already exists")` at three sites:

- **S1** `assertNotDuplicateCredential` (`:2083-2089`): a live (not reserved) passkey row has the same `credentialId`.
- **S2** `importPasskeyProfile` (`:2166-2168`): the credential's `userHandle` is a stored profile id (`repo.contains`, key-based, true for an undecodable row) or a reserved id (a deletion in progress, or a failed purge, which keeps it reserved across restarts).
- **S3** `commitRestoredPasskeyProfileHoldingLock` (`:2495-2498`): the same id check as S2, in a passkey full-backup restore. S1 follows S2 and S3.

A credential this wallet created carries the profile id as its `userHandle`, so a still-present profile trips S2 first; S1 fires when the handle is absent or differs.

## Flows that reach it

| Flow | Path | What the person sees today |
|---|---|---|
| F1 popup Import, Passkey (PATH A) | `popup/pages/import.vue` → `composables/useProfileImportFlow.ts:196-217` `handleImportPasskey` → `importPasskey` (`service.ts:884`) → S2/S1 | `passkeyImportFailedNotice()` (`utils/profile-flow-notices.ts:18-30`): "Profile import failed … This authenticator may not be supported … Try again or use another one." + the Windows Hello note. Reached from the lock screen: profile pill → `SelectProfilePopup.vue:66-69` → `/popup/import?from=/popup/auth`. |
| F2 onboarding Import, Passkey | `onboarding/pages/import.vue:113`, same composable | Same notice (`NotificationManager` is mounted in both shells). Reachable when a passkey profile exists while an onboarding tab is still open. |
| F3 Firefox toolbar panel (PATH B) | `passkeyNeedsOwnWindow()` → no in-page ceremony; the worker opens `#/windows/passkey`; `reportToPasskeyWindow` (`service.ts:933-942`) calls `finish("failed")` and rethrows | The passkey window's `step-failed` screen: "Couldn't / import the passkey", "Close this window and try again from Nulo." (`utils/passkey-copy.ts:31,49`). The panel is already closed, so the popup notice is never seen. The window learns only `PasskeyStepOutcome = "done" \| "failed"` (`wallet/services/passkey/spec.ts:64`). |
| F4 full-backup restore of a passkey backup | `useFullBackupImport.ts:334-362` → `restore` → `restorePasskeyProfile` → S3/S1; the catch (`service.ts:2465-2472`) flattens all but `DuplicateWalletError` into `restoreError` (its message) | The full-backup box (`import-full-backup-error`): title "Import failed", message "Passkey profile already exists". Already names the cause. No UI pre-check. |
| Restore again | `useRestoreAgain.ts` restores the account-state slice only | Not reachable. |
| Create passkey profile | `createPasskeyProfile` (`service.ts:740-790`) | Not reachable: the authenticator mints a fresh credential; its only race is `ProfileIdConflictError`. |

## The typed-error idiom

- `packages/extension-messaging/src/errors.ts`: `WalletError` subclass with `static CODE`, a frozen literal name through `super`, listed in `REBUILT_AS` (`:613-643`), which keeps the concrete class (an unlisted code rebuilds as a base `WalletError`). The service side serializes with `toPayload()` (`core/error-response.ts:25-33`); the client rebuilds with `walletErrorFromPayload` (`:655`), so `instanceof` survives.
- Precedent: `DuplicateWalletError` (`:570-576`) carries `details.existingProfileName`, read at `useProfileImportFlow.ts:112-113`; "the error NEVER carries key material".
- `errors.test.ts:129-466`: the `rows` table must list every exported subclass (`:370`); a class missing from `REBUILT_AS` fails the rebuild row (`:387`).
- Not dApp-facing: profile-service methods are popup RPCs; `toWalletResponseError` and `classifyOperationCatch` need no entry.
- `utils/passkey-copy.ts:91-96` `handleCancelOrUnconfirmed` classifies by `instanceof` and DOMException name, never by message.

## Tests that exist

- `service.integration.test.ts:3637-3643` pins S1 with `rejects.toThrow(/already exists/)`; `:1155-1162` pins PATH B outcomes `["done","failed"]` for a second import of the same passkey. No test pins S2 alone or S3.
- `useProfileImportFlow.test.ts:203-211` "passkey generic failure notifies once" (a ceremony failure); the only `importPasskey` rejection is the `DuplicateWalletError` confirm-retry (`:318`), so no terminal service rejection reaches the notice in a test.
- `profile-flow-notices.test.ts:35-46` pins today's notice exactly.
- `popup/pages/import.test.ts` mocks the flow and captures its options (`holder.opts`); `onboarding/pages/import.test.ts` wraps the real flow (`:53`) and spies `create`.
- `popup/windows/passkey/index.test.ts:166-200`: the `step-failed` cases.
- e2e: `tests/e2e/passkey-toolbar-panel.test.ts:365-390` (Firefox only, smoke) asserts `data-state="step-failed"` and `passkey-window-error` for the duplicate import from the dying panel. No e2e asserts the popup notice.

## Notices and pictures

- `stores/notification.store.ts`: `{ type, payload: { title, description, note?, onConfirm?, onCancel?, confirmText?, cancelText? } }`; `components/NotificationManager.vue` renders it; only `notification-description` has a testid.
- Pictures: the migration-rule-1 lane's ad-hoc capture (a vitest file outside the repo over `vitest.e2e.config.ts`, a virtual authenticator, `renameProfile(page, "Daily")`, 400×600 at scale 2, `theme` attribute light then dark). This lane reuses the method from its own scratch dir.

## Overlap with other lanes

- migration-rule-1 holds `useFullBackupImport.ts` and the full-backup box's words (its OA-1). F4 stays untouched here, so no file overlaps.
- Onboarding's draft #743 holds onboarding's import screens; this lane changes one wiring line in `onboarding/pages/import.vue`.
