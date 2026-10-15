# Phase 3: the Teardown line

- `TxFeeRow.vue` lost the Teardown block; `GasBreakdown` lost `teardownL2Gas`, `teardownDaGas`, `teardownCost` and `hasTeardown`. `GasDetailsRaw` keeps the stored teardown limits.
- `tx-detail-helpers.test.ts`: the two `hasTeardown` cases became one: with non-zero teardown limits the breakdown is the L2 and DA lines alone, and they add up to the fee limit (0.001 + 0.001 = 0.002 FJ).
- New `TxFeeRow.test.ts`: the expanded breakdown of a transaction with teardown limits lists exactly "L2 gas", "DA gas", "Estimated".
- No e2e counted the rows (recon), so none moved.

## Gate (2026-10-14)

`bun run lint` exit 0; `bun run typecheck:all` exit 0; `bun run --cwd apps/extension test src/popup/components/modules/tx` 16 passed. Pass.
