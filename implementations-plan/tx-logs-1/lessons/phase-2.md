# Phase 2: the capture

- **Deviation, `begin`.** `begin(walletTraceId, meta)` records a capture under an id the ingress mints with `randomIdNotIn(id => requests.has(id), 8)`, instead of minting the id itself. That keeps one mint path when no capture store is wired (tests) and changes nothing a caller sees.
- **Found while testing:** `chainInfoToChainId` throws `InvalidWalletArgumentsError` on a malformed `chainInfo`. Reading it at arrival, outside the handler's `try`, would have thrown out of `onWalletMessage` before the slot was admitted. `chainIdOf` records `-1` instead, and the handler still answers its typed -32602 (`wallet-message.trace.test.ts`).
- **Write cost:** the flush rewrites `nulo:request-logs` only when a capture changed since the last write (`requestsDirty`), since up to 50 × 64 KB would otherwise be rewritten on every log line's flush.
- **Pinned line numbers:** `tests/e2e/helpers/profile-chaos/model.ts` cites `background.ts` by line (`DAPP_QUEUE`); the two lines `background.ts` gained moved it from 373 to 375.
- The estimate and preview stages are proven at the producer (`service.refusal.test.ts`), and the prove phases at the coordinator (`execution-coordinator.prove-phase.test.ts`). The reach test (`request-captures.reach.test.ts`) drives the real `TaskService` and the runtime's wiring, with a journal stub that emits the queued row before the alias.

# Phase 3: the report

- The golden (`request-report.golden.txt`) was written by hand from the OA-2 template, not generated from the code, and the code matched it on the first run.
- **Deviation:** the timeline is sorted by start, ties kept in arrival order. Stages are appended when they finish, so the request's own stage, which opens first and closes last, would otherwise read last.
