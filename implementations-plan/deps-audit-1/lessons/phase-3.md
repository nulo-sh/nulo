# deps-audit-1: phases 2-3 (builds, smoke, soak)

Candidate `57c35cec5` (`bun.lock` sha256 `7076bcbe…af2284`); `dev` had not moved, so no merge. Fresh install and the audit gate repeated: 41 / 0 / 0 / 0.

- Phase 2: `audit:vue` exit 0 (197 s; extension 14707 passed, equal to base); `build:firefox`, landing, playground and Storybook builds exit 0; `test:ci-gating` 640 pass. Artifact check from the repo root: neither notices file names follow-redirects or axios. Over `apps/extension/dist/{chrome,firefox}`, `grep -rlF` exits 1 for each of `Maximum number of redirects exceeded`, `UNC paths are not supported on Windows` and `__open-in-editor`.
- Smoke, retry 0, armed builds: Chrome 268 passed, 17 skipped, 0 failed, 1694 s; Firefox the same counts, 2550 s. No e2e scenario changed.
- `pr-quick.yml` dispatch at the candidate SHA: run 39537339391, success.
- Soak: 26 summaries, all at the candidate SHA, `gitDirty` false, the candidate lockfile hash. Compares: 12 of 13 OK. `apps/extension` ran node 30/30 (median 234 s) and bun 30/30 (median 142 s), with the three reviewed Bun-only files. `test:all` ×5: exit 0, counts equal to the base.
- The red: the `infra/token-list` compare. Bun passed 85 and skipped 3 on all 30 runs. The Node reference failed `live-check.test.ts`'s script test on all 30 runs: `process.execPath` is `node`, which refuses the script's parameter properties (`ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`). A scratch worktree at the base `ef5336bbc` reproduced it on 3 of 3 runs, and was removed afterwards. Filed as #987.
- Codex (session 01a15c4b) r3 rejected declaring the bar met; r4 chose to stop for the owner (B) over an in-arc fix (A). The first r3 attempt failed with "Selected model is at capacity"; the retry succeeded.
