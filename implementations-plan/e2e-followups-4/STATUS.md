# e2e-followups-4 — status

- 2026-10-11 — phase 0: adopted worktree `e2e-followups-4` at origin/dev 6488b1b; read the briefs, #308, nightly 38130969762's failed log and both artifact smoke job logs; registered in the manifest.
- 2026-10-11 — recon: two Explore agents (sonnet) plus the driver's read; recon.md written. Mechanism inferred (I1): an artifact run is unguarded, the live Testnet node lets protocol-FPC discovery store rows beside the seed. The 10-11 run was the test's first artifact run.
- 2026-10-11 — draft: plan.md (Fix A, held node before registration), OWNER-ASKS.md (none); panel round 1 next.
- 2026-10-11 — panel round 1: Codex reject (10 findings: 8 accepted, 2 in part), Opus conditional approve (9: 8 accepted, 1 in part); plan v2 written (reproduced-red definition, unclassified branch, attempt accounting, D4 settlement, D6 fixture diagnostics kept out); Codex resume next.
- 2026-10-11 — panel round 2: Codex reject (6; 5 accepted, 1 in part; D6 and D4 accepted), Opus conditional approve (3, accepted); plan v3 (ordered classification rules, N1/N2 controls, strict Phase 3 gate D8, build flags D9); Codex resume (round 3) next.
- 2026-10-11 — panel round 3: Codex conditional approve (3, accepted); plan v4; Codex round 4 for the final verdict.
- 2026-10-11 — panel rounds 4-5: Codex approve (twice), Opus approve (one low finding, accepted); plan converged at v4; committing.
- 2026-10-12 — phase 0 gate: pass (ancestry 0, #308 OPEN, Testnet aztec_getNodeInfo HTTP 200 with result); implementing arc 1.
- 2026-10-12 — phase 1 gate: pass. C1 18/21 red, C3 16/21 red, C2 0/21, F1 red, F2 green; all 35 reds reproduced as defined; rule 1 (F1) → Codex: same cause, Fix A; probe reverted (diff exit 0).
- 2026-10-12 — phase 2 gate: pass (lint, typecheck:all, test, test:all, test:ci-gating all 0; C2 file 5/5; N1 red at :36, N2 red at :173, both reverted).
- 2026-10-12 — phase 3 gate: pass (C1, C2, C3 21/21 each, F1 and F2 green, no replaced attempt; whole artifact suite on C1 200 passed, 22 skipped, 0 failed).
- 2026-10-12 — quality loop: Codex round 1 three doc nits (accepted), Opus one material (check:plans path-token, accepted) and nits; Codex round 2 clean.
- 2026-10-12 — phase 4 gate: pass (lint 0, check:plans 0 findings; #316 and #317 filed, deduped).
