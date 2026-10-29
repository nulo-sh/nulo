---
plan: fee-race-1
tier: mid
status: planned
issues: "#1335 (arc 1), #1336 (arc 2), #1337 (arc 3)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 explorers (sonnet); Codex (gpt-6.1-sol, high, read-only) root-cause consult, audit round-trip and final fresh pass; one Opus Plan leg
base: origin/dev at b036edbff
trunk: dev
post_implementation_hardening: not scheduled
---

# fee-race-1: Confirm waits for what the worker holds it to, and the popup stops cutting estimates short

Three arcs, one stacked PR each, against `dev`. Recon: [recon.md](recon.md) (reuse map, facts F1-F12 with file:line). Consults and audits: [lessons/phase-0.md](lessons/phase-0.md).

**Invariants this plan establishes.**

- **I1.** The dApp window offers Confirm only when every operation's estimate and authorization preview has settled: none is scheduled or running. After that, today's rule decides (a figure the person pays must have landed; D38: a failed sponsored estimate leaves Confirm on).
- **I2.** An authorization snapshot the worker holds a Confirm to is alive whenever its interaction can still be approved, can still be evicted by its estimate's cancel for that whole time while its profile stays active, and passes to the approval in the same tick the worker accepts it; the approval owns it until its execution ends.
- **I3.** Once the worker has admitted an estimate, the popup's deadline never ends the call while the worker still bounds its run: it is a liveness backstop above that bound, never the bound itself. A call that waits for admission is not covered (KL4).

## Outcome & Quality Bar

- **For whom.** A person on Testnet, proving in the browser (minutes per proof), who confirms a dApp swap the moment the window offers it, or opens Send while a dApp transaction proves.
- **Excellent looks like.**
  - The first Confirm the window offers succeeds, for every fee method and for a request whose authorizations discovery finds.
  - A Confirm that waits behind earlier sends or operations, for as long as the queue makes it wait, still meets its snapshot.
  - A Send estimate the queue grants returns its fee or the worker's own failure, never the popup's 60 s timeout.
  - The window's estimates wait for the slot behind another send and say so (OA1), and both surfaces leave the queued reading once the queue grants the run (OA2).
  - The execution graph has a seeded sequence test whose oracles state these as checks, each with a break fixture, in the unit suite under 30 s.
- **Good enough.** A simulation that waits behind a proof past one PXE request's 90 s bound still fails at the worker (KL1). Wallet-built sends in the authorization popups keep their own estimate path (KL2).

## Root causes

