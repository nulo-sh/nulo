# popup-fixes-1 recon

Read at `24c68cb4` (origin/dev). Paths under `apps/extension/` unless rooted. Three Explore agents (Sonnet) plus direct reads.

## Already shipped (#582, #584, #586)

- #642 (`f695dea4`, merged 2026-10-17) shipped all three and ended its body with one line, `Closes #580 #581 #582 #584 #586`. GitHub linked only the first number, so #581, #582, #584 and #586 stayed open. #678 (`e6a3b098`) shipped the follow-ups #634 (a success with an action stays 6 s) and #635 (the token page's hero), both closed.
- #582: the popup window never scrolls; each page owns an `overflow: auto` box (`popup/app.vue:585-595`, `.wrapper { overflow: clip }`). `popup/index.ts:49-56` gives the router a `scrollBehavior` that calls `scrollMemory.arrive(pageScroller(to), { restore: saved !== null, reused })` after the entering page renders; `afterEach` calls `scrollMemory.leave(pageScroller(from))` (`:78-81`). `popup/scroll-memory.ts` keys offsets by history entry. Onboarding's document scrolls: `saved ?? { top: 0 }` (`onboarding/index.ts:37-42`). No `<Transition>` or `<KeepAlive>` around either `RouterView`. Tests: `popup/scroll-memory.test.ts` (back restores, two entries of one path, push writes nothing, reused page resets, replace writes nothing, no scroller clears, never-left restores nothing); `tests/e2e/navigation.test.ts:59-86` (Back from Developer lands within 1 px; Developer opens at 0); `tests/e2e/onboarding-tab.test.ts:98-122`. #637 (closed) records the owner's P30 rule: restore once, after the first render.
- #584: `packages/design/src/composables/toast.ts:4-7`: `SUCCESS_TOAST_MS = 2_000`, `ACTION_TOAST_MS = 6_000`; `openToast` takes one options object and arms `action ? ACTION_TOAST_MS : SUCCESS_TOAST_MS` for a success only (`:63-69`); info and error stay until closed. Pinned by `toast.test.ts:12-30`. No call site passes a duration (`utils/toast-call-sites.test.ts:56-59` refuses one). Two success sites carry an action (`composables/useArrivals.ts:362-367`, `popup/pages/send-submit.ts:89`).
- #586: `handleTokenBalanceClick` exists nowhere; the hero is `<div data-testid="balance-amount">` with no handler, cursor or role (`popup/components/modules/general/BalanceView.vue:262-267`). `BalanceView.test.ts:729-757` clicks the hero on Home and on the token page and asserts no clipboard write and no toast. No other balance copy control exists on either screen (the token page's `handleCopy` is for the token address, `popup/pages/tokens/[id].vue:117-118,251`).
- Stale docs: `CLAUDE.md:441` shows `openToast({ label: "Message", icon: "copy" }, 2_000)`, a signature the call-site guard refuses; `packages/design/README.md:141` names `TOAST_DURATION`, which no longer exists.

## #773, the logs toolbar's more menu

- `components/JsonViewer/LogsToolbar.vue:12-13` imports only `capitalize` and `getDisplayName`; `:123-142` uses `<Dropdown>` (default-slot trigger `Flex` with no testid; `#popup` with two `DropdownItem`s emitting `exportCsv` and `clearLogs`).
- Auto-registration (`vite.config.ts:126-130`, `unplugin-vue-components` over `src/components`) names components by file: `types/components.d.ts:36-40` lists `DropdownDivider`, `DropdownItem`, `DropdownRoot`, `DropdownTitle`, `DropdownTrigger`, no `Dropdown`. `Dropdown` is the barrel alias of `DropdownRoot` (`components/ui/Dropdown/index.js`); every other caller imports it (`TokensView.vue:5`, `FeeMethodSelector.vue:3`, `settings/display.vue:12`, and others).
- `DropdownRoot.vue:267`: root `div[data-dropdown-open]`, trigger `div#trigger @click`, `#popup` teleported to `#dropdown`. E2E helper `openDropdown(page, triggerTestId)` (`tests/e2e/fixtures/widgets.ts:13`).
- Vitest runs `@vitejs/plugin-vue` and auto-import only, not `unplugin-vue-components` (`vitest.config.ts:1-12`): a component test registers what it renders.
- No `LogsToolbar.test.ts`. `LogsViewer.test.ts:71` stubs the toolbar; `:194` emits `clearLogs` from the stub. `LogsViewer.vue:163-190`: export downloads a CSV and toasts; clear calls `logViewerService.clearLogs()`. `tests/e2e/viewers-csp.test.ts:272` `openLogs(ctx)` opens `#/windows/logger`.
- The toolbar's filter buttons and the more trigger are `Flex` divs with `@click`, mouse-only (`LogsToolbar.vue:46-52,124-126`).

## #786, Home's ghost token rows

