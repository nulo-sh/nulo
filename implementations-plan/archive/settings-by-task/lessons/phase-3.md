# P3 — E2E and docs: lessons log

## Edits

- `openAccountState(page, section)` in `apps/extension/tests/e2e/fixtures/helpers.ts` clicks Developer, then `setting-nav-advanced-account-state`, then the child row, waiting for each hash. The four network callers use it.
- `apps/extension/tests/e2e/appearance.test.ts` held the "`/privacy` has no page" clause twice: at the animations test (the plan cites only the theme test's copy) and at the skipped theme test. Both went.
- The About row is in the hub's presence loop, so the separate href check went with it; the About test clicks it by testid.

## Suite runs

The host carried a load average of about 250 on 192 cores through these runs (other sessions' suites), so timed waits had less headroom than usual. Every run below passed on its first attempt; neither smoke log nor any network log holds a `PASSED ON RETRY` line.

| # | Command | Result | Duration |
|---|---|---|---|
| 1 | `bun run lint` | exit 0 (Biome's existing 27 warnings, none in a changed file; complexity baseline OK) | ~5 s |
| 2 | `bun run typecheck:all` | exit 0 | 51 s |
| 3 | `bun run test` | exit 0: 699 files passed, 3 skipped; 10 372 tests passed | 166 s |
| 4 | armed `bun run build:chrome` | exit 0 | 17 s |
| 5 | `NULO_E2E_MIGRATION_FIXTURE=1 bun run test:e2e` (Chrome) | exit 0: 45 files passed, 3 skipped (the two Firefox-only files and the probe); 190 tests passed, 11 skipped. `settings-routes` 4/4, `wallet-lock` 2/2, `navigation` 5/5 | 1 257 s |
| 6 | armed `bun run --cwd apps/extension build:firefox` | exit 0 | 11 s |
| 7 | `NULO_E2E_BROWSER=firefox NULO_E2E_MIGRATION_FIXTURE=1 bun run test:e2e` | exit 0: 47 files passed, 1 skipped (the probe); 191 tests passed, 10 skipped. `settings-routes` 4/4, `wallet-lock` 2/2, `navigation` 5/5 | 1 805 s |
| 8 | `NULO_E2E_PROVERLESS=1 bun run e2e:agent` on `authwit-lifecycle`, `popup-escape-layered`, `senders-advanced`, `selfpay-phase`, `incoming-arrival` (Chrome) | exit 0: 5 files, 14 tests passed (1, 2, 3, 1, 7) | 857 s |
| 9 | the same five files with `NULO_E2E_BROWSER=firefox` | exit 0: 5 files, 14 tests passed | 813 s |
| 10 | `NULO_E2E_PROVERLESS=1 NULO_E2E_RETRY=0 bun run e2e:agent` on `lock-cancels-dapp-send`, `profile-switch-sweeps-transfer` (Chrome) | exit 0: 2 files, 2 tests passed at retry 0 | 221 s |
| 11 | the same two files with `NULO_E2E_BROWSER=firefox` | exit 0: 2 files, 2 tests passed at retry 0 | 253 s |
| 12 | `bun run e2e:reap` | nothing to reap: no owned run, no orphaned data dir or Firefox launch | <1 s |

## The Tab lap

Both browsers walked the same 27 stops from the card: the 17 hub stops in DOM order (`setting-nav-profile` … `setting-nav-lock` → `backup-link-btn` → `change-password-link-btn` → … → `delete-profile-link-btn`), the four nav tabs, `BODY` (the wrap), then the header's five controls. That fits the test's 50 presses with room for a second start. No Firefox difference came up in this phase's specs.
