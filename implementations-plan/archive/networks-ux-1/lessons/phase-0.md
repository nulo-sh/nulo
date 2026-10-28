# Phase 0: planning consults

## Codex, round 1 (gpt-6.1-sol, high, fresh session)

Verdict: reject; five findings, each checked against the tree.

1. The divider's `::after` (`settings-row.module.css:4-16`) is absolutely positioned and paints after the stretched link, so a press on a non-last inactive row's hairline reaches the root `div` and opens nothing. Confirmed by the CSS. Accepted: the form lets the pointer through the divider too, and the e2e probe reads the hairline.
2. The smoke e2e loads `dist/<browser>` and refuses an unarmed build (`global-setup-smoke.ts:20-55`), so a red or green run before the armed rebuild tests stale code. Confirmed. Accepted: an armed build per browser before each run; root-level commands named; the full smoke suite per browser on the final head; an estimate and the per-browser suite wall-clock.
3. A keyboard press on Switch activates the row, which drops its Switch while it holds focus; focus falls to the body. Confirmed in a jsdom probe (a removed focused button leaves `document.activeElement === body`). Accepted: a pre-flush watcher hands focus to the newly active row's link, after the precedent in `settings/proving.vue:44-47`.
4. Restoring the start after the e2e switch must wait for the selection to move out and back, not for any selection. Accepted.
5. `SettingItem.vue` and `Settings.test.ts` are outside the brief's file list, so D1 needs an explicit scope amendment. Codex calls D1 architecturally defensible and the page-owned row the in-scope alternative. Disposition in plan.md D1.

Also: class and style stay on the row's wrapper, the other attributes on its link (accepted); D2 holds.

## Opus, round 1 (Plan agent, opus)

Verdict: conditional approve; nine findings, each checked against the tree.

- Accepted: the row's attributes on the link only, since `querySelector` would return a div holding the same testid first and the helpers' synthetic click would open nothing; a 1.1 control that does not stop the click, since `RowAction` stops it (`RowAction.vue:17`) and would hide a root-bound navigation; `pointerClick` takes a bare testid, so each press first asserts which Switch it hits; the settle waits after each switch; F2 counts six dispatch sites; I1's evidence did not hold (no smoke spec that switches asserts `consoleErrors`), so 1.3 is the evidence and the red path is stated; the scope deviation recorded; the hairline; the capture before the press; test mechanics.
- Rejected: accept the focus loss as the detail page has it. The codebase already hands focus on in `settings/proving.vue:44-47`, and matching a gap elsewhere is no reason to ship one.

## Codex, round 2 (resumed)

Verdict: conditional approve (with conditions: hand focus off after rendering; obtain the scope amendment before implementation). Both accepted. The pre-flush watcher would have focused the inactive row's old link, which the render replaces too; it now only notes focus and focuses after `nextTick`. Review at merge does not authorize files outside the brief's list, so the amendment became an open Ask for the orchestrator, and this session stops at the plan report.

## Codex, round 3 (resumed, the final pass)

Verdict: conditional approve (with conditions: the orchestrator accepts `SettingItem.vue` and `Settings.test.ts` before implementation); the plan is otherwise approved, the focus fix verified, no regression.
