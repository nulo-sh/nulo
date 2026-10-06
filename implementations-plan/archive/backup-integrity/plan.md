# Backup integrity

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: Two behaviour-preserving decompositions of the backup path, in `apps/extension/src/wallet/services/backup/` (`row-map-migration.ts`, `backup-migration-registry.ts`, `backup-migrator.ts`) and the restore surface (`apps/extension/src/wallet/services/account-state/normalize.ts`, `apps/extension/src/popup/pages/settings/security/export/full.vue`, `apps/extension/src/composables/useProfileImportFlow.ts`, `apps/extension/src/utils/full-backup-helpers.ts`), pinned by `apps/extension/src/wallet/services/backup/backup-migration-core.pins.test.ts`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Burn the complexity suppressions on the backup migration core and the restore surface by splitting each over-budget function into module-private helpers, without changing any observable behaviour. Two pull requests: the migration core first, then the restore surface. The three retained functions in `row-map-migration.ts` (`cloneJsonValue`, `applyRowTransform`, `retypeValue`) were left alone because their branches are their specification.

## Why

Every backup import and migration runs through these functions over hostile input, so a refactor that shifts an error string or the order in which gates reject is a security regression, not a style change. The decision was therefore characterization first: pin the exact rejection reasons and the rejection order before moving any code, then keep the existing suites green with zero edits.

## What shipped

- **Migration core.** `validateTransform` became an orchestrator over per-clause validators (field names, rename table, remap chains, add-default overlap) with identical throw sites and message text. `normalizeBackupData` and `denormalizeBackupData` extracted the root-slice handler, the scratch-entry classifier and the slice reassembly. The migrator's pre-flight extracted a coverage-index builder and a per-migration reference check; the index is built fresh on every call, never cached at module level.
- **Pins first.** `backup-migration-core.pins.test.ts` fixes the exact reason string of every branch that moves, plus precedence pins for the reject order: unbranded, blocked, uncovered, absent required read.
- **Restore surface.** Account-state normalization split into a merge step and a per-network cap step whose violation records are the oracle. The full-backup export flow split into credential acquisition, key-material export and envelope building as setup-level functions, keeping every generation-fence check at its original position. The profile import flow's builder was split at its handler seams.
- **Gates.** The four backup e2e specs (migration round trip, restore integrity, restore across a service-worker restart, profile re-import matrix) were the binding checks on both pull requests, run sharded.
- No persisted shape or wire format changed, so a plain revert would restore the previous structure.
