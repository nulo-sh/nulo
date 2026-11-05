# history-2 recon

Read at `f738cba62` (`origin/dev`). Paths are under `apps/extension/src/` unless rooted. One Explore sweep (sonnet) plus the planner's own reads.

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| A tx page time from `createdAt` | `popup/pages/journal/[id].vue:164-167` (`createdAtLabel`), `popup/pages/detail-page.ts:1` (`DETAIL_TIME_FORMAT`) | reuse as is |
| The failed fee row and its retry | `popup/components/modules/send/FeeCostReadout.vue:87-92` (`failed`, `retry`); `FeeSettingsCard.vue:80-84,292-296,484-496` (`estimateFailed`, `retryEstimate`, focus to the method trigger) | reuse as is |
| A per-key failure state | none: `useFeeEstimationMap.ts` exposes `results` (null while pending *or* after a failure) and `estimating`; searched `failed`, `estimateFailed`, `hasFailed` under `composables/` | build new, in the map (D3) |
| The popups' estimates | `composables/useWalletTxEstimates.ts` (both popups); `refresh(key)` is every re-ask and cancel | adapt |
| The window's estimates | `popup/windows/execute/index.vue:189-217` (fee map, `onError`), `:457-467` (`handleFeeUpdate`, the only re-ask) | adapt |
| A forwarding wrapper | `popup/windows/execute/OperationCard.vue:65-115` (props, emits), `:433-446` (the card) | adapt |
| Closing the failure snack by id | `popup/pages/send.vue:320-327` (`clearEstimateFailure`), page-local; searched `closeToast`, `toast.value?.id` | mirror (D4) |
| Wire-shaped `aztec_sendTx` | `popup/windows/execute/execute.fixture.ts:32-88` (`field`, `wireCall`, `fixtureOp`) | reuse |
| A toast double with ids | `popup/pages/send.integration.test.ts:38,146,340` | mirror |

## Traces

- **T1 (#1416, demonstrated).** `tx/[id].vue:98-101` formats `tx.updatedAt`, set on every status move. `createdAt` is required by `TxSchema` (`wallet/services/transaction/spec.ts:212`). No test pins the hero time; the page test's fixture (`tx/[id].test.ts:59`) has no `createdAt`.
- **T2 (#1417, window, demonstrated by trace).** A person-paid send's estimate rejects. The engine clears the result and calls `onError` (`internal/fee-estimation-engine.ts:141-150`). The window toasts and discards the id (`index.vue:209-216`). The card gets neither a failure nor a retry (`OperationCard.vue:433-446`). For a fee the person pays Confirm stays off: `holdsConfirm` is `inFlight || (waitsForFeeFigure && !landed)` (`fee-figure.ts:52-58`); a sponsor picked in the window leaves it on (`:42`, `index.test.ts:1335`). The only re-ask is `handleFeeUpdate`, from a method or priority change.
- **T3 (#1417, popups, demonstrated by trace).** Both popups' `onError` toast with no key and no id (`ChangeAuthwitsRegistryPopup.vue:61-64`, `RevokeAuthwitsPopup.vue:62-65`); `useWalletTxEstimates.ts:29` drops the key. Send stays off (`landed()` false). A re-ask needs a fee change (`setChunkFee`, the registry watch) or a scope change.
- **T4 (where a failure flag clears).** The engine calls `onResult(key, null)` on schedule, on cancel and before `onError` on a failure (`fee-estimation-engine.ts:107-150`). `cancelAll` walks keys with a timer, a flight or a completed token (`:115-118`); it reaches a failed key only because a fired timer's handle stays in `timers` until a later clear (`:87-93,152-165`). A flag cleared in the result sink would lean on both orders, one of them incidental, so the map clears it in its own `estimate`, `cancel` and `cancelAll` (D3).
- **T5 (locked method).** The window locks the card to Public Fee Juice for a dApp that names the account as payer (`OperationCard.vue:437`, `requestedMethod`). The card then renders no `FeeMethodSelector` (`FeeSettingsCard.vue:397-409`), so the retry's keyboard focus target is null (`:295`).
- **T6 (app-paid rows).** An operation whose app pays through its own payload renders `AppFeeLine`, not the card (`OperationCard.vue:392-432`). When the person pays all the same (a claim to the account, the PrivateFPC) or the app set its own cap, a failed estimate holds Confirm (`fee-figure.ts:40-46`); only the person-paid case toasts (`index.vue:215`); `index.test.ts:1210` pins the own-cap hold. Neither has a retry today; the readout the owner's pick names is not on that row (OA1).
- **T7 (keyboard).** No document-level Enter on the window or either popup: `usePopupEntity` is called with no `submit`; Confirm and Send carry `refuseRepeatEnter`. The method trigger refuses a held Enter (from #1392's fix).
- **T8 (requeue).** The window's estimate path never meets `EstimateRequeue`: only Send's executor answers `tokenSpent: true` (`wallet/services/execution/transfer-executor.ts:163`; the operation path, `service.ts:850`, answers `false`).

## Tests and e2e that reach the change

- Unit/component: `tx/[id].test.ts`; `composables/useFeeEstimationMap.test.ts`, `useWalletTxEstimates.test.ts`; `popups/ChangeAuthwitsRegistryPopup.test.ts:277`, `RevokeAuthwitsPopup.test.ts:340` (real hook and map, `FeeSettingsCard` stubbed); `windows/execute/index.test.ts` (map and `OperationCard` faked, `:74-102`), `scope-follow.test.ts` (its own map fake, `:64-78`), `OperationCard.fee.test.ts` (the real card and readout); `popups/popup-stack.pins.test.ts` (both popups, an `openToast`-only double, `:44-45`); `FeeSettingsCard.test.ts:1034`.
- Smoke e2e opening the tx page: `tests/e2e/rows.test.ts`, `tests/e2e/type-roles.test.ts`. No smoke file opens the execute window (every hit is under `network/`).
- Network e2e: `tests/e2e/network/snack-placement.test.ts:500` drives the window to a failed estimate (`openUnfundedDappSend`); `tests/e2e/network/authwit-lifecycle.test.ts` drives both popups to success. None reads `fee-estimate-failed`.
- Collisions: neither active plan (`authwit-index-1`, `exec-send-1`) names these files. Closed limit nearby: #1418 (a retry on a lasting failure runs the same simulation).
