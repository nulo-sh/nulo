# Backup-import migration

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: Importing a full backup exported at an older backup schema now migrates it in memory through the real migration engine before restore (`apps/extension/src/wallet/services/backup/backup-migrator.ts`, `apps/extension/src/wallet/services/backup/backup-migration-registry.ts`, `apps/extension/src/wallet/services/backup/row-map-migration.ts`, wired in `apps/extension/src/composables/useFullBackupImport.ts`).
- **Open items**: `passkey-backup.test.ts`'s export case is skipped on CI and fails on a fast host, tracked in #163.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Backup migrations and live migrations are the same objects. A backup's slices are normalized into a fresh in-memory storage area, the real `Migrator` runs over it, and the current-shape slices go to the unchanged `service.restore()` pipeline. Two things are deliberately not migratable and stay hard blocks: the account-contract epoch, and any migration whose footprint touches a root a backup does not carry. The stack was clean-slate by choice: there were no backups in the wild, so no pre-baseline compatibility code exists.

## Why

Importing a backup from an older schema used to be a rejection, which would have turned every future storage migration into lost backups. Reusing the engine avoids a second, divergent copy of each transform. The hard part is that a backup holds one profile's slice of each root while a live migration sees the whole root, so a transform that reasons across rows (sorts, dedupes, first-wins) would give a partial backup a different result than a live store. Metadata checks and function-typed transformers were each defeated in review by closures that observed call order, so the only airtight form is a finite data DSL with no author code.

## What shipped

- **Two version fields.** An export stamps a non-migratable `compat-epoch` and a migratable `backup-schema-version`, replacing the single legacy field. The registry module holds the constants so export and import share one source.
- **Trust-gate order.** Checksum over the original body, then the epoch, then the version range (too old, missing or newer than this build all reject), then migrate, then restore. A recomputed post-migration checksum is never trusted.
- **Slice registry.** A pinned descriptor per service, with the verified oddities encoded: transactions are keyed by hash, the FPC slice is a plain root, config is a lossy projection, aggregated slices are optional when empty, and account state is a non-storage carve-out versioned by the Aztec version. Profile and auth-registry-enabled are block-listed, so a migration touching them blocks backup import.
- **Row-map DSL.** `defineRowMapMigration` takes only data (`rename`, `addDefault`, `drop`, `retype`, `remapValues`). Its output is frozen and branded in a module-private set so a raw `defineMigration` cannot claim backup safety. Arbitrary computation goes through `defineMigration` and blocks backup import at the versions it covers. Review closed accessor, `Proxy` and species-constructor smuggling by cloning transforms into plain literals.
- **Atomicity.** The migration runs entirely on the scratch store before any restore touches live storage, so a failure mutates nothing. Unknown slices reject. A restore that throws before finalize now deletes the half-created profile, while a finalize failure keeps it for a later unlock.
- **Guardrails.** `footprint-coverage.test.ts` checks every migration's roots against the registry and the block list, and the metamorphic per-row invariance on every backup-safe migration. The smoke and network e2e files (`backup-migration.test.ts`, `backup-migration-roundtrip.test.ts`) arm a build-stamped fixture migration and fail rather than skip when it is not armed; the round trip restores a doctored old-shape backup and syncs a real balance.

## Lessons

### vue-tsc

The first real export wrote every slice under the literal key `undefined`, each overwriting the last, so every real full backup before the fix held one config slice under a bogus key. `vue-tsc` skips an SFC whose script lacks `lang="ts"`, and the export page was one, so a bad field passed the typecheck, the smoke test only asserted buttons, and every import test used synthetic backups. The round-trip e2e found it; slices are now keyed by the same service-name constants the import registry pins.
