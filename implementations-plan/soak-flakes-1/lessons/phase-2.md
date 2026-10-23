# soak-flakes-1: phase 2 (the restart comes one millisecond after the dead worker)

All at retry 0, Node launcher.

- **Step 1, the zero-gap restart:** test 2 with `Date` held from entry and no move before the restart. Red in 3 of 3 runs: 1 failed, 3 passed, `expected 'simulating' to be 'failed'` at the poll (line 138 with the four inserted lines; line 134 at base).
- **Step 2, the restart at +1 ms** plus `expect(qLive.createdAt).toBe(restartedAt)`: 4 of 4 green in 3 of 3 runs, and again 3 of 3 after the hook fix below.
- **Mutation, run once and reverted:** `>` in place of `>=` at `reaper.ts:250` turned test 2 red at line 154 (`expected 'failed' to be 'simulating'`): the record created in the cutoff's millisecond was swept. The test now pins both sides of the boundary.
- **Deviation:** cleanup is `onTestFinished(() => { vi.useRealTimers() })`, not a `try`/`finally`. Same guarantee, pass or fail, without re-indenting the test. The first form, an expression arrow, failed `typecheck:all`: TS2322, `VitestUtils` is not `Awaitable<void>`. The block body fixed it.
- **Gate:** `bun run lint` exit 0; `bun run typecheck:all` exit 0; `vitest run src/wallet/services/operation-journal`: 10 files, 199 tests, exit 0. The composition layer (`vitest run composition.test`): 16 files, 164 tests, exit 0.
