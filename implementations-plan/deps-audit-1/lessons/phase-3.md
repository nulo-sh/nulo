# deps-audit-1: phases 2-3 (builds, smoke, soak)

Candidate `57c35cec5` (`bun.lock` sha256 `7076bcbe…af2284`); `dev` had not moved, so no merge. Fresh install and the audit gate repeated: 41 / 0 / 0 / 0.

- Phase 2: `audit:vue` exit 0 (197 s; extension 14707 passed, equal to base); `build:firefox`, landing, playground and Storybook builds exit 0; `test:ci-gating` 640 pass. Artifact check from the repo root: neither notices file names follow-redirects or axios. Over `apps/extension/dist/{chrome,firefox}`, `grep -rlF` exits 1 for each of `Maximum number of redirects exceeded`, `UNC paths are not supported on Windows` and `__open-in-editor`.
- Smoke, retry 0, armed builds: Chrome 268 passed, 17 skipped, 0 failed, 1694 s; Firefox the same counts, 2550 s. No e2e scenario changed.
- `pr-quick.yml` dispatch at the candidate SHA: run 39537339391, success.
- Soak: 26 summaries, all at the candidate SHA, `gitDirty` false, the candidate lockfile hash. Compares: 12 of 13 OK. `apps/extension` ran node 30/30 (median 234 s) and bun 30/30 (median 142 s), with the three reviewed Bun-only files. `test:all` ×5: exit 0, counts equal to the base.
- The red: the `infra/token-list` compare. Bun passed 85 and skipped 3 on all 30 runs. The Node reference failed `live-check.test.ts`'s script test on all 30 runs: `process.execPath` is `node`, which refuses the script's parameter properties (`ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`). A scratch worktree at the base `ef5336bbc` reproduced it on 3 of 3 runs, and was removed afterwards. Filed as #987.
- Codex (session 01a15c4b) r3 rejected declaring the bar met; r4 chose to stop for the owner (B) over an in-arc fix (A). The first r3 attempt failed with "Selected model is at capacity"; the retry succeeded.

## Candidate `dc82d009d` (after OA-1)

