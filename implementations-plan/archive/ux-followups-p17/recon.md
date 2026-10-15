# Recon: ux-followups-p17

Base `origin/dev` at 479ba56d (no lane file changed since 116974dc, where recon ran). Two Sonnet explorers (a reuse sweep over six capabilities, and a map of the outline-coloured text, the Details links and the two banners), then the planner's own reads. Reference only: the shots lead's throwaway branches `shot/450-b`, `shot/449-b`, `shot/413-a`, `shot/363-b` (off 5dc3a63c, read with `git diff`, never checked out).

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| Hover cue on a Details link | `apps/extension/src/popup/pages/detail-page.module.css:94-102` (`.detail_link`, no base colour, `:hover` accent); every Details link composes it (tx, journal via `TxHashRow.vue`; received inline; journal `.recipient_link`; the block links) | adapt: one declaration |
| Pinning a CSS rule | `detail-page.styles.test.ts` and `utils/a11y-css.test.ts` read sources as text: jsdom applies no CSS modules and no `:focus-visible` (`a11y-css.test.ts:1-3`; design's vitest processes only `Button.vue`'s CSS) | reuse-as-is |
| Snack re-open after a replacement | `packages/design/src/composables/toast.ts` (one shared `toast` ref; `updateToast` does nothing once its snack is replaced, `:69-72`); the only `updateToast` caller is `useContactImportExport.ts:252` (`showProgress`); `snackInset.ts:188` already watches `toast.value?.id` | adapt the caller; the shared module stays as is |
| A lock or scope change closing snacks | `apps/extension/src/popup/scope-epoch.ts` (bump `scopeEpoch`, then `closeToast`; "a result that settles under another epoch, or locked, announces nothing") | reuse-as-is as the re-open guard |
| Live-region attributes | `ToastManagerBase.vue:129` (`role="status" aria-live="polite" aria-atomic="true"`), `:160` (`role="alert" aria-atomic="true"`); no `aria-relevant`, no sr-only announcer anywhere (searched `aria-relevant\|sr-only\|visually-hidden\|srOnly`) | adapt: one attribute on each card's title |
| Focus a child after a swap | `defineExpose` + template ref + `nextTick`: `AuthMethodTabs.vue:24`, `send.vue:274` (`focusAmount`), `ProfileNameField.vue:14`; no production `querySelector('[data-testid…')` (searched both quote forms) | reuse the pattern |
| Accent focus ring | `outline: 2px solid var(--nulo-accent); outline-offset: 2px` (28 rules, e.g. `packages/design/src/ui/Button.vue:184`), pinned as text in `a11y-css.test.ts:75`; no shared ring class (searched `focus-ring\|focusRing\|composes`) | copy the canonical pair locally, as every control does |
| Contrast pins | `packages/design/src/theme-contrast.test.ts`: token pairs; `--nulo-secondary` on `--nulo-surface` (`ENFORCE_ONLY`, `:42`) and on `--app-bg` (`:197`) are already pinned | adapt: add the row-tint pairs |
| One-or-many copy | inline ternaries; `restore-warning.ts:3` already picks `it`/`them` for the import warning; `joinNames` (`:61-64`) joins every restore surface's names | reuse; share the pronoun with the new reminder line |
| Keyboard e2e on Send | `tests/e2e/send-keyboard.test.ts:117-162` (the Enter pick); helpers `activeTestId`, `focusRing`, `tokenColor` (`helpers/pointer-probes.ts`) | extend the existing scenario |

## Issue claims checked against the tree

