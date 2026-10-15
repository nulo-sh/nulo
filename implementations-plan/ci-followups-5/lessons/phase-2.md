# Phase 2: the live probe

Throwaway branches `retarget-probe-20261015151122-{a,b,head}`: `-a` and `-b` at the arc head `b9a2c976`, `-head` that plus one signed empty commit `c6348aa3`. Probe PR #482 (`-head` into `-a`, draft). Every request is `gh` as the repository owner; run ids below.

- 2026-10-15 15:11Z, step 1: pushed `worktree-ci-followups-5` and the three branches (HTTP ok). Step 2: opened #482; first lane runs on `c6348aa3`: smoke 38758149990, smoke-firefox 38758150208, network 38758149799, network-firefox 38758149769.
- 15:12Z, step 2: the four first runs completed `success` (suites skipped: empty diff).
- 15:12:23Z, step 3: base set to `-b` (`gh pr edit --base`, ok); Retarget run 38758267838 seen `in_progress` at 15:12:34Z; base set back to `-a` (ok), Retarget run 38758292920. Both `success`. The first re-ran all four completed lanes (attempt 2); the second listed them in flight, cancelled all four (attempt 2 of each concluded `cancelled`), polled, and re-ran each once completed (attempt 3). Each lane's attempt 3 `Detect changes` logged `base=retarget-probe-20261015151122-a, read at attempt 3`; all four aggregators `pass`. I1 holds: `GITHUB_TOKEN` with `actions: write` re-runs a `pull_request` run (no 403). I2 (first half) holds: the job ran on both base changes. The step also exercised the cancel path and I3 (each cancelled attempt completed within about 30 s).
- Finding: a successful cancel printed nothing, so the log could not show it. Fixed in `44f79e48` (`cancelled <id> <file>`, asserted in R5; M3 re-pointed and red again). `-a` and `-b` fast-forwarded to it before step 4 (the merge ref takes the base's copy of the workflow).
- 15:15:51Z, step 4: pushed `520da9a6` (one more empty commit) to `-head`; at 15:16:06Z all four of its lane runs read `in_progress`; base set to `-b` (ok). Retarget run 38758823968 `success`, log: `cancelled` smoke 38758788618, smoke-firefox 38758788808, network-firefox 38758788708; network 38758788785 had completed by its listing and was re-run directly; then the three cancelled lanes re-ran. Each attempt 1 of the three concluded `cancelled`; every attempt 2 logged `base=retarget-probe-20261015151122-b, read at attempt 2`; all four aggregators `pass`. First try; no repeat needed.
- 15:17:47Z / 15:18:04Z, step 5: title edit, then body edit (both ok). Retarget runs 38759071994 and 38759111837 concluded `skipped`; every lane still at attempt 2. Seen here: the newest `Re-run the e2e lanes on the new base` check of the head is now the skipped one, the rollup effect D9 names.
- 15:19Z, step 6: closed #482; deleted the three branches; `git ls-remote origin 'refs/heads/retarget-probe-*'` empty.
- Gate: steps 3, 4 and 5 hold. No 403.

## Codex fix loop

- Round 1, 2026-10-15 15:19-15:23Z: Codex `gpt-6.1-sol` high, read-only (host approve-for-me mode), session `01a14025-8793-78d0-9198-debdd5525e30`: approve with fixes (CX1). Opus diff review: approve with fixes (OP1-OP3). Dispositions in `plan.md` § Implementation review. CX1 checked: `c0e1e696` is on `dev` only; `main` protection `strict: true`; the one open PR (#477) has lane runs from 2026-10-15 only.
- OP1 red proofs (scratch, restored): M9 list failure skipped, M10 unreadable listing skipped, M11 the read after a cancel skipped, M12 the poll read skipped: each `bun test scripts/ci-cd/retarget.test.ts -t <case>` exit 1 on its case; M1-M8 re-run, all still red.
- A waiting loop of mine (`pgrep -f <prompt file>`) matched its own command line and never ended; the Codex run had finished in four minutes.
