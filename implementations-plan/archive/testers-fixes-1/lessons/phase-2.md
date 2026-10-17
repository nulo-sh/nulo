# Phase 2: the Home hero is display only (#586)

- `BalanceView.vue`: `:onClick` binds `handleTokenBalanceClick` only when `tokenToDisplay` is set, and the `tappable` class carries the pointer cursor the same way; `.balance_amount` lost its `cursor`. The handler returns when `window.getSelection()` is not collapsed, so a drag that selects the token figure (possible once #580 lands) copies nothing; a plain tap still copies.
- Tests (`BalanceView.test.ts`, "the hero's tap"): Home click writes no clipboard and opens no toast; token page click writes `1,250` and toasts "Balance is copied" (the success control); token page click over a selection of the figure (mounted attached, a real `Range`) writes nothing. Against the base component the two never-happens tests fail and the control passes; against the change all three pass.
- `balance-amount` kept (e2e reads it); no testid removed.
