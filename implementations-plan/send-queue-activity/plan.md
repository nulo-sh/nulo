---
plan: send-queue-activity
tier: mid
status: approved v4 (orchestrator); arc 1 in progress (Phases 1.1, 1.3-1.5; 1.2 waits on OA-5)
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

Live progress: [STATUS.md](STATUS.md). Owner questions: [OWNER-ASKS.md](OWNER-ASKS.md). Recon: [recon.md](recon.md).

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
| #217 | 4 | page 9 P9-04, hold H3 | arc 4 merges |
| #220 | 4 | charter C6, ci-release-supply's `nightly.yml` arcs | arc 4 merges |
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

In: the sixteen issues above, as the issue map says. Out: #244 (no arc); confirm-now-send-later (#217 item 1, not built per P9-04); a pending-aware PXE simulation (an upstream change); two public spends that together overdraw a balance (out of scope since the archived concurrent-sends plan); any change to the session-FIFO baton or to dispatch timing (dapp-ingress-grants, H1); a hold on a submitted dApp tx wider than its recorded keys (OA-4).

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

### Arc 4: queued-send rule and chaos criterion (after page 9 P9-04 and C6; hold H3)

- **#217 (P9-04 approved as proposed).** Item 1 builds nothing. The arc pins what the page ratifies: export `WAIT_LIMIT_MESSAGE` from `transfer-executor.ts` and assert its exact text in `transfer-executor.test.ts` (the test today repeats the literal); assert `SUBMITTED_HOLD_MS === 600_000` and `MAX_WAIT_MS === 3_600_000` in `send-sequencer.test.ts` under names that say the owner ratified them. The third answer (a failed public send and private balance) has no string in the tree: nothing to pin, said on the page (OA-2). On "Change", re-plan from the note.
- **#220 (C6).** Option A: a row in CLAUDE.md § Staged-rollout switches for `network-e2e-chaos` and `network-e2e-chaos-firefox`: advisory by default; eligible after 30 consecutive green nightlies, a red resetting the count; eligibility is never authority; the owner promotes by adding the job to `status`'s `needs` with the `behavior-gating.test.ts:620-645` pin changed in the same commit; a lane that cannot reach 30 gets a bug issue and is never dropped to turn a run green. A one-line pointer in `CI.md` near `:122` and a comment on the two jobs in `.github/workflows/nightly.yml`. Option B or C: the row says that rule instead. After ci-release-supply's `nightly.yml` arcs merge.

**Arc 4 file map.** `apps/extension/src/wallet/services/execution/{transfer-executor.ts, transfer-executor.test.ts, send-sequencer.test.ts}`, `CLAUDE.md`, `CI.md`, `.github/workflows/nightly.yml`.

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
- **Arcs 2-5.** These are UI only and sit behind signed pages.
  - Arc 3a records attempt counts, never response bodies, in progress and logs, and never re-polls a restored row's stored endpoint (D16).
  - Arc 3b's explorer link contacts nothing until it is tapped, and disappears under explorer None (C12-links).

## UI impact

- **Arc 1: no new copy, layout or state.** It restores the owner's concurrent-sends rule after a restart, so the existing "Queued..." card and "Queued behind your previous send" row appear on a Send-page send that uses the same private fee contract as a pending one (OA-3 item 3; ships under the archived decision). A terminal event or snapshot row from another profile or network no longer removes the current awaiting card or task.
- **Phase 1.2 (OA-5):** on a multi-endpoint network, the same states show for up to 60 s on a send whose predecessor's block the PXE's node lacks. Built only on OA-5 = A.
- **Arc 1b (OA-3):** while the account's earlier sends are unmined, a dApp send waits at "Queued..." ("Preparing..." on the silent path). The dApp's answer arrives later, and later requests of the same dApp wait behind it.

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
- **F11** The FSM has no `pending → queued` edge (`packages/wallet-core/src/jobs/fsm.ts:43-44`).
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

### Inferences

