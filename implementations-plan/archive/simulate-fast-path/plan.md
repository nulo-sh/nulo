# dApp simulateTx public-static fast path

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: `apps/extension/src/wallet/services/execution/fast-path.ts`, the shared fee translator `packages/aztec-runtime/src/account/fee-options.ts`, and the account-level `requiresInitialization` check in `packages/aztec-runtime/src/account/nulo-account.ts`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Serve a dApp's `aztec_simulateTx` for a payload that begins with public static calls by simulating that prefix directly on the node, in parallel with the standard PXE path for the rest, and merging with the upstream merge helper.

- **Rehydration first.** Calls arrive as plain JSON over the RPC boundary, so the first attempt, which called a prototype method on them, failed with a type error and the fast path was switched off. The fix rehydrates only the optimizable prefix into real `FunctionCall` values after a cheap data-only precheck, and guards a missing or non-array call list.
- **Mixed payloads** (public-static prefix plus any remainder) are supported by wrapping the standard arm with an app-call offset of 1, since the account entrypoint prepends no wallet fee calls.
- **One fee translator** (`completeFeeOptions`) is shared by the fast and standard paths, mirroring the upstream default of current minimum fees padded by half. Priority fees were also threaded through the planner and request builder, where they had been dropped.
- **Error policy**: a contract revert surfaces to the dApp directly, with no fallback; infrastructure errors fall back to the standard path with a log.

## Why

Re-simulating a revert through the PXE returns the same revert seconds later, so surfacing it at once is faster and no less correct. Using the upstream merge was preferred over a local one to keep maintenance on upstream. Standard and fast arms had drifted on fee semantics for dApps that skip fee enforcement without supplying fee fields.

## What shipped

The first-transaction multicall initialization case is excluded by the caller through `requiresInitialization`, because that doubly nested execution tree does not fit the flat app-call-offset model; normalizing it was judged an edge case and left unbuilt. The PXE interface gained `getSyncedBlockHeader`, used for the block header with a node fallback. Unit tests cover the helpers, the orchestration policy, the fee translator and the planner.
