# Recon: security-ui-1

Base: `origin/dev` at `90f4fb3`. Two read-only explorers (backup format and crypto; UI surfaces and e2e hooks), then a direct read of every file the plan changes. Paths are repo-relative.

## Reuse map

| Capability needed | Existing code | Verdict |
|---|---|---|
| A fresh random 32-byte key for one backup | `generateImportedKeysDek()` in `packages/wallet-crypto/src/imported-keys-dek-box.ts` | reuse-as-is |
| Seal that key for a passkey backup | `sealDekUnderWrapKey(wrapKey, dek)` in the same file (AAD `nulo:profile-imported-dek:v1`); the passkey export already seals a fresh DEK this way (`profile/service.ts` `exportPasskeyCredential`, around `:1745-1758`) | reuse-as-is |
| Re-seal one imported signing key under another key | `unsealImportedSigningKeyV2` / `sealImportedSigningKeyV2` in `packages/wallet-crypto/src/imported-account-key-box.ts` (row key = HKDF of the key with info `nulo:imported-account-key:v2|chainId|address`) | reuse-as-is |
| The restore side of a key swap | `ProfileService.restore` stashes `{ sourceDek, destinationDek }` (`pendingDekRewraps`, `profile/service.ts:162-175`); `AccountService.restoreImportedKeys` (`account/service.ts:772-815`) opens each row with `sourceDek` and seals it under `destinationDek` | reuse-as-is: it accepts any 32-byte source key, so a per-backup key restores with no restore change |
| AccountService pulling a DEK from ProfileService with fresh auth | `profileService.exportImportedKeysDek(profileId, password)` used by the account export (`account/service.ts:428`) | adapt: same direction and posture, for the full-backup export |
| Password encryption with associated data | `EncryptionKey.encrypt(payload, aad?)` / `decrypt(payload, aad?)` (`packages/wallet-crypto/src/encryption-key.ts:42`, `:68`) | reuse-as-is: the AAD parameter already exists on the published class |
| A fixed purpose tag as AAD | `ACCOUNT_EXPORT_AAD = "nulo:account-export:v1"` (`packages/aztec-runtime/src/account/account-export.ts:35`) | reuse the convention |
| Encrypted-file detection on restore | `detectBackupType` (`apps/extension/src/utils/full-backup-helpers.ts:43-53`): `{`/`[` is plain, base64 with `bytes[0] === 0` is encrypted | adapt: recognise the versioned encrypted file |
| Encrypted-file opening on restore | `openEncryptedBackup` (`apps/extension/src/composables/useFullBackupImport.ts:247-266`), no AAD today | adapt |
| A confirmation before a risky action | `ConfirmPopup.vue` through `cacheStore.confirm` + `popupStore.open("confirm")` (`apps/extension/src/popup/components/popups/ConfirmPopup.vue`; reference use `settings/connected-apps/index.vue:81-88`); Cancel first, the confirm button second; testids `confirm-pre-title`, `confirm-title`, `confirm-description`, `confirm-cancel`, `confirm-submit` | reuse-as-is for the export page (it renders in the popup shell) |
| A quiet secondary control under a primary button | `Button` variant `text` (`packages/design/src/ui/Button.vue:15-30`, `:294-308`); no use in `src` today (only `Button.stories.ts:102`) | reuse, styling unproven in place |
| Ending a dApp session and forgetting its row | `DappSessionServiceClient.deleteDappSession(id)` (`dapp-session/service.ts:387-398`, client `:31`); its `onDappSessionDeleted` drives `wireSessionTeardown` (`wallet-sdk/background.ts:631-660`), which terminates every live session on that `(origin, chainId)` | reuse-as-is |
| Ending a live session without deleting the row | none. Searched `terminate` across `wallet/services/dapp-session/**`; the only `handler.terminateSession` callers are background-internal (`background.ts:153,164,453,653,1271`, `session-established.ts`) | build new only if the owner picks "closing ends the session" (see options.md) |
| Telling a verify window's close apart from OK | none. `verify-admission.ts:164-168,247` frees the slot on removal and reads no reason | build new only for the same pick |
| Two-theme screenshots in e2e | `shotSend(page, name, focus)` (`apps/extension/tests/e2e/fixtures/send-page.ts:209-235`), gated on `NULO_E2E_SHOT_DIR` | reuse (pass a testid that exists on the page) |
| Capturing a backup download in e2e | `armBackupDownloadCapture` / `readCapturedBackupDownload` / `exportPlainBackup` (`apps/extension/tests/e2e/helpers/backup-export.ts:24-85`) | adapt per the #34 pick |
| A backup-format version field | none separate. `compat-epoch` (hard reject, `{5}` only) and `backup-schema-version` (equals the storage schema version, `realMigrations` empty, so it is 1). Searched `CURRENT_BACKUP_SCHEMA_VERSION`, `BACKUP_SCHEMA_VERSION_FIELD`, `COMPAT_EPOCH_FIELD`, `CURRENT_COMPAT_EPOCH` over `apps` and `packages` | build new: a version label on the encrypted file only (see plan) |
| Old-format backup fixtures | none on disk. The legacy shape is the inline builder in `apps/extension/src/composables/useFullBackupImport.test.ts:171-233` (`compat-epoch: 5`, `backup-schema-version: 1`, `imported-keys-dek`), and its decrypt tests encrypt with no AAD (`:1986-1996`, `:2247-2280`) | reuse as the "old backup still restores" fixture |

