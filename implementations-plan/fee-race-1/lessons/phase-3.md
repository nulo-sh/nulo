# Phase 3: arc 3 (#1337)

## Phase 3.1, 2026-10-29: one in-process execution graph

`tests/helpers/execution-graph.ts` builds the collection both files assembled. Inventory, by vitest's JSON report, the base's two files (from the arc's merge of `dev`) run beside the head's: `service.composition.test.ts` 60 and 60, `send-order.composition.test.ts` 8 and 8, full names and statuses identical. The graph later gained an optional `dappInteraction` stub for the window's stored requests; neither file passes it.

## Phase 3.2, 2026-10-29: the catalog

Twelve actions over a `World` of operations (surface, method, transfer kind, phase). Two weightings found by reading 200 plans: repeat presses dominated until a repeat needed the step before to press the same surface; runs stalled on empty worlds until an open weighed three times as much while nothing was open. `fee-race-model.test.ts` 15 green.

## Phase 3.3, 2026-10-29: the seeded sequence test

**The seam (D20).** The first driver gave the PXE fake a `simulateTx`, which D1 caps; removed. The second answered every build with canned data, so a confirm that should rebuild sent a canned transaction instead, which D12 and the round-2 audit rule out ("rebuild paths out of the layer"). As built: each estimate is the worker's own run (`runEstimate`, `estimateOperationFee`, `previewOperationAuthwits`), parked at its start while it holds the slot until a land or fail step; while it proceeds, its simulating calls answer the cancel spike's prepared-tx shape; any of them called outside a run throws `RebuildOutOfLayer`, and the driver records that end as a rebuild. Not taken: the driver writing the reuse entry and the snapshot itself, which copies the worker's eligibility, fingerprint and before-snapshot rules into the test.

**Prototype failures, each a missing field the real code reads:** `offscreenSettled` on the PXE handle; `maxPriorityFeesPerGas` on the node's fees; a base-fee drift refusal until the canned cap came from `feeCapFor` and `reuseCapRule` at the press's priority; `publicInputs.constants` on the proved tx; `getTxReceipt` on the node; `gasUsed.totalGas` on a default-entrypoint simulation.

**Oracle fixes, each a false red:**

- O1 flagged a Send on Nulo's sponsor in queue mode, which names no estimate by design. It is now exempt through `queueModeOf`.
- O1 flagged rebuild ends. Their errors arrive wrapped (`{ error: { name } }`, a cause, a string), and the match now walks the wrapper.
- O2's fixture also tripped the catalog, because an open could end failed. `failed` is now among the open and switch outcomes.
- O3's lane fixture first released nothing, which broke `mutex.keep`. The fault now takes a real hold on a second key.

**Break fixtures.** Each one is red on exactly its oracle, as `redOn` asserts:

| Oracle | Fault |
|---|---|
| O1 | the rule ignores an in-flight estimate |
| O1 | the snapshot sweep runs at 120 s |
| O2 | the popup fails a queued answer |
| O3 | a lane skips its line |
| O3 | a journal row skips a stage |
| O4 | the strip drops a sent row |

**Runtime.** The file's own duration in vitest's JSON report was 11.76 s, 11.60 s and 11.59 s on three runs at retry 0. Each run was 22 green plus the skipped long mode; `fee-race-model.test.ts` took 0.05 s each time.

**Long mode.**

- Before the rebuild correction: 50 seeds from 1000, green (76.7 s); 300 seeds from 20261029, green (480 s).
- On the final design: 300 seeds from 31337, green (464.6 s); 50 seeds from a random first seed, green (80.8 s), run beside it.

**The PrivateFPC sequence: it sequences behind.** Two PrivateFPC sends share the sequencer key `fpc:<address>`: `feeSpenderOf` keys every FPC but the protocol sponsor by its address, and a dApp send's recorded keys add it from the FPC call in its `txCalls`.

- **A second PrivateFPC Send.** Its estimate reads queued while the first proves (the slot), and again after the first is sent, until its block (the sequencer). The queue grants it after the mine, and both are sent.
- **A PrivateFPC Send beside a pressed PrivateFPC window.** The same.
- **A window pressed beside a pressed PrivateFPC Send.** It waits for the Send's block (the dApp waiter), then rebuilds: the epoch and the pending set moved, so its reuse entry is stale.

The three cases are the `describe` "a PrivateFPC send beside another that holds the contract's notes" in `fee-race.composition.test.ts`. No product fault. Two runs side by side would spend the same fee notes, and the sequencer is what prevents that.

**Other behaviour the runs showed, none a fault:**

- A dApp send waits behind any pending transaction of its account.
- A superseded or cancelled estimate that is parked keeps the slot until its run ends, because a simulation cannot be preempted.
- An estimate taken while a predecessor is pending rebuilds once that predecessor settles (the pending-hash check).

**Replay.** A seed names its plan, not its run. Two estimates released by one event each re-ask on their own real 3 ms poll, so which one takes the slot first can differ between runs. Every outcome either way is in the catalog, but a long-mode red may need several runs of its seed to reproduce.

**Oracle limit.** O1 accepts a rebuild end as permitted, so it cannot tell a rebuild the reuse rules require from a reuse refusal that is wrong. The hand lists assert `sent` where the reuse entry must hold.

## Phase 3.4, 2026-10-29: the e2e pairs

Each pair #1337 names, under the runtime budget rule:

| Pair | Disposition |
|---|---|
| Fast Confirm, sponsored window | browser, already in the suite: `tx-sendTx-delegated-authwit` "a sponsored Confirm pressed at its first offer" (arc 1; Chrome 47.7 s, Firefox 59.7 s). The failure was the worker's turn missing the authorizations discovery found, which a cheaper layer reaches only on canned builds |
| Fast Confirm, other window methods | no e2e. They follow the same rule (`holdsConfirm`'s table in `fee-figure.test.ts`, the window's app-paid and sponsor cases in `index.test.ts`), and the sequence test presses each method at first offer over the real worker |
| Fast Send, per method | no e2e: `send.integration.test.ts` "Confirm waits for the current input's estimate", and the sequence test's Send presses on sponsor, Fee Juice and PrivateFPC |
| Send queued behind a dApp transaction | browser, already in the suite: the `same-token-concurrent-sends` case (arc 2; Chrome 135.7 s, Firefox 152.5 s) |
| Double press | component: "two presses of Confirm in one task approve once" (`index.test.ts`) and "two presses of Send in one task send once" (`send.integration.test.ts`), both through `sendEvent`. Each is red without its latch (`isLoading` in `approve`, `isSending` in `canSubmitNow`): 2 calls, not 1 |

The arc adds no e2e scenario. The lane's wall-clocks on the base (PR #1351's last runs) were:

- network: Chrome 976 s, Firefox 1134 s;
- smoke: Chrome 701 s, Firefox 882 s.

The PR body states the same figures on its own runs.
