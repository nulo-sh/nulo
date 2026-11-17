# authwits-2 recon

Base: `origin/dev` at `0dc22a9c5`. Two Explore agents (sonnet): a reuse sweep over the Send, journal, Activity, chip and decoder surfaces, and a fact check of the AuthRegistry storage against `@aztec-labs/*` 6.0.0. Every claim below was re-read at that base; line numbers are at it.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| Revoke and toggle sends | `AuthRegistryService.revokeAuthwits` / `setRegistryEnabled` (`wallet/services/auth-registry/service.ts:401-494`) run through `ExecutionService.executeSendTransaction`, the journal and `TransactionService` | reuse as is |
| Wait for a tx's block at a chain tip | `waitForTxProven` (`service.ts:521-531`): polls `getChainTips().proven` past the receipt's block, 120 s | adapt: the tip it reads (arc 1) |
| Grant-in-block wait | `grant-block.ts` (`awaitGrantBlock`, `grantBlockOf`) | reuse as is, untouched |
| Popup stage words | `useSendStageLine` (`composables/useSendStageLine.ts`) over `stageSubtitle` (`utils/card-subtitle.ts:26-47`), the journal record the service names through `onSendStarted` | reuse as is |
| Per-chunk estimates | `useWalletTxEstimates` over `useFeeEstimationMap` (500 ms debounce, latest wins) | reuse as is |
| Estimate pipeline | `ExecutionService.estimateSendTransactionFee` (`execution/service.ts:777-786`) → `DappSendExecutor.estimateOperationFee` → `DiscoveryAwareEstimator` (folded: one stubbed sim for `fj` and sponsored `fpc`; two-pass for a private FPC) | reuse as is |
| A popup that outlives its own request | `createRunFence` (`composables/runFence.ts`), used across `src/composables/`; the authwit popups use none and read their client's `disconnect()` rejection as the send's outcome | reuse (arc 1) |
| Registry read for known rows and the flag | `syncRegistry` (`service.ts:496-509`): `syncAuthwits` prunes confirmed rows that read unauthorized, `syncStatus` stores the chain's `reject_all`; **no caller** (`grep -rn syncRegistry apps/extension/src` hits only the service, client, spec and tests) | reuse as is (arc 3, owner pick) |
| Contract chips | `contractChipAt` (`popup/windows/execute/contract-chips.ts:46-58`) over `readContract` (`utils/contract-level.ts`); local and synchronous once the signed list answers | reuse as is (arc 2, owner pick) |
| Call decoding | `ExecutionService.decodeCallsForDisplay` → `decodeCallForDisplay` (`execution/call-decoder.ts`), service-worker side, needs the PXE artifact | reuse (N2 only) |

## Facts the plan rests on

- The page lists only a local, sealed store (`nulo:core:auth-registry`), written once per public grant this device sent (`recordPendingAuthwits`, callers `dapp-send-executor.ts:772` and `operation-journal/send-check.ts:199`). Private witnesses (`aztec_createAuthWit`) are never stored. Restore replays backup rows; nothing rebuilds rows from chain.
- The flag store (`nulo:core:auth-registry-enabled`) is backup-absent and reads `true` when absent (`spec.ts:11-16`, `service.ts:449-453`); only `setRegistryEnabled` and `syncRegistry` write it.
- `useSendStageLine` clears its line once the record turns terminal (`succeeded` is written right after the node accepts and the record is kept, `execution-coordinator.ts:389`), while `revokeAuthwits` still runs `waitForTx` (≤ 120 s), `waitForTxProven` (≤ 120 s) and `verifyRevoked`.
- `ServiceClient.disconnect()` rejects every pending request (`packages/extension-messaging/src/background/client.ts:102-108`), and a later request reopens the port (`ensureTransportReady` → `openPort`, `client.ts:209-213`).
- `MAX_REVOKES_PER_TX = 28` (`spec.ts:18`): three authwits are one chunk, not two.
- No aztecscan reading exists: `contract-level.ts:13` says `scan` "has no source yet, so nothing returns it". A chip reads Nulo verified only for a signed-list token on its chain and the two pinned fee contracts.

## Baseline tests (what they cover, what they miss)

- `service.test.ts` (1358 lines): refusals and caps, the settle order (task, grant receipt, send, tx, proven, verify, complete), grant-block waits, verify and prune, endpoints, Terms refusal, reconcile, sync, restore. **Misses**: every case stubs `waitForTxProven`; no case has a proven tip behind the tx's block.
- `RevokeAuthwitsPopup.test.ts`: the content button, what keeps Revoke off (shortfall, error), the stage line, the estimate gating and retry, cancel on hide. **Misses**: the end of a revoke (success, error, cancelled), a hide while a revoke runs, more than one chunk sent.
- `authwits/index.test.ts`: a Pending chip that clears, a grant added while open. `ChangeAuthwitsRegistryPopup` has no test of its send's end.
- `tests/e2e/network/authwit-lifecycle.test.ts`: grant, consume, revoke all (registry and consume refusal checked on chain), registry off and on. On the sandbox the proven tip follows every block (automine settler), so it cannot see the Testnet wait.

## Collisions

- Closed known limits in the area: #397 (Revoke all past 12 chunks), #695 (a second grant of the same hash), #780 (a stale Pending chip). None is reopened.
- No sibling lane touches `wallet/services/auth-registry/` or the two authwit popups.