- **I1** The PXE runtime's node is the node the PXE syncs from (`chain-runtime.ts:179`). Its proposed tip therefore bounds what the next simulation sees, short of a reorg. To be verified in Phase 1.2 step 1.
- **I2** A session belongs to one origin, so keeping parked requests in per-origin order preserves per-session FIFO. `hooks.originKey` is `ctx.origin` (`packages/wallet-bridge/src/dispatcher.ts:520`). Phase 1b.1 step 1 confirms that a session's `ctx.origin` cannot change.
- **I3** The composition harness can compose the real `ExecutionLane`, `ExecutionMutex`, `SendSequencer`, `OperationJournalService` and `TransferExecutor` with no PXE call, provided every case stops before the build. Any case that would reach the build becomes a unit test instead.
- **I4** No existing network e2e expects a dApp send to start while a Send-page send of the same account is unmined. Phase 1b.3 runs the whole Chrome network suite to prove it.
- **I5** On OA-3 = A, both sends in `concurrent-sendtx-confirm.test.ts` confirm. On B the file is unchanged.

### Asks

- **A1 (OA-1)** #219 c changes what the awaiting card reads. Working assumption: as is until answered.
- **A2 (OA-3)** Arc 1's restored restart wait ships under the archived decision. #218's dApp wait is built only on A or B.
- **A5 (OA-5)** The lag gate waits past the receipt settling, where the archived decision ends a wait. Working assumption: not built until answered.
- **A3 (OA-4)** A submitted dApp tx keeps today's narrow hold. Working assumption: as is, with the correctness claim narrowed to match.
- **A4 (OA-2)** P9-04's third "ratified string" does not exist as copy. Working assumption: arc 4 pins the two that exist.

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

#### Phase 2.1: long figures in USD mode (P9-01)

1. Build the option the owner chose, as § Architecture describes it. On "As is", build nothing and record it.
2. In `AmountCard.test.ts`: for A, a long figure gets a scale below 1 on both the field and the derived line, and `$25.00` keeps 1 (control); for B, the derived line carries the ellipsis styles and the field keeps its size; for C, `send-amount-derived` sits in the new row and the meta row keeps Max and the balance.

**Validation gate.** Commands: `bun run lint`; `bun run typecheck:all`; `AmountCard.test.ts` as a single test file. Pass: all exit 0. Layers: lint, typecheck, unit.

#### Phase 2.2: the review line's gap (P9-02; unless struck)

1. Move the 4 px gap in `SendReviewSheet.vue` to the number's end.
2. Assert the new rule in `SendReviewSheet.test.ts`.

**Validation gate.** Commands: `bun run lint`; `SendReviewSheet.test.ts` as a single test file. Pass: both exit 0. Layers: lint, unit.

#### Phase 2.3: "price moved" only when it moved (P9-03; unless struck)

1. Add `requoteReason` to `send-fiat-gate.ts`; read it in `send.vue`.
2. In `send-fiat-gate.test.ts`: a live quote equal to the snapshot gives `stale` (never-happens: `moved`); a different one gives `moved` (control); no live quote gives `stale`.

**Validation gate.** Commands: `bun run lint`; `bun run typecheck:all`; `send-fiat-gate.test.ts` as a single test file. Pass: all exit 0. Layers: lint, typecheck, unit.

#### Phase 2.4: arc 2 end-to-end gate

**Validation gate.** Commands: `bun run test`; `bun run test:all`; smoke on Chrome and Firefox (`cd apps/extension && bun run test:e2e -- --retry=0`, then the same with `NULO_E2E_BROWSER=firefox`); network Chrome `tests/e2e/network/fiat-send.test.ts` (USD mode lives there). Pass: all exit 0; the PR attaches before and after screenshots of the amount card at rest and focused and of the review sheet, both themes, both browsers. Layers: unit, smoke e2e, network e2e.

### Arc 3a: send outcome states (after page 10; H7 on #108 and #112)

#### Phase 3a.1: refused on the first attempt (#112, P10-05)

1. Prove how a node refusal surfaces (a 4xx, or an error body in a 200) through the aztec.js JSON-RPC client, with a unit test against the real fetch wrapper; record it in lessons. If a refusal cannot be told from a transport failure, stop and return the limit to OWNER-ASKS.
2. Add the wallet-core fields; add the per-send counting node; read the count after a throw in `sendTxTask` (its single `node.sendTx` and the legal-guard order unchanged); add the `refused` outcome and its copy; keep a retried refusal on today's check.
3. Tests, through the real Aztec client adapter: an HTTP refusal and a 200 with an error body read as first-attempt refusals (control); a lost response, a malformed body and a timeout never do (never-happens), nor does a refusal after a second POST; `call-sites.test.ts` still passes unchanged (never-happens: a second `node.sendTx`); `send-check.test.ts` (a first-attempt refusal is not watched; a retried one is, control); `journal-state.test.ts` (the exact P10-05 strings); no response body reaches progress or a log line.

