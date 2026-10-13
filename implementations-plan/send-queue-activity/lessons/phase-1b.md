# Arc 1b — lessons

Arc 1b ships on OA-3 = A, OA-4 = B and OA-5 = A, so Phase 1.2 (the chain-tip gate) is built here too.

## Phase 1b.1: the parked slot and origin order

- **`keep` hands on, `release` goes inert.** `ExecutionMutex.keep(release)` runs the hold's hand-on and returns a `SlotReservation`; the hold's own release is then a no-op, so `runInSlot`'s `finally` may call whichever release it holds last without double-resolving a tail. The keeper map is cleared by `release` too, so `keep` after a release and a second `keep` both throw one message.
- **The reservation owns only the depth count.** `redeem` refuses a used or dropped reservation and one presented in another lane or origin; `drop` and the final release each return the depth once (`DepthClaim.returned`). An aborted re-entry chains its tail exactly as a first acquire does; the reservation it consumed is returned by that chained release, and the caller's `drop` is a no-op.
- **Origin order is a line, not a parked tail (deviation, D45).** The plan kept "the tail of the origin's parked chain" and let a request re-enter once the earlier one had re-entered. A request that has re-entered but is not yet re-granted must still count as ahead, or a later request granted in that window starts first. `joinOriginLine` gives each send a place, keyed `profile:chain|origin`, from its first grant until it starts (or ends), and `earlierDone` resolves when every earlier place has left. A send that leaves early (throws, is cancelled) resolves its place in `finally`, so it never strands the line.
- **The silent path reads Queued while it waits (deviation, D46).** `parkSlot` moves a `pending` record back to `queued` (`transitionIfStage(["pending"] → queued)`), the back-edge arc 3b added for OA-1 = A; the claim takes it to `pending` again. The plan's "Preparing..." line predates OA-1's answer.

## Phase 1.2: the chain-tip gate

- **The tip is the runtime node's proposed tip, single attempt.** `readChainTip(networkId)` reads `getSingleAttemptNodeForUrl(networkInfoFrom(network).rpcUrl).getBlockNumber()`: no PXE chain guard (it would wait behind a proof), no retry, the silent RPC logger (D27). A read is bounded at 3 s, deduplicated per network, and a failed or timed-out read lets everything observed by then run.
- **The gate takes a network id (deviation, D47).** Tips are per network, so `unconfirmed` and `wait` take `networkId` beside the scope; the plan's signature had only the scope.
- **Observations come from the settle handler only.** `TransactionService`'s update leaving Pending for a block calls `observe`; restore emits no such event, so imported rows never hold a send (D7). The estimate path answers queued while an observation is unconfirmed and refreshes the tip for the popup's next ask.
- **Revert check:** removing the gate from `takeTurn` fails the three never-happens cases in `transfer-executor.test.ts`; restored.

## Phase 1b.2: the waiter

- **Waiters ignore waiters and estimates.** `waiterBlocked` is true for any holder in scope that is sent, external, or earlier, and for any pending row of the scope's chain inside `SUBMITTED_HOLD_MS`; ticketed rows need no exclusion, since a sent holder already blocks. A waiter holds an empty key set, which no ticket's keys intersect, so no Send-page send ever waits for a dApp send (D-orch-1b-1).
- **The pre-claim failure lives in the lane.** `failUnclaimed(queuedJournalId, error)` fails a record still `queued` or `pending` and skips the cancel sentinel; `runInSlot` calls it whenever it throws with no `journalId`. A claimed record keeps its existing catch.
- **Composition stage log.** A waiting record's heartbeat touch re-emits its stage, so the composition harness logs stage changes only.
