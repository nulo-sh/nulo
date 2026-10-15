# Phase 2: a row for a long derived line (#408)

## Measured first (2026-10-14)

A scratch network spec (never committed) on the base sources, both browsers, read the derived line's computed font size:

| Case | Chrome | Firefox |
|---|---|---|
| send-amount-exact: token-mode Max, then USD, at 1,235,567.123456789012345678 TST | 6.16 px | 6.16 px |
| OA-15's balance (12,345,679,901.123456789012345678 TST), Max in USD | 3.96 px | 3.96 px |
| OA-15's quote (0.999857 USD/TST), a typed $1,234.56 | 5.17 px | 5.17 px |

- I3 holds: the committed case draws below 8 px beside the balance, so it exercises the own row.
- OA-15 recorded 4.6 px and 6 px for its two cases; the base now measures 3.96 px and 5.17 px. The room beside the balance is 93 px at that balance on both browsers; the difference is not this lane's, and the cases still stand for "before".
- After, on the head: all three draw in their own row at 11 px, on one line, and the balance and Max line moves down one line (the shots in `../screenshots/`). A typed $25 at a $1 quote ("≈ 25 TST") stays beside the balance at 11 px (the committed control).

## Gate

- `UNIT AmountCard.test.ts src/utils/`: 1365 passed. The four new cases were red against the base `AmountCard.vue` and green on the head.
- The `hero-ruler` mock reads a room per test id; the Flex stub exposes `wrapper`, as the design package's Flex does.
- `NET send-amount-exact.test.ts`: Chrome 35.7 s (123 s run), Firefox 48.3 s (143 s run), both green at retry 0.
- e2e budget: the USD control step (unit switch, $25, the line read) measured 544 ms on Chrome and 476 ms on Firefox in the same environment; estimate was 3 s. CI before: the file ran 33.2 s (Chrome, run 38530642560) and 31.8 s (Firefox, run 38530642576).
- `SMOKE send-keyboard.test.ts` ran with Phase 3's smoke on the Phase 2 + 3 tree: Chrome 41.5 s, Firefox 69.0 s, green.
