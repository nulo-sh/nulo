# STATUS: harden-quality-fixes-3

- 2026-10-16 planner started on dev 493ff497; tier mid (the lane brief names it; the launch line said light, and the brief rule "the tier the lane brief names" wins).
- 2026-10-16 recon: two sonnet explorers (fixture import graph; F-05/F-13 instances at HEAD) plus a Biome `noImportCycles` probe (19 cycle edges).
- 2026-10-16 plan drafted (221 lines), outline B written; round 1 audits sent (Codex sol high, Opus Plan).
- 2026-10-16 round 1: Codex reject (8, all accepted), Opus conditional (10, 8 accepted, 2 sub-points rejected); plan revised (D7 reversed, D11, D12 added).
- 2026-10-16 final pass: fresh Codex conditional approve (2 findings, both accepted); plan revised, awaiting the orchestrator's approval.
- 2026-10-16 arc 1 started: merged origin/dev 3dc5a06a (#619, #603 after the plan; no e2e fixture moved).
- 2026-10-16 phase 1.1 gate pass: predicate truth table on the real source 128/128 equal (a mutant control differs on 6); `baseline:complexity` 21 acceptances, a second run no diff; lint, typecheck:all, test (813 files), baseline:rescore, test:ci-gating, test:release all exit 0.
- 2026-10-16 phase 1.2 gate pass: split proof (151 declarations, 147 byte-identical, 4 allowed changes; export sets +1 each, none removed); cycle probe red under `bun run lint` (exit 1) and reverted; 19 → 0 cycle diagnostics; lint, typecheck:all, test, test:all, test:ci-gating, check:plans exit 0. Deviation D13 (Biome needs the cycle rule at the root) recorded.
- 2026-10-17 phase 1.3 smoke Chrome (armed build, retry 0, whole suite, load1 135 at start): 57 passed, 6 skipped by design, 0 failed, 1777 s. Round 1 (Codex + Opus) folded: comments, D13 pin moved to the lint script (probe red exit 1, restored green).
- 2026-10-17 phase 1.3 smoke Firefox (armed build, retry 0, whole suite, load1 53 at start): 60 passed, 3 skipped by design, 0 failed, 2575 s. Codex loop converged at round 2.
- 2026-10-17 merged origin/dev 98d51e89 (#607, #617, #621, #622): #607's `callService` export moved to `fixtures/session.ts`; split proof against dev's `helpers.ts`/`extension.ts`: 146 byte-identical, `patchPagePolling` differs only by the phase 1.1 rewrite, 4 allowed changes; exports `helpers.ts` 93 → 94 (+`dropdownDiagnostic`); 0 cycles.
