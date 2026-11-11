# test-issues-1: phase 4 (#1683, the fee comments)

## Gate

`git diff` of `apps/extension/src/wallet/services/execution/` changes comment lines only; `bun run lint` and `bun run typecheck:all` exit 0.

The new text was checked against `completeFeeOptions` (`packages/aztec-runtime/src/account/fee-options.ts:66`), `predictedWorstMinFees` (`packages/aztec-runtime/src/fee-juice.ts:33-60`, current fees when the node lacks the method or predicts no slots) and upstream `BaseWallet.getMinFees` (`@aztec-labs/wallet-sdk` 6.0.0, one slot by the highest L2 fee).

## Review loop

- **Round 1** (Codex gpt-6.1-sol high, read-only, over `4c931737a..HEAD`): approve, no findings. Opus diff review alongside: approve, three small fixes accepted (plan § Audit verdicts).
- `pgrep -f codex-<dir>` matched this session's own zsh wrapper and kept a wait loop alive after Codex finished; `lessons.md` already records the trap. Read the response file instead.
- `bun run audit:vue` went red once on two untouched unit tests, each 5011 ms against the 5 s default under its three parallel legs at load about 210; standalone they take 143 ms and 228 ms. One rerun on the final head, as the host-load rule allows.
