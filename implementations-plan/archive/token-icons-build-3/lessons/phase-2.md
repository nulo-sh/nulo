# Phases 2 and 3: B2 and B1

- B2's view test first passed against no picture: `TEST_ICONS` holds USDC and GBPC only, so `TEST_ICONS.USDT` read `undefined` and so did the row. `typecheck:all` caught it (TS2339). With GBPC it went red on a fixture bug: a default parameter (`networkId = "net-1"`) turns an explicit `undefined` back into the default, so the "unstamped" record was stamped. Now red on the pre-B2 view, green on the head.
- B1's test red with the mark's class removed (`[false, true, false, false]`), green with it.
