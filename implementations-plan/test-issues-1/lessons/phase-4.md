# test-issues-1: phase 4 (#1683, the fee comments)

## Gate

`git diff` of `apps/extension/src/wallet/services/execution/` changes comment lines only; `bun run lint` and `bun run typecheck:all` exit 0.

The new text was checked against `completeFeeOptions` (`packages/aztec-runtime/src/account/fee-options.ts:66`), `predictedWorstMinFees` (`packages/aztec-runtime/src/fee-juice.ts:33-60`, current fees when the node lacks the method or predicts no slots) and upstream `BaseWallet.getMinFees` (`@aztec-labs/wallet-sdk` 6.0.0, one slot by the highest L2 fee).

## Review loop
