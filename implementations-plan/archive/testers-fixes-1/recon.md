# Recon: testers-fixes-1

One Sonnet Explore agent at `d461b059` (origin/dev), batched over six capabilities, plus a parent pass that verified every line `plan.md` cites and listed every non-control click target with a Vue template parse (the script stayed in the lane's scratch directory). Paths are under `apps/extension/src/` unless they start with a package or `tests/`.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| Unselectable controls | `packages/design/src/ui/Button.vue:161`, `composite/general/AccountAvatar.vue:36`, `composite/send/AmountCard.vue:596`, `composite/activity/activity-card.module.css:7`, `popup/components/popups/ReceivePopup.vue:100` each set `user-select: none` on their own class | reuse the pattern: a control without a role sets it on the class it already has |
| Opt-in selection | `.selectable` (`packages/design/src/base.css:386`), `Text`'s `selectable` prop (`packages/design/src/core/Text.vue:28,52`) | keep as is (redundant outside a control) |
| Landing body selection | `apps/landing/src/styles/overrides.css:18-19` sets `body { user-select: text }` after `base.css` | untouched: the landing has no `<button>` and no ARIA widget role (grep of `apps/landing`); its one `<nav>` keeps its selection because the nav rule lives in `Navigation.vue` |
| Router scroll handling | none: no `scrollBehavior`, `scrollRestoration`, `KeepAlive` or saved position anywhere (grep `createRouter\(\|scrollBehavior\|scrollRestoration\|KeepAlive\|keep-alive`) | build new (plan D2) |
| An extracted, unit-tested router hook | `popup/route-guard.ts`, `popup/start-grace.ts`, `utils/own-window.ts` (`followOwnRoute`), each mounted in `popup/index.ts` | reuse the shape: one popup-local module + test, wired in `index.ts` |
| Recording toasts from before an action | `tests/e2e/helpers/contacts.ts:160-190` (`toastAfter`, a `MutationObserver` log) | reuse where a success-toast wait starts after a gap (plan phase 1) |
| Smoke Settings scroll helpers | `tests/e2e/navigation.test.ts:205-260` (`scrollAndSettle`, `clickBelowBar` on `[data-testid="settings-page"]`) | reuse for the #582 assertion |

## Issue claims against the tree

- **#580** holds: `base.css:276-284` sets `user-select: none` on `body`, no other rule but `.selectable` opts back in. Secrets are not widened: the one reveal (`SecretRevealCard.vue`, used by `settings/security/export/seed.vue`) shows the phrase in a native `<input>` (`packages/design/src/ui/Input.vue:339`), which is selectable today whatever `body` says.
- **#581** holds: `onboarding/pages/done.vue:88-91`. No test pins the string or `onboarding-pin-tip` (grep `Chrome toolbar|puzzle|pin Nulo|onboarding-pin-tip`).
- **#582, popup** partly holds. The window never scrolls: `popup/app.vue:583-594` clips the root (`overflow: clip`), and each page owns its scroller (`general.vue:72`, `holdings.vue:224`, `activity.vue:258`, `settings/index.vue:287`, `send.vue:867`, `auth.vue:375`, `tokens/[id].vue:304`, `detail-page.module.css:56`, `components/composite/settings-page.module.css:3`, `CollapsingHeroLayout.vue:135`, `windows/window-shell.module.css:15`). A route change remounts the page (`<component :is>` with no `KeepAlive`), so a forward navigation starts at 0 and the issue's "offset carries into sub-pages" does not follow from the code. Back always lands at 0: nothing saves the leaving scroller's offset. A router `scrollBehavior` alone scrolls the window and is a no-op here. Back is a real pop: `components/ui/SubPageHeader.vue:39-45` calls `router.back()`.
- **#582, onboarding** holds: the document scrolls (`onboarding/app.vue:124-132`, `onboarding/onboarding.scss`), so a hash push keeps the offset into the next step.
- **#584** holds: `packages/design/src/composables/toast.ts:5`. Two success toasts carry a "View" action (`composables/useArrivals.ts:362-367`, `popup/pages/send-submit.ts:87`).
- **#586** holds, and more: on Home `BalanceView` gets no `tokenBalance` (`popup/pages/general.vue:56`), so `totalTokenBalance` is `{ value: 0 }` (`BalanceView.vue:73-74`) and the tap copies `0` whatever the hero shows. The same component is the token page's hero (`popup/pages/tokens/[id].vue:286`), where the tap first expands a balance cut at 20 characters (`showFullBalance`, `:167-176`), then copies it. No test clicks `balance-amount` (grep `click|copy|clipboard` in `BalanceView.test.ts`; e2e only read it). The brief's "Holdings rows keep their copy" has nothing to keep: no Holdings row copies (grep `copy` in `holdings.vue`, `TokenCard.vue`, `TokensView.vue`).

## Click targets with no control semantics

Template elements with `@click`/`@mousedown` that are not `button`, `a`, `input`, `label`, a control component or an element with a `role` (71 sites). Phase 5 classifies each by the rule in `plan.md` D1. Controls: `ActionButtonsView.vue:42,46`, `composite/send/SendTypesCard.vue:32,50`, `ui/Dropdown/DropdownItem.vue` (no role), `ui/Dropdown/DropdownRoot.vue:268,277`, `JsonViewer/LogsToolbar.vue:45,77,91`, `windows/capabilities/AccountSelectRow.vue:50,91`, `popups/ImportContactsPopup.vue:209`, `settings/developer/index.vue:172`, `settings/contacts/ContactRow.vue:35` (a chip), `Popup/Popup.vue:117`, `TxDebugPanel.vue:42`. Text that copies on a click (stays selectable): `AddressDisplay.vue:93,105`, `TxHashRow.vue:32`, `tx/[id].vue:188,336,344,363`, `received/[id].vue:350,407`, `TokenMetadataPopup.vue:95`, `ReceivePopup.vue:64`, `settings/about.vue:64,67`. Badges (`packages/design/src/ui/Badge.vue`) and the arrival chip (`BalanceView.vue:316-322`) are chips. The bottom nav is `popup/components/Navigation.vue:36-47` (`<nav>` of `RouterLink`s). `.material-symbols-outlined` (`base.css:46`) draws icons as ligature text (`packages/design/src/core/MaterialIcon.vue:31`), so a drag over a row copies the icon's name; SVG `Icon`s carry no text.

## Tests that pin what changes

- `packages/design/src/base.css.test.ts:25` pins the sha256 of `base.css`; its comment lists the deliberate choices.
- `packages/design/src/composables/toast.test.ts:12-70`, `packages/design/src/ui/ToastManagerBase.test.ts:419,485,502`, `packages/design/src/ui/ToastManagerBase.stories.ts:43`; e2e `tests/e2e/snackbar.test.ts:1,304-330,369`, `tests/e2e/fixtures/helpers.ts:1460`, `tests/e2e/network/holdings.test.ts:127`, `tests/e2e/helpers/contacts.ts:162`. 51 `waitForToast(` calls in 25 files.
- No test reads computed `user-select` or a drag selection (grep `user-select|getSelection|selectNode|clickCount`).

## Collisions and closed limits

- No closed `known-limit` issue covers selection, scroll, toasts or the toolbar copy (`gh issue list --state closed --label known-limit --search "select OR scroll OR toast OR copy OR toolbar"`).
- PR #599 (home-onboarding-2) edits `SubPageHeader.vue`, `SettingsPageShell.vue` and `SubPageHeaderBase.vue`; this plan edits none of them. small-ui-fixes-1 and harden-quality-fixes-1 edit `Header.vue`; this plan reads it only (its chips are `<button>`s). send-fees-ux edits the FPC popups and `journal-state.ts`; this plan's one Send-side edit is a style line in `SendTypesCard.vue`.
