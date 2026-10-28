# release-prep-1.2.0 status

- 2026-10-28 phase 0: briefs read; adopted worktree `release-prep-1.2.0` at `origin/dev` ce16a57a9; tier light.
- 2026-10-28 phase 0.4: recon (2 Explore agents, sonnet); v1.1.0 zips downloaded and checked (SHA-256 = `SHASUMS256.txt` = GitHub asset digests; `gh attestation verify` exit 0 at 241097f6c for both).
- 2026-10-28 plan: Opus Plan leg conditional approve; Codex reject, then conditional approve, then approve once its two conditions were folded in. A1 (case 3) goes to the orchestrator after Phase 3.
- 2026-10-28 phase 1 green: pins committed 956fc686e; lint, typecheck:all exit 0; release-build + update-recording unit files 20 passed; releaseProblem accepts our downloaded zips for v1.1.0.
- 2026-10-28 phase 2 gate met: both live runs passed; replay cases 1, 2, 4 passed and case 3 failed at update-replay.test.ts:689 on both browsers (lessons/phase-2.md).
- 2026-10-28 phase 3 gate green: lint, typecheck:all, the two unit files (20 passed), test:all exit 0, check:plans 0 findings; recording committed cede2cbfe; issue #1312 filed.
- 2026-10-28 phase 3: review loop converged at round 1 (Codex clean; 4 Opus wording fixes); branch to be pushed, no PR; stop on A1.
