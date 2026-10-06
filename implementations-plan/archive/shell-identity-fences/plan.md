# Shell identity fences

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: `apps/extension/src/popup/network-switch.ts`, `apps/extension/src/composables/runFence.ts` and `apps/extension/src/composables/unlockWait.ts`, wired into `apps/extension/src/popup/app.vue` and `apps/extension/src/popup/pages/auth.vue`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Make the popup shell's asynchronous continuations identity-safe, and remove two retired pieces.

- **Network switch**: the watcher logic moved out of the test-less shell into a handler factory. It owns generation fencing, entry-time scope capture of profile and chain, and a compound guard (generation plus live scope) re-checked after every await, with split-statement discipline so a stale run commits nothing.
- **Unlock continuation**: the unbounded busy-wait became one watcher that is bounded (30 seconds, grounded in the transport and import-handshake limits), identity-aware, and releases at once on a definitive bootstrap failure through a typed `BootstrapFailedError`. Timeouts are a typed `UnlockTimeoutError`, never matched by message; a first-line guard refuses a second submit, and the post-wait window is re-checked before any write.
- **Activity view**: the reset key collapses profile, network and account into one scope key (empty while any part is missing), loaders use per-loader generations, and a running transfer task carries its network id.
- **Profile edit popup**: the silent catch now uses the popup family's standard toast.
- **Removed**: the one-time network-reset notification template and the install sentinel stamp.

## Why

A superseded run that survives a profile or network switch writes stale accounts, tokens or unlock state into the new scope, and a rejected bootstrap left the unlock spinner stuck for good. Fences pinned only through a primitive can be reverted silently inside a shell file with no tests, so the glue itself is extracted and tested.

## What shipped

Tests park every await boundary and cover superseded runs, profile drift with the generation intact, rapid double switches and ABA. Each claimed mechanism has a pin proven red by reverting it, and per-loader fences are probed one at a time. A default-parameter fence makes a direct event registration of that loader fail after its first await, so listeners are wrapped.
