# locked-refusal-1: recon

Read at `33906a052` by the planning session; no Explore agent (lane proportion: a one-row classification).

## The path today

1. A connected dApp's message reaches `handleWalletMessage` (`apps/extension/src/wallet/services/wallet-sdk/wallet-message.ts`). Its first await is `profileService.captureExecutionFence()` (`:369`).
2. Locked: `captureExecutionFenceHoldingLock` finds no session and throws `new WalletLockedError()` (`apps/extension/src/wallet/services/profile/service.ts:575`). A profile under deletion throws a plain `new Error("Wallet locked")` instead (`:576-577`).
3. The catch maps the error with `toWalletResponseError` (`error-envelope.ts`); no arm names the class, so it falls to `UNCLASSIFIED_ERROR_ENVELOPE`.
4. The same catch logs at `isExpectedRefusal(error) ? Debug : Error` (`wallet-message.ts:451-457`); the class is not listed (`:493-502`), so each locked request is an `error` line.
5. `traceAnswers` adds `data.walletTraceId` before the answer leaves (`live-session.ts:53`).

## Readers and throwers of `WalletLockedError`

- Readers, by class: `wallet-sdk/queued-journal.ts:320` (the queued row's `session_ended` kind), `ui-preference/service.ts:119,255` (its own refusal). Tests: `queued-journal.test.ts:437`, `discovery-policy.test.ts:57`, `profile/service.integration.test.ts:409,417`, `sealed-entity-storage.test.ts:136,155`; harness `ui-preference/service.harness.ts:53`.
- Throwers: the fence (above), `storage/sealed-entity-storage.ts:78,217,260,489` (a sealed write or read without the profile's keys), `account-integrity/coordinator.ts:235`.
- Readers by message: none of the class's own; the many `"Wallet locked"` string matches belong to plain `Error`s thrown elsewhere (`execution/*`, `dapp-interaction/service.ts`), which this lane leaves alone.

## Why the class stays out of `@nulo/extension-messaging`

`packages/extension-messaging/src/core/error-response.ts:29` serializes any `WalletError` as a structured payload over the popup RPC, and `apps/extension/src/wallet/services/execution/transfer-executor.ts:640` rethrows any `WalletError` from journal creation where every other failure becomes `OperationNotRecordedError`, the class `apps/extension/src/popup/utils/transfer-failure-copy.ts:30` keys the Send copy on. A plain `Error` keeps both paths as they are.

## A lock after admission

`dapp-interaction/service.ts:698-710`: `silentInteraction` re-captures the fence and rethrows any failure as a plain `Error("Wallet locked")`, also when the profile differs (a switch). A lock between the ingress fence and this one answers the unclassified constant; the next request meets the ingress fence and answers `WALLET_LOCKED`. Fenced sends answer `SESSION_ENDED` (`profile/service.ts:584-593`).

## Tests and specs

- Envelope table: `error-envelope.test.ts` (the `SessionEndedError` row, `:144-152`, is the model: the class maps, its bare message does not).
- Message level with the trace id: `wallet-message.trace.test.ts` drives `onWalletMessage` with stubbed deps.
- E2E: `tests/e2e/network/wallet-locked-mid-session.test.ts` is the only network spec that sends a dApp request to a locked wallet (`git grep -l lock` under `tests/e2e/network`, read); `lock-cancels-dapp-send` locks mid-send (`JOB_CANCELLED` or `SESSION_ENDED`), `connect-locked-queue*` drive a Connect.
- Closed known limits searched (`locked`): none covers a dApp's locked refusal.
