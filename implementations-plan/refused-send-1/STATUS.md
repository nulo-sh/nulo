# Status: refused-send-1

- 2026-10-20 phase-0: recon done (2 Sonnet explorers + node rc.3 source); plan drafted; audits next.
- 2026-10-20 phase-0: Codex r1 reject, Opus conditional approve; r2 conditional approve; r3 approve. Plan approved by the panel; OA-1..3 open (ship-now forms).
- 2026-10-20 A1 phase 1+3: lint 0, typecheck:all 0, test:all 0 (extension 14632 passed). Phase 3 landed with 1: the exhaustive display records do not compile without it.
- 2026-10-20 A1 phase 2: lint 0, typecheck:all 0, test 0 (14658 passed); mutations of the checkSince and fresh-clock guards each turn their test red.
- 2026-10-20 A1 phase 4: F green; smoke send-outcome-rows Chrome + Firefox green; network wait-for-tx-mined + failed-send-check (Chrome, proverless) green.
- 2026-10-20 A1 phase 5: audit:vue, test:all, check:plans green after merging dev; review round 1: Codex approve, Opus approve, lows adopted.
- 2026-10-20 A1 phase 6 (P77-11 B): F green (14676 passed); mutations of the new branch and move each turn their tests red.
