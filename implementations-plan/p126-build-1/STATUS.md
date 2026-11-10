# p126-build-1: status

- 2026-11-10: recon done (two Explore agents on sonnet); plan drafted at 32fd50e60, two arcs.
- 2026-11-10: dual audit round 1 (Codex conditional approve, Opus conditional approve) folded into the plan.
- 2026-11-10: final fresh Codex pass: conditional approve, folded; resumed twice: one more demonstrated finding (the production marker list is hand-kept), folded; approve.
- 2026-11-10: a1 Phase 1 gate green (lint, typecheck:all, window tests, test:ci-gating, lint:actions).
- 2026-11-10: a1 Phase 2 gate green (one red in bun run test: the seam scan on the new smoke spec's page.reload, fixed, re-run green).
- 2026-11-10: a1 Phase 3: wide shape 3.2 s on a saturated host (native rows; 5.2–7.3 s with component rows): gate inconclusive, Codex consult recorded; arc continues, report flags it.
- 2026-11-10: a1 Phase 3 gates: audit:vue, test:all, check:plans green; test:release red on zip missing from this host only; release build leaked an orphan fixture chunk, fixed by a module-scope gate.
