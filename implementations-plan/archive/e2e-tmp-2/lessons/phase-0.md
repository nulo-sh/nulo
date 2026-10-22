# e2e-tmp-2 phase 0: planning consults

- 2026-10-22, recon (one Sonnet Explore agent): #1071 holds; the stage-log dirs have no reader; a neighbour leak in `test:release` found.
- 2026-10-22, probe (driver): a `describe.skipIf(true)` body that makes a dir and removes it in `afterAll`, run with `bun test` 1.4.2 under a scratch `TMPDIR`, left 1 dir: Bun collects a skipped block's body and runs none of its hooks. Filed #1076.
- 2026-10-22, Codex r1 (gpt-6.1-sol, high, session `01a164cf`): conditional approve. F2 corrected (imported hook vs context guard); four mutation failures, not three; per-path checks kept; 18 smoke sites. All accepted.
- 2026-10-22, Opus 5.5 r1 (Plan): conditional approve. Same four-failure fix and F2; neutral self-test prefix (taken over Codex's "sound input"); Not taken (c) re-argued on cost after its premise fell; D2's departure from the brief stated; Phase 2 flake rule and "before" wall-clock; `git diff --exit-code` after the mutation. All accepted.
- 2026-10-22, Codex r2 (resumed): conditional approve. The Phase 2 flake rule weakened the gate (solo pass proves nothing when the changed helper reaches the file): now diagnostic only, one whole-suite rerun for a red an open `flake` issue names. The mutation diff needed a baseline: stage first, diff worktree against index. Both accepted.
- 2026-10-22, Codex r3 (resumed): approve; no new finding.
