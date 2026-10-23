# soak-flakes-1: phase 1 (the flag is read where it is used)

All at retry 0, Node launcher, on `soak-flakes-1-a1` (base `0e4bec132` plus the plan commit; `origin/dev` had not moved).

- **Step 2, base builds.** Chrome and Firefox, flag unset and set: exit 0, 485 JS files each, every hash equal to the planning builds of the same commit.
- **Step 3, fetch-delay probe on base** (`DIAG_FETCH_DELAY_MS=5000`, one invocation per flag-on test, 3 rounds): 9 of 9 timed out at 5000 ms, each with 1 fetch counted before the timeout.
- **Step 4, contention on base** (vitest on CPU 187 beside 40 owned busy loops, 189 s): 3 failed, 22 passed. Two flag-on tests timed out (5150 and 5342 ms). The third (4793 ms) failed `expected "vi.fn()" to be called 1 times, but got 3 times`: the timed-out tests' continuations sent into the shared `sendMessage` mock. The unflagged tests took 70 to 1232 ms. The loops were gone afterwards.
- **Step 6, on the fix.**
  - The same 9 probe invocations: 9 of 9 green, 0 fetches inside each flag-on test.
  - The copy's whole file: 25 of 25 green, 0 fetches.
  - Contention (106 s): 25 of 25 green. The flag-on tests took 161, 61 and 1 ms; the slowest unflagged session test took 304 ms. The loops were gone afterwards.
- **Step 7, builds on the fix:** all four byte-identical to base.
- **Gate:** `bun run lint` exit 0 (4 infos, all in files this arc does not touch); `bun run typecheck:all` exit 0; `vitest run src/wallet/services/wallet-sdk`: 37 files, 491 tests, exit 0.
