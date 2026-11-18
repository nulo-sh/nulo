# table-legend-1 status

- 2026-11-18: plan written at `449baa5ec` (thinned light tier: no plan audit round).
- 2026-11-18: arc 1 built at `d6fff21d0`; the four new legend assertions red on the base component, green after.
- 2026-11-18: gate 1 green at `d6fff21d0`: `bun run lint`, `bun run typecheck:all`.
- 2026-11-18: gate 2 green at `d6fff21d0`: the named unit run, 16 files, 398 passed, 1 skipped (the type-role ban's opt-in writer).
- 2026-11-18: gate 3 green: `bun run check:plans`.
- 2026-11-18: captures written (`tl1-window`, `tl1-page`, `tl1-page-one`, light and dark, 2x): the legend 40 px on two lines in each; the window's table 342 px, the page's 312 px.
- 2026-11-18: gate 4 green at `d6fff21d0`: smoke `type-roles.test.ts`, Chrome 14 passed and 1 skipped (Firefox-only) in 104 s, Firefox 15 passed in 189 s.
- 2026-11-18: gate 5 green at `d6fff21d0`: network `type-roles-windows.test.ts` and `cap-window.test.ts`, Chrome 11 passed in 339 s, Firefox 10 passed and 1 skipped (Chrome-only reduced motion) in 491 s.
- 2026-11-18: Codex pass at `d6fff21d0`: approve with comment cleanup, fixed in `653a1f0eb`.
- 2026-11-18: static gates green again at `653a1f0eb` (lint, typecheck:all, the named unit run: 16 files, 398 passed, 1 skipped); the e2e evidence at `d6fff21d0` holds, since `653a1f0eb` changes comments only.