**Bug 1 (#1335), demonstrated by code trace (F1-F4).** The worker holds a popup approval of a standard `aztec_sendTx` to the snapshot of authorizations the card showed; only a landed estimate writes it. The window holds Confirm on the fee figure only, and `waitsForFeeFigure` exempts a sponsor (D38). So a sponsored Confirm pressed while the estimate runs sends no snapshot id; confirm discovers the swap's private authorization and refuses with `ESTIMATE_INCOMPLETE_MESSAGE`. Private Fee Juice escapes because its figure gate implies the snapshot. A `default_entrypoint` operation has the same path through its authorization preview, which gates nothing. Embedded app payments and `send_transaction` never meet it (confirm skips discovery). **Issue claim that did not hold:** the suites do not confirm only after the estimate; `approveExecute` clicks as soon as the button enables, so every sponsored spec presses early. None carries a private authorization, and the one that does (`tx-sendTx-delegated-authwit`) waits for the discovered rows first.

**Bug 1's sibling, demonstrated by code trace (F5, F12).** The snapshot dies 120 s after its estimate by two paths: its own TTL, and the registry's settled-handle sweep, which any later estimate's admission runs and which evicts the snapshot with the signed request. It is consumed at the operation's turn in the slot. A Confirm pressed in time still fails when the operation waits longer behind an earlier proof or an earlier operation of the same interaction, or when the window stays open past 120 s. Filed as a new issue at Phase 1.2 (D5).

**Bug 2 (#1336).** The owner saw the card estimate, then read "Queued behind your previous send", then fail with "Couldn't estimate fee. Try again.". Demonstrated by trace: (a) each popup ask has a 60 s deadline (F6), shorter than the worker's 90 s bound on one PXE request; a granted run holds the slot and makes up to three PrivateFPC simulations plus probes (F7), so a run whose every request is in bound can still outlast the popup; (b) the card reads "Queued" through the granted run (F8), so that timeout reads as a queue failure. The queue's own wait is counted by no deadline: each poll is its own call. **Unverified:** which wait ended the owner's estimate: the popup's 60 s (fixed by D8), or a simulation behind the PXE's backlog past 90 s at the worker (KL1, not fixed here). Phase 2.0 reproduced the queue three times on the base, prover ON, with no failure: outcome (iii), so #1336 stays open with the runs ([lessons/phase-2.md](lessons/phase-2.md)). **Claim that did not hold:** the Send is ordered behind the swap (the swap's row carries `fpc:<PrivateFPC>`, F9).

**Found beside bug 2 (F10).** The window's `estimateOperationFee` and `previewOperationAuthwits` take no slot and never answer queued, so a dApp's second request, whose window opens while the first proves, simulates behind that proof and fails. Fixing it makes Confirm wait for the first send, which can be minutes: OA1, answered B.

## Why the suites missed them

- **Bug 1.** No sponsored spec's request needs a private authorization found at confirm, and the one that does waits for its rows. `index.test.ts:1135` pinned the sponsor exemption as intended (D38); no test joined the window's gate to the worker's snapshot rule, and none held a Confirm in a queue for 120 s or admitted a second estimate meanwhile.
- **Bug 2.** CI's network files run proverless (F11); the proof gate holds the slot before `pxe.proveTx` and releases itself after 20 s, so a granted estimate never runs behind a busy PXE there. The prover-ON canaries run one send at a time. `same-token-concurrent-sends` lands the Send estimate before the dApp send starts. `client.test.ts` pinned "estimateTransferFee ends at 60 s".

## Architecture & Implementation

### Arc 1 (#1335 and its sibling)

- **The rule (I1, D3, D10).** `popup/windows/execute/fee-figure.ts` gains `holdsConfirm(op, payer, { landed, inFlight })`: true while `inFlight`, else `waitsForFeeFigure(op, payer) && !landed`. `index.vue` replaces `awaitsFeeFigure` with one computed over it (`inFlight = estimatingOps[i] || previewingOps[i]`, `landed = !!feeEstimates[i]`), read by the `:confirm-disabled` binding and `approve()`'s early return, so button and handler cannot disagree. The engine sets `estimating` at `schedule()`, so the 500 ms debounce counts. The rule is the same for every operation (the issue asks one rule for every fee method); narrowing it to operations confirm holds to a snapshot would copy the worker's rule into the popup.
- **The snapshot's lifetime (I2, D5).**
  - `PreviewSnapshots`' unclaimed TTL becomes the interaction's lifetime: one exported constant `INTERACTION_TIMEOUT_MS` (10 min) both read. A window's clock starts at its opening (`dapp-interaction/service.ts:595-612`), before any estimate, so an unclaimed snapshot is alive while its window can approve; it can outlive the window by as long as its estimate took to land. It holds hashes and the rows the card showed, never a signed request; the reuse caches keep 120 s.
  - `SETTLED_STASH_TTL_MS` becomes the longest stash TTL (the snapshot's), so a settled token's cancel can evict its snapshot for its whole life, and the sweep's expiry no longer cuts a live snapshot (F12). The signed request still expires at 120 s by its own cache's TTL.
  - `PreviewSnapshots.claim(previewIds)` moves those entries out of the TTL cache into a claimed set and returns a release for exactly the entries it moved, idempotent. `DappInteractionService.executeAndResolve` calls it, through `ExecutionService.claimPreviews` (in-process; not in `rpcMethods`, so no port reaches it), as its first statement, before any await: the same tick `approveInteraction` deletes the record. The `try` opens on the next statement, and its existing `finally` (which already drops `this.approved`) calls the release, so a refused fence or session, a materialize throw, a skipped operation and completion all drop what no turn took; a fee question re-asked inside that execution stays inside its scope. `take()` reads the claimed set; the identity check (interaction, index, fingerprint) and its refusals stay at the turn. `evict()` (cancel, supersede, the settled sweep) reaches only unclaimed entries, so the window's disposal after approval cannot erase what the approval owns. A duplicate id is taken once; a second take finds nothing and confirm refuses if it discovers an authorization, as today.
- **E2E driving (D7).** `approveExecute`'s default approvable bound becomes 120 s, the budget the helper already documents for a popup that waits on its estimate (`fixtures/popups.ts:453-456`, `fixtures/send.ts:77`): after arc 1 every caller waits on one.

### Arc 2 (#1336, and F10 on OA1 = B)

- **Deadline (I3, D8).** `ESTIMATE_JOB_TTL_MS` moves to `wallet/services/execution/spec.ts`; `ExecutionServiceClient.getRequestTimeoutMs` gives it to `estimateTransferFee`, `estimateOperationFee` and `previewOperationAuthwits`, as `executeTransfer` has `EXECUTE_SEND_TIMEOUT_MS`. Why it is the right bound: a call answers when its run ends, and the run is bounded by its own requests, each ended by the worker at 90 s (`withEstimateAdmission` answers on that timeout and only the admission place waits for the simulation offscreen, `service.ts:691-728`); the registry's constant is the one the code keeps "comfortably above the worst-case estimate transport chain (~5 sequential PXE RPCs × their 90 s timeouts)". The popup's deadline is then a backstop for a connected worker that never answers (KL3); a dead worker ends the call at once (`packages/extension-messaging/src/background/client.ts:130-145`). The deadline also counts the call's wait for admission, which is not bounded by requests: four places held by simulations that timed out behind a long proof can park a fifth call until near the deadline (KL4). The popup paths this plan touches reach admission only once the slot is free (Send's queued branch; the window's with D6), so that wait needs four estimates admitted behind one proof.
- **The window queues (D6, OA1 = B; as built, D16).** `estimateOperationFee` and `previewOperationAuthwits` run through one helper, `withStoredRequestSlot`: admitted first, so the cancel order `estimate-admission-order.test.ts` pins still holds, then the stored request is read, then the slot of its chain is taken with `lane.tryTakeSlot`. While a send holds or awaits that slot the call answers `{ queued: true, tokenSpent: false }`: settled with nothing stashed, its token is fresh to the registry, so the window asks again with it. Granted, the run holds the slot until it ends. Return types widen to `| TransferFeeQueued`. A send already waiting counts as holding the slot, so an estimate never takes it ahead of one; a send that arrives during an estimate waits for that one run. `index.vue` wraps both estimators in `estimateWhenClear`; `useFeeEstimationMap` passes the engine's abort signal; `onError` reschedules on `EstimateRequeue` with that attempt's own params, as `send.vue` does. While queued the operation stays in flight, so Confirm stays off (I1), and its fee row reads `QUEUED_FEE_COPY` whoever pays (`FeeCostReadout`'s `offersQueue`, false in the window: its cap and sponsor sentences describe a send that can still go out, D17).
- **The run's start (OA2 = B, D15).** The execution service's first event, `onEstimateStarted: { estimateToken }`, is emitted once a tokened estimate holds the slot (`TransferExecutor.estimateFee`'s `onStarted`, `withStoredRequestSlot` after its grant); an admission, a queued answer and a spent token emit nothing. `estimateWhenClear`'s `start` watch runs its callback for the attempt's own token while the attempt's signal is live, and ends with the call or the abort. Send's card clears `feeQueued` and its cap; the window clears that operation's queued reading. Display only: no acknowledgement and no replay; the event and the answer share one port, so a drop that loses one fails the call too.

### Arc 3 (#1337)

- **Boundary (D12).** Inside COMPOSITION-TESTS.md as written, with no new carve-out: a real estimate needs `simulateTx`, so no sequence lands one. "Lands" seeds what a landed estimate writes through the stash APIs the worker itself calls (the reuse entry, the snapshot, the registry's settle), the reuse fast path the cancel spike already uses (D3 there). Build-result reconciliation stays in the executor's unit tests.
- **Shared graph.** `tests/helpers/execution-graph.ts` takes over the two local `makeHarness` copies (`service.composition.test.ts`, `send-order.composition.test.ts`); both migrate, inventory unchanged.
- **Pure catalog.** `tests/helpers/fee-race/model.ts`, tested by `src/wallet/services/execution/fee-race-model.test.ts` (the unit suite collects only `src/**` and `scripts/**`): a `World` (operations by origin and fee method, private authorization or not, estimate state, slot holder and waiters, journal), weighted actions with `invalid`, `params` and the outcomes each may end in, `plan(seed)`, `planFromList`, `prng` from `tests/e2e/fixtures/chaos-seed.ts`. Actions: open a dApp request (sponsor, public Fee Juice, PrivateFPC, app-paid; default entrypoint), open Send, land / fail / hold an estimate, a queued ask, press Confirm or Send (first offer, repeat, double), switch method mid-estimate, cancel, lock, finish a proof, mine a block, advance the clock (past 120 s, past 10 min).
- **Driver.** `tests/helpers/fee-race-in-process.ts`. Popup side, the real code: `createFeeEstimationEngine`, `estimateWhenClear`, `holdsConfirm`, and the window's approval-delta builder, extracted from `approve()` (`index.vue:471-481`) into `popup/windows/execute/approval-deltas.ts` when this second caller appears. Worker side, the real graph: `estimateTransferFee`'s queued branch, lane, registry, reuse caches, snapshots and claim, journal; `executeTransfer` and `executeOperations` over reused builds; `proveTx` on `ControllableGate`; `node.sendTx` canned. Faults are injected at these seams, never by editing source.
- **Each action's seam.** Open a request or Send, hold, fail or switch an estimate: the popup engine and rule. Land: the seeded stashes. A queued ask: the real queued branch (slot holder, waiting send, sequencer). Press Confirm or Send with a live reuse entry: the whole turn through reuse, lane and journal. Press with no snapshot id, or after the reuse entry expired (past 120 s): confirm would rebuild, which needs simulation, so the driver stops at the turn's snapshot lookup against the real store and records it; the rebuild and its refusal stay covered by `dapp-send-executor.test.ts` and the delegated e2e. Cancel, lock (`setActive`, as `service.composition.test.ts` does), finish a proof, mine a block, advance the clock: the real collaborators on fake timers.
- **Oracles (D13).** Each action's permitted outcomes are stated in the catalog, and a run fails on any other.
  - O1: a press the popup rule allowed meets, at its turn, the snapshot it named, or names none only for an operation confirm does not hold to one. Exempt: an operation whose estimate failed (D38; confirm's refusal is one the window shows).
  - O2: the popup never fails an estimate while the worker answers it queued, and asks again until the worker grants it once the slot and sequencer clear. Queued answers reserve no position, so O2 asserts no order among estimates; the mutex's enqueue order is O3's. That a granted call outlives 60 s is proved at the transport, in `client.test.ts` (Phase 2.1), not here.
  - O3: the slot grants in arrival order per profile and chain; each journal row moves only along the journal's own transition table.
  - O4: after every hold is released, the successful submissions equal the journal's sent rows and the activity strip's transactions; a send cancelled during its proof has none.
- **Test file.** `wallet/services/execution/fee-race.composition.test.ts`: fixed seeds and hand lists that drive every action (a coverage test fails on an undriven one), one break fixture per oracle that injects the fault at a seam and expects exactly that oracle red, and a long mode on `NULO_FEE_RACE_RUNS` / `NULO_FEE_RACE_SEED`, skipped in CI. `tests/COMPOSITION-TESTS.md` gains a reference row.

### File-level change map

| Arc | Files |
|---|---|
| 1 | `popup/windows/execute/fee-figure.ts` (+test), `popup/windows/execute/index.vue` (+`index.test.ts`), `wallet/services/execution/preview-snapshots.ts` (+test), `estimate-cancel-registry.ts` (+test), `service.ts`, `dapp-send-executor.ts` (+test), `wallet/services/dapp-interaction/service.ts` (+test), the shared constant, `tests/e2e/fixtures/popups.ts`, `tests/e2e/network/tx-sendTx-delegated-authwit.test.ts` |
| 2 | `wallet/services/execution/spec.ts`, `client.ts` (+`client.test.ts`), `estimate-cancel-registry.ts`, `service.ts` (+`service.estimate-queue.test.ts`), `transfer-executor.ts` (+test), `composables/useFeeEstimationMap.ts` (+test), `utils/estimate-when-clear.ts` (+test), `popup/windows/execute/index.vue` (+`index.test.ts`), `OperationCard.vue`, `popup/components/modules/send/FeeSettingsCard.vue`, `FeeCostReadout.vue` (+test), `popup/pages/send.vue` (+`send.integration.test.ts`), `tests/e2e/network/same-token-concurrent-sends.test.ts`; stubs in the execution suites that build a service facade |
| 3 | `tests/helpers/execution-graph.ts`, the two composition files, `tests/helpers/fee-race/model.ts` (+`src/wallet/services/execution/fee-race-model.test.ts`), `tests/helpers/fee-race-in-process.ts`, `popup/windows/execute/approval-deltas.ts`, `wallet/services/execution/fee-race.composition.test.ts`, `tests/COMPOSITION-TESTS.md` |

Paths without a prefix are under `apps/extension/src/`; `tests/` is `apps/extension/tests/`.

### Trade-offs and alternatives not taken

- **A press during the estimate waits for it, then approves** (#1335's first option): rejected, it approves authorizations the card has not shown yet.
- **Confirm off after any failed estimate** (reverse D38): rejected, no new evidence; a request the estimate fails must still reach its answer.
- **Outline B (worker-side), the competing outline.** Bug 1: confirm meets a missing snapshot with discovered authorizations by a typed "show the authorizations first" error; the window re-estimates and asks again (a second press, new UX). Bug 2: an asynchronous estimate: the first ask starts the run and later asks with the same token collect it. Its obligations: binding a collect to the token's profile, re-asks that never rerun, bounded result retention, delivery of a terminal error, cancel and supersede cleanup, an unknown token after a restart starting afresh, and the held place for offscreen work. It buys a "running" signal for the card (F8, a UI change, OA2) and earlier detection of a connected worker that never answers (KL3). Not taken: the codebase runs long worker calls synchronously under a method deadline (`executeTransfer`, `revokeAuthwits`, `setRegistryEnabled`), and the run is bounded by its own requests (D1, D8). The owner's OA2 = B ships without it: the start event (D15) reports the run on the call it already makes.
- **Snapshot handed to the approval envelope** instead of a claimed set: rejected, the envelope rides `executeOperations`' positional parameters, which a port can reach; the claimed set keeps the baseline inside the worker, released by the scope that already releases `approved`.

## Phases

Every gate includes `bun run lint` and `bun run typecheck:all` (exit 0). Unit runs are `cd apps/extension && bun --bun vitest run <files> --retry=0`. Every e2e run is at retry 0 through `NULO_E2E_RETRY=0` (both e2e configs default to 2). Smoke: `NULO_E2E_RETRY=0 bun run test:e2e`. Network e2e, from the repository root (the root script enters `apps/extension`): `NULO_E2E_RETRY=0 NULO_E2E_PROVERLESS=1 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/<file>.test.ts`, then the same with `NULO_E2E_BROWSER=firefox`; prover-ON only where a step says so. A red-before test runs on the base with the arc's source unchanged and its own test file added. Log every run in `lessons/phase-N.md`.

### Phase 1.1: the window holds Confirm while an estimate or preview runs (#1335) ✓

1. On the base, add and record red: `fee-figure.test.ts` rows for `holdsConfirm` (in flight holds a sponsor, an app-paid op and a default-entrypoint op: red, the function is absent) and `index.test.ts` (a sponsor's estimate in flight disables Confirm and `approve()` sends nothing, then it lands and Confirm is live: red; a default-entrypoint preview in flight does the same: red). Green on the base and kept as pins: a failed sponsored estimate leaves Confirm on (D38), the figure rule's rows.
2. Add `holdsConfirm`; `index.vue` reads it in the binding and in `approve()`. Rewrite the in-flight half of `index.test.ts:1135`.
3. Set `approveExecute`'s default bound to 120 s with its reason (D7).
4. Add to `tx-sendTx-delegated-authwit.test.ts` the integration backstop "sponsored, Confirm at its first offer": click when approvable, expect the send submitted. Record it on the base (expected red; it can pass if the estimate lands within the helper's first poll) and green on the head, both browsers.

**Gate.** Step-1 reds red on the base and green on the head, pins green on both; `fee-figure.test.ts`, `index.test.ts`, `OperationCard*.test.ts` green; the delegated spec green on both browsers at retry 0; `tx-sendTx-sponsoredFpc`, `concurrent-sendtx-approve`, `concurrent-sendtx-confirm`, `authwit-lifecycle`, `scope-refusal` green on Chrome. The approvable timings of that run (`.e2e-state/exec-approvable-timings.log`) logged per browser: maximum and the slowest five, against D7's bound.

### Phase 1.2: the snapshot outlives the queue (#1343, D5) ✓

1. File the issue (dedupe first) with the path from Root causes; arc 1's PR closes it.
2. On the base, add and record red: `preview-snapshots.test.ts` (an unclaimed snapshot found at 9 min; a claimed one found after its unclaimed TTL, untouched by `evict`, gone after release; a release drops only the entries its claim moved and a second release is a no-op); `estimate-cancel-registry.test.ts` (a settled token still evicts at 9 min); a service-level fake-clock test on the real wiring (`estimate-hold.integration.test.ts`'s shape): stash a snapshot and settle its token, advance 150 s, admit another estimate, then the approval finds the snapshot; a `dapp-interaction` test: the snapshots an approval names are claimed before its first await, and released when its fence check refuses.
3. Implement as in Architecture.

**Gate.** Step-2 reds red on the base and green on the head; `bun --bun vitest run src/wallet/services/execution src/wallet/services/dapp-interaction --retry=0` green; the delegated and `concurrent-sendtx-confirm` specs green on Chrome. Arc gate: `bun run test:all` three times at retry 0 (record each wall-clock); `NULO_E2E_RETRY=0 bun run test:e2e` once per browser; the lane's network e2e wall-clock per browser against the base's, for the PR body.

### Phase 2.0: reproduce #1336 (D11) ✓

On the base, prover-ON (`e2e:agent` without `NULO_E2E_PROVERLESS`), Chrome, developer mode on: a playground `sendTx` paid by PrivateFPC confirmed, then Send on the same account with PrivateFPC, filled while it proves. Read the SW log trail (`fixtures/journal.ts` `readSwLogTrail`) for the error that ends the estimate. Outcome, logged with the trail: (i) the popup's `RpcTimeoutError` at 60 s → D8 is the fix and arc 2 closes #1336; (ii) a worker-side simulation timeout → KL1 is the cause, arc 2 ships D8 and #1336 stays open naming KL1 for a plan decision; (iii) no failure in three runs → D8 ships on its trace and #1336 stays open with the runs. A scratch spec, never committed.

Result: outcome (iii), three runs, no failure; the trail and timings are in [lessons/phase-2.md](lessons/phase-2.md).

### Phase 2.1: the estimate deadline is the worker's own bound ✓

1. On the base, rewrite `client.test.ts`'s 60 s pin as the red test: each of the three methods, answered at 61 s on a manual port, resolves; unanswered, it rejects with `RpcTimeoutError` at the bound.
2. Move the constant; add the three methods to `getRequestTimeoutMs`.

**Gate.** `client.test.ts` red on the base and green on the head; `estimate-cancel-registry.test.ts`, `estimate-hold.integration.test.ts` and `client.test.ts` green.

### Phase 2.2: the window's estimates wait for the slot (OA1 = B) ✓

1. On the base, red: `service.estimate-queue.test.ts` (both methods answer queued unspent while the slot is held or a send waits, before admission; an admitted one holds the slot, a send arriving meanwhile runs after it, a cancel releases it, and one that cannot take the slot answers spent); `useFeeEstimationMap.test.ts` (the estimator gets the attempt's signal, aborted on supersede); `index.test.ts` (the window's estimator answers through queued polls, the operation stays in flight, a spent answer reschedules with that op's params). Copy per OA1's answer.
2. Implement as in Architecture.

**Gate.** Step-1 reds red on the base and green on the head; `bun --bun vitest run src/wallet/services/execution src/composables src/popup/windows/execute --retry=0` green. If OA1 is C or unanswered, skip the phase and file F10 as its own issue with the path and OA1 quoted.

### Phase 2.2a: the run's start (OA2 = B, D15) ✓

1. Design consult with Codex before building ([lessons/phase-2.md](lessons/phase-2.md)).
2. On the base, red: the executor reports its start once it holds the slot and never on a queued answer (`transfer-executor.test.ts`); the service emits `onEstimateStarted` by token after the grant, for transfers and the window, and nothing on a queued answer (`service.estimate-queue.test.ts`); the client delivers the event (`client.test.ts`); `estimateWhenClear`'s watch runs for its own live token only (`estimate-when-clear.test.ts`); Send's row leaves queued and its cap on its token, not another's, and Send waits for the fee (`send.integration.test.ts`); the window's operation does the same (`index.test.ts`).
3. Implement as in Architecture.

**Gate.** As Phase 2.2's, plus `src/utils` and `src/popup/pages`.

### Phase 2.3: a Send queued behind a dApp transaction, end to end

1. Add to `same-token-concurrent-sends.test.ts` the interleaving #1336 asks for, as an integration backstop (green on the base too; the reds are 2.1's): a PrivateFPC dApp send held at `proving` by the proof gate; Send opened with PrivateFPC and filled; its row reads queued with Send off; after release, the fee lands, Send confirms, and both succeed in order with the ledger reconciled.
2. Run it on Chrome and Firefox; record the measured runtime against an estimate of 90 s.

**Gate.** The case green on both browsers at retry 0; the file, `concurrent-sendtx-*`, `fee-methods` and `tx-sendTx-sponsoredFpc` green on Chrome. Arc gate as in Phase 1.2.

### Phase 3.1: one in-process execution graph

Extract the builder; migrate both files. **Gate:** both green with an unchanged inventory (`--reporter=json` names before and after compared).

### Phase 3.2: the pure catalog

Write the model and `fee-race-model.test.ts` (each action's `invalid` and outcomes, `plan` deterministic per seed, `planFromList` refuses an invalid list). **Gate:** `cd apps/extension && bun --bun vitest run src/wallet/services/execution/fee-race-model.test.ts --retry=0` green.

### Phase 3.3: the seeded sequence test

1. Write the driver, the oracles and the test file: fixed seeds, hand lists, the coverage test, one break fixture per oracle.
2. Each break fixture injects at a seam: the window rule answering "settled" while an estimate is in flight (O1), the snapshot sweep at 120 s (O1), the popup failing a queued answer (O2), a lane granting out of order (O3), a journal row skipping a stage (O3), a dropped sent row (O4). Each turns exactly its oracle red.
3. A fault a sequence finds beyond these: file an issue with the seed and step (a private draft advisory if it looks exploitable); fix it here only if its path is written and it lies in this plan's files.

**Gate.** The file green three times at retry 0; each break fixture red on exactly its oracle; the coverage test green; the file's own duration under 30 s in vitest's JSON report on each of three runs; `NULO_FEE_RACE_RUNS=50` green once, logged.

### Phase 3.4: the e2e pairs

Apply the runtime budget rule to each pair #1337 names. Expected, to verify: the sponsored first-offer Confirm (1.1) and the queued Send (2.3) need a browser; a first-offer Confirm on the other window methods, a first-offer Send per method and a double press are shown at the component layer (1.1's table, `send.integration.test.ts`, two presses in one task through `sendEvent`), so they add no e2e. Add a component test for each double press none covers. **Gate:** the PR body carries each pair's disposition and the per-browser wall-clocks of the lane's e2e jobs before and after.

## UI impact

- **dApp window, Confirm** (behaviour, no copy; arc 1): disabled while any operation's estimate or authorization preview runs, on every fee method. Before: a sponsor or a default-entrypoint operation enabled it at once. Requested by #1335's Expected: "One rule for every fee method: a press before the estimate lands either waits for the in-flight estimate or is not offered, and never fails the send." The PR body quotes it.
- **dApp window while another send holds the wallet** (arc 2, OA1 = B). Before: the estimate ran behind the proof and failed with "Couldn't estimate fee. Try again."; with a sponsor Confirm then came on. After: the fee row reads Send's sentence "Queued behind your previous send" under You pay, for every payer, and Confirm stays off until the estimate lands. An app-paid operation's line and a default-entrypoint operation, which have no You pay row, keep their loading state while they wait (D17). The owner (2026-10-28): "I'm thinking "B" -- but random question: can't we simulate and get the private authorization while the other stuff proves / gets sent? doesnt it simulate with an anchor block or something? Allowing us to do such things? Though true, it might use notes or something that we need, for example on private fee juice". The PR body quotes it.
- **Send's card and the window's fee row once the queue grants the run** (arc 2, OA2 = B). Before: "Queued behind your previous send" (or the cap and sponsor variants) until the fee landed. After: the estimating state from the run's start; a queue-mode Send (a cap, or Nulo's sponsor) is off for the seconds the run takes, as any estimating card is. No new copy, no new control. The owner (2026-10-28): "Sounds like "B" is the most and best user experience, actually telling the user what's happening when it's happening". The PR body quotes it.
- **Send** (arc 2): a granted estimate's call no longer ends at 60 s.

## Security & Adversarial Considerations

- **Trust boundary.** The dApp supplies the request; the popup supplies ids. Ids are worker-minted UUIDs, so a forged or replayed `previewId` claims nothing; the identity check (interaction, index, fingerprint) stays at the turn. `claimPreviews` is not an RPC method (the dispatcher is an allow-list, `packages/extension-messaging/src/core/rpc-methods.ts`), and the claimed set never crosses a port.
- **Disclosure.** I1 strengthens "the card shows what Confirm signs": no approval leaves before the discovery that lists its authorizations. The snapshot keeps the shown rows (addresses, amounts) in worker memory up to 10 min instead of 2, as long as the window that showed them; a cancel evicts it for that whole time while its profile is active (F12's fix), and nothing persists it. After a lock or a profile switch the cancel no-ops, so the snapshot stays, unreachable by any call, until its TTL (KL5).
- **Denial of service.** A hostile dApp can open requests whose estimates run; admission caps them at 4 active and 8 parked per profile. With D6 a window estimate also holds the slot for its run, so an approved send arriving during it waits one run (seconds locally, unmeasured on Testnet, N1); a waiting send already blocks new estimates. A longer popup deadline holds a port, not a simulation.
- **Logging.** Any new line logs a fixed category with named keys; no envelope, balance or hash.
- **Supply chain, crypto, privileges.** No dependency, no cryptography, no permission change.

## Assumptions

Facts: [recon.md](recon.md) § Facts F1-F12.

Inferences (attack these):

- N1. A window estimate's run, which a send arriving during it waits for under D6, is seconds on the local network; on Testnet it is unmeasured, bounded by its requests (F7).
- N2. Unclaimed snapshots and settled handles are kept five times as long as today (each a hash list and the rows a card showed, plus one map entry per landed estimate); entry count and memory cost are unmeasured, and no quota is added without a demonstrated workload.
- N3. 120 s covers a popup's estimate on a cold CI shard, as it does for the callers that already pass it; Phase 1.1 logs the timings.
- N4. The fixed seeds and hand lists run under 30 s; Phase 3.3 measures it.

Scope this plan asks approval for: S1, D5 ships in arc 1 under its own issue (its fix changes an in-memory lifetime and adds a claim released by an existing scope; no persistent state, protocol or public contract): accepted by the orchestrator under the owner's mandate, 2026-10-28. S2, D6 waits for OA1: answered B.

## Decision ledger

| Id | Question | Decision | Why |
|---|---|---|---|
| D1 | Outline A or B | A | local fixes on existing patterns; B's second press is new UX and its async estimate is a protocol the evidence does not need (D8) |
| D2 | When Confirm waits | while any estimate or preview is in flight; D38 after it settles | the reported race and the default-entrypoint twin; D38 has no new evidence |
| D3 | Per-op rule location | `fee-figure.ts` `holdsConfirm`, read by binding and `approve()` | one pure rule, importable by arc 3 |
| D4 | Arcs 1 and 2 merged? | no | different causes: a window gate, an estimate deadline |
| D5 | The sibling | unclaimed TTL = interaction lifetime; settled-handle TTL = longest stash; claim in the acceptance tick, released by `executeAndResolve`'s `finally` | both eviction paths and the acceptance-to-turn gap close; ownership rides a scope that already releases `approved` |
| D6 | Window estimates while another send holds the slot | queue and hold the slot as transfers do (OA1 = B) | one rule for every estimate; the wait it adds is visible |
| D7 | `approveExecute` default bound | 120 s | every caller now waits on an estimate, the gate the helper's 120 s budget already covers |
| D8 | Popup estimate deadline | `ESTIMATE_JOB_TTL_MS`, from `spec.ts`; I3 covers admitted calls only | the run is bounded by its requests (90 s each, answered by the worker); the popup's deadline is a backstop above that chain, as `executeTransfer`'s is; B's result store is not needed for a healthy chain past 60 s (Codex round 2). The admission wait is KL4: answering queued instead of parking would change the registry's latest-wins parking for a case that needs four estimates admitted behind one proof |
| D9 | Shared catalog and `send-chaos` | `send-chaos` keeps its own plan | migrating it remaps the CI chaos seeds (`CI.md:57`) for no new failure mode |
| D10 | Narrow I1 to snapshot-held operations | no | the issue asks one rule; narrowing copies the worker's rule into the popup |
| D11 | Closing #1336 | after Phase 2.0's reproduction names the cause | the 60 s cut is shown by trace; the owner's failure is not |
| D12 | Arc 3's boundary | existing seams only (reuse fast path, lane, registry, journal); no new carve-out | a seeded landed estimate is what the worker writes; a canned build would be a second wallet |
| D13 | O1 and D38 | a failed estimate's refusal is a permitted outcome | D38 keeps Confirm on after a failure on purpose |
| D14 | Where the claim sits in `executeAndResolve` (deviation, arc 1) | first statement inside the `try`, after the synchronous `approved.set` | still before any await; a throwing claim then cancels the window and the `finally` runs |
| D15 | How the wallet reports a granted run (OA2 = B) | `onEstimateStarted: { estimateToken }` on the execution service's events, emitted once a tokened estimate holds the slot; the popup matches its live attempt's token | the pending call exposes neither admission nor the grant, and a signal-free design needs a result store or a timing guess. Not taken: Outline B's asynchronous estimate (result store, retention, terminal-error delivery, restart semantics) for one reading. Codex design consult: agree with changes, all folded |
| D16 | D6's admission order (deviation, arc 2) | admit, read the request, then take the slot; a queued answer settles with nothing stashed and leaves the token reusable, so there is no spent form | the plan read the network before admission; a cancel during that read finds no entry (the registry keeps none for an unknown token) and the estimate would then run, holding the slot a send waits for. `estimate-admission-order.test.ts` pins the order |
| D17 | The window's queued reading per payer | `QUEUED_FEE_COPY` whoever pays; an app-paid line and a default-entrypoint operation keep their loading state | the owner approved that one sentence for the window; the cap and sponsor variants say a send goes out, and Confirm is off there. The app-paid line and a preview-only operation have no You pay row to carry it, and a new placement is the owner's call |

## Audit verdicts

- **Round 1.** Opus Plan leg: conditional approve (the settled sweep path, the missing owner ask, #1336 unreproduced, O1 against D38, the driver testing a copy). Codex: reject (D8's bound, the settled sweep path, the claim's ingress and ownership, N1 and the DoS argument, OA1 assuming its behaviour, arc 3 past the composition contract, oracles against retained behaviour, unrunnable proofs). Every finding's disposition: [lessons/phase-0.md](lessons/phase-0.md) § Audit round 1. Rejected: narrowing I1 (D10). Disputed and argued: D8.
- **Round 2 (Codex, same session): conditional approve.** D8 accepted over B's async half; condition: the admission wait (I3 narrowed, KL4). D5's ownership accepted, with its implementation requirements (try right after the claim, release only own entries, idempotent, evict never reaches claimed entries). Arc 3: map each action to a reachable seam; rebuild paths out of the layer; O2's transport proof stays in `client.test.ts`. Arc 1 depends on neither owner ask. The network command runs from the repository root. All folded.
- **Arc 1 review, round 1.** Codex (fresh session): 2 low comment findings (`holdsConfirm`'s doc misread the settled rule for an app's own cap; the approvable helper's doc kept an archived plan path), both fixed. Opus (`general-purpose`): 5 low, all accepted: a null delta threw at the claim (`delta?.previewId`, pinned by a test red without it); the plan's claim that a cancel evicts a snapshot for its whole life is false after a lock or switch (sentence corrected, KL5); two comment nits; gate evidence to log. Its forward note for arc 2 is in KL3.
- **Final pass (fresh Codex session): approve,** after one round. Its conditional approve asked: no order among estimates in O2 (queued answers reserve no position), a test path the unit runner collects for the model, `NULO_E2E_RETRY=0` on every e2e command, N2 qualified as unmeasured. All folded; its note on N2's wording applied. It confirmed arc 1 depends on neither owner ask.
- **Arc 2 design consult (Codex, OA2's signal): agree with changes.** The start event over Outline B; the listener fenced by its attempt's live signal; a lost event documented, not replayed; stale comments corrected; the wire contract recorded (D15). Detail: [lessons/phase-2.md](lessons/phase-2.md).

## Delivery

| Arc | Branch | Phases | Stacks on | PR title (≤ 92) | Closes |
|---|---|---|---|---|---|
| 1 | `worktree-fee-race-1` | 1.1-1.2 | `dev` | `fix(execute): confirm waits for the fee estimate, and its authorizations outlive the queue` | #1335, #1343 |
| 2 | `worktree-fee-race-1` (deviation: arc 1 merged first, so arc 2 continues on the arc's branch against `dev`) | 2.0-2.3 | `dev` | `fix(fees): estimates queue behind a send, report their run, and outlive 60 s` | refs #1336 (outcome iii, D11) |
| 3 | `fee-race-1-a3` | 3.1-3.4 | arc 2 | `test(execution): a seeded sequence test over fee estimates, queue and confirm timing` | #1337 |
| close-out | `fee-race-1-close-out` | Outcome, lessons, archive | arc 3 | `docs(plans): close fee-race-1` | none |

`code_review: off` for every arc. Start: `gh stack init --adopt worktree-fee-race-1 --base dev`; at each boundary after its loop converges, `gh stack add <next-branch>`. Merge `origin/dev` before each PR. PRs open without labels; add `e2e:extension-network` afterwards only if the path filter skips a needed suite. Serial: arc 3's driver imports arcs 1-2's rules.

## Post-implementation

The steps are `implementations-plan/README.md` § Post-implementation standard, read at `b036edbff`. Plan-specific values:

- **Review loop**: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, per arc at its boundary over `git diff <arc base>...HEAD`, with the arc map ("arc N of 3: arc 1 the window rule and the snapshot lifetime, arc 2 the estimate deadline and the window queue, arc 3 the seeded sequence test over both"), the adversarial ask and the two verbatim rules. Hard stop at three rounds. One Opus (`general-purpose`) review of each arc's final diff beside its first Codex round. Then one fresh Codex session over `git diff b036edbff...HEAD` with the cross-arc ask.
- **Delivery**: `gh stack submit --auto`, then `gh pr edit` each body (what changed and why, the red/green runs, the e2e wall-clocks per browser, `Closes`), then `gh pr checks <n> --watch`.
- **Close-out**: the stack's docs-only top layer, per the standard; comment on #396 (arc 1 covers it) and on any issue taken on but not fixed.
- **Teardown**: once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/fee-race-1/plan.md` succeeds, `agent-worktree done fee-race-1 --merged`.
- **Known limits to file at close-out** (closed `known-limit` issues, deduped first):
  - KL1: a simulation queued behind a proof past 90 s fails at the worker and still runs offscreen. Reopen on a user log showing a simulate timeout after a proof.
  - KL2: the authorization popups' wallet-built estimates (`estimateRevokeFee`, `estimateRegistryToggleFee`) neither queue nor hold the slot. Reopen when one fails behind a proof.
  - KL3: a worker that stays connected but never answers holds an estimate's popup call until its 15-minute deadline; with arc 1 the window's Confirm stays off until the window's own 10-minute close. Reopen on a report of a card estimating past a few minutes with the wallet idle.
  - KL5: after a lock or a profile switch, an unclaimed authorization snapshot (the rows its card showed) stays in worker memory until its 10-minute TTL; no call can read it, since its interaction is gone. Reopen if a lock is required to purge in-memory estimate state.
  - KL4: an estimate parked for admission behind four places held by simulations that timed out offscreen counts that wait against its 15-minute deadline and can fail soon after it starts. Reopen on a log showing an admitted estimate's call timing out within seconds of its admission.

## Seeds (draft; not run, the orchestrator owns execution)

```
/goal All phases of implementations-plan/fee-race-1/plan.md marked ✓ (Phase 2.2 per OA1), each backed by its gate reported passing in the transcript with LESSONS_FILE=implementations-plan/fee-race-1/lessons/phase-N.md printed; code_review is off and /code-review was not run; the Codex loop converged per arc and on the cross-arc pass, each quoted; the three arc PRs and the close-out exist on GitHub (gh stack view), opened only after the loops converged; bun run test:all and bun run lint exit 0.
```

```
/loop 15m Drive implementations-plan/fee-race-1 forward per its plan.md and the README § Post-implementation standard at b036edbff: reality check (plan, lessons, gh stack view, git status), next pending step, its gate, commit; decide stuck points with Codex (gpt-6.1-sol, high); never merge; stop after 5 failures on one step.
```
