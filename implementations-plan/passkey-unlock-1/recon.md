# passkey-unlock-1: recon

Base: `origin/dev` at `face80099`. Three read-only explorers (sonnet) plus the planner's own reads. Paths are relative to `apps/extension/src/` unless they start with `packages/`, `apps/`, `legal/`, `scripts/`, `infra/`, `reference/` or a root file name. `P` = `wallet/services/profile`, `WC` = `packages/wallet-crypto/src`.

## Reuse map

| Capability needed | Existing code | Verdict |
|---|---|---|
| Recovery phrase from 32 random bytes | `P/service.ts:695-702` (`createProfile`), `packages/wallet-core/src/utils/mnemonic.ts` (`getMnemonic`, `getEntropy`, `canonicalizeMnemonic`) | reuse as-is |
| Phrase → master | `WC/mnemonic-master.ts` `deriveMasterFromMnemonic` (BIP-39 PBKDF2-SHA512, `Fr.fromBufferReduce`) | reuse as-is |
| Master → accounts | `WC/derive-account-seed.ts`, `WC/account-derivation.ts`, `wallet/services/account/service.ts:366,677,881` | reuse as-is: the passkey profile takes the password path, no regime change |
| Seal guard, master and entropy under one key, purpose AADs | `WC/password-secret-box.ts` (`PROFILE_AAD`, `ENCRYPTION_GUARD`, `sealInternal`/`unsealInternal`) | adapt: the internals take `EncryptionKey` (PBKDF2-600k per frame); a passkey key is an AES-GCM `CryptoKey`. Generalize the internals over the key; keep the password bytes identical |
| AES-GCM frame under a `CryptoKey` | `WC/aes-gcm-frame.ts` `sealFrame`/`openFrame`; `WC/imported-keys-dek-box.ts` `sealDekUnderWrapKey` | reuse as-is |
| Words↔master pairing check at unlock | `P/service.ts:2123` `assertEntropyMasterPair` | reuse as-is |
| Envelope MAC over the sealed row | `P/profile-row.ts` `envelopeMacFor`, `WC/entropy-mac.ts` (v3, keyed `HKDF(master‖dek)`) | adapt: password-typed today (`Extract<Profile, {type:"password"}>`); widen to both types |
| Session open, row keys, PXE key | `P/service.ts:361` `fillRowKeysHoldingLock`, `:1373` `openSessionVerified`; `P/row-keyring.ts` (`deriveRowKeys(master, id, pxeGeneration)`) | reuse as-is: keyed off the master, so a phrase-derived passkey master gets the same machinery |
| Silent session restore after a worker restart | `P/session-manager.ts:283-301` (bearer only for non-strict password profiles), `:584-588` (passkey skipped) | reuse as-is; widening it is a behaviour change (OA-10) |
| Re-seal under a new credential | `P/service.ts:1274` `changeProfilePassword`, `PasswordSecretBox.reseal`, `:1217` `rekeyedDekForPasswordChangeHoldingLock` | adapt for an unlock-method change (OA-6). No unlock-method or type conversion exists (searched `rewrap|reseal|re-encrypt|changePassword|unlockMethod|convertProfile` over `apps`, `packages`) |
| Ceremony (create, get, discovery) on both browsers | `wallet/utils/passkey-ceremony.ts` `runPasskeyCeremony`; `components/passkey/PasskeyCeremonyDialog.vue` (in-page); `popup/windows/passkey/index.vue` + `wallet/services/passkey/service.ts` (Firefox toolbar window); `utils/own-window.ts` (page moves to its own window) | reuse as-is; the window folds every step but create and import into "unlock" (`windowStep()`) |
| Passkey create, unlock, recovery | `P/service.ts:822` `createPasskeyProfile`, `:893` `unlockPasskeyProfile`, `:966` `importPasskey`; `P/passkey-recovery-coordinator.ts` | adapt create and unlock; `importPasskey` and the coordinator's discovery recovery leave |
| Full backup body and file | `wallet/services/account/service.ts:1110` `exportFullBackupKeys`, `P/service.ts:~1985` `openBackupTransfer`; `utils/full-backup-helpers.ts:92` `sealFullBackupText` (PBKDF2-600k + AES-GCM, tag `nulo:full-backup:v2:`) | reuse the password body for passkey profiles; the passkey body (`exportPasskeyBackupKeys`, `computeBackupMac`) leaves |
| Account file | `packages/aztec-runtime/src/account/account-export.ts:97-158` (`EncryptionKey`, AAD `nulo:account-export:v1`) | reuse; a passkey profile needs a file password (OA-3) |
| Stored-shape registry and re-cut | `wallet/storage/stored-shapes.ts:153-164` (`ProfileRowSchema`), `stored-shapes/pins.ts`, `snapshot.json`, `goldens.json`, `backups/`; generator `apps/extension/scripts/storage-baseline/generate.ts` (`--freeze`, `--additive`) | reuse; the last re-cut's procedure is `archive/ui-keys-sealed-1/plan.md` § "The gate change: the re-cut" |
| Pinned backups | `tests/e2e/update-replay.test.ts:504-523` with `NULO_E2E_BACKUP_RECORD=1`, `fixtures/update/recording.ts` | reuse |
| A profile that cannot open any more | none. Searched `cannot be opened|can't be opened|no longer open|unsupported profile|unreadable profile`, `reinstall`; read `P/spec.ts`, `P/row-keyring.ts`, `P/service.ts`. Closest: recovery mode (`P/service.ts:462-525`), `MigrationBarrier.vue`, `AccountIntegrityBarrier.vue`, `StaleNetworkTakeover.vue` | build new (OA-7), smallest form |

## What exists today

