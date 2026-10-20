# Phase 3 (A4) · the flip

## Step 1, before the freeze (2026-10-20)

- Branched `migration-rule-1-a4` off `origin/dev` at `18c40c55` (A1 #890, A2 #909, A3 #912 merged). Aztec is still `6.0.0-rc.3`: the bump that moves Testnet's seed has not landed, so the replay's first case opens with no takeover and the second runs the reset over the recording.
- Open PRs touching a registered spec or `stored-shapes/` (`gh pr view <n> --json files` over every open PR): #924 (seals contacts and dApp sessions at rest: rewrites `stored-shapes.ts`, `snapshot.json`, `goldens.json`), #915 (`passkey/spec.ts`, `profile/spec.ts`), #886 (`dapp-interaction/spec.ts`). The plan wants them landed or rebased before A4 merges; the orchestrator owns that order. If one lands first, A4 rebases, runs `bun run baseline:storage` (the stamp follows), `-- --freeze` again and replaces stamp 0's pin, and, when a backup slice changed, records the two backups again.

## Step 2, the freeze

- `bun run baseline:storage` on the fresh branch: "rewrote stamp 0 (v1)" with no diff, so the baseline was fresh. `-- --freeze` printed stamp 0's pin; with it in `pins.ts` the generator answers "stored shapes unchanged" and the guard's 62 tests pass.
- Frozen guard, shown on a scratch edit and reverted (an optional `note` on `ContactSchema`): R1 reds ("stored shapes changed: contacts; run `bun run baseline:storage`"); the generator refuses with both ways out (register migration 2, or `-- --additive`); with `--additive` it appends stamp 1 and prints its pin, and R4 then reds until the pin is added.

## Step 3, R5's backups

- The replay's first case exports the updated password profile's full backup (`exportBackupContent`, opened with the test password) and a new third case registers a passkey profile on the candidate and downloads its plain backup through the passkey ceremony; `NULO_E2E_BACKUP_RECORD=1` on Chrome writes both to `stored-shapes/backups/` and prints their SHA-256. Every run, on both browsers, checks each export with `backupProblems` (`validateAndMigrateBackup`, `normalizeBackupData`, then every restored row read by its registered read code). The composable imports in the e2e's Node runtime as it is.
- The files: compat epoch 5, backup schema version 1, wallet version `0.31.0-update.1` (the candidate's suffix; the validator reads no wallet version). The password file holds 4 accounts, an imported key, a transaction, a token, a balance, 2 contacts and the config; the passkey file one account and the config, and its `master-key` is only the credential id. Secrets in them are the throwaway test profile's, sealed under the test password or the virtual passkey.
- R5 refuses each mutation, run in a scratch test and removed: the passkey file without its `backup-mac` ("Backup cannot be restored"), a contact whose `address` is a number, its checksum recomputed ("the contacts read returns nothing"), compat epoch 4 ("Incompatible backup"), and an edited account name with the old checksum ("Backup Integrity Check Failed"). The unedited file returns no problem.
- The row reader A3 wrote (`shapeOfKey`, `unreadRows`) moved to `stored-shapes/reads.ts` so R5 and the e2e share it; `tests/e2e/fixtures/update/stored-rows.ts` keeps the fixture-key filter. `updateCandidate` checks the candidate once per run, since the run itself writes the backups under `src/`.

## Step 4, OA-2's pictures

- Popup at 400×600, device scale 2 (A2's size), Chrome, the candidate build, both themes through `prefers-color-scheme` (the default theme is `system`). A real terminal block: `nulo:schema:version` set to `"corrupt"`, then a cold relaunch on the same profile, which the engine refuses with `corrupt or out-of-range schema version "corrupt" (expected 0..1)`. Before: the candidate of `ad55a56d`; after: of `90ef6172`. The line grows from four lines to five at 400 px.

## Step 5, the wording review

`git grep -n -i -E "reinstall|pre-production|no production users"` outside `archive/` and `CHANGELOG.md`, 42 hits after the edits, each read:

- Fixed in this arc: CLAUDE.md § Persisted-storage and the V5 line; ARCHITECTURE.md § 5 (also its "bad rows are deleted": `EntityStorage` keeps them; and the fee-pick migration that no longer exists); the aztec-update skill's Branch B step 2; `implementations-plan/README.md`; `S/backup/README.md`; `S/account/service.ts` `liveRows`; `S/network/spec.ts` `l1ChainId`; the fence message in `S/profile/service.ts` and its `copy-dash-ban.test.ts` entry (its em dash went with the words); `opfs-store.ts` and its test; `migrator.ts`'s legacy reason and marker comment; `types.ts`; `address-freeze.ts` and its test; `ATTACK-SURFACE.md`'s #709 line; `MigrationBarrier.vue` and its pin.
- Kept, not this rule: the update harness's `reinstallExtension` (fixtures and e2e README: the browser's own reinstall), `docker-ci-like.sh` (reinstalls a tool), `reset.vue:105` (restarting onboarding by reinstalling, a browser fact), `launch-prep-1`'s plan and recon (another lane's record), and this plan's recon, plan, asks, lessons and status (the record of what was true).
- `README.md`'s banner still says "Storage format is unstable". #893 (launch-prep-1 A2, open) replaces the whole banner with owner-signed copy whose "Keep your way back" bullet states the migration rule, so A4 leaves README alone rather than conflict with it.
