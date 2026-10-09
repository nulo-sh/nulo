# Storage migration framework

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: a pure migration engine in `packages/wallet-core/src/migration/migrator.ts`, the extension registry in `apps/extension/src/wallet/storage/migrations/index.ts` with its `template.ts`, the migration-aware storage facade `apps/extension/src/utils/storage.ts` and the UI barrier `apps/extension/src/components/MigrationBarrier.vue`.
- **Open items**: the engine has no watchdog on a migration's `up()`, tracked in #146.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

When a release changes the shape of a persisted `chrome.storage.local` record, existing users' data is transformed in place and never wiped. This record covers the live path, run on extension update; migrating a backup on import was split into its own work.

- **One global schema version** (`nulo:schema:version`) with numbered, sequential migrations applied where the version exceeds the persisted one. Per-collection version vectors were rejected.
- **Footprint-declaring migrations**: each declares the roots and value keys it reads and writes, so the engine backs up only that slice. Staged writes outside the declared footprint, or into the engine's reserved namespace, fail the migration at commit.
- **Pure engine, impure edges**: the engine has no `chrome.*` or I/O and takes its migrations, data source, backup and version as injected ports. Only the live `chrome.storage` adapter was built.
- **Crash-safe sequence per migration**: set a durable running marker first, which is also the UI barrier. Then write one atomic backup of the footprint ending in a completion sentinel, apply one batched diff with explicit tombstones, stamp the version, and clear the marker and backup.
- **Fail closed**: the version never advances on failure. A durable retry counter, kept outside any migration's footprint, bounds retries across boots. After that a `breaking` migration (the default) blocks with a recovery path and a non-breaking one boots degraded with a warning.
- **Marker validation**: no marker and no legacy key is a fresh install, which stamps the maximum and runs nothing. A valid marker runs the later migrations. A corrupt or out-of-range marker over existing data, or a stale legacy marker, fails closed and never initialises at the maximum.
- **Barrier**: every read of `chrome.storage.local` from the UI goes through the facade, which waits on the running marker and shows an updating state. A lint rule bans raw access outside the facade and the migration adapter.
- **Not migratable**: crypto and key-derivation rotation, since the migrator runs before unlock with no password to re-encrypt with, and session storage.

## Why

Other wallets' migration systems were surveyed for contrast. A wallet holding funds cannot tolerate a version that advances past a failed migration or code that runs on unmigrated data, so this design never does either. Before the first user, every install starts fresh and the current shape is version one, so the old ad-hoc migrator was deleted and no migration exists yet.

## What shipped

- The engine, with a harness that runs every migration twice and asserts equal results, and a seam where tests inject a migration list.
- Boot wiring that runs the migrator before configuration loads, and an end-to-end fixture migration excluded from production builds by a build-time constant and a negative bundle check.
- Fixes found by review before delivery: a crash between stamping the version and clearing the journal no longer restores the old backup under the new marker, because resume compares the stamped version to the backup's; a failed migration restores and clears the journal at once instead of wedging the barrier; restore uses the migration's declared refs rather than inferring roots from key names; and a tampered or invalid journal backup fails closed.
- The registry starts empty, so no real migration has run, and the contract for adding one is in the template.
