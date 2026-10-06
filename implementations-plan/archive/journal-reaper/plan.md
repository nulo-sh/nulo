# Journal reaper

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: A pre-claim wait heartbeat with a bounded lease, a stage-guarded reaper, a bounded `waitForTx`, and controller cleanup under both journal keys. Live in `apps/extension/src/wallet/services/execution/execution-lane.ts`, `apps/extension/src/wallet/services/operation-journal/` (`reaper.ts`, `service.ts`), `apps/extension/src/wallet/services/transaction/service.ts`, `apps/extension/src/wallet/services/execution/dapp-send-executor.ts` and `apps/extension/src/wallet/services/wallet-sdk/background.ts` and `apps/extension/src/wallet/services/wallet-sdk/queued-wait-vouching.ts`.
- **Open items**: a `sendTx` leg inside a dApp `batch` gets no queued journal record while it waits, tracked in [follow-ups](../../follow-ups.md).
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Three fixes for the operation-journal reaper and its neighbours:

- **Liveness.** The reaper falsely failed dApp operations that were legitimately waiting in the session FIFO. The existing 30 second heartbeat is widened to the pre-claim window instead of adding a second liveness channel or a reaper-side exemption.
- **Reap atomically.** The reaper fails a record only through a stage-guarded transition that re-checks under the transition lock.
- **Bound the waits.** `waitForTx` gets a timeout, and the abort controller registered before a claim is released on every pre-claim failure.

## Why

A queued record's `updatedAt` is the designed liveness signal and the reaper is its only consumer, so keeping it fresh for a live waiter fixes the false failure without a competing mechanism or an inverted dependency. The window that mattered runs from arrival to slot grant and includes the operation's own approval popup, whose timeout equals the queued grace exactly.

Unbounded liveness signalling is the hazard in any mechanism: if the head-of-line handler hangs, every queued waiter behind it is touched forever and never reaped. So pre-claim waiters sit in a separate map with a lease sized to the per-session admission cap (several slow legitimate predecessors plus the waiter's own popup), a documented product ceiling after which a hung queue reaps honestly. A reaper that snapshots records and fails each without a stage check can also fail a record claimed mid-sweep on stale data, which needed the atomic guard whichever liveness design won.

`waitForTx` polled forever, so a locked wallet left a background poll running and a misleading transport error. A cancellation branch was dropped as dead code, since a parent task cannot finish while it has an open child.

## What shipped

- **Heartbeat.** `beginQueuedWait` and `endQueuedWait` on the execution service delegate to the lane. The wait begins once the queued journal id exists and ends in the handler chain's `finally`, not at the early FIFO release. Ownership moves to the execution waiter set at slot enqueue, so exactly one owner is live at any instant, and a pre-acquire cancel prunes its entry. Entries older than the lease stop being touched and are removed.
- **Atomic reap.** `transitionIfStage` re-reads under the lock and no-ops when the live stage left the allowed set or, with a compare value, when `updatedAt` moved. The reaper and `failQueuedIfUnclaimed` both use it; boot sweeps still reap prior-lifetime records unconditionally.
- **Bounded confirmation wait.** `waitForTx` takes a timeout and throws a typed `TxConfirmationTimeoutError` saying the transaction was not confirmed in time and may still mine. The wait's subtask is settled exactly once on every exit path.
- **Controller cleanup.** The executor's `finally` deletes the abort controller under both the claimed and the queued journal id, before the slot is released.
- **Evidence.** Placement pins for begin and end, the lease and migration pins, a reaper negative control proving crash detection is intact, and a real-map executor pin. The ten minute wait cannot run end to end, so the mechanism pins are the proof rather than the network suite.
