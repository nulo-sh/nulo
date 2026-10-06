# Concurrent dApp sendTx

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: The queued journal stage and its journal-level transition lock, the early release of the per-session message queue as a request enqueues on the mutex, the per-lane `ExecutionMutex` with its capacity cap, and the network e2e that pin them: `apps/extension/src/wallet/services/execution/execution-mutex.ts`, `apps/extension/src/wallet/services/execution/execution-lane.ts`, `apps/extension/src/wallet/services/execution/claim-helper.ts` and `apps/extension/tests/e2e/network/concurrent-sendtx-approve.test.ts`.
- **Open items**: no network e2e proves two concurrent NO_FROM sends serialize and both confirm, tracked in [follow-ups](../../follow-ups.md).
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Two pending dApp transactions must both be visible at once, and the second popup must open as soon as the first is approved. The design went through three revisions that shipped as three changes.

- **First revision.** Add a `queued` job stage so a request is visible in activity the moment it arrives, a journal-level mutex around `transitionOperation` (load, validate, write) so a claim cannot race a cancel, and per-session and global caps on queued records.
- **Layer A.** Plumb the transaction hash through `submitting` at every send site, assert that the hash on `succeeded` matches, and make the pending-transaction filter journal-first.
- **Layer B.** Release the session queue once a request is enqueued on a per-`(profile, chain)` mutex that serializes execution from before authwit discovery through submit, on both send paths. The release was first placed at approval, but the mutex is FIFO only among callers that have already called `acquire`, so a faster second request could overtake the first. Enqueue installs the request as the queue tail synchronously, so any later request lands strictly behind it.

### Parallel popups

The popup lock was not the cause. The session queue advanced only when the handler finished, because the release hook the dispatcher read had a different field name from the one the background passed; both were optional, so TypeScript never complained. Releasing the queue before execution finishes is what lets popup two open early, and that makes the execution mutex a correctness requirement, not a UX nicety. Without it two approved sends can both simulate against the same private-note snapshot, and the second is rejected on-chain for a double-spent nullifier. The NO_FROM path has no nonce at all and relies entirely on the mutex.

- The mutex is a bespoke FIFO primitive with no timeout and no force-release, because the shared `Lock` releases after five minutes and proving can legitimately take longer. It is abortable, so a queued waiter that the user cancels leaves the line without disturbing the order behind it.
- A waiting transaction stays `queued` and is claimed only after acquire. A pre-acquire abort registry lets cancel wake a waiter, and a heartbeat on waiting records keeps the reaper from sweeping them.
- The extension's hook type now aliases the bridge's, so a one-sided rename of the release hook is a build error.

## Why

Concurrent submissions were serialized end to end, so the second transaction did not show up until the first had proved and confirmed. Showing both at once is only safe if execution stays sequential, because the proving lane and the PXE chain guard are shared.

## What shipped

The queue cap is a hybrid. A single cap per lane would let one hostile dApp turn another dApp's delay into a hard rejection, so each origin has its own cap, keyed by the canonical browser origin rather than by session or display name, plus a coarse total ceiling. Overflow throws `TooManyPendingError`, a structured JSON-RPC limit error that carries no origin or profile detail, and the rejected request's journal record is terminalized directly, since the silent path has already moved it past `queued`. Abort accounting over-counts conservatively rather than risk an under-count.

Network e2e: one test proves popup two opens while the first transaction is still active. One heavy test approves both and asserts the serialization (the first is proving while the second is queued) and the first's full confirmation. It does not assert that the second also confirms, because the mutex releases at submit and two sends from the same spend source still cannot both land, see [same source sends](../proverless-network-stabilization/plan.md#same-source-sends).

### NO-FROM concurrency

A spike for a NO_FROM concurrency e2e found no NO_FROM-compatible private call that reaches an active stage. The realistic candidate fails kernelless discovery on a missing account-contract context, so the confirm test and its boundary fallback are both infeasible without new fixtures. The mutex is already proven end to end on the standard path and the NO_FROM path reuses the same acquire integration, so the spike's scaffolding was reverted and the gap recorded as a follow-up.