**Validation gate.** Commands: `bun run lint`; `bun run typecheck:all`; `bun run test`; `bun run test:all`. Pass: all exit 0. Layers: lint, typecheck, unit.

#### Phase 3a.2: expired before inclusion (#108, P10-06)

1. Locate the expiry field on Aztec 6.0.0-rc.1's proven tx, and establish whether a node can forget an included tx's receipt (retention) or answer before indexing it (indexing); record both in lessons. If either can happen, stop and return "No fee was paid" to OWNER-ASKS.
2. Record the expiry with the hash at submission; add the chain-time-first `expired` verdict and its copy.
3. Tests: `send-check.test.ts`: chain time one second before expiry keeps today's verdict (never-happens: `expired`); past it with no receipt gives `expired` (control); a tx included between the two reads is read as `sent`, never `expired` (never-happens: the receipt is read after the chain time); a read error keeps today's verdict; a row with no recorded expiry never becomes `expired`. `journal-state.test.ts`: the exact P10-06 strings.

**Validation gate.** As Phase 3a.1. Layers: lint, typecheck, unit.

#### Phase 3a.3: went through until final (#109, P10-07)

1. Add the finality watch to `send-check.ts` and the slow re-poll of mined rows below Finalized to `TransactionService`; a pruned block returns the row to checking or Pending.
2. Add the inclusion record, its fenced method and its re-arm at boot.
3. Tests: `send-check.test.ts` (inclusion → pruning → re-inclusion → finality, for a successful and for a reverted receipt; a reverted inclusion keeps being watched until final; a restart in each state resumes the watch); `operation-journal/service.test.ts` (every disallowed move and a stale `updatedAt` are refused, never-happens; each allowed move is applied once, control; the execution stage never changes); `transaction/service.dropped.test.ts` (a mined row this worker settled is re-polled until Finalized, then not; a restored mined row is never polled, never-happens); `journal-state.test.ts` (the exact P10-07 strings).

**Validation gate.** As Phase 3a.1. Layers: lint, typecheck, unit.

#### Phase 3a.4: arc 3a end-to-end gate

