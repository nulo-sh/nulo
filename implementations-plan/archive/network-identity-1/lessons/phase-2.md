# Phase 2: the network service holds every chain-0 row to the rule

- `nodeChainId` is the one decision point for a node's wallet chain id. `_probeChainIdentity` calls it after its `try`, so the `ENDPOINT_CHAIN_MISMATCH` prefix reaches the popup instead of being rewrapped as "Failed to fetch node info".
- In both status methods a remote node computing 0 throws inside the `try` and reads `Inactive`, the result table's second state. A non-zero answer reads `InvalidChain`.
- First run after the code change: 3 failures, all fixtures that the plan named: the seam test's `{1,1}` / `{2,2}` pairs and the identity guard's `{3,3}` row. They moved to `{1,2}` / `{2,3}` and `{3,4}`, and the `BOTH` message now names composite 7. The Local success controls and the two `local` status rows moved to L1 31337 with matching node answers; no assertion was loosened.
- Red/green: with the base `network/service.ts` and `network-reset/service.ts` (from `HEAD`) and the new tests, 13 fail (tests 1 to 8; every control passes), and all pass after.
- Gate: lint 0, typecheck:all 0, the three service directories 481 passed, root test 13428 passed, test:all 0.
