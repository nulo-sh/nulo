# unit-flakes-3 status

- 2026-10-27: recon done; causes established for #1122 (production: no cancel check after the `proving` mark), #1244, #1198, #1215 (test ordering).
- 2026-10-27: plan drafted (tier light, one arc); sent to Codex (gpt-6.1-sol high) and an Opus Plan leg.
- 2026-10-27: audits returned: Codex conditional approve, Opus conditional approve; all material findings adopted, one rejected (slot release in `finally`).
- 2026-10-27: Codex verification 1 conditional approve (circular F2 control); control trigger fixed.
- 2026-10-27: Codex verification 2 approve; plan committed; OWNER-ASKS none, so arc 1 starts under auto-continue.
- 2026-10-27: Phase 1 green: lint 0, typecheck:all 0, seeder.status 30/30, incoming scenarios 30/30; red controls reproduce both CI errors.
- 2026-10-27: Phase 2 green: lint 0, typecheck:all 0, auth-registry 30/30; old handler reds both positive cases under dispatch.
- 2026-10-27: Phase 3 green: lint 0, typecheck:all 0, coordinator 30/30, composition 30/30; new case reds at the base coordinator on its gate assertion; held-read controls: red without the slot, green with it.
- 2026-10-27: Phase 4 green: test:all exit 0 (run 1 red on the type-roles digest pin, re-pinned; run 2 red on known flake #1226, rerun), test exit 0.
- 2026-10-27: review loop converged (round 1: Codex 1 low, Opus 3 low, all fixed; round 2 clean).
