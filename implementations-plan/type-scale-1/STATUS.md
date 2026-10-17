# type-scale-1 status

- 2026-10-16 phase 0: briefs read (lane brief, common, planner); tier `mid` (the lane brief names it); worktree adopted at origin/dev 493ff497.
- 2026-10-16 phase 0.4: recon, two Explore agents (sonnet).
- 2026-10-16 phase 1: plan.md, OWNER-ASKS.md (OA-1 conditional), outline B drafted; dual audit started (Codex sol high, Opus Plan).
- 2026-10-16 phase 2: Codex r1 reject, Opus conditional approve; plan revised (OA-2 data, OA-3 fiat, OA-4 publish strip, own-text layout predicate, no allowlist); Codex r2 running.
- 2026-10-16 phase 3: Codex r2 conditional approve, conditions folded in (laid-out read, lock chip to OA-1, Phase 2b contract steps); fresh Codex pass started.
- 2026-10-16 phase 3: fresh Codex pass conditional approve, conditions folded; resumed: approve. Plan committed for the orchestrator's approval.
- 2026-10-17 arc 1 phase 0 ✓: merged origin/dev at 966bbde5 (#621 merged); `merge-base --is-ancestor 966bbde5 HEAD` 0; census unchanged (recon counts hold; 129 identifier sites, 88 `data`); lint 0, typecheck:all 0, test 0 (816 files).
- 2026-10-17 arc 1 phase 1: guard committed (db31c210); before runs green except one base Firefox flake at send-amount-exact:311 (rerun green); layout gate applied; after runs with before shots running.
- 2026-10-17 arc 1 phase 1 ✗ (gate red on base): `overflowingText` as specified fails on the unchanged UI. Genuine: the capabilities Details table head "Transact" 58/54 px (both browsers). Measurement defects: Firefox inline clientWidth 0, the Header's positioned copy icon, screen-reader spans. Phase 1 stopped per its Warning; panel consulted (Codex, Opus).
- 2026-10-17 arc 1 phase 1 ✗ (blocked on OA-5): measurement corrected (D8, both panel legs: correction); on the base tree the gate is red on exactly one element, "Transact" in the capabilities Details table (both browsers); all other surfaces green. Phases 2-4 not started.
- 2026-10-17 arc 1 resumed: decision page 34 answered OA-1 B, OA-2 A, OA-3 B, OA-4 C, OA-5 A (recorded in OWNER-ASKS.md); merged origin/dev at f695dea4 (ba12f8fd; `bun.lock` unchanged); icon-glyph rule dropped with the icon font (04a6776a); merged-base before figures green on both browsers (lessons/phase-1.md).
- 2026-10-17 arc 1 phase 1 ✓: merged-base gate red only on "Transact" (both browsers, as before the merge), before shots taken (15 pairs per browser); OA-5 A committed (dc49623a); windows gate green on Chrome (113.9 s) and Firefox (140.8 s); smoke gate green on both (83.1 s, 141.9 s); lint 0, typecheck:all 0, test 0.
