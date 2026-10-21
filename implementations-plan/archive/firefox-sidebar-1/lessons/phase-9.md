# Phase 9: gates, `dev` moving under both arcs, the PR

Each run starts with load1 under 150, retry 0.

## `dev` moved

While arc 2's last gates ran, `dev` reached `e7192fa8d` (#981 and four more), and #889 conflicted with it. A PR's CI tests the merge with today's `dev`, so both branches were brought onto it before anything was pushed.
- **Arc 2**: rebased onto `e7192fa8d` before its first push. #981 rewrote the capabilities window's Details table with six glyph columns (`repeat(6, 26px) 14px`), so its narrow grid was rewritten for them: the head and every row share one grid's columns through `subgrid`, a contract's name takes its own line above the marks, the marks stay at the right under their glyphs, and a mark column narrows to 15 px before the table would overflow. #981's new execute and connect cards fit at 240 with no new rule.
- **Arc 1**: `dev` merged again. `manifest.test.ts` keeps both sides; `onboarding-tab.test.ts` takes `dev`'s with the shared `waitForOpenPanel`. #743 removed onboarding's Learn route, so `firefox-sidebar.test.ts`'s toolbar step now opens onboarding on its Done route.
- The 360 compare's base was rebuilt from `e7192fa8d`; its noise control read 0 changed pixels on 84 pairs on both browsers again.

## Gates on arc 2 at `d9cfd646a` (`dev` `e7192fa8d`)

| Gate | Outcome |
|---|---|
| `audit:vue`, `test:all` | Exit 0 (177 s, 155 s). |
| The narrow smoke specs, both browsers, before the Details fix | Exit 0: Chrome 435 s, Firefox 520 s. |
| Network, proverless: `type-roles-windows`, `cancel-mid-prove`, `in-flight-send-guard` | Exit 0: Chrome 285 s, Firefox 390 s; `type-roles-windows` again after the Details fix, with the pictures, Chrome 469 s, Firefox 432 s. |
| Full smoke | Chrome 270 passed, 17 skipped, 0 failed (60 of 67 files, 33 min); Firefox 270 passed, 17 skipped, 0 failed (63 of 67 files, 46 min). |
| The window specs: `cap-window`, `execute-scope-account`, `execute-scope-chain`, `connect-check-window`, `window-placement`, `tx-transfer-row` | Exit 0: Chrome 14 passed, 1 skipped, 536 s; Firefox 14 passed, 1 skipped, 517 s. |
| CSS diff, 360 compare | `lessons/phase-7.md`. |

## Gates on arc 1 with `dev` merged

| Gate | Outcome |
|---|---|
| `typecheck:all`, `manifest.test.ts` | Exit 0; 15 of 15. |
| `firefox-sidebar`, `onboarding-tab`, `settings-routes`, retry 0 | Firefox 16 of 16 (the toolbar scenarios 20.2 s and 23.8 s), Chrome 12 passed with the Firefox-only file skipped. |
| Arc 1 and arc 2 together, Firefox's sidebar pictures at 240, 340 and 360 | 315 s, every route captured. |
| `lint`, `lint:actions`, `check:plans`, `test` with the records | Exit 0. |

## Reviews after Codex's cap

Codex's three rounds on arc 2's diff were spent by round 3; each later change got an Opus 5.5 diff review (the plan's audit table). The last, on the rebase and the account switcher's `meta` row: conditional approve. Its one real finding: between 253 and 358 px the rewritten grid topped out at 194 px (six 26 px tracks, a 14 px one and the gaps, every track capped), so rows, hairlines and the foot stopped short of the panel. The 240 gate cannot see it: at 240 the table is 182 px and the tracks fill it. A leading `minmax(0, 1fr)` track takes the rest; a static replica measured on both engines at 182, 230, 262 and 300 px puts every row and the foot at the table's width, each mark under its glyph, and the chevron at the edge, where the old grid left rows at 194 px. Not taken: the 14ch floor drops Manage accounts' undo control onto its own line beside a hidden account's full address at 240; nothing is hidden or cut, and avoiding it needs a template change.
