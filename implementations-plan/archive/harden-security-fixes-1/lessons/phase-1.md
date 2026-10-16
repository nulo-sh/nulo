# Phase 1: bounded response bodies (C1)

- `readBodyCapped` lives in `packages/wallet-core/src/utils/read-capped.ts`; node 32 MiB (`NoRetryError` on any status), price 16 KiB, token list keeps `MAX_ENVELOPE_BYTES`.
- Gate at d472b0e7: `bun run test` red. `aztec-node-factory-adapter.test.ts` stubbed `fetch` with an object carrying only `json()`; the node read now streams the body, so the fake no longer stood in for a reply. Fixed by building a real `Response` (d1a2635f). Every other fetch fake in the repo already returned a real `Response` or was off this path (`grep "json: async"` over the test files).
- Red proof: the price test fails with the budget raised to 16 MiB, and passes at 16 KiB.
