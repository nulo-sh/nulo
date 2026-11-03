# Phase 2: the review loop and the runs, 2026-11-03

## Review loop

- **Codex, round 1** (gpt-6.1-sol, high, read-only, over `git diff 6bef2ce57...HEAD -- apps/`): two P3s, both accepted: the comments on `releaseTestnetRefusals` and on the release-build test's `cache` helper narrated their bodies; deleted. No correctness or security finding.
- **Opus diff review** (beside round 1): no bug in the diff. One P3 accepted: the README host row's parenthetical listing today's host would go stale once a tag seeds another; dropped. Checked and confirmed: the Map keeps the candidate's why for a shared host; no import cycle or load-time side effect in the guard importing `release.ts`; the release-build test stubs the cache before any read and never reaches the network; each new test reds on the code it guards. One out-of-scope finding, reported to the owner privately, not in this repository.
- **Codex, round 2** (resumed, over the fix commit): clean. Converged.
