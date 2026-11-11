# test-issues-1: phase 4 (#1683, the fee comments)

## Gate

`git diff` of `apps/extension/src/wallet/services/execution/` changes comment lines only; `bun run lint` and `bun run typecheck:all` exit 0.

The new text was checked against `completeFeeOptions` (`packages/aztec-runtime/src/account/fee-options.ts:66`), `predictedWorstMinFees` (`packages/aztec-runtime/src/fee-juice.ts:33-60`, current fees when the node lacks the method or predicts no slots) and upstream `BaseWallet.getMinFees` (`@aztec-labs/wallet-sdk` 6.0.0, one slot by the highest L2 fee).

## Review loop

- **Round 1** (Codex gpt-6.1-sol high, read-only, over `4c931737a..HEAD`): approve, no findings. Opus diff review alongside: approve, three small fixes accepted (plan § Audit verdicts).
- `pgrep -f codex-<dir>` matched this session's own zsh wrapper and kept a wait loop alive after Codex finished; `lessons.md` already records the trap. Read the response file instead.
- `bun run audit:vue` went red once on two untouched unit tests, each 5011 ms against the 5 s default under its three parallel legs at load about 210; standalone they take 143 ms and 228 ms. One rerun on the final head, as the host-load rule allows.
- **Round 2** (Codex resumed with the fix commit): approve, no new findings. The loop converged.

## Final gate (after merging `origin/dev` at 52e2099ad)

- `bun run lint`, `bun run typecheck:all`, `bun run test` (18243 pass), `bun run --cwd apps/extension test:components` (1426 pass), `bun run test:all` (18 workspaces exit 0), `bun run lint:actions`, `bun run test:ci-gating` (755 pass), `bun run audit:vue` (green on its one retry, at load 185 to 199), `bun run check:plans`: green.
- `bun run test:release`: 381 of 388, the same 7 `zip`-binary failures as in Phase 2, none other.
- Armed dists rebuilt on the final head; smoke at retry 0 with the flag on:

| Spec | Chrome | Firefox |
|---|---|---|
| `type-roles.test.ts` | 14/14 (1 Firefox-only skipped), 124 s | 15/15, 226 s |
| `egress-guard.test.ts` | 11/11, 18 s, its one intentional `held` line | 11/11, 25 s |
| `network-arrival.test.ts` | 3/3, 50 s, no `held` line | 3/3, 66 s |
