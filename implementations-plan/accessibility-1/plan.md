---
plan: accessibility-1
tier: mid
status: planned; final Codex verdict approve; implementation waits for the owner's picks on two decision pages and the orchestrator's approval
issues: none (the scope is eleven follow-ups.md entries; no GitHub issue tracks them)
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 explorers (sonnet); dual audit (Codex gpt-6.1-sol high + one Opus Plan agent); final fresh Codex pass
post_implementation_hardening: not scheduled
---

# Accessibility 1: Send keyboard reach, Home and shared chrome

Eleven accessibility entries parked in `implementations-plan/follow-ups.md`, plus two Send faults the review panel found next to them. Every one changes something a person sees, hears or would notice, so the owner decides each one on a decision page with real-wallet screenshots before it is built. This plan carries the engineering for all of them and the material for the two pages: [options.md](options.md) (each option's component changes, copy, testids and screenshot hook) and [OWNER-ASKS.md](OWNER-ASKS.md) (the calls, in order, with the planner's recommendations).

- **Arc 1, Send keyboard reach (page 1).** The unit switch, Max and Refresh quote are mouse-only. A press below the destination is lost while the destination holds the focus. The token card has no focus style of its own. The sponsor notice is not announced. Found in review: an Enter on any control within 250 ms of leaving the destination picks a contact suggestion; the fee method picker cannot be opened by keyboard.
- **Arc 2, Home and shared chrome (page 2).** Home's two view links are mouse-only and fail contrast. Two focus rings do not show. The connect step bar's empty half and the light theme's status colours fail contrast.
- **Arc 3, after two open pull requests (page 2).** History's and Settings' titles are read twice. The swap to the emoji check is not announced. These two edit files that open PRs #56 and #58 rewrite, so they ship as their own layer once those land.

## Scope

**In:** the eleven entries above, as the lane brief groups them, with every surface they name; the two review findings, as owner calls 5 and 6 on page 1.

**Out, with reason:**
- The other mouse-only controls in the fee card (`FeeSettingsCard.vue:871` "Override with my method", `:903` "Use app's payment"), the destination's suggestion rows (`RecipientField.vue:111-118`, `div`s: the keyboard can pick only the first, by Enter), the fee card's degraded-data notice, `CollapsingHeroLayout`'s compact label, `Checkbox`, `ScopeAddress` and `ScopeClassId` (Enter only), the terminal card's status icons, and dark red text on a hovered row (4.43:1). Recon found them (`recon.md` § Observed); no entry names them. They go to `follow-ups.md` at close-out.
- A shared focus-ring rule or token, a `TextLink` primitive and an announcer component (decision ledger D0, D3, D4). The close-out records a follow-up for a shared ring and announcer once the owner's ring is settled.
- No storage migration and no persisted shape change.

## Owner dependencies

| Page | Call (OWNER-ASKS.md) | Phase |
|---|---|---|
| 1 | 1. Where the unit switch, Max and Refresh quote sit in the Tab order | 1.1 |
| 1 | 2. How focus shows on Send's controls | 1.1, 1.2, 1.5 |
| 1 | 3. A press below the destination while it holds the focus | 1.3 |
| 1 | 4. Announce the sponsor notice | 1.4 |
| 1 | 5. An Enter elsewhere must not pick a contact suggestion | 1.0 |
| 1 | 6. The fee method picker by keyboard | 1.5 |
| 2 | 1. Home's two view links | 2.1 |
| 2 | 2. The back arrow's and the onboarding tab's focus rings | 2.2 |
| 2 | 3. Read History's and Settings' title once | 3.1 |
| 2 | 4. Announce the swap to the emoji check | 3.2 |
| 2 | 5. The connect step bar's empty half | 2.3 |
| 2 | 6. The status colours in the light theme | 2.4 |

- Each arc starts when its page has every answer. A call answered "as is" drops its phase; the arc ships the rest.
- Arcs 1 and 2 share no product source file (both add rows to `packages/design/src/theme-contrast.test.ts`). If page 2 is answered first, Arc 2 is built first: see § Delivery, "Reversed order".
- Arc 3 starts only when both conditions hold: PR #56 is on `dev` (Phase 3.1), and PRs #55 and #58 are on `dev` (Phase 3.2; #58 targets #55's branch, not `dev`). Each phase starts on its own condition. If a condition is still false when Arcs 1 and 2 have converged, report it to the orchestrator, who decides whether Arc 3 waits or its entries go back to `follow-ups.md`.

## Outcome & Quality Bar

**For whom.** A person who drives the wallet by keyboard alone, a person who uses a screen reader, and a person who reads the light theme on a bright screen. Also the mouse user on Send who presses Max right after pasting an address.

**What excellent looks like.**
1. Every control the owner chose to make reachable is reached by Tab in the order it is drawn, and Enter or Space presses it. A smoke or network e2e walks each screen's Tab order by `data-testid`, on Chrome and on Firefox.
2. Wherever the keyboard is, the chosen focus style shows it, at 3:1 or more against what surrounds it in both themes. A unit test computes each designed ring's ratio from the tokens, and an e2e reads the focused element's computed outline.
3. Each change the owner chose to announce lands as one update to a polite region that existed before the update, and no title sits twice in the accessibility tree. Component tests pin the roles, the regions and the exact text.
4. Each colour the owner chose to change passes WCAG AA in both themes (4.5:1 for text, 3:1 for a graphic), asserted from `base.css` by `theme-contrast.test.ts`.
5. At rest, a changed screen draws the same pixels as before unless its option says otherwise, on Chrome and on Firefox.

**Good enough.** No new design primitive and no shared focus-ring abstraction. A screen the owner left "as is" stays byte-identical. No screen-reader run is a gate: no CI host has one, and live-region speech varies by screen reader (I4). The decision pages show the accessibility tree instead.

## Assumptions

### Facts (verified against `origin/dev` at `c42033e`)

1. The unit switch and Max are `<span @click.stop>` (`apps/extension/src/components/composite/send/AmountCard.vue:413-423`, `:443`); Refresh quote is a `<span @click>` (`apps/extension/src/popup/pages/send.vue:746`). None has a role, a `tabindex` or a key handler.
2. The unit switch renders only when `canUseFiatInput` holds: a live quote and a numeric `decimals` on the token (`AmountCard.vue:53`, `:170`). Max always renders and does nothing without a balance (`:354-366`). Refresh quote renders only while `fiatNeedsRequote` (`send.vue:279`, `:741`), and unmounts once pressed.
3. On blur, `RecipientField.vue:46-55` sets `selectedContact` to the candidate whose address equals the typed text; the template then swaps `AddressInput` (`:101`) for `RecipientCard` (`:93`: 14 px padding, a 36 px avatar, a 1 px rule), about 22 px taller. A 250 ms timer (`:51-53`) closes the suggestions. `network/send-amount-exact.test.ts:127-134` works around the move.
4. `RecipientField.vue:64-77` listens for Enter on `document`. While `showSuggestions` holds (suggestions exist and the field was focused within the last 250 ms) any Enter, from any element, selects the first suggestion (writing `searchTerm`) and blurs the focused element. It checks neither the target nor repeat or composition.
5. Send's recipient is always `searchTerm` (`send.vue:461`, `:547`, `:805`); the review sheet's name reads `selectedContact` (`send.vue:804`; `SendReviewSheet.vue:54`).
6. `SelectTokenCard.vue:85-100` is `role="button"` with `tabindex` 0 (-1 while loading), Enter and Space through `isRepeatOrComposing`, and no `:focus-visible` rule.
7. The fee method picker's trigger is a `Flex` (`FeeMethodSelector.vue:46-56`) in `DropdownRoot`'s `<div id="trigger" @click>` (`apps/extension/src/components/ui/Dropdown/DropdownRoot.vue:268`), so it is no Tab stop. Home's "⋯" is one because its trigger slot holds a `Button` (`TokensView.vue:383`). An open menu already answers arrows, Enter and Escape (`DropdownRoot.vue:224-240`) inside a focus trap.
8. `fee-sponsor-short` (`FeeSettingsCard.vue:925-930`) mounts by `v-if`, inside `<template v-if="showMethodSelector">` (`:879`), which is false for a dApp's embedded payment until the person overrides it (`:196-199`). The card serves Send and the dApp approval windows. Its `Icon` renders an unnamed `<svg role="img">`.
9. Home's links are `<span @click>`: `RecentActivityView.vue:765` and `TokensView.vue:376-381`, both in `--nulo-outline` (2.12:1 dark, 1.58:1 light on `--app-bg`). "View all" renders only past Home's three-row cap.
10. `packages/design/src/base.css:245-262` strips the outline from `a:focus`, `button` and `input`. No global `:focus-visible` rule or ring token exists; 36 files hold 51 `:focus-visible` rules, 18 of them the same `outline: 2px solid var(--nulo-accent)`.
11. `packages/design/src/base.css.test.ts:13-22` pins `base.css` by SHA-256; any edit updates the hash in the same commit.
12. The back arrow (`packages/design/src/ui/SubPageHeaderBase.vue:36-45`) has no focus rule. Onboarding's `.tab:focus-visible` (`apps/extension/src/onboarding/pages/create.vue:231-234`) draws an accent ring inside the active tab's accent fill (`:236-239`); the roving tablist (`AuthMethodTabs.vue`) keeps the Tab focus on the filled tab.
13. The compact title bar (`activity.vue:177-179`, `settings/index.vue:66-68`) hides by `opacity: 0` only (`tab-hero.module.css:2-19`), beside an `<h1 data-testid="page-hero-title">` with the same text.
14. `verify/index.test.ts:141-150` pins that nothing is focused after mount and that no key listener is installed on `document` or `window`. The verify window shows a fixed homograph warning when the hostname is suspicious (`DappIdentityBlock.vue:40-44`).
15. `ConnectStepBar.vue` draws the empty half in `--nulo-border`: 1.22:1 dark, 1.36:1 light on `--app-bg`. It is `aria-hidden`.
16. `TransactionTerminalCard.vue:71-82` colours the subtitle with `--yellow`, `--red` and `--green`, which hold one value in both themes: 1.56, 3.56 and 2.66 on the light `--app-bg`.
17. `contrast(fg, bg, theme)` (`packages/design/src/theme-contrast.ts`) computes WCAG ratios from `base.css`; `theme-contrast.test.ts` asserts text pairs at 4.5:1 and has no 3:1 table.
18. Smoke runs on any change under `apps/extension/**` or `packages/design/src/**` (`.github/workflows/pr-extension-smoke-e2e.yml:47-71`).
19. Open PR #56 (base `dev`) rewrites `settings/index.vue`, adds `settings/index.test.ts`, edits `tests/e2e/rows.test.ts`, `navigation.test.ts`, `network/popup-escape-layered.test.ts`, `FIREFOX.md` and `CLAUDE.md`, and renames the Appearance settings page to `display`. Open PR #58 (base: PR #55's branch) rewrites `verify/index.vue` and renames its copy: the section label "Connection verification" becomes "Connection check", the "Always trust" toggle "Skip this check next time". Phase 3.2 and page 2 call 4 use #58's copy.
20. CLAUDE.md § Keyboard & focus order puts secondary in-field controls at `tabindex="-1"`. Putting the unit switch and Max in the Tab path (page 1, call 1, A) is a recorded exception to that rule.

