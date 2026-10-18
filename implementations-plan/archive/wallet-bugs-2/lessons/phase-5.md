# wallet-bugs-2: phase 5 (#579, the arrival tip in one attempt)

- `NetworkService.readChainTip(networkId)` is public but is not an RPC method: the RPC surface is an explicit `defineRpcMethods` allowlist. The execution service's `readTip` dependency calls it, and its private copy is gone.
- The incoming reader's `getChainTipOnce` refuses a quarantined chain with `ChainNotSupportedError` before it makes any request. `getArrivalState` is its only caller. `readTip` takes the read as a parameter that defaults to `getLatestBlockNumber`, so the other three callers are unchanged.
- Every fake `PublicEventReader` needed `getChainTipOnce`. Typecheck found the one in `network-reset/service.composition.test.ts` that grep missed.
- Red on base, browser: with `seedArrivalRow` deleted, `type-roles.test.ts`'s seeded-Home case timed out on base after 15 s, waiting for the incoming row with Testnet refused. It passes with the change.
- Gate deviation: `incoming-arrival.test.ts` is proverless-gated, so `e2e:agent` refuses it unless `NULO_E2E_PROVERLESS=1` is set (exit 2 in 3 s). I reran it with that set. The plan's command omits the variable.
- Gate results:
  - Unit: 3212 pass.
  - Smoke `type-roles.test.ts`: Chrome 13 (1 skipped), file 60.4 s; Firefox 13, file 126.5 s.
  - Network on Chrome (each file alone, `NULO_E2E_RETRY=0`): `incoming-arrival` 7/7, file 365 s, run 468 s; `incoming-transfers` 3/3, file 92 s, run 209 s.
- Phase 6's diff was set aside as a patch, outside the tree, while these network runs built and ran, so they tested the Phase 5 tree alone.
