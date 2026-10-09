# Recon: accessibility-1

Base: `origin/dev` at `c42033e`. Two read-only explorers (a batched reuse sweep over seven capabilities; the e2e hooks that open each screen), then a direct read of every file the plan changes. Every ratio below was computed with the repo's own helper, `contrast()` in `packages/design/src/theme-contrast.ts`, from the token values in `packages/design/src/base.css`. Paths are repo-relative.

## Reuse map

| Capability needed | Existing code | Verdict |
|---|---|---|
| Keyboard activation for a text control | A native `<button type="button">`: Enter and Space press it with no handler. Hand-rolled `role="button" tabindex="0"` with `@keydown.enter.prevent` + `@keydown.space.prevent` exists in `SelectTokenCard.vue:85-100`, `design/ui/Toggle.vue:26-35`, `LegalConsent.vue:59-72` | reuse the native element; the hand-rolled form only where a `<button>` cannot sit |
| Refusing a held or composing Enter | `isRepeatOrComposing`, `refuseRepeatEnter` in `apps/extension/src/composables/usePopupEntity.ts:5-17` (12 consumers) | reuse-as-is; never a second guard |
| A text link to another route | `RowTarget.vue:27-41` (a `RouterLink` `<a>` or a `<button>`, stretched over a row); `DottedTerm.vue:34-50` `action` (a `<button>` styled as a dotted link, coupled to the glossary); five local `.link` classes (`LegalConsent`, `TokenCard`, `FeeSettingsCard`, `ReceivePopup`, `register.vue`). No `TextLink` primitive: searched `TextLink`, `LinkButton`, `class="link"`, `.link {` over `apps/extension/src` and `packages/design/src` | adapt: a plain `RouterLink` with the page's own class; no new primitive for two sites |
| A focus ring | 51 hand-written `:focus-visible` rules in 36 files, 18 of them `outline: 2px solid var(--nulo-accent)` with offset `2px` (`design/ui/Button.vue:172-174`, `send/PublishStrip.vue:62-64`) or `-2px` inside a row or box (`design/ui/RowAction.vue:46-48`, `activity/TransactionCardLayout.vue:147-153`). No ring token, mixin or utility class: searched `focus-ring`, `--nulo-focus`, `:focus-visible` over `packages/design/src` and `apps/extension/src` | reuse the idiom per site (see the plan's decision ledger, D3) |
| A polite live region | `role="status" aria-live="polite" aria-atomic="true"` on the activity cards' subtitles (`TransactionTerminalCard.vue:56`, `TransactionAwaitingCard.vue:83`) and on `settings/security/export/full.vue:509-524`; `role="alert"` for errors. No announcer composable: searched `announce`, `aria-live`, `role="status"`, `role="alert"` | reuse the attribute idiom |
| Hiding a visual duplicate from assistive tech | `aria-hidden="true"` on decorative glyphs and rulers (`AmountCard.vue:411`, `RecentActivityView.vue:770`, `ConnectStepBar.vue:8`) | reuse-as-is |
| Visually hidden text | `.visually_hidden` composed from `popup/components/modules/send/fee-shared.module.css` (4 consumers); no global `sr-only` | reuse by `composes` if a phase needs it |
| WCAG contrast from tokens | `themeMap`, `resolveColor`, `flatten`, `contrast(fg, bg, theme)` in `packages/design/src/theme-contrast.ts`; pair tables in `theme-contrast.test.ts` (text 4.5:1 only; no 3:1 non-text pairs; no `--nulo-outline`, `--nulo-border` or status-colour pairs) | reuse-as-is; extend the pair tables |
| Adding a design token | `token-contract.ts` names, `base.css` values per theme, `bun run gen:tokens` regenerates `tokens.ts`; `tokens.drift.test.ts`, `tokens.parity.test.ts`, `theme-contrast.test.ts` "dark palette, unthemed vs explicit" guard it | reuse the procedure |
| Asserting a CSS rule in a unit test | `TransactionTerminalCard.test.ts` reads the `.vue` source with `readFileSync` to assert a rule exists | reuse the precedent where jsdom cannot compute a style |
| E2E: where focus is | `activeTestId`, `waitForFocus`, `tabAround` in `apps/extension/tests/e2e/helpers/pointer-probes.ts:24-64`; a ring's computed style read in `tests/e2e/rows.test.ts:264,423` | reuse-as-is |
| E2E: theme | `setTheme(page, mode)` (`tests/e2e/fixtures/helpers.ts:1502`), after `navigateToSettings(page, "appearance")`; `shotSend` flips `<html theme>` itself | reuse-as-is |
| E2E: two-theme screenshots | `shotSend(page, name, focus)` (`tests/e2e/fixtures/send-page.ts:221-247`), gated on `NULO_E2E_SHOT_DIR`; it scrolls but never moves focus, so a focused control stays focused across both shots | reuse-as-is on any popup page |

## Issue claims, checked against the tree

Every entry is a `follow-ups.md` entry, quoted by its lead-in. None is a GitHub issue.

| Entry | Verdict | Detail |
|---|---|---|
| The unit switch, Max and Refresh quote are mouse-only | holds | `<span @click.stop>` at `AmountCard.vue:413-423` (unit switch, only when `canUseFiatInput`: a live quote and known decimals) and `:443` (Max, always drawn); `<span @click>` at `send.vue:746` (Refresh quote, only when `fiatNeedsRequote`). The entry's `send.vue:718` is stale. |
| A press on Max while the destination holds the focus is lost | holds in code, not reproduced here | On blur, `handleSearchBlur` (`RecipientField.vue:46-55`) selects the candidate whose address equals the typed text; `RecipientCard` (`RecipientField.vue:93`) replaces `AddressInput` (`:101`). The card is 14 px padding + a 36 px avatar + a 1 px rule, about 22 px taller than the field. `send-amount-exact.test.ts:127-134` (network) already works around it ("Leaving the destination turns it into the account's card, which moves Max"). The same move takes every control below the destination, not only Max. |
| Send's token card has no focus style of its own | holds | `role="button"` and `:tabindex` at `SelectTokenCard.vue:93-94`; no `:focus-visible` rule in its `<style>`. A `role="button"` `div` is not covered by `button { outline: none; }`, so the browser's own ring shows. |
| The sponsor notice is not announced | holds | `fee-sponsor-short` at `FeeSettingsCard.vue:925-930` (the entry's `:897-902` is stale), mounted by `v-if`, no live region. The same card's `fee-init-degraded` notice (`:910-915`) has none either (out of scope). |
| Home's two view links are mouse-only | holds | `RecentActivityView.vue:765` (entry: `:796`, stale) and `TokensView.vue:376-381` (entry: `:405-410`, stale). "View all" renders only when `overflowCount > 0`, that is, past Home's 3-row cap. |
| The two view links fail contrast | holds | `--nulo-outline` on `--app-bg`: 2.12:1 dark, 1.58:1 light. `--nulo-secondary`: 6.40:1 dark, 5.30:1 light. |
| Two keyboard focus rings do not show | holds | Back: `SubPageHeaderBase.vue:36-45` under `button { outline: none; }` at `base.css:249-254` (entry: `:270-275`, stale). Onboarding: `create.vue:231-234` draws `2px solid var(--nulo-accent)` at offset `-2px`, inside the active tab's accent fill (`:236-239`); the tablist is roving (`AuthMethodTabs.vue`), so the focused tab is always the filled one and the ring never shows. The popup's own tablist (`NewProfileMethodTabs.vue:87-90`, dotted ring at offset `2px`, no fill) is not affected. |
| Screen readers hear History's and Settings' title twice | holds, wider than stated | `page-title-bar` (`activity.vue:177-179`, `settings/index.vue:66-68`) is hidden by `opacity: 0` only (`tab-hero.module.css:2-19`); no `aria-hidden`, `inert` or `visibility`. It duplicates the `<h1 data-testid="page-hero-title">` while hidden AND while shown. `CollapsingHeroLayout.vue:95-97` has the same opacity-only label (out of scope; its label may differ from the hero's text). |
| The swap to the emoji check is likely not announced | holds in code | `verify/index.test.ts:141-150` pins "nothing is focused after mount and no key listener". The background moves the connect window with `chrome.tabs.update(tab.id, { url })` (`core/adapters/chrome-browser-api.ts:203-207`) from `#/windows/discover` to `#/windows/verify?…`, the same document path. Whether that is a same-document fragment navigation (the app stays mounted) or a reload is unverified; the plan's design works for both. |
| The connect step bar's empty half barely shows | holds | `--nulo-border` on `--app-bg`: 1.22:1 dark, 1.36:1 light (`ConnectStepBar.vue:24-27`). |
| The status colours' contrast in the light theme | holds | On `--app-bg` (the card is transparent; `TransactionCardLayout.vue`): `--yellow` 1.56:1, `--green` 2.66:1, `--red` 3.56:1, `--nulo-secondary` 5.30:1. On the hovered or focused row (`--nulo-surface-low`): 1.48, 2.52, 3.37. The three colours are the same value in both themes (`base.css`). Dark is fine except red on a hovered row, 4.43:1. |

## Token facts

| Token | Dark | Light |
|---|---|---|
| `--app-bg` | `#0a0908` | `#f5f5f7` |
| `--nulo-surface` / `--card-bg` | `#141312` | `#ffffff` |
| `--nulo-surface-low` | `#1d1b1a` | `#f0efec` |
| `--nulo-surface-high` | `#2b2a28` | `#e7e5e1` |
| `--nulo-accent` | `#f8f1e7` (17.74:1 on app-bg) | `#a8480c` (5.36:1) |
| `--nulo-secondary` | `#999187` (6.40:1) | `#6b655c` (5.30:1) |
| `--nulo-outline` | `#4a463f` (2.12:1) | `#c9c5bd` (1.58:1) |
| `--nulo-border` | `#231f1c` (1.22:1) | `#d8d4cc` (1.36:1) |
| `--yellow`, `--green`, `--red` | `#e6c525`, `#14ae5c`, `#f03c3c` | the same values |

An accent ring passes 3:1 against every surface in both themes (lowest: 4.64:1 on light `--nulo-surface-high`) and is 1.00:1 against an accent fill, which is the onboarding tab's whole problem. `--app-bg` on `--nulo-accent` is 17.74:1 dark and 5.36:1 light.

For the step bar, every existing token that clears 3:1 on the light `--app-bg` (`--nulo-secondary`, `--txt-secondary`, `--txt-tertiary`, `--txt-support`) sits within 1.11:1 of the light accent fill, so the empty and filled halves would differ by hue alone; `--gray` reaches 2.99:1. Searched every colour token in `token-contract.ts`. Hence a new token in the plan.

## E2E hooks per screen

| Screen | Spec and fixture today | Notes |
|---|---|---|
| Send, smoke | `send-fee-privacy.test.ts:36-41` (`registeredExtensionPerTest`, `clickByTestId(page, "actions-send")`) | The smoke profile is on testnet. `seedTokenRow` (`tests/e2e/helpers/activity-seeds.ts:81`) and `seedUsdQuoteAndReload` (`fixtures/helpers.ts:1046`) give a priced token row, but the row carries no transfer functions, so whether Send then renders the unit switch is unverified (plan I5; `network/fiat-send.test.ts` is the fallback). With no balance the amount field is disabled and Max does nothing. |
| Send, funded | `network/send-amount-exact.test.ts:95-135` (`tokenReadyExtension`, `openSend`, `setActiveSendType`) | The only spec where Max acts; it holds the press-loss workaround. |
| Send, fiat and requote | `network/fiat-send.test.ts:68-114` reaches the unit switch | No spec reaches `send-fiat-requote`; `send-fiat-gate.test.ts` covers the gate in unit tests. |
| Send, sponsor notice | `network/fee-sponsor-funding.test.ts:53,119-172` | Polls for `fee-sponsor-short`. |
| Home, View history | smoke `rows.test.ts:585-607` seeds three transactions and a receipt | `activity-view-all` sits in `activity-feed-root`. |
| Home, View all | network `home-cap.test.ts:52` (`extraTokensFixture`) | Smoke can likely seed the four testnet default tokens as rows (unverified). |
| Sub-page back | smoke `tooltips-glossary.test.ts:109-124` (`navigateToSettings(page, "glossary")`, `subpage-back`) | |
| History and Settings title bar | smoke `navigation.test.ts:112-192` | Measures geometry and opacity only. |
| Onboarding create | smoke `onboarding-tab.test.ts:60,78`, `legal-acceptance.test.ts:53-71` (`freshExtensionPerTest`, `openOnboarding`, `onboarding-welcome-create`) | Tabs `onboarding-method-password`, `onboarding-method-passkey`. |
| Connect window | network `connect-one-window.test.ts`; `approveConnect` in `fixtures/popups.ts` reaches `verify-emoji-grid` | Step bar `connect-step-bar` (`data-step`). Open PR #58 adds `network/connect-verify-mismatch.test.ts`. |
| Terminal card colours | no e2e renders `tx-terminal-subtitle`; `network/failed-send-check.test.ts` (proverless) produces a failed row | `TransactionTerminalCard.stories.ts` has gray, amber and red stories; Storybook's toolbar sets the real `theme` attribute (`.storybook/preview.ts:83-105`). |

Firefox (`tests/e2e/FIREFOX.md`): Tab works over BiDi; `keyboard.press("Space")` throws, so press `" "`; `emulateMediaFeatures` throws, so set the theme through Settings; key presses after another window opens need `prepareKeys`.

## Collisions with work in flight

| Open work | Files it shares with this lane | Consequence |
|---|---|---|
| PR #56, settings by task (owner; base `dev`) | `apps/extension/src/popup/pages/settings/index.vue` (adds `index.test.ts`; renames the Appearance page to `display`), `tests/e2e/navigation.test.ts`, `tests/e2e/rows.test.ts`, `tests/e2e/network/popup-escape-layered.test.ts`, `tests/e2e/fixtures/helpers.ts`, `tests/e2e/FIREFOX.md`, `CLAUDE.md`, `.claude/skills/e2e-testing/SKILL.md`, `implementations-plan/follow-ups.md`, `lessons.md` | Phase 3.1 builds on it after it merges; Home's link spec is a new file because #56 rewrites `rows.test.ts`; `popup-escape-layered.test.ts` is only run, never edited; the close-out's CLAUDE.md edit reconciles with #56's |
| PR #58, the emoji check's refusal (base: PR #55's branch, not `dev`) | `apps/extension/src/popup/windows/verify/index.vue`, `index.test.ts`, `index.window.test.ts`, `tests/e2e/fixtures/popups.ts` | Phase 3.2 builds on it once #55 and #58 are on `dev`; it renames the label to "Connection check" and the toggle to "Skip this check next time" |
| PR #55, backup download | `implementations-plan/index.md` | line-level only; #58 lands through it |
| hardening-2 arcs (branches, no PR yet) | `tests/e2e/fixtures/extension.ts`, `tests/e2e/README.md`, `.claude/skills/e2e-testing/SKILL.md`, `src/utils/journal-state.ts`, `popup/index.ts` | none of this lane's source files; reconcile the shared docs at close-out |

## Observed, out of scope

- `FeeSettingsCard.vue:871` ("Override with my method") and `:903` ("Use app's payment") are `Flex @click` controls with no keyboard path.
- `fee-init-degraded` (`FeeSettingsCard.vue:910-915`) has no live region.
- `CollapsingHeroLayout.vue:95-97`'s compact label stays in the accessibility tree.
- `design/ui/Checkbox.vue` answers Enter only, with no role; `ScopeAddress.vue` and `ScopeClassId.vue` answer Enter only.
- The terminal card's status icons use the same failing colours as graphics (the light amber icon is 1.56:1, under 3:1).
- Dark red text on a hovered row is 4.43:1.
- The destination's suggestion rows (`RecipientField.vue:111-118`) are `Flex @click` `div`s: the keyboard picks only the first, by Enter.

## Found in review (now in scope)

- The fee method picker cannot be opened by keyboard: `DropdownRoot.vue:268` renders the trigger as a `div @click` with no `tabindex`, and `FeeMethodSelector.vue:46-56` puts a `Flex` in it (Home's "⋯" works because its trigger slot holds a `Button`). Page 1, call 6.
- `RecipientField.vue:64-69` answers any Enter on the document while `showSuggestions` holds (the field focused, or within 250 ms of its blur): it writes the first suggestion's address and blurs the focused element. Page 1, call 5.
- While the destination holds the focus and a candidate matches, the suggestion list (`position: absolute; top: 100%; z-index: 999`, up to 160 px) sits over what lies below, the token card first. Plan I6.
