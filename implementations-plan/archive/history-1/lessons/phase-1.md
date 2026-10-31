# Phase 1: History and Home order by `createdAt`

- Red before, on the base code with the new tests: `activity.store.test.ts` "transactions read newest sent first, whatever their last status change" received `["0xold", "0xnew"]`; `recent-activity-rows.test.ts` "History and Home order sends by when they were sent, whatever their last status change" received `["tx:a", "tx:b"]`. Both at the order assertion.
- Fix: `scopedTxRows` and the store's `transactions` sort on `createdAt`. Fixtures updated: the tx helpers of `activity-rows.test.ts`, `recent-activity-rows.test.ts` and `activity.test.ts`; the two read-order pins end in `"createdAt"`. No other fixture needed it (`RecentActivityView.test.ts` holds one tx per case).
- Gate: lint 0, `typecheck:all` 0, the Phase 1 vitest set 20 files / 416 tests green at retry 0; `src/stores` and `src/popup/pages/tx` also green (143).