## Backup format and import gate

- Constants: `COMPAT_EPOCH_FIELD = "compat-epoch"`, `BACKUP_SCHEMA_VERSION_FIELD = "backup-schema-version"`, `CURRENT_COMPAT_EPOCH = 5`, `SUPPORTED_COMPAT_EPOCHS = {5}` (`backup/backup-migration-registry.ts:58-90`); `CURRENT_BACKUP_SCHEMA_VERSION = maxBackupSchemaVersion(realMigrations)`, which is 1 (`backup/backup-migrator.ts:63-74`, `storage/migrations/index.ts:19,26`).
- Import order (`validateAndMigrateBackup`, `useFullBackupImport.ts:72-140`): checksum, compat-epoch, schema version range, then `migrateBackupData` over `backup.data` only. The registry never reads envelope fields.
- Envelope fields (`master-key`, `entropy`, `imported-keys-dek`, `imported-keys-dek-sealed`, `active-chain-id`) are checked by `buildRestoreSecret` (`apps/extension/src/composables/full-backup-restore.ts` `:221-262`) and by `ProfileService.restore` (DEK length 32).
- Consequence for #17: a `backup-schema-version` bump needs a real storage migration, which CLAUDE.md § Persisted-storage forbids before production; a `compat-epoch` bump rejects every old backup. Neither field fits a change that keeps old backups restoring.
- Logger redaction already names `imported-keys-dek` and `imported-keys-dek-sealed` (`apps/extension/src/wallet/logger/utils.ts:94-97`). A new envelope field name would need adding there.
- No test pins the envelope's exact key set or order; the checksum round trip is order-sensitive but self-consistent.

## The imported-keys key (DEK)

- Password export: `ProfileService.exportBackupMaterial` (`profile/service.ts:1793-1860`) returns the long-lived DEK as base64; the comment at `:1814-1836` scopes the forward-reach limitation and names the fix. An unopenable slot exports a fresh DEK (`:1851-1856`).
- Passkey export: `exportPasskeyBackupMaterial` → `exportPasskeyCredential` (`:1716-1785`) returns the stored `dekSealed` verbatim, or a fresh DEK sealed under the ceremony's `dekWrapKey`. `exportPasskeyCredential` is shared with `exportPlain` (`:1666`).
- RPC exposure: `exportBackupMaterial`, `exportPasskeyBackupMaterial` and `getProfileDekSealed` are popup-callable (`profile/client.ts:117-119`, `profile/service.ts:97-99`). So today the popup receives the plaintext DEK of a password profile.
- Rows: `AccountService.backupImportedKeys()` (`account/service.ts:759-763`) returns ciphertext rows `{ profileId, chainId, address, encryptedSigningKey }` for the active profile. Only `full.vue:105` calls it in production.
- A password change rewraps the DEK under the new password (`profile/service.ts:1155`); nothing rotates it.

## Encrypted backup file

- Export: `handleEncrypt` (`full.vue:332-373`) encrypts the compact payload with `EncryptionKey.fromPasshash(getPasshash(password))`, no AAD, and saves base64 text through `downloadFile(..., "gzip")`. The encrypted file is `NuloEncryptedBackup_<name>_<ts>.gz`, the plain one `NuloBackup_<name>_<ts>.gz` (`files.ts` replaces the extension).
- Frame: `[0x00][12-byte IV][ciphertext + tag]`; key = PBKDF2-SHA256(SHA-256(password), salt = SHA-256(IV), 600,000) (`encryption-key.ts`).
- For a password profile the encryption password is the profile password the person typed to create the backup; for a passkey profile it is a new password typed twice on the page.
- Restore: `detectBackupType` then `openEncryptedBackup` (no AAD); one catch reports "Decryption Failed" for a wrong password, corruption or a wrong format.

## The export page today (`full.vue`)

