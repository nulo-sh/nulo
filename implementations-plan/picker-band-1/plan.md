---
plan: picker-band-1
tier: light
status: in progress
issues: "#1884 (the follow-up the owner asked for; this PR closes it)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon in-session plus one Sonnet sweep; one Codex gpt-6.1-sol high pass over the plan and the completed diff
base: origin/dev at 6cfb89e57
trunk: dev
post_implementation_hardening: not scheduled
---

# picker-band-1: Send's token picker rows take H1's band

#1898 built H1 (page 193, P193-01) on Home, Holdings, History and a token's page, and left Send's token sheet on its old geometry. The owner, 2026-11-19: "H1: Ok. Land 1898 and do the small follow-up." This is that follow-up.

## Outcome & Quality Bar

- **For whom**: a person who opens Send's token sheet and moves the pointer or Tab over its rows.
- **Excellent**: a hovered, focused or selected row's fill and ring touch both edges of the sheet, as on the pages; icon, symbol and figures do not move; the sheet gains no sideways scroll at any width; the sticky search bar covers the band edge to edge.
- **Good enough**: every other row list keeps its geometry; they are listed below, not changed.

## Architecture & Implementation

- **The gutter.** The sheet's 20 px gutter is set once, by `.body` in `src/components/Popup/popup-shared.module.css`, which every sheet body composes. `.body` now declares `--page-gutter: 20px` and pads with it, as each H1 page does with its 24 px.
- **The rows.** `TokenCard.vue`'s `.pick` drops its own `width`, `margin` and `padding`, so a picker row takes `.link`'s band: `margin-inline: calc(-1 * var(--page-gutter, 0px)); padding-inline: var(--page-gutter, 0px)`. A `<button>` flex item stretches into its negative margins as an `<a>` does (measured; F6), so no width is needed. `.pick` keeps only the button resets.
- **The sticky search bar** (`TokenList.vue` `.sticky`) already reads `--page-gutter`, so in the sheet it now bleeds to the sheet's edges over its `--token-list-bg` (the sheet's colour): invisible at rest, it covers a row's band that scrolls under it.
- **Unchanged**: the fill colour, the ring (2 px accent, offset −2 px, on the row's own box), `:active`, the selected fill and its bar (`box-shadow: inset 2px 0 0` on the row's own box).
- **Files**: `popup-shared.module.css`, `TokenCard.vue`; tests `tests/e2e/token-list.test.ts`, `tests/e2e/rows.test.ts` and a new `tests/e2e/helpers/row-bands.ts`.
- **Alternative not taken**: declare the gutter in `SelectTokenPopup.vue`'s `.wrapper` only. It would need a second `20px` literal, or an override of the composed `padding` that depends on the order CSS Modules emits the two files. The shared rule is where the gutter is set, and on the other 13 sheets the property is inert (F3).

## Security & Adversarial Considerations

CSS geometry only: no data, storage, message or permission change. UI integrity: a row's hit area now covers the sheet's gutter, so a press beside a row picks it; that is the band the owner chose for every row. No overlay sits over the gutter in the sheet: the search bar is sticky and bleeds with the rows.

## Assumptions

**Facts** (at the base)
1. `.pick` set `width: calc(100% + 16px); margin: 0 -8px; padding: 8px` after `.link`, so it beat `.link`'s band (`TokenCard.vue:185-194`). Measured in the sheet: each row's box ran from 12 to 348 px of 360; the icon stood at 20 px.
2. `.body { padding: 0 20px 24px 20px }` (`popup-shared.module.css:27-29`) is composed by `SelectTokenPopup.vue:192` and 13 other popups.
3. Only `TokenCard .link`, `TransactionCardLayout .wrapper` and `TokenList .sticky` read `--page-gutter`; of the 14 sheets that compose `.body`, only the token sheet renders any of them.
4. The sheet spans the popup: `Popup.vue` `.wrapper` is `position: absolute; inset: 0` in the app's 360 px column; `PopupCard.vue` `.wrapper` (`overflow: auto`) pads only its top. Measured: the card's `scrollWidth` equals its `clientWidth` (360) before and after.
5. The selected bar is an inset shadow on the row's own box (`TokenCard.vue:196-199`), so it moves with the band: from 12 px to the sheet's edge.
6. In Chrome, a `.pick` button with `width: auto` spans 0 to 360 px under `.link`'s margins (probe on the capture page).
7. No picker geometry pin existed. #1898 measured `.pick` live (its lessons) and pinned nothing; jsdom has no layout, so no component test pins it. The brief's "update the picker's geometry pin in `rows.test.ts`" did not hold.
8. `token-list.test.ts`'s flagged scenario opens the sheet from Send with one row, the sent token's, selected. Its `describe` skips when `liveLeg` is set, which every artifact run sets (`global-setup-smoke.ts:60`), so it runs in source smoke runs only, as #1898's pins in `rows.test.ts` partly do.
9. The popup draws no scrollbar (`packages/design/src/base.css`, `* { scrollbar-width: none }`), so the card's content width is its box's.

**Inferences**
- I1. Firefox stretches the button as Chrome does. The amended e2e reads every row's box on Firefox.

**Asks** (for the orchestrator)
- A1. The selected bar moves with the band, from 12 px to the sheet's edge. Built: the bar on the band's edge (D3); the frames show both placements.

## Decisions

