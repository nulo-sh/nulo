# Phase 1: Arc 1, Send keyboard reach

Each attempt and measurement of the arc, in order.

## Base-build runs (the reds, before any product change)

- One fresh base build per browser (product source at the plan commit, the new tests in place), then `send-keyboard.test.ts` at retry 0. Chrome and Firefox agree:
  - the Enter test fails: a Tab then Enter after typing "Acc" set the destination to the account's address (the suggestion pick);
  - the token card's focused outline reads `auto 1px 0px`, the browser's own ring;
  - Tab never reaches the unit switch or the fee method picker.
- Tab sequence on smoke Send with a priced, seeded token (blocked transfer: no send-type card, no strip), Chrome: `account-avatar-btn → account-selector → account-address-copy → network-button → header-lock → subpage-back → send-destination-field → send-token-trigger → BODY`. Firefox adds a `DIV` stop before `subpage-back` (an overflowing scroll area is a Tab stop there, `FIREFOX.md`) and stops on `send-token-trigger` twice in one lap.
- The open suggestion list (the profile's own address typed, focus kept): covers the token card's centre (`SPAN`, the suggestion row), leaves Max and the fee method picker uncovered, on both browsers. Phase 1.3 claims its fix for those two (plan I6); a press on the token card while the list is open picks the suggestion, as before.
- I5 holds on smoke: `seedTokenRow` + `seedUsdQuoteAndReload` render the unit switch on Send, so the unit-switch e2e stays in the smoke spec; the amount field and Max are disabled there (no balance).

## Phase 1.0

- Red: three of the four new `RecipientField.test.ts` cases (another control, the card's button, the repeat/composing/handled Enter) failed on the base code; the field's own Enter passed.
- Fix: `onKeydown` returns unless Enter, not `defaultPrevented`, not repeat or composing, and the target is an `<input>` inside the field. Green; gate passed on both browsers.

## Phase 1.1

- Red: the four new `AmountCard.test.ts` cases and the three `send.test.ts` Refresh-quote cases failed on the base code; on base the keyboard case failed at `focusAmount` (never called), the real-card case at the focus (it fell to `body`).
- Chrome's first Tab after `actions-send` can land past the token card (the sequential focus starting point is the clicked spot, not the page top), so the spec reaches the token card with `tabTo` and then asserts the one next stop, never a walk from the top.
- At-rest shots (`send-at-rest`, both themes, both browsers), base build vs the change: `cmp` differs, a pixel diff finds every change inside the header's account address (x 84-160, y 36-45; a fresh profile per run), none in the amount card. Verdict: the buttons draw today's pixels at rest (I1 holds on both browsers).
- The unit switch's ring is drawn around its whole box, which the strut makes the amount line's height: a tall ring beside the amount (shot `send-toggle-focused`). That is the press target the card already had.
- Network `send-amount-exact.test.ts`, retry 0: the unreadable-paste step now reaches Max by Tab from the field and fills it with Enter; green on Chrome (159 s) and Firefox.

## Phase 1.2

- Red: the source-rule test in `SelectTokenCard.test.ts` failed; the six 3:1 rows (accent on `--app-bg`, `--nulo-surface-low`, `--nulo-surface-high`, both themes) passed from the start, as recon's ratios said (lowest 4.64:1).
- Firefox's first shot caught the ring mid-transition: the card's `transition: all` (the same one `Button` has) brings the outline in over 0.2 s, from the text colour at offset 0 to the accent at -2px. The computed style read afterwards was final, so the assertion passed while the picture lied. `focusRing` now waits for the focused element's transitions to finish before reading, and the spec shoots after the ring check. The transition itself stays: it is the wallet's buttons' own behaviour.

## Phase 1.3

- Reproduction first, on the build carrying Phases 1.0-1.2: `send-amount-exact.test.ts` with the workaround removed (the destination keeps the focus, then a `pointerClick` on Max) failed on Chrome: "the amount field reads 1,234,567.123456789012345678, not 1,235,567.123456789012345678". `pointerClick` did not throw, so the open suggestion list leaves Max's centre uncovered in the funded layout too.
- Coverage (smoke, both browsers, the profile's own address typed): the list covers the token card's centre and leaves Max and the fee method picker uncovered. Phase 1.3's fix is claimed for those two, and for any control further down.
- Option C built with one deviation in mechanism, not behaviour: a queued release is voided by clearing its timer handle (on refocus, on a new hold, on unmount) instead of a hold token. Same guarantee, one less piece of state; the "earlier release cannot end a newer hold" test covers it.
- Added `data-testid="send-destination-suggestions"` on the suggestion list, so the coverage probe asserts the list is open (its success control) instead of inferring it from what covers the token card. No visible change.
- Green: unit (ten new cases), smoke on both browsers, network `send-amount-exact.test.ts` on Chrome and Firefox at retry 0, including a 1.5 s press on Max while the destination holds the focus. On Firefox the held press's card appeared at release, so the field did blur there and the hold was exercised.

## Phase 1.4

- Red: the two new `FeeSettingsCard.test.ts` cases (the region on a Send card, the region on an embedded-payment card) failed; network `fee-sponsor-funding.test.ts` on a build with today's card failed at "the notice's parent is `fee-sponsor-live`" (it was the card).
- The embedded case is reached as a person would: an embedded card, "Override with my method", a short verdict (the notice shows in the region), then "Use app's payment". `handleUseEmbedded` keeps the verdict, so `data-sponsor-funding` still reads `short` while the notice is hidden: the "no notice when embedded" assertion is not vacuous.
- Shots of the card with the notice, base build vs the change, Chrome, both themes: every differing pixel is in the header's account address; the card draws the same pixels.
- Chrome's accessibility tree: before, the sentence is a plain `StaticText` with no live ancestor; after, a `status` node with `live=polite` holds it and the info icon is out of the tree.
