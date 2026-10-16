# Phase 0: planning consults

Every consult of the planning panel, in order, with its verdict and what changed.

## Round 1, Codex (gpt-6.1-sol, high, default `~/.codex` login), 2026-10-16

Verdict: **reject**, three blocking findings. Every claim checked against the tree and held:

1. D1 detects drift but does not remove it: deleting a page row leaves its registry copy, which the brief's "a removed row drops out of search with no other edit" forbids. Display, Privacy and Developer already hold row definitions in script maps.
2. `SettingItem` declares `to: String` (`SettingItem.vue:40`); a location object with `replace: true` breaks its prop contract.
3. The phase 3 smoke command cannot pass on a fresh checkout: `global-setup-smoke.ts:34-73` refuses a build that is not the armed smoke build, and Firefox needs its own build.
4. `ItemsContainer`'s `.wrapper` has `overflow: hidden` (`ItemsContainer.vue:39-43`): mockup c's outward outline is clipped on every list row and on Lock now.
5. Composition is guarded only on Enter; a held Escape clears, then its repeat reaches an empty field and can close the toolbar popup.
6. The smoke assertion (`data-highlighted` plus a non-`none` animation name) passes after the fade ends or with the row off-screen.
7. `activity.vue` derives its filter reactively and clears it on a user action: not a read-once precedent. Codex reproduced I3 (replace from an immediate watch) and I2 (attribute kept across a class update) with the installed versions; the composable list had 9 cases, not 10.

## Round 1, Opus 5.5 Plan leg, 2026-10-16

Verdict: **conditional approve**. Conditions: an owner ask for the outline `ItemsContainer` clips (17 of 34 rows: every list row and Lock now); no fill-forwards on the animation (the kept last keyframe would beat the rows' focus and hover rings); a string `to` without the same-page `replace`; `v-if` for the list and no element map (no caller: every sub-page result mounts a fresh page); D1 re-decided against the glossary pattern (CLAUDE.md § Tooltips and the glossary: one module both surfaces read). Lower: rank a multi-term query by the weakest field a term needed; guard composition and `defaultPrevented` on every key and listen on the component root; an owner line for Back landing on an empty field; `test:all` already covers the extension; the owning-pages pin has no mechanism; "first Tab stop" means after the app Header. Fact fixes: hash history at `popup/index.ts:12,44`; read-and-clear-at-once is new to the codebase (`activity.vue` keeps a lasting filter, `send.vue`'s latch never clears the URL).

## Round 1 disposition (driver)

All findings of both legs accepted; the two legs agree on every overlap. D1 flips to "pages render each row's text and testid from the registry". The element map goes (Opus) although Codex judged it proportionate: with `v-if` it has no caller. OA-4 (the inset outline) and OA-5 (Back) added.

## Round 2, Codex resume, 2026-10-16

Verdict: **conditional approve**. (1) The revised mounted check dropped the rendered-text check: a page that binds the description into the title slot would pass. Fix: `expectOwnedRows` keeps exact title and description checks. (2) The e2e's pause-and-read runs after navigation and the config read; a delay past 2.4 s would find the animation gone (fill mode none). Fix: arm a test-only `MutationObserver` before the click that pauses the animation at 0 as the attribute lands, disconnected after capture and in `finally`. I2 reworded to the reproduced behaviour. Both accepted; confirmation resume next.

## Round 3, Codex resume, 2026-10-16

Verdict: **approve**. Both round-2 fixes verified; no new material defect or regression.
