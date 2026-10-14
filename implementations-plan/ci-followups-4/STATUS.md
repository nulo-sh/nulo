# Status: ci-followups-4

- 2026-10-14: worktree adopted and registered (base origin/dev 15881c7d); #172 and #365 read in full; recon started (3 sonnet explorers).
- 2026-10-14: plan.md drafted (one arc: #172 via a named `hoistPattern`, #365, the lessons pass, the nightly comment); OWNER-ASKS none; panel round 1 started (Codex gpt-6.1-sol high, Opus Plan).
- 2026-10-14: branch fast-forwarded to origin/dev b3c98acb (no dependency change). Round 1: Codex reject (7 findings), Opus conditional approve (12); all accepted but O11 (no pin test, D4). plan.md v2: D1 becomes orchestrator Ask A1 with a known-limit branch; D3 capped at five entries; dist identity with a determinism control; identity compare; #365 proven red on the role; lessons 35 and 52 kept, 5 and 6 move into CLAUDE.md (7,124 B). Codex round 2 (resume) started.
- 2026-10-14: Codex round 2: conditional approve (arm the smoke build; per-branch docs for A1-declined; name the identity suites); all three accepted. plan.md v3 (214 lines). Codex round 3 (verify) started.
- 2026-10-14: Codex round 3 (verify): approve. Plan committed; awaiting the orchestrator's approval and its answer to A1 (`hoistPattern` vs the known-limit branch).
- 2026-10-14: A1 approved by the orchestrator (`hoistPattern`, five named entries, D3 stands). Phase 1 gate: lint, typecheck:all, test:all, build-storybook, phantom-sweep (design finding gone, the six known false positives remain): pass. Baseline on a fresh tree: dist determinism control identical (1,172 files); 15,751 test identities.
