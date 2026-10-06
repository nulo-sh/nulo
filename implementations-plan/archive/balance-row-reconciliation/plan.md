# Balance row reconciliation

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: Token-balance rows are created under one service-owned lock and a boot and profile-switch sweep repairs the two gaps a worker death leaves. Live in `apps/extension/src/wallet/services/token-balance/` (`service.ts`, `reconcile-pairs.ts`) with the recovery spec `apps/extension/tests/e2e/network/balance-row-reconciliation.test.ts`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Repair, do not just prevent. `TokenBalanceService` takes a lock of its own, built with the hold watchdog off. Every creator goes through one idempotent ensure path that reads, diffs, allocates and writes inside the hold. A sweep at the tail of `init()` and of each profile activation runs that path and re-enqueues any row that was never projected. The diff itself is a pure module, `reconcilePlan`, with a total deterministic order.

Rejected: an additive create-only pass, a repository-owned ensure (the wrong layer, and a per-pair read cost), and a rendezvous gate that parks the worker mid-race (a new production seam and the flakiest test shape in the suite).

## Why

Creating a balance row takes three steps (allocate an id, write the row, emit and enqueue), and an MV3 worker can die between any two. Before the write the token has no row and is invisible. After the write and before the enqueue the card shows "Loading balance..." forever, since nothing resyncs on its own. Seeding default tokens fires the token-added handler un-awaited, so a death mid-backfill reproduced the original missing-default-tokens report by another route.

A lock is mandatory, not tidy. Two profile-change subscribers and the init path all create rows concurrently, and two creators that read the same key snapshot compute the same id, so the later write silently overwrites the earlier row. The default five-minute watchdog would force-release that lock into a legitimate holder, so holds queue instead.

## What shipped

- **One lock, named internals.** Entry points acquire; every internal callee is a `...HoldingLock` form, so nested acquisition cannot happen. Profile-wide token purge joins the lock, so a creation cannot outlive profile deletion.
- **Restore shares the lock, not the ensure path.** Full-backup balances restore before the profile is active, so applying the active-token check to them would reject every restored row.
- **Both windows repaired.** A missing pair is created; a row at `updatedAt === 0` with no recorded failure is enqueued; a row of this profile whose token id now names a different token is deleted as a dead incarnation.
- **One account read.** `getAccountsRaw(profileId)` reads every chain's accounts in one call, so the sweep pays one read of the account namespace and has no visibility flag to get wrong (hidden accounts legitimately hold balance rows).
- **Deletion safety.** A token's removal from the in-memory map is synchronous, and each write re-checks the generation and the token's identity (profile, chain, contract), because ids are reused after the highest token is deleted.
- **Repository.** `BalanceRepository` requires the key to match the row's id, numerically.
- **Proof.** Table-driven diff tests, a two-parked-allocators concurrency test, and a network spec that deletes every balance row, kills the worker and requires the row back with a real projection.
