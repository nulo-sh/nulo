# Phase 1: #760, the fee method of a popup Send

- 2026-10-18: `describeFeePaymentMethod` reads `feeSpender` for a UI-origin row with no fee call. The added branch pushed the function past the cognitive budget (16 > 15), so the `EXTERNAL` branch moved into `describeExternalFee`; no suppression.
- Red check: with the helper at the base, the popup-Send test fails ("External FPC"); with the fix, all 17 helper tests pass.
- Gate F: `bun run lint` 0, `bun run typecheck:all` 0, `bun run test` 0 (847 files passed).
