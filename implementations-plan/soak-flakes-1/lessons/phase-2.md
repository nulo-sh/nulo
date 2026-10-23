# soak-flakes-1: phase 2 (the restart comes one millisecond after the dead worker)

All at retry 0, Node launcher.

- **Step 1, the zero-gap restart:** test 2 with `Date` held from entry and no move before the restart. Red in 3 of 3 runs: 1 failed, 3 passed, `expected 'simulating' to be 'failed'` at the poll (line 138 with the four inserted lines; line 134 at base).
- **Step 2, the restart at +1 ms** plus `expect(qLive.createdAt).toBe(restartedAt)`: 4 of 4 green in 3 of 3 runs, and again 3 of 3 after the hook fix below.
- **Mutation, run once and reverted:** `>` in place of `>=` at `reaper.ts:250` turned test 2 red at line 154 (`expected 'failed' to be 'simulating'`): the record created in the cutoff's millisecond was swept. The test now pins both sides of the boundary.
- **Deviation:** cleanup is `onTestFinished(() => { vi.useRealTimers() })`, not a `try`/`finally`. Same guarantee, pass or fail, without re-indenting the test. The first form, an expression arrow, failed `typecheck:all`: TS2322, `VitestUtils` is not `Awaitable<void>`. The block body fixed it.
- **Gate:** `bun run lint` exit 0; `bun run typecheck:all` exit 0; `vitest run src/wallet/services/operation-journal`: 10 files, 199 tests, exit 0. The composition layer (`vitest run composition.test`): 16 files, 164 tests, exit 0.

## Fix loop

- **Round 1.** Codex (gpt-6.1-sol, high): `fix these: 2`, both comment-only.
  1. The flag comment moved into `admitContentMessage` repeated the guard's comment a few lines below. Accepted: it keeps only the build-time rationale, why the read sits there, and the cross-origin key-exchange limit.
  2. The guard's comment said an undefined `frameId` (a non-tab sender) is a subframe, but `isSubframeSender` returns false for both. Accepted, though it predates the diff: "a tab sender with any other defined `frameId` is a subframe".

  Codex found no functional or security regression. The Opus diff review, beside it, reported the same two and added two of its own:
  3. A comma splice in the new comment. Accepted.
  4. "Moved once, by the least that holds" hid why the step must be exactly 1 ms. Accepted: the comment now says the dead worker's records sit one below the cutoff, and the restart's at it.

  Not a fix: if test 2 timed out before its +1 step, its orphaned body could re-mock `Date` after the cleanup. That needs a 60 s timeout in a run that is already red, and tests 3 and 4 need no moving clock. After the fixes: lint exit 0, typecheck exit 0, both files 29 of 29, and the four builds still byte-identical to base.
- **Round 2** (resumed): Codex `clean`. All accepted fixes verified; no new finding. The loop converged.
