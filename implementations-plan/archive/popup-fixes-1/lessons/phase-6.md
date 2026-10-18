# popup-fixes-1, phase 6: #786, the ghost rows

- 2026-10-18, branch `popup-fixes-1-a2` off origin/dev `97ffa088` (#811 merged). OA-1 taken as A on the lane's recommendation, the owner's answer pending (spawn brief).
- Scratch spec (`~/.cache/nulo-backlog/popup-fixes-1/shots/arc2.shots.test.ts`, never committed): `evaluateOnNewDocument` wraps `chrome.runtime.connect` and drops every `getTokenBalances` request on the `token-balance` port, then the popup reloads, so Home's list never settles and the ghost rows stay. Then two token rows and their balance rows are seeded and the worker restarted (as `rows.test.ts` does), so the same card shows the two rows that replace the ghosts.
- Base (armed Chrome build at `97ffa088`): each ghost row 41 px; each column's `row-gap` computes `normal` and its bars touch (drawn gap 0); the list 83 px. Two loaded rows: 53 px each, the list 107 px. The card grows 24 px when the rows land.
- D4 applied. `bun --bun vitest run src/popup/components/modules/general` (plus `a11y-css`, `type-role-ban`): 17 files, 400 passed, 1 skipped, unchanged.
- After (armed Chrome build): each ghost row 53 px, both columns `row-gap: 2px`, drawn gap 2 px, the right column 37 px; the list 107 px, equal to the loaded list. I1 holds.
- Gate: S on `rows.test.ts` and `home-links.test.ts` at retry 0. Chrome 11/11 (115 s; `home-links` 11.4 s), Firefox 11/11 (141 s; `home-links` 15.1 s). These `home-links` times are the file's before figures for Phase 7 (D4 does not touch its path).
