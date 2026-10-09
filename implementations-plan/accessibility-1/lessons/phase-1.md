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
