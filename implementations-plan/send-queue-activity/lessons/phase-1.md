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

## Phase 1.3: the dApp estimate reuse checks the epoch

- **Read before the build, as the transfer path does.** `estimateOperationFee` resolves the network and reads `sequenceEpoch(chainId, accountAddress)` before `estimateWithDiscovery.estimate`; a read at stash time (after the build) would miss a send that reached the node during the build. The test bumps the epoch inside both build fakes and asserts the stashed value is the pre-build one.
- **Ladder position:** right after the pending-set check (both local, synchronous), before the live chain read. The ladder's call-order pins in `operation-estimate-reuse.pins.test.ts` gained the `sequenceEpoch` step; a new pin shows an epoch change stops before the chain read with the fixed reason "a send reached the node since the estimate".
- **Seam:** `dapp-send-executor.ts` changed in three places only (one dep line, the epoch read in `estimateOperationFee`, one parameter and one entry field in `stashOperationEstimate`), away from `runInSlot` and `markJournal`, which dapp-ingress-grants arc 2 and arc 1b edit.

## Phase 1.4: foreign journal events (#152)

- **Scoped at ingestion, not only at the side effects.** `onJournalAdded`, `onJournalUpdated` and the snapshot (`resnapshotJournal`) admit a record only when `journalRecordInActiveScope` accepts it (account, profile, network). The side effects then run only for admitted records, and the snapshot's 30-second terminal scan reads only them. The rendered rows are unchanged: the render filters already applied the same rules.
- **The token is not part of that scope.** The predicate split in two: `journalRecordInActiveScope` (account, profile, network) gates state and side effects; `journalRecordInScope` adds the token page's token for the two render filters. On a token page, another token's terminal record still clears its own token's placeholder in the shared store, as before; scoping it by the page's token would have kept that placeholder alive until the send's promise settles.
- **Unfixed-handler check:** with the component at base, the three foreign-scope cases and the snapshot case fail (4); the two in-scope controls pass on both.
- **Seam (R5):** the change touches the predicate block, the two handlers' first lines and the snapshot's assignment; `type-roles-arc3` edits the same file elsewhere.

## Phase 1.5: the restart case and the arc gate

- **The never-happens is the queued estimate, not a queued record** (ledger D20). Send stays disabled while B's estimate reads queued, so B never creates a record before A mines. The case reuses the file's `expectQueued` contract with the background stopped between A's submission and B's start. It closes the popup first: Firefox keeps the event page alive while any extension page is open.
- **Why it fails at base:** the burst fixture mines five sends first, so B carries no `init` key. A public-to-public TST send has no delivery targets, so B's only key is `fpc:<PrivateFPC>`. A's stored row yields that key only through `feeSpender`.

## Arc 1 review, round 1 (Codex session 01a123d6, plus one Opus review)

- Codex (gpt-6.1-sol, high, default login): no material regression. Opus: no bug. Both found nothing awaited on the network under the slot, and no path from an imported row to the sequencer (`restore` refuses Pending rows).
- Accepted: comment precision (`deadline`/`remainingMs`, the reuse comment, the `fpc` context doc, `payingFpc`, `TransferLine`, `takeTurn`, the dApp ladder enumeration), the composition header, and named enums for the composition test's mined row.
- Rejected, with reasons in plan.md § Audit verdicts: the inherited uppercase-sponsor over-ordering (the FPC path belongs to fees-and-sponsors), the two fixture-helper docs, and the fail-closed PrivateFPC throw before the journal record.