**Password profile.** Row `nulo:core:profiles@<id>` (plaintext root, `stores.ts:223`): `id, name, type, pxeGeneration, dekSealed, walletFingerprint, guard, secret, entropy, envelopeMac`. `guard`, `secret` (master) and `entropy` are AES-GCM frames, each under PBKDF2-SHA256(600k) of SHA-256(password) with salt SHA-256(iv) (`WC/encryption-key.ts`), AAD per purpose. `dekSealed` (random 32-byte DEK rooting imported keys) is sealed the same way, AAD `nulo:profile-imported-dek:v1`. `walletFingerprint` = sha256 over the master (duplicate-phrase guard). `envelopeMac` = HMAC keyed `HKDF(master‖dek)` over id, slots, DEK, fingerprint; a failed MAC opens recovery mode (derived accounts only). Sealed roots use `deriveRowKeys(master, id, pxeGeneration)`; the PXE store and dApp-session keys use `HKDF(master‖dek)`.

**Passkey profile.** Row: `id, name, type, pxeGeneration, dekSealed, walletFingerprint, credentialId`, the same shape at `v0.31.0` and `v1.0.0`. The master, the DEK's wrap key and the backup check key come from the passkey ceremony (`WC/passkey-credential.ts`); `userHandle` = profile id (`wallet/utils/passkey-ceremony.ts`). No recovery phrase; `exportMnemonic`, `exportPlain` (account file) and `exportImportedKeysDek` refuse passkey profiles (`P/service.ts:2030,2080`). A fresh install recovers through `importPasskey` (discovery `get`). A passkey session never persists a bearer and re-prompts after a worker restart.

**Backups.** Password body: `master-key` = plaintext master, `entropy`, `imported-keys-dek` = a per-backup transfer key; the file is always encrypted under the profile password (`security-backup.test.ts`). Passkey body: `master-key` = credential id, `imported-keys-dek-sealed`, `backup-mac` (HMAC keyed from the PRF); the file may be plain. Trust order: checksum, `compat-epoch` (5, the only hard reject, `wallet/services/backup/backup-migration-registry.ts:81`), schema range, migrate, restore. The profile slice is block-listed: the row is rebuilt from `master-key`. `RestoreSecret` (`P/spec.ts`) is a union of the two bodies.

**Address freeze.** `NULO_KDF_SPEC` (`packages/aztec-runtime/src/account/address-freeze.ts:60-67`) includes the `passkeyMaster` line; its sha256 is every regime's `kdfDigest`. Editing it is a regime change, which the constraint forbids.

## Claims in the lane brief that did not hold, or need care

- `seed.vue` carries no passkey text and no passkey guard. The "keep your passkey synced" sentence is `popup/pages/settings/security/export/index.vue:25-28`; the menu hides Recovery Phrase and Account for passkey profiles, and the service refuses a direct visit.
- `passkey-label.ts` is `wallet/utils/passkey-label.ts`.
- `fixtures/update/v0.31.0.storage.json` holds one password profile and no passkey row; the replay's passkey case registers a fresh passkey profile on the candidate. Updating a stored passkey row is untested today.
- `v1.0.0` is a published GitHub release whose tag carries three pins. It reached no store, so no store-installed wallet carries the current stamp 0; a sideloaded 1.0.0 would.
- The glossary has no passkey or recovery-phrase entry.
- `legal/terms.md` also changes (§ 3, § 4.1, § 4.3 "Passkey profiles do not have a recovery phrase", line 198) and so does `RISK_POINTS[1]` in `packages/legal/src/manifest.ts`; the brief listed only `privacy.md`. Terms 1.1 takes effect on 2026-10-26.
- Text that says stamp 0 is never re-cut again: `CLAUDE.md:147,151`, `.claude/skills/release/SKILL.md:54`, `wallet/storage/stored-shapes/pins.ts:5,25-28`, `snapshot.test.ts` (docstring, R4 message), `apps/extension/tests/e2e/README.md:172-174`, `ARCHITECTURE.md:119`, the headers of `baseline.ts` and `generate.ts`.
- No nightly chaos seed exercises unlock or backup: `send-chaos.test.ts` drives sends on a burst account (searched it and `fixtures/burst-account.ts` for `unlock|lock|backup|passkey`).
- `ForgotPasswordPopup` and the delete page's footer speak of a recovery phrase to passkey profiles too; their copy is inaccurate today and becomes accurate after this change.

## Collisions

- No open issue besides #1127 is about passkeys or the recovery phrase (`gh issue list --state open --search "passkey"` and `"recovery phrase"`, 2026-10-25). #1050 (an unlock-time pass for sealed roots) is adjacent: the profile row is a plaintext root, so this lane needs no such pass.
- Closed known limits (`gh issue list --state closed --label known-limit --search "passkey"`): #614 (which passkey made a backup, not when) and #809 (a passkey profile cannot export a paused reset's imported accounts) lose their premise once passkey backups carry the password body; #593 and #837 (ceremony behaviour) stand. The lane reopens none of them.
- `release` skill step 1 records the newest stable release as the next update source; `v1.0.0` will never reach a store, so the replay source for this lane stays `v0.31.0`.

## E2E and tests that change

Smoke: `passkey-paths`, `passkey-backup`, `passkey-retry`, `toolbar-panel` (Firefox), `legal-acceptance` S6, `onboarding-tab`, `onboarding-import`, `import-paths`, `security-backup`, `auth-flows`. Network: `passkey-execution-canary`. Opt-in: `update-replay`. Unit and component: `P/service.integration.test.ts`, `P/passkey-recovery-coordinator.test.ts`, `wallet/storage/stored-shapes.writers.test.ts`, `snapshot.test.ts`, `full-passkey.pins.test.ts`, `passkey-backup-keys.test.ts`, `utils/get-started.test.ts`, the pages' colocated tests.
