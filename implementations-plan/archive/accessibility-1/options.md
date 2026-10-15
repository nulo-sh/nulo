# Options: accessibility-1

The owner picks from these. Each option lists the exact component changes, the copy (none of the options writes new copy; two reuse words the screen already shows), the `data-testid`s it adds, a `UI impact` line, and the e2e hook a later agent uses to build it as a throwaway commit and shoot it on Chrome and on Firefox (`NULO_E2E_BROWSER=firefox`), in both themes, with the focus visible. Paths are repo-relative. Existing testids stay as they are (CLAUDE.md § testid preservation). Ratios come from `contrast()` in `packages/design/src/theme-contrast.ts`.

## Shared shooting notes

- **Screenshot helper.** `shotSend(page, name, focus)` (`apps/extension/tests/e2e/fixtures/send-page.ts:221-247`) works on any extension page. It does nothing unless `NULO_E2E_SHOT_DIR` is set (create the directory first). It writes `<name>.png` in the current theme, flips `<html theme>`, waits for the colour transitions, and writes `<name>-<other theme>.png`. `focus` is a testid it scrolls into view; it never moves the keyboard focus, so a focused control stays focused in both shots.
- **Focus must be visible.** Chrome draws `:focus-visible` after keyboard use. Reach the control with real Tab presses: loop `page.keyboard.press("Tab")` until `activeTestId(page) === "<testid>"` (`apps/extension/tests/e2e/helpers/pointer-probes.ts:24`), at most 40 presses. Do not click the page between the Tab walk and the shot.
- **"As is" shots.** Shoot the same state on `dev` (no throwaway change) so each option sits beside today's screen. Where today's control cannot take the focus, shoot it at rest and say so in the caption.
- **No visible change.** For options that change only what a screen reader hears, add the accessibility tree beside the shot: `await page.accessibility.snapshot({ root: await page.$('[data-testid="<testid>"]') })`, printed as JSON.
- **Runs.** Smoke: `cd apps/extension && NULO_E2E_SHOT_DIR=<dir> bun run test:e2e -- tests/e2e/<file>.test.ts --retry=0`. Network: from the worktree root, `NULO_E2E_SHOT_DIR=<dir> NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/<file>.test.ts`. Never two `e2e:agent` runs in one worktree at once.
- **Seeds (smoke).** `readActivityScope`, `seedTokenRow`, `seedTransaction` (`apps/extension/tests/e2e/helpers/activity-seeds.ts`) and `seedUsdQuoteAndReload` (`apps/extension/tests/e2e/fixtures/helpers.ts:1046`) give a priced testnet token and activity rows on the `registeredExtensionPerTest` fixture.

---

# Page 1: Send

## Surface 1.1: the unit switch, Max and Refresh quote (call 1)

Files: `apps/extension/src/components/composite/send/AmountCard.vue` (unit switch `send-amount-fiat-toggle` at `:413-423`, Max `send-amount-max` at `:443`), `apps/extension/src/popup/pages/send.vue` (Refresh quote `send-fiat-requote` at `:746`).

**Today.** All three are `<span>`s with a click handler. Tab skips them; Enter and Space do nothing. The unit switch shows only for a priced token; Refresh quote shows only while a USD amount's quote has gone stale or moved.

### Option A: in the Tab path

- The unit switch and Max become `<button type="button">`; Refresh quote becomes `<button type="button">`. Every class, testid, `title` and click handler stays.
- Tab order after the amount field: unit switch, Max, Refresh quote (when shown), then whatever follows today (the fee method picker is no Tab stop today; call 6).
- Enter or Space presses each. A held Enter on the unit switch flips it once, not repeatedly (`refuseRepeatEnter`).
- Max is disabled while the selected side has no balance. It then leaves the Tab path. Its colour does not change.
- Refresh quote disappears once pressed. The focus then returns to the amount field, so a keyboard user keeps their place instead of starting again from the top of the page.
- What a screen reader hears: "USDC slash USD, button, Type in USD" on the unit switch (its visible text, then its existing tooltip); "Max, button" (or "dimmed" with no balance); "Refresh quote, button".
- Each button's look at rest is reset to today's span: `font: inherit; color: inherit; background: none;` (the `PublishStrip.vue:47-51` idiom), written before the class's own font and colour rules. The shots on both browsers prove the pixels match.
- This puts two in-field controls in the Tab path, an exception to CLAUDE.md § Keyboard & focus order (in-field controls at `tabindex="-1"`). The close-out records the owner's answer there.
- **New testids:** none.
- **UI impact:** at rest, no change. With the keyboard, three more stops on Send, each showing call 2's focus style.

