# Fix PXE and offscreen lifecycle

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: the chain-purge fence in `packages/aztec-runtime/src/pxe/service.ts`, the abandoned-open quarantine in `packages/aztec-runtime/src/pxe/opfs-store.ts`, and the tracked offscreen closes and readiness gate in `apps/extension/src/wallet/utils/offscreen.ts` and `apps/extension/src/offscreen/index.ts`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Fix three unfenced-continuation and resource-leak bugs in the PXE runtime and the offscreen lifecycle, each proven red first by a test that fails without the fix, then review the whole diff once.

## Why

Each bug let a stale continuation act after the state it assumed had changed:

- Purging a chain bumped its purge epoch only before the destructive awaits. An operation that entered during the purge read the already-bumped value, passed its post-await check, and recreated the runtime and store directory for a chain whose row was gone.
- The offscreen document answered a health ping before PXE initialisation finished, so the service worker could adopt a document that had no PXE service yet. On Firefox a timed-out pass could also overwrite a successor's live window, and a document close that was never awaited could tear down the document a successor had just created.
- The store open had a timeout but no cancellation, so a hung open kept its OPFS lock and a same-chain retry started a second worker that contended for it.

## What shipped

- **Purge fence**: a second epoch bump right before the guard releases, extracted as a helper used at both call sites.
- **Offscreen**: the Firefox window creation is fenced by pass number and closes an orphan instead of clobbering. The pong is withheld until services are ready. Every offscreen close goes through one serialised tail, so a close can never compose destructively with a later create.
- **Store open**: opens are single-flighted per chain data directory. A concurrent or abandoned open fails fast with a typed wedged-store error that asks for an offscreen restart. An abandoned open is closed exactly once when it resolves and only then frees the directory, and a failed close keeps the entry poisoned.
- **Accepted residuals**: the readiness check can recreate a document needlessly, which costs efficiency only; a rare orphaned Firefox window with a null id; and a browser close that hangs forever would poison the tail, which is safe because PXE requests carry outer deadlines.
