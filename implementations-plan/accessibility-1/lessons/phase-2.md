# Arc 2, phases 2.1 to 2.4: log

Commands as plan.md § Implementation phases defines them (smoke runs build first and unset `EXTENSION_PATH`; network runs at `NULO_E2E_RETRY=0`). Shots are local only (`NULO_E2E_SHOT_DIR`); the PR embeds them.

## Red on the base (the plan commit, `536bb38`)

- Unit, Phase 2.1: `RecentActivityView.test.ts` and `TokensView.test.ts` failed on `expected 'SPAN' to be 'A'`.
- Smoke, Chrome and Firefox: `home-links.test.ts` failed with `Tab never reached tokens-view-all` (the walk wrapped the page twice); `tooltips-glossary.test.ts` read the focused back arrow as `none 3px 0px`; `onboarding-tab.test.ts` read the focused method tab as `solid 2px -2px` in the accent colour, the ring drawn on its own fill.
- Network, Chrome and Firefox: `connect-one-window.test.ts` failed with `--nulo-track is not defined`.
- First Firefox runs read every ring as `none` even where a rule exists: the page had no system focus. `prepareKeys` fixed the walk; the create page's autofocused password field made a forward walk leave the document, so that walk goes back with Shift+Tab (plan.md A2-D4).

## Phase 2.1

- Smoke Home on testnet draws "View all" once the four default tokens land (I5 holds).
- Green: unit; smoke `home-links.test.ts` on Chrome (18 s) and Firefox (36 s), retry 0; fast layers.

## Phase 2.2

- Red: the two source-rule tests (`SubPageHeaderBase.test.ts`, `create.test.ts`) before the rules existed; the smoke reds are above.
- Green: unit and design tests; smoke `tooltips-glossary.test.ts onboarding-tab.test.ts` on Chrome and Firefox, retry 0, 14 of 14 each; the focused back arrow reads `solid 2px -2px` in the accent and the focused method tab `solid 2px -5px` in `--app-bg`, both browsers; fast layers; `build-storybook`.

## Phase 2.3

- Red: the two 3:1 rows for `--nulo-track` and the bar's source-rule test, before the token existed; the network red is above.
- `--nulo-track` sits beside the brand tokens it belongs to, in `:root` (dark, `#68625a`) and `[theme="light"]` (`#8f8a82`); `tokens.ts` regenerated, `utilities.css` unchanged; `base.css.test.ts` re-pinned in the same commit. Ratios on the page from `contrast()`: 3.30 dark, 3.15 light (the plan's figures).
- Green: design tests (drift, parity, hash, unthemed vs dark parity); network `connect-one-window.test.ts` on Chrome and Firefox at retry 0, 1 of 1 each; fast layers.

## Phase 2.4

- The green "Sent" story was added before any colour change, so its before shot is today's green.
- Red: twelve rows in the new status block of `theme-contrast.test.ts` (nine light AA pairs, three dark aliases) and two source-rule tests in `TransactionTerminalCard.test.ts`.
- Light ratios from `contrast()`, matching options.md: amber 5.28 / 5.00 / 4.57, red 6.00 / 5.68 / 5.20, green 5.44 / 5.15 / 4.71 on the page, surface-low and surface-high.
- Green: design and unit tests; fast layers; `build-storybook`. Storybook shots before and after on Chrome and Firefox: every dark story and the gray story are byte-identical under `cmp`; only the light amber, red and green lines changed.

## Arc 2 review, round 1

- Codex and Opus both flagged that smoke "View all" waits on every testnet default token landing. I first kept it on the `rows.test.ts` precedent; Opus showed that precedent waits only for the list to settle, which a failed default also satisfies, while "View all" needs a fourth row. The "View all" assertions moved to `network/home-cap.test.ts` (four funded tokens), which passed on Chrome and Firefox at retry 0.
- A first try at the token page seeded token row 1 before Home settled: the list never settled (150 s timeout, both browsers), because a token row the wallet did not land keeps its default token's seed working until a balance row lands. Seeding it after Home's part, then reloading, as `rows.test.ts` does for that page, avoids it.
