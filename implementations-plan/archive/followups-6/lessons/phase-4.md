# Phase 4: proof (after)

## Attempt 1, at 1e8f648 (2026-10-12): failed on one flake outside the lane

Release-shaped and armed copies rebuilt at 1e8f648; the four whole-suite runs started 15 s apart on one host, all four at once, retry 0. `bun run test:all`, `bun run test:ci-gating` (526 pass), `bun run lint` and `bun run typecheck:all` ran beside them: all exit 0.

| Run | Files | Tests | Against Phase 0 |
|---|---|---|---|
| artifact, Chrome | 49 passed, 4 skipped (53) | 208 passed, 15 skipped | `egress-guard` 7 skipped → 7 passed; `shipped-token-list` added, 1 passed; suite 1347 → 1369 s of test time |
| artifact, Firefox | 51 passed, 2 skipped (53) | 205 passed, 18 skipped | the same two changes; 1886 → 1758 s |
| armed, Chrome | 48 passed, **1 failed**, 4 skipped (53) | 212 passed, **1 failed**, 10 skipped | `shipped-token-list` skipped |
| armed, Firefox | 51 passed, 2 skipped (53) | 210 passed, 13 skipped | `shipped-token-list` skipped |

The red: `security.test.ts` › "change password succeeds and unlocks with new password", `TimeoutError: Waiting failed: 15000ms exceeded` at `waitForLockScreen` (`fixtures/helpers.ts:83`, the route wait after the session record had already gone), from `lockWallet` at `security.test.ts:68`; the test took 24.5 s. Rerun alone at retry 0 on a fresh copy of the same armed build: 4/4 passed, that test 9.4 s. The file is outside this change, and the armed mode's launch path is unchanged by it (`liveHost` is undefined there, so the drivers' arguments and the stand-in are what they were). Classified as a load flake under four concurrent suites; filed as #319 (deduped: no issue named `lockWallet`, `waitForLockScreen` or the test). Per the plan this attempt's gate **failed**; the gate is run again at the final head after the fix loop.

## Fix loop

Codex round 1 (approve, two low findings) and the Opus review (no correctness bugs, three low findings) ran beside attempt 1; all five were applied in 06755d0, and the live spec ran green once per browser after it. Codex round 2 on the fix diff: approve, no new material findings. Records in `plan.md` § Audit record, Post-implementation.

## Attempt 2, at the final head 06755d0 (2026-10-12): pass

`origin/dev` had not moved (58d6cbc). Copies rebuilt at 06755d0; the same four runs, again all four at once, retry 0. `bun run test:all`, `bun run test:ci-gating` (526 pass, 0 fail), `bun run lint`, `bun run typecheck:all`: all exit 0.

| Run | Files | Tests | Test time |
|---|---|---|---|
| artifact, Chrome | 49 passed, 4 skipped (53) | 208 passed, 0 failed, 15 skipped | 1338 s (Phase 0: 1347 s) |
| artifact, Firefox | 51 passed, 2 skipped (53) | 205 passed, 0 failed, 18 skipped | 1757 s (Phase 0: 1886 s) |
| armed, Chrome | 49 passed, 4 skipped (53) | 213 passed, 0 failed, 10 skipped | 1249 s |
| armed, Firefox | 51 passed, 2 skipped (53) | 210 passed, 0 failed, 13 skipped | 1719 s |

File by file against Phase 0's artifact tallies, the only changes on both browsers: `egress-guard.test.ts` 7 skipped → 7 passed (the control spec runs in artifact mode now), and `shipped-token-list.test.ts` added, 1 passed. In both armed runs the live spec skipped and the control spec passed. Every launch closed under the egress check, so no undeclared host, no canary connection, and no guard record for `LIVE_NODE_HOST` in the live spec's launch. `security.test.ts` passed in both armed runs (#319 stays open: one red under the same load in attempt 1).

Gate: **pass**.
