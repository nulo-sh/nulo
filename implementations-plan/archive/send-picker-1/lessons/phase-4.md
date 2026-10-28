# Phase 4: end to end

- `clickByTestId` clicks through `element.click()`, which moves no focus, so a popup opened that way has nothing to hand focus back to. S1 and N1 open the picker from the focused token card with Enter, which is what makes the focus-return assertions mean anything.
- A popup's leave transition keeps it in the DOM for a moment after focus has already returned: N1 waits for the picker's search field to go rather than reading it once.
- `token-list.test.ts`'s flagged case went red on Firefox in 2 of 5 runs. The dump at the failure read "YOUR TOKENS 1 / 1 EMPTY", and the folded row read 0 / 0. The seeded SCAM token named transfer functions only, and the balance projector fills a side with no `balanceOf` function with "0" without asking any node, so the refusal the spec arms could not hold the seed. The old picker listed empty rows, which hid it. The seed now names both balance functions (e2e-testing ledger row 66).
- Measured: S1 15.8 s / 18.8 s against an estimate of 14 s / 18 s; N1's new test 18.0 s / 19.8 s against 50 s / 60 s: the PICK deploy is one public mint, faster than estimated.
- Captures (both themes): `send-picker-list` and `send-amount-zero` from N1 on Chrome, `send-picker-add` and `send-picker-flagged` from S1 on Chrome.

## Review loop

- Codex round 1 (whole diff): conditional, one finding (a hand pick during the import's re-read was overridden); fixed and red-proven. Opus beside it: conditional, three fixes (a malformed stored side reaching `BigInt` in the corner, a picker assertion that could not fail, D4's residual worded too narrowly) and one owner ask (From/To after the import). Round 2: approve. Round 3: conditional, a stored-decimals guard for the corner and eleven comment edits, all applied.
- The review standard requires its two rules and the adversarial ask verbatim in every prompt, first and resumed. Rounds 1 and 2 omitted them, so the comment audit only ran in round 3, the last one the cap allows: paste them in from the start.
- Drawing a zero the corner used to hide put two stored values on the render path that the float gate used to hide: a side that is no digit string and decimals outside 0..77. A render path that newly shows a value must pass it through `utils/token-amount.ts`'s parsers.