- `popup/components/modules/general/TokensView.vue:404-416`: two ghost rows (`tokens-skeleton-row`), columns `Flex direction="column" gap="5"` (bars 14/11 left, 13/11 right). `.ghost_row { min-height: 32px; padding: 8px 0 }` (`:490`). Shown when `!isSettled && !hasAnyRow` for 300 ms (`:128-134`); `TokensView.vue` has an untyped `<script setup>`, so vue-tsc never sees `gap="5"`.
- `packages/design/src/token-contract.ts:196`: `flexGaps = [2, 3, 4, 6, 8, …]`. `Flex.vue` emits `gap--${gap}` with no validator (its `align`, `justify`, `wrap`, `direction` props have one); `gap--5` has no rule, so the gap is 0.
- The loaded row (`TokenCard.vue:75-100`): `.row { padding: 8px 0 }`, both columns `gap="2"`, the loading column `align="end" justify="center" gap="2"` with `.loading_block { min-height: 37px }` (`:230-233`, "The loaded column's box: an `amount-row` line, the 2px gap and a `meta` line."). `TokenSeedRow.vue:42,82-83` carries a second copy of the same rule.
- Ghost row by construction: 16 px padding + max(14 + 0 + 11, 13 + 0 + 11) = 41 px. The loaded row: 16 + 37 = 53 px (wallet-bugs-2 measured a working default's row at 53 px).
- No deterministic ghost state in a smoke build: `getTokenBalances` reads the repository after `ensureInitialized` (`wallet/services/token-balance/service.ts:202-214`) and `getSeedStatus` reads stored markers (`wallet/services/token/seeder.ts:245-251,660-673`); both answer once the worker is up. `TokensView.test.ts:595-611` holds the fetch with a deferred promise (shallow mount, `Flex` stubbed).

## #626, Send and Receive

- `popup/components/modules/general/ActionButtonsView.vue:41-51`: two `<Flex @click>` divs (`actions-send` → `router.push("/popup/send")`, `actions-receive` → `popupStore.open("receive")`), no `tabindex`, `role` or key handler; `.button { height: 52px; cursor: pointer; user-select: none; &:active { scale(0.97) } }`, no `:focus-visible`. Rendered inside `BalanceView.vue:348-352`, on Home and on the token page.
- `packages/design/src/base.css:233-235`: `button { font-family: inherit; padding: 0; border: none; outline: none }`; the accent ring is local: `outline: 2px solid var(--nulo-accent); outline-offset: 2px` (`packages/design/src/ui/Button.vue:185`, `TokensView.vue:479,533`). `Flex` takes a `tag` prop (`Flex.vue:11`).
- Home's Tab order today: the header's controls, then the token list (`tokens-menu-trigger`, the token rows), the feed, the nav. The hero is not focusable.
- `Popup.vue:26-29,85-95`: `initialFocus` defaults to `false` (focus stays on the opener) and Escape returns focus to it. `popupStore.open` of an open popup only puts it on top (`stores/popup.store.test.ts:46`).
- `ActionButtonsView.test.ts` stubs `Flex` as a div and clicks both. E2E helpers: `tabTo`, `tabAround`, `focusRing`, `tokenColor` (`tests/e2e/helpers/pointer-probes.ts`), `prepareKeys`, `shotSend` (`NULO_E2E_SHOT_DIR`, both themes). `tests/e2e/home-links.test.ts:56-139` already walks Home's Tab order.

## #770, the recovery phrase button

- `popup/pages/settings/security/export/seed.vue:184`: `Retrieve Recovery Phrase` (`unlock-submit-btn`), the only user-visible "Retrieve" in the repo. The page title is "Recovery Phrase" (`:95-99`). Test titles say "Retrieve" (`seed.test.ts:66,74,97`, `tests/e2e/keyboard-guards.test.ts:2,77,84,91`); none asserts the label's text.

## #593, Firefox passkey unlock

- `wallet/services/passkey/service.ts:55-65`: PATH B. Firefox closes its toolbar panel when the OS passkey prompt takes focus (Mozilla bug 2026687, `tests/e2e/FIREFOX.md:43`), so a step started in the panel runs in the passkey window, which shows `finishing` and closes once the step reports `done` (`popup/windows/passkey/index.vue:90-93`); `armPopupReturn` reopens the toolbar popup (`wallet/utils/toolbar-popup.ts:71-80`).
- No Firefox sidebar: `manifest/manifest.firefox.config.ts:12-16` drops `sidePanel`; #596 (open, enhancement) is the sidebar, "only if e2e can drive it".
- `tests/e2e/passkey-toolbar-panel.test.ts:311-312`, Firefox only: "create and unlock from the dying panel run in the passkey window".

## Collisions (open PRs at recon time)

- #743 (onboarding-3, draft, held for the owner's build test) rewrites `seed.vue` lines 12-167, `seed.test.ts` and `keyboard-guards.test.ts`, and edits `CLAUDE.md:214-220`; it keeps `Retrieve Recovery Phrase` (its line 172). It also edits `BalanceView.vue` and `general.vue`.
- #788 (owner-feedback-1 arc 1) edits `general.vue`, `tokens/[id].vue`, `tests/e2e/navigation.test.ts`, `rows.test.ts`. #793 edits `rows.test.ts`. #795 and #723 touch none of this lane's files.
- No open PR touches `ActionButtonsView.vue`, `TokensView.vue`, `TokenCard.vue`, `TokenSeedRow.vue`, `LogsToolbar.vue`, `toast.ts`, `popup/index.ts`, `home-links.test.ts` or `viewers-csp.test.ts`.
