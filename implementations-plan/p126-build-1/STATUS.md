# p126-build-1: status

- 2026-11-10: recon done (two Explore agents on sonnet); plan drafted at 32fd50e60, two arcs.
- 2026-11-10: dual audit round 1 (Codex conditional approve, Opus conditional approve) folded into the plan.
- 2026-11-10: final fresh Codex pass: conditional approve, folded; resumed twice: one more demonstrated finding (the production marker list is hand-kept), folded; approve.
- 2026-11-10: a1 Phase 1 gate green (lint, typecheck:all, window tests, test:ci-gating, lint:actions).
- 2026-11-10: a1 Phase 2 gate green (one red in bun run test: the seam scan on the new smoke spec's page.reload, fixed, re-run green).
- 2026-11-10: a1 Phase 3: wide shape 3.2 s on a saturated host (native rows; 5.2–7.3 s with component rows): gate inconclusive, Codex consult recorded; arc continues, report flags it.
- 2026-11-10: a1 Phase 3 gates: audit:vue, test:all, check:plans green; test:release red on zip missing from this host only; release build leaked an orphan fixture chunk, fixed by a module-scope gate.
- 2026-11-10: a1 smoke (execute-steps) green on Chrome and Firefox at retry 0; test:release green with a local zip.
- 2026-11-10: a1 review: Codex r1 conditional approve (3 adopted), Opus conditional approve (6 adopted), Codex r2 approve; fixes in bc63c57aa.
- 2026-11-10: a1 final gates on bc63c57aa: audit:vue, test:all, test:release (local zip), check:plans green; smoke Chrome armed green (30.1 s), release-build negative green; network Chrome green (13/13, at 788458d63).
- 2026-11-10: a1 network Firefox green (13/13, final code); all a1 gates green; opening the PR.
- 2026-11-10: a1 PR #1776 open, ready, every check green at 81277dd; wide 1,342 ms on CI Chrome. a1 done.
