# Fence stale account activation

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: a stale-activation fence in `setupActiveAccount` in `apps/extension/src/stores/app.store.ts`, and removal of a pinned derived promise in `serializePerTuple` in `apps/extension/src/wallet/services/account/service.ts`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Two behaviour fixes, each proved by a failing test first, as one arc of [remediation-followups](../remediation-followups/plan.md):

- **Activation fence.** `setupActiveAccount` captures a monotonic activation epoch plus the profile and network ids at entry and re-checks before every assignment to the active account and before the write of the durable active-account key. A stale run returns `false` and writes nothing.
- **Pinned promise.** Delete the `void next.finally(() => {})` pin from the per-tuple lock helper and keep the lock and its no-watchdog setting.

## Why

A profile activation superseded mid-flight resumed after the winner finished and landed the loser's account, then wrote it to the durable active-account key, which survives into the next bootstrap. The existing scope-change guard only protects sends in flight, two of the four assignments bypassed even that, and the composable's own fence stops at the call boundary, so only a fence inside the store covers both callers (the profile bootstrap and the network watcher).

Ids alone are not enough: an A to B to A round trip makes a parked run's captured ids match again, so the epoch is the load-bearing half and the ids catch a flip whose activation has not yet re-entered. The regression test runs the newer activations through the real action, because direct assignment cannot bump the epoch.

The pinned promise was misdiagnosed as dead code. Its defect was emission: on a rejected operation the un-awaited derived promise re-raised into the background's global handler and logged a duplicate error entry for an already-handled, benign failure such as a lock-versus-switch race. The lock already re-throws to the caller and advances its queue.

## What shipped

- The epoch-and-id fence, with a store test that parks the first activation at its storage read, and the A to B to A test.
- The pin removed, with a test that installs an unhandled-rejection listener and checks three things for both create paths: no unhandled rejection, the caller still rejects, and the tuple's queue still advances. The queue check matters because the lock has no watchdog.
- A same-scope account selection racing a parked run was recorded as a separate, pre-existing gap and left unchanged.
