# css-recipes-home-1: recon

Read at `e4f9011f8` (origin/dev). Paths are under `apps/extension/src/` unless they say otherwise. One Explore agent (sonnet) mapped the `composes` edges, the tests and guards that read these sheets, and the e2e coverage; the lead read every site and ran a scratch declaration-set scan (each class's rules flattened, nested and `@media` rules included, the class written as `&`, declarations sorted) over every `.vue` and `.css` under `src/`.

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| A shared lower-layer CSS module | `components/refreshing-dot.module.css`, composed by `TokensView.vue:447` and `holdings/TokenList.vue:202` through `@/components/…` | reuse the pattern: new sheets sit directly under `components/` or `components/composite/` |
| Accent text action | `modules/send/fee-shared.module.css:45` `.retry`, composed by `FeeCostReadout.vue:162`, `SendReviewSheet.vue:440`, `windows/execute/SendTxSummary.vue:461` | adapt: move to `components/text-action.module.css` |
| Muted action, accent on hover | none shared; two identical copies, both in `modules/general/` | build new, inside `modules/general/` (one feature) |
| Visually hidden | `fee-shared.module.css:25`, `composite/activity/activity-card.module.css:30` | adapt: one home, `components/a11y.module.css` |
| Form section | global `export_section*` in `composite/CollapsingHeroLayout.vue:254-275`; module copies in `composite/import/import-shared.module.css` | adapt: a module beside the globals (arc 2) |
| Filled auth-tab skin | none; two identical copies around `composite/AuthMethodTabs.vue` | build new, beside it (arc 2) |
| A scan of CSS `composes` edges | `utils/page-sheet-compose-ban.test.ts` (pages only, no baseline) | adapt: generalise to feature folders, add a reviewed baseline |
| A declaration-similarity detector | none (`git grep -n "jscpd"`: only `audit:dup`) | not built: the brief forbids it |

## The `composes` edges that cross a feature folder

Search: `git grep -n 'composes:.*from ' -- apps/extension/src packages | grep -v 'from global'`, each `from` resolved (relative, `@/`, `~/`, `src/`). A feature folder is `popup/pages/` (whole), `popup/windows/<x>/`, `popup/windows/` for its own files, `popup/components/modules/<x>/`, `popup/components/popups/`, `components/composite/<x>/` or `onboarding/`. Pairs (composer → sheet):

1. `popup/components/modules/activity/TransactionCard.vue` → `components/composite/activity/activity-card.module.css` (`title_sep`, `visually_hidden`, `app_chip`)
2. `popup/components/modules/settings/authwits/AuthwitCard.vue` → the same sheet (`chip`)
3. `popup/windows/execute/OperationCard.vue` → `popup/components/modules/send/fee-shared.module.css` (`fee_label`)
4. `popup/windows/execute/SendTxSummary.vue` → the same (`retry`)
5. `popup/windows/verify/index.vue` → the same (`visually_hidden`)
6. `popup/pages/settings/developer/account-state/notes/index.vue` → `popup/components/modules/settings/record-card.module.css` (7 classes)
7. `popup/components/popups/IncomingTrustPopup.vue` → `popup/components/modules/tx/detail-shared.module.css` (`hero_link`)
8. `popup/pages/{tx,received,journal}/[id].vue` → the same (48 classes; pinned by `popup/pages/detail-page.styles.test.ts`)

Under the plan's D4 policy, `src/components/**` is a shared home, so edges 1-2 are allowed and edges 3, 6, 7, 8 are the reviewed list (4 and 5 go in arc 1). No other cross-folder edge. `import-shared`, `token-row`, `tx-shared` and the `popup/pages/*.module.css` sheets are composed only inside their folder; `popup/windows/window-shell.module.css` only from windows. Shared homes composed from anywhere: `components/Popup/popup-shared`, `components/ui/Settings/settings-row`, `components/composite/{list-empty,settings-page,shake}`, `components/refreshing-dot`. `composite/send/publish-mark.module.css` is imported as a script module (`PublishLine.vue:8`, `FeeSettingsCard.vue:7`, `SendReviewSheet.vue:20`), which Biome's import rules see; a `composes` scan does not.

## Tests and guards that read these sheets

- `modules/send/FeeCostReadout.test.ts:33` selects `[class*="visually_hidden"]`: the composer's local class keeps that name.
- `components/composite/{FilePasswordSection,NewPasswordPair}.test.ts`, `popup/pages/settings/security/export/full.test.ts:295` select `.export_section_label` (the global).
- `tests/helpers/fee-whole.ts:13-15` reads `fee-shared.module.css`'s `.whole` and each composer's `composes: whole from "./fee-shared.module.css"`: `.whole` is not touched.
- `onboarding/pages/create.test.ts:326-333` reads `create.vue` as text and pins its `.tab:focus-visible` and `.tabActive:focus-visible` rules, in that order.
- `scripts/type-roles/exceptions.ts` `OVERRIDES` keys `.tab.tabActive { font-weight: 700 }` by file for `create.vue` and `UnlockMethodChoice.vue`; `type-role-ban.test.ts` reports a stale entry. Its reviewed list (`utils/type-role-ban.reviewed.json`) is empty; it reads only an element's own `composes: type--… from global` and never follows a cross-file `composes`.
- `tests/e2e/fixtures/type-roles.ts` `judgeReading` refuses an element whose class list holds two role tokens.
- `utils/a11y-css.test.ts` reads `activity-card.module.css` (`.title_sep`, `:143`) and `detail-shared.module.css` by path; `utils/red-text-ban.test.ts` walks every sheet and keys its reviewed list by file and text (no entry names a rule this lane moves).
- No test names `requote_action`, `archive_link`, `view_all`, `import-shared.module.css` or `publish-mark.module.css` (search: `git grep -n -E 'requote_action|archive_link|view_all|import-shared|publish-mark' -- '*.test.ts' apps/extension/tests`).

## Collisions

- PR #1945 edits `popup/pages/send.vue` and `components/composite/send/AmountCard.vue` (script and template) and `modules/activity/TransactionCard.test.ts`; PR #1942 edits `popup/pages/settings/security/reset.vue` and `reset.test.ts`. This lane touches only `<style>` blocks there.
- Storybook (`.storybook/main.ts`) globs `src/components/**` stories and maps `@` and `~`; `composite/activity/Transaction{Awaiting,Terminal}Card.stories.ts` import cards whose styles arc 1 re-points.

## E2E that open the screens

| Screen | Smoke | Network |
|---|---|---|
| Send: form, fee line, fee sheet, review | `send-keyboard`, `send-fee-privacy`, `send-outcome-rows`, `type-roles` | `fee-methods`, `fiat-send`, `snack-placement` (`fee-estimate-retry`), `type-roles-windows` |
| Execute window, fee window | `execute-steps` | `tx-sendTx-default` (fee window), `type-roles-windows` |
| Verify window | none | `connect-check-window` (`verify-announce`) |
| Home activity and tokens, Activity page | `home-links` (`activity-view-all`), `rows`, `navigation` | `home-cap` (`tokens-view-all`) |
| Endpoints list | `endpoints` | `endpoint-order` |
| Import-contacts popup | `contacts-import` | none needed |
| Authwits page | `type-roles` | none |
| Import, change password, reset, new profile, onboarding create (arc 2) | `backup-roundtrip`, `security`, `registration`, `onboarding-tab`, `type-roles` | `restore-again` |

No e2e reaches `send-review-fee-retry`, `execute-op-authwits-preview-retry` or `send-fiat-requote` (search: `grep -rl <testid> apps/extension/tests/e2e`).
