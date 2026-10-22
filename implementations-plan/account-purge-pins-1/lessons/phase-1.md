# account-purge-pins-1: phase 1 (the pins)

- 2026-10-22 step 1: #1089 closed by #1092, merge commit `a552a6187` on `origin/dev` at 23:18Z
  (about 25 minutes of bounded polling).
- Step 2: merged `origin/dev`; BASE `50eac0012`. `service.test.ts` at BASE: 62 passed. The hoisted
  `parkRowRead(api, rowKey)` is at module scope as in `016e5e407`; since `c49430a6d` nothing under
  `account/`, `sealed-entity-storage.ts` or `wallet-core/src/utils/` changed but this test file
  (#1051 has not landed), so F2-F6 hold.
- Step 3: the change map as planned, commit `a402d1efe`; the file reports 63 passed.
- Step 4, each control a scratch edit of the test file, run on the `describe`, then reverted:
  - C1 (`tupleLocks.withLock` runs `fn` directly for every caller): 4 of 4 red,
    `expected +0 to be 1`, 22, 5, 2 and 2 ms.
  - C2 (a direct `withLock` assigned after the wrapper, so the purge's request is never seen):
    4 of 4 red, same message, 24, 5, 3 and 3 ms.
  - C3 (`purgeId`, `delete` and `deleteStorageId` remove only the plaintext form): 4 of 4 red,
    `expected [ Array(1) ] to deeply equal []`.
  - C4 (only the third `withLock(rowId)` call run directly: the delete's, in both reconcile
    cases): the fourth case red, `expected +0 to be 1`; the other three green.
  - The product, reverted: 4 of 4 green.
- Step 5, the soak beside the running lanes: 100 runs of the file at retry 0, `-P4`; 100 logs read
  `Tests  63 passed (63)`. load1 136 at the start, 117 at the end; file durations 5.4 s to 36.5 s.
