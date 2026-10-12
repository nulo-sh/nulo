# e2e-followups-4 — phase 3 (prove) log

## Cells on the fixed tree (2026-10-12, 00:37 to 00:53 UTC)

Phase 1's four build dirs, reused: `origin/dev` had not moved (`6488b1b`), and the fix touches only `apps/extension/tests/`. No probe. Same cells, counts, `taskset -c 0,1` and `--retry=0` as Phase 1, one run at a time. Lane `wallet-followups-5` and another worktree held network ports on this host throughout.

| Cell | Slots | Green on the first attempt | Replaced attempts | 1-minute load, min to max |
|---|---|---|---|---|
| C1 release build, artifact mode (the nightly) | 21 | 21 | 0 | 33.0 to 93.5 |
| C2 armed build, guarded (the PR lane) | 21 | 21 | 0 | 35.5 to 57.3 |
| C3 armed build, artifact mode | 21 | 21 | 0 | 70.9 to 92.5 |
| F1 Firefox release build, artifact mode | 1 | 1 | 0 | 76.9 |
| F2 Firefox armed build, guarded | 1 | 1 | 0 | 66.9 |

Before the fix the same cells read C1 18 of 21 red, C3 16 of 21, F1 red (`lessons/phase-1.md`). Each slot-0 whole-file run passed all five tests.

### Per attempt

