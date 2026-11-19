# Phase 11 (arc tests1): four tests on the landed stack

## As built

- **Shared fixture.** `fixtures/route-send.ts` takes E1's setup (the minter token, X's public Fee Juice, Developer Mode, the row rewritten to `[A, B]`, the phase section registered), the mint, the phase balance read, the sealed transaction row and the router's stored events (`routeEvents`, `readyHolder`). `readPhaseBalance` clears the recipient itself: a utility read scoped to R, an account outside the session, is refused. `sendTxCount` lives in the relay fixture, so `update-in-place.test.ts` keeps loading `fixtures/aztec` lazily.
- **Relay.** `RelayRule.after` lets a rule's first matches through; `entries: "every"` takes only a batch made wholly of the rule's methods, so a 429 span never takes a batch that carries `sendTx`; `fail()` returns a handle (`taken()`, `bodies()`); `release(answer)` answers parked requests instead of forwarding them. One unit test covers them.
- **Test 1's onsets.** A proof onset holds the proof's k-th witness read on A, waits 5 s and checks that nothing was sent and the record still reads `proving`, then resets or 429s it. A receipt onset holds mining and faults A's k-th receipt read carrying the accepted hash. With k = 2 the second witness read came, so `PROOF_ONSETS = 2` stands.
- **Test 3's pick.** The send asks the pick over the live row (`ExecutionService.pickSendEndpoint` reads it again), and `registry.sendRoute` builds a fresh route when the runtime's endpoint list differs. So after the edit, the pick asks B for the anchor, and the runtime is rebuilt for `[B, A]` only once the proof releases the chain guard. `setPrimaryEndpoint` does not wait on the offscreen, so the toast comes while the proof is parked.
- **Test 4.**
  - The first draft's model raised false alarms, each fixed in the model, not in the code:
    - the wrong-chain check read the model before the event;
    - a role given back to a returning endpoint counted as a fall (the code calls `setActive`, not `loseRole`);
    - the generator handed the role from an endpoint to itself;
    - it probed a lone endpoint.
  - One finding held: F4, D40, #1736 (closed, `known-limit`).
  - The clock steps had no 20 min step, so an early hold-down reset (at 15 min held) went unseen. Adding one made it red.

## Runs

- **Test 1**, Chrome, proverless, retry 0. Wall time includes the build and the sandbox.

  | Run | Seed | Onset | Fault | Result |
  |---|---|---|---|---|
  | 1 | 651660614 | receipt | kill 2.0 s | Red at the closing balance read: SCOPE_VIOLATION, recipient R still set. Every routing assertion before it held; sendTx A 1, B 0. Fixed in `readPhaseBalance`. |
  | 2 | 441604806 | proof, k = 2 | kill 15.2 s | Green. Test 66.5 s, wall 131 s. Mined 29 s after the send began; sendTx A 0, B 1. |
  | 3 | 528905624 | proof, k = 1 | 429 ×2 | Green. Test 60.2 s, wall 132 s, load 108. Mined 17 s after; sendTx A 0, B 1. |
  | 4 | 490360462 | receipt, k = 3 | kill 6.0 s | Green. Test 58.0 s, wall 132 s, load 101. Mined 17 s after; sendTx A 1, B 0. |

  Runs 2 to 4 ran before `sendTxCount` moved into the relay fixture. That was a pure move with no behaviour change.
- **Test 4**:
  - 400 × 250 events run in about 0.3 s.
  - Coverage across all seeds: down 3193, recovered 3116, behind 1887, wrong-chain 1136, returned 171, doubled 127, reset 70, floor fell 1561. The floor in the test is about a third of each.
  - Five mutations of `endpoint-health.ts`, each reverted with `git checkout`, all red:
    - a probe admits an endpoint one block under the floor;
    - the hold-down resets at 15 min held;
    - the floor never falls;
    - no return probe passes;
    - the hold-down never resets.