**Validation gate.** Commands: unit layers as 3a.1; network on Chrome and Firefox: `tests/e2e/network/failed-send-check.test.ts` with new cases for a first-attempt refusal (`interceptRpc` on the node's `sendTx`) and a send that went through before finality; smoke on Chrome and Firefox. Pass: all exit 0; screenshots of the History card and detail for each new state, both themes. Layers: unit, network e2e, smoke e2e. If the harness cannot advance chain time past an expiry, the expiry stays unit-proven and the PR says so.

### Arc 3b: feed surfaces (after page 10, C9, C12-links; R1, R2, R5)

#### Phase 3b.1: one scope rule (#209, P10-11)

1. Export `journalRecordInScope` from `utils/activity-rows.ts`; use it on the four surfaces.
2. Tests: `activity-rows.test.ts` (one case per rule: stamped and active, stamped and inactive, no active profile, unstamped); `journal-detail-scope.test.ts`, `TokensView.test.ts`, `activity.test.ts` updated.

**Validation gate.** Commands: `bun run lint`; `bun run typecheck:all`; `bun run test`. Pass: all exit 0. Layers: lint, typecheck, unit.

#### Phase 3b.2: no guessed decimals (#103, P10-10) and no fake 0 (#213, P10-09)

1. Move each site to `knownDecimals`; treat an empty `amountRaw` as absent.
2. Tests per site: an unknown-decimals token shows no figure (never-happens: a figure); a known one shows as today (control). Update the `RecentActivityView.test.ts` fixtures that lack `hasDecimals`.

**Validation gate.** As 3b.1. Layers: lint, typecheck, unit.

#### Phase 3b.3: failed-send surfaces (#110, P10-01..04)

1. Build the P10-01 option chosen; P10-02 unless struck; P10-03 with the extracted `TxHashRow`; reproduce P10-04, then fix it only if it reproduces.
2. Tests: `toast.test.ts` and `ToastManagerBase.test.ts` (option A), `send-submit.test.ts` (the kind), `recent-activity-rows.test.ts` (P10-02: the failed record hides only when a settled row carries the same hash; control: a different hash keeps it), `journal/[id].test.ts` (hash row and link; none under explorer None), `snack-placement.test.ts` (P10-04).

**Validation gate.** As 3b.1. Layers: lint, typecheck, unit.

#### Phase 3b.4: the awaiting card on reopen (#122, P10-08) and #219 c (on OA-1 = A)

1. Draw the stage line as the loading skeleton until the stage arrives.
2. On OA-1 = A: add the FSM edge; move a waiting `pending` transfer row to `queued` and claim it back.
3. Tests: `RecentActivityView.test.ts` (the hydration case now requires the skeleton, never a wrong stage); `TransactionAwaitingCard.test.ts`; on OA-1 = A, `fsm.test.ts` and `transfer-executor.test.ts` (a send that starts waiting after creation reads `queued`, then leaves it once).

**Validation gate.** As 3b.1. Layers: lint, typecheck, unit.

#### Phase 3b.5: status colours (#243, P10-12, P10-13)

1. Add the `fill--txt-*` utilities (`token-contract.ts`, then `bun run --cwd packages/design gen:tokens`); use them in `TransactionTerminalCard.vue`; set the dark `--txt-danger`.
2. Tests: `theme-contrast.test.ts` asserts the icons at 3:1 on the light page and the dark red text at 4.5:1 on page, hover and pressed; the drift tests pass.

**Validation gate.** Commands: `bun run lint`; `bun run typecheck:all`; `bun run test:all`. Pass: all exit 0. Layers: lint, typecheck, unit.

#### Phase 3b.6: arc 3b end-to-end gate

**Validation gate.** Commands: `bun run test`; `bun run test:all`; smoke on Chrome and Firefox; network on Chrome and Firefox: `snack-placement.test.ts`, `failed-send-check.test.ts`, `account-switch-isolation.test.ts`, and on OA-1 = A `same-token-concurrent-sends.test.ts`. Pass: all exit 0; screenshots of every surface the page names, both themes, both browsers. Layers: unit, smoke e2e, network e2e.

### Arc 4: queued-send rule and chaos criterion (after P9-04 and C6; H3)

#### Phase 4.1: pin the ratified ordering choices (#217)

1. Export `WAIT_LIMIT_MESSAGE`; assert it and the two constants exactly.

**Validation gate.** Commands: `bun run lint`; `bun run typecheck:all`; the two test files as single test files. Pass: all exit 0. Layers: lint, typecheck, unit.

#### Phase 4.2: record the chaos rule (#220)

1. Add the CLAUDE.md row, the `CI.md` pointer and the `nightly.yml` comments for the chosen C6 option.

**Validation gate.** Commands: `bun run test:ci-gating`; `bun run lint:actions`; `bun run check:plans`; network Chrome `same-token-concurrent-sends.test.ts` (proverless, as Phase 1.5). Pass: all exit 0. Layers: CI gating, network e2e.

### Arc 5: keyboard reach (after P9-05 and arc 2)

#### Phase 5.1: buttons, Space and the live region (items 1, 3, 4, 5)

1. Make the two fee links buttons; move `isRepeatOrComposing` into `@nulo/design` and re-export it; add Space to the three controls; mount the degraded notice's region empty; hide the compact label.
2. Tests: `FeeSettingsCard.test.ts` (buttons, Enter and Space activate once, a repeat does nothing; the region exists before its text); `Checkbox.test.ts` (≥ 5 cases, L2 rule); `ScopeAddress.test.ts`, `ScopeClassId.test.ts`; `CollapsingHeroLayout.test.ts`.

**Validation gate.** Commands: `bun run lint`; `bun run typecheck:all`; `bun run test`; `bun run test:all`. Pass: all exit 0. Layers: lint, typecheck, unit.

#### Phase 5.2: the suggestion listbox (item 2)

1. Add the listbox roles, the highlight and the keys.
2. Tests: `RecipientField.test.ts` (Down and Up move the highlight, Enter picks it, Escape closes, Tab leaves the field with no stop on a row); a smoke case in `send-keyboard.test.ts`.

**Validation gate.** Commands: unit as 5.1; smoke on Chrome and Firefox for `send-keyboard.test.ts`. Pass: all exit 0. Layers: unit, smoke e2e.

#### Phase 5.3: arc 5 end-to-end gate

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
| 5 | `send-queue-activity-queue-rule` | 4.1-4.2 | layer 4 | off | `chore(send): pin the ratified ordering rules, record the chaos promotion rule` (77) | #217, #220 |
| 6 | `send-queue-activity-keyboard` | 5.1-5.3 | layer 5 | off | `fix(a11y): keyboard reach on send's fee card and suggestions` (60) | #242 |
| 7 | `send-queue-activity-close-out` | close-out | the top layer | off | `docs(plans): close send-queue-activity` (38) | none |

- **Arc gates.** Arc 1 needs no owner answer beyond the archived concurrent-sends decision (OA-3 records why); it ships first, alone if the pages are late, with the close-out recording the rest as open work in their issues. Arc 1b waits on OA-3 (the dApp wait) and OA-5 (the lag gate); a part answered before arc 1's PR opens joins layer 1 instead (its title re-measured ≤ 93), and the PR closes #218 when the dApp wait is in it. On OA-3 = C #218 closes as not planned; on OA-5 = B #219 item b closes as not planned in the layer that closes #219. Arcs 2 and 5 wait on page 9 (5 also on arc 2); arcs 3a and 3b on page 10 and the charter items named; arc 4 on page 9 and C6. A stack layer whose page is unsigned is not built; the layers above it re-stack on the last built one.
- **Holds.** H7 holds arc 3a's merge until page 10 is signed with P10-05 and P10-06; H3 holds arc 4's merge until pages 6 and 9 are signed.
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
- Arc 4: #217 (4.1), #220 (4.2).
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

## Seeds

Draft until the orchestrator approves; no ELI5 is produced (orchestrator-owned).

**Recommended: `/goal`**

```
/goal Every phase of implementations-plan/send-queue-activity/plan.md whose gate is open (Arc 1 now; Arc 1b only after OA-3 is answered A or B; Arcs 2 and 5 only after page 9 is signed, Arc 5 also after Arc 2; Arcs 3a and 3b only after page 10 and C9, C12-links are signed, Phase 3b.4 step 2 only on OA-1 = A; Arc 4 only after page 9 P9-04 and C6) is marked ✓ in plan.md, each ✓ backed by its validation gate reported passing in the transcript; for each phase the agent printed LESSONS_FILE=implementations-plan/send-queue-activity/lessons/phase-N.md; /code-review was NOT run (code_review is off); the Codex fix loop converged for each built arc and for the final cross-arc pass, each convergence quoted from a resumed Codex pass reporting no new material finding; the § Delivery stack exists on GitHub, created only after the loops converged (gh stack view in the transcript), including the close-out layer that archived the plan (git show --stat of the archive-move commit); bun run test and bun run lint both report exit 0 in the transcript.
```

**Alternative: `/loop`**

```
/loop 15m Drive implementations-plan/send-queue-activity forward. Never idle. Each firing: 1) Reality check: read plan.md, STATUS.md and lessons/ from the top stack layer; if implementations-plan/archive/send-queue-activity/plan.md exists on origin/dev (git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/send-queue-activity/plan.md), run agent-worktree done send-queue-activity --merged, report, clear this loop and stop; if the close-out is delivered but not merged, babysit CI only. 2) Pick the next open phase whose owner gate is signed (Arc 1b: OA-3 = A or B; Arcs 2, 5: page 9; Arcs 3a, 3b: page 10 with C9, C12-links; Arc 4: P9-04 and C6); never build a gated phase early. 3) After each edit run bun run lint and the touched tests; commit signed. 4) Phase green means its gate in plan.md passes: paste it, mark ✓, write lessons, print LESSONS_FILE=…. 5) Network e2e: one e2e:agent on the host until #169 merges. 6) At an arc boundary run the Codex loop per § Post-implementation (hard stop at three rounds), then gh stack add. 7) Stuck or facing a design fork: consult Codex (gpt-6.1-sol, high), log it, decide; anything a person would notice goes to OWNER-ASKS.md, never decided here. 8) All built arcs looped: final cross-arc pass, Delivery, close-out, report and stop. Hard limits: never merge, never push to main, never --admin, never force-push a pushed branch another human touched.
```