### Option B: out of the Tab path, as in-field controls

- The same `<button>`s, but the unit switch and Max carry `tabindex="-1"`. Max is disabled with no balance, as in A. After a keyboard press on Refresh quote the focus returns to the amount field, as in A. They stay pressable by mouse and by a screen reader's own cursor. Refresh quote stays in the Tab path: it sits under the card, between no two fields.
- A keyboard-only person still cannot switch to USD or press Max. This is the trade CLAUDE.md § Keyboard & focus order records for the show/hide-password button.
- **New testids:** none.
- **UI impact:** at rest, no change. With the keyboard, one more stop (Refresh quote, only when it shows).

### Screenshot hook

- **Unit switch focused (smoke).** Throwaway spec on `registeredExtensionPerTest`: `const scope = await readActivityScope(page)`, `await seedTokenRow(page, scope, 1)`, `await seedUsdQuoteAndReload(page)`, `await clickByTestId(page, "actions-send")`, wait for `send-amount-fiat-toggle`. Tab until `send-amount-fiat-toggle` is active, then `shotSend(page, "p1-c1-toggle-<option>", "send-amount-row")`. For B, Tab skips it: shoot the Tab stop that follows the token card instead.
- **Max focused (network).** In `tests/e2e/network/send-amount-exact.test.ts`, after the balance row lands and `send-amount-input` is enabled, Tab from `send-amount-input` until `send-amount-max` is active; `shotSend(page, "p1-c1-max-<option>", "send-amount-row")`.
- **Refresh quote focused.** No spec reaches it. In the throwaway commit only, change `fiatNeedsRequote` in `send.vue:279` to `computed(() => fiatMode.value)`. In the smoke spec above, press Enter on the focused unit switch, Tab until `send-fiat-requote` is active, shoot with focus `send-fiat-requote`.

## Surface 1.2: how focus shows on Send's controls (call 2)

Files: the three controls above, and `apps/extension/src/popup/components/modules/send/SelectTokenCard.vue` (`send-token-trigger`, a `role="button"` row with `tabindex="0"`).

**Today.** The token card shows the browser's own ring (Chrome: a thin dark and white double ring; Firefox: a dotted or blue ring). The three controls cannot take the focus.

### Option A: a designed ring

- Unit switch, Max, Refresh quote: `:focus-visible { outline: 2px solid var(--nulo-accent); outline-offset: 2px; }`, the same ring as `Button` and the publish strip.
- Token card: `.wrapper:focus-visible { outline: 2px solid var(--nulo-accent); outline-offset: -2px; background: color-mix(in srgb, var(--nulo-surface-low) 50%, transparent); }`: the ring sits inside the row's edge, over the hover tint, as on the activity rows.
- Ring contrast: dark 17.74:1 on `--app-bg`, 15.30:1 on `--nulo-surface-low`; light 5.36:1 and 5.08:1. WCAG asks 3:1.
- The ring shows for the keyboard only, never on a mouse press (`:focus-visible`).
- **New testids:** none.
- **UI impact:** a 2 px accent ring on the focused control.

### Option B: the browser's own ring

- Unit switch, Max, Refresh quote: `:focus-visible { outline: revert; }`, which undoes `base.css`'s `button { outline: none; }` for these three only.
- Token card: unchanged.
- The ring then differs between Chrome and Firefox, and between platforms.
- **New testids:** none.
- **UI impact:** the browser's default ring on the focused control.

### Option: as is

- The token card keeps the browser's ring. A new Tab stop from calls 1 or 6 cannot keep today's "no ring" (it has never held the focus), so it gets the browser's ring, as in B: no answer leaves a focused control with nothing drawn.

### Screenshot hook

The surface 1.1 hooks, plus: Tab until `send-token-trigger` is active, `shotSend(page, "p1-c2-token-<option>", "send-token-trigger")`. Shoot each option on Chrome; add one Firefox shot of option B so the page shows the difference.

## Surface 1.3: a press below the destination while it holds the focus (call 3)

File: `apps/extension/src/popup/components/modules/send/RecipientField.vue`.

**Today.** Type or paste an address that belongs to one of your accounts or contacts. While the destination field still holds the focus, press Max (or the unit switch, Refresh quote, a fee control). The press takes the focus from the field, and the field turns into the account's card, about 22 px taller. Everything below moves down before the button comes up, so the press lands nowhere and nothing happens. A second press works.

