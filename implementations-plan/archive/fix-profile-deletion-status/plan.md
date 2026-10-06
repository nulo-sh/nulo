# Durable resume of a torn profile import

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: A background-start sweep reaps profile imports that died before finishing, using the existing restore-pending marker and the existing deletion machinery (`apps/extension/src/wallet/services/profile/service.ts`, `apps/extension/src/wallet/services/profile/restore-pending-repository.ts`).
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Extend `resumePendingDeletions` with a torn-import sweep. For each stale restore-pending marker it initiates the real `deleteProfile` and lets the existing three-phase machinery (tombstone, then next-boot resume) finish the cleanup. There is no new storage shape, no new marker store and no UI change.

The sweep acts on a marker only when the profile row exists and its PXE generation matches. A marker with no row is purged bare, a generation mismatch purges the marker only, and a corrupt marker leaves everything and is logged, since nothing is deleted that cannot be decoded. Each marker is handled in its own try/catch.

## Why

- The spec proposed a deletion-status field on the profile row. That is unnecessary, because the restore-pending marker is written before the row lands and cleared only on finalize or delete. Every orphan variant (rollback failure, worker death, closed popup, transport death) leaves marker plus row. It is also harmful, since the profiles root is on the backup-import block list and there are no users, so no migration is written.
- Boot-time resume already existed for tombstoned deletions. The gap was only the window with no tombstone.
- A stale marker proves an incomplete import, not an abandoned one. A password import whose worker died can still finalize through the popup's reconnect, and a same-id restore can write a fresh marker between a sweep's read and its delete.

## What shipped

- A listing API on the restore-pending repository and a compare-and-delete of an observed marker.
- `deleteProfile` takes an optional torn guard. Under the lock, phase 1 refuses unless the row's generation and the exact marker are unchanged. Finalize clears the marker under the same lock, so a marker-verified reap cannot fire after a finalize, whatever the clock says.
- Age is the proof of abandonment: a seven-day floor, far above the marker's own 30-minute lifetime. A torn reap keeps its tombstone, so the next boot re-purges any slice rows a late restore request wrote after the first purge, then releases the id.
- Tests are two-boot: a torn import and a rollback with a tombstone-write fault are both reaped, with pins for a young marker, per-marker isolation, finalize beating the reap, and tombstone survival.
