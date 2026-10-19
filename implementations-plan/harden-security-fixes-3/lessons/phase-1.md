# Phase 1: the token-list signer-code caveat

| When (2026-10-19) | Step | Outcome |
|---|---|---|
| 18:0x | Branch off origin/dev, plan commit, `SECURITY.md` caveat | lint, `check:plans`, `test:ci-gating` green |
| 18:2x | Rebase onto 2a5960da (#860 merged); `index.md` kept both lines | arc diff = plan + docs only |
| 18:3x | Codex R1 (gpt-6.1-sol high) beside one Opus diff review | conditional approve (both): two sibling docs kept "every signing-relevant change"; the plan still listed #860 as a wait; F2 and F6 line numbers moved. All taken; the signer's comments stay (HS3-D5) |
| 18:5x | Codex R2 (resume) | first resume ran on the session-default model (no codex dir passed: the script falls back to its default); rerun on gpt-6.1-sol high with the codex dir: approve, nothing left |