- **Test 2**, Chrome, v1.2.0 to a candidate built at `7d040696a` (the later changes are under `tests/` only), the new case selected by name, retry 0:
  - Runs 1 and 2: red in setup. The release's app window read the account's public Fee Juice as zero ("no balance"), because 1.2.0 caches gas balances for 5 min and only a Send mount forces a read; the first case mounts Send after funding (`pickPreferences`), the pending case did not. Run 2 added the disabled row's text to `selectFeeMethod`'s timeout, which named the reason. Fixed by one Send mount after the funding.
  - 1.2.0's add-endpoint flow probes the new endpoint, so the claim on the release is no `sendTx` on B, not no request.
  - Runs 3 to 5: green. Test 74.1 s, 77.8 s, 72.7 s; wall 138 s, 151 s, 137 s; load 17 to 66.
- **Test 3**, Chrome, proverless, retry 0:
  - Runs 1 to 3: green. Test 61.2 s, 62.3 s, 64.4 s; wall 121 s, 126 s, 131 s.
  - Every run: B made primary about 206 ms into the parked read. In both contexts A received only `getNodeInfo` and `getChainTips`.
  - After the diff review narrowed the PXE control to `getPrivateLogsByTags`, run 4 was green in 67.6 s. B refused a lone `getPrivateLogsByTags` batch in the PXE step and a lone `getContract` in the wallet step.

## The diff review

- **Codex `01a1b3ba`, round 1: revise, 7 P2 and 1 P3.**
  - `sendMint` was typed `Promise<Promise<PgResult>>`. An async function flattens the promise it returns, so `await sendMint()` waited for the result, and test 1's fault span began only after the send. The span now starts at its onset.
  - Other fixes:
    - the property model tracks tips and admission itself;
    - `readyHolder` reads the holder's last state;
    - the moved read is matched by method, params and order;
    - the anchor batch is matched with its boundaries;
    - a final send count;
    - `afterEach` cleanup.
- **Opus 5.5, fresh: approve with changes.**
  - "Its receipt is read where it went" was vacuous: a `sendTx` body carries the hash it submits. It now counts `getTxReceipt` calls.
  - The PXE control could lose its one refusal to the background's finality read, which also sends `findLeavesIndexes`. It now refuses only `getPrivateLogsByTags`, which only the PXE sends.
  - The return run that survives a fall is known limit #1737.
- **Codex round 2: revise, 5 P2.**
  - two requests in one millisecond (a shared sequence now orders them);
  - a receipt onset clamped onto a later read (now armed before the send);
  - the log guard read the filtered trail;
  - a restore outliving teardown;
  - cleanup not exception-safe.
- **Lesson.** A mutation run in a shared worktree edits the source an e2e build or a reviewer may be reading at that moment. Run mutations only while no build and no review is in flight.
- **Codex round 3: revise, 1 P2.** A failed gate release still skipped the pending restore. Fixed with Codex's own `try`/`finally`. Not re-reviewed: the loop stops at three rounds.
- **Test 3's sensitivity.** Mutated `endpoint-health.ts` to drop the floor guard: no `behind` on a probe below the floor, and `atFloor` ignoring the floor. The run was red at the PXE control. B's refused `getPrivateLogsByTags` moved, and A read `ready` instead of `behind`. Reverted with `git checkout`, no build or review in flight.
- **Test 1, seed 347737410** (receipt, k = 1, 429 ×17), after the review fixes: green, test 64.4 s. The rule armed before the send took the first receipt read, which carried the hash.

## Gate (on `71ce00c46`)

- `bun run lint`, `bun run typecheck:all` and `bun run test:all` (156 s; aztec-runtime 568, extension 17859) all passed.
- Every e2e ran at retry 0 through `e2e:agent` on Chrome:

  | Suite | Runs | Test time |
  |---|---|---|
  | Test 1 | seeds 441604806, 528905624, 490360462 | 62.6 s, 50.8 s, 52.1 s |
  | Test 3 | three | 61.0 s, 65.6 s, 65.3 s |
  | Test 2 | three, v1.2.0 to a candidate built at `71ce00c46` | 74.9 s, 78.3 s, 85.6 s |
  | E1 (failover send) | one | 193.0 s, wall 270 s |
  | Sandbox suite | one, 8 of 8 | 300.1 s, wall 365 s |
