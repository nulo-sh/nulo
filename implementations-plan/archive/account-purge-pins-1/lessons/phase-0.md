# account-purge-pins-1: phase 0 (planning)

- 2026-10-22 baseline: `service.test.ts` 62 passed at `c49430a6d` (load1 120).
- 2026-10-22 scratch base: `c49430a6d` with #1089's arc 1 commit `016e5e407` applied uncommitted
  (`git cherry-pick -n`), so the prototype builds on the hoisted `parkRowRead(api, rowKey)`.
  Every probe below edits `service.test.ts` only and was reverted (`git checkout --`); the tree was
  clean after.
- Prototype (plan change map) on the product: the three cases green, 47 ms of test time.
- C1, the issue's control (the instance's `tupleLocks.withLock` runs `fn` directly, every caller):
  3 of 3 red, `expected +0 to be 1`, 32, 8 and 4 ms.
- C2, a purge that never calls `withLock` (a direct `withLock` assigned after the wrapper):
  3 of 3 red, same message, 32, 7 and 5 ms. With `await requested.promise` in place of the race:
  3 of 3 red only by `Test timed out in 5000ms`.
- C3, lock intact, `storage.purgeId` and `storage.delete` remove only the plaintext key:
  `clearChainState` and reconcile red, `expected [ Array(1) ] to deeply equal []`;
  `purgeForProfile` green, since its raw pass deletes the sealed row by storage id.
- The current pins (`016e5e407` shape) under C1: 3 of 3 green, three runs. Under C3: 3 of 3 green.
  This reproduces #1091.
- Reconcile, one of its two lock calls run through directly (call 1 is the rename's): the check
  (call 2) bypassed reds by the queue check, since the wrapper still sees the call; the delete
  (call 3) bypassed stays green. A source-level removal of the check moves the signal to the
  delete's request, which is queued: green too. Either lock alone orders this schedule (plan D5).
- 2026-10-22 Codex r1 (gpt-6.1-sol, high, session `01a165c6`): conditional approve, two findings
  (the #1089 wait unbounded and keyed on a subject pattern; the soak counting a run that executed
  nothing), both applied; D1-D3, C1-C3 upheld; D5 kept with a narrower reason. The closing-PR
  lookup was checked on #1086 (`closedByPullRequestsReferences` → #1088 → `c49430a6d`).
- 2026-10-22 Opus 5.5 (Plan): conditional approve, five findings: (1) reconcile's delete lock
  (`:1291`) is unpinned on its own, add a case or file it; (2) `rowLocks` has one caller;
  (3) quality bar (2) overclaims for `purgeForProfile` under C3; (4) F2's "one commit";
  (5) the signal's attribution and a bound-reference false red. All taken.
- 2026-10-22 second prototype (same scratch base, reverted): `rowLocks` inlined, a fourth case that
  parks the reconcile in a purge subscriber (after its check) and reuses `purgeBehindRename`.
  Product: 4 green. C1: 4 red (`expected +0 to be 1`). C2: 4 red, same. C3 widened
  (`purgeId`, `delete` and `deleteStorageId` remove only the plaintext form): 4 red (`toEqual([])`).
  C4, only the third `withLock(rowId)` call run directly (the delete's, in both reconcile cases):
  case 3 green, the fourth case red by the queue check.
- 2026-10-22 Codex r2 (resumed): conditional approve. Took the fourth case (revising r1); asked
  for the staging race's winner asserted, the `:1281` reach stated, the count as BASE plus 1, and
  `deleteStorageId`'s storage-id argument handled. All applied.
- 2026-10-22 Codex r3 (resumed, verification): approve, no new material defect.