While the field holds the focus, its suggestion list (one row per match, up to 160 px) is drawn over what lies below, the token card first. A press on the list picks that suggestion, today and under every option below; the options only change presses on controls the list leaves uncovered. Phase 1.3 measures which those are (plan I6).

### Option A: the destination keeps the card's height

- `.recipient_wrap` gets `min-height` equal to `RecipientCard`'s height (about 65 px).
- The empty or typed field draws about 22 px of space under its line, so nothing below moves when the card appears.
- For a mouse, pen or finger: every first press on an uncovered control below the field works; the page no longer jumps; Send's top section is about 22 px taller while the field is empty or typed.
- **New testids:** none.
- **UI impact:** the empty destination row is about 22 px taller; the rest of the page moves down by that much.

### Option B: Max acts when it is pressed, not when it is released

- Max gets `@pointerdown` for the primary button (`e.isPrimary && e.button === 0`) and keeps `@click` for the keyboard. Both write the same amount, so a press that runs both changes nothing twice.
- For a mouse user: Max fills the amount at the press. A press that starts on Max and slides off still fills it. The unit switch, the token card and Refresh quote still lose their first press in this situation, and the page still jumps.
- **New testids:** none.
- **UI impact:** none at rest; Max reacts on the press.

### Option C: the field waits for the press to end before it turns into the card

- When the field loses the focus to a mouse or pen press (primary button), it keeps showing the typed address, and keeps its suggestions, until that press ends, however long it is held; then it turns into the card. The match itself is made at the blur as today, so the review sheet names the account at once. A right-button press, a keyboard Tab or a script blur turns it into the card at once, as today.
- For a mouse or pen user: every first press on an uncovered control below the field works. The card appears when the button comes up, not when it goes down, and the page then moves by 22 px as today.
- A finger is not covered: a touch screen moves the focus only after the finger lifts, so the press may still be lost there. The wallet's popup is a desktop surface; the gap is stated, not fixed.
- The hold itself never writes the destination: Send reads the typed text, which the hold does not touch, and the match is written at the blur as today. A refocus of the field during a hold cancels it and leaves the field editable.
- With call 5 left "as is", the held suggestions keep today's Enter fault live for the length of the press.
- **New testids:** none.
- **UI impact:** none at rest; the card appears at the end of the press.

### Screenshot hook

A two-frame sequence on the network spec `tests/e2e/network/send-amount-exact.test.ts` (it has a balance, so Max acts). Type `tokenReadyExtension.accountAddress` into `send-destination-field`, keep the focus there. Move the mouse to Max's centre, `page.mouse.down()`, shoot `p1-c3-<option>-down`; `page.mouse.up()`, wait 300 ms, shoot `p1-c3-<option>-up`. Today, frame 1 shows the card in place and Max moved; frame 2 shows an empty amount. Option A also gets one shot of the empty destination at rest (smoke Send is enough).

## Surface 1.4: the sponsor notice (call 4)

File: `apps/extension/src/popup/components/modules/send/FeeSettingsCard.vue` (`fee-sponsor-short`, `:925-930`). The card is shared, so the dApp approval windows' fee card gets the same change.

**Today.** When the wallet finds the sponsor cannot pay, the line "The sponsor can't cover this fee right now, so <method> pays it." appears. A screen reader is not told.

### Option A: a polite live region

- A region (`role="status" aria-live="polite" aria-atomic="true"`) stays mounted in the card from its first render, outside the method selector's condition, so a dApp's embedded payment card has it too. It is empty while the notice is hidden and takes no space. The notice row moves inside it; the row's icon is hidden from screen readers, so only the sentence is read.
- What a screen reader hears: the notice's sentence at the next pause when it appears, and again if the paying method changes; nothing when it goes away. How often a screen reader repeats a region's text is its own choice; the wallet updates the region once per change.
- **New testids:** `fee-sponsor-live` (the region).
- **UI impact:** none.

### Option: as is

### Screenshot hook

`tests/e2e/network/fee-sponsor-funding.test.ts` reaches the notice (`:53`, `:172`). Shoot `shotSend(page, "p1-c4-<option>", "fee-sponsor-short")` and print the accessibility snapshot of `fee-settings-card`: option A shows a `status` node holding the sentence.

## Surface 1.5: an Enter elsewhere picks a contact suggestion (call 5)

File: `apps/extension/src/popup/components/modules/send/RecipientField.vue` (`onKeydown`, `:64-77`).

