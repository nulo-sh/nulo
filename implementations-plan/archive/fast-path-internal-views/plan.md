# Fast path for internal batched views

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: `batchedViewSimulation` sends a leading run of public static calls straight to the node while the rest takes the standard path (`apps/extension/src/wallet/services/execution/helpers/batched-view-simulation.ts`, `apps/extension/src/wallet/services/execution/helpers/block-header-anchor.ts`), and the balance projector enqueues every public call before any private one (`apps/extension/src/wallet/services/token-balance/balance-projector.ts`).
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Extend the node-direct simulation that public static calls already had for dApp requests to the wallet's own batched view calls, but only for a leading prefix of the batch, with the fast and standard arms run side by side. Reorder the balance refresh so that prefix exists. This is separate from [simulate-fast-path](../simulate-fast-path/plan.md), which covers the dApp-facing simulation.

## Why

A balance refresh queued per-token private and public reads through the PXE one at a time, although public static reads need no PXE state and no private execution. The node can answer them directly, which for an all-public batch removes any PXE queue position at all.

The first design was wrong in ways review caught. A filter that picks fast calls from anywhere in the batch does not match the upstream rule, which takes a leading prefix, and interleaved per-token enqueueing leaves a prefix of one call out of twenty-four. Wallet-side lock changes were never going to help inter-method concurrency, because the upstream PXE already serializes every call through one queue; the real gain is the fast arm bypassing the PXE entirely.

## What shipped

- **Leading-prefix partition.** The prefix is calls that are public and static and do not hide the sender, since the node path ignores that flag. The prefix ends at the first call that is neither, and the rest is renumbered for the standard arm. A batch with no such prefix runs unchanged at no added cost.
- **Orchestration.** The block-header anchor is read first, so utility calls queued as writers cannot delay it, then utility calls launch once, then both arms settle together. A missing anchor or a pre-dispatch failure falls back wholly to the standard path. A real contract revert propagates. Any other fast-arm error is logged with contract and selector, and a single standard simulation covers the combined batch without relaunching the utility calls. Node info is not caught, since the slow arm shares its fate.
- **Anchor helper.** `getBlockHeaderAnchor` tries the PXE's synced header, then the node head, then returns undefined; the existing single-call fast path uses it too.
- **Projector.** All public reads are enqueued across the chunk, then all private ones, with the token lookups cached between the passes. A test pins the global order.
- **Documented limits.** The two arms may observe different blocks, which a balance display tolerates and the code does not claim atomicity for. Network-gated tests compare returned values against the standard path for a pure-public and a mixed batch.
