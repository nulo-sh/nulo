# backup-preflight-1: recon

At `dev` `e8fe932d4`. One Sonnet Explore reuse sweep plus direct reads. Paths are repo-relative.

## The refusal (#934)

- `apps/extension/src/wallet/services/backup/backup-migrator.ts:118-198`: `preflightPending` builds a `CoverageIndex` (sliced roots, sliced value keys, block-listed roots) per call. `preflightMigrationRefs` checks, per pending migration: the brand (`isBackupSafeMigration`), then `rejectBlockedOrUncoveredRef` for every read and write ref (block-listed, then "no backup slice maps to"), then an absent required slice the migration reads.
- The scratch store holds only keys that `normalizeBackupData` writes: `${desc.root}@${id}` for a `root` slice and `desc.key` for a `value-projection` slice (`backup-migration-registry.ts:293-361`). An unknown slice is refused (`:262-266`). `denormalizeBackupData` refuses a scratch key outside every registered root (`:394`).
- The DSL's `up()` (`row-map-migration.ts:117-130`) reads `ctx.local.rows(root)` and writes `setRows(root, mapped)`; for a value key it skips an absent value. `StagingArea.rows` matches the prefix `${root}@` (`packages/wallet-core/src/migration/staging.ts:37-45`). With no row under the root it stages nothing; `guardCommit` iterates staged keys only (`migrator.ts:356-361`). So the migration finds nothing to change over a backup.
- Callers of `migrateBackupData`: `useFullBackupImport.ts:186-189` shows an `incompatible` reason verbatim under "Incompatible backup"; `stored-shapes/baseline.ts:276-279` (`decodeBackup`, used by `snapshot.test.ts` R3) throws on any refusal. Neither matches the reason text.

## Where the rule is restated

- `footprint-coverage.test.ts:1-16` (header), `:34-40` (its own sliced-root and sliced-key sets), `:52-67` (the ack check computes `unmapped`).
- `backup-migration-core.pins.test.ts:186-199` (the exact "no backup slice maps to" string), `:224-262` (the oracle order and two precedence pins that name "uncovered").
- `backup-migrator.test.ts:149-165` (an unmapped root refuses).
- Docs: `backup/README.md:11-12`, `ARCHITECTURE.md:129` ("registry coverage"), `CLAUDE.md:147` ("registry-covered footprints"). `template.ts:6-14` names only the imperative rule, which stays.

## Unsliced roots (constants)

`NETWORK_STORAGE_ROOT` (`network/spec.ts:9`), `ACTIVE_NETWORK_STORAGE_ROOT` (`:12`), `SEED_OFFERS_ROOT` (`network/seed-offers.ts:10`), `FPC_STORAGE_ROOT` (`fpc/spec.ts:9`), `OPERATION_JOURNAL_STORAGE_ROOT` (`operation-journal/spec.ts:30`), the five `INCOMING_*_STORAGE_ROOT` (`incoming-transfer/spec.ts:25-29`), `STALE_NETWORKS_ROOT`, `NETWORK_RESET_ROOT`, `NETWORK_RESET_DONE_ROOT` (`stale-network/types.ts:17-19`). The list is not exhaustive (token-seeded, account-integrity, tombstone and restore-pending roots also go unsliced). Unsliced JSON value keys exist too: `TOKEN_PRICES_STORAGE_KEY` (`price/spec.ts:5`, `nulo:core:token-prices`) and `TOKEN_LIST_STORAGE_KEY` (`token-list/spec.ts:6`), stored as `value(...)` in `storage/stores.ts:88-89`; the `ui`, legal and onboarding keys are `structured`.

## Reuse

- No helper lists unsliced roots; `isBackupSliced` (`baseline.ts:246`) works on goldens. None is needed: the fix deletes a gate.
- `backup-migrator.test.ts` holds `v1Data()`, `account()`, `contact()`, `v2()`, `v3()`, `migrateOrThrow()` (`:10-42`), unexported; the new cases live in that file.
- No validation of root names exists (`defineMigration`, `registry.test.ts`), so a root containing `@` is not refused; none exists.

## PR #938 (migration-rule-1 A4, draft) overlap

Its hunks in the files this lane touches: `footprint-coverage.test.ts` lines 24-36 (an import added after 26, lines 29-33 removed); `backup/README.md` line 20; `ARCHITECTURE.md` line 133; `CLAUDE.md` lines 142-146; new `import-blocking-ack.ts`, `stored-shapes/backups.ts`, R5 in `snapshot.test.ts`. R5 calls `backupProblems` → `validateAndMigrateBackup` → `migrateBackupData` and compares with `acknowledgedBlock(IMPORT_BLOCKING_ACK)`; it restates no coverage rule, but `decodeBackup` and R5 match the substring `migration ${block} ` in a refusal. #938's `CLAUDE.md` line 146 says a migration touching a key no backup slice carries blocks import "until #934". `git merge-file` on a scratch file: a change on the line next to another side's change conflicts; one unchanged line between them merges.
