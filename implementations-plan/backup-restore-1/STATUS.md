# backup-restore-1 — status

- 2026-10-17 recon done (2 explorers); claims of #663 hold; #671's fix sketch leaves the status at "" (D7).
- 2026-10-17 draft plan: three arcs, hold-not-drop for #663 (D1), OA-1 filed.
- 2026-10-17 dual audit round 1: Codex conditional approve (R1-R5), Opus conditional approve (F-1..F-12); all dispositions in the ledger; #671 moved to arc 1; OA-2..OA-6 filed.
- 2026-10-17 final fresh Codex pass: conditional approve (owner ask for the orphan-key record) → applied as OA-5 → resumed: approve. #710 filed for P38-05's B.
- 2026-10-17 arc 1 phase 1 (C5, D7): gate green — lint; vitest MigrationBarrier + useFullBackupImport + useRestoreAgain 177/177; the three new tests fail on the pre-fix code.
- 2026-10-17 arc 1 phase 2 (D5, C1-C3): gate green — lint; typecheck:all; vitest network-reset + stale-network + networks page + the fixtures' suites 428/428.
- 2026-10-17 arc 1 phase 3 (D6, C4): gate green — lint; typecheck:all; test:all (extension 13584 passed); build. E2E next.
- 2026-10-17 arc 1 review loop converged (Codex round 3 clean; Opus 0 material). Final head after merging dev 5653e890: lint, typecheck:all, check:plans, test:all (extension 13588 passed), build green; smoke e2e 5 files 27/27 retry 0 (262 s); network e2e 4 files 7/7 retry 0 proverless (307 s). Screenshots under screenshots/arc1/.
- 2026-10-17 arc 2 phase 4 (D1, D2, D4): gate green — lint; typecheck:all; vitest account + network + network-reset + composables 1560/1560; restart test red on base 138e0ded (no key row after restart), green after.
- 2026-10-17 arc 2 phase 5 (C6): lint; typecheck:all; test:all (extension 13677 passed); build green. E2E next.
- 2026-10-17 arc 2 phase 5 e2e: smoke retry 0 (restore-outcome, import-errors-scroll, backup-imported-account) 8/8, 142 s; network e2e retry 0 proverless (backup-restore-integrity, backup-edited-local-network, restore-again) 5/5, 255 s. Gate green. Review round 1: Codex 2 minor fixed (9dd3ad38), Opus 0 material.
- 2026-10-17 arc 2 review loop converged (Codex round 2 clean; Opus 0 material).
- 2026-10-18 arc 2 final head 44c6d3ab (dev 138e0ded merged): lint, typecheck:all, test:all (extension 13677 passed), check:plans green; smoke e2e 8/8 retry 0 (160 s); network e2e 5/5 retry 0 proverless (337 s).
