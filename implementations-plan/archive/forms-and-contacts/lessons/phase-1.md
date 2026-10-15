# Phase 1: arc 1 (logger, config, stack depth, logs viewer, names)

- 2026-10-10: start. Merged `origin/dev` 643c0c9 (#247, the PXE patch) into the plan branch; one conflict in `implementations-plan/index.md`, both lines kept. Orchestrator decisions recorded as D-orch-1 to D-orch-3.
- 2026-10-10: phase 1.2: D-arc1-1 recorded (display.vue's dead ref rollback dropped; the field is restored from the stored value).
- 2026-10-10: phase 1.3: D-arc1-2 recorded (the BUG PIN names no plan id; closed-key pins for form popups).
- 2026-10-10: Codex arc-1 round 1: approve, 2 Lows accepted (pair test made deterministic after it was found to pass vacuously on a 7 ms first round trip; apply docblock cut).
- 2026-10-10: Opus arc-1 review: approve, 1 Low accepted (Lock's auto-lock field restores the stored timeout after a failed write).
- 2026-10-10: Codex arc-1 round 2: conditional approve, 1 Medium accepted (failed-write reset no longer overwrites a newer edit, Lock and Display).
- 2026-10-10: Codex arc-1 round 3: approve, no new material findings; loop converged (session 01a1238b).
- 2026-10-10: final test:all run 1 red on one unrelated property: `balances.store.fuzz.test.ts` C1 (owed recovery) with random seed -2034686224; the seed reproduces on origin/dev 643c0c9 with this arc's files reverted, so it is pre-existing. Run 2 (new seed) green. Filed as an issue at delivery.
- 2026-10-10: final smoke at bb46d81, armed builds, retry 0: Chrome 47 files passed (198 tests, 11 skipped), Firefox 49 files passed (199 tests, 10 skipped). PR screenshots taken on the Chrome build by a scratch spec copied into tests/e2e for one run and removed; they are committed in one commit and dropped in the next, as the repo's earlier PRs did.
