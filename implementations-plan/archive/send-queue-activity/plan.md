---
plan: send-queue-activity
tier: mid
status: closing (arcs 1, 2, 3a, 3b, 5 merged; arc 4 carries the close-out; arc 1b #392 in review)
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 3 Explore agents (sonnet) plus the driver's own read; dual audit (Codex gpt-6.1-sol high + Opus Plan); one final fresh Codex pass, resumed only to close its own blocking findings
base: origin/dev at 9574a9d
trunk: dev
issues: [90, 103, 108, 109, 110, 112, 122, 152, 209, 213, 217, 218, 219, 220, 242, 243]
---

## Outcome

- **Date:** 2026-10-13.
- **Status:** delivered in one PR per arc against `dev`. Arc 4's PR, from `send-queue-activity-queued-cap`, is planned to merge last (D-orch-23) and carries this close-out; the merge that lands it closes this plan. When it was written, arc 1b (#392) was open, planned to merge before it with fees-and-sponsors arc 2; whoever merges `dev` into arc 4 after them moves them to Shipped and drops the issues they close (#218, #219) from Open items.
- **Shipped:**
  - Arc 1, #264: the fee spender kept across restarts, journal events scoped, the dApp estimate checked against the reuse epoch (#152; #219 items a and c, OA-1 A).
  - Arc 3a, #343: the expired send state and the pruned-block re-check (#108, #109). #112 was not built: its stop rule fired (OA-6).
  - Arc 3b, #344: one scope rule, known decimals, failed-send surfaces, status contrast (#209, #103, #213, #110, #122, #243).
  - Arc 2, #373: long USD figures fit, the review line's gap, the price-moved notice (#90).
  - Arc 5, #393: keyboard reach on Send's fee card and suggestions: the two fee links are buttons, the suggestion list is a listbox, Space answers on three controls, the degraded-fee notice is a polite region (#242; D60 to D65).
  - Arc 4: a Send-page send queued behind an earlier one carries a cap, the newest same-token fee plus 25% rounded down to six decimals (D46, D47); it builds at its turn, proves at or under the cap, and above it releases the slot, keeps its ticket and asks again from Home ("Fee went up. Review", "Send for X FJ"), resuming on an accept or ending cancelled at its deadline (#217; D45 to D53, D-orch-20 to D-orch-24). One network e2e case on both browsers; § Audit verdicts holds the reviews.
- **Orchestrator records:** D-orch-1 to D-orch-30; `OWNER-ASKS.md` keeps every ask with what shipped (OA-10 to OA-14 for #217, OA-15 for #90, OA-20 and OA-21 for #242).
- **Dropped, rejected, superseded:**
  - Arc 4's old Phase 4.1 (pin the ratified constants): superseded by the re-plan (D-orch-14).
  - Phase 4.2 (#220): moved to ci-followups-2 by the owner's call.
  - Outlines B (a persisted intent) and C (the intent in the popup) for arc 4: rejected (D45).
  - Mapping an accept in the last instant before the deadline to a cancel: rejected (§ Audit verdicts, arc 4 code).
- **Known limits:** #367, #380, #381.
- **Open items:** #112 (OA-6), #218 and #219 item b (arc 1b; OA-3, OA-5), #244 (no arc), #406 (OA-20), #407 (OA-21).
- **Seeds retired:** the `/goal` and `/loop` seeds below; this record is evidence, not instructions.

Owner questions: [OWNER-ASKS.md](OWNER-ASKS.md). Recon: [recon.md](recon.md).

## Tier and budget

`mid`, set by the orchestrator. Rubric: blast radius HIGH (every send of an account goes through the ordering code; a wrong rule sends twice or fails a send), security sensitivity moderate (money-adjacent, no keys or secrets touched), novelty low (the sequencer, the slot and the journal exist), irreversibility low, migration cost low (pre-production, one optional field), external coupling moderate (Aztec node and PXE behaviour). One HIGH: `mid`. The lane is larger than one PR, so it splits into arcs inside this plan. Post-implementation hardening is not scheduled.

## Issue map (the arc that closes each issue)

| Issue | Arc | Waits on | Closes when |
|---|---|---|---|
| #218 | 1b | OA-3; G1 for the network gate | arc 1b merges, or arc 1 if OA-3 is answered before arc 1's PR opens; on OA-3 = C it closes as not planned |
| #152 | 1 | nothing | arc 1 merges (the flat feed is final; foreign events lose their side effects, D10) |
| #219 | 1 (item a), 1 or 1b (item b), 3b (item c) | OA-5 for item b, OA-1 for item c | the layer that settles its last open item: arc 3b by default; arc 1 or 1b when OA-1 is "as is" |
| #90 | 2 | page 9: P9-01, P9-02, P9-03 | arc 2 merges (items 1-2 shipped in #235) |
| #108 | 3a | page 10 P10-06, hold H7 | arc 3a merges |
| #109 | 3a | page 10 P10-07 | arc 3a merges |
| #112 | 3a | page 10 P10-05, hold H7 | arc 3a merges |
| #103 | 3b | page 10 P10-10, reservation R2 | arc 3b merges |
| #110 | 3b | page 10 P10-01..04, C12-links | arc 3b merges |
| #122 | 3b | page 10 P10-08, C9 | arc 3b merges |
| #209 | 3b | page 10 P10-11 | arc 3b merges |
| #213 | 3b | page 10 P10-09, C9 | arc 3b merges |
| #243 | 3b | page 10 P10-12, P10-13 | arc 3b merges |
| #217 | 4 | page 9 P9-04, P9-04a to P9-04d (signed 2026-10-13); fees-and-sponsors arc 2 (seam) | arc 4 merges |
| #220 | none | moved to ci-followups-2 on 2026-10-11 (Phase 4.2) | there |
| #242 | 5 | page 9 P9-05, arc 2 merged | arc 5 merges |
| #244 | no arc | its own trigger (a third site) | stays open, untouched |

Arc 3 of the lane map is split into 3a and 3b (D11): thirteen records over about thirty files is not reviewable in one sitting, and H7 holds only 3a's two issues. Arc 1 is split into 1 and 1b (D13): the panel found that #218's fix changes what a person and a dApp see (OA-3), so arc 1 ships the decision-free part first and 1b follows the answer. No issue left its lane-map arc except #218, which moves to 1b.

## Outcome & Quality Bar

**For whom.** A person who sends from the Send page and from a dApp with one account, close together, on testnet or a local network. Also a maintainer who changes ordering code later and must see what each wait protects.

**What excellent looks like.**
1. No send goes out twice, and no send skips a predecessor it shares state with that the wallet can name, across a Send-page send, a dApp send (after OA-3), a background restart and a lagging node. A dApp tx's downstream spends that its outer calls do not name (a router) stay outside the guarantee, as today (OA-4). Each rule has a never-happens test beside its success control, at the unit, composition and network layers.
2. A send that waits shows the state it is in (the existing "Queued..." record), and a send that shares nothing with earlier sends is not slowed.
3. Each wait is bounded (60 s per chain-tip observation, 10 minutes per unmined predecessor, 60 minutes per send) and fails open only into the existing degraded mode (the chain still refuses a real conflict); no new error reaches a dApp, and a request admitted once is never refused later.
4. For arcs 2-5: what a person sees matches the signed page word for word, with screenshots on both browsers and both themes.

**Good enough.** The lag gate (#219 b) is proven by unit tests only: a single local node cannot lag itself; the full network suite proves it never delays a send on one node. #152 is closed by scoping the event side effects and recording the flat feed as final, not by rebuilding it.

## Scope

In: the sixteen issues above, as the issue map says, with confirm-now-send-later (#217 item 1) built in arc 4 since P9-04 changed on 2026-10-13. Out: #244 (no arc); a pending-aware PXE simulation (an upstream change); two public spends that together overdraw a balance (out of scope since the archived concurrent-sends plan); any change to the session-FIFO baton or to dispatch timing (dapp-ingress-grants, H1); a hold on a submitted dApp tx wider than its recorded keys (OA-4).

## Architecture & Implementation

### Arc 1: restart, lag and feed (decision-free; ships first)

**The rule after arc 1.** The owner's concurrent-sends decision stands as written: "Order sends that share chain state, never fail them: a send that shares state with an in-flight send of the same account waits in the service worker until the earlier one's receipt settles, and a send that shares nothing is not slowed" (archived `hd-same-token-concurrent-sends` plan, § Decision). Arc 1 closes the place where that rule fails after a restart: a restarted worker forgets a pending send's fee contract (#219 a). Arc 1 also closes a latent stale-build gap on the dApp side, and stops foreign journal events and snapshots from clearing the current feed's state (#152). The lag gate (#219 b) waits past the point where the decision ends a wait (the receipt settling), so it is the owner's call (OA-5): Phase 1.2 is planned here and built only on OA-5 = A, in arc 1 if answered before arc 1's PR opens, else in arc 1b's layer.

**#219 a: a restarted worker still knows a transfer's fee contract.**
- `transaction/spec.ts`: `Tx.feeSpender?: string` and an optional `TxSchema.feeSpender`, validated as `account` is. Pre-production, so no migration. Restore already refuses Pending rows, and the sequencer reads only Pending rows, so an imported value orders nothing.
- `transfer-executor.ts`: the post-grant re-check re-reads the fee contract named by `req.feeSettings` (a storage read, no network) and compares its address with the sequenced one.
  - **Ownership.** `takeTurn` owns its local release until it returns (`transfer-executor.ts:298-304`), while the outer `releaseSlot` is still unset (`:192, 238`), so every await after the grant runs inside a `try` that releases the local slot on any throw.
  - **Re-entry.** If the address changed during the wait (a sponsored FPC's address is editable, `fpc/service.ts:327-364`), the send gives the slot back, releases its ticket, and enters the line again with the new keys and the original deadline (`enter` gains an optional deadline, so a re-entry never extends the 60-minute bound).
  - **Pinning a validated snapshot.** The re-check resolves through `fpcService.getFpcImpl(fpcId)` (`fpc/service.ts:401-414`), which checks ownership, derives the protocol addresses even after a restart, and refuses a PrivateFPC row that is not the protocol contract. `sequence()` resolves the same way, so the protocol-sponsor test at both points sees derived metadata, not an empty cache (`getFpc` reads only the cache, `:243-248`). The resulting `Fpc` (decorated info plus handler) is passed immutably into the build, fresh or reused: `FpcStrategy` uses it, sponsored fast-path decision included (`fee/fpc-strategy.ts:117-132`), instead of resolving the row again, and a reused estimate built with another address is rejected. `recordTransfer` writes its address as `feeSpender`, so the row names the contract the tx used and the build is ordered against it.
- `transaction/service.ts`: `AddTransactionInput.feeSpender` is written to the row. `send-sequencer.ts`: the `pendingTxs` projection gains `feeSpender`.
- `transfer-sequence-keys.ts`: `recordedTxKeys` adds `fpc:<feeSpender>` when the row names one. Its doc comment loses "A popup transfer's record names no fee contract".

**#219 b: the chain-tip gate (after OA-5 = A).**
- **What it fixes.** The transfer path releases a successor once a predecessor's receipt leaves Pending at the node that receipt is read from. The PXE simulates against its runtime node, which on a multi-endpoint network can be behind. The gate makes the successor wait, briefly and with a bound, until the PXE runtime node reports that block. It limits replica lag; it does not prove canonical inclusion. A reorg below the floor, or a tip that regresses after the check, falls back to today's degraded mode: the chain refuses a real conflict.
- **New `execution/chain-tip-gate.ts`**, a class with injected deps (`readTip(networkId, signal)`, `now`, `sleep`, `logDebug`):
  - **Observations come only from this worker.** `observe(row)` is called from the `onTransactionUpdated` handler that already calls `sendSequencer.settled` (`service.ts:476-480`), when a row this worker watched leaves Pending into a block. It stores `{scope, keys: recordedTxKeys(row), block: row.block.number, observedAt: now()}`. The event has one emitter, the sync worker's update (`transaction/service.ts:505`); restore writes rows without emitting it. Phase 1.2 re-checks that. A backup therefore cannot plant an observation (D7). A Pending row re-armed at boot is watched by the new worker, so a restart keeps the observations that matter.
  - **Lifetime.** Each observation lives `CHAIN_LAG_MAX_MS` (60 s) from `observedAt`, independent of any stored timestamp. Past that it holds nothing.
  - **`unconfirmed(scope, keys)`** is synchronous. It is true when a live observation in scope, whose keys intersect `keys`, names a block above the last tip read for its network. With `keys` undefined it considers every observation in scope (the dApp waiter, arc 1b).
  - **`refresh(networkId)`** is one tip read: a single attempt with a 3 s timeout, deduplicated per network. A failure marks that network's live observations confirmed (fail open) and logs a fixed category at `debug`. `observe` triggers one refresh, so on a single node the floor is normally confirmed before the person's next send.
  - **`wait(scope, keys, networkId, signal, maxMs)`** refreshes every 1 s while `unconfirmed`. It ends when the observation is confirmed, when its lifetime ends, after `maxMs` (the caller's `ticket.remainingMs()`), or when `signal` aborts. An abort returns `aborted`; it never throws.
- **`readTip`** reads the PXE runtime node's proposed tip without the PXE's chain guard. `pxeService.getLatestBlockNumber` runs under `chainGuard.read` (`pxe/service.ts:686-689, 913-949`) and would wait behind a proof. Phase 1.2 confirms two things: the URL the runtime node syncs from (`chain-runtime.ts:179`), and the node method that returns the tip the PXE syncs to. Nulo sets no `syncChainTip`, so the default is proposed (`runSynced`, `pxe.js:577`). The read goes through `networkService.getSingleAttemptNodeForUrl` (`network/service.ts:832`). If no guard-free path to that node exists, the fallback is `getLatestBlockNumber` raced against the 3 s timeout, called only outside the slot.
- **Transfer path (`transfer-executor.ts`).**
  - Row creation: the row is also created `queued` when `gate.unconfirmed(scope, keys)` holds. This is synchronous, so nothing is read before the row exists.
  - `takeTurn`: `gate.wait` runs after `waitForDependencies`, inside the same heartbeat bracket, and before the slot.
  - Post-grant re-check: `ticket.blocked() || gate.unconfirmed(scope, keys)`, synchronous. If either holds, the slot goes back and the loop waits again. Nothing is awaited on the network while the slot is held.
- **Estimate admission (`service.ts:~553`)** also answers `{queued: true, tokenSpent: false}` while `gate.unconfirmed(...)`, and starts `gate.refresh` without awaiting it. The Send page asks again every 2 s.
- **Logging:** fixed categories at `debug` only; no hash, address, block number or URL.

**The dApp estimate reuse checks the sequence epoch (a latent gap; decision-free).** `operation-estimate-reuse.ts:115-126` rejects a reuse when the pending set or the chain identity changed. It does not reject one when a send of the account reached the node and left the pending set between the estimate and the approval. `transfer-estimate-reuse.ts:186-189` checks the sequencer epoch for exactly that case. The dApp entry now stashes `sequenceEpoch(chainId, account)` at estimate time and rejects the reuse on a change, falling back to the fresh build. Nothing visible changes: a rejected reuse already builds fresh.

**#152: the flat feed is final, and foreign events lose their side effects.**
- Transactions and awaiting entries already have per-scope slices (`stores/activity.store.ts`). Journal, task and cancel state stay flat in `RecentActivityView.vue`, read through `journalRecordInScope` (`:274`). Rebuilding them as slices would rewrite a file three lanes reserve (R5), for no change a person sees (D10).
- **The leak the panel found.** `onJournalAdded` and `onJournalUpdated` run their clearing side effects before any scope check (`:499-524`): `clearAwaitingTransactionFallback`, which matches account, recipient and token only, plus the task and cancel clears. A terminal event from another profile or network can therefore remove the current scope's awaiting placeholder or task. The snapshot path leaks the same way: on mount and reconnect the view fetches by account (`:552-559`; the RPC filters profile but not network, `operation-journal/service.ts:134-137, 499-505`) and immediately runs `clearExecutingTaskIfRecentTerminalMatch` over the unfiltered rows (`:450-458`), whose match checks account and token but not network (`recent-activity-handlers.ts:64-68`). Arc 1 runs every side effect, from an event or a snapshot, only for a record `journalRecordInScope` accepts. This removes a wrong disappearance; nothing new is drawn.
- One invariant comment at the state block: every producer of journal, task or cancel state, and every side effect of a journal event, goes through the scope predicate, and the scope watcher empties the flat state synchronously.

**Arc 1 file map.**
- Modified: `apps/extension/src/wallet/services/execution/{transfer-sequence-keys.ts, send-sequencer.ts, transfer-executor.ts, service.ts, operation-estimate-reuse.ts}` (plus the dApp estimate entry that stashes the epoch, located in Phase 1.3), `apps/extension/src/wallet/services/transaction/{spec.ts, service.ts}`, `apps/extension/src/popup/components/modules/general/RecentActivityView.vue`.
- Added: `apps/extension/src/wallet/services/execution/{chain-tip-gate.ts, chain-tip-gate.test.ts, send-order.composition.test.ts}`.
- Tests modified: `transfer-sequence-keys.test.ts`, `send-sequencer.test.ts`, `transfer-executor.test.ts`, `service.estimate-queue.test.ts`, `operation-estimate-reuse.test.ts`, `RecentActivityView.test.ts`, `transaction/service.test.ts`.
- e2e: `tests/e2e/network/same-token-concurrent-sends.test.ts` (the restart case).

### Arc 1b: dApp sends wait for the account's earlier sends (#218; after OA-3)

Built only on OA-3 = A or B. On C nothing is built and #218 closes as not planned. Every piece below serves both A and B; they differ in one predicate.

**The waiter.** A dApp send enters its account's line as a waiter, through `sendSequencer.enterWaiter(scope, {includeDapp})`. The call is synchronous, so the waiter's place in line is its grant order. A waiter holds an empty key set, and `blocked()` returns early on empty keys, so no other ticket ever waits for it. A dApp therefore cannot delay a Send-page send by queueing (Opus 2). A later Send-page send is still ordered after the dApp tx exactly as today: by the slot until submit, then by `externalSent` on the recorded keys. The waiter itself is blocked by:
- every earlier Send-page ticket of the scope. The wait is opaque because a dApp send's spends are unknown before the build (recon § #218);
- every Send-page ticket that has been sent and still holds, whatever its place in line;
- every pending row of the scope inside `SUBMITTED_HOLD_MS` that no holder carries, whose origin is the Send page (B) or any origin (A);
- on A only, every `externalSent` holder.

A later Send-page ticket that has not reached the node does not block the waiter: it cannot be building while the waiter holds the slot, and the post-grant re-check runs under the slot. The waiter enters the line of every scope the send spends from (`op.accountAddress` and `op.opts.additionalScopes`, `dapp-send-executor.ts:698-704`) and is blocked when any of them is. On OA-5 = A, the chain-tip gate applies with every observation in those scopes (`keys` undefined); otherwise the waiter has no gate.

**Where it waits: parked outside the slot, with its place and reservation kept (D1).**
- `runInSlot` keeps its first `acquireSlot` exactly as today, so the session baton still fires at the first enqueue. That is a frozen invariant in the `execution-lane.ts` header, and dispatch timing belongs to dapp-ingress-grants (H1). After the grant and before `claimOrCreateJournal`, `runInSlot` holds the slot in a `let release` that `finally` always calls, and does this:
  1. Resolve `chainId` (`deps.getNetwork`) and enter the waiter(s).
  2. If an earlier request of the same origin is parked (see Origin order), park behind it.
  3. While `waiter.blocked()` (or `gate.unconfirmed(...)` on OA-5 = A; both synchronous, under the slot): park, wait outside the slot (`waiter.waitTurn`, then `gate.wait`), and re-enter. `aborted` throws `JobCancelledSentinel(queuedJournalId)`. `expired` (60 minutes) runs the send unordered and logs a fixed category at `debug` (D4).
  4. `finally` releases the waiter(s) and whichever `release` is current.
- **`ExecutionMutex`: the reservation survives a park.**
  - A holder can hand the slot back while its depth stays counted: `keep()` on the release returns a reservation.
  - `acquire(key, signal, {reservation})` re-enters at the tail without a cap check and takes over the counted depth.
  - The final `release` decrements once.
  - A reservation that is never re-entered (abort, session end, error) is dropped, decrementing once.
  - A reservation is single-use and bound to its lane and origin; a consumed or dropped one is refused. Disposing of a reservation is separate from resolving the FIFO tail: an aborted re-entry still chains its tail to the real predecessor, as `acquire`'s abort path does today (`execution-mutex.ts:149-158`), and only the depth count moves when the reservation is dropped.

  Parked requests therefore count against the per-origin cap (8) and the lane cap (32), so a burst cannot grow while it is parked. A request admitted once is never refused later with `-32005` (Codex 2 and 10).
- **`ExecutionLane.parkSlot(release, networkId, queuedJournalId, fence, preController, originKey, wait)`.**
  - It keeps the reservation, hands the slot back, and keeps vouching for the record (`beginExecutionWait`). The controller registered by `acquireSlot` is reused, never registered again.
  - It runs `wait`, asserts the fence, then re-enters with the reservation in the origin's bucket.
  - Errors map as `acquireSlot`'s do. A capacity refusal cannot happen. The catch shared with `acquireSlot` is extracted once. A session that ends while a request is parked reaches it by one of two existing paths, and both keep their outcome: `abandonDeadSessions` transitions the record to `cancelled` first and aborts second (`execution-lane.ts:228-247`), so the wait ends as the cancel sentinel; if the fence check at re-entry fails first, the record fails as `session_ended`. Neither path overwrites the other's terminal state (`transitionIfStage`).
  - A request with no record waits on a signal that never aborts. Like today, while it waits for the mutex, it cannot be cancelled while parked.
- **Origin order (Codex 5).** For each `originKey`, the lane keeps the tail of that origin's parked chain. A request granted while an earlier request of its origin is parked parks behind it. It re-enters only after that earlier one has re-entered or left. Requests of one origin therefore still execute in their enqueue order, whatever accounts they name, and the session FIFO guarantee holds because a session belongs to one origin (I2). Other origins and Send-page sends never wait on another origin's chain.
- **Pre-claim failures (Opus 4, Codex 6).** Any throw between the first grant and the claim, other than the cancel sentinel, fails `queuedJournalId` through `transitionIfStage(id, ["queued", "pending"], failed)`. A silent-path record is already `pending` (`dapp-interaction/service.ts:544-574`), so this keeps it from being left at Preparing; the background safety net only fails `queued` records.
- **`service.ts`:** wires `sendSequencer`, the gate and `parkSlot` into `DappSendExecutor`'s deps.

**What the person and the dApp see (OA-3).**
- While the dApp send waits, its record reads "Queued...". A silent-path send reads "Preparing..." instead, because its record is already `pending` (OA-1's gap).
- The dApp's `sendTx` answers later.
- A later request from the same origin waits behind it.
- There is no new copy, state or error.

**Arc 1b file map.**
- Modified: `apps/extension/src/wallet/services/execution/{send-sequencer.ts, dapp-send-executor.ts, execution-lane.ts, execution-mutex.ts, service.ts}`.
- Tests: `send-sequencer.test.ts`, `execution-mutex.test.ts`, `execution-lane.test.ts`, `dapp-send-executor.test.ts`, `send-order.composition.test.ts`.
- e2e: `tests/e2e/network/same-token-concurrent-sends.test.ts`, plus `concurrent-sendtx-confirm.test.ts` on A.

### Arc 2: Send's amount card and review sheet (after page 9)

Items 3-6 of #90. Every option of P9-01 is planned so the chosen one builds without re-planning.

- **P9-01 (items 3-4), visual.**
  - Option A (shrink): `components/composite/send/AmountCard.vue` applies the field's existing scale to the fiat input too: `fitField()` measures the fiat form with `rulerWidth` and `inputRoom` (`utils/hero-ruler.ts`) and sets `--hero-scale` on `send-amount-fiat-input`; the derived span `send-amount-derived` gets its own scale from its length with `fitHero` (`utils/hero-fit.ts`), `white-space: nowrap` kept. `$25.00` keeps scale 1.
  - Option B (cut): `.conversion` and the derived span get `min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap`. The fiat field keeps today's size. `SendReviewSheet.vue` is unchanged: it already shows the full figure.
  - Option C (move): `send-amount-derived` moves out of `send-amount-meta` into a new right-aligned row directly under `send-amount-row`; the meta row keeps the balance corner and Max. Test ids are kept.
  - "As is": nothing is built; items 3-4 close as not planned (SR3).
- **P9-02 (item 5), veto.** `SendReviewSheet.vue:231-233`: the 4 px gap moves from the symbol's `margin-left` to the end of the number; unwrapped lines draw identical pixels.
- **P9-03 (item 6), veto.** `send.vue:746` and `pages/send-fiat-gate.ts`: a pure `requoteReason(snapshot, live)` returns `moved` only when a live quote exists and differs from the snapshot, else `stale`. The notice reads "The price moved since you started typing." for `moved` and the existing "The price quote went stale." for `stale`.

**Arc 2 file map.** `apps/extension/src/components/composite/send/AmountCard.vue` (+ `AmountCard.test.ts`), `apps/extension/src/popup/components/modules/send/SendReviewSheet.vue` (+ test), `apps/extension/src/popup/pages/send.vue`, `apps/extension/src/popup/pages/send-fiat-gate.ts` (+ test).

### Arc 3a: send outcome states (after page 10; hold H7 on #108 and #112)

- **Contracts first (Codex 12).** `JobProgress` and `SendCheckOutcome` live in `packages/wallet-core/src/jobs/types.ts:48, 67-85`, so the new fields and outcomes start there, together with their carry through serialization and the journal's validation. Two existing behaviours block #109 as it stands:
  - `setSendCheck` refuses a row that is already answered (`operation-journal/service.ts:385-386`);
  - succeeded rows are outside the send check (`send-check.ts:64, 176-178`; `journal-state.ts:79`).

  Submission is not inclusion: a successful send replaces its endpoint-bearing progress with `{stage: "succeeded", txHash}` (`execution-coordinator.ts:345-354`). Execution stages stay terminal; #109 adds outcome metadata beside them, an inclusion record `{state: "submitted" | "included" | "pruned" | "final", result?: "success" | "reverted", block?, checkedAt}`, written only through one fenced journal method under the transition lock with an `updatedAt` compare. The execution result (`result`) is separate from inclusion finality: a receipt reads reverted already at Proposed, Checkpointed or Proven (`send-check.ts:20, 189-191`), and such a block can still be pruned. Allowed moves: submitted → included; included → pruned or final; pruned → included (re-inclusion, `result` re-read) ; nothing leaves final. `result` is set on each inclusion and is fixed only at final. The same record serves a succeeded send and a failed send that the check later finds included. The watch re-arms at boot for every record not final, reverted inclusions included, against the active profile's node.
- **#112 (P10-05).**
  - `sendTxTask` keeps its single `node.sendTx`, which the legal-guard pin requires (CLAUDE.md § Terms acceptance). It sends through a node whose fetch counts the POST attempts of that call: a per-send counting node from the network service.
  - A JSON-RPC error object alone does not prove a refusal: the Aztec client turns transport failures into synthetic JSON-RPC errors on the same surface (`@aztec-labs/foundation` `safe_json_rpc_client.ts:183-204, 233-234`). So the counting transport keeps per-call evidence from the HTTP layer itself: the number of POSTs, and for the last one whether a response arrived, its status, and whether its body parsed as a server error object.
  - After a throw, the coordinator reads that evidence. "Refused on the first attempt" needs one POST whose response arrived and carried a server error (a 4xx, or a 200 whose body is an error object). A lost response, a timeout, an unparseable body or a second POST keeps today's check.
  - Only that evidence enters progress, never a response body. The dApp's error envelope is unchanged.
  - `journal-state.ts` maps it to `refused`. The card and detail label read "Refused by the network"; the context reads "The network refused this transaction, so it won't go through. Check the details before sending it again."
  - `send-check.ts` does not watch a `refused` row.
  - If neither refusal shape can be told apart from a transport failure, the arc stops and returns the limit to OWNER-ASKS. H7 holds the merge anyway.
- **#108 (P10-06).**
  - At submission the coordinator records the tx's expiry with `txHash`. On Aztec 6.0.0-rc.1 that is the kernel public inputs' expiration timestamp; Phase 3a.2 locates the field.
  - Chain time first, receipt second. A check first reads the latest block and requires its timestamp past the expiry; only then reads the receipt. A tx cannot be included after its expiry, so a receipt read after that block that finds nothing (neither Pending nor in a block) means it never was, provided the node indexes every included tx's receipt. A row is `expired` only on that sequence, both reads from one node.
  - A receipt in a block means `sent`. A Pending receipt, or any read error, keeps today's verdict.
  - The copy reads "Won't go through" / "This transaction expired before the network included it. No fee was paid, and you can send it again."
  - Phase 3a.2 establishes the node's receipt retention and indexing on Aztec 6.0.0-rc.1. If a node can forget or not yet index an included tx's receipt, "No fee was paid" cannot be proven, and the arc returns the copy to OWNER-ASKS.
- **#109 (P10-07).**
  - The finality watch re-reads a `sent` row's receipt on the slow cadence until it is Finalized. A receipt that goes back to Pending, or is dropped, returns the row to `checking`.
  - `TransactionService` re-polls a mined row below Finalized only when this worker moved it out of Pending itself, tracked in an in-memory set. It never re-polls a restored row: that row's stored endpoint is backup-controlled (`transaction/service.ts:556-567`, the D16 rule).
  - After a restart, re-polling resumes only through the journal's re-arm, and only against the active profile's node.
  - The copy reads "Went through", with "The network included this transaction. Your wallet keeps checking until it is final." Once the row is final it reads today's "The network confirmed this transaction."
  - The incoming-transfers seams are not touched: `receiptFence`, `commitAddressedEvents`, and a `revoked` commit holding its cursor.
- **H7.** Only these approved strings ship. No copy says "Nothing was sent" or "no fee was paid" after a refusal that can follow a retried POST.

**Arc 3a file map.**
- Changed source: `packages/wallet-core/src/jobs/types.ts`, `apps/extension/src/wallet/services/network/service.ts` (the counting node), `apps/extension/src/wallet/services/execution/execution-coordinator.ts`, `apps/extension/src/wallet/services/operation-journal/{service.ts, send-check.ts}`, `apps/extension/src/wallet/services/transaction/service.ts`, `apps/extension/src/utils/journal-state.ts`. Each comes with its tests.
- e2e: `tests/e2e/network/failed-send-check.test.ts`.

### Arc 3b: feed surfaces (after page 10, C9, C12-links; R1, R2, R5)

- **#103 (P10-10).** Every listed site reads `knownDecimals` (`utils/token-amount.ts:22`) and shows no figure when it is `null`, as `received/[id].vue:99-103` does: `RecentActivityView.vue:197, :352`, `journal/[id].vue:80`, `journal-state.ts:378`, `usePrices.ts:83`, `token-fold.ts:21`, `BalanceView.vue:67`, `TokenCard.vue:33-35`, `useArrivals.ts:115`, `TransactionIncomingCard.vue:39`. Known decimals look as today. R2: after tokens-and-balances arc 1 (#206), before chain-endpoints arc 2 (#116).
- **#110.**
  - P10-01, visual. Option A: `packages/design/src/composables/toast.ts` adds `info` (stays until closed, like `error`); `ToastManagerBase.vue` adds an `info` branch from the error branch with Icon `clock-circle`, colour `secondary`, `data-kind="info"`; `send-submit.ts:96-98` opens "Send not confirmed" with `info`. Option B: as today. Option C: `send-submit.ts` opens it with `success`; the success branch takes an optional icon override (`clock-circle`); no new kind.
  - P10-02, veto. Home hides the failed record when a settled row carries the same hash: `recent-activity-rows.ts` drops a terminal journal row whose `progress.txHash` matches a settled tx row in scope.
  - P10-03, approve (C12-links). `pages/journal/[id].vue` shows the Tx hash row and "View on <explorer>" when the record has a hash, removed by explorer None. Extract `TxHashRow` from `pages/tx/[id].vue:262-276` and use it on all three detail pages; the explorer id comes from `appStore.defaultExplorer`, the chain from the record's network.
  - P10-04, veto. Reproduce first in `snack-placement.test.ts`; if the error snack covers the awaiting card's Cancel, register the card's action row with `vSnackFooter`.
- **#122 (P10-08, C9).** The awaiting card draws at once with its stage line as the existing loading skeleton until the stage arrives; it never shows a wrong stage. `RecentActivityView.vue:707-800`, `TransactionAwaitingCard.vue`; the characterization at `RecentActivityView.test.ts:962-983` becomes the requirement.
- **#209 (P10-11).** One exported `journalRecordInScope(record, scope)` in `utils/activity-rows.ts`: a record stamped with a profile or network shows only while that profile and network are active; with no active profile, no stamped record shows; unstamped records keep showing. Home, `TokensView.vue`, History (`journalRows`) and `journal-detail-scope.ts` call it. If the arc cannot reproduce a Home/History split, #209 closes with the shot as evidence and the rule still ships (the record's premise).
- **#213 (P10-09, veto).** `cardAmountFor` treats an empty `amountRaw` as absent, like the finished card.
- **#243.** P10-12, veto: the terminal card's status icon fills with its state's text token (`--txt-warning`, `--txt-danger`, `--txt-success`) through new `fill--txt-*` utilities (`token-contract.ts`, `bun run --cwd packages/design gen:tokens`), asserted at 3:1 against the page in `theme-contrast.test.ts`; dark unchanged where it passes. P10-13, approve: the dark `--txt-danger` in `base.css` becomes the nearest value at least 4.5:1 on `--nulo-surface-high`; the test asserts page, hovered and pressed; the light theme is untouched; the test's "dark equals `--red`" pin changes for danger only.
- **#219 c (OA-1).** If the owner approves A: `packages/wallet-core/src/jobs/fsm.ts` gains `pending → queued`; `transfer-executor.ts` `takeTurn` moves a `pending` row to `queued` before it waits and claims it back after. If arc 1b is built, its park moves a silent-path `pending` record to `queued` the same way (`dapp-send-executor.ts`), and the claim takes it back. On "as is": nothing is built and #219 closes for its built items.

**Arc 3b file map.** As listed above, plus their colocated tests; e2e `tests/e2e/rows.test.ts`, `home-links.test.ts`, `navigation.test.ts`; network `snack-placement.test.ts`, `failed-send-check.test.ts`, `account-switch-isolation.test.ts`, `same-token-concurrent-sends.test.ts` (#219 c).

### Arc 4: a queued send against a fee cap (#217; page 9 P9-04, P9-04a to P9-04d, signed 2026-10-13)

Re-planned on 2026-10-13: the owner turned "approved as proposed, builds nothing" into confirm-now-send-later (D-orch-14). #220 left this arc on 2026-10-11 (Phase 4.2). Recon: [recon.md § Arc 4](recon.md#arc-4-recon-queued-send-against-a-fee-cap-read-at-dev-e900f710).

**The rule.** Today a Send-page send whose keys an earlier send holds gets the queued estimate answer, and Send stays disabled until a real estimate lands. After arc 4, when a basis exists and the person pays the fee themselves, the page offers "Queue send" against a cap Y. The send then waits in the service worker exactly as a queued send waits today (`execute` → `takeTurn`). At its turn it builds. A build whose fee is at or under Y is proved and sent as built. A build above Y is not proved: the send keeps its place and asks again. Nothing is signed or simulated before the turn (P9-04).

**Basis and cap (new `execution/queued-fee-cap.ts`, beside the sequencer).**
- `queuedFeeBasis(rows, profileId, chainId, token)`: the newest Tx row of the account (by `createdAt`) stamped with the active profile, not `ambiguous`, on `chainId`, whose origin is the Send page, whose first call is `token`'s contract, and whose `estimatedFee` passes `isFeeAmount` (a positive decimal of at most 39 digits, the width of a u128), and whose `createdAt` is not in the future (a restored row from the future would stay the basis for good; the sequencer skips such rows too). Two profiles of one seed share an address, so the profile stamp keeps another profile's figure out. It is the figure `recordTransfer` stored from `getEstimatedFee`, the arithmetic the readout's `~X FJ` shows. No such row means no basis: the page keeps today's queued state (OA-11).
- `queuedFeeCap(basis)`: `basis × 125 / 100`, rounded down to the readout's six decimals (`10^12` base units), so the Y on screen is the Y enforced. A cap of 0, or one that fails `isFeeAmount`, is no cap. `QUEUED_FEE_MARGIN_PERCENT = 25n` is the one constant.
- `estimateTransferFee`'s queued answer (`service.ts:585`) gains `cap?: { basis: string; cap: string }` (`TransferFeeQueued`, `spec.ts:18`). The basis is read from `getTransactions` there, outside admission; it is a storage read, nothing on the network.

**The Send page (screens 1 and 2).**
- `estimateWhenClear`'s `onQueued` receives the answer; `send.vue` keeps `queuedCap` beside `feeQueued` and clears both together (`:383, :484, :529`). An unspent queued answer sets `queuedCap` (to none when it carries no cap). A spent-token answer (`QUEUED_SPENT`, which carries none) leaves it as it is, so "Queue send" does not flicker during the requeue.
- Queue mode holds when `feeQueued`, a cap and a self-paid method (Public or Private Fee Juice) hold together. `FeeSettingsCard.vue:266-270`'s `feePayer === "self"` rule moves into one helper in `fee-helpers.ts`, which the card and the page both call. The helper requires a chosen `fj` or `private_fpc` method: today's rule reads "self" with no method at all. A sponsor or an unvouched contract keeps today's queued state (OA-10).
- `FeeCostReadout.vue` gains the queued-cap branch of the shot (`fee-estimate-queued-cap`, `fee-estimate-queued-cap-line`, the USD span keeps `fee-estimate-usd`). "About X" is the basis through `feeDisplay`. `fee-helpers.ts` gains `feeInWords` (`X FJ (usd)`); `feeLine` becomes `~` plus it.
- `isAllowedToSend` refuses `feeQueued` only outside queue mode. The button label is `CONFIRMING`, else "Review send" when the review gates, else "Queue send" in queue mode, else "Confirm Transaction" (the shot's precedence).
- `SendReviewSheet.vue` gains `queuedCapText` (fee line and "Queue send"), as `shot/217-review`.
- `snapshotTransfer` carries `feeCap` in queue mode and no estimate id; `submitTransfer` passes it as `executeTransfer`'s ninth argument.

**The background.**
- `executeTransfer(…, precomputedEstimateId?, feeCap?)`. `service.ts` accepts `feeCap` only as `undefined` or a string that passes `isFeeAmount`. Anything else is refused with the boundary's typed parameter error, before the legal check spares a proof. `execute(req, estimateId, fence, cap?)` takes it beside the request, so `TransferRequest` and the reuse fingerprint are untouched.
- `execute`'s build moves into one loop (`buildWithinCap`), and the re-ask arm into its own helper (`askAgain`, which returns the accepted fee or throws), so each stays under the 80-line and complexity budgets. The current slot release lives in one mutable holder, as `TransferLine` holds the ticket; each pass replaces it, and `execute`'s `finally` releases whatever it holds (the mutex release is idempotent, `execution-mutex.ts:121-124`). A throw on a second pass therefore never leaks a grant:
  1. `takeTurn` as today; the held estimate id (the popup's, then the re-ask's) through `tryConsume`, else `buildFresh`.
  2. Without a cap, or with `fee = getEstimatedFee(build) ≤ cap`: prove and send this build, as today.
  3. Above the cap, in this order, with nothing awaited on the network:
     - release the slot;
     - stash the build under a fresh id with the entry `runEstimate` writes (that entry's construction is extracted once and shared; `buildFresh` keeps `chainIdentity`, `fpcIdentity` and the epoch for it). The reused arm keeps the entry it consumed, so a re-stash copies that entry's provenance and its `builtAt`: re-stashing never renews a signed request's retention. `SingleShotTtlCache.stash` schedules the physical drop at `builtAt` + TTL, not stash time + TTL (the same for today's callers, which all stash at build time). The frame that built it returns only `{ stashId, fee, payer }`, so nothing holds the signed request while the person decides;
     - register the waiter (`QueuedFeeAnswers.wait`), then publish `simulating → queued` with `reask: { fee, cap, payer }` through the throwing `transitionJournal`, not the swallowing `markJournal`. An accept can therefore never arrive before its waiter exists. A failed publication removes the waiter and fails the send as any build error does;
     - wait for the answer inside `beginQueuedWait`/`endQueuedWait`. A signal already aborted when the wait starts answers `aborted` at once.
  4. The ticket is neither released nor sent during the wait, so a later send that shares its keys waits behind it, as "Goes out after your earlier send" promises. The slot is free.
  5. Accept: claim `queued → pending` (the progress replacement drops `reask`), set `cap = fee`, keep the stash id, and loop to 1. A row that must wait again moves back to `queued` through D37's `waiting()`. Within the TTL and with every rung holding, the re-ask build itself goes out ("Send for X"); after a rebuild the accepted fee is the cap.
  6. The executor's own moves here (the publication, the accept's claim, the expiry's cancel) follow `claim`'s rule (`transfer-executor.ts:416-424`): a move that fails while the signal is aborted, or on a record already `cancelled`, throws the cancel sentinel, never a failure. `cancelJob` writes `cancelled` before it aborts, so each can lose that race. `aborted` (the × or a session end) throws the cancel sentinel. `expired`, the send's own 60-minute deadline (`ticket.remainingMs()`, under the 90-minute heartbeat lease), moves `queued → cancelled` and throws the same sentinel (OA-12). Every exit evicts the stash entry (`TransferEstimateReuse.evict`, which exists).
- `QueuedFeeAnswers` (in `queued-fee-cap.ts`) holds one entry per waiting `journalId`: `{ fee, resolve }`. `wait(id, fee, signal, ms)` resolves once, with `accepted`, `aborted` or `expired`. `accept(id, fee)` resolves only an entry whose fee equals `fee`, and deletes it. It returns whether it resumed.
- New popup RPC `acceptQueuedFee(jobId, fee): boolean` (`spec.ts`, `rpcMethods`, `client.ts` passthrough list). It applies `cancelJob`'s ownership gate: the record exists, belongs to the active profile, is a `transfer` at `queued` with `reask.fee === fee`. The fee string passes `isFeeAmount`. It is not a broadcasting entry point: the broadcast still runs from the original `executeTransfer` through `sendTxTask`'s legal guard, so `call-sites.test.ts` is unchanged.
- `payer` is the popup's `PayerDescriptor` shape, `{ type, fpcId?, isProtocol }`: `{ type: "fj", isProtocol: false }`, or the pinned `Fpc`'s id, `isProtocol` and type (`FpcType.PrivateFpc` → `private_fpc`, else `fpc`). It is what the sheet needs to draw this send's facts as Send drew them.

**The journal.**
- `packages/wallet-core/src/jobs/types.ts:76`: `{ stage: "queued"; reask?: QueuedFeeReask }`, the type declared there (wallet-core imports nothing above it). It is mirrored in `JobProgressSchema` (`operation-journal/spec.ts:181`) with decimal-string fields.
- `fsm.ts:49`: `simulating → queued`, with its line in the header comment. `queued → simulating` stays illegal.
- The reaper is unchanged. The re-ask wait heartbeats as the dependency wait does; the boot sweep fails it as every waiting record (`stuck_queued`).
- Pre-production: no migration. The journal is in no backup slice, so neither field enters or leaves a backup (Phase 4.1 pins this).

**Home (screens 3 and 4, option B).**
- `RecentActivityView.vue`: a `transfer` record at `queued` reads "Waiting for your earlier send" (`shot/217-queued-card`), and one with `reask` reads "Fee went up. Review". A dApp record keeps "Queued...".
- `TransactionAwaitingCard.vue` gains `reaskLine` and a `review` emit, as `shot/217-reask-B`. The row opens; the × stays.
- `review` stores the record's id and opens `SendReviewSheet` under the popup key `send_reask_review`. Its inputs:
  - `facts`: `publishFacts` of the record's `transferType` sides and `payerKindOf(settings, payer)`, where a two-line adapter in the view rebuilds `settings` (`{ paymentMethod: { kind: "fj" } }` or `{ kind: "fpc", fpcId }`) from the persisted `payer`;
  - amount and symbol: `cardAmountFor`, `cardAmountSymbolFor`;
  - the recipient address only (Home has no contact lookup; the shot shows none);
  - `ready`: `useSendReview`'s gate.
  The sheet keeps the fee it opened with, and closes when that record leaves the re-ask state or its `reask.fee` changes. A changed figure is never under the person's finger.
- `SendReviewSheet.vue` gains `reask` (`{ now, nowAmount, capAmount }`): the line "Fee is now {X with USD}, above the {Y} FJ you accepted." and the button "Send for {X} FJ", as the shot. Send calls `acceptQueuedFee(id, reask.fee)` once (`sending` until it returns), then closes. A refusal changes nothing; the row reads the record.
- Keyboard: `Popup` closes the sheet on Escape and returns focus to the row. The sheet has no document-level Enter; its button is the keyboard path. The row is a button while it opens.

**What the seams are (fees-and-sponsors arc 2 decides every number).** Arc 4 calls `getEstimatedFee` for both the basis and the at-turn check, so P6-10 (teardown counted once) moves both together. It reads the multiplier only through the build (P6-09), and the reuse ladder only through `stash`/`tryConsume` (P6-12 B: reuse while the prepared cap covers the price). P6-03 with OA-9 A ("Confirm stays disabled until an estimate lands") and arc 4 both edit `isAllowedToSend`. The rule after both: allowed with a landed estimate, or in queue mode. Whichever lands second writes that. The page re-checks nothing about the cap; the background enforces it.

**Competing outlines (both rejected; D45).**
- *B, a persisted intent resumed from the record.* `execute` returns at queue time; a background runner builds the intent when its predecessor settles, after a restart too. For: survives a restart. Against: a persisted request, an independent lifecycle and a recovery policy (a resumed intent can double-send when the crash fell after `sendTx`), all of them plan changes; and the reaper's boot sweep changes.
- *C, the popup holds the intent.* For: no background change. Against: no record exists until the turn, so Home shows nothing to cancel, and closing the popup drops the send.

**Arc 4 file map.**
- Added: `apps/extension/src/wallet/services/execution/{queued-fee-cap.ts, queued-fee-cap.test.ts}`.
- Modified: `packages/wallet-core/src/jobs/{types.ts, fsm.ts}` (+ `fsm.test.ts`); `apps/extension/src/wallet/services/execution/{transfer-executor.ts, estimate-reuse-shared.ts, service.ts, spec.ts, client.ts}`; `apps/extension/src/wallet/services/operation-journal/spec.ts`; `apps/extension/src/utils/estimate-when-clear.ts`; `apps/extension/src/popup/pages/{send.vue, send-submit.ts}`; `apps/extension/src/popup/components/modules/send/{FeeCostReadout.vue, FeeSettingsCard.vue, SendReviewSheet.vue, fee-helpers.ts}`; `apps/extension/src/popup/components/modules/general/RecentActivityView.vue`; `apps/extension/src/components/composite/activity/TransactionAwaitingCard.vue`; each with its colocated test.
- e2e: `tests/e2e/network/same-token-concurrent-sends.test.ts`, `tests/e2e/fixtures/send-burst.ts`.

### Arc 5: keyboard reach on Send's fee card and suggestions (after page 9 P9-05; after arc 2)

- **(1)** `FeeSettingsCard.vue:871, :903`: "Override with my method" (`send-fee-override`) and "Use app's payment" (`send-fee-back-embedded`) become `<button type="button">` with the accent `:focus-visible` ring, Tab stops where they sit (after the fee method row, before the next field).
- **(2)** `RecipientField.vue:203-210`: the suggestion list becomes a listbox: `role="listbox"`, each row `role="option"` with an id, `aria-activedescendant` on the field; Down and Up move the highlight, Enter picks it, Escape closes the list; no new Tab stops. Arrow handling follows `AuthMethodTabs.vue`.
- **(3)** `packages/design/src/ui/Checkbox.vue`, `ScopeAddress.vue`, `ScopeClassId.vue` answer Space as well as Enter and ignore a repeat or composing key. `isRepeatOrComposing` moves into `@nulo/design` (`packages/design/src/composables/keys.ts`) and `composables/usePopupEntity.ts` re-exports it, so both packages share one copy (D12).
- **(4)** `fee-init-degraded` (`FeeSettingsCard.vue:910`) becomes a polite region mounted empty before its text, like `fee-sponsor-live`.
- **(5)** `CollapsingHeroLayout.vue:95-97`: the compact label gets `aria-hidden="true"`.

**Arc 5 file map.** `apps/extension/src/popup/components/modules/send/{FeeSettingsCard.vue, RecipientField.vue}`, `packages/design/src/ui/Checkbox.vue`, `packages/design/src/composables/keys.ts` (new), `apps/extension/src/components/{ScopeAddress.vue, ScopeClassId.vue}`, `apps/extension/src/components/composite/CollapsingHeroLayout.vue`, `apps/extension/src/composables/usePopupEntity.ts`, their colocated tests; e2e `tests/e2e/send-keyboard.test.ts`.

### Shared files and seams

- `dapp-send-executor.ts`: arc 1b edits `runInSlot` between `acquireSlot` and `claimOrCreateJournal`, and adds deps. dapp-ingress-grants arc 2 edits the `markJournal` port's title argument (`:120`). Whichever lands second rebases on the other's hunk; neither moves the other's lines.
- `execution-lane.ts` and `execution-mutex.ts`: arc 1b adds `parkSlot`, the per-origin chain and the kept reservation, and extracts `acquireSlot`'s catch. dapp-ingress-grants arc 2 edits `markJournal` and `transitionOperation` (`:538`).
- `execution/service.ts`: arc 1 edits the settle handler (`:476-480`) and the estimate admission (`:~553`); arc 1b edits the dApp deps block (`:425-458`). fees-and-sponsors edits the fee paths.
- `transfer-executor.ts`: arc 1 adds the fee-spender re-check and the gate. fees-and-sponsors may touch FPC resolution; rebase on its hunk.
- `RecentActivityView.vue` (R5): arc 1 scopes the event side effects (`:499-524`) and adds one comment; arc 3b owns the rest. Branch `type-roles-arc3` also edits it.
- `journal/[id].vue` and `journal-state.ts` (R1): arc 3a edits the outcome maps, arc 3b the hash row and decimals. forms-and-contacts arc 3 (#211) starts after 3b.
- `usePrices.ts` and `BalanceView.vue` (R2): arc 3b only, between tokens-and-balances arc 1 and chain-endpoints arc 2.
- Arc 4's seams (it rebases on whichever lands first; none of these hunks moves another's lines):
  - `transfer-executor.ts`: arc 4 owns `execute`'s build loop and the stash call. Arc 1b and Phase 1.2 own `takeTurn` and the gate; arc 4 calls `takeTurn` unchanged.
  - `execution/service.ts`: arc 4 adds `cap` to the queued answer at `:585`, the `executeTransfer` argument and `acceptQueuedFee`. Phase 1.2 adds `gate.unconfirmed` to the same condition, and arc 1b edits the dApp deps block.
  - `send-sequencer.ts`: untouched by arc 4; the cap lives in `queued-fee-cap.ts` beside it.
  - `send.vue`'s `isAllowedToSend`: fees-and-sponsors arc 2 (P6-03, OA-9 A) and arc 4, as § Arc 4 says. Arc 2 edits `:746` and `send-fiat-gate.ts`.
  - `SendReviewSheet.vue`: arc 2 moves the line gap (`:231-233`); arc 4 adds the fee-line branches and the button label.
  - `FeeSettingsCard.vue`: arc 5 turns two links into buttons (`:871, :903`); arc 4 passes `queuedCap` and calls the self-paid helper.
  - `RecentActivityView.vue` (R5), `TransactionAwaitingCard.vue`, `send.vue`, `FeeCostReadout.vue`, `SendReviewSheet.vue`: PR #359 (type-roles arc 3) restyles them. Arc 4's new text takes the type role its neighbours carry on whichever base it lands.
  - `transfer-estimate-reuse.ts`: fees-and-sponsors arc 2 changes the base-fee rung (P6-12 B); arc 4 only calls `stash`, `tryConsume` and `evict`. In `estimate-reuse-shared.ts` arc 4 times the physical drop from `builtAt`, which every caller already sets at build time.

### Trade-offs & alternatives not taken

See the decision ledger (D1-D12) and the competing outline (Outline B).

## Competing outline (Outline B: hold until mined, inside the slot)

Make the execution slot inclusion-scoped for one account: a send of an account holds the `(profile, chain)` slot from build until its receipt settles (at most 10 minutes), and both send paths wait for it there. No opaque key, no re-queue, no fee spender on the row (a restarted worker's pending rows hold the slot through a startup scan), and the chain-tip gate runs inside the slot.

- For: one mechanism, little new code, dApp-after-dApp fixed at once.
- Against: an unmined tx stalls every send of the profile on that chain, other accounts included, for up to 10 minutes; it reverses the owner's choice in the archived concurrent-sends plan ("a send that shares nothing is not slowed"; "the dependency wait comes before the slot, never while holding it"); the session baton would wait behind mining for every queued dApp request; and a startup scan of pending rows into the mutex is new lifecycle code anyway.

Outline A (this plan) won; both auditors judged it stronger. Opus noted that B closes the router gap (D3) by construction, since it holds the slot until inclusion; A leaves that gap to OA-4.

## Security & Adversarial Considerations

- **Threat model.** No new trust boundary.
  - The attacker who matters is a connected dApp. It can submit sends in a burst (silently, on the self-paid path), send calls built to collide with the person's Send-page sends, stall its own tx, or keep it from ever mining.
  - A backup is attacker-controlled data. Restore accepts non-Pending rows with caller-chosen timestamps, blocks and endpoints (`transaction/service.ts:556-582`).
- **Double send.** Ordering only delays. No path retries, re-proves or re-submits. Parking happens before the claim and the build, and re-entry hands the same request back to the same code. Tests pin one claim and one broadcast per send.
- **Skipped predecessor.** The guarantee covers only state the wallet can name: the persisted fee spender (the address the build used), the waiter's opaque wait (arc 1b), and the chain-tip gate. It does not cover these cases, each of which falls back to today's degraded mode:
  - a router's downstream spends after its submission (OA-4);
  - a reorg below the floor, or a tip that regresses after the check;
  - a Send-page send after a dApp tx that spent an additional scope's notes. That tx holds only under its own account, as today (OA-4).
- **Imported or forged history.** The gate reads only settles this worker observed, and the sequencer reads only Pending rows, which restore refuses. A planted row cannot hold a send.
- **Denial of service by a dApp.**
  - A waiter holds no key, so queued dApp sends never delay a Send-page send.
  - Parked requests keep their depth, so while parked a dApp's burst stays capped at 8 per origin and 32 per lane.
  - The lane cap counts parked requests. Four connected origins with 8 parked requests each fill all 32 slots and refuse a Send-page transfer with the existing too-many-pending error, exactly as 32 queued requests do today.
  - A dApp's parked requests delay only its own origin.
  - Every wait is bounded: 60 s per chain-tip observation, 10 minutes per unmined predecessor, 60 minutes per send. Past those limits the send runs unordered.
- **Slot hygiene.**
  - Nothing is awaited on the network while the slot is held for ordering. Post-grant checks are synchronous, and tip reads happen outside the slot as a single attempt with a 3 s timeout.
  - The lane's no-timeout, no-force-release invariant is unchanged.
  - `runInSlot` releases whichever slot it holds in `finally`, and a parked reservation is dropped on every exit.
- **Fail-open choices.** A lapsed observation, a failed tip read, or a 60-minute wait runs the send unordered. That is today's degraded mode, where the chain refuses a real conflict (nullifier uniqueness). No new error code or message reaches a dApp (H5 untouched).
- **Logging.** New lines log a fixed category at `debug`, with no hash, address, block number or URL (CLAUDE.md § Logging policy).
- **Least privilege, crypto, supply chain.** No new dependency, permission, key or cryptographic code. The lockfile is untouched.
- **Arc 4: a queued send against a cap.**
  - *Surface.* No new external boundary: `feeCap` and `acceptQueuedFee` are popup RPCs, and the wallet-sdk dispatcher exposes neither. The basis comes from Tx rows, which restore writes with a caller-chosen `estimatedFee` and `createdAt`.
  - *Overcharge.* The figure compared is the build's committed max fee, at least what the network checks (gas limits × `maxFeesPerGas`). So a send goes out only at or under the Y the person saw, or the X they accepted. Rounding Y down keeps the shown figure the enforced one.
  - *A planted basis.* An imported row can move only the X and Y shown before the person queues. The charge is the fresh build's, at most that shown Y. A low basis re-asks; a high one shows a high Y the person must accept. No path charges above a figure on screen.
  - *Double send.* The re-ask stops before proving. Accept resumes the same `execute` call, one entry per journal id resolves once, and a stale or repeated accept is refused. The stashed build is single-shot. Tests pin one proof and one broadcast.
  - *Skipped predecessor.* The ticket stays held through the re-ask. Accept re-takes the turn and re-checks under the slot, and a reused build passes the epoch and pending-set rungs.
  - *Slot hygiene.* The cap check is arithmetic on the build; the slot is released before the wait for the person.
  - *A signed request in memory.* The stash's 120 s TTL, counted from the build (a re-stash keeps the original `builtAt`, and the physical drop follows it), and `evict` on every exit bound it; it never persists. The journal keeps figures and the payer descriptor, no hash.
  - *Rounding.* The readout rounds X half-up to six decimals, as every fee figure today, while the accept carries the raw fee; the difference is under 0.0000005 FJ. Changing the format is the owner's; it stays a known limit.
  - *Stuck flow.* A forgotten re-ask holds its keys until the send's 60-minute deadline at most (OA-12); a lock ends it at once. New log lines are fixed categories at `debug`, with no fee figure.
- **Arcs 2, 3a, 3b and 5.** These are UI only and sit behind signed pages.
  - Arc 3a records attempt counts, never response bodies, in progress and logs, and never re-polls a restored row's stored endpoint (D16).
  - Arc 3b's explorer link contacts nothing until it is tapped, and disappears under explorer None (C12-links).

## UI impact

- **Arc 1: no new copy, layout or state.** It restores the owner's concurrent-sends rule after a restart, so the existing "Queued..." card and "Queued behind your previous send" row appear on a Send-page send that uses the same private fee contract as a pending one (OA-3 item 3; ships under the archived decision). A terminal event or snapshot row from another profile or network no longer removes the current awaiting card or task.
- **Phase 1.2 (OA-5):** on a multi-endpoint network, the same states show for up to 60 s on a send whose predecessor's block the PXE's node lacks. Built only on OA-5 = A.
- **Arc 1b (OA-3):** while the account's earlier sends are unmined, a dApp send waits at "Queued..." ("Preparing..." on the silent path). The dApp's answer arrives later, and later requests of the same dApp wait behind it.
- **Arc 2 (page 9, signed 2026-10-13).** P9-01 A: "Shrink: the USD field and the derived token line scale their type down until the figure fits; nothing wraps or is cut. Normal amounts look as today." P9-02: "In the review sheet the 4 px gap moves from the symbol's left margin to the number's end; unwrapped lines draw identical pixels." P9-03: "'The price moved since you started typing.' shows only when the live quote differs from the snapshot; a stale snapshot that did not move shows the existing 'The price quote went stale.'"
- **Arc 5 (page 9 P9-05, signed 2026-10-13, approved as proposed).** "(1) 'Override with my method' and 'Use app's payment' become real buttons with the accent focus ring, Tab stops right where they sit in the fee card. (2) The destination suggestion list becomes a listbox: Down and Up from the recipient field move through the suggestions, Enter picks the highlighted one, Escape closes the list; no new Tab stops. (3) Checkbox, ScopeAddress and ScopeClassId answer Space as well as Enter, ignoring a repeat or composing key. (4) The degraded-fee notice is a polite region mounted empty before its text. (5) CollapsingHeroLayout's compact label is aria-hidden. Nothing changes for a pointer." The highlighted suggestion takes the row's hover background. No flow shows item 1's two buttons today (D60, OA-20).
- **Arc 3a (page 10, signed 2026-10-12).**
  - #108 (P10-06, approved): "When the transaction's expiry is provably past chain time, the row reads 'Won't go through' / 'This transaction expired before the network included it. No fee was paid, and you can send it again.' Until then it reads today's 'Unconfirmed'." The look is the existing failed one (OA-7, D28).
  - #109 (P10-07, changed): "no new words; only the pruned-block re-check ships." A mined row reads as today until final. A row whose block the finalized chain excludes returns to today's "Not confirmed yet" (journal row) or today's pending clock (Tx row).
  - #112 (P10-05, approved): not built (D21, OA-6); the row reads as today.

- **Arc 3b (page 10 with C9 and C12-links, signed 2026-10-12).**
  - #209 (P10-11): no visible change on a normal network; a record of another network no longer opens on the journal page, and one from before the network stamp opens on every page that lists it.
  - #103 (P10-10) and #213 (P10-09): an amount whose token's decimals are unknown shows no figure; an in-progress card with no amount shows none rather than 0.
  - #110: "Send not confirmed" reads in a neutral snack (grey clock, stays until closed); Home shows one card per send; a checked send's journal page shows the Tx hash row and "View on <explorer>", none under explorer None; an open snack sits above an awaiting card's Cancel wherever it would otherwise cover it, and keeps its usual place when it would not.
  - #122 (P10-08): an awaiting card whose stage is unknown shows the loading skeleton in its stage line.
  - #219 c (OA-1 A): a Send-page send that starts waiting after it was created reads "Queued..." while it waits.
  - #243 (P10-12, P10-13): status icons take their status text colour; dark red status text is lighter (#ff534b).

- **Arc 4 (page 9, P9-04a to P9-04d, signed 2026-10-13).** The four approved shots are the sign-off; nothing beyond their words ships.
  - Send page (P9-04a): "The fee card reads "You pay: About X" with the line "Goes out after your earlier send, for at most Y." under it, where Y is the last estimate for this token plus the margin. The primary button reads "Queue send" and is enabled. Every other row stays as today."
  - Review sheet (P9-04b): "The fee line reads "Fee up to Y, based on your last send. If it comes out higher, we ask again." The submit button reads "Queue send". The sheet's layout stays as today."
  - Home (P9-04c): "The existing Queued card, its stage line reading "Waiting for your earlier send", with its Cancel as today." Every Send-page send at `queued` reads it, the two-window case included; a dApp send keeps "Queued...".
  - The re-ask (P9-04d, option B): "The row says 'Fee went up. Review'. Tapping opens the usual review sheet for this send with one added line, 'Fee is now X, above the Y you accepted', and 'Send for X'. Closing the sheet keeps the send queued; the row's × cancels it." As shot: the line ends with a full stop, X carries its USD figure, Y reads in FJ, and the button reads "Send for X FJ". Option A is the recorded fallback (D-orch-17).
  - Where the shots are silent, today's screen ships: OA-10 to OA-14.

## Assumptions

### Facts

- **F1** A dApp send never consults the sequencer before it simulates. It calls `externalSent` only after submission (`dapp-send-executor.ts:180,601,712,882`; `service.ts:456-457`).
- **F2** The two send paths release the slot at different points:
  - the transfer path, after submission and `recordTransfer` (`transfer-executor.ts:224`);
  - the dApp path, in `runInSlot`'s `finally` (`dapp-send-executor.ts:276`), after `recordTransaction` and, when `wait` is not `NO_WAIT`, one `getTxReceipt` (`:728-732, :901-905`).
- **F3** The session baton fires at the first mutex enqueue, inside `acquireSlot` (`execution-lane.ts:307-322`). This is a frozen invariant in the file header. `getCalls` runs after `acquireSlot` on purpose (`dapp-send-executor.ts:218-223`).
- **F4** `acquireSlot` registers the pre-claim controller and vouches for the record before its first await (`execution-lane.ts:290-300, 403-413`).
- **F5** All three dApp send paths go through `runInSlot` with `op.accountAddress` (`dapp-send-executor.ts:558-561, 652-655, 841-844`). `acquireSlot` has no other caller (`service.ts:444`).
- **F6** Fee spenders are not recorded with an address today, and the FPC address can change between sequencing and build:
  - `Tx.feePaymentMethod` is an enum with no address, and `recordTransfer` records one transfer-only call (`transaction/spec.ts:182-185`; `transfer-executor.ts:244-281`);
  - a transfer resolves its FPC by id at sequence time (`transfer-executor.ts:145-150`) and again in the build (`fee/fpc-strategy.ts:117`);
  - a sponsored FPC's address is editable (`fpc/service.ts:327-364`).
- **F7** After a restart, only Pending rows re-arm, and the boot sweep fails waiting transfers (`transaction/service.ts:142-145`; `operation-journal/reaper.ts:141-153`). Restore refuses Pending rows and accepts schema-valid others with caller-supplied fields (`transaction/service.ts:556-582`).
- **F8** `Tx.block` is written when a receipt leaves Pending (`transaction/service.ts:~499`). The settle handler that calls `sendSequencer.settled` receives the row (`service.ts:476-480`).
- **F9** `pxeService.getLatestBlockNumber` returns the PXE runtime node's tip and runs under `chainGuard.read` (`pxe/client.ts:410-414`; `pxe/service.ts:686-689, 913-949`).
- **F10** In `@aztec-labs/pxe` 6.0.0-rc.1:
  - the PXE syncs before each simulate and prove (`dest/pxe.js:577`, `runSynced`);
  - `getSyncedBlockHeader` reads the anchor without syncing (`pxe.js:327-331`);
  - `sync()` exists (`pxe.js:318-322`).

  Nulo sets no `syncChainTip`, so the default is proposed.
- **F11** The FSM had no `pending → queued` edge (`packages/wallet-core/src/jobs/fsm.ts:43-44`); arc 3b added it (D37, `fsm.ts:48`).
- **F12** `blocked()` returns early on an empty key set (`send-sequencer.ts:153`). `keysIntersect` has no empty-set check of its own (`transfer-sequence-keys.ts:112-117`).
- **F13** The wallet is pre-production, so a stored shape change needs no migration.
- **F14** The mutex decrements depth only in `release` (`execution-mutex.ts:127-135`). Queued-journal caps only skip visibility (`wallet-sdk/queued-journal.ts:151-162`).
- **F15** A silent-path record is `pending` before execution (`dapp-interaction/service.ts:544-574`). The background safety net fails only `queued` records.
- **F16** `operation-estimate-reuse.ts:115-126` has no sequencer-epoch check; `transfer-estimate-reuse.ts:186-189` has one.
- **F17** `RecentActivityView.vue:499-524` runs its clearing side effects before any scope check. `clearAwaitingTransactionFallback` matches account, recipient and token only.
- **F18** A dApp session may name several accounts.
- **F19** The Aztec JSON-RPC client turns transport failures into synthetic JSON-RPC errors thrown on the same surface as server errors (`@aztec-labs/foundation` `safe_json_rpc_client.ts:183-204, 233-234`).
- **F20** `abandonDeadSessions` transitions a pre-submit record to `cancelled` first and aborts its controller second (`execution-lane.ts:228-247`).
- **F21** On mount and reconnect the feed fetches by account and runs `clearExecutingTaskIfRecentTerminalMatch` over unfiltered rows (`RecentActivityView.vue:450-458, 552-559`).
- **F22** The readout's figure is the estimate's `maxFee`: `getEstimatedFee` → `computeMaxFee`, (gas limits + teardown limits) × `maxFeesPerGas` (`tx-fee-details.ts:14-21`, `fee-helpers.ts:12-27`). `recordTransfer` stores the same figure as `Tx.estimatedFee` (`transfer-executor.ts:306`).
- **F23** The journal record has no fee field, `JobProgress`'s `queued` variant is bare (`types.ts:76`, `operation-journal/spec.ts:181`), and the FSM has no `simulating → queued` (`fsm.ts:49`).
- **F24** The × shows at every stage but `submitting` (`TransactionAwaitingCard.vue:52`); `cancelJob` writes `cancelled` before it aborts (`execution-lane.ts:178-254`); a session end cancels pre-submit records (`:228-240`).
- **F25** The popup never waits on `executeTransfer`: `submitTransfer` leaves at once (`send-submit.ts:62-97`). The client's ceiling is 60 minutes (`execution/client.ts:11`).
- **F26** The journal is in no backup slice (`backup-migration-registry.ts:198-222`), and `footprint-coverage.test.ts` judges migrations only.
- **F27** Only `RecentActivityView.vue` renders awaiting cards.
- **F28** The reuse stash is single-shot with a 120 s TTL, and its entry needs `chainIdentity`, `fpcIdentity` and the epoch read before the build (`transfer-executor.ts:588-640`, `transfer-estimate-reuse.ts:132-197`).

### Inferences

- **I1** The PXE runtime's node is the node the PXE syncs from (`chain-runtime.ts:179`). Its proposed tip therefore bounds what the next simulation sees, short of a reorg. To be verified in Phase 1.2 step 1.
- **I2** A session belongs to one origin, so keeping parked requests in per-origin order preserves per-session FIFO. `hooks.originKey` is `ctx.origin` (`packages/wallet-bridge/src/dispatcher.ts:520`). Phase 1b.1 step 1 confirms that a session's `ctx.origin` cannot change.
- **I3** The composition harness can compose the real `ExecutionLane`, `ExecutionMutex`, `SendSequencer`, `OperationJournalService` and `TransferExecutor` with no PXE call, provided every case stops before the build. Any case that would reach the build becomes a unit test instead.
- **I4** No existing network e2e expects a dApp send to start while a Send-page send of the same account is unmined. Phase 1b.3 runs the whole Chrome network suite to prove it.
- **I5** On OA-3 = A, both sends in `concurrent-sendtx-confirm.test.ts` confirm. On B the file is unchanged.
- **I6** At one speed and one shape, a transfer's max fee moves less than 25% between two sends a block apart on a calm network, so most at-turn builds pass the cap. Unverified on testnet.
- **I7** Normal to Urgent multiplies `maxFeesPerGas` by 2.5 on Public Fee Juice (`PRIORITY_MULTIPLIERS`, `packages/wallet-bridge/src/fee.ts:28-32`). With flat prices on a local node and two private sends of one shape, the at-turn fee is about 2.5 times the basis against a 1.25 cap: a factor of two of headroom for gas differences. Private Fee Juice is 1.2× at every level after P6-09 C, so the case pays with Public Fee Juice.
- **I8** The re-ask wait uses the heartbeat today's queued waits use (a `chrome.storage` touch every 30 s, `execution-lane.ts:440-486`), which keeps the record from the reaper. No test proves a long unattended wait; the e2e covers a closed and reopened popup only.

### Asks

- **A1 (OA-1)** #219 c changes what the awaiting card reads. Working assumption: as is until answered.
- **A2 (OA-3)** Arc 1's restored restart wait ships under the archived decision. #218's dApp wait is built only on A or B.
- **A5 (OA-5)** The lag gate waits past the receipt settling, where the archived decision ends a wait. Working assumption: not built until answered.
- **A3 (OA-4)** A submitted dApp tx keeps today's narrow hold. Working assumption: as is, with the correctness claim narrowed to match.
- **A4 (OA-2)** Answered 2026-10-13: P9-04's qualification says only the 60-minute string is copy.
- **A6-A10 (OA-10 to OA-14)** Where the shots are silent (another payer, no basis, an unanswered re-ask, a basis of another shape, a pause on the re-ask button), today's screen or the cancel outcome ships until answered.

## Phases

Every gate runs from the worktree root unless it says otherwise. "Single test file" means `cd apps/extension && bun --bun vitest run <path>` (or the package's own directory for `packages/*`). Network e2e: until #169 (G1) merges, run one `e2e:agent` on the host at a time; before starting, check `~/.agents/ports.md` for another worktree's live `e2e:agent` rows and wait until none remain. Retry 0 everywhere.

### Arc 1: restart, lag and feed (decision-free; build first)

#### Phase 1.1: the fee spender on the transaction row (#219 a) ✓

1. Add `feeSpender` to `Tx`, `TxSchema` and `AddTransactionInput`, and write it in `addTransaction`.
2. Let `FpcStrategy` take a pre-resolved, validated `Fpc` from `getFpcImpl` in place of its own lookup, for fresh and reused builds, and resolve `sequence()`'s spender through `getFpcImpl` too; record what changed in `lessons/phase-1.md`.
3. In `TransferExecutor`, make three changes:
   - the post-grant re-check re-reads the FPC and re-enters the line when its address changed;
   - the build receives that address;
   - `recordTransfer` writes it.
4. In `recordedTxKeys`, add `fpc:<feeSpender>`, and rewrite its doc comment.
5. Add tests:
   - `transfer-sequence-keys.test.ts`:
     - a row with a fee spender yields its `fpc:` key;
     - a row without one yields none (control).
   - `send-sequencer.test.ts`, with a fresh sequencer standing in for a restart and one pending row naming fee contract F:
     - a ticket whose only key is `fpc:F` is blocked (never-happens: a skipped predecessor);
     - a ticket on `fpc:G` is not blocked (control).
   - `transfer-executor.test.ts`:
     - the row records the address the build used, and the build's strategy never resolves the FPC row itself;
     - a throw in the post-grant re-check releases the slot (never-happens: a wedged lane), and a clean re-check keeps it (control);
     - a re-entered ticket keeps the original deadline;
     - a reused estimate built with the old address is rejected;
     - a forged PrivateFPC row is refused at the re-check (never-happens: it reaches the build), and after a cold restart the genuine protocol sponsor still takes the sponsored fast path and names no spender (control);
     - when the FPC's address is edited during the wait, the send re-enters the line with the new key and never builds with the old one (never-happens);
     - an unedited FPC builds once (control);
     - fee juice and the protocol sponsor record no spender.
   - `transaction/service.test.ts`: the field survives a write and a read.
   - `send-order.composition.test.ts` (new; the COMPOSITION-TESTS checklist goes in the PR). It composes a fresh `ExecutionLane`, `SendSequencer`, `OperationJournalService` and `TransferExecutor`, as after a restart. A `pendingTxs` stub returns one Pending row naming fee contract F. No PXE call is made: every case stops before the build.
     - A transfer on F is created `queued` and never claimed while the row is pending.
     - A cancel then leaves it `cancelled`, and the PXE fake records no call (never-happens).
     - The same graph reports a transfer on G unblocked (control).
     - If composing these needs more than COMPOSITION-TESTS D1-D6 allow, the cases become `transfer-executor.test.ts` cases and the PR says so.

**Validation gate.**
- Commands: `bun run lint`, `bun run typecheck:all`, and the touched files as single test files.
- Pass: every command exits 0, and reverting step 4 makes the never-happens cases fail. Check that once, then restore.
- Layers: lint, typecheck, unit, composition.

#### Phase 1.2: the chain-tip gate (#219 b; only on OA-5 = A)

Built in arc 1 if OA-5 is answered A before arc 1's PR opens; otherwise in arc 1b's layer, or not at all on B.


1. Confirm three facts and record them in lessons:
   - I1;
   - that the guard-free tip read works (which URL, which node method, which tip);
   - every emitter of `onTransactionUpdated`.
2. Add `chain-tip-gate.ts`. Wire `observe` beside `settled`, and wire the gate into `TransferExecutor` and the estimate admission.
3. Add tests:
   - `chain-tip-gate.test.ts`:
     - an observation blocks only sends in its scope whose keys intersect it (controls: other keys, another account, another chain);
     - `unconfirmed` stays true while the tip is below the block (never-happens: confirmed early) and turns false once a read reaches it (control);
     - an observation stops holding 60 s after it was made, whatever the tip;
     - a failed or timed-out read confirms (fail open);
     - `wait` returns `aborted` on abort and never throws;
     - `refresh` is deduplicated per network.
   - `transfer-executor.test.ts`, for a send whose predecessor was observed at block 7 while the tip reads 6:
     - the send is created `queued` and takes no slot until the tip reads 7 (never-happens, with the control);
     - the heartbeat covers the gate wait;
     - with the slot granted and a fresh unconfirmed observation, the send gives the slot back without awaiting a read while holding it.
   - `service.estimate-queue.test.ts`: the estimate answers queued while unconfirmed and runs once confirmed.

**Validation gate.**
- Commands: `bun run lint`, `bun run typecheck:all`, the touched files as single test files, and `bun run test`.
- Pass: every command exits 0, and removing the gate call makes the never-happens cases fail. Check that once, then restore.
- Layers: lint, typecheck, unit.

#### Phase 1.3: the dApp estimate reuse checks the epoch ✓

1. Locate the dApp estimate entry. Stash the epoch there, and reject the reuse when it changes.
2. Add tests in `operation-estimate-reuse.test.ts`:
   - a send of the account that reached the node and left the pending set between the estimate and the approval rejects the reuse (never-happens: reusing a stale build);
   - an unchanged epoch reuses (control).

**Validation gate.**
- Commands: `bun run lint`, `bun run typecheck:all`, and the file as a single test file.
- Pass: every command exits 0.
- Layers: lint, typecheck, unit.

#### Phase 1.4: foreign journal events (#152) ✓

1. Run the side effects of `onJournalAdded`, `onJournalUpdated` and the snapshot's terminal match only for in-scope records, and add the invariant comment.
2. Add tests in `RecentActivityView.test.ts`:
   - a terminal record of another profile, another network or another account, through either event, leaves the current awaiting placeholder, task and cancel state intact and renders nothing (never-happens);
   - the same record in scope clears them (control);
   - after a scope switch, a record ingested before the switch is gone;
   - on mount and on reconnect, a recent terminal row of another network in the snapshot leaves the current task intact (never-happens), and an in-scope one clears it (control).

**Validation gate.**
- Commands: `bun run lint`, `bun run typecheck:all`, and the file as a single test file.
- Pass: every command exits 0, and the never-happens case fails on the unfixed handler. Check that once.
- Layers: lint, typecheck, unit.

#### Phase 1.5: arc 1 end-to-end gate

1. Add a case to `same-token-concurrent-sends.test.ts`: "after a background restart, a send on the same private fee contract waits for the pending one".
   - It has the shape of the existing "two public sends paid with private fee juice" case, with `stopBackground` between the first submission and the second send.
   - Never-happens: with mining held (`fixtures/mining-hold.ts`), the second record leaves `queued` while the first is held.
   - Control: both sends confirm.
2. Run the gate below.

**Validation gate.**
- Unit layers: `bun run lint`, `bun run typecheck:all`, `bun run test`, `bun run test:all`.
- Network, Chrome: the whole suite. Run `NULO_E2E_PROVERLESS=1 NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent` with no file selector, because every transfer now passes the fee-spender re-check (and, with Phase 1.2, the gate's synchronous check). Check `apps/extension/scripts/e2e/agent.sh` for its default selection first.
- Network, Firefox: `same-token-concurrent-sends.test.ts` with `NULO_E2E_BROWSER=firefox`. It uses `stopBackground`, which behaves differently on each browser.
- Smoke, Chrome: `cd apps/extension && bun run test:e2e -- --retry=0`.
- Pass: every command exits 0, the new case passes on both browsers, and no existing case changes outcome. Read a red honestly: one rerun for a known flake, a fix for real breakage.
- Layers: lint, typecheck, unit, composition, network e2e, smoke e2e.

### Arc 1b: dApp sends wait (after OA-3 = A or B)

#### Phase 1b.1: the parked slot and origin order

1. Confirm I2: read where `originKey` and the session baton are set.
2. Build the mutex and lane pieces:
   - `ExecutionMutex` keep, re-enter and drop;
   - `ExecutionLane.parkSlot` and the per-origin parked chain;
   - extract the catch `parkSlot` shares with `acquireSlot`.
3. Add tests:
   - `execution-mutex.test.ts`:
     - depth is unchanged across keep and re-entry, so a ninth same-origin acquire is refused while eight are parked or holding (never-happens: a parked request frees its cap);
     - a fresh origin is admitted (control);
     - a drop and an aborted re-entry each decrement once; a repeated drop or release changes nothing, and a consumed reservation is refused on reuse;
     - holder H, an aborted re-entrant R behind it, and a successor S: S stays blocked until H releases (never-happens: S runs while H holds), then runs (control);
     - successors keep FIFO.
   - `execution-lane.test.ts`:
     - `parkSlot` gives the slot to the next holder while `wait` runs;
     - it keeps the record vouched and its controller registered, with one registration;
     - it re-enters in the origin's bucket;
     - a session end while parked, in both orders (the sweep's `cancelled` first, or the fence at re-entry first): the record ends `cancelled` or `session_ended` respectively and is never overwritten, the controller is gone and the reservation dropped; the same with no record;
     - two requests of one origin naming different accounts, the earlier one parked: the later one never executes first (never-happens) and runs after the earlier one re-enters (control);
     - a request of another origin is not held by that chain (control).

**Validation gate.**
- Commands: `bun run lint`, `bun run typecheck:all`, and the two files as single test files.
- Pass: every command exits 0.
- Layers: lint, typecheck, unit.

#### Phase 1b.2: the waiter (#218)

1. Add `SendSequencer.enterWaiter` with the blocking rule of the OA-3 option chosen, and enter a waiter for each scope the send spends from.
2. In `runInSlot`, add:
   - the loop, under `let release`;
   - park and re-entry;
   - the pre-claim failure handling;
   - the gate.
3. Wire the deps in `service.ts`.
4. Add tests:
   - `send-sequencer.test.ts`:
     - a waiter is blocked by an earlier Send-page ticket and by a pending Send-page row (never-happens);
     - a waiter is not blocked by a later unsent ticket, or by a row of another account or chain (controls);
     - on B, a waiter is not blocked by an `externalSent` holder or a dApp-origin row; on A it is blocked by both;
     - no ticket is ever blocked by a waiter (never-happens: a dApp send delays the Send page);
     - Send-page tickets with an empty key set stay unblocked.
   - `dapp-send-executor.test.ts`:
     - with a pending Send-page row, the claim and the build are not entered until the row settles (never-happens), then entered once (control);
     - with no such row, there is no park and no extra slot release (control);
     - a cancel while parked throws the cancel sentinel and never claims;
     - a throw before the claim fails a `queued` record and a `pending` (silent-path) record, and never a claimed one;
     - `expired` runs the send once;
     - a send with additional scopes waits on each scope's line.
   - `send-order.composition.test.ts`, with the real lane, mutex, sequencer and journal. Every case stops before the build:
     - a parked request's record stays `queued` while a Send-page row is pending, and leaves it once after the settle (journal stages asserted);
     - a cancel while parked leaves it `cancelled`, with the controller gone and the reservation dropped;
     - a session end while parked ends `cancelled` through the sweep, or `session_ended` through the fence, never one overwriting the other;
     - repeated park and re-entry keep one reservation;
     - eight parked requests and one holder refuse the ninth with the existing error;
     - each request is claimed exactly once.

**Validation gate.**
- Commands: `bun run lint`, `bun run typecheck:all`, the files as single test files, and `bun run test`.
- Pass: every command exits 0, and reverting step 2 makes the never-happens cases fail. Check that once, then restore.
- Layers: lint, typecheck, unit, composition.

#### Phase 1b.3: arc 1b end-to-end gate

1. Add a case to `same-token-concurrent-sends.test.ts`: "a Send-page send held unmined, then a dApp send of the same account through the approval popup".
   - Never-happens: the dApp record reaches `simulating` while the Send-page send is held.
   - Control: both sends confirm.
2. On A only, update `concurrent-sendtx-confirm.test.ts`:
   - assert that the second send confirms;
   - rewrite the limit comment at `:22-31`;
   - raise the 360 s timeout to cover one more block.
3. Run the gate below.

**Validation gate.**
- Unit layers: `bun run lint`, `bun run typecheck:all`, `bun run test`, `bun run test:all`.
- Network, Chrome: the whole suite, as in Phase 1.5. Thirty-four network files drive dApp sends.
- Network, Firefox: `same-token-concurrent-sends.test.ts`.
- Smoke, Chrome.
- Pass: every command exits 0, and no existing case changes outcome.
- Layers: lint, typecheck, unit, composition, network e2e, smoke e2e.

### Arc 2: amount card and review sheet (after page 9: P9-01, P9-02, P9-03)

#### Phase 2.1: long figures in USD mode (P9-01) ✓

1. Build the option the owner chose, as § Architecture describes it. On "As is", build nothing and record it.
2. In `AmountCard.test.ts`: for A, a long figure gets a scale below 1 on both the field and the derived line, and `$25.00` keeps 1 (control); for B, the derived line carries the ellipsis styles and the field keeps its size; for C, `send-amount-derived` sits in the new row and the meta row keeps Max and the balance.

**Validation gate.** Commands: `bun run lint`; `bun run typecheck:all`; `AmountCard.test.ts` as a single test file. Pass: all exit 0. Layers: lint, typecheck, unit.

#### Phase 2.2: the review line's gap (P9-02) ✓

1. Move the 4 px gap in `SendReviewSheet.vue` to the number's end.
2. Assert the new rule in `SendReviewSheet.test.ts`.

**Validation gate.** Commands: `bun run lint`; `SendReviewSheet.test.ts` as a single test file. Pass: both exit 0. Layers: lint, unit.

#### Phase 2.3: "price moved" only when it moved (P9-03) ✓

1. Add `requoteReason` to `send-fiat-gate.ts`; read it in `send.vue`.
2. In `send-fiat-gate.test.ts`: a live quote equal to the snapshot gives `stale` (never-happens: `moved`); a different one gives `moved` (control); no live quote gives `stale`.

**Validation gate.** Commands: `bun run lint`; `bun run typecheck:all`; `send-fiat-gate.test.ts` as a single test file. Pass: all exit 0. Layers: lint, typecheck, unit.

#### Phase 2.4: arc 2 end-to-end gate ✓

**Validation gate.** Commands: `bun run audit:vue`; `bun run test:all`; smoke on Chrome and Firefox (`cd apps/extension && bun run test:e2e -- --retry=0`, then the same with `NULO_E2E_BROWSER=firefox`); network Chrome and Firefox `tests/e2e/network/fiat-send.test.ts` and `send-amount-exact.test.ts` (D57). Pass: all exit 0; the PR attaches before and after screenshots of the amount card at rest and focused and of the review sheet, both themes, both browsers. Layers: unit, smoke e2e, network e2e.

### Arc 3a: send outcome states (after page 10; H7 on #108 and #112)

#### Phase 3a.1: refused on the first attempt (#112, P10-05) — stopped (D21, OA-6)

1. Probe how a node refusal surfaces through the wallet's client and through the default endpoint; record it in lessons. Done: on one node a first-POST refusal is visible at the HTTP layer, but the default endpoint's gateway retries a timed-out request on another node, so the wallet cannot tell a first-attempt refusal from a retried one. The phase stops; the limit is OA-6; #112 stays open with a comment carrying the probe record.

#### Phase 3a.2: expired before inclusion (#108, P10-06; proof per D22) ✓

1. Locate the expiry and the first nullifier on Aztec 6.0.0-rc.1's proven tx; establish whether one node can forget or late-index a receipt; record both in lessons (done: it cannot; the endpoint can route reads to different nodes, hence D22).
2. Record `expiry: {timestamp, nullifier}` with the hash at submission (none for a genesis-anchored tx); widen `setSendCheck` to the compare-and-set of D25 for the moves this phase needs; add the finalized-anchored nullifier verdict `expired` and its copy (D28's look).
3. Tests:
   - `inclusion.test.ts` / `send-check.test.ts`: a finalized tip whose timestamp is not past the expiry claims nothing (never-happens: `expired`); past it with the nullifier absent at that anchor gives `expired` (control); the nullifier present, a read error or a malformed answer claims nothing; the anchored read names the finalized block's number and hash; a row with no recorded expiry never becomes `expired`; an `unconfirmed` row is read again only once the clock passes its expiry, and becomes `expired` on the same proof.
   - `operation-journal/service.test.ts`: the compare-and-set refuses a stale `expected` and an illegal move (never-happens), applies a legal one once (control), and never changes the stage.
   - `execution-coordinator` tests: the submitting record carries the expiry and the first nullifier, and none for a genesis-anchored tx.
   - `journal-state.test.ts`: the exact P10-06 strings.

**Validation gate.** Commands: `bun run lint`; `bun run typecheck:all`; `bun run test`; `bun run test:all`. Pass: all exit 0. Layers: lint, typecheck, unit.

#### Phase 3a.3: the pruned-block re-check (#109, P10-07 changed; proof per D23-D26) ✓

1. Add `transaction/inclusion.ts` (the finalized-anchored archive proof); record `inclusion: {block, hash}` with a `sent` or `reverted` answer; add the final, re-included and pruned moves to the compare-and-set; give `SendCheck` one watch per row with work; add the `awaitingFinality` marker, its watch, its boot re-arm and its stripping on restore and export to `TransactionService`; build the single-attempt node silent (D27).
2. Tests:
   - `inclusion.test.ts`: a finalized tip below the block claims nothing; the hash found at index N is final; absent with a receipt in another block is a re-inclusion, with the recorded block is no answer, with no block is pruned; any error or a found index other than N claims nothing.
   - `send-check.test.ts`: inclusion → pruned → re-included → final, for a successful and a reverted receipt; a pruned row returns to checking with its window restarted; a final row is never re-armed; a restart in each state resumes the watch from the journal.
   - `transaction/service.*.test.ts`: a row this worker mined is marked and watched until final, then written Finalized and unmarked; a proven prune returns it to Pending with block, result and fee cleared; a lagging DROPPED or Pending answer never moves a mined row (never-happens); a restored row carrying a marker is stripped and never polled (never-happens); purge and the ambiguous marking end the watch.
   - `aztec-node-factory-adapter.test.ts`: a transport failure through the single-attempt node logs nothing that names the endpoint.

**Validation gate.** As Phase 3a.2. Layers: lint, typecheck, unit.

#### Phase 3a.4: arc 3a end-to-end gate ✓

**Validation gate.** Commands: unit layers as 3a.2; network on Chrome and Firefox: `tests/e2e/network/failed-send-check.test.ts` with new cases: the never-received send, once its recorded expiry is set below the finalized tip's time, reads "Won't go through" through the real node's anchored nullifier read (its earlier "Unconfirmed" is the never-happens control); a send that went through keeps reading confirmed until final and its Tx row is recorded Finalized through the real archive proof; smoke on Chrome and Firefox. Pass: all exit 0; screenshots of the History card and detail for "Won't go through", both themes. Layers: unit, network e2e, smoke e2e. A prune cannot be made on a local node, so the prune paths stay unit-proven and the PR says so.

### Arc 3b: feed surfaces (after page 10, C9, C12-links; R1, R2, R5)

#### Phase 3b.1: one scope rule (#209, P10-11) ✓

1. Export `journalRecordInScope` from `utils/activity-rows.ts`; use it on the four surfaces.
2. Tests: `activity-rows.test.ts` (one case per rule: stamped and active, stamped and inactive, no active profile, unstamped); `journal-detail-scope.test.ts`, `TokensView.test.ts`, `activity.test.ts` updated.

**Validation gate.** Commands: `bun run lint`; `bun run typecheck:all`; `bun run test`. Pass: all exit 0. Layers: lint, typecheck, unit.

#### Phase 3b.2: no guessed decimals (#103, P10-10) and no fake 0 (#213, P10-09) ✓

1. Move each site to `knownDecimals`; treat an empty `amountRaw` as absent.
2. Tests per site: an unknown-decimals token shows no figure (never-happens: a figure); a known one shows as today (control). Update the `RecentActivityView.test.ts` fixtures that lack `hasDecimals`.

**Validation gate.** As 3b.1. Layers: lint, typecheck, unit.

#### Phase 3b.3: failed-send surfaces (#110, P10-01..04) ✓

1. Build the P10-01 option chosen; P10-02 unless struck; P10-03 with the extracted `TxHashRow`; reproduce P10-04, then fix it only if it reproduces.
2. Tests: `toast.test.ts` and `ToastManagerBase.test.ts` (option A), `send-submit.test.ts` (the kind), `recent-activity-rows.test.ts` (P10-02: the failed record hides only when a settled row carries the same hash; control: a different hash keeps it), `journal/[id].test.ts` (hash row and link; none under explorer None), `snack-placement.test.ts` (P10-04).

**Validation gate.** As 3b.1. Layers: lint, typecheck, unit.

#### Phase 3b.4: the awaiting card on reopen (#122, P10-08) and #219 c (on OA-1 = A) ✓

1. Draw the stage line as the loading skeleton until the stage arrives.
2. On OA-1 = A: add the FSM edge; move a waiting `pending` transfer row to `queued` and claim it back.
3. Tests: `RecentActivityView.test.ts` (the hydration case now requires the skeleton, never a wrong stage); `TransactionAwaitingCard.test.ts`; on OA-1 = A, `fsm.test.ts` and `transfer-executor.test.ts` (a send that starts waiting after creation reads `queued`, then leaves it once).

**Validation gate.** As 3b.1. Layers: lint, typecheck, unit.

#### Phase 3b.5: status colours (#243, P10-12, P10-13) ✓

1. Add the `fill--txt-*` utilities (`token-contract.ts`, then `bun run --cwd packages/design gen:tokens`); use them in `TransactionTerminalCard.vue`; set the dark `--txt-danger`.
2. Tests: `theme-contrast.test.ts` asserts the icons at 3:1 on the light page and the dark red text at 4.5:1 on page, hover and pressed; the drift tests pass.

**Validation gate.** Commands: `bun run lint`; `bun run typecheck:all`; `bun run test:all`. Pass: all exit 0. Layers: lint, typecheck, unit.

#### Phase 3b.6: arc 3b end-to-end gate ✓

**Validation gate.** Commands: `bun run test`; `bun run test:all`; smoke on Chrome and Firefox; network on Chrome and Firefox: `snack-placement.test.ts`, `failed-send-check.test.ts`, `account-switch-isolation.test.ts`, and on OA-1 = A `same-token-concurrent-sends.test.ts`. Pass: all exit 0; screenshots of every surface the page names, both themes, both browsers. Layers: unit, smoke e2e, network e2e.

### Arc 4: a queued send against a fee cap (P9-04, P9-04a to P9-04d; re-planned 2026-10-13)

Branch `send-queue-activity-queued-cap` off `origin/dev`. A fresh build is out of a composition case's reach (`COMPOSITION-TESTS.md` D2, D3), but the cancel spike's carve-out is not: a seeded prepared request and a `proveTx` checked only for being called. Phase 4.1 uses it for the races against the real journal lock.

#### Phase 4.1: the cap, the queued answer and the re-ask in the service worker

1. Add `queued-fee-cap.ts`: `isFeeAmount`, `queuedFeeBasis`, `queuedFeeCap`, `QUEUED_FEE_MARGIN_PERCENT`, `QueuedFeeAnswers` and the payer descriptor.
2. Add `reask` to `JobProgress` and to `JobProgressSchema`. Add `simulating → queued` to `fsm.ts` and its header comment.
3. In `transfer-executor.ts`:
   - extract the stash entry `runEstimate` builds into one helper; keep `chainIdentity`, `fpcIdentity` and the epoch from `buildFresh`, and the consumed entry from `fromReusedEstimate`, whose `builtAt` a re-stash keeps;
   - in `estimate-reuse-shared.ts`, time `SingleShotTtlCache`'s physical drop from the entry's `builtAt`;
   - read the epoch before each build;
   - write `buildWithinCap` as § Arc 4 orders it, evicting the stash entry on every exit.
4. In `service.ts`, `spec.ts` and `client.ts`: the queued answer's `cap`, `executeTransfer`'s `feeCap` check, and `acceptQueuedFee` with its ownership gate.
5. Add tests:
   - `queued-fee-cap.test.ts`:
     - the basis is the newest valid row (control); one case per refused row: another profile, an `ambiguous` row, another chain, another token, a dApp origin, and an `estimatedFee` that is missing, zero, not decimal or 40 digits long;
     - the cap rounds down to six decimals; a basis whose cap rounds to 0, or whose cap fails `isFeeAmount`, gives none;
     - `accept` with the waiting fee resumes once (control); a different fee, no waiter, or a second accept is refused (never-happens: a resume on a stale fee);
     - abort gives `aborted`, the deadline gives `expired`, and each removes the entry.
   - `transfer-executor.test.ts`, with the build stubbed:
     - a fee equal to the cap proves once and never moves the row to `queued` (control);
     - a fee above the cap never proves (never-happens); the slot is free before the wait starts (never-happens: the slot held while the person decides); the row moves `simulating → queued` with `reask`; a later send that shares a key stays blocked;
     - an accept within the TTL proves the stashed build once and records its fee;
     - a reused build above the cap is re-stashed with its original `builtAt`; on a fake clock, an accept after that `builtAt` + TTL rebuilds (never-happens: a re-stash that renews retention);
     - an accept after an epoch bump rebuilds; it sends at or under the accepted fee, and asks again above it with the accepted fee as the cap;
     - a ×, a session end, and the deadline each end `cancelled`, never prove, and evict the stash entry;
     - with no cap, the path is today's (control);
     - a publication that fails removes the waiter and fails the send; a signal aborted before the wait answers at once;
     - a throw on the second pass (a `SessionEndedError` from `tryConsume`, a build error) releases the slot (never-happens: a leaked grant);
     - the publication, the claim and the expiry's cancel, each losing to a ×, end `cancelled` and reject with the cancel error (never-happens: a failure on a cancelled record).
   - `service.composition.test.ts`, on the cancel spike's carve-out (a seeded prepared request whose gas settings price it above the cap; `proveTx` and `sendTx` checked only for being called), with the real journal and lane:
     - a × and an accept in the same tick, in both orders, end `cancelled` with `proveTx` never called (never-happens);
     - an accept against a session end; two accepts; an accept as the deadline passes;
     - the control: the seeded request consumed, re-asked, re-stashed with its provenance, accepted and consumed again, then one proof and one broadcast of that request.
     Each ends with one terminal row consistent with what happened and no waiter left. The PR carries the COMPOSITION-TESTS checklist.
   - `service.estimate-queue.test.ts` and the service tests:
     - the queued answer carries `cap` when a basis exists, and none otherwise;
     - `executeTransfer` refuses one `feeCap` of each class (a number, a decimal point, a leading zero, 40 digits);
     - `acceptQueuedFee` refuses another profile's record, a record without `reask`, and a different fee, and resumes the matching one once.
   - `estimate-reuse-shared.test.ts`: an entry stashed 100 s after its `builtAt` is gone 21 s later (never-happens: a late stash renewing the physical drop).
   - `fsm.test.ts`: `simulating → queued` is legal, and `queued → simulating` is still illegal (never-happens).
   - `operation-journal/spec` test: a queued progress with `reask` parses, and one with a non-decimal fee does not.
   - The backup registry test: the journal root is in no backup slice.

**Validation gate.**
- Commands: `bun run lint`; `bun run typecheck:all`; the touched files as single test files (`fsm.test.ts` from `packages/wallet-core`); `bun run test`.
- Pass: every command exits 0. Removing the cap comparison makes the never-happens proving case fail; check that once, then restore.
- Layers: lint, typecheck, unit.

#### Phase 4.3: the Send page (screens 1 and 2)

1. Pass the queued answer to `onQueued`. Keep `queuedCap` in `send.vue`.
2. Move the self-paid rule into `fee-helpers.ts`; call it from `FeeSettingsCard.vue` and `send.vue`. Add `feeInWords`, and build `feeLine` on it.
3. Add the readout branch, the label, the `isAllowedToSend` change and the sheet's `queuedCapText`, as the shots have them.
4. Carry `feeCap` through `snapshotTransfer` and `submitTransfer`.
5. Add tests:
   - `FeeCostReadout.test.ts`: with a cap, "You pay", "About X FJ (usd)" and the exact cap line; without one, today's queued line (control).
   - `SendReviewSheet.test.ts`: `queuedCapText` gives the exact fee line and "Queue send"; without it, "Send now" (control).
   - `send.integration.test.ts`:
     - queued with a cap and Private Fee Juice: "Queue send" is enabled, and a click calls `executeTransfer` with `feeCap` and no estimate id;
     - queued with a cap and a sponsor: Send stays disabled and nothing is called (never-happens: queue mode where the person does not pay);
     - queued with no cap: disabled, as today (control);
     - a queued answer for a superseded input never enables "Queue send".
   - `send-submit.test.ts`, `estimate-when-clear.test.ts`, `fee-helpers` tests: the argument; the answer; a spent-token answer keeps `queuedCap`; `feeInWords` with and without USD; the self-paid rule for each method and for none chosen.

**Validation gate.**
- Commands: `bun run lint`; `bun run typecheck:all`; the touched files as single test files; `bun run test`.
- Pass: every command exits 0.
- Layers: lint, typecheck, unit, component.

#### Phase 4.4: Home (screens 3 and 4)

1. Add `reaskLine` and `review` to `TransactionAwaitingCard.vue`.
2. In `RecentActivityView.vue`, add the two stage lines and the sheet over Home.
3. Add `reask` to `SendReviewSheet.vue`.
4. Add tests:
   - `TransactionAwaitingCard.test.ts`: with `reaskLine` the row shows it, opens and emits `review`, and the × still emits `cancel`; without it a transfer's row stays inert (control).
   - `RecentActivityView.test.ts`, with fees as 18-decimal base-unit strings:
     - a queued transfer reads "Waiting for your earlier send"; a queued dApp record reads "Queued..." (control);
     - a re-ask record reads "Fee went up. Review"; opening it shows the exact line and "Send for X FJ";
     - Send calls `acceptQueuedFee(id, fee)` once, a double press included (never-happens: two calls);
     - the sheet closes when the record leaves the re-ask state or its fee changes (never-happens: a press accepting a figure the sheet did not open with);
     - a Private Fee Juice payer draws the hidden facts; Public Fee Juice on a private origin draws the exposed row and arms the review gate.
   - `SendReviewSheet.test.ts`: the `reask` line and button, exact strings.
   - The three Send-page transfer expectations of "Queued..." (`RecentActivityView.test.ts:1012, 1030, 1044`) read "Waiting for your earlier send".

**Validation gate.**
- Commands: `bun run lint`; `bun run typecheck:all`; the touched files as single test files; `bun run test`; `bun run test:all`.
- Pass: every command exits 0.
- Layers: lint, typecheck, unit, component.

#### Phase 4.5: arc 4 end-to-end gate

1. Update the network fixtures and assertions:
   - `send-burst.ts`: `readEstimateState` reads `fee-estimate-queued-cap` as `queued`; `BurstSend` gains an optional `speed`, picked through `send-fee-priority-<level>`.
   - `expectEstimateQueued` keeps what holds with or without a cap: B's row reads queued, with no estimate and no failure toast. Send is enabled exactly when the cap line shows.
   - The two-window case's subtitle (`same-token-concurrent-sends.test.ts:356`) becomes "Waiting for your earlier send".
2. Add one case to `same-token-concurrent-sends.test.ts`: "a private send held unmined; a second private send of the token at Urgent is queued against the cap, asked again after the release, accepted from Home, and goes out once".
   - Setup: two private sends of one token to one recipient, so they share keys (public-to-public sends share none: `transfer-sequence-keys.ts:22-31`). Both pay with Public Fee Juice, so both go through the review gate; A at Normal, B at Urgent (I7). The popup closes and reopens before the accept, so the row and the sheet come from the journal, not the page.
   - Never-happens: while A is held, and after the release until the accept, B's record never reaches `proving` and the node holds no tx of B.
   - The cap line shows before "Queue send" is pressed (a cap that rounds to 0 would offer none).
   - Control: both confirm, and B's recorded fee is at most the fee accepted. A second re-ask (a price move before the accept) is accepted again, at most three times.
   - Failure mode: the round trip across processes. A held `execute` call, a journal-driven row and the accept RPC resume one broadcast at the accepted fee. No cheaper layer reaches it: the check follows a real build, and the units stub the build and the popup.
   - Runtime: estimated 120 s per browser (one held block, one re-ask); the PR states the measured figure.
3. Capture screens 1 to 4 during the case, light and dark, on Chrome and Firefox, into `screenshots/4-*.png`.

**Validation gate.**
- Unit: `bun run lint`; `bun run typecheck:all`; `bun run test`; `bun run test:all`; `bun run test:ci-gating` (the lane's gate); `bun run check:plans`.
- Network, Chrome then Firefox, retry 0, one run at a time through `agent.sh`: `NULO_E2E_PROVERLESS=1 NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/same-token-concurrent-sends.test.ts`, then `send-chaos.test.ts` as CI runs its two fixed seeds (it reads `readEstimateState`). Firefox repeats both with `NULO_E2E_BROWSER=firefox`, since the fixture changed.
- Smoke, Chrome and Firefox: `cd apps/extension && bun run test:e2e -- --retry=0`, then the same with `NULO_E2E_BROWSER=firefox`.
- Pass: every command exits 0, and no existing case changes outcome. The PR states the network file's wall-clock per browser, before and after, and attaches the screenshots.
- Layers: lint, typecheck, unit, component, network e2e, smoke e2e.

#### Phase 4.2: record the chaos rule (#220)

Moved 2026-10-11 to [ci-followups-2](../ci-followups-2/plan.md) by the owner's call: the chaos jobs gate the nightly and two fixed seeds gate every network PR; nothing remains here.

### Arc 5: keyboard reach (after P9-05 and arc 2)

#### Phase 5.1: buttons, Space and the live region (items 1, 3, 4, 5) ✓

1. Make the two fee links buttons; move `isRepeatOrComposing` into `@nulo/design` and re-export it; add Space to the three controls; mount the degraded notice's region empty; hide the compact label.
2. Tests: `FeeSettingsCard.test.ts` (buttons, Enter and Space activate once, a repeat does nothing; the region exists before its text); `Checkbox.test.ts` (≥ 5 cases, L2 rule); `ScopeAddress.test.ts`, `ScopeClassId.test.ts`; `CollapsingHeroLayout.test.ts`.

**Validation gate.** Commands: `bun run lint`; `bun run typecheck:all`; `bun run test`; `bun run test:all`. Pass: all exit 0. Layers: lint, typecheck, unit.

#### Phase 5.2: the suggestion listbox (item 2) ✓

1. Add the listbox roles, the highlight and the keys.
2. Tests: `RecipientField.test.ts` (Down and Up move the highlight, Enter picks it, Escape closes, Tab leaves the field with no stop on a row); a smoke case in `send-keyboard.test.ts`.

**Validation gate.** Commands: unit as 5.1; smoke on Chrome and Firefox for `send-keyboard.test.ts`. Pass: all exit 0. Layers: unit, smoke e2e.

#### Phase 5.3: arc 5 end-to-end gate ✓

**Validation gate.** Commands: smoke on Chrome and Firefox (whole suite, retry 0); network Chrome for the file that drives a dApp send with its own fee payment (find it with `git grep -l send-fee-override apps/extension/tests/e2e`). Pass: all exit 0; before and after screenshots on both browsers. Layers: smoke e2e, network e2e.

## Delivery

One `gh stack`, one PR per arc, a docs-only close-out on top. Titles name only what shipped.

| Layer | Branch | Phases | Stacks on | `/code-review` | PR title (≤ 93 characters) | Closes |
|---|---|---|---|---|---|---|
| 1 | `worktree-send-queue-activity` (adopted; carries the plan commit) | 1.1, 1.3-1.5 (1.2 on OA-5 = A) | `dev` | off | `fix(send): persist the fee spender, scope journal events, check the dapp reuse epoch` (84) | #152; `Refs #218, #219` |
| 1b | `send-queue-activity-dapp-order` | 1b.1-1b.3 (OA-3 = A or B), 1.2 if OA-5 = A came after layer 1 opened | layer 1 | off | `fix(send): order dapp sends behind earlier sends, wait out node lag` (67), cut to the parts built | #218 (on OA-3 = A or B) |
| 2 | `send-queue-activity-amount` | 2.1-2.4 | layer 1b (layer 1 when 1b is not built) | off | `fix(send): fit long usd figures, review-line gap, price-moved notice` (68) | #90 |
| 3 | `send-queue-activity-outcomes` | 3a.1-3a.4 | layer 2 | off | `feat(activity): refused, expired and not-yet-final send states` (62) | #112, #108, #109 |
| 4 | `send-queue-activity-feed` | 3b.1-3b.6 | layer 3 | off | `fix(activity): one scope rule, known decimals, failed-send surfaces, status contrast` (84) | #209, #103, #213, #110, #122, #243, #219 |
| 5 | `send-queue-activity-queued-cap` | 4.1, 4.3-4.5 | `dev` (D-orch-15) | off | `feat(send): queue a send behind an earlier one against a fee cap, ask again above it` (84) | #217 |
| 6 | `send-queue-activity-keyboard` | 5.1-5.3 | layer 5 | off | `fix(a11y): keyboard reach on send's fee card and suggestions` (60) | #242 |
| 7 | `send-queue-activity-close-out` | close-out | the top layer | off | `docs(plans): close send-queue-activity` (38) | none |

- **Arc gates.** Arc 1 needs no owner answer beyond the archived concurrent-sends decision (OA-3 records why); it ships first, alone if the pages are late, with the close-out recording the rest as open work in their issues. Arc 1b waits on OA-3 (the dApp wait) and OA-5 (the lag gate); a part answered before arc 1's PR opens joins layer 1 instead (its title re-measured ≤ 93), and the PR closes #218 when the dApp wait is in it. On OA-3 = C #218 closes as not planned; on OA-5 = B #219 item b closes as not planned in the layer that closes #219. Arcs 2 and 5 wait on page 9 (5 also on arc 2); arcs 3a and 3b on page 10 and the charter items named; arc 4 on page 9's P9-04 records (signed 2026-10-13). A stack layer whose page is unsigned is not built; the layers above it re-stack on the last built one.
- **Holds.** H7 holds arc 3a's merge until page 10 is signed with P10-05 and P10-06; H3 holds arc 4's merge until pages 6 and 9 are signed (both signed 2026-10-13).
- **Arc 4 (D-orch-15).** One PR against `dev` from `send-queue-activity-queued-cap`, whose first commit is this plan; opened after the Phase 4.5 gate and arc 4's Codex loop converge. Body: what changed and why, the validation runs, the network file's wall-clock per browser before and after, the screenshots, the four records quoted, `Closes #217`. It rebases on fees-and-sponsors arc 2, arc 1b, arc 2 or PR #359, whichever lands first (§ Shared files and seams). **Lane close-out:** arc 4 is planned to merge last, since it rebases on fees-and-sponsors arc 2, the longest dependency. So its PR's final commits carry the lane's close-out (§ Post-implementation step 5, with `dev` merged in first). If the orchestrator merges another arc of this lane after it, that arc's PR carries the close-out instead, and arc 4 writes only its Outcome lines into this plan.
- **Mechanics.** `gh stack init --adopt worktree-send-queue-activity --base dev`; at each arc boundary, after its loop converges, `gh stack add <next-branch>`. In Delivery: `gh stack sync`, then `gh stack submit --auto`, then `gh pr edit` each body: what changed and why, the validation runs with outcomes, `Closes #n` per issue, for UI arcs the page records quoted with screenshots. Then `gh stack add send-queue-activity-close-out`, its commits, `gh stack submit --auto`.
- **Labels.** Open each PR without labels; add `e2e:extension-network` or `e2e:extension-smoke` afterwards only when the path filter skips a suite the arc needs.
- Never merge; never `--admin`; never force-push a branch another human touched.

## Pickup map

The orchestrator writes a `## Pickup` section into each issue. The arc that closes each one:

- Arc 1: #152 (Phase 1.4); #219 item a (Phase 1.1); the dApp estimate epoch fix (Phase 1.3, `Refs #218`).
- Arc 1 or 1b: #219 item b (Phase 1.2), only on OA-5 = A.
- Arc 1b: #218 (Phases 1b.1-1b.3), after OA-3 = A or B; on C, no arc (closes as not planned).
- #219 closes in the layer that settles its last open item (arc 3b by default).
- Arc 2: #90 (Phases 2.1-2.3).
- Arc 3a: #112 (3a.1), #108 (3a.2), #109 (3a.3).
- Arc 3b: #209 (3b.1), #103 and #213 (3b.2), #110 (3b.3), #122 and #219 item c (3b.4), #243 (3b.5).
- Arc 4: #217 (4.1, 4.3-4.5). #220 moved to ci-followups-2 (4.2).
- Arc 5: #242 (5.1, 5.2).
- No arc: #244.

## Post-implementation

The implementing session runs these steps from this file. `code_review` is `off`, so no `/code-review` step exists.

1. **Per-arc Codex audit at each arc boundary**, before `gh stack add` opens the next arc.
   - Write a prompt file under `~/.cache/nulo-backlog/send-queue-activity/`, then run `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol` on the default `~/.codex` login.
   - On a quota or 401 error, retry once with `CODEX_ACCOUNT=alejo-icloud`. If that fails too, log the failed consult in `lessons/phase-N.md` and continue on your own judgment within scope.
   - The prompt carries the arc's diff (`git diff <arc-base>..HEAD`), this plan and its decision ledger, and the arc map ("this is arc N; later arcs add X").
   - It carries an explicit adversarial ask: can any path send twice, skip a predecessor, deadlock the slot, hold the slot while waiting, strand a queued record, leak an identifier into a log, or change what a dApp receives; which assertion is weaker than at base.
   - Arc 1's prompt asks first whether anything is awaited on the network while the slot is held, and whether an imported row can reach the gate; arc 1b's asks first about `parkSlot`'s error mapping, the reservation's drop on every exit, and origin order.
   - Arc 4's asks first whether any path proves above the cap, broadcasts twice after an accept, holds the slot while the person decides, strands a re-ask record, resumes on a stale fee, lets a later send overtake a re-asked one, or keeps a signed request past the send; and whether the queued answer reads anything on the network.
   - It ends with the two rules below, verbatim.
2. **Fix loop.**
   - Verify each finding against the code first. Apply the accepted fixes and commit them.
   - Log the round in `lessons/phase-N.md`: the consult, the verdict, what was accepted, and what was rejected with reasons.
   - Resume the same session with `resume-codex.sh <session-id> <followup-file> <codex-dir> high` and the fix diff.
   - Stop when a round has no new material finding. **Hard stop at three rounds:** if the third round still finds material issues, stop and report it to the orchestrator.
3. **Final cross-arc pass**, after every built arc is green and looped: a fresh Codex session over `git diff 9574a9d..HEAD`, asking for seams between arcs, duplication across arcs and drift from this plan. The same rules and loop apply.
4. **Delivery**, per § Delivery: the first time any PR opens.
5. **Close-out**, as the stack's docs-only top layer:
   1. Bring `dev` in with `gh stack sync`. Read what changed in `implementations-plan/index.md` and `lessons.md`; another lane may have landed. Never a union merge.
   2. Write `## Outcome` directly after the front matter: Date, Status, Shipped (PR numbers), Dropped with a disposition line each, Open items, and "Seeds retired: the /goal and /loop seeds below are no longer live".
   3. File every open item in its home (table below), deduping first with `gh issue list --state all --search "<words>"`. An issue body has five sections: What happens, Where, Impact, Possible fix, Record. Comment on every lane issue left open, saying what shipped and what is left.
   4. Promote generalizable gotchas to `implementations-plan/lessons.md`: 8 KiB budget, deduplicate, retire what an entry supersedes, date tool versions.
   5. Delete `STATUS.md` and the "Live progress" link at the top of this file.
   6. In its own commit, `git mv implementations-plan/send-queue-activity implementations-plan/archive/send-queue-activity`. Repair relative links the extra level breaks. Move the index line to `archive/index.md`.
   7. Report and stop. Merging is the orchestrator's call.
6. **Teardown after the merge.**
   - When `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/send-queue-activity/plan.md` succeeds, run `agent-worktree done send-queue-activity --merged`. This step needs no approval.
   - If it refuses, relay its output and stop; never force.
   - A `/loop` session checks this on every firing. A `/goal` session arms one background wait after its wrap-up report: `until git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/send-queue-activity/plan.md; do sleep 300; done`.

**Where open work lives** (CLAUDE.md § Where open work lives):

| Situation | Home |
|---|---|
| Work inside the implementation you are on | this `plan.md` and the PR |
| Actionable work that outlives the plan | a GitHub issue, with a domain label and a `Record` link to the archived plan |
| Needs a product call, or waits on something outside the repo | an issue labelled `owner-decision` or `blocked:external` |
| A suspected exploitable weakness | a private draft security advisory; this plan records only "tracked privately: GHSA-…" |
| Rejected, superseded or already done | a disposition line in the Outcome; no open item anywhere |
| Knowledge that prevents a repeat | `implementations-plan/lessons.md` (8 KiB budget) |
| A legal or store blank with a release deadline | `BEFORE-LAUNCH.md` |
| Accepted code work that blocks launch | the `v1.0.0` milestone, pointed at once from `BEFORE-LAUNCH.md` |

**No-over-engineering rule** (verbatim in every post-implementation Codex prompt): *"Report bugs and small, targeted improvements only. Do not propose speculative abstractions, extra configuration surface, new layers, or rewrites — the smallest change that fixes each real problem. If code works and is clear, leave it alone."*

**Comment-quality rule** (verbatim in every post-implementation Codex prompt): *"Audit the comments for value per character. Flag any comment that narrates what the code visibly does, restates its line, references implementation plans / phases / reviews, or spends a paragraph where a sentence works — and flag places where a non-obvious invariant or constraint deserves a comment it doesn't have. Comments are permanent context every future reader, human or LLM, pays to re-read: they must be few, dense, and exact."*

## Decision ledger

Each entry gives the choice, the alternatives rejected, the reason, and where it matters, the panel's view.

- **D1 Where a dApp send waits.**
  - Chosen: after its first slot grant, parked outside the slot, keeping its depth reservation and its origin's order (`parkSlot`).
  - Rejected:
    - before `acquireSlot`, or before the mutex enqueue inside it: this moves the session baton (a frozen invariant) and delays the dApp's next dispatch, and dispatch timing belongs to dapp-ingress-grants (H1);
    - a plain release and re-acquire (plan v1): it escapes the caps, and it lets a later same-session request overtake (Codex 2 and 5);
    - inside the slot after the claim: this stalls the profile's chain for every account (Outline B);
    - a pending-aware PXE simulation: an upstream change.
  - Panel: Codex required kept admission and preserved FIFO. Opus proposed the kept reservation and `runInSlot` owning the loop. Both are adopted.
- **D2 What a dApp send waits for.**
  - Chosen: a waiter that is blocked by everything the OA-3 option names and blocks nothing.
  - Rejected:
    - an opaque `*` key that also holds later sends (plan v1): a chain of waiting dApp sends could starve a Send-page send into the 60-minute limit (Opus 2);
    - keys taken from the request's calls: a router or an authwit spends notes no outer call names (recon § #218).
- **D3 How long a submitted dApp tx holds later sends.**
  - Chosen (what ships now): narrow the hold to the tx's recorded keys, as today, and narrow the correctness claim to match.
  - Keeping it opaque until inclusion is the owner's call: OA-4.
  - Panel: Codex found that plan v1 contradicted D2 here, because a router's downstream spends are skipped. Opus noted that Outline B closes this gap by construction.
- **D4 A dApp send past 60 minutes of waiting.**
  - Chosen: run unordered (today's degraded mode).
  - Rejected: fail with `WAIT_LIMIT_MESSAGE`. That is a new error reaching the app (H5), in copy page 9 has not ratified.
- **D5 Which fee spender is persisted.**
  - Chosen: `Tx.feeSpender`, holding the address the build used, re-validated under the slot (Codex 9).
  - Rejected:
    - the address looked up before the wait (plan v1): the address is editable;
    - the journal record: the sequencer reads Tx rows;
    - the built FPC call in `calls`: the activity card would show it.
- **D6 How to know the PXE will see the predecessor.**
  - Chosen: the PXE runtime node's proposed tip, read without the chain guard, outside the slot, with a bound.
  - Rejected:
    - `getSyncedBlockHeader`: it does not sync.
    - a runtime `pxe.sync()` call: it exists (`pxe.js:318-322`), but it runs behind a proof and syncs to the same lagging node, so it cannot wait for the block. Opus corrected plan v1's reason here.
    - `getLatestBlockNumber` as the primary read: its chain guard waits behind a proof. It stays as the fallback, outside the slot, with a timeout.
    - retrying on a stale-nullifier error (archived plan): it pays for a proof first and can evict the first tx.
- **D7 Where the floor comes from.**
  - Chosen: in-memory observations this worker made, each held for 60 s.
  - Rejected:
    - stored Tx rows inside `SUBMITTED_HOLD_MS` (plan v1): this trusts imported rows and future timestamps (Codex 8, Opus 1);
    - one floor per account: it holds sends that share nothing (Opus 9).
- **D8 What happens when the gate fails.**
  - Chosen: a lapsed observation or a failed read runs the send.
  - Rejected: failing the send. A node outage would then fail sends that would have succeeded.
- **D9 #219 c.**
  - Chosen: the owner decides (OA-1).
  - Rejected: building it in arc 1, which changes what the card reads without sign-off.
- **D10 #152.**
  - Chosen: the flat feed is final, and journal-event side effects are scoped.
  - Rejected:
    - per-scope slices: they rewrite an R5 file;
    - the render filter alone (plan v1): foreign events would still clear the current state (Codex 3).
- **D11 Splitting arc 3.**
  - Chosen: two arcs. 3a covers outcome states on the service side (H7). 3b covers feed surfaces (R1, R2, R5).
  - Rejected: one PR, which would carry thirteen records across about thirty files.
- **D12 Arc 5's key helper.**
  - Chosen: move `isRepeatOrComposing` into `@nulo/design` and re-export it.
  - Rejected: a second copy.
- **D13 Splitting arc 1.**
  - Chosen: #218's dApp wait waits on OA-3, the lag gate on OA-5, and the rest ships first.
  - Rejected: treating the whole arc as decision-free. Both auditors found the dApp wait changes what a person and a dApp see.
- **D14 One take-turn helper for both executors (Opus 8).**
  - Rejected: the two entries differ in the baton and first acquire, in the slot bucket, and in who owns the record, so a shared helper would carry a flag for each difference.
  - What they do share is the lane's `parkSlot` and the gate.

- **D15 Refusal and expiry evidence (arc 3a).**
  - Chosen: per-call HTTP evidence from the counting transport for #112; chain time first, receipt second, from one node, for #108.
  - Rejected: an attempt count alone, or a JSON-RPC error shape (the client synthesizes those for transport failures); receipt first (an inclusion between the two reads would read as expired).

The orchestrator's calls at arc 1's start (they override § Delivery where they differ):

- **D-orch-1 No stack.** Arc 1 opens its own PR against `dev` (`gh pr create --base dev`) under the Delivery table's title; no `gh stack`. Later arcs branch from arc 1's branch and rebase onto `dev` after it lands.
- **D-orch-2 Arc 1 without Phase 1.2.** Arc 1 ships Phases 1.1, 1.3, 1.4 and 1.5; the chain-tip gate waits on the owner (OA-5, page 9 P9-08). Nothing of arcs 1b, 2, 3a, 3b, 4 or 5 is built: OA-1 to OA-5 sit on pages 9 and 10 (P9-06, P9-07, P9-08, P10-14; OA-2 rides P9-04). Phase 1.1's restart ordering ships under the archived concurrent-sends decision; if the owner answers otherwise, the next arc re-points it.
- **D-orch-3 Holds.** H3 gates arc 4 and H7 gates arc 3a, as § Delivery says.

Arc 1 deviations from the text above (the tree won; detail in `lessons/phase-1.md`):

- **D16 #152 scoped at ingestion.** Journal state takes in only records of the active account, profile and network (events and the snapshot), so every side effect and the snapshot's terminal scan see only those. The token page's token stays a render filter only: another token's terminal record still clears its own placeholder in the shared store.
- **D17 The pinned row judges reuse.** `TransferEstimateReuse.tryConsume` takes the send's pinned `Fpc` and compares the entry's `fpcIdentity` against it in place of a fresh read, rather than a separate check in the executor; the ladder's order is unchanged.
- **D18 The dApp epoch is read before the build.** As on the transfer path; the operation ladder checks it right after the pending set, and its order pins gained the step.
- **D19 Composition through the service root.** `send-order.composition.test.ts` drives a fresh `ExecutionService` (its real lane, sequencer and transfer executor) with the real journal instead of wiring the four classes by hand.
- **D20 The restart case asserts the queued estimate, not a queued record.** Send stays disabled while B's estimate reads queued, so B never gets a record that could leave `queued`. The case runs the file's `expectQueued` contract (B's fee row reads queued and Send stays disabled through the held window while A is unmined; then both confirm) with the background stopped between A's submission and B's start. The popup closes before the stop, since Firefox keeps its event page alive while an extension page is open.
- **Shared seams touched:** `dapp-send-executor.ts` (one dep, the epoch read in `estimateOperationFee`, the stash's field; not `runInSlot` or `markJournal`), `execution/service.ts` (dep wiring only; the settle handler and estimate admission are untouched without Phase 1.2), `transfer-executor.ts` (FPC resolution and the turn), `RecentActivityView.vue` (the predicate block, two handler guards, the snapshot filter).

The orchestrator's calls at arc 3a's start (2026-10-12; page 10 signed: #112 P10-05 approved, #108 P10-06 approved, #109 P10-07 changed):

- **D-orch-4 Fresh branch, one PR.** Arc 1 landed by squash (#264), so arc 3a branches `send-queue-activity-outcomes` from `origin/dev` and opens one PR against `dev` under the Delivery table's arc 3a title (cut to what ships), `Closes` each issue it closes in full and `Refs` one a stop rule holds back.
- **D-orch-5 #109 ships without copy.** Phase 3a.3 builds the inclusion record, its fenced journal method, the finality watch and the slow re-poll, and a pruned block returns the row to checking; but no "Went through" state, label or context line is added: a mined row keeps reading as it does today until final, and the only visible effect is a row that returns to today's "Not confirmed yet" when its block is pruned. The owner's words: "no new words; only the pruned-block re-check ships".
- **D-orch-6 The two stop rules stand.** Phase 3a.1: if a node refusal cannot be told from a transport failure through the real client, stop that phase and return the limit to `OWNER-ASKS.md`. Phase 3a.2: if a node can forget or late-index an included tx's receipt, stop and return "No fee was paid" to `OWNER-ASKS.md`. A stopped phase leaves its issue open with `Refs` and a comment carrying the probe record; the other phases still ship. H7: only the approved strings ship, never "Nothing was sent" or "no fee was paid" after a refusal that can follow a retried POST.
- **D-orch-7 No new words beyond the page.** An approved string is used verbatim; a surface that would need another goes to `OWNER-ASKS.md` in the "what ships now" form and ships without it.
- **D-orch-8 Delivery hygiene.** Merge `origin/dev` before the final gates (never a union merge; `lessons.md` is at its 8 KiB budget), and attach screenshots of the History card and detail for each new state, both themes.

Arc 3a deviations from the text above (the tree and the default endpoint won; the probe record and both consults are in `lessons/phase-3a.md`). Panel: Codex gpt-6.1-sol high, session `01a1326f-c394-7b30-a81f-6615789a9de5` (two turns), and one Opus Plan lens.

- **D21 Phase 3a.1 stops (#112 stays open).** The default Testnet endpoint is dRPC's load balancer (`network-endpoints.ts`). Its gateway splits batches per request and retries a timed-out request on another upstream, with optional hedges. So one POST answered with a node error does not prove that no upstream took the tx. The concrete harm (Opus): A includes the tx, the gateway retries on B, B answers "Invalid tx: Existing nullifier", the row says "won't go through", and a resend of a public transfer pays twice. On one node the refusal is visible at the HTTP layer; through the endpoint it is not. Codex and Opus both agree to stop. A whitelist of "intrinsic" refusal reasons was rejected: every reason the wallet can meet depends on node state. The limit goes to `OWNER-ASKS.md` (OA-6).
- **D22 #108's proof: the tx's first nullifier, absent at a finalized anchor (replaces D15).** D15 needed the tip read and the receipt read to come from one node, and the endpoint cannot promise that. A lagging upstream answers DROPPED for an included tx. The single-node conditions of the stop rule hold (one node never forgets or late-indexes a receipt; the probe is in the lessons), so the rule does not fire. Codex first asked to route this through OWNER-ASKS, then withdrew that ask. What replaces D15:
  - At submission the journal records `expiry: {timestamp, nullifier}`: `tx.data.expirationTimestamp` and the tail's first non-empty nullifier: the first non-revertible nullifier a private call emits, or the protocol nullifier when none does. Every inclusion inserts it, reverted or not, and it is not unique per tx, which is why presence claims nothing. Nothing is recorded for a tx anchored at genesis, since the validator's block-1 exception applies to it.
  - Once the local clock passes the expiry, the check reads the finalized tip F. When `ts(F) > expiry` it asks for the nullifier with `findLeavesIndexes({number, hash} of F, NULLIFIER_TREE, …)`. That query is fork-verified or throws (`node_world_state_queries.js:202-260`). Absent means `expired`. Present, an error or a malformed answer claims nothing.
  - Why absence is final: block timestamps never decrease (they are slot times), and F cannot be pruned. Proposed and proven anchors were weighed. Finalized was chosen for a claim about money.
  - Why presence claims nothing: a replacement with the same salt shares the nullifier.
  - The verdict therefore lands only after finality passes the expiry, about a day after the send, never at a promised time.
- **D23 #109's proof: the recorded block's hash in the finalized chain's archive.** "Not mined" from one upstream is not a prune behind a load balancer, and a differing hash at the same height only proves two upstreams disagree. The watch waits until the finalized tip F reaches the inclusion block N, then asks `findLeavesIndexes(F anchored, ARCHIVE, [hash])`; archive leaves are block hashes at index = number.
  - Found at index N: the inclusion is final.
  - Absent: the receipt decides. A receipt naming another block is a re-inclusion: a new inclusion record, and the result may change. A receipt naming the recorded block (a stale upstream) is no answer. Not mined means pruned.
  - No slot rule is needed (Opus proposed one), because the anchor already excludes stale branches. The cost is that a prune is noticed only once finality passes its block.
  - One helper serves both services (`transaction/inclusion.ts`).
  - Accepted: an upstream still serving the pruned block can answer the row's next first read with it, so the row reads "Sent" again until the next finality read prunes it. The flap is bounded by the 60 s finality cadence, uses existing words, and ends when that upstream catches up. Recording the pruned hash to refuse it would add a field for a transient case (Opus round 1).
- **D24 Each visible row owns its finality.** A failed send that the check answered `sent` or `reverted` is a journal row: the send check watches it, re-armed at boot from the journal, which no backup carries. A succeeded send's visible row is its Tx row, while its journal record renders nothing, so `TransactionService` watches the Tx row. The worker sets a persisted `awaitingFinality` marker in the same write that takes the row out of Pending. Boot re-arms marked, non-ambiguous rows. `restore` and backup export strip the marker, so a backup never makes the worker dial a restored row's endpoint (D16 parity). This replaces the plan's in-memory set plus journal re-arm, which could only reach the visible Tx row through a cross-service write.
- **D25 One compare-and-set journal write.** `setSendCheck` compares what the caller read: the stored `check` and the inclusion hash. It does not compare `updatedAt`, which a harmless title update also moves. A pure legality table admits these moves:
  - none → sent, reverted, unconfirmed or expired;
  - unconfirmed → expired;
  - a watched sent or reverted → final, re-included or pruned.
  Pruned clears the check and the inclusion and sets `checkSince`, the time the window restarts. Nothing leaves expired or a final answer. `SendCheck` keeps one watch per row and acts on the freshly loaded record (Opus found the emit-before-unwatch strand in the sketch).
- **D26 A pruned Tx row is an ordinary pending send again.** The marker is cleared and the row returns to Pending with block, result and fee cleared. From there it follows the pending poll, its DROPPED debounce and the 30-minute resurrection window, as any submitted tx does. Codex asked to keep pruned rows watched past that window. Rejected: such a row is no likelier to come back than any dropped tx, and the extra watch would be unbounded.
- **D27 The single-attempt node logs nothing.** `createSingleAttemptNode` is built with `createSafeJsonRpcClient` and `SILENT_RPC_LOG`, as `readPublicStorageOnce` already is. `createAztecNodeClient` cannot take a logger, and the SDK's warning carries the endpoint URL, whose path holds the dRPC key, into the exportable log. Every new read in this arc goes through that node.
- **D28 How "Won't go through" looks.** The page approves its words, not its look. It takes the existing failed look, the red cross and the State row "Failed", as "Reverted" does. A row the post-expiry read finds included keeps "Unconfirmed", since the page names only the expired move. OA-7 records both for the owner.
- **D29 Phase 3a.2 as built.** The expiry proof runs only on an `unconfirmed` row, so the table admits `unconfirmed → expired` and not `none → expired`: the owner's words put "Unconfirmed" before "Won't go through", and one path per state keeps the table small. A nullifier the finalized chain holds is not recorded; it ends that row's watch until the next restart, which reads it once more (such a row is rare: its receipt went unseen for the whole window, yet it was included). The one-watch-per-row restructure of D25 lands here rather than in 3a.3, because `unconfirmed → expired` is the first answer that leaves a row with work. The expiry is read from the tx in `sendExpiryOf` (`execution-coordinator.ts`); a real-kernel test (`execution-coordinator.real.test.ts`, node environment) pins the field and the first non-revertible nullifier.
- **D30 Phase 3a.3 as built.** A `sent` or `reverted` answer records its block unless the receipt is already Finalized; a mined receipt that names no block is no answer, where it read `sent` before (the node always names one). From a watched block the table admits final with either result, so a move into a block that is already final needs no extra round. The finality read runs every 60 s (`FINALITY_READ_INTERVAL_MS`) through the silent single-attempt node; the pending poll keeps its retrying node. A journal row's balances refresh on a first answer, a move and a prune, not on final, `unconfirmed` or `expired`. A pruned Tx row returns to Pending, which refreshes nothing today; its balances refresh when its next status lands. `TransactionService` files every worker write through one `commit` that picks the row's single watch, and one `unwatch` clears all of them for the purge and the ambiguous marking.

The orchestrator's calls at arc 3b's start (2026-10-13; page 10 with C9 and C12-links signed; OA-1 = A):

- **D-orch-9 Only the signed words and looks ship.** A surface that would need another word goes to `OWNER-ASKS.md` in the "what ships now" form. P10-04: reproduce first; if it does not reproduce, #110 keeps that item open with a comment carrying the probe record, and the rest of #110 ships.
- **D-orch-10 C9 as signed.** A value not yet known draws the loading skeleton until it lands, then "—" with a short reason; never 0, $0.00 or a figure from guessed decimals. #103: no figure while `knownDecimals` is null.
- **D-orch-11 Generated tokens.** `fill--txt-*` comes from `token-contract.ts` through `bun run --cwd packages/design gen:tokens`, never a hand edit of a generated file; `theme-contrast.test.ts` asserts the ratios and the drift tests pass.
- **D-orch-12 Merge `origin/dev` before the final gates.** Never a union merge; `lessons.md` is at its 8 KiB budget.
- **D-orch-13 Screenshots close the loop.** Every surface the page names, both themes, both browsers, attached to the PR.

Arc 3b as built, where it differs from or adds to the text above:

- **D31 One rule, the journal page included.** `journal-detail-scope.ts` calls `journalRecordInScope`, so a record from before the network stamp now opens there as it shows on History. Home's own token-aware filter is `journalRecordOnThisView`.
- **D32 Known decimals, wider than the list.** Besides the listed sites, `BalanceView`'s hero sides, `TokenCard`'s malformed check, `useArrivals`, `received-display.ts` and `app.vue`'s token lookup read `knownDecimals`. `token-fold.ts` keeps a funded row of unknown decimals in view rather than folding it as dust. `TransactionCard` passes `hasDecimals: true` to the fiat line, since a tx row carries its transfer's own decimals. The read-order pins in `journal-terminal-order.test.ts` gained the `hasDecimals` read. The smoke helper `seedTokenRow` now writes the decimals getter a real row has; without it the seeded receipts in `rows.test.ts` would lose their amounts.
- **D33 P10-01 as built.** `info` renders in the alert region and stays until closed, as `error` does. The copy module reports `checking`, and `send-submit.ts` names the kind at the call (`checking ? "info" : "error"`), so every `openToast` call keeps a literal kind; `toast-call-sites.test.ts` accepts `info`, the third `ToastKind`.
- **D34 P10-03 on two pages, not three.** `TxHashRow` serves the tx and journal pages. The received page keeps its own row: its link is `--txt-primary` where the tx page's is `--txt-secondary`, and one row would change the received page without sign-off. The journal page links only while its record's network is the active one, since the explorer URL is per chain. Under explorer None it adds no hero "Copy hash": the page names only the link, and the row's hash copies on a click.
- **D35 P10-04 reproduced.** Probe (Chrome, 360x600 popup, a queued dApp send and a failed Send-page send on Home): at rest the error snack spanned y 452-524 and Cancel y 433-461, so 9 px of Cancel sat under it; at the scroll's end and centred it was clear. Fix as signed: `TransactionCardLayout`'s action row is a `vSnackFooter` (only the awaiting card fills it), marked `.listed`. A listed row is not a bottom footer: it moves the snack only while the snack, at its resting spot, would cover it where it is now, and the snack then climbs past each listed row it covers. Where clearing them all would lift the snack off the top of the screen, it stays where the footers put it. The rule reads the open snack's height, which `ToastManagerBase` exposes. A plain footer's rule is unchanged.
- **D36 #122 as built.** A null subtitle draws the skeleton (92x9, `TokenCard`'s secondary line). A Send-page task card with no running step reads no stage until its record arrives: the task starts before the record exists, so "Preparing..." there was a guess that could precede "Queued...". A running subtask's own label still shows. The Send page's placeholder card, which never knows its stage, draws the skeleton until its record arrives. A journal snapshot that fails while the port stays up is retried every 2 s on the scope's fence; the old comment said the next event retried it, and none did.
- **D37 #219 c as built.** The row moves back to `queued` at either wait: before the dependency wait (checked in the same task as `waitTurn`'s first check) and at the slot (the lane's synchronous `onWait`, called with nothing awaited before the enqueue). The move runs during the wait; the claim awaits it and maps its failure as it maps its own, so a cancel that won either move ends as cancelled. A requeued row is never reaped while it waits: the reaper's `queued` grace (10 min) is longer than `pending`'s (2 min) and both waits heartbeat the row. No dApp record takes the edge while arc 1b is unbuilt.
- **D38 #243 on every status icon.** The rule names "the activity card's status icon", so it reaches the three cards that draw one (terminal, settled tx, incoming) through one map, `status-icon-fill.ts`; otherwise one list would show two greens. The generated map also yields `.color--txt-*`. The dark `--txt-danger` is #ff534b, the colour nearest #f03c3c in OKLab among those reading 4.5:1 on `--nulo-surface-high`: page 6.24, hovered 5.39, pressed 4.50 (was 5.13, 4.43, 3.70). The dark red icon follows the token, as the two signed items combine. `base.css`'s pin is re-hashed.
- **D39 #209's premise cannot be shot.** With the active-network key removed, the popup restores the primary network while it loads, so no Home or History of the no-network state exists to capture. The rule ships unit-proven: its never-happens cases fail on the base.
- **D40 #213 has no shot.** A Send-page record always carries an amount, so no real flow draws an in-progress card with an empty one; the case is unit-proven.
- **D41 Two looks shot from Storybook.** No deterministic e2e reaches "Send not confirmed", and the stage-less window lasts one snapshot, so the info snack and the stage-less awaiting card are captured from the built Storybook in both browsers and themes.
- **D42 #219 stays open.** Items a and c ship; item b waits on OA-5 (page 9, P9-08). The PR says `Refs #219`.
- **D43 The switch block reads the cards' rule.** `hasInFlightSend` calls `journalRecordInScope`, so with no network active a send stamped with one no longer blocks a switch it cannot be cancelled from: no card shows it. Its own doc already required the block to line up with the cards.
- **D44 Two surfaces #103 does not name go to the owner.** The settled transaction card keeps the figure its record stored (OA-8), and a held token of unknown decimals keeps its place in the token order (OA-9). Both ship as they are.

The orchestrator's calls at arc 4's re-plan (2026-10-13; page 9 P9-04 and P9-04a to P9-04d signed, page 6 P6-07 to P6-18 signed):

- **D-orch-14 Arc 4 is re-planned.** The owner changed P9-04 from "builds nothing" to confirm-now-send-later against a cap. The old Phase 4.1 (pin the ratified constants) is superseded; #220 stays in ci-followups-2.
- **D-orch-15 One arc, one PR against `dev`, no stack.** Branch `send-queue-activity-queued-cap` off `origin/dev`; tier `mid` with a dual audit (Codex `gpt-6.1-sol` high, an Opus lens) converged before the build.
- **D-orch-16 Only the mockups' words ship.** A word they lack goes to `OWNER-ASKS.md` in the "what ships now" form. Keyboard and screen-reader paths follow CLAUDE.md.
- **D-orch-17 Screen 4 is option B; option A is the fallback design, not built.** Option A: the row reads "Fee went up. Tap to review."; tapping opens the send's detail page, which gains a Queued state and shows the new fee and the cap the person accepted, with two buttons, "Send for the new fee" and "Cancel send" (`shot/217-reask-A`). The owner's note: "Let's do "B" but save "A's" idea in case I ever want to fallback into that one."
- **D-orch-18 #188's cap rules belong to fees-and-sponsors arc 2** (P6-07 with the owner's note, P6-08 OA-1 = B, P6-09 to P6-11, P6-12 = B, P6-13 to a design round). Arc 4 names the seam and rebases on it; it never re-decides a number.
- **D-orch-19 Proportion.** Arc 4's sections target 350 lines. Persistent state beyond the cap and the re-ask state, an independent lifecycle, a coordination protocol beyond the sequencer, a recovery policy or a public contract is a plan change to surface, not a phase.
- **D-orch-20 OA-10 to OA-13 ship their defaults** (orchestrator, 2026-10-13). All five arc 4 asks go on the owner's page; an answer that differs becomes a follow-up arc.
- **D-orch-21 OA-14 is B.** The re-ask sheet always arms its button 800 ms after it opens, through the usual sheet's existing guard (`useSendReview`). No new words, no layout change. The orchestrator's record: "#217 re-ask sheet arms its button 800 ms after opening, the usual sheet's existing guard applied to the one sheet whose subject is a higher fee".
- **D-orch-22 D49 stands:** a re-stash keeps the consumed entry's provenance and `builtAt`.
- **D-orch-23 Merge order.** Arc 4 merges after arc 1b, arc 2 with 5, and fees-and-sponsors arc 2. It builds on the day's `origin/dev` and merges `origin/dev` in (never a union merge) when a sibling lands, re-running the gates it touches. Whichever of arc 4 and P6-03 (OA-9 A) lands second writes the combined `isAllowedToSend` rule. It calls `takeTurn` unchanged and reaches the reuse cache only through `stash`, `tryConsume` and `evict`.
- **D-orch-24 The four shots are the sign-off** (P9-04a to P9-04d, option B for the re-ask); nothing beyond their words ships. The PR attaches the Send page's queue state and the re-ask row and sheet, both themes.

Arc 4's own decisions (the panel's views are in § Audit verdicts):

- **D45 Where the queued send waits and asks: inside its own `execute` call (Outline A).** Rejected: B, a persisted intent resumed by a runner (a persisted request, a lifecycle and a recovery policy, with a double-send hazard after a crash past `sendTx`); C, the intent in the popup (no record to show or cancel, dropped when the popup closes).
- **D46 The basis is the newest same-token Send-page `Tx.estimatedFee`.** It is the figure the readout showed for that send, and it exists for every submitted send. Rejected: an in-memory last estimate per token (a second source, empty after a restart, and the earlier send's estimate leaves with its popup); a fee on the journal record (persisted state beyond the cap); matching privacy, fee method and speed too (OA-13).
- **D47 The check compares the at-turn build's `getEstimatedFee`** with the cap, which is rounded down to six decimals. That figure is the committed max fee and at least what the network checks, so "for at most Y" holds whatever P6-10 decides.
- **D48 The ticket stays held during the re-ask; the slot does not.** Rejected: releasing the ticket. A later queued send would go out first, breaking "after your earlier send", and the accepted build would go stale.
- **D49 Accept reuses the re-ask build through `stash`/`tryConsume`, else rebuilds against the accepted fee (disputed).** Its value lands with P6-12 B: while the prepared cap still covers a risen price, "Send for X" sends exactly X, where a rebuild in a rising market (the usual cause of a re-ask) asks again. An attentive person answers within the 120 s TTL, since they watch the earlier send land. It also keeps the accept path within a composition case's reach. Rejected: a local validity check (a second copy of the ladder). Opus's view: drop it, since today's base-fee rung rejects any price change, a rebuild at an unchanged price gives the same X, and holding a signed request goes against "the wallet holds only the intent and the cap". Answer: that sentence covers the wait before the turn; the stash is the same 120 s cache every estimate uses, evicted on every exit.
- **D50 The re-ask wait ends at the send's own 60-minute deadline, as a cancel (OA-12).** Rejected: no bound, because the 90-minute heartbeat lease would let the reaper fail the record while the call still waits; and failing with `WAIT_LIMIT_MESSAGE`, whose words name an earlier send.
- **D51 The re-ask state is `queued` progress with `reask`, entered by `simulating → queued`.** Rejected: a new stage (every stage map, the reaper, the card's stage line and both schemas change); staying at `simulating` with a marker (Cancel, the reaper's grace and the stage line would all read the wrong stage).
- **D52 No separate pin of the ratified limits.** P9-04 ratified them as built; arc 4's tests exercise the 60-minute deadline through `ticket.remainingMs()`.
- **D53 A restart fails a queued or re-asked send** (`stuck_queued`, "Transaction failed"), as for every queued send today. A resume is Outline B's recovery policy, a plan change. The close-out files it as a closed `known-limit` issue (dedupe first).

The orchestrator's calls at arcs 2 and 5's start (2026-10-13; page 9 signed: #90 P9-01 = A, P9-02 and P9-03 accepted; #242 P9-05 approved as proposed). Arc 2 recorded these, its own decisions and its ask in parallel with arc 4, under the same numbers; when arc 4 merged `dev` they were renumbered D-orch-25 to D-orch-30, D54 to D57 and OA-15 (PR #373's body uses D-orch-14 to D-orch-19, D45 to D48 and OA-10).

- **D-orch-25 Fresh branches, two PRs.** Arc 2 branches `send-queue-activity-amount` from `origin/dev` and opens one PR against `dev` (`Closes #90`). Arc 5 branches `send-queue-activity-keyboard` from arc 2's branch, opens its PR (`Closes #242`) only after arc 2's loop converged and its PR is open, and rebases onto `origin/dev` once arc 2 merges.
- **D-orch-26 Only the signed words and looks ship.** P9-01 A exactly as § Arc 2 describes it; the P9-02 gap and the P9-03 notice as planned; P9-05's five items as proposed. A surface that would need another word or look goes to `OWNER-ASKS.md` in the "what ships now" form.
- **D-orch-27 Proportion.** A finding becomes a change only with its path written; a fix that adds persistent state, a lifecycle, a coordination protocol or a public contract stops for the orchestrator. Later review rounds verify.
- **D-orch-28 Screenshots close the loop.** The amount card with a long figure (USD mode, focused and at rest), the review sheet, the price-moved notice, and the fee card's two new buttons with their focus rings: both themes, both browsers, in the PR.
- **D-orch-29 E2E runtime budget.** An added e2e scenario names its failure mode, why a cheaper layer cannot prove it, and its measured runtime; the PR states the per-browser suite wall-clock before and after.
- **D-orch-30 Delivery hygiene.** Merge `origin/dev` before the final gates, never a union merge (`lessons.md` is at its budget). Commits and PR bodies name the model that ran.

Arc 2 as built (detail in `lessons/phase-2.md`):

- **D54 P9-01 A.** The USD field takes the token field's fit: one ruler holds whichever text the visible field shows, full size with focus, the largest scale that shows the whole figure at rest. The USD field gained the blur it lacked, so leaving it refits. In USD mode the meta line fills what the balance and Max leave, and the derived line, `nowrap`, takes the largest scale that keeps it on that room, with no floor, as signed. Token mode is untouched. At a ten-billion balance the line draws at 5-6 px: OA-15.
- **D55 P9-02.** The number sits in its own span, which carries the 4 px only beside a symbol; the ruler holds the same markup. Known limit (Opus), #367: in a band of about 4 px at or below the 60% floor, the trailing margin can carry the number's last character down with the symbol.
- **D56 P9-03.** `requoteReason(frozenUsd, liveUsd)` shares the gate's usable-quote predicate (`isUsableUsd`). A page test in `send.test.ts` drives the notice through the real gate.
- **D57 The USD fit's e2e lives in `send-amount-exact.test.ts`**, not `fiat-send.test.ts`: that file already mints the seven-figure balance and holds the token field's fit checks. It seeds a $1 quote before Send opens and adds one USD step: the field shows its whole figure, the derived line is one line clear of the balance, Max stays in the row, focus restores 40 px. Failure mode: a real layout that still clips or wraps, which jsdom's stand-in font cannot show. It fails on the base sources (40 px hidden, three lines, Max 28.6 px out). The 2.4 gate runs both files.

Arc 5 as built (detail in `lessons/phase-5.md`; numbered from D60 because the lane's parallel branches already take D45-D53):

- **D60 The two fee links are buttons on a path no flow shows.** They render only when the card's v-model holds the app's payment (`kind: "embedded"`), and nothing passes it one: for every app-paid operation the execute window shows the "set by the app" badge instead of the card (`OperationCard.vue`), and `approval-delta.ts` refuses an embedded pick. Built as signed: `<button type="button">` through `Flex tag="button"`, the accent `:focus-visible` ring, `refuseRepeatEnter` so a held Enter activates once. Pressing one unmounts it and focus falls to the page. OA-20 asks whether the path stays.
- **D61 Checkbox says it is a checkbox.** CLAUDE.md § Keyboard & focus order pairs keyboard activation on a `div` with its `role` and `aria-*`, so Space comes with `role="checkbox"`, `aria-checked` and `aria-disabled`. The scope chips already had `role="button"`. All three mark Enter and Space handled. Nothing a pointer sees changes.
- **D62 The degraded notice's region mounts with the card**, not with the method selector: a load error outlives a switch to the app's payment and back, and a region recreated with its text in place may stay silent. `FeeMethodRow` keeps its place after it.
- **D63 The listbox.** Nothing is highlighted until Down or Up; Down starts at the first row and Up at the last, both wrap; the highlight is held by its row, so it follows that row through a new list and goes when the row leaves it; the row scrolls into view (`block: "nearest"`). The list takes `tabindex="-1"`: a list that scrolls (four or more rows) is otherwise a Tab stop in Chrome and Firefox, and Tab must go from the field to the next control. The avatar's initials are hidden from screen readers, so a row reads as its name and address. Enter picks the highlighted row, the first when none is, as before. Escape with the list open closes it until the next input or focus and is marked handled (Chrome would close the toolbar popup); with the list closed it is left alone. The field carries `aria-controls` (the rows are not its descendants) and `aria-activedescendant`, both new optional `Input` props; the "Recipient Address" label names the list; ids come from `useId()`. No `combobox` role: unsigned (OA-21). The listener stays on `document`: Send has no ancestor key handler. `isComposing` joins the shared key guard, so an arrow may repeat but not compose.
- **D64 Arc 5's e2e.** 5.2 extends the suggestion scenario in `send-keyboard.test.ts`: three contacts seeded in storage make four rows, more than the list shows, then Down, Escape, Up to the last row (scrolled into view), Enter, and the Tab off the field. Failure mode: real keys on the native field that never reach the listener, an `aria-activedescendant` that never lands on the `<input>` through `AddressInput` and `Input` (the unit test stubs `AddressInput`), an Escape the page leaves unhandled, or a scrolling list that takes a Tab stop: only a browser lays out the scroll and decides the Tab order. Without the list's `tabindex="-1"` the step fails on Chrome: Tab lands on `send-destination-suggestions`. Measured: Chrome 7.5 s before, 7.0 s after; Firefox 14.3 s, 14.5 s (noise). For 5.3, `git grep -l send-fee-override apps/extension/tests/e2e` finds nothing; the file that drives a dApp send with its own fee payment is `network/tx-sendTx-feePayer.test.ts`, which sees the badge and never the card (D60). It runs as the gate names it, a regression check of that path.
- **D65 Shots.** No shipped flow renders the two fee buttons (D60), so their shots come from a scratch build (never committed) whose `OperationCard` mounts the fee card for an app-paid send, driven by a scratch network spec; "before" swaps `FeeSettingsCard.vue` back to arc 2's head. At rest, before and after are pixel-identical in the fee card on both browsers and themes: the only rows that differ are the two per-run addresses. The same run presses both buttons with real Enter and Space, and reads the ring (solid 2 px, offset 2 px, `--nulo-accent`). After a press focus is on the page; the next Tab goes to the method picker on Firefox, and past it to the priority row on Chrome (OA-20). The highlighted suggestion is shot from `send-keyboard.test.ts`, after the list's fade-in: a shot mid-fade shows the token card through it. 28 shots, `screenshots/5-*`.

## Audit verdicts

### Round 1 (plan v1): dual audit

**Codex** (gpt-6.1-sol, high, read-only, session `01a1238d-12f6-7f81-89e6-688c19af6a2e`): **reject**. Its blocking findings were the unsafe opaque narrowing, the re-queue admission and FIFO gaps, incomplete gate cleanup, and unapproved visible changes.

1. Medium. F2 and F12 overstated. **Accepted**: both facts corrected.
2. High. Re-queue escapes the caps, and requests without a record have no controller. **Accepted**: the kept reservation, plus a never-aborting signal (D1).
3. High. Foreign journal events cause side effects before any scope check. **Accepted**: side effects are scoped, with tests (D10).
4. High. D2 and D3 contradict each other. **Accepted**: the claim is narrowed, and OA-4 is added.
5. High. Re-queue breaks session FIFO across accounts. **Accepted**: a per-origin parked chain, with a test.
6. High. A probe can leak the slot, pre-claim failures strand records, and the chain guard is awaited under the slot. **Accepted**:
   - checks under the slot are synchronous;
   - reads are guard-free, bounded and outside the slot;
   - `transitionIfStage` fails `queued` and `pending` records;
   - the controller is reused.
7. Medium. A block height is not a block identity. **Accepted**: described as bounded lag mitigation, with the residual cases listed.
8. Medium. The floor trusts imported and future-dated rows, and the heartbeat has a gap. **Accepted**: in-memory observations (D7), and one heartbeat bracket.
9. Medium. Persist the spender actually used. **Accepted** (D5).
10. High. N-1 needs a decision, and `-32005` timing changes. **Accepted**: OA-3 added. The kept reservation removes late refusals.
11. High. The composition coverage exceeds what COMPOSITION-TESTS allows. **Accepted**:
    - the tip and reuse cases move to unit tests;
    - composition cases stop before the build;
    - the cases Codex listed are added.
12. High. Arc 3a's shared contracts are missing. **Accepted**: wallet-core types, a fenced finality update, and re-arming at boot.
13. High. Expiry alone cannot support "No fee was paid", and attempt metadata must survive JSON-RPC decoding. **Accepted**:
    - receipt-first evidence (superseded in round 2: chain time first);
    - the attempt count is read from a counting node after the throw;
    - a stop-and-ask condition.

What Codex said holds:
- Outline A is stronger than B.
- Persisting the fee spender is right.
- The 3a/3b split is sound once the contracts are specified.
- The scripts exist, and the titles fit.

**Opus** (Plan agent): **conditional approve**. Its conditions: bound and sanitize the gate; keep parked sends inside the caps and unable to starve the Send page; make N-1 a real ask; handle the silent path and pre-claim errors; never await a tip read while holding the slot or before the row exists.

1. High. A crafted backup row can hold sends for ever. **Accepted** (D7; observations live 60 s).
2. High. Caps, starvation, and a late `-32005`. **Accepted**: the kept reservation, and a waiter that blocks nothing.
3. High. The visible change needs an ask. **Accepted** (OA-3).
4. Medium. Silent-path records and pre-claim strands. **Accepted**.
5. Medium. An RPC under the slot or before the row exists. **Accepted**: synchronous checks; reads only outside the slot.
6. Medium. The heartbeat must cover the gate wait. **Accepted**.
7. Medium. The dApp estimate reuse has no epoch check. **Accepted** (Phase 1.3).
8. Medium. `requeueSlot` leaks the boundary; one take-turn helper. **Partly accepted**:
   - accepted: `runInSlot` owns the loop with `let release`, and re-entry happens in the origin's bucket;
   - rejected: the shared helper (D14).
9. Medium. The floor should be per key. **Accepted**.
10. Medium. The e2e plan is too narrow. **Accepted**:
    - the full Chrome network suite runs at both arc 1 gates;
    - the timeout is raised on A;
    - rapid-fire is dropped;
    - `queued` is asserted with mining held.
11. Low-Medium. Composition. **Accepted**, as Codex 11. The Phase 1.4 test is now a requirement: its side-effect case fails on the unfixed handler.
12. Low. `additionalScopes`. **Accepted** for the wait: the waiter enters each scope's line. The hold side goes to OA-4.
13. Low. The F2, F3 and D6 facts. **Accepted**: corrected.
14. Medium. The #109 re-poll must skip restored rows. **Accepted**.

What Opus said holds:
- Arcs 2-5's file claims are correct.
- Outline A is stronger.
- There is no double-send path.
- The fee spender closes #219 a.
- OA-1 is correct.

### Round 2: final fresh Codex pass on plan v2

**Codex** (gpt-6.1-sol, high, read-only, fresh session `01a123aa-a95f-7931-b905-9d1b907820c7`): **reject**. Its blocking findings were unsafe expiry evidence, incomplete finality recovery, gaps in who owns fee resolution, and unresolved scope cleanup. Every finding was verified against the source (2, 5 and 7 by direct read) and **accepted**:

1. High, round 1 #13 unresolved. Receipt-first expiry races an inclusion between the two reads. Fixed: chain time first, then the receipt; receipt retention and indexing are established before the copy ships, or the copy returns to OWNER-ASKS; an interleaved-inclusion test is added (D15).
2. High, round 1 #13 partly unresolved. The Aztec client synthesizes JSON-RPC errors for transport failures (F19). Fixed: per-call HTTP evidence from the counting transport; tests through the real adapter for a lost response, a malformed body, an HTTP refusal and a 200 refusal.
3. High, round 1 #12 unresolved. The finality contract was incomplete. Fixed: an inclusion record beside the terminal execution stage, a fenced method with the full set of moves (re-inclusion and reverted included), re-arm at boot, and tests through every state.
4. High, round 1 #6 and #9 partly unresolved. Fixed: post-grant awaits own the local release; an immutable FPC identity is pinned into fresh and reused builds; the reporting-only fallback is removed; a re-entry keeps the original deadline.
5. Medium, round 1 #3 partly unresolved. The snapshot path still cleared the task across networks (F21). Fixed: the scope predicate also covers snapshot ingestion and the terminal match; mount and reconnect tests are added.
6. Medium, new. The reservation needed an abort-chain rule. Fixed: the reservation is single-use and bound, and its disposal is separate from tail resolution; the H/R/S test is added.
7. Medium, new. Session end while parked contradicted the existing cancel path (F20). Fixed: both orders keep their existing outcomes, neither overwrites the other, and both are tested.
8. Medium (moderate confidence). Item 4 waits past the point where the decision ends a wait. Fixed: the lag gate became OA-5, not built until answered; arc 1 no longer ships it by default.

What Codex said holds:
- Waiters with empty key sets.
- Kept depth with the baton unchanged.
- In-memory observations, since restore emits no update.
- I2.
- No broadcast retry, and the single `node.sendTx` kept.
- Legal composition cases.
- The 3a/3b split.

### Round 3: resumed final pass (same Codex session) on plan v3

**Codex: reject.** The blocking findings were contradictory expiry instructions, a reverted receipt treated as terminal too early, and FPC validation lost by pinning. Findings 2 and 4-8 of round 2 are resolved. All findings are **accepted**:

1. High. Phase 3a.2 still said "receipt-first". Fixed: the phase reads chain-time-first, and its prerequisite now establishes indexing as well as retention.
2. High. A reverted receipt was treated as terminal even though it arrives before finality (`send-check.ts:20, 189-191`). Fixed: the execution `result` is kept separate from inclusion; a reverted inclusion is watched until final, can be pruned and re-included, and re-arms at boot. A reverted → pruned → re-included → final test is added.
3. High, new. Pinning bypassed the validation in `getFpcImpl` (ownership, protocol derivation after restart, the PrivateFPC guard). Fixed: the pin is the validated `Fpc` that `getFpcImpl` returns; `sequence()` resolves the same way; tests cover a forged PrivateFPC row and a sponsored fast path after a cold restart.
4. Low. `OWNER-ASKS.md` OA-1 still said that arc 1 ships item b. Fixed.

### Round 4: resumed final pass on plan v4

**Codex: approve** (high confidence). All four round-3 findings are resolved, and there is no new material finding. The plan stands as v4. Nothing is approved for implementation until the orchestrator says so.

### Arc 1 code, round 1: Codex (gpt-6.1-sol, high) and an Opus review, over `9574a9d..HEAD`

**Codex: no material regression** (high confidence). **Opus: no bug, nothing blocking.** Both answer the two lead questions the same way:
- Nothing new is awaited on the network under the slot: `getFpcImpl` reads storage and derives the protocol addresses from bundled artifacts.
- An imported row cannot reach the sequencer: `restore` refuses Pending rows, and only Pending rows are re-armed. A row forged straight into storage can only over-block, capped by `SUBMITTED_HOLD_MS`.

Accepted, comment and fixture changes only:
- the `deadline` and `remainingMs` docs say "the earlier of";
- the reuse comment says "since the estimate began";
- the `FeeStrategyContext.fpc` doc no longer names its caller;
- `payingFpc` is documented as `undefined` without an FPC;
- `TransferLine` and the `takeTurn` doc are tightened;
- `resolveStandardBuild`'s ladder enumeration gains the epoch;
- the composition header is shortened, and its mined row uses `TxStatus.Proposed` and `TxExecutionResult.Success` (a renumbered enum would otherwise give the send the `init` key, and the first case would pass on unfixed code);
- one narrating e2e doc clause is gone.

Rejected:
- **Uppercase protocol-sponsor row reads as a spender** (`fpc/service.ts` `decorate`, inherited). It errs toward over-ordering only. The fix belongs to the FPC path that fees-and-sponsors owns.
- **Two fixture-helper docs in the tests.** They state the scenario each helper models, which the helper's name does not.
- **A non-protocol PrivateFPC row now throws in `sequence()`, before the journal record exists** (Opus, no fix asked). It fails closed, and the estimate already refuses that row before Send enables.

**Round 2 (resumed Codex session): no new material finding.** It upheld every rejection and corrected one rationale: with a renumbered enum, the second case would still fail on its key assertion. The loop stops here.

### Arc 3a code, round 1: Codex (gpt-6.1-sol, high) and an Opus review, over `8d01f9b..HEAD`

**Codex: one medium, the rest low. Opus: no high, one medium.** Both answer the lead questions the same way:
- No path writes `expired` for an included or includable send. The finalized time must be strictly past the expiry, the read is anchored by number and hash, and genesis anchors are excluded.
- No false final or false prune: every read is pinned to the finalized block.
- No backup reaches the worker's dial: restore and export strip the marker.
- No hash, address, URL or nullifier reaches a log line.
- `sendTxTask` is unchanged.

Accepted:
- **Medium (Codex).** A lock, purge or stop between a proof's reads let the next read go out. The proofs now check the caller's liveness before every read. Two tests fail when it is ignored.
- **Medium (Opus).** Nothing showed that an included send's recorded nullifier is in the real nullifier tree. The network e2e now reads it at the finalized block after a public send is Finalized.
- **Low.**
  - `unconfirmed` never becoming mined is pinned.
  - Archive fixtures are wire-shaped.
  - A test title is fixed.
  - The e2e card read waits for state.
  - Comments: a plan tag, the first-nullifier rule, a narrating class doc, two redundant docs.

Rejected:
- **A lagging upstream re-answers a pruned block** (Opus, low): accepted as a bounded flap in D23.
- **Inherited hash-prefix log lines in `transaction/service.ts`** (Codex): they predate the arc.
- **A forging RPC** (Codex, trust note): outside the model. The proofs hold against lagging or forked upstreams.

**Round 2 (resumed Codex session): the fixes hold, no runtime finding.** It judged the e2e's empty L1 mining sound and harmless. One low remained: review provenance in three inherited comments and one narrating doc, both removed. The loop stops here.

### Arc 3b code, round 1: Codex (gpt-6.1-sol, high) and an Opus review, over `39b50d82..f575ab8d`

**Codex: no high, one medium. Opus: no high, two medium.** Both found nothing material in the requeue path: no send goes out twice or skips a predecessor, every throw past the grant gives the slot back, the journal lock orders the requeue before a failure or cancel that follows it, and cancel, the session-end sweep and the reaper all handle a requeued row. No new log leak, no dApp response change, `sendTxTask` unchanged.

Accepted:
- **Medium (both).** The action row as a plain footer lifted the snack above every point it reached: mid-screen while the card was below the fold, and off the top of the screen with several cards or a scrolled feed. Now a listed row (D35). Unit tests pin the cases; the network e2e reads every position after the snack measures again, with the hit, on-screen and resting-place checks.
- **Medium-low (Opus).** "Preparing..." could show before a send's record existed, then flip to "Queued...". The Send-page task card now names no stage without a running step or its record (D36).
- **Low.**
  - A failed snapshot was never retried while the port stayed up (Codex): retried on the fence (D36), tested reject-then-succeed and dropped on a scope switch.
  - The switch block counted a stamped send with no network active (Opus): D43.
  - The smoke spec's colour and amount checks could pass vacuously (Codex): they now assert the record identities, a real colour and the exact figure.
  - Comments (Codex): two removed, the requeue handler's reworded.

Rejected:
- **`→ queued` allowed for every record kind** (Opus, low): the FSM is kind-agnostic, only the transfer executor takes the edge, and the dApp queue belongs to arc 1b (D37).
- **`await requeued` in the claim is redundant** (Opus, low): the lock orders the writes, but the await makes a failed requeue fail the claim with its own error instead of an illegal `pending → pending`.
- **The fallback card's skeleton** (Opus, low): that placeholder never knows its stage; the skeleton is C9's look for an unknown value (D36).
- **`TxHashRow` not on the received page** (Opus, low): D34.
- **A settled send's figure and the token order for unknown decimals** (Opus, low): UI calls outside the signed list, OA-8 and OA-9.
- **A multi-card network e2e** (Codex): the climb past several rows and the off-screen fallback are unit-proven; a browser case would need several unfunded dApp sends held at once.

**Round 2 (resumed Codex session): one medium.** An unmount while the mount awaited its task snapshot let the mount resume and begin a fresh journal run, whose failed read on the disconnected client then retried every 2 s. Accepted: the mount begins its run before its awaits, and a stale run reads nothing; a test defers the task snapshot, unmounts, and sees no journal read or retry. It found `clearListed` terminating, the plain footer and sheet rules intact, the scope-switch retry fenced, and the tightened e2e checks closing the reported gaps.

**Round 3 (resumed Codex session, the last): one medium, caused by round 2's fix.** With the mount's journal run stale after a scope change during its awaits, a recent terminal record could land before its task, the task land second, and no reconciliation run: the card of a send that had already ended stayed up. Accepted: the task snapshot reconciles too, so whichever lands second clears the match. A test lands the terminal record first and fails without the line. The unmount fix otherwise held, and the first connect starts a replacement read rather than losing the snapshot. The loop reached its three-round cap with this fix unreviewed, so the orchestrator asked for a fourth round.

**Round 4 (resumed Codex session, over the round-3 fix and the whole arc against `origin/dev`): one finding, low and high confidence.** Matching is by kind and token only, so a recent ended record of an EARLIER send of the same token could clear a later send's running task. The journal-side scan always could; round 3's task-side call added the order where the task lands second, and the event path could do the same to concurrent same-token sends. The later send's record card and Cancel stayed, but its task was gone for good: its running-step line, and its card before its record existed. Accepted: `isOwnTerminalRecord` refuses a record created before the task (a task's record is written after the task starts, and tasks live only in the worker's memory), and both reconciliation paths use it. Three component cases (journal second, task second, the event) and two unit cases fail without it. A narrating comment in `status-icon-fill.ts` was removed and the reconciliation comment tightened. Nothing else material in either diff: no ordering, slot, log, dApp-response or assertion regression, and no unsigned look.

**Round 5 (resumed, over the round-4 fix): no material finding.** Codex found the chronology check sound for every supported lifecycle. A backward wall-clock step between the two stamps can only delay a clear until TaskService's own completion event; it strands nothing. **The loop converged here.**

### Arc 2 code, round 1: Codex (gpt-6.1-sol, high) and an Opus review, over `e900f710..22765f13`

**Codex: approve** (session `01a136cb-cf50-73b2-899f-c303f0021659`). **Opus: approve.** Both found no visible change beyond the three signed items, no wrong-scale path (focus and blur, the swapped inputs, a lost quote, Max in USD, the skeleton, a late balance, fonts), `requoteReason` fed the gate's own values, and nothing that changes what is sent or weakens an assertion.

Accepted, comments only:
- two narrating comments removed (Codex), and a test comment that pointed at the PR's shots reworded (Opus);
- the derived ruler states why it sits inside the meta line (Opus).

Rejected:
- **The quote seed hides the unpriced layout** (Opus, low): the priced row gives the field less room, so the fit checks are at least as strong, and the file never pinned the unpriced room.

Known limit: the trailing-margin band (D55), filed closed as #367.

**Round 2 (resumed Codex session, over the comment fixes): approve, no new finding.** It upheld the rejection and the known-limit call, and compiled AmountCard's template both ways: identical production render code. **The loop converged here.**


### Arc 4 plan, round 1: dual audit (2026-10-13)

**Codex** (gpt-6.1-sol, high, read-only, session `01a136ec-26d6-7ea0-ac28-0dcf8166c141`): **conditional approve**. Outline A is the strongest; B brings recovery and double-send obligations, C loses Home and cancel. Findings, each verified against the tree:
1. High, demonstrated: the e2e case could not queue. Public-to-public sends on Public Fee Juice hold no sequence keys (`transfer-sequence-keys.ts:22-31`). **Accepted**: two private sends of one token to one recipient, on Public Fee Juice.
2. Medium, demonstrated: the basis read other profiles' rows (Tx rows of one address span same-seed profiles; `profileId` is stamped) and accepted a 78-digit fee whose cap the RPC refuses. **Accepted**: the profile stamp, no `ambiguous` rows, `isFeeAmount` on the basis, the cap and both RPCs.
3. Low: `evict` exists; the payer needs `isProtocol` and an adapter to `payerKindOf(settings, payer)`. **Accepted** (the driver found `evict` too).
4. Medium, plausible: an accept could arrive before its waiter existed; an already-aborted signal; publication through the swallowing `markJournal`. **Accepted**: register first, publish through the throwing transition, clean up on failure.
5. Medium: the races need the real journal lock; the cancel spike's carve-out reaches them. **Accepted**: the composition cases.
6. Medium, plausible: the executor's frame could hold the build past the TTL. **Accepted**: the frame returns only `{ stashId, fee, payer }`.
7. Low: I6 and I8 overstate. **Accepted**: I8 narrowed; the e2e closes and reopens the popup. A long unattended wait stays unproven.
8. Medium: the lapse as "Cancelled" is the owner's (OA-12, already there); the half-up X is a sub-micro-FJ known limit. **Accepted** as written.

**Opus** (Plan agent): **conditional approve**. Findings:
1. High, plausible: a second pass's slot grant had no owner on a throw. **Accepted**: one mutable release holder, released in `finally`.
2. Medium: drop D49. **Rejected** (D49 records both views): its value lands with P6-12 B, and it keeps the accept path composable.
3. Medium: composition applies. **Accepted** (as Codex 5).
4. Medium, plausible: the executor's own moves could lose to a × and surface a failure on a "Cancelled" card. **Accepted**: all three follow `claim`'s rule; the waiter registers first.
5. Medium: deadline interactions. (b) and (c) **accepted** into OA-12. (a), mapping a late accept's slot-wait expiry to a cancel, is **rejected**: after the accept the send waits for an earlier send or the slot again, which is what the ratified "An earlier send of this account is still in flight" says.
6. Medium: OA-13 left out speed. **Accepted**.
7. Medium: e2e determinism. **Accepted**: a `speed` field, the cap line asserted, recorded fee at most the accepted one, accepted again up to three times.
8. Low: the spent-token answer, the self-paid helper with no method, the sheet closing on a fee change, future-dated rows, the three "Queued..." tests. **Accepted**. Rounding X up is **rejected** (a format change; Codex 8's known limit). A pause on "Send for X" is **OA-14**.
9. Low: complexity. **Accepted**: `askAgain`.
10. Low: interfaces. **Accepted** (as Codex 3); the ninth positional argument stays, since the transport keeps `undefined` by arity.
Facts: F23's citation and the stale F11 are corrected.

### Arc 4 plan, round 2: final fresh Codex pass (2026-10-13)

**Codex** (gpt-6.1-sol, high, read-only, new session `01a136fc-cea6-75f1-a013-fb12eca022cf`): **conditional approve**, then **approve** on resume. It keeps D49 (P6-12 B is the substantive reason, the shared ladder the simpler one) and Outline A, and holds D53, the deadline, the rounding limit and OA-10 to OA-14 as settled. One finding:
1. Medium, demonstrated: `fromReusedEstimate` (`transfer-executor.ts:487-512`) drops the entry's `chainIdentity`, `fpcIdentity`, epoch and `builtAt`, so a reused build re-stashed above the cap could never be consumed again, and the composition control would have crossed into a fresh build. Re-stashing with `builtAt: Date.now()` and the stash-relative drop timer (`estimate-reuse-shared.ts:136-142`) would also have renewed a signed request's retention. **Accepted**: the reused arm keeps the consumed entry, a re-stash keeps its `builtAt`, the cache times its physical drop from `builtAt` (every caller stashes at build time), plus a fake-clock executor case and a cache case. The resume verified the fix and found nothing new.

### Arc 4 code: Codex (gpt-6.1-sol, high) over three rounds and an Opus review, over `c629d335..049d1144`

Session `01a1373c-806c-7fe0-ac72-e7e6f67e5a21`. Both answered every lead question "no path found", with traces: nothing proves or broadcasts above the cap shown or accepted, an accept resumes one execution once, the slot is released before the question and on every exit, no record or waiter is stranded, a stale fee resumes nothing, the ticket keeps a later key-sharing send behind, the stash is evicted on every exit and never renews `builtAt`, and the queued answer reads only storage. No log line or dApp-facing change.

**Round 1. Codex: conditional approve. Opus: conditional approve.** Accepted:
- **Medium (Codex).** An accept after the deadline, before its timer fired, resumed the send into a wait-limit failure instead of the cancel OA-12 decides. `QueuedFeeAnswers.accept` refuses past the deadline and settles `expired`.
- **Medium (Opus).** The re-ask sheet unmounted on close, so focus fell to `body`. It draws a snapshot taken at open and stays mounted; a press on a closed sheet accepts nothing; a record it cannot draw opens no slot; a scope switch drops it.
- **Low.** A false "nothing is signed" header; the `cap` doc; `isFeeAmount` moved into `@nulo/wallet-core/jobs`; four comments.

Rejected: an accept a few milliseconds before the deadline still fails with the earlier-send wording on its next wait (Opus, low). It needs a press in the last instant of a 60-minute wait, nothing is sent, and mapping it adds a branch to the turn's error path.

**Round 2 (resumed). Conditional approve.** The product fixes verify. Two e2e mediums accepted: the case read the journal through the page `reopen` had closed, and `expectEstimateQueued` passed with no Send button (weaker than base).

**Round 3 (resumed), after `origin/dev` was merged (#373, #379). Approve, no new finding.** The merged review sheet keeps one fee block (unvouched, re-ask, cap, ordinary) and arc 2's number span in both the line and its ruler. The loop stops here.

Known limits: a restart while queued or asking fails the send (D53); the re-ask line can read X and Y equal at six decimals. Both are filed closed: #380, #381.

### Arc 5 code, round 1: Codex (gpt-6.1-sol, high) and an Opus review, over `5523126b..c70ae5c1`

**Codex: approve** (session `01a13734-acf5-7972-a1e7-f64b3ee5cb7a`). **Opus: approve.** Both confirmed D60 (no flow renders the two fee buttons), the degraded region empty before its text on every path, Escape handled only while the list is open, and no key that picks a destination nobody chose through Escape, another control, a held or composing Enter, the blur grace or the press hold.

Accepted:
- **The scrolling list is a Tab stop** (Opus, low-medium): four or more rows overflow the 160 px list, which Chrome and Firefox make a Tab stop, so Tab from the field landed on it and focus fell to the page when it closed. The list takes `tabindex="-1"`; the e2e now seeds four rows and checks Tab leaves the list.
- **The highlight was held by position** (Opus, low): a row loading in ahead of it reset the highlight, and Enter then took the first row. It is held by its row now; a unit test drives the reorder.
- the avatar's initials and the degraded notice's icon are `aria-hidden` (Opus, low);
- an Enter after Escape picks nothing: asserted (Opus, low);
- comments: the Escape `preventDefault` and the first-row fallback say why (Opus); two comments that restated their code removed (Codex).

Rejected:
- **The fee-button unit test does not prove native activation** (Codex, low): no flow renders the buttons (D60), so no committed e2e can press them; the scratch shot run presses them with real Enter and Space on both browsers (D65).

To the owner: the `combobox` pattern for the field (Opus, low), OA-21.

**Round 2 (resumed Codex session, over c060277c): approve, no production finding.** It confirmed the row-identity highlight (candidate objects survive Send's recomputes; two rows sharing an address stay distinct), that a press on a row still picks it before the list unmounts, and the rejection above. Accepted, e2e only: the Tab check asserts the next stop, the token card, since focus falling to the page would also pass a check that only rules out the list; the scenario waits for the four rows, since contacts load after the field already suggests the account.

## Seeds

Draft until the orchestrator approves; no ELI5 is produced (orchestrator-owned).

**Recommended: `/goal`**

```
/goal Every phase of implementations-plan/send-queue-activity/plan.md whose gate is open (Arc 1 now; Arc 1b only after OA-3 is answered A or B; Arcs 2 and 5 only after page 9 is signed, Arc 5 also after Arc 2; Arcs 3a and 3b only after page 10 and C9, C12-links are signed, Phase 3b.4 step 2 only on OA-1 = A; Arc 4 only after the orchestrator approves its 2026-10-13 re-plan) is marked ✓ in plan.md, each ✓ backed by its validation gate reported passing in the transcript; for each phase the agent printed LESSONS_FILE=implementations-plan/send-queue-activity/lessons/phase-N.md; /code-review was NOT run (code_review is off); the Codex fix loop converged for each built arc and for the final cross-arc pass, each convergence quoted from a resumed Codex pass reporting no new material finding; the § Delivery stack exists on GitHub, created only after the loops converged (gh stack view in the transcript), including the close-out layer that archived the plan (git show --stat of the archive-move commit); bun run test and bun run lint both report exit 0 in the transcript.
```

**Alternative: `/loop`**

```
/loop 15m Drive implementations-plan/send-queue-activity forward. Never idle. Each firing: 1) Reality check: read plan.md, STATUS.md and lessons/ from the top stack layer; if implementations-plan/archive/send-queue-activity/plan.md exists on origin/dev (git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/send-queue-activity/plan.md), run agent-worktree done send-queue-activity --merged, report, clear this loop and stop; if the close-out is delivered but not merged, babysit CI only. 2) Pick the next open phase whose owner gate is signed (Arc 1b: OA-3 = A or B; Arcs 2, 5: page 9; Arcs 3a, 3b: page 10 with C9, C12-links; Arc 4: the orchestrator's approval of its re-plan); never build a gated phase early. 3) After each edit run bun run lint and the touched tests; commit signed. 4) Phase green means its gate in plan.md passes: paste it, mark ✓, write lessons, print LESSONS_FILE=…. 5) Network e2e: one e2e:agent on the host until #169 merges. 6) At an arc boundary run the Codex loop per § Post-implementation (hard stop at three rounds), then gh stack add. 7) Stuck or facing a design fork: consult Codex (gpt-6.1-sol, high), log it, decide; anything a person would notice goes to OWNER-ASKS.md, never decided here. 8) All built arcs looped: final cross-arc pass, Delivery, close-out, report and stop. Hard limits: never merge, never push to main, never --admin, never force-push a pushed branch another human touched.
```
