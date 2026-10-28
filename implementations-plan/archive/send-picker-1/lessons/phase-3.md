# Phase 3: the zero corner

- Send's identity fetch reads balances directly, not through the snapshot composable, so the page's `balancesState` stays `loading` after a successful first fetch; only a reconnect's read moves it. The corner's truth table therefore reads a row first, and the snapshot state only when no row exists, which the reconnect-refused test proves.
- The fit tests re-fit by changing `balanceRawByType`, which reaches the fit only through the corner's text; with the corner defaulting to unread, their mount passes `balanceState: "read"` so the change still moves the line.
- The story's token is USDC, so `NoBalance` reads "0 USDC"; a `BalanceLoading` story draws the skeleton for the capture.
- `DOMWrapper` from `w.get` has no `exists()` in its type: `audit:vue`'s typecheck caught one in a new test that vitest ran green.
- Red first on the phase-2 sources: 6 tests fail (AmountCard 4, Send 2); the unavailable and no-token controls pass on both.
- Gate: `bun run test src/components/composite/send src/popup/pages` 1201 passed; `bun run --cwd apps/extension build-storybook` exit 0; `bun run audit:vue` exit 0 (16258 tests).
