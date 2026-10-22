# deps-audit-1: owner asks

## OA-1: may arc 1 carry the one-line test fix for #987? (answered: A)

- **Surface:** none a person sees. The ask concerns scope: one test file outside the lane's dependency files.
- **Why:** the soak could not pass `infra/token-list` at any commit: `test/live-check.test.ts:263` spawned `process.execPath`, which is `node` under the Node reference, on a TypeScript script Node refuses (#987, pre-existing).
- **Options:** A, carry `spawn("bun", …)` and rerun Phases 2-3 at the new candidate; B, fix #987 in its own PR first; C, open the PR with the red stated.
- **Answer (the orchestrator, under the owner's standing rules):** "**option A**, 'arc 1 adds `test(token-list): spawn the live-check script with bun, as ci runs it` (`spawn("bun", …)`, closing #987 in the same PR). Then Phases 2-3 rerun in full at the new candidate, and the PR opens when every compare exits 0.'" Landed as `dc82d009d` (D11).

## OA-2: a quiet window for the `apps/extension` soak pair (granted: A)

- **Surface:** none a person sees. The ask is host time.
- **Why:** at candidate `dc82d009d` every gate is green except the extension soak pair and the `test:all` ×5 run that follows it. The green gates: fresh install, audit gate 41/0/0/0, every build, the artifact check, smoke on both browsers, 12 of 13 compares and the `pr-quick` dispatch. Both attempts of the pair failed while other leads' runs held load1 at 120 to 300 on this host. Each failure is a vitest timeout at the default 5000 ms, and the one retry the brief allows is used (D12). A third red ends the arc as ARC_FAILED.
- **Options:**
  - **A (recommended):** the orchestrator schedules a window with no other lead's unit suites or e2e on the host, about 4 h at load5 under 80. It authorizes one final attempt of the extension pair plus `test:all` ×5, run at a detached `dc82d009d`, and every failing test's name is kept. If it passes, the PR opens. If it fails, the arc ends ARC_FAILED and the failures are read as a finding.
  - **B:** an exception: open the PR now with the extension pair stated as unpassed. Not recommended, for the same reason as OA-1's C.
- **What ships now:** nothing. The branch `deps-audit-1-a1` is pushed, with no PR. #980 and #987 stay open, and the audit gate keeps failing dependency PRs.
- **Answer:** A, granted by the orchestrator. The window opened at the resume, 2026-10-22T00:39Z, after ten minutes with load5 under 80 (load5 56.0 at the resume). The soak rules are unchanged: 30 retry-0 runs per engine of the extension pair at a detached `dc82d009d`, then `test:all` ×5, with no timeout, retry or config change. Load5 above 150 on three consecutive five-minute samples stops the attempt, and the orchestrator schedules the next window.