- **#450** holds: `.detail_link:hover` only changes colour, and dark `--nulo-accent` `#f8f1e7` sits beside `--txt-primary` `#f5f0e6`. The rule also covers the block links (`tx-block-link`, `received-block-link`), which rest in `--nulo-outline`; option B's text says "every Details link".
- **#449** holds (`toast.ts:69-72`). The shot's mock does not keep "closed stays closed": it never stops watching after the person closes the line, so a later snack's close re-opens it.
- **#448** holds: the info region is `role="alert" aria-atomic="true"` and the title text changes in place on every written row. A CDP probe (Chrome headless, `Accessibility.getFullAXTree`) shows live properties only on the region root, so it cannot show whether a nested `aria-live="off"` silences a change; that stays an inference (plan, Assumptions).
- **#413** holds: `pickHighlighted` (`RecipientField.vue:162-167`) blurs the input and the card replaces it, so focus falls to the body; `.icon_btn` (`RecipientCard.vue`) has no `:focus-visible` rule and `base.css:257-261` resets `button` outlines. **Does not hold literally:** "Tab then goes on to the amount". The next Tab stop after the card is the token card (`send-token-trigger`, Select Asset), then the amount (`send.vue:733-760`; `send-keyboard.test.ts:157-159`).
- **#363** holds. Computed with `theme-contrast.ts`: `--nulo-outline` is 1.58 / 2.12 on `--app-bg` (light / dark), 1.72 / 1.98 on `--nulo-surface`; `--nulo-secondary` is 5.30 / 6.40 on `--app-bg`, 5.77 / 5.97 on `--nulo-surface`, 5.02 / 5.52 on `--nulo-surface-low` (a row's hover) and 4.58 / 4.61 on `--nulo-surface-high` (a row's press). Line numbers have moved (`SectionLabel.vue:38`, not 43). Surface corrections: `.breakdown_divider` shows on the single-token page (`tokens/[id]`), not Home; `SectionLabel .count` shows beside every counted section label (Holdings, nine Settings lists, the tx page's Calls, the import-contacts popup); `TransactionIncomingCard.vue:93` `.hash` is a received row's hash on Home and History and is outline too (the shot branch missed it).
- **#192 / #230** are already closed (#454 closed both); the singular decision was recorded on them. The plural pronoun is hard-coded in `RestoreOutcomeBanner.vue:95` and `full.vue:637`, and pinned in `RestoreOutcomeBanner.test.ts:111`, `full-passkey.pins.test.ts:368`, and three e2e files (`restore-outcome.test.ts:99`, `backup-imported-account.test.ts:174`, `network/restore-again.test.ts:44`).

## Outline-coloured text (git grep `color:\s*var\(--nulo-outline\)`, 50 hits)

In the lane: `SectionLabel.vue:38` `.count`; `activity-card.module.css:6` `.title_sep` (composed by every activity card); `TransactionCard.vue:196` `.hash`; `TransactionIncomingCard.vue:93` `.hash`; `BalanceView.vue:507` `.fiat_partial`, `:535` `.breakdown_divider`; `TokenList.vue:191` `.fold_action`; `TransactionCardLayout.vue:249` `.amount_symbol`. The token row's sub-line (`TokenCard.vue:175-194`) is already secondary.

Named by the issue but outside the lane's list: `detail-page.module.css` `.empty_sub`, `.meta_sep`, `.detail_value_aux` (and its local copies in `tx/[id].vue`, `received/[id].vue`, `TxFeeRow.vue`, `TxDebugPanel.vue`), `TxFeeRow.vue` `.fee_grid_aux`, `DetailsTable.vue` `.head`, `.fn_label`, `ListStatusMessage.vue:48` `.no_results`, `list-empty.module.css:21` `.empty_sub`, `IdentityStrip.vue:83,106`. Not named: `RecentActivityView.vue:981` `.stalled_line`, `PrestoStatusCard.vue:211`, three `::placeholder` rules, `LoadingState.vue:40`, `DappSessionVerification.vue:46`, `record-card.module.css:58`, `received/[id].vue:500`, `register.vue:128`, `connected-apps/index.vue:243`, `glossary.vue:77`, two developer notes rules. Decoration (borders, glyphs, the `DetailsTable` dash) keeps the token.

## Collisions and open work

- `gh issue list --state closed --label known-limit --search snack`: #447 (a released import's late stop snack replaces the next import's line). With #449 the line now comes back when that snack closes; #447's reopening condition is unchanged.
- Four test files mock `@/composables/toast` without a `toast` ref (`useContactImportExport.{test,pins.test,spaced-name.test,composition.test}.ts`).
- `toast-call-sites.test.ts` and `copy-dash-ban.test.ts` scan sources; the new copy and calls pass both (an explicit `kind`, no dash).
- No open issue collides; #451 (open; its decision confirms shipped copy, no code), #432, #251 and #383 are outside the lane.
