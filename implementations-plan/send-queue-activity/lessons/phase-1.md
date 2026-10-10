# Arc 1 — lessons

## Phase 1.1: the fee spender on the transaction row

What changed against the plan's file map, and why:

- **The pinned row travels three ways.** `FeeStrategyContext.fpc` (the strategy uses it instead of `getFpcImpl`); `buildAndEstimateTxRequest(…, probe, fpc)` and the transfer executor's `buildAndEstimate(…, signal, fpc)` carry it; `TransferEstimateReuse.tryConsume(id, inputs, fence, fpc)` judges the entry's `fpcIdentity` against the pinned row in place of a fresh `getFpcInfo` read. The reuse ladder's order is unchanged; only the source of the "live" row moved, so a reused build always matches the row the send was ordered against.
- **`TransferExecutorDeps.getFpc` became `getFpcImpl`.** `sequence()` now sees the derived protocol addresses on a cold worker, so the protocol sponsor is never mistaken for a spender after a restart (it used to be, through the cache-only `getFpc`, which only over-ordered; persisted, it would have recorded the sponsor as a spender).
- **One owner for the ticket.** `execute` owns a mutable `TransferLine` (`sequence`, `ticket`); `takeTurn` swaps the ticket on re-entry (`reenter`: re-sequence outside the slot, release the old ticket, enter with its `deadline`). `finally` releases whichever ticket is current, so a throw after a re-entry cannot leave a holder that never releases (a never-released holder blocks its keys until the waiter's own 60-minute deadline).
- **`takeTurn` releases on any throw past the grant.** `claim` no longer takes the release; the mutex release is idempotent, so the single `catch` covers the re-check, the re-entry and the claim.
- **`SendSequencer.enter(scope, keys, deadline?)`** clamps to `now + MAX_WAIT_MS`, and `SequenceTicket.deadline` exposes the absolute value, so a re-entry carries the exact first deadline (passing `remainingMs()` would drift by the clock tick between the two reads).
- **`addTransaction` writes `feeSpender` only when set**, so rows without one keep their exact bytes (the raw-bytes pin in `transaction/service.test.ts` is unchanged).

Composition (`send-order.composition.test.ts`): composed through `ExecutionService` (its real lane, sequencer and transfer executor) with the real journal, rather than wiring the four classes by hand: the service is the composition root that production uses, and a fresh instance is exactly a restarted worker's state. Every case stops before the build (D2, D3); the PXE client fake only records that `getPXE` is never called. The G control reads the real executor's `sequence()` and the real sequencer's `isBlocked`, since an unblocked transfer would proceed into the build.

Cold-sponsor control: the executor fakes `getFpcImpl`, so the derivation itself is pinned where it lives (`fpc/service-create.test.ts`: the genuine sponsor resolves as protocol on a cold cache) and the strategy side in `strategies-structural.test.ts` (a pinned protocol sponsor takes the fast path without a row read).

Revert check: deleting the `fpc:<feeSpender>` line from `recordedTxKeys` fails four cases (the keys test, the restart sequencer test, both composition cases); restored.
