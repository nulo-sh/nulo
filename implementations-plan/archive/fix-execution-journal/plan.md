# Execution and journal fixes

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: the slot-taking dApp send in `apps/extension/src/wallet/services/execution/dapp-send-executor.ts`, the boot-sweep cutoff in `apps/extension/src/wallet/services/operation-journal/reaper.ts`, and the narrowed fallback in `packages/aztec-runtime/src/fee-juice.ts`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Three correctness fixes, each proved by a failing test first, using existing mechanisms and no new abstraction.

- **dApp send bypassed the execution mutex.** `executeSendTransaction` now runs inside `runInSlot` like its two siblings, and `ExecutionHooks` (with the origin key) are threaded through from the dispatch site so per-origin fairness holds. UI callers legitimately pass none.
- **The boot reaper could fail a live operation.** A cutoff is captured before services start, handed to the reaper, and the unconditional boot sweep skips records created at or after it. `createdAt`, not `updatedAt`, is the lifetime signal; equal timestamps and clock rollback err toward not sweeping.
- **The fee fallback was too broad.** `predictedWorstMinFees` falls back to the current minimum fees only when the node lacks the method (JSON-RPC code -32601, or the message "Method not found"). Transient errors such as "block not found" propagate.

## Why

Without the slot, two concurrent send-class operations, for example a dApp calling the public authwit grant twice, could simulate and prove against the same account at once. That interleaves stale private notes and risks a double-spent nullifier. The reaper race left a journal row showing `failed` for a transaction that went on to succeed. The loose fee match could silently under-price a fee cap on a transient RPC error.

## What shipped

Existing pins that asserted the old no-slot shape were migrated, and new ones cover slot acquisition, origin forwarding, release after prove, the boot cutoff on both sides, and both fallback cases. The accepted consequence is that a UI-originated authwit operation can now hit the shared pending cap, which is theoretical.
