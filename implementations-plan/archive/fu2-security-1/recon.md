# fu2-security-1 recon

Base: `origin/dev` at `1e6c5bc1f`. One Sonnet explorer, plus the planner's own reads of the touched files, the page 93 record, the lab's ranked observations and the option renders the owner signed (`p93-22-b`, `p93-27-c`, `p93-37-b`, `p93-38-c`, `p93-40-c`, `p93-59-b`, `p93-72-b`, with their branch-only prototypes on the render lanes' unpushed branches). Paths are under `apps/extension/` unless they name a package.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| Recovery card the lock screen opens | `ForgotPasswordPopup.vue` via `popupStore.open('forgot_password')` (`src/popup/pages/auth.vue:450`) | reuse as is |
| Quiet link style | `.reset_link` (`auth.vue:547`, `type--label-section`), the style the P93-22 B render keeps | reuse as is |
| Hide a type-dependent control until the profile is known | `.unknown` (`auth.vue`, `visibility: hidden`) on the heading and form | reuse |
| Error line under a field | `ProfileNameField.vue:34` (`Text variant="body" color="txt-danger" role="alert"`) | reuse the pattern |
| Success toast | `useToast().openToast` (`packages/design/src/composables/toast.ts`), already called at `change-password.vue:75` | adapt: label only |
| Encrypt then download | `runEncrypt` and `runDownload` in `src/composables/useFullBackupExport.ts`, each fenced and latched | adapt: one sequencing method |
| File-password pair | `FilePasswordSection.vue` (also used by `export/account.vue:426`) | adapt: opt-in repeat label |
| Navigation row with a description | `SettingItem.vue` (description one ellipsized line at 359 px and wider, `:312-321`; wraps below, `:326-352`) | adapt: opt-in wrap |
| File name segment | `profileFileNameSegment` (`src/utils/files.ts:32`): still used by contacts and account export, so it stays | not used by the new name |
| Date stamp for a file name | none (searched `toISOString().slice`, `padStart(2`, `filename` in `src/`) | build new, one pure function in `src/utils/full-backup-helpers.ts` |
| Download | `downloadFile` (`src/utils/files.ts:36-90`): `chrome.downloads.download`, no `conflictAction` (so Chrome and Firefox uniquify a repeated name), no user activation needed; gzip replaces the last extension (`:231-237`) | reuse as is |
| Before and after pictures | `shotSend` (`tests/e2e/fixtures/shots.ts:19`, opt-in under `NULO_E2E_SHOT_DIR`); wrap-3's scratch capture specs | reuse the scratch-spec method |

## Tests and helpers the change touches

- **Full backup.** `src/popup/pages/settings/security/export/full.test.ts` (protect and download clicks, banner and file-name assertions at `:219-797`), `full-passkey.pins.test.ts` (`protectButton`/`downloadButton` at `:445-446`, `:556`; file name `:501`; the password-changed-before and after Protect pins `:585`, `:595`), `src/composables/useFullBackupExport.test.ts` (Protect then Download `:540-549`, `:590-593`). E2E helpers `tests/e2e/helpers/backup-export.ts` (`downloadEncryptedBackup`, `downloadPasskeyBackup`; every network export goes through them, `handshake-import.ts:201-203` included) and `helpers/profile-chaos/backups.ts:32`. Specs naming the retired controls directly: `security-backup.test.ts:126-140`, `backup-roundtrip.test.ts:46-75`, `passkey-backup.test.ts:145-175`. Helper callers: `backup-imported-account`, `legal-acceptance` (real pointer), `toolbar-panel`, `update-replay` (runs only with `NULO_E2E_UPDATE_FROM`), `profile-chaos`.
- **Back up profile.** No unit test for `export/index.vue`; `security-backup.test.ts:70` clicks `seed-phrase-link-btn`.
- **Lock screen.** `src/popup/pages/auth.test.ts` stubs `Tooltip` (`:170`, `:1084`) and checks `auth-reset` focus (`:1202`); `tests/e2e/tooltips-glossary.test.ts:236-262` is a test of that tooltip; `fixtures/auth.ts:385` and four network helpers press `auth-reset` by testid only.
- **Delete profile.** `reset.test.ts` (`mountReady`, `:69`); `fixtures/profiles.ts:192` by testid only. No test reads the third box's text.
- **Change password.** `change-password.test.ts:14` makes a fresh `openToast` spy per call (hoist it to assert); e2e `security.test.ts:57`, `imported-account-lifecycle.test.ts:100` and `helpers/profile-chaos/drivers.ts:508` match "Profile password changed".
- **Guards that scan the edits.** `src/utils/copy-dash-ban.test.ts`, `red-text-ban.test.ts`, `type-role-ban.test.ts` (no reviewed entry names a touched file), `toast-call-sites.test.ts`.
- **Component-level cover of the tooltip rules** after the lock-screen e2e goes: `src/components/Popup/Popup.tooltip.test.ts:73` and `packages/design/src/ui/Tooltip.test.ts:244-335`.

## Collisions

- **fu2-copy-1 (P93-13 B)** fixes the grammar of the same third box in `reset.vue`; P93-40 C replaces the sentence. Whichever lane merges second keeps P93-40 C's words (recorded on #1529).
- **#1453** (open) plans one password-entry component; this lane's `FilePasswordSection` edit is one flag and one label.
- **fu2-home-1 (P93-62, crowding at 240 px)** may touch `SettingItem`; this lane adds one opt-in class and no width rule.
- No open or closed issue covered any of the seven items (searched each title's words, "Forgot your password", "NuloEncryptedBackup", "Password changed", "no assets left", "Doesn't match"); filed #1528 to #1534.
