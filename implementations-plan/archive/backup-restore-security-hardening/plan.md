# Backup-restore security hardening

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: restore-side validation and provenance in `apps/extension/src/composables/useFullBackupImport.ts` and `apps/extension/src/utils/full-backup-helpers.ts`, and awaited, durable profile deletion in `apps/extension/src/wallet/services/profile-deletion/coordinator.ts`, `apps/extension/src/wallet/services/profile/tombstone-repository.ts` and `apps/extension/src/wallet/services/profile/profile-deletion-state.ts`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Treat a backup as an attacker-controlled blob (its checksum is recomputable, so it authenticates nothing) and fix the restore path and the delete path in one change, because splitting them would leave exploitable intermediate states. The goal was that a restored row can only bind to an account this restore just created on a chain whose network was restored, and that deleting a profile is atomic, awaited and verifiably erasing.

Restore side:

- Every restore writer parses each row with the same schema its read codec uses, before writing, and returns the parsed row.
- The restore composable keeps only rows that belong to an account this restore created on a restored chain (matched by chain and canonical address), and passes the created profile id to the services; transactions restore create-only under a lock.
- Restored pending transactions are rejected, because the submitted endpoint is backup-controlled and dialled directly.
- Network and token ids are remapped in one pass by index pairing, and ambiguous duplicate source ids drop their dependents.

Delete side:

- A dedicated `ProfileDeletionCoordinator`, started last, runs an awaited, idempotent purge over every profile-bearing root, then clears the shared PXE state. `ProfileService` holds only a narrow delete delegate, never a dependency on the leaf services.
- Deletion is two-phase around a durable tombstone that records the profile's accounts, tokens and networks, so a restart resumes the full purge.
- A tombstoned id is invisible to every profile read and stays reserved even when its record is unreadable.
- In-flight transaction writes carry a per-profile deletion epoch and re-check it under the transaction lock.

## Why

Fire-and-forget event handlers dropped every async cleanup, so "deleted" could mean "still being deleted" or "survived on a chain with no network row". An awaited coordinator avoids deadlocking the non-reentrant profile lock, which an awaited global event handler would have caused.

## What shipped

- Parse-before-write at the account, token, token-balance, auth-registry, contact and FPC restore writers; create-only transaction restore; canonical addresses keyed by chain and address; index-paired token relink.
- A token-deleted event that carries its own profile id, so an inactive profile's token deletion never touches the active profile's records.
- PXE clearing that rejects on error, retries a blocked delete for a bounded time, and removes the shared key-value store only when no profile database remains.
- `backup-restore-integrity.test.ts` arms unconditionally in required CI and covers foreign rows and the delete-then-re-add round trip.
- Follow-on cleanups: a direct `coordinator.test.ts` (awaited order, PXE last, fail-fast, single flight), corrupt-tombstone telemetry surfaced at resume (automatic repair was rejected as fail-open), and the finding that duplicate token ids are already refused upstream by backup normalization, so no extra code was added.

## Lessons

### Hidden rows

`EntityStorage` keeps a row it cannot decode but hides it from `getAll()` and `getValues()`, so a malformed restored row survives and is invisible to any cleanup driven by decoded rows. Validate before writing, and drive purges, id reservation and max-plus-one allocation from `getKeys()`, which does not decode.
