# Status: e2e-followups-1

- 2026-10-28 recon done (three Explore agents); baseline seeds at 210d02f1f: from v1.1.0 the start reds (the issue's path), from v1.0.0 the first open reds on a takeover that never shows (new).
- 2026-10-28 plan drafted; audit started (Codex gpt-6.1-sol high, Opus Plan).
- 2026-10-28 Codex r1: reject (7 findings); all folded or answered in plan.md, see lessons/phase-0.md.
- 2026-10-28 Opus Plan: conditional approve (9); Codex r2: conditional approve (3 new); all folded, see the audit table.
- 2026-10-28 Codex final: conditional approve (3); all folded; resumed for verification.
- 2026-10-28 Codex final resumed: approve. Plan committed; arc 1 starts.
- 2026-10-28 Phase 1 gate: pass at a0d3cae52 (lint, typecheck:all, model test, test:all; 13 seeds and two controls per browser, 30 tests, green at retry 0; lessons/phase-1.md).
- 2026-10-28 arc 1 review loop: Codex r1 conditional approve (1), Opus conditional approve (2), both fixed; Codex r2 approve.
- 2026-10-28 arc 1 final gates: pass at e0aaede3d (lint, typecheck:all, test:all; 13 seeds and two controls per browser, 30 tests, green at retry 0).
- 2026-10-28 Phase 2: branch (a) traced (focused picker never answers; 5/5 at base, 20/20 fixed by dismissal), but the dismissal breaks Firefox pickFile (restore case 2/2 red, base 5/5 green); no code, D10; #1222 stays open.
