# backup-restore-1 — status

- 2026-10-17 recon done (2 explorers); claims of #663 hold; #671's fix sketch leaves the status at "" (D7).
- 2026-10-17 draft plan: three arcs, hold-not-drop for #663 (D1), OA-1 filed.
- 2026-10-17 dual audit round 1: Codex conditional approve (R1-R5), Opus conditional approve (F-1..F-12); all dispositions in the ledger; #671 moved to arc 1; OA-2..OA-6 filed.
- 2026-10-17 final fresh Codex pass: conditional approve (owner ask for the orphan-key record) → applied as OA-5 → resumed: approve. #710 filed for P38-05's B.
- 2026-10-17 arc 1 phase 1 (C5, D7): gate green — lint; vitest MigrationBarrier + useFullBackupImport + useRestoreAgain 177/177; the three new tests fail on the pre-fix code.
- 2026-10-17 arc 1 phase 2 (D5, C1-C3): gate green — lint; typecheck:all; vitest network-reset + stale-network + networks page + the fixtures' suites 428/428.
- 2026-10-17 arc 1 phase 3 (D6, C4): gate green — lint; typecheck:all; test:all (extension 13584 passed); build. E2E next.
- 2026-10-17 arc 1 review loop converged (Codex round 3 clean; Opus 0 material). Final head after merging dev 5653e890: lint, typecheck:all, check:plans, test:all (extension 13588 passed), build green; smoke e2e 5 files 27/27 retry 0 (262 s); network e2e 4 files 7/7 retry 0 proverless (307 s). Screenshots under screenshots/arc1/.
