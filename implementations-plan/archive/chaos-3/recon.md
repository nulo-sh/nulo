# Recon: chaos-3

Base `origin/dev` at `17f35c504`. Two read-only explorers (Sonnet) plus the planner's own reading. Paths are relative to `apps/extension/` unless they start with `implementations-plan/`; `E/` is `tests/e2e/`, `PC/` is `tests/e2e/helpers/profile-chaos/`, `svc.ts` is `src/wallet/services/profile/service.ts`.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| Phrase import choosing Passkey (new or "I already have") | `PC/drivers.ts:406` `importPhrase` clicks `import-method-password` every time; the form opens on Passkey (`src/composables/useProfileImportFlow.ts:311`); reuse link `import-seed-passkey-reuse`; submit `import-seed-submit-btn`. `E/helpers/import-drivers.ts:198` `importSeed` is Password only | adapt `importPhrase` |
| Restore choosing Passkey | Tabs follow the backup's method, both offered (`useProfileImportFlow.ts:464-467`); chaos `fillRestore` (`PC/backups.ts:187`) always clicks Password; `import-full-backup-method-passkey`, reuse link `import-full-backup-passkey-reuse`; `E/helpers/import-drivers.ts:261,279` hold the passkey assertions | adapt `fillRestore` |
| Unlock method page, every direction | `src/popup/pages/settings/security/unlock-method.vue` (testids `unlock-method-use-passkey`, `-password-input`, `-continue`, `-new-passkey`, `-use-password`, `-new-password-input`, `-new-password-confirm-input`, `-save`, `-error-text`); driven once in `E/security.test.ts:84-141` (password ↔ passkey, no faults); "Use a new passkey" only in its unit test; no reuse on this page | build new driver (`PC/unlock-method.ts`) |
| A second profile on an existing passkey | `register-passkey-reuse` (`src/popup/pages/profile/new.vue:139`), driven once in `E/passkey-paths.test.ts:135-187`, which proves the request names no credential; the model's `CredentialRef` and `mintedCredentials` (`PC/model.ts:449`) | adapt `createPasskey` |
| Forcing which credential answers | `answerWithCredential` (`E/fixtures/passkey.ts:204`) rewrites the next `get`'s `allowCredentials` to one id, both browsers | reuse as is |
| Learning which credential answered | `learnCredential` (`PC/drivers.ts:139`) reads the stored row; `PC/prf-capture.ts` keeps each answer's PRF output, not its id | adapt `prf-capture.ts` to keep the id |
| Passkey account file | `src/popup/pages/settings/security/export/account.vue`: `account-file-confirm-passkey-btn`, `account-file-password-input`, `-confirm-input`, `account-file-save-btn`, `account-download-btn`; chaos `exportAccount` (`PC/accounts-io.ts:47`) is password only; import (`previewImport`) is method-free | adapt `exportAccount` |
| Strict mode with passkey sessions | already modelled: `sessionFor` gives either method a bearer outside strict (`PC/model.ts:422`), `toggleStrict` and `restartedWorld` apply to both (D59 of the archived chaos plan) | reuse as is |
| O2 profile rows | `checkProfiles` (`PC/checkers.ts:191-220`) checks name, type, retired and field set; it reads no `credentialId` or `prfSalt` value | adapt: credential binding and distinct salts |
| verifyAll's wrong passkey | `wrongAttempt` (`PC/verify.ts`) answers with any other live profile's credential, which on a shared credential opens the target | fix |
| In-process sequence over the profile graph | `src/wallet/services/profile/service.passkey-unlock.test.ts:836-873` already draws `changeUnlockMethod` sequences over two profiles on one credential (fast-check, 6 runs); `unlock-method.composition.test.ts` boots the graph with a restart; about 1 s per unseal | out of this lane (see plan § Scope) |
| Fleet wave | `scripts/e2e/chaos-session.ts`, `E/helpers/chaos-session/`, charters, permissions and triage in `implementations-plan/archive/passkey-chaos-1/CHARTERS.md`, wave-2 proposals in its `lessons/phase-C5.md` § Wave 2 | reuse; arc 2 |

Absence trails (explorers): `import-method-passkey|import-seed-passkey|importSeed\(|import-option-seed` over `E/**` finds the Password path only (`E/import-paths.test.ts:12` defers the passkey import); `unlock-method|unlockMethod` over `E/`, `scripts/`, `src/` finds `E/security.test.ts` and strings in `PC/checkers.ts` and `PC/verify.ts`; `account-file-confirm-passkey|account-file-save|account-file-password` over `tests/` finds only the unit file; `Reuse|discover|existing` in `unlock-method.vue` finds nothing.

## Product behaviour the model must state (sources)

- **Phrase import** (`svc.ts:2012`, `importProfile` `:2371-2395`): phrase checks before the passkey card (`useProfileImportFlow.ts:193-196`); the card runs before the duplicate check, so a declined warning leaves the card's new credential on the authenticator (closed known limit #1151); row, then `nulo:ui:profileImported@id`, then the session (`:2388-2390`); a passkey row takes the answer's id and a fresh `prfSalt` (`:2066-2078`); salts are unique across rows (`assertPrfSaltUnusedHoldingLock`, `:2085-2090`).
- **Restore** (`useFullBackupImport.ts:412-524`, `svc.ts:2411-2645`): decrypt and shape gates first; one unlock choice (`:444`), held for `restore` and `finalizeRestore`; the passkey choice makes a passkey row whatever the backup's type; the session opens at finalize.
- **Unlock method** (`svc.ts:1389`, `unlock-method.vue`): password → passkey (current password checked by `verifyUnlockCredential` before any prompt; a wrong one shows `unlock-method-error-text`); passkey → new passkey and passkey → password (current passkey first). Every refusal before the single row write leaves the row's bytes (pinned by `service.passkey-unlock.test.ts:214-355`); after the write the session reopens in place, a bearer only outside strict mode (`session-manager.ts:299`); success toasts, then `/popup/settings`; `UnlockMethodChangedError` sends to `/popup/auth`. On Firefox it moves to its own window only where the surface closes on focus loss (`unlock-method.vue:255`), which a tab is not.
- **Shared credential**: the lock screen asks with `allowCredentials` naming the row's credential (`src/wallet/utils/passkey-ceremony.ts:61-63`); "I already have" is a discovery `get` at a fresh salt (`:65-74`); an answer for another credential is refused (`svc.ts:966`).
- **Passkey account file** (`account.vue:197-252`, `src/wallet/services/account/service.ts:107-111,677-722`): the passkey first, then a file password of 8 or more characters; the export writes nothing; the file opens with its file password only; import is the same for either method.

## Open work met

- #1157 (this lane, arc 1), #1189 (arc 2's record; see plan § What did not hold).
- Closed known limits read: #1151 (credential left by a refused passkey import or restore: the planner counts it), #1161 and #1162 (a method change revokes no earlier copy or export: the model asserts no revocation), #837 (Chrome authenticator lost on detach: D11 of the archived plan holds).
- Open findings the runs may meet: in `KNOWN_FINDINGS` today #1131, #1132, #1133, #1136 (and #432, a closed known limit); #1178 (refusals in Unlock method, the account file, Full Backup and the reuse create logged at error) is not there yet, and the new actions draw exactly those refusals (plan D10). Open, not error lines: #1138, #1183, #1186, #1225.
