# Phase 2: the bound contract (#662)

- `executeTransfer` and `estimateTransferFee` take `tokenContract` after `tokenId`. Both refuse a malformed value with `InvalidWalletArgumentsError` and carry its `fieldAddressKey` spelling. The planner refuses a row naming another contract, the reuse ladder misses on one, and `sequence()` and the queued fee cap read the request's contract. The `getTokenContract` dep is gone.
- The tests run the real `OperationPlanner` inside the executor suite, so `transfer-executor.test.ts` now fakes `createTokenFn` file-wide. Its selector is poseidon2, which cannot run under jsdom. The planner's own test fakes it the same way. Nothing else in that file reaches the factory: its harness stubs the planner.
- The executor's held-send helper moved to module scope as `heldBehind(req, overrides)`, so the sponsor and token-binding describes share it.
- Fixtures: a contract the new checks read must be a field address below the modulus. `0xab…` repeated is above it, and `sameFieldAddress` refuses it. The suites use `0x1a…` (and `0x1b…` for the other contract). The popup suites mock the worker, so their `0xcc…` contracts never reach a check.
- Mutation check: removing the planner's check, then the reuse ladder's contract match, turns red the planner refusal, the queued-send refusal and the reuse drift test.
- The type-roles digest of `operation-planner.ts` was re-pinned after re-attesting it. Its only `send_transaction` is still the transfer the executor proves directly, never shown in the execute window.
- Gate F, at load 240 (188 cores): lint, typecheck and 13 418 unit tests green; one red, the digest pin. Green after the re-pin.