**Today.** The field listens for Enter on the whole page. While its suggestions show (the field is focused, or left it less than 250 ms ago), an Enter pressed anywhere picks the first suggestion, writes its address as the destination and takes the focus away. A person who types part of a name, Tabs on and presses Enter quickly can send to the first matching contact without picking it.

### Option A: only the field's own Enter picks

- The listener acts only for an Enter whose target is the field's own input, and refuses a held, composing or already-handled Enter (`isRepeatOrComposing`, `defaultPrevented`). The field's account card has two buttons of its own (reveal and change); an Enter on them no longer picks a suggestion either.
- In normal use nothing changes: Enter in the field still picks the first suggestion.
- **New testids:** none.
- **UI impact:** none in normal use; the fast Tab-then-Enter no longer changes the destination.

### Option: as is

### Screenshot hook

None: nothing visible changes. The page shows the e2e's two outcomes as text (the destination before and after a fast Tab-then-Enter, on `dev` and with the fix).

## Surface 1.6: the fee method picker by keyboard (call 6)

Files: `apps/extension/src/popup/components/modules/send/FeeMethodSelector.vue` (`send-fee-method-trigger`, `:46-56`), shown in the fee card on Send and in the dApp approval windows.

**Today.** The picker that chooses how the fee is paid opens only by mouse. Its trigger is not a Tab stop (`DropdownRoot.vue:268` wraps it in a `div @click`), so a keyboard-only person cannot change the fee method. Once open, the menu already answers the arrow keys, Enter and Escape.

### Option A: make the trigger a button

- The trigger's content sits in a `<button type="button">` with the same testid, `data-fee-method`, class and content, reset to today's look (`font: inherit; color: inherit; background: none`).
- Tab reaches it after the controls above it; Enter or Space opens the menu; the arrows move through the methods; Enter picks; Escape closes and leaves the focus on the trigger.
- Focus shows with call 2's style.
- **New testids:** none.
- **UI impact:** one more Tab stop on Send and in the approval windows; at rest, no change.

### Option B: leave it for a follow-up

- Recorded in `implementations-plan/follow-ups.md` at close-out.

### Screenshot hook

Smoke Send (the surface 1.1 spec): Tab until `send-fee-method-trigger` is active, `shotSend(page, "p1-c6-trigger-<option>", "send-fee-method-trigger")`; press Enter, shoot `p1-c6-open-<option>` with the menu open.

---

# Page 2: Home and shared chrome

## Surface 2.1: Home's two view links (call 1)

