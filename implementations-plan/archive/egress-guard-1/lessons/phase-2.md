# Phase 2: the review loop and the runs, 2026-11-03

## Review loop

- **Codex, round 1** (gpt-6.1-sol, high, read-only, over `git diff 6bef2ce57...HEAD -- apps/`): two P3s, both accepted: the comments on `releaseTestnetRefusals` and on the release-build test's `cache` helper narrated their bodies; deleted. No correctness or security finding.
- **Opus diff review** (beside round 1): no bug in the diff. One P3 accepted: the README host row's parenthetical listing today's host would go stale once a tag seeds another; dropped. Checked and confirmed: the Map keeps the candidate's why for a shared host; no import cycle or load-time side effect in the guard importing `release.ts`; the release-build test stubs the cache before any read and never reaches the network; each new test reds on the code it guards. One out-of-scope finding, reported to the owner privately, not in this repository.
- **Codex, round 2** (resumed, over the fix commit): clean. Converged.

## The runs at `C`

Both candidates were built at `C` = `77e2f5795` (manifest `1.1.0.1`, 12 s each). `origin/dev` had not moved since the base `6bef2ce57`, so no merge. Chrome 155.0.8059.79 (Puppeteer 25.14.0), Firefox 158.0. `git status --porcelain` was empty before each run and after the last; no `NULO_E2E_UPDATE_RECORD` and no `NULO_E2E_BACKUP_RECORD`, so the recording #1641 committed is the one read. All at retry 0, no rerun.

| # | Run (UTC) | Outcome | Wall-clock |
|---|---|---|---|
| 1 | Live, Chrome, 20:42:56-20:46:20 | **passed** | test 125.8 s, vitest 188.6 s |
| 2 | Live, Firefox, 20:46:28-20:50:47 | **passed** | test 181.0 s, vitest 244.2 s |
| 3 | Replay, Chrome, 20:51:00-20:52:04 | 4 passed: 25.5 s, 13.5 s, 9.1 s, 10.9 s | vitest 63.1 s |
| 4 | Replay, Firefox, 20:52:10-20:53:28 | 4 passed: 31.7 s, 18.0 s, 11.5 s, 13.7 s | vitest 78.2 s |

- I1 held: with each release's Testnet host declared, both live bodies pass, so the guard's error on 2026-11-03 hid no body failure.
- Against the red runs at `55b2ad17b` (archived release-replay-1, lessons/phase-1.md): live Chrome test 119.4 s → 125.8 s, live Firefox 181.0 s → 181.0 s; replays 66.5 s → 63.1 s (Chrome) and 94.4 s → 78.2 s (Firefox). No scenario was added or changed.
- Both live logs carry `[aztec-node] Error: Address already in use` at sandbox boot, which the setup's preceding line names as expected (the aztec CLI's own anvil).
- The recording's dApp session still expires 7 days after 2026-11-03 18:06-18:09 UTC; the replay refuses it from 2026-11-10 17:56 UTC at the earliest.

## The runs at the merged head

`origin/dev` then moved to `3174dd450` (#1646, the execute window's call string), a build input, so the branch merged it at `c1e4211ea` and Phase 3 step 1 reran all four there. Lint, `typecheck:all`, `test:all` and the three fixture unit files passed at that head first. Both candidates were rebuilt at `c1e4211ea` (9 s each); same browsers, same recording, `git status --porcelain` empty throughout, retry 0, no rerun. These runs replace the ones at `77e2f5795` as the evidence for the PR.

| # | Run (UTC) | Outcome | Wall-clock |
|---|---|---|---|
| 5 | Live, Chrome, 20:58:56-21:01:43 | **passed** | test 100.1 s, vitest 154.8 s |
| 6 | Live, Firefox, 21:01:49-21:06:00 | **passed** | test 183.5 s, vitest 239.0 s |
| 7 | Replay, Chrome, 21:06:06-21:07:03 | 4 passed: 21.8 s, 12.4 s, 8.1 s, 10.6 s | vitest 56.1 s |
| 8 | Replay, Firefox, 21:07:03-21:08:18 | 4 passed: 29.4 s, 17.6 s, 11.2 s, 13.2 s | vitest 74.2 s |
