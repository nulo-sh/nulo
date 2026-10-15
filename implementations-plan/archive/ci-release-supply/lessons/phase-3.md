# Phase 3 lessons: arc 3, the landing domain rule (#185)

Arc 3 branches from `dev` at 69eab05 (#261 squash-merged arc 2; D-orch-8), beside arc 4.

## 3.1 The runbook line

- #185's comment confirms #238 routed every other part; only CLAUDE.md's two release-runbook lines were left.
- The retired follow-up also said "Workers Builds takes only user tokens". Nothing in the tree backs it, and the `wrangler.jsonc` comment states the operative fact (no zone permission), so the line leaves it out; Codex agreed nothing is lost.
- Preview builds run `wrangler versions upload`, which applies no routes or domains (that is `wrangler triggers deploy`'s job), so a `routes` entry would fail production deploys only. The `wrangler.jsonc` comment still says "every build"; it is outside this lane's two docs (D-orch-9).
- Gate, 2026-10-10: `lint` 0, `typecheck:all` 0, `test` 0 (720 files, 10875 passed, 4 skipped, 7 todo), `test:ci-gating` 0 (479 pass), `scripts/check-no-local-paths.sh` 0. Run once on the first wording; the review fixes changed prose only, and `check:plans` plus the pre-commit hook passed on each commit.
- Two branches built in parallel from one worktree carry the same plan commit under different SHAs, so relative to `dev` both insert its block. Any later edit inside that block on one side conflicts, which an in-place rewrite of a pre-placed line did, as `git merge-tree` showed. Final: the block stays identical on both, and each arc records at its own anchors (`lessons/phase-4.md` has the rule).
- Review: Codex round 1 one Low, the Opus review three Low and two Nit, all accepted; Codex round 2 clean. Verdicts in plan.md § Audit verdicts.