`origin/dev` merged as `f5fa9f68c` (it brought #981 and #983; `index.md` kept both rows). Then the #987 fix landed as `dc82d009d`, the last commit to change a dependency or test file, so it is the candidate (`bun.lock` sha256 `7076bcbe…af2284`, unchanged).

- The #987 fix: on its parent, `live-check.test.ts` under the Node reference failed 1 of 1; after it, 3 of 3 passed on node and 3 of 3 on bun, the same 24-test inventory. Codex r5 approve.
- Fresh frozen install; audit gate enforce 41 / 0 / 0 / 0, repeated at HEAD before this record.
- Phase 2: `audit:vue` exit 0 (156 s); `build:firefox`, landing, playground, Storybook exit 0; `test:ci-gating` exit 0. The artifact check exits 1 for every grep on both production builds, and neither notices file names follow-redirects or axios. Smoke, retry 0, armed builds: Chrome 268 passed, 17 skipped, 0 failed, 1682 s; Firefox the same counts, 2871 s.
- `pr-quick.yml` dispatch at `dc82d009d`: run 39566120198, success.
- Soak: 12 compares exit 0. `infra/token-list` node 30/30 and bun 30/30; the 11 packages and landing as before.
- `apps/extension`, attempt 1 (from about 10:10Z, load1 120 to 230). Node failed runs 3, 23, 27, 28 and 29: 1, 1, 1, 1 and 4 tests. Every failure is `Error: STACK_TRACE_ERROR` with the definition-site stack, vitest's timeout at the default 5000 ms. The tests:
  - runs 3 and 23: `operation-estimate-reuse.pins.test.ts` "priority undefined: a null node reply";
  - runs 27-29: `manifest.test.ts`'s RP-host scan;
  - run 29 also: `log-payload-ban.test.ts` static, `service.fence-entry.test.ts`, `stored-shapes.scan.test.ts`.

  The bun leg failed runs 1 and 2 (2 and 3 tests) at load1 about 225 and was stopped by its process group, so those names are lost.
- Attempt 2, the one saturation retry, started 13:42Z at load1 78. Node runs 1-11 passed (272 to 347 s each). Run 12 failed 1 test in 391 s at load1 about 300. It was stopped, and the name is lost: the tool deletes each run's raw report.
- Diagnostics, no repo change: three plain `bun run test` runs of `apps/extension` at load1 170 to 250 passed 14771 with 5 skipped and 7 todo, the base counts. The twice-failed pin file alone under the Node launcher took 80 to 170 ms, and none of its tests took over 24 ms. A 5 s timeout there means a stall more than 200 times its cost.
- Codex r6 (b, high): the allowed retry is used up, no code cause is shown, and saturation is still a hypothesis. Hand scheduling to the orchestrator (OA-2). A later attempt must keep each failing test's name.

## OA-2 attempt, 2026-10-22

- The window opened at the resume, 00:39Z (load5 56.0). Recorded as `980b67c43`, then the worktree was detached at `dc82d009d` with a clean tree.
- A watcher copied each failing run's raw vitest report before the soak deleted it, and none was written.
- `apps/extension` node: runs 1-10 passed, 14770 tests each, 245 to 315 s.
- Five-minute samples of load5: 72.8, 105.6, 128.7, 141.1, 163.9, 129.2, 124.5, 114.2, 158.2, 178.0, 170.2. The last three tripped the rule, which stopped the group at 01:32:01Z; nothing of the run was left. A CPU sample at 00:57Z put this run at about 100% against 450% for encryption-at-rest-1, plus fit-gate-1 and pxe-limits-1.
- The close-out's trunk merge: `origin/dev` (`60ecd6cc3`) changes no dependency file, `bunfig.toml`, `vitest.base.mts`, unit vitest config or the soak tool. It does change `apps/extension/vitest.e2e.config.ts` and `vitest.e2e.network.config.ts` (#978), which match the trigger. `git merge-tree` conflicts only in `index.md`, on our added row. Codex r7: A-i (OA-3).

## OA-3 window, 2026-10-22

- Window from 05:29:44Z (load5 101.4; about 37% of the CPU was niced time from processes outside this session's view, and visible lanes used about 2 cores).
- `origin/dev` `11439b1be` merged as `f9da1bd3c` (signed). `index.md` conflicted only on this lane's row, resolved as dev's file plus that row. The diff against `origin/dev` is exactly this arc: four manifests, `bun.lock` (the same 6 lines), the live-check test and the plan.
- Same 13 soak workspaces and the same three `BUN_ONLY_FILES`. `pr-quick` dispatched at `f9da1bd3c`.
- Every `node_modules` removed, then `bun install --frozen-lockfile`: exit 0, the tree clean, the store holding `vite@8.2.4` and `follow-redirects@1.16.1` only.
- The audit gate failed: `41 acknowledged, 2 unacknowledged`:
  - `@vitest/mocker` 1242767, moderate, fixed in 4.1.12, which clears the age gate at 14:51Z today;
  - `storybook` 1242753, critical, fixed in 10.6.2, past the gate.

  Both were published after this plan. Filed #1032 after a dedupe search. The run stopped at that gate, so no build or test ran (OA-4).

## Final candidate `9b414dc39`, 2026-10-23

The candidate is `b8f5c22fe`'s code plus records: vite 8.2.4, follow-redirects 1.16.1, storybook 10.6.2, vitest 4.1.12, and #987's fix, on `origin/dev` `0e4bec132`. Its `bun.lock` sha256 is `c7578a98…cb6593`. The run started at 04:59:35Z, with load 102.5 / 88.7 / 77.9.

- Fresh frozen install: the store holds vitest and every `@vitest/*` at 4.1.12, storybook 10.6.2, vite 8.2.4 and follow-redirects 1.16.1. The audit gate, enforce: 39 / 0 / 0 / 0.
- Base counts: `test:all` at a detached `0e4bec132` exits 0 (185 s, 14 workspaces).
- Phase 2:
  - `audit:vue` passes (194 s), and so do `build:firefox`, landing, playground, Storybook and `test:ci-gating`.
  - The artifact check: every grep exits 1 on both builds, and neither notices file names follow-redirects or axios.
  - Smoke, retry 0, armed builds: Chrome 272 passed, 25 skipped, 0 failed in 1749 s; Firefox 276 passed, 21 skipped, 0 failed in 2661 s.
- `pr-quick.yml` dispatch at `9b414dc39`: run 39903250011, success.
- Soak: 12 compares exit 0 (06:21-06:49Z). That covers the 10 packages, `infra/token-list` and `apps/landing`.
- The `apps/extension` Node leg failed 1 of 30, so it exits 1 at 08:39:01Z (6565 s). Every summary binds the candidate SHA, a clean tree and the candidate lockfile.
  - The other 29 runs each passed 15148 tests, 5 skipped and 7 todo, in 195 to 243 s.
  - Run 5 (243 s, about 07:05-07:09Z, load5 89-94, with no other lead's suite alive) failed `background.transport.test.ts` › `with VITE_NULO_ALLOW_IFRAME_DAPPS=1` › `a same-origin subframe completes a key exchange`.
  - The error is `Error: STACK_TRACE_ERROR`, whose stack ends at the test's definition (line 362): vitest's timeout at 5000 ms.
  - The run stopped there, as written, so the bun leg, the compare and `test:all` ×5 did not run.
- Probe, no repo change: the file alone, ×5 under the Node launcher, passes. That test takes 371 to 447 ms, the slowest in a file that takes 2.0 to 2.3 s. It runs `vi.resetModules()`, then cold-imports `./background` inside its own body.
- This test passed 30 of 30 at `57c35cec5`, and was never named at `dc82d009d`. No issue named it, so it is now #1101.
- Codex r10: `ARC_FAILED + c`, high (plan, Review verdicts). The arc ends here (D15, OA-5).