- States: agreement gate → (password) unlock and Create Backup → `progress` → `finished` (info banner "Backup is ready … we strongly recommend to encrypt it before downloading.", `:557-564`) → optional `encrypting` → `encrypted` (done banner).
- Bottom buttons (`:643-667`): `protect-password-btn` (`cta`) and `download-backup-btn` (`cta_outline`, `cta` once encrypted). Download is enabled at `finished`.
- Passkey: the first Protect press hides the info banner and shows the two password fields (`backup-encrypt-password-input`, `backup-encrypt-password-confirm-input`); the second press encrypts.
- Enter on the page (`onKeydown`, `:397-413`) runs Create, then Encrypt, then Download; it never downloads an unencrypted file.
- Passkey plain backup content: `master-key` is the credential id, `imported-keys-dek-sealed` is sealed under the passkey's PRF wrap key, imported-key rows are sealed under the DEK, and account rows hold no key (`account/spec.ts:136-156`). So it reveals accounts, contacts, activity and registered contracts, but no key that moves funds without the passkey.

## The emoji check today (`windows/verify/index.vue`)

- One page serves both cases: `session-established.ts` either navigates the waiting connect window to it (`showVerifyInConnectWindow`) or opens a new window for an untrusted reconnect (`openVerifyWindow`). One component change covers both.
- Controls: the "Always trust" toggle (`verify-always-trust-toggle`, label and sub-label at `:170-171`) and OK (`verify-confirm-btn`, `:176-186`). OK writes `setTrustedVerification` when the toggle is on, then `closeCurrentWindow()`.
- The same "Always trust" label and an emoji caption sit on the app's settings page: `components/modules/settings/connected-apps/DappSessionVerification.vue:20-32`, used by `settings/connected-apps/[id].vue:355-356`.
- Closing the window only frees its admission slot; the session stays live.
- `handleSessionEstablished` returns `true` once the window is shown, so dApp calls dispatch before the person answers. That is #15, outside this lane: "They don't match" cannot undo a call already dispatched.
- A row deleted while its session re-establishes is refused (`session-established.ts:97-104`), so deleting the row fails closed for a restored discovery.

## Tests to match

- `export/full.test.ts`: mounts with `createTestingPinia`, mocks each client, runs the real assembler. `:274-293` and `reachBackupReady` assume Download is enabled at `finished`. The encrypted-file test mocks `fromPasshash` to `{ encrypt: async () => sealed }`, so an added AAD argument still passes it: a new test must assert the AAD.
- `export/full-passkey.pins.test.ts`: passkey paths, the DEK carried into the file (`:244`, `:266`); it does not press Protect or Download.
- `windows/verify/index.test.ts` and `index.window.test.ts`: the mocked `DappSessionServiceClient` has no `deleteDappSession`; `index.window.test.ts` logs call order (`getDappSession`, `setTrustedVerification`, `getCurrent`, `remove:7`), the template for a "delete, then close" assertion.
- `composables/useFullBackupImport.test.ts`: the legacy builder and the no-AAD decrypt tests.
- `utils/copy-dash-ban.test.ts` scans every string, template text and attribute under `apps/extension/src`; no test pins the verify window's copy or the export banner's copy.
- `utils/glossary.ts` has three entries (`sponsored`, `authorization`, `proving`); none for the emoji check or backup encryption.

## E2E hooks

- Full-backup export page (smoke, `apps/extension/tests/e2e/*.test.ts`): `security-backup.test.ts:34-57` (password profile: agree, unlock, Create, then waits for both buttons enabled) and `passkey-backup.test.ts:122-279` (passkey: Protect, the two password fields). Shared driver: `helpers/backup-export.ts` (`exportPlainBackup`, `:63-85`).
- Plain-download consumers that a no-plain-path pick would break: `helpers/backup-export.ts` (`exportPlainBackup`, used by `helpers/crash-truth.ts`, `network/backup-import-stalled-network.test.ts`, `network/backup-restore-integrity.test.ts`, `network/backup-migration-roundtrip.test.ts`), `helpers/handshake-import.ts:188-203`, `backup-imported-account.test.ts:73-88`, `legal-acceptance.test.ts:136-151`, `passkey-retry.test.ts:114-121`, `passkey-toolbar-panel.test.ts:429-496`, `network/account-balance-orphans.test.ts:141-147`. `backup-roundtrip.test.ts:35-64` already encrypts.
- Verify window (network only, `apps/extension/tests/e2e/network/`): `fixtures/popups.ts` `approveConnect` (`:149-170`, returns the connect window once it shows the check), `approveVerify` (`:176-208`), `waitForPopup(ctx, "verify")` (`:23`); `fixtures/extension.ts` `connectPlayground` (`:327-358`) and the `dappConnectedExtension` fixture; `fixtures/send.ts:12-19` `reconnectPlayground`. Specs: `network/connect-dapp.test.ts`, `connect-deny`, `connect-one-window`, `session-*`. No smoke spec opens the window: the smoke suite starts no playground, and a hand-seeded row fails its MAC.
- Screenshots: `shotSend` scrolls to a testid, waits up to 3 s for entering popups, shoots `<name>.png`, flips `document.documentElement`'s `theme` attribute, shoots `<name>-<other>.png`. Known gap, already fixed by #66, which waits out the transition: the second shot can catch a 0.2 s colour transition.
