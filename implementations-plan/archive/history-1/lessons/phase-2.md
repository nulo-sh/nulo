# Phase 2: a failed estimate's state and retry

- Red before, on the base code with the new tests: both `send.integration.test.ts` cases failed at the `fee-estimate-failed` lookup (`expected false to be true`; `Cannot call text on an empty DOMWrapper`). The I1 pin ("a balance read that recovers after a failed estimate asks the estimate again, with the sponsor paying throughout") passed on the base, as planned.
- The row's whole text is `You payCouldn't estimate fee.Try again`: Vue drops the template whitespace between the spans and the button; the flex gap spaces them on screen.
- A keyboard-focus case in `send.integration.test.ts` could not hold: that harness stubs `Flex` as a `div`, so the trigger takes no focus (`document.activeElement` stayed `body`). Moved to `FeeMethodSelector.test.ts` with the real `Flex` and to `FeeSettingsCard.test.ts` with its stubs (D13).
- Gate: lint 0, `typecheck:all` 0; Send, the send modules, `fee-cards`, the popups, the execute window and the four UI bans: 72 files, 1631 tests green at retry 0; `fee-race.composition.test.ts` 24 green.
