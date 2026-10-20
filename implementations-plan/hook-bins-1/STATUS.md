# STATUS — hook-bins-1

- 2026-10-20 Phase 0: briefs read; tier light (lane brief); recon started (1 Explore, sonnet).
- 2026-10-20 Recon done (1 Explore, sonnet; probes in recon.md). Plan drafted, 132 lines. Audits next: Codex (gpt-6.1-sol, high) and Opus Plan in parallel.
- 2026-10-20 Audit r1: Codex conditional approve (6), Opus conditional approve (8); all folded (D3 kept on an explicit assumption, D4 precedent over a helper). Final fresh Codex pass next.
- 2026-10-20 Final fresh Codex pass: conditional approve (2 validation fixes, folded). Resuming it to verify.
- 2026-10-20 Final Codex pass resumed: approve. Plan committed; arc 1 next (auto-continue).
- 2026-10-20 Arc 1 branch `hook-bins-1-a1` off origin/dev 38c449db (plan commit cherry-picked).
- 2026-10-20 Phase 1 green: githooks.test.ts 10/10 hook rows pass on the new hooks; with the base hooks every hook row reds (harness control green); a real commit ran both new hooks.
- 2026-10-20 Phase 2 green: baseline:complexity changed only `generated` (restored); baseline:rescore OK (20 acceptances); static pin reds on exactly the four base sites; lint, typecheck:all, test:ci-gating (637 pass), test:release (341 pass) exit 0.
- 2026-10-20 Phase 3 green: CLAUDE.md :50 and :54; proof on a detached worktree outside the clone (no ancestor node_modules): pre-commit and commit-msg refused with their one line, strace showed no execve of bun, bunx or node and no connect, the private TMPDIR, BUN_TMPDIR and BUN_INSTALL_CACHE_DIR stayed empty; after `bun install --frozen-lockfile` (Biome 2.5.13, commitlint 21.2.2) a good file passed, a badly formatted one was refused by Biome, `fix: Handle PXE` was refused by subject-case; worktree removed. test (14351 pass) and test:all exit 0.
- 2026-10-20 Arc 1 review loop: Codex r1 findings (comments), Opus findings (minor), r2 one gap, r3 clean. All fixed.
