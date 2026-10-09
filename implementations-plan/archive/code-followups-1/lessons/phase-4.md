# Phase 4 — signals instead of sleeps, honest budgets

## Changes

- *98.* `useIncomingTransfers` returns `loaded`: set where `readRows` assigns rows for the current
  scope (after both stale checks), reset by the synchronous scope-switch watcher. `activity.vue` binds
  `data-incoming-loaded="true"` on `activity-feed-root` once it holds. `incoming-transfers.test.ts`
  waits on `[data-testid="activity-feed-root"][data-incoming-loaded="true"]` (30 s) instead of
  sleeping 3 s, and keeps the zero-card assertion. The attribute-qualified selector follows the
  existing `[data-testid=…][data-account-name=…]` pattern in `accounts.test.ts`.
- Tests: three composable cases (held read false then true, switch resets and the next read sets it;
  not-ready scope and a rejected read stay false; a superseded scope's read never sets it while the
  current one does) and one page case (absent while `getIncomingTransfers` is held, `"true"` after).
  A throwaway edit that set `loaded` before the stale checks and dropped the switch reset failed two
  of the three composable cases, so they catch the regression they name.
- *100.* `price-fixture.test.ts`: `{ timeout: 300_000 }`, with one line saying the fixture's L1 bridge
  runs inside the budget. Its first Chrome run took 60.7 s in all on this host.
- *10.* `shotSend` waits for every `CSSTransition` in `document.getAnimations()` to finish (1 s cap,
  never throws) after the flip, and again after the restore.

## Deviation

- `shotSend` also settles after the restore, not only before the flipped shot: `fee-methods` calls it
  twice back to back (`tag-private-private` then `strip-fee-payer`), so without it the next call's
  first shot could catch the restore mid-fade. Same helper, one more call.

## Gate runs (2026-10-09)

- `bun run lint`, `bun run typecheck:all`: pass.
- `bun run --cwd apps/extension test -- useIncomingTransfers activity`: 13 files, 258 tests, pass.
- Chrome, `NULO_E2E_SHOT_DIR`, retry 0: `incoming-transfers` 2/2, `tx-transfer-row` 1/1,
  `price-fixture` 1/1 (60.7 s), exit 0. `transfer-row-send-dark.png` (the flipped capture) shows the
  dark theme's final colours on the sheet and both buttons, no blend.
- Firefox, the same invocation: `price-fixture` 1/1 (80.6 s), `tx-transfer-row` 1/1,
  `incoming-transfers` 2/2, exit 0; its flipped capture is in the final dark colours as well.

## Gate (2026-10-09) — pass
