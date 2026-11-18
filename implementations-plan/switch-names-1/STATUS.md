# switch-names-1 status

- 2026-11-18 plan drafted at b22893f42 (light, thinned: no plan audit round).
- 2026-11-18 phase 1 built (9a28fc241, privacy stub fix); red/green: every name test red on base sources, green at head
- 2026-11-18 gate 1 lint: pass. gate 2 typecheck:all: pass (after a Node-vs-Element fix in the connected-apps pin). gate 3 vitest, 10 files: 148/148 pass.
- 2026-11-18 gate 4 check:plans: pass. gate 5 smoke Chrome, 12 files at retry 0: 11 passed, 1 skipped (firefox-sidebar); 71 tests passed, 6 skipped; 476 s.
- 2026-11-18 gate 5 smoke Firefox, same 12 files at retry 0: 12 passed; 71 tests passed, 6 skipped; 618 s.