- D1. `--page-gutter` lives in the shared sheet body (above). Every sheet becomes a gutter host: a token or activity row placed in a sheet later reaches its edges as long as nothing between the body and the row adds a side inset, the constraint `TokenCard.vue` already states.
- D2. `.pick` takes `.link`'s band instead of its own copy. Its fallback becomes `.link`'s (0: a picker in a host with no gutter stays in its column); the only host sets one.
- D3. The bar stays where its rule puts it, the band's leading edge, as today it marks the row box's edge. Kept at 12 px it would float inside the fill, 8 px from the icon, a relation no other row has.
- D4. The ring stays inset on the row's own box, which now ends at the card's padding edge, inside its `overflow` clip, so all four sides stay whole. Accessibility call under the owner's 2026-10-19 delegation.
- D5. The pin amends the flagged scenario in `token-list.test.ts`, the one smoke scenario with a row in the sheet: every row's box and the search bar must span 0 to the viewport's width with no sideways scroll, and the sent token's row must be selected. `readBands` and `expectEdgeToEdge` move from `rows.test.ts` to `helpers/row-bands.ts` for both specs. No new scenario: the reads add well under a second.

## Other row lists whose band differs from H1 (not changed)

From a Sonnet sweep, spot-checked (`SettingItem.vue:247-256`, `SendPersonStep.vue:110-115`, `StepRow.vue:58-61`):
- `SettingItem` rows (Settings and its sub-pages, the accounts, profile, network and forgot-password sheets, Home's What's new and Get started): fill `--nulo-surface-high`, inside a bordered `ItemsContainer`, inset by the host's 20 or 24 px.
- Connected apps and contacts (`settings-row.module.css` rows): `--nulo-surface-high`, inset 24 px, hairline dividers.
- Send's recipient list (`SendPersonStep.vue` `.person`): H1's fill and ring, but `padding: 8px 4px` inside the 24 px gutter.
- Send's recipient suggestions (`RecipientField.vue` `.contact`): fill, no ring, inside a bordered box.
- Import contacts sheet and the detail pages' links (`select_row`, `detail-page.module.css`): bordered cards, hover changes the border.
- Developer records (`record-card.module.css`): bordered cards.
- Execute window steps (`StepRow.vue`): H1's fill and ring with a 6 px bleed.
- Capabilities window (`AccountSelectRow.vue`, `DetailsTable.vue`): `--nulo-surface-high` or a 1 px ring, inset 16 px.
- Fee priority and method controls, dropdown items, the logs row, the endpoint order list: tiles, menu items or no fill.

## Phase 1: the band and its pin

1. Declare the gutter in `.body`; strip `.pick` to its button resets.
2. Move the band helpers to `helpers/row-bands.ts`; amend the flagged scenario.

**Validation gate**
- Commands: `bun run lint`, `bun run typecheck:all`, `bun run test`, `bun run test:all`, `bun run check:plans` (after staging); the armed smoke build per browser, then from `apps/extension`: `bun run test:e2e -- tests/e2e/token-list.test.ts tests/e2e/rows.test.ts tests/e2e/send-picker-add.test.ts --retry=0`, then the same with `NULO_E2E_BROWSER=firefox`.
- Pass: every command exits 0; the amended scenario reads 0 and the viewport's width on the sheet's rows and search bar on both browsers.
- Layers: lint, typecheck, unit, smoke e2e on Chrome and Firefox.

## Phase 2: captures (not committed)

The real `SelectTokenPopup` in a 360 × 600 frame on a scratch Storybook page, fed by a fake background, at 2x, light and dark: resting, hovered, focused (Tab) and with a selected row, today and after, plus the selected row with the bar kept at today's place. Pushed to the PR branch in one commit and removed in the next.

**Validation gate**: 18 frames on disk; outside the hovered, focused or selected row, each after frame matches its today frame.

## Review verdicts

Codex (`gpt-6.1-sol`, high), one pass over this plan and the diff at `59f7ea108`: no demonstrated regression. It checked the picker's wrappers for a side inset, `.link:hover` / `:focus-visible` against `.pick` and `.selected`, the ring inside the card's clip, the 13 other sheets, the moved helpers and the selected-row assertion. Three local findings, all verified and accepted:
- R1: F8 said the pin runs in artifact smoke; every artifact run sets `liveLeg`, which skips the `describe`. F8 corrected.
- R2: D1 promised that any later row in a sheet reaches its edges; that holds only with no side inset between the body and the row. D1 qualified.
- R3: `.pick`'s comment restated the template; it now says why the button needs no width.

## Post-implementation

Cited from `implementations-plan/README.md` § Post-implementation standard at `6cfb89e57`. Bounded work: one Codex pass (`gpt-6.1-sol`, high, read-only) over this plan and the completed diff, with the adversarial ask (a sheet width or host where the band scrolls sideways or is cut, a ring clipped by the sheet's `overflow`, the selected bar misplaced, a row on another surface that changed) and the two verbatim rules; then targeted verification of each material fix.

## Delivery

One PR against `dev`, ready for review, never merged by this session; `Closes #1884`. Close-out (Outcome, archive move) as the PR's final commits.

## Seeds

- `/goal`: Build implementations-plan/picker-band-1/plan.md; stop at a green PR.
- `/loop`: Check the PR's required checks; fix a red at its cause; never merge.
