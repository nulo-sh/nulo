# Recon: execution-integrity-1

Read at dev 13d5f8d0, the worktree's base. One Explore agent (sonnet) ran the reuse sweep; the lead read the three code paths line by line.

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| Settle a task whose registry a profile switch cleared | `WrappedTask.exists` (`task/wrapped-task.ts:50`) over `TaskService.hasTask` (`task/service.ts:188`). Two sites guard by hand: `transaction/service.ts:265-282` (`waitForTx`'s `settle`) and `token-balance/balance-job-queue.ts:122,278,429`. Every other `complete`/`fail`/`cancel` throws `Invalid task id` after a clear. | adapt: the handle itself goes inert (plan D1) |
| Post-broadcast task settles that can throw | `execution-coordinator.ts:299-301` (`sendTxTask`), `transfer-executor.ts:293,302`, `execution/service.ts:910` (`executeOperations`) with `rpc-cancel.ts:85-90` (`classifyOperationCatch`), `auth-registry/service.ts:397,402,443,448` | covered by D1, no per-site edit |
| A queued send refusing because a stored row moved | `SPONSOR_MOVED_MESSAGE` (`transfer-executor.ts:182,352`); the fee-spender re-entry in `takeTurn` (`:522-527`). Tests in `transfer-executor.test.ts`: "its sponsor row re-pointed while it waits: it fails closed before any reuse or build", helper `behindHeldSend`. | reuse the pattern and harness |
| Address check and comparison at the popup → worker boundary | `packages/wallet-bridge/src/field-address.ts`: `isFieldAddress`, `fieldAddressKey`, `sameFieldAddress` (already used by `fee/fpc-strategy.ts:81,106`); `InvalidWalletArgumentsError.forMethod` (`execution/service.ts:603`). `isValidAztecAddress` (`apps/extension/src/utils/aztec-address.ts:24`) is a note-recipient curve check, not a contract-identity one. The first sweep missed `sameFieldAddress` (its search terms did not include the name); the Codex plan review found it. | reuse as is |
| Token contract in the Send flow | `send.vue:156` (`activeToken`), `:495` (snapshot `contract`), `send-submit.ts:28-29,72-82` (contract used for the awaiting row only) | adapt: pass it on |
| Know that a grant is in a block | `TransactionService.waitForTx` (`transaction/service.ts:257-300`) proves only absence from this worker's pending map (Dropped, untracked and restored hashes return at once). A receipt read plus `txStatusFromReceipt` (`transaction/receipt-status.ts:12`) proves a block; `waitForTxProven` (`auth-registry/service.ts:478-490`) already polls receipts and tips the same way. | adapt: a receipt poll in the revoke (plan D3) |
| Re-check a stored authwit row before deleting it | `syncAuthwit`'s under-lock identity re-check (`auth-registry/service.ts:513-531`) | adapt (D3) |
| Coordinator with a real `TaskService` | none combined. Real `TaskService` in `task/service.test.ts:32` (helper `switchToProfile`, `:65`), `fee/strategies-lifecycle.test.ts:111`, `transaction/service.test.ts:361`; coordinator tests use a fake task (`execution-coordinator.test.ts:37`). | build new test, from these pieces |
| Revoke test harness | `auth-registry/service.test.ts`: `makeHarness` (`:132`), `instrument` (`:379`), "a revoke settles in order: task, send under the captured fence, tx, proven, sync, complete" (`:463`). Its revoke tests revoke rows written by `recordPendingAuthwits`, so they are `pending`; no test names that case. | reuse; extend |

## Call sites the wire change reaches

`executeTransfer` / `estimateTransferFee`: production `send.vue:404,503`, `send-submit.ts:74`; tests `send-submit.test.ts`, `send.test.ts`, `send.integration.test.ts`, `fee-settings-rpc-guard.test.ts:27-28`, `execution/client.test.ts`, `send-order.composition.test.ts`, `service.composition.test.ts` (six calls), `service.estimate-queue.test.ts`. No e2e spec calls either RPC.

## E2E that exercise the changed behaviour

- `tests/e2e/network/authwit-lifecycle.test.ts:172-187`: grants, waits until the node reports the grant mined, then revokes all through Settings. The grant's row is usually still `pending` then (reconciled only at Proven, `auth-registry/service.ts:165-186`).
- `tests/e2e/network/transfers.test.ts`: Send through the popup.
- Smoke specs that open Send: `send-keyboard.test.ts`, `send-fee-privacy.test.ts`, `legal-acceptance.test.ts`.

## Popup counters (context for OWNER-ASKS OA-1)

`utils/in-flight-send.ts`: `isInFlightSend` counts popup-origin `transfer`/`dapp_execute` rows from `queued` to `submitting` for the viewed account (it gates the account and profile pickers); `isApprovedSendInFlight` counts any origin in `pending`, `simulating`, `proving` (plus a queued transfer or a re-ask), never `submitting`. `composables/useLockWallet.ts:19-20,109-121` asks "N transactions are still running. Locking cancels them." from the second count.

## Open work and known limits

- Closes: #662, #664, #669 (filed 2026-10-17). No other open issue names these files' behaviour.
- Closed known limits searched (`task registry`, `profile switch send`, `revoke`, `token id`, `authwit pending`): #397 (Revoke all over 12 chunks) and #262 (lockless chain sweep and reused token ids) are neighbours, not overlaps.