### Inferences (unverified; the phases check them first)

1. **I1.** A `<button type="button">` given the repo's reset (`font: inherit; color: inherit; background: none`, as `PublishStrip.vue:47-51`) before each class's own font rules draws the same pixels at rest as today's `<span>`, on Chrome and on Firefox. Phase 1.1 proves it with before/after shots on both browsers.
2. **I2.** For a mouse or pen press, `pointerup`, `mouseup` and `click` dispatch in one task, so a `setTimeout(0)` queued at `pointerup` runs after the `click`. For touch, the compatibility `mousedown` (and the blur) come after `pointerup`, so option C does not cover a finger press; options.md says so. Phase 1.3 proves the mouse case red-then-green.
3. **I3.** `chrome.tabs.update` from `#/windows/discover` to `#/windows/verify?…` may be a same-document navigation or a load. Phase 3.2 does not depend on it: its region mounts with the verify route and its text arrives later.
4. **I4.** A polite region that exists, empty, before its text arrives is announced by the major screen readers; one created with its text in place may not be. Speech timing and repetition vary (WAI-ARIA leaves presentation to the screen reader), so the plan promises one DOM update, not one utterance.
5. **I5.** The smoke profile is on testnet. `seedTokenRow` writes a row without transfer functions, so Send may treat it as blocked; whether the unit switch then renders is unverified. If not, the unit-switch e2e runs in `network/fiat-send.test.ts`. Max needs a balance, so its e2e runs in `network/send-amount-exact.test.ts`. "View all" likely draws from four seeded testnet rows; if not, `network/home-cap.test.ts`.
6. **I6.** While the destination holds the focus and a candidate matches, its suggestion list (`RecipientField.vue:110`; `position: absolute; top: 100%; z-index: 999`, up to 160 px tall) may cover the token card directly below; a press there picks the suggestion, today and under every option. Max, further down, is likely uncovered for a one-row list. Phase 1.3 measures which controls the list covers, and options A and C claim only the uncovered ones.

### Asks (the owner's, through OWNER-ASKS.md; nothing is built before the answer)

1. **A1.** Page 1, calls 1 to 6, and page 2, calls 1 to 6.
2. **A2.** Inside page 1 call 1: Max is disabled while there is no balance (A and B), and after a keyboard press on Refresh quote the focus returns to the amount field (A and B).
3. **A3.** Inside page 2 call 4: whether the announcement also reads the homograph warning when the window shows it (options A and A+).

## Architecture & Implementation

### Proposed architecture

Surgical fixes at each site with native elements and the repo's idioms (recon reuse map). No new component, composable or abstraction.

