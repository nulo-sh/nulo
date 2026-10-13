# STATUS: wallet-followups-7

- 2026-10-13 — phase 0.4: recon done (2 Explore agents, Sonnet); #354 probe demonstrated in-process (63 waiting, 0 refused, +256 MiB).
- 2026-10-13 — drafted plan.md, recon.md, OWNER-ASKS.md (OA-1); tier light, one arc.
- 2026-10-13 — audit round 1 launched: Codex (gpt-6.1-sol, high, read-only) and the Opus 5.5 lens (Plan agent).
- 2026-10-13 — audit round 1: Codex conditional approve (5 findings), Opus lens conditional approve (8 findings; F5 rejected). Object-dense probe +772 MiB at 32. OA-2, OA-3 added. Codex round 2 (resume) on dispositions + refusal-reply fork.
- 2026-10-13 — Codex rounds 2–4: conditional approve → conditions applied → approve. Plan at 150 lines.
- 2026-10-13 — phase 1 ✓: token vitest set 338 passed, lint 0, typecheck:all 0; T1, T2, T2b red on base copies.
- 2026-10-13 — phase 2 ✓: wallet-sdk vitest 427 passed, wallet-core 279 passed, lint 0, typecheck:all 0; T4–T7 (6 tests) red on base copies.
- 2026-10-13 — Codex round 1: conditional approve, 2 findings accepted (null decrypted payload leaked a slot; parse comment).
