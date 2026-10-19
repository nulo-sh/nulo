# Phase 3: #612, the dApp call that expects no popup reports why it timed out

- `callExpectingNoPopup` catches its `waitForPgResult` failure, logs one `[pg-diag]` line, runs `dumpDeepDiagnostics` and rethrows, as `waitForPgResults` already did. `waitForPgResult` stays silent, and its doc says why: `runApprovedPgCall` races it against the execute window and swallows its timeout.
- #612's path is gone since #701 (`view-executor.ts` refuses `profileTx` before any PXE step); the test asserts that refusal. I4 stays unverifiable: the failing run kept no wallet log, which is what the dump now gives the next one.
- **Gate.** `bun run lint` 0, `bun run typecheck:all` 0; `network/sim-methods.test.ts` with `NULO_E2E_PROVERLESS=1`, retry 0: Chrome 3/3 (57 s), Firefox 3/3 (86 s).