- **Keyboard reach.** A text control becomes a native `<button type="button">` (Send's three controls, the fee picker's trigger content) or a `RouterLink` (Home's two links). The browser gives Tab reach and Enter (and, for a button, Space) activation, so no key handler is written. A toggle takes `@keydown.enter="refuseRepeatEnter"` so a held Enter flips it once.
- **Focus rings.** Each site writes one `:focus-visible` rule in the repo idiom: `outline: 2px solid var(--nulo-accent)`, offset `2px` on a small control and `-2px` inside a row or a box. The onboarding tab's filled state draws its ring in `--app-bg`.
- **Announcements.** A polite region (`role="status" aria-live="polite" aria-atomic="true"`, the activity cards' idiom) is mounted empty, and the text arrives inside it later.
- **Duplicate titles.** `aria-hidden="true"` on the visual duplicate.
- **Contrast.** One new token for the step bar's track and three for status text, through the token procedure (`token-contract.ts`, `base.css`, `bun run --cwd packages/design gen:tokens`, the `base.css.test.ts` hash), asserted by new rows in `theme-contrast.test.ts`.

### Key interfaces

- `packages/design/src/token-contract.ts`: `tokenGroups.brand.track = "--nulo-track"` (page 2, call 5); `tokenGroups.text.warning = "--txt-warning"`, `.danger = "--txt-danger"`, `.success = "--txt-success"` (page 2, call 6). `textColors` (the `color` prop names) does not change.
- `base.css`, in `:root, [theme="dark"]`: `--nulo-track: #68625a`, `--txt-warning: var(--yellow)`, `--txt-danger: var(--red)`, `--txt-success: var(--green)` (dark draws today's pixels). In `[theme="light"]`: `--nulo-track: #8f8a82`, `--txt-warning: #7f6200`, `--txt-danger: #b3261e`, `--txt-success: #11733d`.
- `AmountCard` exposes its existing `handleFocus` as `focusAmount` beside `refreezeQuote` (page 1, call 1).
- No prop, emit or RPC changes elsewhere. New `data-testid`s are listed per option in options.md.

### Data and control flow

- **The suggestion Enter (1.0).** `onKeydown` acts only when the key is Enter, the event's target is the field's own `<input>`, the event is not `defaultPrevented`, and `isRepeatOrComposing(e)` is false. Everything else returns at once. The field's root is not enough: it also holds `RecipientCard`'s two buttons (`RecipientCard.vue:46-60`), and the suggestions can differ from the blur's exact-address match (names match too), so an Enter on a card button within the 250 ms could write another address.
- **Unit switch, Max, Refresh quote (1.1, option A).** Tab from the amount field reaches the unit switch, then Max (skipped while disabled), then Refresh quote while it shows. Enter or Space fires the existing click handler. After a keyboard press on Refresh quote (`:focus-visible`), the focus returns to the amount field, since the button unmounts.
- **The press across the destination's swap (1.3, option C).** Recording a press and holding the view are separate steps.
  - *Record.* RecipientField listens on `document`, capture phase, for `pointerdown` from a mouse or pen with the primary button, and records that `pointerId`. A recorded press that never blurs the field (a click inside the focused input) is simply forgotten at its `pointerup`.
  - *Hold.* `handleSearchBlur` sets `selectedContact` as today (the review sheet's name is right at once). If a recorded press is down, it also enters a hold: `holdView` is set, a hold token is bumped, and the 250 ms suggestions timer is not started; one still pending from an earlier blur is cleared. The field keeps that timer's handle for this, and its `@focus` clears it too, so an old timer never closes the suggestions of a later focus or hold. The template keeps `AddressInput` while `holdView` holds (`v-if="selectedContact && !holdView"`).
  - *Release.* On `pointerup` of that `pointerId`, a `setTimeout(0)` (after the `click`, I2) ends the hold if its token is still current: it clears `holdView` and closes the suggestions. `pointercancel` of that pointer, a window `blur`, and unmount end it the same way. There is no time fallback: a press held for any time keeps its target.
  - *Refocus.* A focus back into the input during a hold cancels it: the token is bumped (a queued release is void), `holdView` clears, and `selectedContact` returns to `null`, so the input stays mounted and editable; the next blur matches again, as today.
  - A blur with no recorded press (Tab, a script, touch) swaps at once, as today.
- **Sponsor notice (1.4).** `<div role="status" aria-live="polite" aria-atomic="true" data-testid="fee-sponsor-live">` sits in the card's root column outside `<template v-if="showMethodSelector">`, at the notice's position, so it exists from the card's first render in every state: the `showMethodSelector` template closes before the notice and reopens after it, and the row moves inside the region with `v-if="showMethodSelector && sponsorShort"`, so it shows exactly when it does today. The row's `Icon` gets `aria-hidden="true"`. The root column has no gap, so an empty region takes no space.
- **Fee picker (1.5, option A).** The trigger slot's `Flex` becomes `<button type="button" data-testid="send-fee-method-trigger">` with the same class and content. Enter or Space clicks it, the click bubbles to `DropdownRoot`'s trigger and opens the menu; arrows, Enter and Escape already work there, and the focus trap returns the focus to the button on close.
- **Emoji check (3.2, option A).** A visually hidden `<p role="status" aria-live="polite" aria-atomic="true" data-testid="verify-announce">` mounts empty with the verify route. When `emojis` is set, a 300 ms timer writes the fixed text (the section label and the instruction; A+ also the homograph warning when `hostnameHasNonAscii`). Unmount clears the timer; an unmount before the session read resolves leaves no timer. Nothing takes the focus and no key listener is added.

### File-level change map

| File | Phase | Change |
|---|---|---|
| `apps/extension/src/popup/components/modules/send/RecipientField.vue` (+ test) | 1.0, 1.3 (A or C) | the Enter target check; A: the wrap's `min-height`; C: `holdView` and the press listeners |
| `apps/extension/src/components/composite/send/AmountCard.vue` (+ test) | 1.1, 1.3 (B) | two spans become buttons; ring rules; `focusAmount()`; B: `@pointerdown` on Max |
| `apps/extension/src/popup/pages/send.vue` (+ `send.test.ts`) | 1.1 | Refresh quote becomes a button; ring rule; the focus return |
| `apps/extension/src/popup/components/modules/send/SelectTokenCard.vue` (+ test) | 1.2 | a `:focus-visible` rule |
| `apps/extension/src/popup/components/modules/send/FeeSettingsCard.vue` (+ test) | 1.4 | the region outside `showMethodSelector`; the icon hidden |
| `apps/extension/src/popup/components/modules/send/FeeMethodSelector.vue` (+ test) | 1.5 | the trigger content becomes a button; ring rule |
| `apps/extension/tests/e2e/send-keyboard.test.ts` (new, smoke; created by the first Arc 1 phase that runs) | 1.0-1.3, 1.5 | Tab walks, Enter and Space, repeat Enter, ring style, the first press across the swap, the suggestion Enter |
| `apps/extension/tests/e2e/network/send-amount-exact.test.ts` | 1.1, 1.3 | Max's Tab stop; the workaround at `:127-134` removed, Max pressed while the destination holds focus |
| `apps/extension/tests/e2e/network/fee-sponsor-funding.test.ts` | 1.4 | the notice's parent is the region |
| `apps/extension/src/popup/components/modules/general/RecentActivityView.vue`, `TokensView.vue` (+ tests) | 2.1 | A: `RouterLink`, colour, ring; B: the links removed |
| `apps/extension/tests/e2e/home-links.test.ts` (new, smoke; `rows.test.ts` is rewritten by PR #56) | 2.1 | Tab reaches each link; Enter opens its page; ring style |
| `apps/extension/tests/e2e/network/home-cap.test.ts` | 2.1 (B) | Holdings opens through the nav tab |
| `packages/design/src/ui/SubPageHeaderBase.vue` (+ test) | 2.2 | a `:focus-visible` rule on the back button |
| `apps/extension/src/onboarding/pages/create.vue` (+ `create.test.ts`) | 2.2 | `.tabActive:focus-visible` in `--app-bg` |
| `apps/extension/tests/e2e/tooltips-glossary.test.ts`, `onboarding-tab.test.ts` | 2.2 | the focused back arrow's and method tab's outline |
| `packages/design/src/token-contract.ts`, `tokens.ts` (generated), `base.css`, `base.css.test.ts` (hash) | 2.3, 2.4 | the four tokens |
| `packages/design/src/theme-contrast.test.ts` | 1.2, 2.1-2.4 | a 3:1 table for rings and the track; text pairs for the link and status colours; dark aliases resolve to today's colours |
| `apps/extension/src/popup/windows/ConnectStepBar.vue` (+ test) | 2.3 | the empty half in `--nulo-track` |
| `apps/extension/src/components/composite/activity/TransactionTerminalCard.vue` (+ test, `.stories.ts`) | 2.4 | subtitles in the status text tokens; a green story |
| `apps/extension/src/popup/pages/activity.vue`, `settings/index.vue` (+ `activity.test.ts`, `settings/index.test.ts`) | 3.1 | `aria-hidden="true"` on the compact bar |
| `apps/extension/src/popup/windows/verify/index.vue`, `index.test.ts` | 3.2 | A: the region and its timer; B: focus on the check's heading |
| `apps/extension/tests/e2e/network/connect-one-window.test.ts` | 2.3, 3.2 | the bar's colour on step 1; the region's text (A) or the focused heading (B) |
| `CLAUDE.md` § Keyboard & focus order | close-out | records the owner's page 1 call 1 answer (Fact 20), on top of #56's CLAUDE.md edits |

### Algorithms and non-obvious mechanics

- **C and the suggestion Enter.** C keeps the suggestions for the length of a press, so with call 5 "as is" it lengthens Fact 4's window to the press. OWNER-ASKS.md says so under call 5.
- **Why the press listener runs in time (1.3 C).** `pointerdown` precedes `mousedown`, and the input's blur is `mousedown`'s default action, so the capture-phase record exists before `handleSearchBlur` runs. Only the recorded `pointerId` ends the hold, so a second pointer cannot release it early.
- **Why the region exists before its text (1.4, 3.2).** In 1.4 the region renders with the card's root, outside every conditional, so even the embedded-payment state starts with it. In 3.2 the text waits 300 ms after the emojis are set: long enough for the region to enter the accessibility tree, short against a person's first look at the grid.
- **Max with no balance (1.1).** `:disabled="!tokenBalanceByType"` leaves the Tab path; the class keeps the colour, because an author class outranks the browser's `button:disabled` style by cascade origin.
- **Ring specificity.** `.class:focus-visible` (0,2,0) outranks `a:focus` (0,1,1) and `button` (0,0,1) in `base.css`; no `!important`.
- **Dark status pixels (2.4).** The dark values are `var(--yellow)` and so on, so a unit test asserting `resolveColor("--txt-warning", themeMap("dark"))` equals `resolveColor("--yellow", themeMap("dark"))` (and the same for red and green) proves dark is unchanged, with no screenshot.

### Trade-offs and alternatives not taken

Argued in the decision ledger: outline A against outline B (D0); native elements against `role="button"` spans (D1); option C's view hold against holding the match, and against A and B (D2); per-site rings (D3); no `TextLink` (D4); a polite region against a focus move or a title change (D5); new tokens against existing ones (D6); an Arc 3 layer for the PR-dependent phases (D7).

## UI impact

- **Send, the amount card (page 1, calls 1 and 2).** Before: the unit switch, Max and Refresh quote cannot be reached by keyboard. After (A): Tab reaches each after the amount field; call 2's focus style shows on the focused one; after a keyboard press on Refresh quote the focus is back in the amount field. At rest the page draws the same pixels.
- **Send, the token card (page 1, call 2).** Before: the browser's ring. After (A): a 2 px accent ring inside the row's edge, over the hover tint. B and "as is": the browser's ring, on the new stops too.
- **Send, the destination field (page 1, calls 3 and 5).** Call 3: before, a press below the field is lost when it turns into the account card. After (C): for a mouse or pen, the card appears when the press ends and the press lands on any control the suggestion list does not cover (I6). A: the empty field's row is about 22 px taller. B: Max acts at the press; the others keep the fault. Call 5: an Enter on another control no longer picks a contact; nothing changes in normal use.
- **Send and the dApp approval windows, the fee card (page 1, calls 4 and 6).** Call 4: no visible change; a screen reader is told the sponsor cannot pay. Call 6 (A): the fee method picker becomes a Tab stop with call 2's focus style.
- **Home (page 2, call 1).** Before: two grey links that Tab skips. After (A): Tab reaches each; they read in `--nulo-secondary` (6.40:1 dark, 5.30:1 light); a modifier-click opens a new tab. B: the links are gone.
- **Every sub-page and onboarding's create page (page 2, call 2).** After: the focused back arrow shows a 2 px accent ring inside its 40 px box; the focused method tab shows a 2 px page-coloured ring 3 px inside its fill.
- **The connect window's step bar (page 2, call 5).** The empty half goes from 1.22:1 to 3.30:1 (dark) and from 1.36:1 to 3.15:1 (light).
- **The activity card's status line, light theme (page 2, call 6).** Amber 1.56:1 to 5.28:1, red 3.56:1 to 6.00:1, green 2.66:1 to 5.44:1 on the page. Dark draws the same pixels.
- **History and Settings (page 2, call 3).** No visible change.
- **The connect window's emoji check (page 2, call 4).** A and A+: no visible change. B: the focus lands on the "Connection check" heading, and a ring may show there.

## Security & Adversarial Considerations

- **Threat model.** The change is presentation and input handling inside the extension's own pages. The trust boundaries it touches are the emoji check (a gate against a man-in-the-middle connection) and the Send recipient (where the money goes).
- **The recipient must not change behind the person's back.** Fact 4 is a live fault: a fast Tab-then-Enter after typing part of a contact's name writes that contact's address. Phase 1.0 limits the Enter to the field's own input and refuses repeat and composing keys; its tests pair "Enter on another control changes nothing" with "Enter in the field picks the first suggestion". Option C changes only which view shows while a press is down: the hold itself never writes `searchTerm` (what Send sends), and `selectedContact` is written at the blur as today; a test asserts `selectedContact.address === searchTerm` once the hold ends. With call 5 "as is", the held suggestions keep Fact 4's Enter live for the press; the page says so under calls 3 and 5. Its listeners only read `pointerId`, `pointerType`, `isPrimary` and `button`, never stop or prevent an event, and are removed on unmount.
- **The emoji check must never be answered by a stray key.** No option may put the focus on "They match" or "They don't match", or add a key listener. A keeps the pin at `index.test.ts:141-150`. B focuses a non-interactive heading (`tabindex="-1"`); its test dispatches Enter there and asserts neither answer handler runs. The announced text is fixed wallet copy; a test with a hostile dApp name and hostname (the fixture at `index.test.ts:15`) asserts the region's exact text contains neither.
- **Max on `pointerdown` (option B).** A press can run Max twice (the `pointerdown` and the `click`); both write the same resting amount, and a unit test pins that the second run changes nothing.
- **Live regions carry no secrets.** The sponsor notice names the paying method only; no amount, address or balance enters a region. Nothing new is logged.
- **Links.** The two `RouterLink`s point at fixed internal routes. A modifier-click opens that route of the extension's own page, as the token rows already do.
- **Least privilege, cryptography, supply chain.** No permission, key, crypto or dependency change; the lockfile is untouched.
- **XSS.** No `v-html`; all new text is fixed template copy.

## Implementation phases

Run every command from the worktree root unless the step says otherwise. Every phase writes its failing test first (red), then the fix (green). Read a red e2e honestly: one rerun for a known flake, a fix for real breakage. The gates name three command groups:

- **Fast layers:** `bun run lint`, `bun run typecheck:all`, `bun run test`, `bun run test:all`.
- **Smoke run of `<spec>` on `<browser>`** (`chrome` or `firefox`): `bun run build:<browser> && (cd apps/extension && env -u EXTENSION_PATH NULO_E2E_BROWSER=<browser> bun run test:e2e -- tests/e2e/<spec> --retry=0)`, one `tests/e2e/` path per spec. The smoke suite loads whatever sits in `dist/<browser>` and builds nothing (`tests/e2e/global-setup-smoke.ts:7-9,36-38`); an inherited `EXTENSION_PATH` would point it at another bundle, so the run unsets it; and `e2e:agent` overwrites that directory with a network build, so every smoke run (baseline, red and green) builds first.
- **Network run of `<spec>` on `<browser>`:** `NULO_E2E_RETRY=0 NULO_E2E_BROWSER=<browser> NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/<spec>`, one path per spec. `agent.sh` builds the browser's wallet itself; `NULO_E2E_RETRY=0` turns off the network config's two default retries (`vitest.e2e.network.config.ts:39`), so a pass is a first-try pass. Never two `e2e:agent` runs in one worktree at once.

### What each gate asserts, by answer

| Call | Answer | The gate asserts |
|---|---|---|
| P1 c1 | A | the three are `BUTTON`s with no `tabindex`; Tab reaches the unit switch after the field (smoke or fiat-send), and Max after the field and the unit switch when it renders (send-amount-exact) |
| P1 c1 | B | the unit switch and Max are `BUTTON`s with `tabindex="-1"`; the Tab sequence is today's |
| P1 c2 | A | a focused control's computed outline is `2px solid` in the accent colour; the 3:1 ring rows pass |
| P1 c2 | B | a focused control's computed `outline-style` is not `none` |
| P1 c2 | as is | the token card's rule is unchanged; every new Tab stop (calls 1 and 6) carries `outline: revert`, the browser's ring, and its computed `outline-style` is not `none` (the page defines "as is" this way, so no answer leaves a stop with no ring) |
| P1 c3 | A, B, C | per Phase 1.3 |
| P1 c6 | A | Tab reaches `send-fee-method-trigger`; Enter opens the menu; Escape returns the focus to it |
| P2 c1 | A or B | per Phase 2.1 |
| P2 c4 | A, A+, B | per Phase 3.2 |

### Arc 1, Send keyboard reach (after page 1's answers)

The first Arc 1 phase that runs creates `apps/extension/tests/e2e/send-keyboard.test.ts` (smoke, `registeredExtensionPerTest`) with a helper that opens Send and Tabs until a testid holds the focus (`tabAround`/`activeTestId` from `tests/e2e/helpers/pointer-probes.ts`). Firefox: press `" "`, never `"Space"` (`tests/e2e/FIREFOX.md`).

#### Phase 1.0: an Enter elsewhere never picks a suggestion (call 5)

Skip this phase if call 5 is "as is".

1. Add to `RecipientField.test.ts`: with suggestions shown and the field just blurred, an Enter dispatched on an element outside the field leaves `searchTerm` and `selectedContact` unchanged and blurs nothing; within the same 250 ms, an Enter on `recipient-card-change` (inside the field's root, `RecipientCard.vue:55-60`) changes nothing either; an Enter in the field's input picks the first suggestion; a repeat, composing or already-handled (`defaultPrevented`) Enter in the input picks nothing. Run; the first two tests fail.
2. In `RecipientField.vue`, make `onKeydown` return unless `e.key === "Enter"`, the target is the field's own `<input>` (the one `AddressInput` renders; it is unmounted while the card shows), `!e.defaultPrevented` and `!isRepeatOrComposing(e)`.
3. In `send-keyboard.test.ts`: type part of the profile's own account name in the destination (accounts are candidates, so no contact seed is needed), Tab, press Enter at once, and assert `readSendInputs(page).destination` is still the typed text.

**Validation gate.** Commands: the fast layers; the smoke run of `send-keyboard.test.ts` on chrome and on firefox. Pass criteria: every command exits 0; the step 1 tests and the step 3 e2e failed on today's code before step 2 (logged). Layers: lint, typecheck, unit, smoke e2e on both browsers.

#### Phase 1.1: the unit switch, Max and Refresh quote by keyboard (call 1, with call 2's style)

Skip this phase if call 1 is "as is".

1. Write the shot step first: in `send-keyboard.test.ts`, open Send at rest with a priced token (I5; else in `network/fiat-send.test.ts`) and call `shotSend(page, "send-at-rest", "send-amount-row")`. Smoke-run it (or network-run it) on chrome and on firefox with `NULO_E2E_SHOT_DIR=~/.cache/nulo-backlog/accessibility-1/shots/before`. Run a Tab probe from `send-token-trigger` and log the sequence in `lessons/phase-1.md`.
2. Add the unit tests below; run them; they fail.
3. In `AmountCard.vue`, change the unit switch and Max to `<button type="button">`; keep every class, testid, `title` and handler.
4. Give Max `:disabled="!tokenBalanceByType"`, and the unit switch `@keydown.enter="refuseRepeatEnter"`.
5. Option B only: give the unit switch and Max `tabindex="-1"`.
6. In `send.vue`, change Refresh quote to `<button type="button">`. After `handleRequote`, if the button matched `:focus-visible`, call `amountCardRef.value?.focusAmount()`; in `AmountCard.vue`, add `focusAmount: handleFocus` to `defineExpose`.
7. In each class, put `font: inherit; color: inherit; background: none;` before the class's own font and colour rules.
8. Add each control's `:focus-visible` rule per call 2 (A: `outline: 2px solid var(--nulo-accent); outline-offset: 2px`; B or "as is": `outline: revert`).
9. Run step 1's shots again into `…/shots/after`; compare each pair with `cmp`. On a difference, open both images, and log the verdict in `lessons/phase-1.md`; an unexplained difference fails the gate.

**Tests that land.**
- `AmountCard.test.ts`: the unit switch and Max are `BUTTON`, `type="button"`; A: no `tabindex`, B: `tabindex="-1"`; Max is disabled with no balance and enabled with one; a repeat Enter on the unit switch is default-prevented and a plain one is not; `focusAmount()` focuses the visible input in both modes.
- `send.test.ts`: Refresh quote is a `BUTTON`; its click calls `refreezeQuote` once; with `:focus-visible` matched (stub `matches`) the focus goes to the amount field, and without it no focus moves. One case mounts the real `AmountCard` (override its stub): enter fiat mode, emit a moved quote through the mocked price client's `onQuotesUpdated` (`send.test.ts:81-85`; the gate is `send-fiat-gate.ts`), focus Refresh quote with `:focus-visible` matched and press it; assert the amount re-derives, Refresh quote unmounts, and the visible amount input holds the focus.
- `send-keyboard.test.ts` (or `network/fiat-send.test.ts`, I5), Chrome and Firefox. A: the logged sequence with `send-amount-fiat-toggle` inserted after the amount field; a plain Enter on the toggle shows `send-amount-fiat-input`, a held Enter (the `keyboard-guards.test.ts` pattern) flips it once, and `" "` flips it back; the ring per the answer table. B: the logged sequence, unchanged.
- `network/send-amount-exact.test.ts` (A), Chrome and Firefox: Tab from `send-amount-input`, past `send-amount-fiat-toggle` when it renders, lands on `send-amount-max`; Enter fills the balance.
- Refresh quote has no e2e: in the real wallet the quote moves only on the background's 3-minute refresh or after the 15-minute freeze, and the e2e layer has no seam to move it. The `send.test.ts` case above drives the real requote path through the price client's event; its activation is the same native behaviour the toggle's e2e proves.

**Validation gate.** Commands: the fast layers; the smoke run of `send-keyboard.test.ts` on chrome and on firefox (or, I5, the network run of `fiat-send.test.ts` on both); the network run of `send-amount-exact.test.ts` on chrome and on firefox. Pass criteria: every command exits 0; the step 2 tests failed before step 3; every `cmp` pair is identical or explained in lessons; both browsers' shot pairs are attached to the PR. Layers: lint, typecheck, unit, smoke and network e2e, both browsers.

#### Phase 1.2: the token card's focus ring (call 2)

Skip this phase if call 2 is B or "as is".

1. Add a source-rule test to `SelectTokenCard.test.ts` (the `TransactionTerminalCard.test.ts` precedent), and a 3:1 table to `theme-contrast.test.ts`: the accent on `--app-bg`, `--nulo-surface-low` and `--nulo-surface-high`, both themes. Run; the source test fails.
2. In `SelectTokenCard.vue`, add `.wrapper:focus-visible { outline: 2px solid var(--nulo-accent); outline-offset: -2px; background: color-mix(in srgb, var(--nulo-surface-low) 50%, transparent); }`.
3. In `send-keyboard.test.ts`, the focused `send-token-trigger` has a `2px solid` accent outline.

**Validation gate.** Commands: the fast layers; the smoke run of `send-keyboard.test.ts` on chrome and on firefox. Pass criteria: every command exits 0; every 3:1 row passes; the source test failed before step 2. Layers: lint, typecheck, unit, smoke e2e on both browsers.

#### Phase 1.3: a press below the destination survives its swap (call 3)

Skip this phase if call 3 is "as is".

1. Reproduce first, independent of Phase 1.1. In `network/send-amount-exact.test.ts`, replace the workaround at `:127-134`: type the account's address in `send-destination-field`, keep the focus there, then `pointerClick(page, "send-amount-max")`. It must fail on today's code (the amount stays). Log the run in `lessons/phase-1.md`.
   `pointerClick` throws if something covers Max's centre; if the suggestion list does (I6), stop and report it to the orchestrator, since the call's premise changes.
2. In `send-keyboard.test.ts`, type the profile's own address, keep the focus, and record with `document.elementFromPoint` at each centre which of `send-token-trigger`, `send-amount-max` and `send-fee-method-trigger` the open suggestion list covers. Log the result in `lessons/phase-1.md`; the phase claims a fix only for the uncovered ones (I6).
3. Build the picked option:
   - **A:** give `.recipient_wrap` a `min-height` equal to `RecipientCard`'s rendered height; the e2e asserts the two heights match, so a card change fails it.
   - **B:** in `AmountCard.vue`, add `@pointerdown` on Max that calls `handleMax` when `e.isPrimary && e.button === 0`; keep `@click`.
   - **C:** in `RecipientField.vue`, add `holdView` and the press listeners as § Data and control flow says.
4. Run step 1's reproduction; it passes. C: also hold a press on Max for 1.5 s (`page.mouse.down`, wait, `up`) and assert the amount fills.

**Tests that land.**
- C, `RecipientField.test.ts`: a blur during a recorded press keeps `AddressInput` and sets `selectedContact` at once; `pointerup` of that pointer, then a tick, shows the card, with `selectedContact.address === searchTerm` (pair: a blur with no press shows the card at once); a click on another suggestion during the hold selects that suggestion; a click inside the focused input records a press but enters no hold, and the suggestions stay; a refocus of the input during a hold keeps the input mounted, clears the blur's match and voids the queued release; a release queued by an earlier hold cannot end a newer one; a blur with no press, a refocus and a held press on a suggestion, all within 250 ms, keep that suggestion until the release (the first blur's timer is cleared); a right-button or touch `pointerdown` records nothing; `pointerup` of another `pointerId` releases nothing; unmount removes every listener and timer; the hold never writes `searchTerm`.
- B, `AmountCard.test.ts`: a primary `pointerdown` writes the balance; the following `click` leaves the same value; a right-button `pointerdown` writes nothing.
- A: jsdom has no layout; the e2e measures it.

**Validation gate.** Commands: the fast layers; the smoke run of `send-keyboard.test.ts` on chrome and on firefox; the network run of `send-amount-exact.test.ts` on chrome and on firefox. Pass criteria: step 1's reproduction failed before step 3 (logged) and passes after; step 2's coverage is logged; every command exits 0. Layers: lint, typecheck, unit, smoke and network e2e, both browsers.

#### Phase 1.4: the sponsor notice in a live region (call 4)

Skip this phase if call 4 is "as is".

1. Add to `FeeSettingsCard.test.ts`, on one mounted card each: starting with no notice, `fee-sponsor-live` exists with `role="status"`, `aria-live="polite"`, `aria-atomic="true"` and no text; then the sponsor turns short and the full sentence appears inside it; an embedded-payment card (`showMethodSelector` false) also mounts the region; the notice's icon is `aria-hidden`. Run; they fail.
2. In `FeeSettingsCard.vue`, split `<template v-if="showMethodSelector">` around the notice, put the region between the two halves, and move the notice row into it with `v-if="showMethodSelector && sponsorShort"`; add `aria-hidden="true"` to its `Icon`. Add to step 1's tests: an embedded-payment card with `sponsorShort` true shows no notice, as today.
3. In `network/fee-sponsor-funding.test.ts`, assert the notice's parent is `fee-sponsor-live`, and shoot the card with `shotSend` before and after the change (`cmp`).

**Validation gate.** Commands: the fast layers; the network run of `fee-sponsor-funding.test.ts` on chrome. Pass criteria: every command exits 0; the shots are identical or explained in lessons. Layers: lint, typecheck, unit, network e2e.

#### Phase 1.5: the fee method picker by keyboard (call 6)

Skip this phase if call 6 is B or "as is".

1. Add to `FeeMethodSelector.test.ts`, with the real `Flex` (the file's stub at `:183` always renders a `div`): `send-fee-method-trigger` is a `BUTTON` with `type="button"`; its click opens the menu (the existing open path). Add to `send-keyboard.test.ts`: Tab reaches `send-fee-method-trigger`; Enter opens the menu; ArrowDown and Enter pick a method; Escape closes the menu and leaves the focus on the trigger; the ring per call 2. Run; they fail.
2. In `FeeMethodSelector.vue`, give the trigger slot's `Flex` `tag="button"` and `type="button"` (`Flex` renders any tag, `packages/design/src/core/Flex.vue:11,79`), keeping its `align`, `justify`, class, testid, `data-fee-method` and content; add a class with the reset from Phase 1.1 step 7, `width: 100%`, and call 2's ring. The at-rest shots prove the trigger's width and alignment unchanged.

**Validation gate.** Commands: the fast layers; the smoke run of `send-keyboard.test.ts` on chrome and on firefox; the network run of `popup-escape-layered.test.ts` on chrome (it opens the picker by pointer). Pass criteria: every command exits 0; the step 1 tests failed before step 2; the trigger's at-rest shots (`shotSend` with focus `send-fee-method-trigger`, before and after, both browsers) are identical under `cmp` or explained. Layers: lint, typecheck, unit, smoke and network e2e.

**Arc 1 exit gate.** `bun run audit:vue` and `bun run test:all` exit 0, and the Arc 1 Codex fix loop has converged.

### Arc 2, Home and shared chrome (after page 2's answers)

#### Phase 2.1: Home's view links (call 1) ✓

Skip this phase if call 1 is "as is".

- **A:**
  1. Add tests. In `RecentActivityView.test.ts` and `TokensView.test.ts`, mount with a memory router and `stubs: { RouterLink: false }` (`makeRouter`, `RecentActivityView.test.ts:169`): each link is an `A` with the right `href`. In `theme-contrast.test.ts`: `--nulo-secondary` on `--app-bg` at 4.5:1, both themes. Write `tests/e2e/home-links.test.ts` (smoke): seed three transactions (the `rows.test.ts:585-607` pattern) and four testnet token rows (I5); Tab reaches `tokens-view-all`, then `tokens-menu-trigger`; later Tab reaches `activity-view-all`; Enter on each opens `#/popup/holdings` and `#/popup/activity`; a focused link's outline is `2px solid`. If the smoke seed does not draw "View all" (I5), its assertions go in `network/home-cap.test.ts` instead, which funds four tokens (`:20`) and reaches the link (`:52`). Run; the link tests and the e2e fail.
  2. Change each `<span @click>` to `<RouterLink to="…">` with the same class and testid.
  3. Set the class colour to `var(--nulo-secondary)`; keep the accent on hover; add `:focus-visible { outline: 2px solid var(--nulo-accent); outline-offset: 2px; }`.
- **B:**
  1. In `home-links.test.ts`, assert neither testid exists on Home (seeded as in A); change `network/home-cap.test.ts:52` to open Holdings through the nav tab. Run; the absence test fails.
  2. Delete both elements and their classes, and the unit tests that press them.

**Validation gate.** Commands: the fast layers; the smoke run of `home-links.test.ts` on chrome and on firefox; the network run of `home-cap.test.ts` on chrome and on firefox when it carries the "View all" assertions (A, I5) or the nav-tab change (B). Pass criteria: every command exits 0; step 1's tests failed before step 2. Layers: lint, typecheck, unit, smoke e2e on both browsers; network e2e when `home-cap.test.ts` changed.

#### Phase 2.2: the back arrow's and the onboarding tab's rings (call 2) ✓

Skip this phase if call 2 is "as is".

1. Add source-rule tests to `SubPageHeaderBase.test.ts` and `create.test.ts`; add to the 3:1 table `--app-bg` on `--nulo-accent`, both themes. Run; the source tests fail.
2. In `SubPageHeaderBase.vue`, add `.back_btn:focus-visible { outline: 2px solid var(--nulo-accent); outline-offset: -2px; }`.
3. In `create.vue`, add `.tabActive:focus-visible { outline: 2px solid var(--app-bg); outline-offset: -5px; }` after the `.tab:focus-visible` rule, which stays for an unfilled tab.
4. Extend `tooltips-glossary.test.ts` (Tab to `subpage-back`, read its outline) and `onboarding-tab.test.ts` (Tab to `onboarding-method-password`, read its outline, press ArrowRight, read `onboarding-method-passkey`'s).

**Validation gate.** Commands: the fast layers (`test:all` runs the design package); the smoke run of `tooltips-glossary.test.ts onboarding-tab.test.ts` on chrome and on firefox; `bun run --cwd apps/extension build-storybook`. Pass criteria: every command exits 0; the outlines read `2px solid` in the accent colour (back) and the page colour (tab). Layers: lint, typecheck, unit, smoke e2e on both browsers.

#### Phase 2.3: the step bar's empty half (call 5)

Skip this phase if call 5 is "as is".

1. Add to the 3:1 table: `--nulo-track` on `--app-bg`, both themes. Add a source-rule test to `ConnectStepBar.test.ts`. Run; they fail.
2. Add `track: "--nulo-track"` to `tokenGroups.brand`; run `bun run --cwd packages/design gen:tokens`; add the two values to `base.css`; update the hash in `base.css.test.ts` in the same commit.
3. In `ConnectStepBar.vue`, draw `.segment` in `var(--nulo-track)`.

**Validation gate.** Commands: the fast layers; the network run of `connect-one-window.test.ts` on chrome. Pass criteria: every command exits 0, including `tokens.drift.test.ts`, `tokens.parity.test.ts`, `base.css.test.ts` and the "dark palette, unthemed vs explicit" tests. Layers: lint, typecheck, unit, network e2e.

#### Phase 2.4: the status colours in the light theme (call 6)

Skip this phase if call 6 is "as is".

1. Add to `theme-contrast.test.ts`: in light, each of `--txt-warning`, `--txt-danger`, `--txt-success` on `--app-bg`, `--nulo-surface-low` and `--nulo-surface-high` at 4.5:1; in dark, each resolves to the same colour as `--yellow`, `--red`, `--green`. Update `TransactionTerminalCard.test.ts`'s source-rule test to the new tokens. Run; they fail.
2. Add the three names to `tokenGroups.text`; run `gen:tokens`; add the values to `base.css`; update the `base.css.test.ts` hash.
3. In `TransactionTerminalCard.vue`, colour `.subtitle_amber`, `.subtitle_red` and `.subtitle_green` with the new tokens.
4. Add a green "Sent" story to `TransactionTerminalCard.stories.ts`.

**Validation gate.** Commands: the fast layers; `bun run --cwd apps/extension build-storybook`. Pass criteria: every command exits 0. Layers: lint, typecheck, unit.

**Arc 2 exit gate.** `bun run audit:vue` and `bun run test:all` exit 0, and the Arc 2 Codex fix loop has converged.

#### Arc 2 record (Home and shared chrome)

Built on the owner's page 2 picks (OWNER-ASKS.md § Answers: page 2): calls 1 A, 2 A, 5 A and 6 A. Calls 3 and 4 are Arc 3. The phase log is [lessons/phase-2.md](lessons/phase-2.md).

**Arc 2 deviations from the plan as written.**

- **A2-D1, delivery.** The orchestrator ran Arcs 1 and 2 in parallel from the plan commit. Arc 2's branch `accessibility-1-home-chrome` stacks on the plan commit, not on Arc 1, and its PR targets `dev`; Arc 1 merges first, then Arc 2 is rebased onto `dev`. This replaces § Delivery's layer order for these two arcs; Arc 3 and the close-out still stack on top.
- **A2-D2, Phase 2.1.** The smoke spec seeds one transaction, not three: "View history" needs one row, and fewer rows move under the Tab walk. Smoke Home draws "View all" from the four testnet default tokens (I5 holds), so `network/home-cap.test.ts` is untouched.
- **A2-D3, test helpers.** `tabTo`, `tokenColor` and `focusRing` live in `tests/e2e/helpers/pointer-probes.ts`, shared by the three specs that read a ring; `rows.test.ts` keeps its own `tabTo` because PR #56 rewrites that file.
- **A2-D4, Firefox focus.** Each Tab walk calls `prepareKeys` first: on an unfocused Firefox page `document.hasFocus()` is false and no `:focus-visible` rule matches. Onboarding's create page focuses the password field on arrival, so its walk goes back one stop with Shift+Tab; a forward walk leaves the document on Firefox.

### Arc 3, after PRs #56, #55 and #58 (page 2, calls 3 and 4)

Start each phase only when its condition in § Owner dependencies holds, after `gh stack sync`.

#### Phase 3.1: History's and Settings' title, once (call 3)

Skip this phase if call 3 is "as is".

1. Add to `activity.test.ts` and `settings/index.test.ts` (from #56): the `page-title-bar`'s parent carries `aria-hidden="true"`, and `page-hero-title` does not. Run; they fail.
2. Add `aria-hidden="true"` to the `page_title_bar` div in both pages.

**Validation gate.** Commands: the fast layers; the smoke run of `navigation.test.ts` on chrome and on firefox. Pass criteria: every command exits 0. Layers: lint, typecheck, unit, smoke e2e.

#### Phase 3.2: the swap to the emoji check is announced (call 4)

Skip this phase if call 4 is "as is".

- **A or A+:**
  1. In `index.test.ts`, with fake timers and the hostile-dApp fixture: after mount the region exists, empty, with `role="status"`; 300 ms after the emojis are set its text is exactly the fixed sentence (A+: with the homograph warning when `hostnameHasNonAscii`, and without it otherwise) and contains neither the dApp's name nor its hostname; the existing pin still passes; an unmount before 300 ms, and one before the session read resolves, leave no timer. Run; they fail.
  2. Add the visually hidden region (compose `visually_hidden` from `popup/components/modules/send/fee-shared.module.css`) and the timer.
  3. In `network/connect-one-window.test.ts`, after `approveConnect` reaches the grid, wait for `verify-announce` to hold the sentence.
- **B:**
  1. In `index.test.ts`: after the emojis are set, the focused element is `verify-check-heading`, with `tabindex="-1"`, and is no `BUTTON`; an Enter dispatched there runs neither answer handler; no key listener is installed. This replaces the old focus pin.
  2. Wrap the "Connection check" label in an element with `tabindex="-1"`, an `id` and `aria-describedby` pointing at the instruction; focus it once the emojis are set.
  3. In `connect-one-window.test.ts`, assert `activeTestId` after the swap.

**Validation gate.** Commands: the fast layers; the network run of `connect-one-window.test.ts connect-verify-mismatch.test.ts` on chrome and on firefox. Pass criteria: every command exits 0; no test focuses or presses a verify button except through its own deliberate press. Layers: lint, typecheck, unit, network e2e on both browsers.

**Arc 3 exit gate.** `bun run audit:vue` exits 0 and the Arc 3 Codex fix loop has converged.

## Delivery

One `gh stack`, one PR per arc, a docs-only close-out on top. Titles name only what shipped: drop a clause for a call answered "as is".

| Layer | Branch | Phases | Stacks on | `/code-review` | PR title (≤ 93 characters) |
|---|---|---|---|---|---|
| 1 | `worktree-accessibility-1` (adopted; carries the plan commit) | 1.0-1.5 | `dev` | off | `fix(send): keyboard reach and focus rings on send, keep the first press, announce sponsor` |
| 2 | `accessibility-1-home-chrome` | 2.1-2.4 | layer 1 | off | `fix(a11y): reach home's view links, show two focus rings, fix connect and status contrast` |
| 3 | `accessibility-1-titles-verify` | 3.1-3.2 | layer 2 | off | `fix(a11y): read history and settings titles once, announce the emoji check` |
| 4 | `accessibility-1-close-out` | close-out | the top layer | off | `docs(plans): close accessibility-1` |

- **Reversed order.** If page 2 is answered first: build Arc 2 on `worktree-accessibility-1` (layer 1), then `gh stack add accessibility-1-send-keyboard` for Arc 1 (layer 2); Arc 3 and the close-out stay on top. Every later instruction that names a layer's branch follows this table's order instead.
- **Arc 3 not ready.** If its conditions are still false when layers 1 and 2 have converged, report to the orchestrator; the close-out waits on its decision.
- **Keeping current.** Bring `dev` in with `gh stack sync` (bottom up), never a merge into one layer.
- **No `Closes #n`.** No GitHub issue tracks these entries; the close-out deletes each resolved entry from `follow-ups.md`.
- **Labels.** Open each PR without labels; every layer touches `apps/extension/**`, so smoke and network run by their filters.
- **PR body.** What changed and why; the owner's picks quoted from OWNER-ASKS.md's answers; the validation run with outcomes; the before/after shots on both browsers (CLAUDE.md § UI changes).

## Decision ledger

Two outlines went to the panel. **Outline A (chosen): surgical, native elements, the repo's idioms, per site.** **Outline B: primitives first.** B adds a `TextButton` and a router-free `TextLink` to `@nulo/design`, a shared ring token, and a `LiveRegion` component, then moves every site onto them.

- **D0, A over B.** Both reviewers chose A for this lane. B widens the design package's public surface before the owner has picked a style; L2 primitives need five or more cases each; `@nulo/design` is router-free, so `TextLink` needs a host wrapper; and B's fixed uppercase 10 px `TextButton` would not draw the mixed-colour 12 px unit switch (Codex). B's case is stronger than first stated (18 ring copies, not 15, and one announcer would fold two timers; Opus), so the close-out records a shared ring and an announcer as a follow-up.
- **D1, native `<button>` and `RouterLink`.** Native elements give Enter and Space (buttons) or Enter (links) and the right semantics with no handler. CLAUDE.md's custom-widget rule applies where no native element can sit.
- **D2, the press across the swap.** C, revised after round 1: hold the view (`v-if="selectedContact && !holdView"`), not the match, per `pointerId`, with no time fallback. Holding the match left the review sheet's name a tick late and lost a press held over 1 s (Opus, Codex). C fixes every control below the field that the suggestion list does not cover (I6), for mouse and pen, without layout or press-semantic change; it does not cover touch (I2). A changes the page; B fixes Max only. Rejected: `mousedown.prevent` on Max (the swap and the lost press move to the next press elsewhere).
- **D3, per-site rings.** See D0.
- **D4, no `TextLink`.** Two sites; a `RouterLink` with the page's class is enough.
- **D5, the emoji check.** A (a polite region) keeps the safety pin and changes nothing a sighted person sees. B (a focus move to a heading) is the more reliable announcement and keeps the key safety. A title change was rejected: a sighted person sees the window title change.
- **D6, new tokens.** No existing token clears 3:1 on the light page while staying lighter than the light accent fill (recon § Token facts). Changing `--yellow`, `--red` and `--green` would move about 70 uses. Three text tokens and one track token, with dark aliasing today's colours, change only the light pixels the owner signs off.
- **D7, an Arc 3 layer.** Phases 3.1 and 3.2 wait on PRs the lane does not control (#56; #58 stacked on #55). A separate top layer lets Arcs 1 and 2 ship on their own (Opus).
- **D8, the suggestion overlay stays.** The destination's suggestion list covers the token card while it shows (I6). Moving or shrinking it is a layout change no entry names; the plan measures it, limits A's and C's claims to uncovered controls, and says so on the page.
- **Unresolved disagreements.** None between the reviewers on the outline or the fixes. The planner's recommendation on page 2 call 4 moved from A to A+ after Opus raised the homograph warning; the owner decides.

## Audit verdicts

### Round 1

**Codex** (GPT-6.1 Sol, `high`, read-only; session `01a11f8d`): **reject (with blocking findings: option C's press lifecycle, recipient Enter handling, and unreachable keyboard-test targets).**

| # | Sev | Finding | Disposition |
|---|---|---|---|
| 1 | High | Option C's 1 s fallback re-swaps during a long press; the 250 ms suggestion timer still removes a held suggestion; `isPrimary` does not tie one pointer to one press | Accepted: C holds the view per `pointerId`, with no time fallback, and holds the suggestions too; released by that pointer's `pointerup` (after the click), `pointercancel`, window blur, refocus or unmount; tests for a 1.5 s press and a suggestion press |
| 2 | High | `RecipientField`'s document Enter picks a suggestion from any control within 250 ms of the blur, writing `searchTerm` | Accepted as a fact (Fact 4) and a fix (Phase 1.0); the behaviour change is routed to the owner as page 1, call 5 |
| 3 | High | The Send Tab walk expected the fee trigger, which is no Tab stop; the smoke amount field is disabled without a balance | Accepted: the walk asserts today's logged sequence plus the new stops; Max's stop is proven in the funded network spec; the fee picker is page 1, call 6 |
| 4 | Med | Gates and Max's disabled state assumed option A; Phase 1.3 used a spec only Phase 1.1 created | Accepted: the "by answer" table; Max disabled under A and B, stated on the page; the spec is created by whichever Arc 1 phase runs first; 1.3's reproduction is independent |
| 5 | Med | The sponsor region would sit under `v-if="showMethodSelector"` | Accepted: the region sits outside it; one-mount transition tests, including the embedded-payment case |
| 6 | Med | Markup cannot prove "announced once" | Accepted: the plan promises one region update, not one utterance (I4); exact-text tests with the hostile fixture; unmount before the session read. Not adopted: a screen-reader run as a gate (no CI host has one); the decision pages show the accessibility tree |
| 7 | Med | Repeat Enter needs a browser test; Refresh quote needs a genuine scenario; geometry deserves both browsers | Accepted: plain and held Enter in the e2e on both browsers; before/after shots on both browsers. Rejected: a genuine Refresh-quote e2e, since the quote moves only on a 3-minute background refresh or a 15-minute freeze and no seam exists; unit tests cover it |
| 8 | Med | Onboarding selector disagreed (`.tab` vs `.tabActive`); reversed order under-specified; #58 targets #55's branch | Accepted: `.tabActive` only; § Delivery "Reversed order"; Arc 3 waits for #55 and #58 on `dev` |
| F | — | Fact 2 "known decimals" means a numeric `decimals`; Fact 8 ring count incomplete; I2 not universal (touch); I5 seeded row lacks transfer functions | Accepted: Facts 2 and 10 reworded; I2 limited to mouse and pen; I5 names the network fallbacks |
| A | — | Surface the fee picker, Max under B, C's long-press and touch limits, modifier-clicks | Accepted: page 1 call 6; options.md and OWNER-ASKS.md state each |

**Opus 5.5** (Plan agent): **conditional approve (with conditions: correct the Tab order after the amount card; C holds the view, not the match; update the `base.css.test.ts` hash; run the I1 check on Firefox too; fix the sequencing around #56, #58 and #55; put the Refresh-quote focus on the owner page).**

| # | Sev | Finding | Disposition |
|---|---|---|---|
| 1 | High | The fee trigger is no Tab stop | Accepted (as Codex 3) |
| 2 | Med | C held `selectedContact`, so the review sheet's name lagged; the 1 s fallback loses a long press | Accepted: the view hold (D2) |
| 3 | Med | `base.css` is SHA-256-pinned | Accepted: Phases 2.3 and 2.4 update the hash; change map |
| 4 | Med | I1 checked on Chrome only; Firefox's button styles differ; the before-shot was written after the change | Accepted: the PublishStrip reset; shots on both browsers; the shot step is step 1 |
| 5 | Med | #58 targets #55's branch; PR-dependent phases held the arc; merging `dev` into one layer; #56 renames `appearance` | Accepted: Arc 3 layer (D7); `gh stack sync`; options.md notes the rename |
| 6 | Low/Med | Refresh quote's focus loss is an owner call | Accepted: the focus return is part of call 1 on the page |
| 7 | Low | Region placement; the unnamed icon inside an atomic region | Accepted: region outside the conditional; `aria-hidden` on the icon |
| 8 | Low | Onboarding selector | Accepted |
| 9 | Low | Emoji tests: exact text, hostile fixture; B: Enter on the heading | Accepted |
| 10 | Low | RouterLink stubs in shallow mounts; three new spec files duplicate hooks; no pixel-compare command | Accepted: memory router and `RouterLink: false`; extend `tooltips-glossary.test.ts` and `onboarding-tab.test.ts`; `cmp` on shots, and a `resolveColor` equality test for dark status pixels. Kept: a new `home-links.test.ts`, because PR #56 rewrites `rows.test.ts` |
| 11 | Low | Option A on call 1 is an exception to CLAUDE.md § Keyboard | Accepted: Fact 20; OWNER-ASKS.md says so; the close-out amends CLAUDE.md with the answer |
| F | — | 36 files, 51 rules, 18 accent rings; the arcs share `theme-contrast.test.ts`; Fact 16 omitted #58 on #55; I1 unsafe on Firefox; I2 fails for touch | Accepted: Facts 10, 19; § Owner dependencies; I1, I2 |
| A | — | Surface the Refresh focus, C's long-press and touch limits, the review-sheet lag, modifier-clicks, the homograph warning in the announcement | Accepted: call 1 detail; options.md; the lag is gone with the view hold; call 4 offers A and A+ |

### Round 2: the final fresh Codex pass

**Codex** (GPT-6.1 Sol, `high`, new session `01a11fa5`; given the consolidated plan, the decision ledger, the round-1 packet and the full ask packet): **reject (with blocking findings: input-only recipient acceptance is not enforced; option C mishandles ordinary clicks and refocus; validation gates lack fresh smoke builds and consistent retry-zero network runs).** It re-checked every round-1 disposition: eleven carried, five partly carried (each a finding below). It recomputed the principal contrast ratios and found they match. It judged the surgical architecture right and the emoji options sound.

| # | Sev | Finding | Disposition |
|---|---|---|---|
| 1 | High | Phase 1.0 checked "inside the field's root", which also holds `RecipientCard`'s two buttons (`RecipientCard.vue:46-60`); an Enter there within the 250 ms could still pick the first suggestion, which can differ from the blur's exact-address match | Accepted: the target must be the field's own `<input>`; `defaultPrevented` is refused too; a test presses Enter on `recipient-card-change` in the grace period |
| 2 | Med | Replacing the fee trigger's `Flex` with a `<button>` drops its `align`/`justify` layout | Accepted: `<Flex tag="button" type="button">` (`Flex.vue:11,79`) keeps the layout; the test uses the real `Flex`; at-rest shots on both browsers |
| 3 | Med | Smoke runs load a stale `dist/<browser>` (`global-setup-smoke.ts:7-9,36-38`), and network runs retry twice by default (`vitest.e2e.network.config.ts:39`) | Accepted: every gate uses the "smoke run" (build first) and "network run" (`NULO_E2E_RETRY=0`) command groups defined above the phases |
| 4 | Med | Option C closed the suggestions on any recorded press's release, so a click inside the focused input hid them; a refocus during a hold left the card replacing the input; a stale release could end a newer hold | Accepted: record and hold are separate steps; a hold token voids stale releases; a refocus cancels the hold and clears the blur's match; tests for each, and for `selectedContact.address === searchTerm` after release |
| 5 | Med | Fallbacks not wired into gates: funded Max on Firefox; Max's Tab path ignored the unit switch; "View all" fallback unnamed; Phase 2.1 B deleted before testing | Accepted: Firefox network runs; Tab past the toggle when it renders; `home-cap.test.ts` named with its commands; B writes the absence test first |
| 6 | Med | Refresh quote's tests never drove the real requote; the price client's `onQuotesUpdated` is a unit-level seam | Accepted: one `send.test.ts` case with the real `AmountCard` drives a moved quote, the press, the unmount and the focus; the e2e limitation is stated as one |
| 7 | Med | Owner-facing text overstated safety: not every send opens the review sheet (`send.vue:426`); C's "the address sent never changes" ignored call 5 "as is"; call 2 "as is" would leave new stops ringless, against the quality bar | Accepted: call 5 says not every send is reviewed; C says the wait itself never changes the destination and points at call 5; call 2 "as is" gives new stops the browser's ring, defined on the page so every answer is buildable |

**Codex, resumed (same session) on the fixes:** **conditional approve (with conditions: invalidate earlier suggestion-close timers on refocus and hold entry; scope smoke runs to the freshly built bundle; synchronize options.md's recipient guard).**

| # | Sev | Finding | Disposition |
|---|---|---|---|
| 8 | Med | Option C stopped starting the 250 ms timer during a hold but left one from an earlier blur running (`RecipientField.vue:51`): blur, refocus and a held suggestion press within 250 ms lose the suggestion | Accepted: the field keeps the timer's handle and clears it on hold entry and on `@focus`; a test runs that sequence |
| 9 | Med | An inherited `EXTENSION_PATH` outranks `dist/<browser>` in smoke setup | Accepted: the smoke run unsets it |
| 10 | Low | options.md still described the rejected "inside the field" guard | Accepted: the field's own input, `defaultPrevented`, the card's buttons named |

**Codex, resumed on those three:** **approve.**

## Post-implementation

This section is self-contained; the implementing session follows it without the blueprint skill.

**Per arc, at the arc boundary** (the arc's last phase gate passed, before `gh stack add` opens the next layer):

1. No `/code-review`: `code_review` is `off`.
2. **Codex audit.** Write a prompt file under `~/.cache/nulo-backlog/accessibility-1/` holding: the arc's diff (`git diff <arc base>...HEAD`), this plan.md, the decision ledger, the arc map ("this is arc N of 3; arc 1 is Send, arc 2 Home links, rings and two contrast fixes, arc 3 titles and the emoji check"), the adversarial ask ("What could go wrong? What would an attacker target? What are we trusting that we shouldn't?"), and these two rules, verbatim:
   - *"Report bugs and small, targeted improvements only. Do not propose speculative abstractions, extra configuration surface, new layers, or rewrites — the smallest change that fixes each real problem. If code works and is clear, leave it alone."*
   - *"Audit the comments for value per character. Flag any comment that narrates what the code visibly does, restates its line, references implementation plans / phases / reviews, or spends a paragraph where a sentence works — and flag places where a non-obvious invariant or constraint deserves a comment it doesn't have. Comments are permanent context every future reader, human or LLM, pays to re-read: they must be few, dense, and exact."*
   Run `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`. On a quota or 401 error, retry once with `CODEX_ACCOUNT=alejo-icloud`; if that fails, log the failed consult in `lessons/phase-N.md` and continue on your own judgment within this plan's scope.
3. **Fix loop.** Check each finding against the code first. Apply the accepted fixes, commit them, and log the round (finding, verdict, reason) in `lessons/phase-N.md`. Resume the same session with `resume-codex.sh` and the fix diff. Repeat until a round brings no new material finding. After three rounds that still bring material findings, stop and report to the orchestrator.

**After every arc:** one **final cross-arc pass**: a fresh Codex session (`run-codex.sh`, not a resume) over `git diff origin/dev...HEAD`, asking for seams between the arcs, duplication across them and drift from this plan, with the same two rules. Same loop, same three-round stop.

**Delivery** (the first time any PR opens): `gh stack init --adopt worktree-accessibility-1` (base `dev`); `gh stack add <next layer>` at each arc boundary per § Delivery; then `gh stack sync`, `gh stack submit --auto`, and `gh pr edit` each body per § Delivery; then `gh pr checks --watch` on each.

**Close-out** (the top layer, `gh stack add accessibility-1-close-out`, docs only):
1. `gh stack sync`; read what changed on `dev` in `implementations-plan/index.md`, `lessons.md` and `follow-ups.md` (never a union merge).
2. Write `## Outcome` directly after the front matter: date, status, what shipped with PR numbers, each call's answer, what was dropped and why, and the line "The `/goal` and `/loop` seeds below are retired."
3. Promote the generalizable gotchas to `implementations-plan/lessons.md` (one line each, linked, under 8 KiB; dedupe, retire, date tool versions).
4. Delete from `follow-ups.md` every entry this plan resolved. Add the out-of-scope items (§ Scope), a shared focus ring and announcer, and any entry whose call was "as is".
5. If page 1 call 1 was answered, amend CLAUDE.md § Keyboard & focus order with that answer (Fact 20).
6. Delete `STATUS.md`.
7. In its own commit: `git mv implementations-plan/accessibility-1 implementations-plan/archive/accessibility-1`, repair the relative links the extra level breaks (`git grep -n accessibility-1`), and move the index line to `archive/index.md`.
8. Run `bun run check:plans`; push with `gh stack submit --auto`; report and wait. Merging is the orchestrator's.

**Teardown after the merge** (standing authorization; do not ask): once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/accessibility-1/plan.md` succeeds, run `agent-worktree done accessibility-1 --merged --trunk dev` from outside the worktree. On a refusal, relay its output and stop; never force. A `/loop` session checks this on every firing; a `/goal` session arms one background wait after its wrap-up: `until git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/accessibility-1/plan.md; do sleep 300; done`.

## Seeds (draft until approval)

**Recommended: `/goal`.**

```
/goal Every phase of implementations-plan/accessibility-1/plan.md that the owner's answers keep is marked ✓ in plan.md, each backed by its validation gate reported passing in the transcript; for each phase the agent printed LESSONS_FILE=implementations-plan/accessibility-1/lessons/phase-N.md; /code-review was NOT run (code_review: off); the Codex fix loop (gpt-6.1-sol, high) converged for each arc at its boundary and for the final cross-arc pass, each shown by a resumed pass reporting no new material findings, quoted in the transcript; the gh stack (the layers in plan.md § Delivery, close-out on top) exists on GitHub, opened only after the loops converged (gh stack view in the transcript), with the close-out's archive-move commit shown by git show --stat; bun run test and bun run lint both exit 0 in the transcript.
```

**Fallback: `/loop`.**

```
/loop 15m Drive implementations-plan/accessibility-1 forward. Never idle. Each firing: (1) Read plan.md, OWNER-ASKS.md's answers and lessons/ (the authoritative state). If implementations-plan/accessibility-1 is gone and `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/accessibility-1/plan.md` succeeds, run `agent-worktree done accessibility-1 --merged --trunk dev`, report its output, clear this loop and stop; if it fails, babysit the stack's CI only. (2) Waiting on CI is fine; watch a run for up to 10 minutes. (3) No task in hand: take the next pending phase whose call is answered and whose PR condition holds; write its failing test, then the fix; run the fast layers after each edit; commit. (4) Stuck or facing a decision: consult Codex (run-codex.sh, high, gpt-6.1-sol) and log the verdict in lessons; anything a person would see or notice goes to OWNER-ASKS.md, never decided here. (5) Same step failed 3 times: stop and report ARC_FAILED. (6) Phase gate green: mark ✓, print LESSONS_FILE=..., and at an arc boundary run the Codex fix loop before gh stack add. (7) All phases ✓: final cross-arc pass, then Delivery and close-out per plan.md; report and stop. Never merge, never push to main, never force-push.
```
