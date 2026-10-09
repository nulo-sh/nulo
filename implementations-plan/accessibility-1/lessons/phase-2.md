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
