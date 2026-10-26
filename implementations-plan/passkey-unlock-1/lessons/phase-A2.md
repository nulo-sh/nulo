# Phase A2: the switch

## Deviations from the plan (the tree wins)

- **Ceremony and create.** The get request names its credential (`credentialId` is required; no discovery get remains). Retry state keeps `{credentialId, prfSalt}`; the random `userHandle` is minted per create and kept nowhere, so its branded type left with the import path. `PasskeyStep` lost `import` and `restore` and gained `reveal`. The passkey refusal is the fixed message "Passkey did not open this profile", not a new typed error: no screen branches on it beyond the generic toast.
- **Service.** `restore` takes `RestoreMaterial` and a password only (A3 adds the passkey), so its credential parameter left. `exportImportedKeysDek` stays password-only: no passkey caller exists until A3's account file. The coordinator's discovery helpers and their tests left with `importPasskey`; the silent-reset outcome they fed left with them. `imported-key-count.ts` (the passkey backup's row count) left with `exportPasskeyBackupKeys`.
- **Backups.** D9's shape refusal reads only bodies typed `passkey`: a password body meets its own gates whatever extra keys it carries, so a 0.31.0 password backup is never refused by shape. The earlier passkey fixture moved to `composables/fixtures/earlier-passkey-backup.json`, reformatted by Biome (whitespace only). Get started no longer lists "back up" for passkey profiles (the phrase step covers both types); `markGetStarted(…, "backupSaved")` still records an export, and nothing reads the flag.
- **Vectors.** V3, V3b and V8 left `key-vectors.test.ts`; their values are recorded by the retired reference generator under `reference/key-model-v2-hardening/`, computed with `node:crypto` HKDF and HMAC.
- **Stash tests.** The restore-stash suite rewraps under a password, the only restore A2 has.
- **Docs.** The CLAUDE.md re-cut sentence sits after "…sealed the same way.", so the paragraph still reads in order; the "a pin is never removed" sentence became "removed only on the owner's recorded decision" in CLAUDE.md, ARCHITECTURE.md § 5, the e2e README and `pins.ts`. SECURITY.md lost the clause saying the passkey derives the wallet master, and a clause of the RP ID entry. ATTACK-SURFACE's secret row names the passkey unlock key beside the password. The scan's label allowlist lost `nulo:backup-mac:v1` and `nulo:profile:v1`, which no source names any more.

## 2026-10-26 · Mutation pass

Each check A2 adds or moves was broken by a one-site scratch edit; the named suite ran at retry 0 (narrow file first, then `P/service.integration.test.ts` where the edit is in the service), the red tests were recorded, and the file was restored. The runner and its 62 edits live in the scratch directory, outside the tree.

Round 1: 52 caught, 5 survived, 5 invalid as written (CL1–CL5 removed a key the classifier's `.pick` names, so the module failed to load; rewritten as that key accepting any value, all 5 caught). A test was added for each survivor (`7fbd6619f`) and the survivors were re-run: all caught. After the fixes: 62 of 62.

What the survivors had in common: each guarded a refusal another check already reached first. The credential-id check in the slot opener sat behind differing PRF outputs; the unlock's salt revalidation behind the slots being opened from the snapshot; the opener's and the row-key fill's retired gates behind every caller's own; the silent restore's skip behind the session manager declining any passkey session, which leaves the stored session in place where the skip drops it. Each new test reaches the check with the earlier one out of the way.

| id | mutation | caught by (one named red test) |
|---|---|---|
| SB1 | unlockKeyFor ignores the salt | `passkey-credential.test.ts` › PasskeyCredential keys only the input the passkey evaluated, and that key is the profile's unlock key |
| SB2 | the credential keeps the salt as handed, not canonical | `passkey-credential.test.ts` › PasskeyCredential binds the canonical encoding of the input, so another spelling of it is another input |
| SB3 | the PRF output is not wiped after the key exists | `passkey-credential.test.ts` › PasskeyCredential wipes the decoded output once the key exists, and when the derivation throws |
| SB4 | a passkey row opens under the answer's own salt, not the row's | `service.integration.test.ts` › ProfileService integration cross-profile transplant defenses two profiles on one passkey with their inputs swapped, neither opens: the swapped input keys neither row's slots |
| SB5 | a passkey row opens under another credential's answer | **survived round 1**; now `service.integration.test.ts` › ProfileService integration Change 4 — exportPlain single PBKDF2 exportPlain refuses another credential's answer, even one carrying this credential's output, and the same credential's at another input |
| SB6 | PATH B create seals under the answer's salt, not the minted one | `service.integration.test.ts` › ProfileService integration PATH B (the passkey window) create refuses an answer at another PRF input, stores nothing, and tells the window |
| SB7 | create seals although the answer gave no key for the salt | `service.integration.test.ts` › ProfileService integration PATH B (the passkey window) create refuses an answer at another PRF input, stores nothing, and tells the window |
| SB8 | the new row stores another salt than the one it was sealed under | `service.integration.test.ts` › ProfileService integration Change 4 — exportPlain single PBKDF2 exportPlain for a passkey profile returns the master its recovery phrase derives |
| SB9 | the unlock's revalidation ignores a changed salt | **survived round 1**; now `service.integration.test.ts` › ProfileService integration PATH B (the passkey window) unlock refuses a row whose input changed while its passkey was asked, and opens nothing |
| SB10 | the unlock accepts an answer from another credential | `service.integration.test.ts` › ProfileService integration Change 4 — exportPlain single PBKDF2 unlockPasskeyProfile rejects credentialData for a different credential |
| SB11 | getPasskeyUnlockParams hands out no salt | `service.integration.test.ts` › ProfileService integration Change 4 — exportPlain single PBKDF2 exportPlain for a passkey profile returns the master its recovery phrase derives |
| SB12 | the PRF input ignores the profile's salt | `passkey-ceremony.test.ts` › buildCreateOptions evaluates the PRF at the profile's own input |
| SB13 | a create answer reports another input than it evaluated | `passkey-ceremony.test.ts` › runPasskeyCeremony in create mode returns the create-time PRF without a second ceremony |
| SB14 | the page's create asks a fresh input, not the saved one | `create-passkey-profile.test.ts` › createPasskeyProfileInPage a retry confirms the saved credential at the input its first attempt asked for |
| SB15 | a fresh create input's salt is fixed | `create-passkey-profile.test.ts` › createPasskeyProfileInPage each attempt mints its own input |
| UV1 | create asks userVerification preferred | `passkey-ceremony.test.ts` › buildCreateOptions keeps rp, challenge size, credential params, and authenticator selection unchanged |
| UV2 | get asks userVerification preferred | `passkey-ceremony.test.ts` › buildGetOptions asks only the profile's credential, with user verification, at the profile's input |
| CE1 | get asks any credential (discovery) | `passkey-ceremony.test.ts` › buildGetOptions asks only the profile's credential, with user verification, at the profile's input |
| CE2 | confirmMinted accepts another credential's assertion | `passkey-ceremony.test.ts` › runPasskeyCeremony in create mode refuses a fallback assertion from a different credential |
| CE3 | get with no PRF results is not refused | `passkey-ceremony.test.ts` › runPasskeyCeremony in create mode throws when the fallback assertion carries no PRF output either |
| CL1 | a retired row may carry prfSalt (as `z.unknown()`) | round 1 as written broke the module load; redefined: `profile-row.test.ts` › classifyProfileRow sorts each row a build writes or wrote into its own kind, carrying only the fields it checked |
| CL2 | a retired row may carry guard (as `z.unknown()`) | round 1 as written broke the module load; redefined: `profile-row.test.ts` › classifyProfileRow sorts each row a build writes or wrote into its own kind, carrying only the fields it checked |
| CL3 | a retired row may carry secret (as `z.unknown()`) | round 1 as written broke the module load; redefined: `profile-row.test.ts` › classifyProfileRow sorts each row a build writes or wrote into its own kind, carrying only the fields it checked |
| CL4 | a retired row may carry entropy (as `z.unknown()`) | round 1 as written broke the module load; redefined: `profile-row.test.ts` › classifyProfileRow sorts each row a build writes or wrote into its own kind, carrying only the fields it checked |
| CL5 | a retired row may carry envelopeMac (as `z.unknown()`) | round 1 as written broke the module load; redefined: `profile-row.test.ts` › classifyProfileRow sorts each row a build writes or wrote into its own kind, carrying only the fields it checked |
| CL6 | absent accepts any string | `profile-row.test.ts` › classifyProfileRow a password or passkey row with no envelope MAC keeps its kind |
| CL7 | the passkey variant ignores prfSalt | `profile-row.test.ts` › classifyProfileRow sorts each row a build writes or wrote into its own kind, carrying only the fields it checked |
| CL8 | the passkey variant ignores the slots | `profile-row.test.ts` › classifyProfileRow sorts each row a build writes or wrote into its own kind, carrying only the fields it checked |
| CL9 | the retired variant ignores credentialId | `profile-row.test.ts` › classifyProfileRow a retired row with no credential id is unreadable |
| CL10 | a retired row reads as unreadable | `profile-row.test.ts` › classifyProfileRow sorts each row a build writes or wrote into its own kind, carrying only the fields it checked |
| CL11 | a retired row reads as a passkey row | `profile-row.test.ts` › classifyProfileRow sorts each row a build writes or wrote into its own kind, carrying only the fields it checked |
| RM1 | the unlock-kind gate lets a retired row through | `service.integration.test.ts` › ProfileService — a retired passkey profile getPasskeyUnlockParams refuses with the typed error, prompts nothing, opens nothing and writes nothing |
| RM2 | the unlock-kind gate refuses a retired row untyped | `service.integration.test.ts` › ProfileService — a retired passkey profile getPasskeyUnlockParams refuses with the typed error, prompts nothing, opens nothing and writes nothing |
| RM3 | fillRowKeys derives keys for a retired row | **survived round 1**; now `service.integration.test.ts` › ProfileService — a retired passkey profile the slot opener and the row-key fill refuse a retired row themselves |
| RM4 | openSlots does not refuse a retired row | **survived round 1**; now `service.integration.test.ts` › ProfileService — a retired passkey profile the slot opener and the row-key fill refuse a retired row themselves |
| RM5 | the export fence does not refuse a retired row | `service.integration.test.ts` › ProfileService — a retired passkey profile exportPlain refuses with the typed error, prompts nothing, opens nothing and writes nothing |
| RM6 | the silent restore restores a retired row's session | **survived round 1**; now `service.integration.test.ts` › ProfileService — a retired passkey profile a session persisted for an id whose row is now retired is dropped, not restored, and the worker starts |
| RM7 | changeProfilePassword does not refuse a retired row | `service.integration.test.ts` › ProfileService — a retired passkey profile changeProfilePassword refuses with the typed error, prompts nothing, opens nothing and writes nothing |
| RM8 | finalizeRestore does not refuse a retired row | `service.integration.test.ts` › credential rows, degraded opens and the restore stash the restore stash finalize wipes and drops the rewrap context on a row edited into a retired one |
| RM9 | a retired row is listed unmarked | `service.integration.test.ts` › ProfileService — a retired passkey profile it is listed as retired, can be renamed and deleted, and another profile beside it works |
| RM10 | toProfileInfo drops the retired mark | `service.integration.test.ts` › ProfileService — a retired passkey profile it is listed as retired, can be renamed and deleted, and another profile beside it works |
| PR1 | a passkey that opens nothing reads as a wrong password | `service.integration.test.ts` › ProfileService integration Change 4 — exportPlain single PBKDF2 exportPlain refuses another credential's answer, and the same credential's at another input |
| PR2 | the unlock refuses an unopened passkey as a wrong password | `service.integration.test.ts` › ProfileService integration cross-profile transplant defenses two profiles on one passkey each opens only under its own input: one's answer never opens the other |
| PR3 | a reveal with a passkey answer asks a password instead | `service.integration.test.ts` › ProfileService integration Change 4 — exportPlain single PBKDF2 exportPlain for a passkey profile returns the master its recovery phrase derives |
| BR1 | an earlier body carrying the passkey check is not refused | `useFullBackupImport.test.ts` › useFullBackupImport — a passkey profile's backup over generated bodies, every earlier passkey shape is refused and nothing else is |
| BR2 | an earlier body carrying the passkey-sealed key is not refused | `useFullBackupImport.test.ts` › useFullBackupImport — a passkey profile's backup over generated bodies, every earlier passkey shape is refused and nothing else is |
| BR3 | a passkey body with no recovery phrase is not refused | `useFullBackupImport.test.ts` › useFullBackupImport — a passkey profile's backup over generated bodies, every earlier passkey shape is refused and nothing else is |
| BR4 | the shape refusal reaches password bodies too | `useFullBackupImport.test.ts` › useFullBackupImport — a passkey profile's backup over generated bodies, every earlier passkey shape is refused and nothing else is |
| BR5 | validation never refuses an earlier body | `useFullBackupImport.test.ts` › useFullBackupImport — a passkey profile's backup an earlier passkey file picked from disk with its check is refused at the pick, before it is offered |
| BR6 | the import pick does not ask before it publishes | `useFullBackupImport.test.ts` › useFullBackupImport — a passkey profile's backup an earlier passkey file picked from disk with its check is refused at the pick, before it is offered |
| BR7 | the import decrypt does not ask before it publishes | `useFullBackupImport.test.ts` › useFullBackupImport — a passkey profile's backup an earlier passkey file under a file password is refused when it opens, before it is offered |
| BR8 | Restore again's pick does not ask | `useRestoreAgain.test.ts` › useRestoreAgain: refusals change nothing an earlier passkey body, even the one the reminder names is refused at the pick and never offered |
| BR9 | Restore again's decrypt does not ask | `useRestoreAgain.test.ts` › useRestoreAgain: refusals change nothing an earlier passkey body, even the one the reminder names is refused when its file password opens it, and never offered |
| BR10 | a refused pick keeps the file's selection published | `useFullBackupImport.test.ts` › useFullBackupImport — a passkey profile's backup an earlier passkey file picked from disk with its check is refused at the pick, before it is offered |
| FP1 | a short file password encrypts | `useFullBackupExport.test.ts` › useFullBackupExport — a current run passkey profile: one prompt at the row's input, the password body, and the file leaves only under a valid file password |
| FP2 | a passkey profile's Protect enables on any password | `useFullBackupExport.test.ts` › useFullBackupExport — a current run passkey profile: one prompt at the row's input, the password body, and the file leaves only under a valid file password |
| FP3 | the new-password rule takes 7 characters | `useFullBackupExport.test.ts` › useFullBackupExport — a current run passkey profile: one prompt at the row's input, the password body, and the file leaves only under a valid file password |
| FP4 | a mismatched repeat encrypts | `useFullBackupExport.test.ts` › useFullBackupExport — a current run passkey profile: one prompt at the row's input, the password body, and the file leaves only under a valid file password |
| LG1 | prfSalt is not redacted | `utils.test.ts` › trim — secret key names blanks prfSalt |
| LG2 | prf-salt is not redacted | `utils.test.ts` › trim — secret key names blanks prf-salt |
| BK1 | a profile's identity carries the whole row | `service.integration.test.ts` › account-integrity delegate — the session-open chokepoint imported-keys DEK lifecycle recovery mode: a degraded unlock projects `recoveryMode` on the live info only, and the DEK-keyed derivation refuses |
| CR1 | the passkey phrase stage asks a password | `create.test.ts` › onboarding create — the recovery phrase step a passkey wallet reads its words once with the answer it was made from, before bootstrap, then shows them as step 3 |

## 2026-10-26 · Final mutation pass

At `038a064ae`, 77 mutations: the 62 of the first pass, all caught again, and 15 for the review's fixes. 76 were caught on the first run. AX2 survived: on every test path `exportPlain` refuses first, so no test saw the account export open an imported key from the session instead of by the password. A test now opens it while another profile is unlocked (`c13530bab`), and AX2 is caught: 77/77. The new rows:

| Id | Mutation | Caught by |
|---|---|---|
| SB9 | the input decodes before the wipe's try | `passkey-credential.test.ts › PasskeyCredential wipes the decoded output when the input does not decode` |
| EP1 | an empty password is refused as missing on every path | `service.open-slots.test.ts › an empty password gets each password path's own wrong-password refusal; exportPlain asks for a password` |
| EP2 | exportPlain counts an empty password as a wrong one | `service.open-slots.test.ts › an empty password gets each password path's own wrong-password refusal; exportPlain asks for a password` |
| PK1 | an overtaken import pick publishes its selection | `useFullBackupImport.test.ts › useFullBackupImport — a passkey profile's backup a pick a later pick overtook while it read publishes nothing, when its read refuses its body` |
| PK2 | an overtaken import pick publishes its read error | `useFullBackupImport.test.ts › useFullBackupImport — a passkey profile's backup a pick a later pick overtook while it read publishes nothing, when its read fails` |
| PK3 | an overtaken Restore again pick publishes its selection | `useRestoreAgain.test.ts › useRestoreAgain: refusals change nothing an earlier passkey body, even the one the reminder names a pick a later pick overtook while it read publishes nothing, when its read refuses its body` |
| PK4 | an overtaken Restore again pick publishes its read error | `useRestoreAgain.test.ts › useRestoreAgain: refusals change nothing an earlier passkey body, even the one the reminder names a pick a later pick overtook while it read publishes nothing, when its read fails` |
| PK5 | a pick takes no serial, so none is ever overtaken | `useFullBackupImport.test.ts › useFullBackupImport — a passkey profile's backup a pick a later pick overtook while it read publishes nothing, when its read refuses its body` |
| PK6 | an import pick back from its chooser during a restore publishes | `useFullBackupImport.test.ts › useFullBackupImport — a passkey profile's backup a pick a restore overtook while its chooser is open publishes nothing over the run` |
| PK7 | an import restore's start leaves a reading pick current | `useFullBackupImport.test.ts › useFullBackupImport — a passkey profile's backup a pick a restore overtook while its read runs publishes nothing over the run` |
| PK8 | a Restore again pick back from its chooser during a run publishes | `useRestoreAgain.test.ts › useRestoreAgain: refusals change nothing an earlier passkey body, even the one the reminder names a pick a restore overtook while its chooser is open publishes nothing over the run` |
| PK9 | a Restore again run's start leaves a reading pick current | `useRestoreAgain.test.ts › useRestoreAgain: refusals change nothing an earlier passkey body, even the one the reminder names a pick a restore overtook while its read runs publishes nothing over the run` |
| AX1 | the reset-held export opens the DEK from the session | `full-backup-keys.test.ts › account exports — a retired profile row exportResetHeldAccount opens the key of a password row, and refuses the same row retired before it opens one or writes` |
| AX2 | the account export opens an imported key from the session DEK | **survived the first run**; now `full-backup-keys.test.ts › exportAccount — an imported account's key opens under the profile's own DEK by its password while another profile is unlocked` |
| AX3 | the account export skips the master check | `full-backup-keys.test.ts › account exports — a retired profile row exportAccount, a derived account opens the key of a password row, and refuses the same row retired before it opens one or writes` |

## 2026-10-26 · Flake checks

- **Unit, component and composition**, 30 consecutive runs at retry 0 at `038a064ae`, over the 49 test files A2 adds or edits:
  - wallet-crypto (4 files, 29 tests) 30/30;
  - extension-messaging (1 file, 194 tests) 30/30;
  - extension (44 files, 1315 tests) 30/30;
  - `full-backup-keys.test.ts` again after its last edit (`c13530bab`, 22 tests) 30/30.
- **Void batches.** The first unit batch is void from extension run 20: a red-verify edit of `useRestoreAgain.ts` in the same tree overlapped it. The first e2e batch is void too: HEAD moved past the candidate it had built, and the replay refuses a stale candidate. Both were rerun from the start at the final head. The final mutation pass ran in a scratch worktree so it could run beside them.
- **E2E**, 5 runs per browser at retry 0 at `038a064ae`. The smoke files were `legal-acceptance`, `onboarding-tab`, `passkey-backup`, `passkey-paths`, `passkey-retry`, and `toolbar-panel` on Firefox; the update replay ran from v0.31.0.
  - Chrome: smoke 5/5 (30 tests), replay 5/5.
  - Firefox: smoke 4/5 (35 tests), replay 5/5.
- **The Firefox red (run 2).** `toolbar-panel` › "export, restore and the contacts import leave the dying panel for windows of their own" timed out at "the picker's input clicked and cancelled": after 10 s the input was still connected.
  - That step is the contacts import's file chooser. It is unchanged since #1026, and no A2 change reaches it.
  - Headless Firefox cancels the chooser at once, but not within 10 s on that run, with the host's 5-minute load near 120.
  - The file passed the other 4 runs, then 3 more runs alone (load1 54 to 82).

