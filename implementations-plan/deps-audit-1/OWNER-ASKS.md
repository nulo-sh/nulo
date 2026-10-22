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
- **Attempt:** started 00:42:01Z at the detached `dc82d009d`. Node runs 1-10 passed (14770 tests each, 245 to 315 s). The load rule stopped it at 01:32:01Z, after load5 read 158.2, 178.0 and 170.2 on three consecutive samples. Other leads' suites carried that load: fit-gate-1, encryption-at-rest-1 and pxe-limits-1. No failure was recorded, and the 30-run bar is unmet.

## OA-3: one window for the whole remaining bar

- **Surface:** none a person sees. The ask is host time and the order of the remaining runs.
- **Why:** the close-out must merge `dev` first (README step 4). `dev` now carries #978's two e2e vitest configs, which match Phase 3's trigger, so the merged HEAD reruns Phases 2-3 (Codex r7). Rerunning only the extension pair at `dc82d009d` therefore buys a PR, not a close-out. Measured on this host when it was quiet, the full rerun takes about 6 h: Phase 2 with both smokes 1.4 h, the 12 smaller soak pairs 0.75 h, the extension pair 3.5 h, `test:all` ×5 0.4 h.
- **Options:**
  - **A (recommended):** at the next window, merge `origin/dev` first. The merged HEAD becomes the candidate, and Phases 2-3 run in full there in one window of about 6 h, under the same load rule. On a pass, the PR opens and the close-out follows. The close-out reruns only if a later trunk merge touches a trigger file again.
  - **B:** keep `dc82d009d`. One window of about 4 h for the extension pair and `test:all` ×5, then the PR opens at the pre-merge head. The close-out then needs a second window of about 6 h after its merge (Codex r7, A-i).
  - **C:** B, plus an approved narrowing of Phase 3's trigger. The two e2e configs feed only the e2e runners, so the close-out reruns only Phase 2 (about 1.4 h). It needs the orchestrator's or the owner's explicit approval: the lead may not narrow an approved gate.
- **What ships now:** nothing. The branch is pushed, with no PR. #980 and #987 stay open.
- **Answer:** A, granted by the orchestrator. It holds the window: no other lead runs a unit or e2e suite until this lane reports, and one measurement lane keeps about one core. The window opened at the resume, 2026-10-22T05:29:44Z, at load5 101.4 (load1 121.8). Processes outside this session's view were using about 37% of the CPU as niced time. Plan: merge `origin/dev` first, then run Phases 2-3 in full at the merged HEAD under the same soak and load rules.
