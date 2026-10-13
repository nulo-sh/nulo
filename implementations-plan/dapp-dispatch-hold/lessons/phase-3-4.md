# Phases 3 and 4: the network proof, the review loop, the shots

## Phase 3 (2026-10-13)

- Lint attempt 1 failed in the complexity-baseline check: the new `readDappExecuteOutcomes` repeated the line `return page.evaluate(async () => {`, which anchors the accepted directive on `readDappExecuteRecords`. An anchor must be unique in its file. Fixed by binding the evaluate result to a name. The directive and the manifest are untouched.
- The aztec CLI's bind error on the run's anvil port at boot is expected (`agent.sh` prints why); it is not a port clash.
- Targeted files at retry 0, armed `NULO_E2E_PROVERLESS=1`: Chrome 9 files, 17/17; Firefox 10 files, 18/18 (`firefox-background-restart` is Firefox-only). `verify-hold.test.ts` 5/5 on both.

## Implementation review, round 1 (2026-10-13)

- Codex (gpt-6.1-sol, high; session `01a1334a`): reject. Its blocker reproduced, in memory, a throwing termination leaving a refused session's hold unsettled. Fixed with the `endSession` seam. The new `test.each` goes red on all three triggers with the seam's drop removed.
- A held send on a refused session whose termination threw files no second row: queued rows are filed only for a stamped session, and refusal deletes the stamp. The test asserts exactly that, not a W row.
- Opus (general-purpose): conditional approve. Its finding 1 was a real gap in the mutation list. Deleting the drop on a failed establishment kept every test green, because the navigation-fail case settles the hold through termination. Test 23 now uses the "replaced" approval path, the one failure that terminates nothing; it goes red as M8.
- Two Opus findings were rejected, with reasons in plan.md § Audit verdicts.
- A transient lint red after the round-1 edits was only the formatter on the new `test.each`. The warnings and info lines Biome prints across the tree are pre-existing, and lint exits 0 on them.

## Implementation review, round 2 (2026-10-13)

- Codex (session `01a1335e`): reject, one major: establishment's id-based liveness and termination. It was real. The lock rule made a mid-establishment end reachable, and the regression test reproduced the successor's loss before the fix.
- The first version of the test proved only the termination binding. With liveness by id it stayed green, because the stale establishment stamped the same profile as the successor. The harm needs a successor under another profile, so the test unlocks into p2, whose row the app also has. Each binding then has its own red (M9 liveness by id, M10 termination by id).
- Rebinding establishment broke two harnesses whose mocked handler kept ids, not session objects (`background.admission.test.ts`, `background.refusal-teardown.test.ts`). They now store the object establishment receives and answer `getSession` with it, as upstream does.
