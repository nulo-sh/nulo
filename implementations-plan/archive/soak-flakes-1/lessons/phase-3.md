# soak-flakes-1: phase 3 (acceptance at the delivered head)

At `8d4a22075`, with a clean tree, after the Codex loop converged. `origin/dev` had not moved since `0e4bec132`.

- **Both files × 100**, through the soak's Node reference: `failedRuns=0`, 29 tests per run, 12 to 16 s per run. The summary binds `8d4a22075`, `gitDirty` false, vitest 4.1.10, pool `forks`. Load5 61 to 107 (20 samples).
- **`apps/extension` × 30**, same reference: `failedRuns=0`, 15148 tests per run. Runs took 194 to 298 s, median 225, 113 min in all. The summary binds `8d4a22075`, `gitDirty` false. Load5 58 to 163, median 109 (115 samples, one a minute). A watcher copied each run's raw report before the tool deleted it; none was needed, and the copies were deleted.
- **First launch stopped.** The soak was first started under the session's two-hour background limit, which its past wall times (6565 and 6867 s) nearly fill. It was stopped by its process groups after 14 s, before a run finished, and relaunched detached in its own session; that second launch is the one reported. The stopped run's temp dir was removed.
- **`bun run test:all`**: exit 0 in 151 s, all 14 workspaces. The extension ran 15148 passed, 1 expected fail, 5 skipped and 7 todo. **`bun run lint:actions`**: exit 0. **`bun run check:plans`**: 0 findings.