Files: `apps/extension/src/popup/components/modules/general/RecentActivityView.vue` ("View history", `activity-view-all`, `:765`), `apps/extension/src/popup/components/modules/general/TokensView.vue` ("View all", `tokens-view-all`, `:376-381`, only past Home's three-row cap). The token page's recent activity has the same "View history".

**Today.** Two small grey links (`--nulo-outline`: 2.12:1 dark, 1.58:1 light) that Tab skips. The nav bar's History and Holdings tabs open the same pages.

### Option A: real links in a readable colour

- Each becomes `<RouterLink to="/popup/activity">` or `<RouterLink to="/popup/holdings">`, with the same class and testid.
- Colour at rest: `--nulo-secondary`, the drawing's link colour: 6.40:1 dark, 5.30:1 light. Hover: the accent, as today.
- Focus: `outline: 2px solid var(--nulo-accent); outline-offset: 2px`.
- Tab order: "View all", then the "⋯" menu, then the token rows; later "View history", then the activity rows. Enter opens the page.
- A Ctrl- or middle-click opens the page in a new tab, as the token rows already do.
- **New testids:** none.
- **UI impact:** both links read darker (light) or lighter (dark); two more Tab stops on Home.

### Option B: remove both links

- Delete both elements and their styles. History and Holdings stay one press away on the nav bar.
- `tests/e2e/network/home-cap.test.ts:52` opens Holdings through the nav tab instead.
- **New testids:** none.
- **UI impact:** the "Recent activity" header shows only its label; the Holdings header shows its title and "⋯".

### Screenshot hook

- **View history (smoke).** The `apps/extension/tests/e2e/rows.test.ts:585-607` pattern: seed three transactions and a receipt, `seedUsdQuoteAndReload`, back on Home. A: Tab until `activity-view-all` is active, `shotSend(page, "p2-c1-history-a", "activity-view-all")`. B and as is: shoot at rest.
- **View all.** Seed the four testnet default tokens as rows (`seedsForChain` in `apps/extension/src/wallet/services/token/default-tokens.ts`; adapt `seedTokenRow` to take a seed). If that does not draw "View all", use `tests/e2e/network/home-cap.test.ts` (`extraTokensFixture`). Tab until `tokens-view-all` is active and shoot.

## Surface 2.2: two focus rings that do not show (call 2)

Files: `packages/design/src/ui/SubPageHeaderBase.vue` (the back arrow `subpage-back`, on every page built on `SubPageHeader` or `CollapsingHeroLayout`), `apps/extension/src/onboarding/pages/create.vue` (the method tabs `onboarding-method-password`, `onboarding-method-passkey`).

**Today.** The back arrow shows nothing when it holds the focus. On onboarding's create page, the focused method tab is always the filled one, and its accent ring is drawn on the accent fill, so it does not show.

### Option A: one ring on each

- **Back arrow:** `.back_btn:focus-visible { outline: 2px solid var(--nulo-accent); outline-offset: -2px; }`, a ring inside the 40 px box, as on the row icon buttons. 17.74:1 dark, 5.36:1 light on `--app-bg`.
- **Onboarding tab:** `.tabActive:focus-visible { outline: 2px solid var(--app-bg); outline-offset: -5px; }`, a ring in the page's own colour, 3 px inside the filled tab's edge. 17.74:1 dark, 5.36:1 light against the fill. The ring for an unfilled tab stays as it is (it never holds the focus).
- **New testids:** none.
- **UI impact:** a ring on the focused back arrow on every sub-page; a page-coloured ring inside the focused method tab.

### Option: as is

### Screenshot hook

- **Back arrow (smoke).** `navigateToSettings(page, "glossary")` (as `tests/e2e/tooltips-glossary.test.ts:109-124`), Tab until `subpage-back` is active, `shotSend(page, "p2-c2-back-<option>", "subpage-back")`.
- **Onboarding tab (smoke).** `freshExtensionPerTest`, `openOnboarding(ctx)`, `clickByTestId(page, "onboarding-welcome-create")`, then the Terms step as `tests/e2e/legal-acceptance.test.ts:53-71` does. Tab until `onboarding-method-password` is active, shoot; press ArrowRight, shoot `onboarding-method-passkey`.

## Surface 2.3: History's and Settings' title, read twice (call 3)

Files: `apps/extension/src/popup/pages/activity.vue:177-179`, `apps/extension/src/popup/pages/settings/index.vue:66-68`.

**Today.** The compact bar that appears when the big title scrolls away is hidden by transparency only. A screen reader reads "HISTORY" (or "SETTINGS") from the bar and again from the big title, whether the bar shows or not.

### Option A: hide the bar from screen readers

- `aria-hidden="true"` on the bar. The big title, a level-1 heading, stays the one a screen reader reads.
- **New testids:** none.
- **UI impact:** none.

### Option: as is

### Screenshot hook

Smoke, `tests/e2e/navigation.test.ts`'s path to History. Print `page.accessibility.snapshot()` for the page before and after: today two "HISTORY" nodes, after one (a heading). No screenshot needed.

## Surface 2.4: the swap to the emoji check (call 4)

File: `apps/extension/src/popup/windows/verify/index.vue`, as open PR #58 leaves it (the copy below is #58's; `dev` still says "Connection verification" and "Always trust") (two buttons, "They don't match" and "They match"; section label "Connection check"; the instruction "Check that the app shows these same emojis in the same order. If they differ, the connection may not be safe. Choose They don't match.").

**Today.** After Allow, the connect window swaps to the emoji check with the same window title. Nothing takes the focus (on purpose: a stray Enter must not answer the check) and nothing is announced.

### Option A: a polite announcement

- A visually hidden region (`role="status" aria-live="polite" aria-atomic="true"`) mounts empty with the check. 300 ms after the emojis appear, it receives "Connection check. " followed by the instruction above, the words the window already shows.
- What a screen reader hears: that sentence at the next pause after the swap. The wallet writes it once; the text is fixed wallet copy and never names the app.
- For a sighted person: nothing changes. Nothing takes the focus.
- **New testids:** `verify-announce`.
- **UI impact:** none.

### Option A+: the same announcement, with the homograph warning

- As A. When the window also shows the warning that the app's address uses non-ASCII or punycoded characters, the announcement adds that warning's sentence, the words the window already shows.
- **New testids:** `verify-announce`.
- **UI impact:** none.

### Option B: move the focus to the check's heading

- The "Connection check" label gets a wrapper with `tabindex="-1"`, described by the instruction. When the emojis appear, the focus moves there. It never lands on a button, and Enter there does nothing.
- What a screen reader hears: "Connection check", then the instruction.
- For a sighted keyboard user: the focus starts at the heading, so the next Tab goes to "Skip this check next time", then the two buttons. If they reached the window by keyboard, the browser may draw a ring around the heading.
- **New testids:** `verify-check-heading`.
- **UI impact:** a possible focus ring on the "Connection check" heading.

### Option: as is

### Screenshot hook

Network `tests/e2e/network/connect-one-window.test.ts`: `approveConnect` returns the window on the grid (`verify-emoji-grid`). A: wait 400 ms, print the accessibility snapshot showing the `status` node's text; shoot at rest. B: press Allow with the keyboard (Tab until `discover-allow-btn` is active, then Enter) so the window is in keyboard mode, then shoot with focus `verify-check-heading`.

## Surface 2.5: the connect step bar's empty half (call 5)

File: `apps/extension/src/popup/windows/ConnectStepBar.vue` (`connect-step-bar`), with a new token in `packages/design/src/token-contract.ts` and `base.css`.

**Today.** On the first step, the bar's second half is drawn in `--nulo-border`: 1.22:1 dark, 1.36:1 light against the page. It barely shows.

### Option A: a visible track colour

- A new token `--nulo-track`: dark `#68625a`, light `#8f8a82`. The empty half uses it.
- Ratios against the page: dark 1.22:1 to 3.30:1; light 1.36:1 to 3.15:1 (WCAG asks 3:1 for a graphic). The filled half stays the accent: against the new empty half, 5.38:1 dark, 1.70:1 light (light also differs by hue).
- No existing token fits: every one that reaches 3:1 on the light page is as dark as the light accent, so the two halves would differ by hue alone.
- **New testids:** none.
- **UI impact:** the empty half of the step bar is clearly visible in both themes.

### Option: as is

### Screenshot hook

Network `tests/e2e/network/connect-one-window.test.ts`, on the connect window before Allow (step 1, second half empty). `shotSend(page, "p2-c5-<option>", "connect-step-bar")`, plus a clip of the bar's top 48 px (`page.screenshot({ clip })`) so the 2 px bar is legible on the page.

## Surface 2.6: the status colours in the light theme (call 6)

File: `apps/extension/src/components/composite/activity/TransactionTerminalCard.vue:71-82` (the status line of an activity row with no settled transaction: "Transaction was interrupted", "Unconfirmed" in amber, a failure in red, a sent check in green), with three new tokens.

**Today.** On the light page: amber 1.56:1, green 2.66:1, red 3.56:1 (text needs 4.5:1). Grey passes at 5.30:1. Dark passes.

### Option A: darker status text in the light theme

- New text tokens: `--txt-warning`, `--txt-danger`, `--txt-success`. Dark aliases today's colours (no dark change). Light: `#7f6200`, `#b3261e`, `#11733d`.

| Colour | Light, on the page | Light, on a hovered or focused row | Light, on a pressed row |
|---|---|---|---|
| Amber | 1.56:1 to 5.28:1 | 1.48:1 to 5.00:1 | 1.35:1 to 4.57:1 |
| Red | 3.56:1 to 6.00:1 | 3.37:1 to 5.68:1 | 3.08:1 to 5.20:1 |
| Green | 2.66:1 to 5.44:1 | 2.52:1 to 5.15:1 | 2.31:1 to 4.71:1 |

- The status icons keep today's colours (they are graphics; recorded as a follow-up).
- **New testids:** none.
- **UI impact:** in the light theme, the amber, red and green status lines read darker.

### Option: as is

### Screenshot hook

- **Storybook (all four colours).** `bun run --cwd apps/extension storybook`, open the `TransactionTerminalCard` stories (gray, amber, red; the throwaway commit adds a green "Sent" story) with `&globals=theme:light` and `&globals=theme:dark`; shoot the canvas.
- **Real wallet (red).** `tests/e2e/network/failed-send-check.test.ts` (needs `NULO_E2E_PROVERLESS=1` and `NULO_E2E_RETRY=0`) leaves a failed row on Home; shoot it with `shotSend`.
- **Real wallet (amber, green), unverified.** A smoke throwaway can write a `nulo:journal@<id>` record into `chrome.storage.local` (stage `failed` with `error.kind` `stuck_proving` for amber). `apps/extension/tests/e2e/fixtures/journal.ts` shows the record shape it reads. If the journal service drops the seeded row, use Storybook only.
