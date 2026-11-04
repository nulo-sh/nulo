# Recon: scroll-cue-3

Base `origin/dev` at `040334f53`. One Explore reuse sweep (sonnet), then the planner's own reads of the ten pages, the prototype branch (`worktree-scroll-cue-1`, never pushed) and issue #1658.

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| Pixels left below a scroller's visible bottom | `leftToScroll` in `apps/extension/src/composables/snackInset.ts:124`, module-private; inline copies in `LogsViewer.vue:109` | adapt: export it from the new composable, `snackInset.ts` imports it |
| Listener bundle (scroll, resize) with `onScopeDispose` | `useSnackInset` (`snackInset.ts:149-201`, `typeof ResizeObserver` guard for jsdom); `useHeroVisible.ts` (ref in, attach once mounted) | adapt the shape; build `useScrollRemaining` new (`useSnackInset` is bound to footers and toasts) |
| Reduced motion in TS | `isCalm()` private in `BalanceView.vue:129`: the media query or the root `.noanimations` class (the Disable animations setting) | adapt: lift to `src/utils/motion.ts`, BalanceView imports it |
| Reduced motion in CSS | two blocks per rule, `@media (prefers-reduced-motion: reduce)` and `:global(.noanimations)` (`PasskeyScreen.vue:265-274`); pinned by `src/utils/a11y-css.test.ts` | reuse the convention, pin the new rules there |
| Round icon-only button | none: `RowAction` is 24 px and square, `Button` is a text box, `LogsViewer`'s round scroll control is a `Flex` (`LogsViewer.vue:314`). Searched `src/components/ui`, `packages/design/src/ui`, `logs-scroll-btn` | build new L2 `ScrollMoreButton.vue` |
| Down chevron | `chevron` glyph (`packages/design/src/core/glyphs.ts:101`) points right; `Icon` takes `rotate` | reuse (`rotate="90"`) |
| Header-aware scroll geometry | `revealMove` + `reveal` (`collapsing-hero.ts`, `CollapsingHeroLayout.vue:44-70`): bar bottom from `headerRef.$el`, `viewBottom` from the scroller | adapt the measures; new pure `nextScrollTop` beside `revealMove` (its "none when visible" semantics do not fit) |
| Section markers | none (`data-scroll|data-section|scrollIntoView|scrollTo` over `apps/extension/src`, `packages/design/src`) | not needed: see plan D5 |
| Test stubs | `vitest.setup.ts` stubs `scrollIntoView` only; jsdom lacks `ResizeObserver`, `matchMedia`, `Element.scrollTo`; models: `snackInset.test.ts:86-97`, `BalanceView.test.ts:886-907`; `sendEvent` (`tests/helpers/send-event.ts`) | reuse |
| 360 × 600 popup in e2e | `loadPopup` (`tests/e2e/fixtures/wallet-pages.ts:136`); Delete profile driver `confirmProfileReset` (`fixtures/profiles.ts:186`); `clickByTestId` clicks with `element.click()`, so an overlay never intercepts it | reuse |

## The ten pages on `CollapsingHeroLayout`

`reset.vue`, `change-password.vue`, `profile/new.vue`, `import.vue`, `settings/accounts/import.vue`, `unlock-method.vue`, `export/{full,account,seed}.vue` and `restore-again.vue` (all under `apps/extension/src/popup/pages/`). The owner's list names the first nine; `restore-again.vue` is the tenth and renders the same `ImportFullBackupForm` as Import profile.

Each page's scroll content is a run of section blocks rendered straight into the layout's content slot: page `div`s, `<template v-if>` fragments, or shared forms whose roots are section `div`s (`ImportSecretForm`, `ImportFullBackupForm`, `NewProfileCredentials`, `NewProfileMethodTabs`, `SecretUnlockSection`, `FilePasswordSection`, `ImportMethodPicker`). So the content element's element children, after the hero, are the sections on every one of the ten pages.

## Claims that did not hold

- The sweep reported `unlock-method.vue` off `CollapsingHeroLayout`; it is on it (`unlock-method.vue:2`).
- #1658 and the prototype recon say "nine screens on `CollapsingHeroLayout`"; there are ten (above).

## Open work and collisions

#1658 (open, `ux`, `owner-decision`) is the sweep; this lane is `Part of #1658` (Send, the Terms sheet, onboarding and the execute window stay there). Dedupe: `gh issue list --state all --search "scroll fold"` and closed `known-limit` "scroll": nothing on this layout. `useSnackInset` observes `document.body` attributes, so the button's class changes cost it one rAF-coalesced measure.
