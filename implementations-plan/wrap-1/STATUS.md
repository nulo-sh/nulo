# wrap-1: status

- 2026-10-30: adopted worktree at a4da1f36f; registered.
- 2026-10-30: measured the four places in the armed Chrome build (recon § Measured): the warning, Home's reminder, Restore again's intro and its failed-Retry line overflow with a typed 25-character name; the seed-only places fit.
- 2026-10-30: plan drafted (D1-D6); OWNER-ASKS none.
- 2026-10-30: plan audit: Codex r1 conditional, Opus conditional, Codex r2 conditional, Codex r3 approve; plan approved.
- 2026-10-30: arc 1 step 1: D6's four cases red on the base copies; SE1 red at its 240 px banner check on base builds, Chrome and Firefox. Before wall-clock (base file, base build): Chrome 43.7 s (SE1 11.5 s), Firefox 60.3 s (SE1 17.1 s).
- 2026-10-30: arc 1 step 2: D1-D3 applied; the three test files green (41 tests).
- 2026-10-30: arc 1 gate green: the three test files; audit:vue (lint, typecheck:all, test 16417 passed, build); test:all; Chrome smoke (restore-outcome + import-errors-scroll, 7/7, retry 0); Firefox smoke (7/7, retry 0); capture (every place ≤0 at 360/240 for w25 and real25, held32 ≤0 in the warning, seed rows identical to base). After wall-clock of restore-outcome.test.ts: Chrome 47.2-49.9 s (SE1 16.0-17.6 s) at load 135-181, paired same-load SE1 13.7 s base file vs 14.4 s new; Firefox 57.3 s (SE1 16.0 s).
