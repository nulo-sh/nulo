# Arc 1b — lessons

Arc 1b ships on OA-3 = A, OA-4 = B and OA-5 = A, so Phase 1.2 (the chain-tip gate) is built here too.

## Phase 1b.1: the parked slot and origin order

- **`keep` hands on, `release` goes inert.** `ExecutionMutex.keep(release)` runs the hold's hand-on and returns a `SlotReservation`; the hold's own release is then a no-op, so `runInSlot`'s `finally` may call whichever release it holds last without double-resolving a tail. The keeper map is cleared by `release` too, so `keep` after a release and a second `keep` both throw one message.
- **The reservation owns only the depth count.** `redeem` refuses a used or dropped reservation and one presented in another lane or origin; `drop` and the final release each return the depth once (`DepthClaim.returned`). An aborted re-entry chains its tail exactly as a first acquire does; the reservation it consumed is returned by that chained release, and the caller's `drop` is a no-op.
- **Origin order is a line, not a parked tail (deviation, D49).** The plan kept "the tail of the origin's parked chain" and let a request re-enter once the earlier one had re-entered. A request that has re-entered but is not yet re-granted must still count as ahead, or a later request granted in that window starts first. `joinOriginLine` gives each send a place, keyed `profile:chain|origin`, from its first grant until it starts (or ends), and `earlierDone` resolves when every earlier place has left. A send that leaves early (throws, is cancelled) resolves its place in `finally`, so it never strands the line.
- **The silent path reads Queued while it waits (deviation, D50).** `parkSlot` moves a `pending` record back to `queued` (`transitionIfStage(["pending"] → queued)`), the back-edge arc 3b added for OA-1 = A; the claim takes it to `pending` again. The plan's "Preparing..." line predates OA-1's answer.

## Phase 1.2: the chain-tip gate

- **The tip is the runtime node's proposed tip, single attempt.** `readChainTip(networkId)` reads `getSingleAttemptNodeForUrl(networkInfoFrom(network).rpcUrl).getBlockNumber()`: no PXE chain guard (it would wait behind a proof), no retry, the silent RPC logger (D27). A read is bounded at 3 s, deduplicated per network, and a failed or timed-out read lets everything observed by then run.
- **The gate takes a network id (deviation, D51).** Tips are per network, so `unconfirmed` and `wait` take `networkId` beside the scope; the plan's signature had only the scope.
- **Observations come from the settle handler only.** `TransactionService`'s update leaving Pending for a block calls `observe`; restore emits no such event, so imported rows never hold a send (D7). The estimate path answers queued while an observation is unconfirmed and refreshes the tip for the popup's next ask.
- **Revert check:** removing the gate from `takeTurn` fails the three never-happens cases in `transfer-executor.test.ts`; restored.

## Phase 1b.2: the waiter

- **Waiters ignore waiters and estimates.** `waiterBlocked` is true for any holder in scope that is sent, external, or earlier, and for any pending row of the scope's chain inside `SUBMITTED_HOLD_MS`; ticketed rows need no exclusion, since a sent holder already blocks. A waiter holds an empty key set, which no ticket's keys intersect, so no Send-page send ever waits for a dApp send (D-orch-1b-1).
- **The pre-claim failure lives in the lane.** `failUnclaimed(queuedJournalId, error)` fails a record still `queued` or `pending` and skips the cancel sentinel; `runInSlot` calls it whenever it throws with no `journalId`. A claimed record keeps its existing catch.
- **Composition stage log.** A waiting record's heartbeat touch re-emits its stage, so the composition harness logs stage changes only.

## Phase 1b.3: the end-to-end gate

- **One browser per file, so one approval per origin.** The burst fixture is file-scoped: a second dApp case's `connectPlayground` waited 30 s for a discover window that never opens, because an approved origin's discovery is automatic and only the emoji check asks. The file's dApp cases share `matrixPlayground`: connect and grant once, `reconnectPlayground` after.
- **A NO_WAIT answer is a submission.** The playground's `sendTx` answers at submission, so "both confirm" reads each dApp hash's inclusion on the node (`waitForTxMined`), not the playground's `ok`.
- **First Chrome run (two files, retry 0):** `concurrent-sendtx-confirm` passed with both sends confirmed (42 s); the new same-token case failed on the reconnect above, before any send.
- **The added scenario** ("a Send-page send held unmined, then a dApp send of the same account"). Failure mode: a dApp send claims and builds while an earlier Send-page send of its account is unmined, though the two share nothing a key could name. A cheaper layer cannot show it: it runs through the real approval window, the interaction service's queued record, the tx row's life through mining and the playground's `sendTx`, and composition stops before the build. Measured at retry 0: Chrome 37.2 s, Firefox 34.4 s. `concurrent-sendtx-confirm` now proves T2 confirms too (Chrome 47.5 s, Firefox 41.4 s; its timeout went from 360 s to 600 s for a second prove and block).
- **Gate runs at retry 0, merged HEAD 69336274.**
  - Both named files: Chrome 16/16, Firefox 16/16.
  - The full Chrome network suite: 113 files passed, 5 skipped, 1 failed (205 tests passed, 6474 s on a host at load ~217 of 188 cores). The failure was `snack-placement.test.ts`'s "Send: a send that fails once its record is written offers Details": the Details action vanished between its read and its 10 s click wait. Its file rerun went 4/4, and another branch's CI failed the same file's Home case the same evening, so it is a host-load flake with no path through this arc.
- **Wall-clock.** CI's `concurrent-confirm` shard runs exactly these two files; before this arc it took 542.9 s on Chrome and 599.3 s on Firefox (vitest duration, runs 38450729101 and 38450729487). Locally after: Chrome 765.5 s, Firefox 746.9 s, on the loaded host; the PR's CI run gives the comparable figure.

## Review round 1 (Codex gpt-6.1-sol high, session `01a136de-aba7-7b02-9052-83efa8909e5e`; Opus general-purpose)

- Codex: lead questions hold; five P2s accepted: the stranded origin line on a throwing scopes thunk, finality re-observing a block, a cancel waiting out a tip read, the failure cutoff, and e2e asserting submission. Opus: lead questions hold; wallet (Settings) sends parked with no card (D53), the same stranded line, and a lag-window estimate reused after the gate (D54). All fixed with failing-first tests: six cases fail on the pre-fix source.
- Round 2 (resumed): one P2, the reuse snapshot's pending set read after the build (D56); fixed failing-first, and the #60 pin that asserted the late read now asserts the pre-build view. Round-1 fixes confirmed.
- Round 3 (resumed): no new material finding; the loop converged.
- **Rest of the gate:** Chrome smoke at retry 0 on an armed build (`VITE_NULO_E2E_MIGRATION_FIXTURE`, `…TOKEN_SEEDS`, `…TOKEN_SEEDS_CONFIRM`, `…CSP_REPORT`), 51 files passed and 4 skipped (219 tests); `audit:vue`, `test:all`, `test:ci-gating` and `check:plans` exit 0. `audit:vue`'s build writes `dist/chrome`, the directory a running network suite loads, so it runs only after every e2e run.
