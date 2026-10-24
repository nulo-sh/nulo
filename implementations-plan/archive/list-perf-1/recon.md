# list-perf-1 recon

Read at `5711a1bc3` (`origin/dev`), plus #1027's diff (`worktree-ui-cosmetics-1`, draft). Two Explore agents (sonnet) and direct reads; every line below was checked against the tree.

## `Icon` and its CSS `v-bind` (#1036)

- `packages/design/src/core/Icon.vue:28,55`: `hoverColorVar` and `color: v-bind(hoverColorVar)` under `.hovered:hover`. It is the tree's only CSS `v-bind` (grep over `apps/` and `packages/`).
- `@vue/runtime-dom` 3.5.42 `dist/runtime-dom.esm-bundler.js:437-468`, `useCssVars`: per instance, `setVars` on mount (a post-flush watcher) and before each update, and `setVars` runs `document.querySelectorAll('[data-v-owner="<uid>"]')`. Each instance also puts a `MutationObserver` (childList) on its root's parent that runs `setVars` again. The SFC compiler injects it into every instance, whether `hoverColor` is set or not.
- One caller sets `hoverColor`: `apps/extension/src/popup/components/popups/EditFpcPopup.vue:236-244` (`"primary"`, the FPC copy icon). Its own `.icon_btn:hover` already sets `color: var(--txt-primary)` (`:298-304`). Home, Holdings, the contacts page, activity and `Navigation.vue` pass none.
- Inline custom properties through `:style` are the house pattern: `BalanceView.vue:277` and `AmountCard.vue:447` (`--hero-scale`), `OnboardingPage.vue:21`. `--icon-hover` is used nowhere; the theme-var guard reads only owned prefixes (`packages/design/src/theme-vars.ts:15-49`), so it ignores the name.
- `packages/design/src/core/Icon.test.ts:45-48` reads the root's `style` (rotate). The design package's vitest stubs CSS (`packages/design/vitest.config.ts:10`), so no unit test evaluates the hover rule.
- `@nulo/design` ships source; the extension's Vite compiles `Icon.vue` itself (`packages/design/package.json:6-16`, `apps/extension/vite.config.ts:98`).
- The type-roles sweep (`apps/extension/tests/e2e/fixtures/type-roles.ts`) reads text elements only, never icons or colour; it cannot see this change, so the pixel compare is the visual proof.
- Source scans: `apps/extension/scripts/type-roles/source-scan.ts:15` (`SCAN_ROOTS` = `apps/extension/src`, `packages/design/src`; `sourceFiles`, skip lists), used by `red-text-ban.test.ts:20-24`. `@vue/compiler-sfc`'s descriptor carries `cssVars: string[]`, the compiler's own list of a block's CSS `v-bind`s.
- #1027 edits `Icon.vue`'s script (a `strokes` computed) and template (one stroke path), and `Icon.test.ts`. Its hunks do not touch `hoverColorVar`, `styles`' body or the `<style>` block.

## The recipient suggestions (#1037)

- `apps/extension/src/popup/components/modules/send/RecipientField.vue:259-278`: `v-for` over every match, no `key`, no cap. A row is a `Flex` with an `AccountAvatar` and a column of two `Text`s: 6 elements, 7 component instances. The listbox (`:247-258`) is a column `Flex`, `max-height: 160px; overflow-y: auto` (`:307-321`), and the scroller itself. Row box: padding 10 px top and bottom, content max(28 px avatar, 16 + 4 + 14 px text) = 54 px (inferred from the CSS; both line heights are `!important`, both texts `nowrap`).
- `AccountAvatar.vue` computes initials and sizes only (no hashing, canvas or image); `Flex` and `Text` render one element each.
- `matchRecipients` (`send/recipient-search.ts:12-18`) is a `filter`: input order, same object identities. Candidates are `[...contacts, ...appStore.accounts]` (`pages/send.vue:225`), rebuilt only when a list changes.
- Keyboard: `moveHighlight` (`RecipientField.vue:153-160`) wraps over the full list and calls `document.getElementById(optionId(next))?.scrollIntoView({ block: "nearest" })` at once, before any render. `aria-activedescendant` names `optionId(full index)`.
- Unit tests (`RecipientField.test.ts`): up to 4 candidates; the `scrollIntoView` mock requires `{ block: "nearest" }` and the scrolled node to be `options[index]` (`:253-285`); `clickSuggestion` clicks `avatar.parentElement` (`:390`).
- E2E `apps/extension/tests/e2e/send-keyboard.test.ts:71-111,117-168`: 3 seeded contacts plus "Account 1" = 4 rows; it counts the listbox's direct children, reads the active row by child index, and expects the list to scroll. `seedContacts` (`:25-42`) writes rows straight to storage. `type-roles.test.ts:979-993` clicks `recipient-suggestion-address` on a one-row list.
- No windowing code or dependency exists in the tree; no `@vueuse/core`.
- Scrollbars are hidden everywhere (`packages/design/src/base.css:218-221`); the page scroller above the listbox is `send.vue`'s `.wrapper` (`:920`).

## Measurement tooling (scratch, from pxe-limits-1)

- `_probe-ceilings.test.ts` and `instruments-final.patch` sit in pxe-limits-1's scratch patch set, written for `e34f361ba`; `run-tree.sh` runs one probe from a `git archive` export through `bun run e2e:agent` (agent.sh claims the ports). The issue's method: a page open is the hash change until every row is in the DOM plus two frames; the recipient cell is one keystroke until the rows reach `n` and the page is quiet (`:449-464`).
- Under windowing the rows never reach `n`, so the recipient cell's end condition changes for both arms.

## Closed known limits searched

`gh issue list --state closed --label known-limit --search "list OR icon OR virtual OR recipient OR suggestion"`: none in this area.
