# Phase 1: the shared constant, the loopback predicate and the use-time rule

- `LOCAL_L1_CHAIN_ID` now lives in `packages/wallet-core/src/utils/chain-id.ts`, re-exported by `apps/extension/src/utils/chain-ids.ts`. The auto-import declaration needs no change.
- Red/green: the new refused sink cases fail against the base `chain-identity.ts` (copied from `13d5f8d0`; 2 failed) and pass after.
- First full run: 43 failures, all in two files (`fast-path.test.ts`, `batched-view-simulation.test.ts`). Both held a chain-0 row on L1 11155111. Each moved to the row of its fake node's default pair, with no assertion changed. Then green: 13408 passed.
