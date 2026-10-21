# soak-mode-1 status

- 2026-10-21 adopted the lane worktree at `cef87d9de`; recon done (one Sonnet explorer); the two cited runs read back: the nightly dry-run failed at `resolve` (dev only).
- 2026-10-21 filed #1014; decision consult: Codex R, Opus R plus files-only (D2); plan drafted (tier light, one arc).
- 2026-10-21 audit r1: Codex and Opus approve with changes; folded (existence check, armed-file refusal, retry check, status wording, test bindings, docs rows); Codex r2 verifying.
- 2026-10-21 r2 approve with changes (more opt-in files); r3 both legs: report read-back, strict (D4, D5); r4 Codex approve. Plan ready for the orchestrator.
- 2026-10-21 A1 phase 1 green: lint:actions, the three test files, test:ci-gating (678 pass), lint; red/green against cef87d9de copies (6 soak tests red on base).
- 2026-10-21 A1 phase 2 green: lint, test:ci-gating, check-no-local-paths; known limit #1018 filed closed.
- 2026-10-21 final local gates on 0472e2e28 (dev merged): lint, typecheck:all, test:all, test:ci-gating, test:release, lint:actions green; `bun run test` 14937/14938 twice, one static-scan timeout per run on a saturated host (load 281 on 188 cores; copy-dash-ban + type-role-ban, then log-payload-ban), each green in isolation; the arc touches nothing under apps/ or packages/.