| cell | slot | att | rc | tests | load |
|---|---|---|---|---|---|
| C2 | 0 | 1 | 0 | 5 passed (5) | 54.19 |
| C2 | 1 | 1 | 0 | 1 passed , 4 skipped (5) | 56.07 |
| C2 | 2 | 1 | 0 | 1 passed , 4 skipped (5) | 52.81 |
| C2 | 3 | 1 | 0 | 1 passed , 4 skipped (5) | 48.47 |
| C2 | 4 | 1 | 0 | 1 passed , 4 skipped (5) | 47.63 |
| C2 | 5 | 1 | 0 | 1 passed , 4 skipped (5) | 48.04 |
| C2 | 6 | 1 | 0 | 1 passed , 4 skipped (5) | 56.73 |
| C2 | 7 | 1 | 0 | 1 passed , 4 skipped (5) | 50.83 |
| C2 | 8 | 1 | 0 | 1 passed , 4 skipped (5) | 52.72 |
| C2 | 9 | 1 | 0 | 1 passed , 4 skipped (5) | 50.44 |
| C2 | 10 | 1 | 0 | 1 passed , 4 skipped (5) | 49.43 |
| C2 | 11 | 1 | 0 | 1 passed , 4 skipped (5) | 51.12 |
| C2 | 12 | 1 | 0 | 1 passed , 4 skipped (5) | 57.34 |
| C2 | 13 | 1 | 0 | 1 passed , 4 skipped (5) | 52.01 |
| C2 | 14 | 1 | 0 | 1 passed , 4 skipped (5) | 50.27 |
| C2 | 15 | 1 | 0 | 1 passed , 4 skipped (5) | 47.09 |
| C2 | 16 | 1 | 0 | 1 passed , 4 skipped (5) | 46.07 |
| C2 | 17 | 1 | 0 | 1 passed , 4 skipped (5) | 44.31 |
| C2 | 18 | 1 | 0 | 1 passed , 4 skipped (5) | 39.19 |
| C2 | 19 | 1 | 0 | 1 passed , 4 skipped (5) | 35.51 |
| C2 | 20 | 1 | 0 | 1 passed , 4 skipped (5) | 53.90 |
| C1 | 0 | 1 | 0 | 5 passed (5) | 50.52 |
| C1 | 1 | 1 | 0 | 1 passed , 4 skipped (5) | 32.98 |
| C1 | 2 | 1 | 0 | 1 passed , 4 skipped (5) | 43.18 |
| C1 | 3 | 1 | 0 | 1 passed , 4 skipped (5) | 38.54 |
| C1 | 4 | 1 | 0 | 1 passed , 4 skipped (5) | 37.30 |
| C1 | 5 | 1 | 0 | 1 passed , 4 skipped (5) | 33.24 |
| C1 | 6 | 1 | 0 | 1 passed , 4 skipped (5) | 40.14 |
| C1 | 7 | 1 | 0 | 1 passed , 4 skipped (5) | 35.35 |
| C1 | 8 | 1 | 0 | 1 passed , 4 skipped (5) | 34.96 |
| C1 | 9 | 1 | 0 | 1 passed , 4 skipped (5) | 35.21 |
| C1 | 10 | 1 | 0 | 1 passed , 4 skipped (5) | 48.71 |
| C1 | 11 | 1 | 0 | 1 passed , 4 skipped (5) | 46.35 |
| C1 | 12 | 1 | 0 | 1 passed , 4 skipped (5) | 45.36 |
| C1 | 13 | 1 | 0 | 1 passed , 4 skipped (5) | 42.95 |
| C1 | 14 | 1 | 0 | 1 passed , 4 skipped (5) | 68.39 |
| C1 | 15 | 1 | 0 | 1 passed , 4 skipped (5) | 77.65 |
| C1 | 16 | 1 | 0 | 1 passed , 4 skipped (5) | 70.48 |
| C1 | 17 | 1 | 0 | 1 passed , 4 skipped (5) | 69.07 |
| C1 | 18 | 1 | 0 | 1 passed , 4 skipped (5) | 77.22 |
| C1 | 19 | 1 | 0 | 1 passed , 4 skipped (5) | 86.68 |
| C1 | 20 | 1 | 0 | 1 passed , 4 skipped (5) | 93.53 |
| C3 | 0 | 1 | 0 | 5 passed (5) | 90.35 |
| C3 | 1 | 1 | 0 | 1 passed , 4 skipped (5) | 91.91 |
| C3 | 2 | 1 | 0 | 1 passed , 4 skipped (5) | 92.12 |
| C3 | 3 | 1 | 0 | 1 passed , 4 skipped (5) | 92.50 |
| C3 | 4 | 1 | 0 | 1 passed , 4 skipped (5) | 90.58 |
| C3 | 5 | 1 | 0 | 1 passed , 4 skipped (5) | 88.02 |
| C3 | 6 | 1 | 0 | 1 passed , 4 skipped (5) | 85.84 |
| C3 | 7 | 1 | 0 | 1 passed , 4 skipped (5) | 81.04 |
| C3 | 8 | 1 | 0 | 1 passed , 4 skipped (5) | 80.90 |
| C3 | 9 | 1 | 0 | 1 passed , 4 skipped (5) | 82.35 |
| C3 | 10 | 1 | 0 | 1 passed , 4 skipped (5) | 78.77 |
| C3 | 11 | 1 | 0 | 1 passed , 4 skipped (5) | 78.07 |
| C3 | 12 | 1 | 0 | 1 passed , 4 skipped (5) | 78.81 |
| C3 | 13 | 1 | 0 | 1 passed , 4 skipped (5) | 80.48 |
| C3 | 14 | 1 | 0 | 1 passed , 4 skipped (5) | 80.91 |
| C3 | 15 | 1 | 0 | 1 passed , 4 skipped (5) | 81.81 |
| C3 | 16 | 1 | 0 | 1 passed , 4 skipped (5) | 80.46 |
| C3 | 17 | 1 | 0 | 1 passed , 4 skipped (5) | 79.60 |
| C3 | 18 | 1 | 0 | 1 passed , 4 skipped (5) | 75.65 |
| C3 | 19 | 1 | 0 | 1 passed , 4 skipped (5) | 72.72 |
| C3 | 20 | 1 | 0 | 1 passed , 4 skipped (5) | 70.86 |
| F1 | 0 | 1 | 0 | 5 passed (5) | 76.88 |
| F2 | 0 | 1 | 0 | 5 passed (5) | 66.88 |
