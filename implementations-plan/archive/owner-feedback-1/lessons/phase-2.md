# Phase 2: #761, the fee breakdown without gas units

- 2026-10-18: the grid drops its unit column (`1fr auto`); `GasBreakdown` keeps the two costs; `formatGas` deleted. `build:chrome` regenerated `auto-imports.d.ts` and also `src/types/.eslintrc-auto-import.json` (the plan named only the first; both are generated, both committed).
- Red check: with the base `TxFeeRow.vue`, helper and `fee-estimation.ts`, the no-units assertion fails; with the change it passes.
- Gate F: lint 0, typecheck:all 0, test 0 (847 files passed).
