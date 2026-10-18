# dapp-refusal-1: recon

At `0c340d37`. One Explore agent (sonnet) swept the e2e, capture and window-test tooling; the driver traced the estimate-to-owner path by hand. Runtime facts come from a scratch capture spec run through `bun run e2e:agent` (Chrome, retry 0); the spec was deleted after the run.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| A path from the estimate to the request's owner | `ExecutionService.estimateOperationFee` / `previewOperationAuthwits` take the interaction id and already read the stored request through `InteractionOperationSource` (`execution/service.ts:128-133, 763-789, 806-808`) | adapt: one method on that interface |
| A request ended before approval, remembered on its record | `DappInteraction.cancelledAt` (`dapp-interaction/spec.ts:79-84`): approve and resolve refuse on it (`dapp-interaction/service.ts:250-252, 278-280`); the window replays it | adapt: a sibling field for a refusal |
| Settling the waiting dApp with a typed error | `WindowManager.cancel` hands the same `Error` instance to the caller and closes the window (`window-manager/window-manager.ts:158-161, 236-260`) | reuse as is |
| The dApp's answer for a refusal | `toWalletResponseError` → `SCOPE_VIOLATION_ENVELOPE`, or the registry text for `AuthRegistryRefusalError` (`wallet-sdk/error-envelope.ts:126-130, 224-261`) | reuse as is |
| History's row for a refusal | the ingress catch → `failQueuedForError` → `scope_refused` / `registry_refused` (`wallet-sdk/background.ts:930-952`, `wallet-sdk/queued-journal.ts:277-295`); labels in `utils/journal-state.ts:244-253, 312-314` | reuse; the pre-claim title rule adapts (below) |
| What a refusal renames its row to | `refusalOf` (`execution/contract-resolver.ts:92-110`, at `8d9ff149`; `refusalTitleOf` before #826), read today only by the claimed path (`execution/mark-failed-unless-cancelled.ts:41`) | reuse in the pre-claim path |
| A full-window "this request ended" state | `DappCancelledOverlay` (`components/composite/DappCancelledOverlay.vue`), used by the execute window for a cancel and a wrong profile (`popup/windows/execute/index.vue:644-653`) | reuse with a new message |
| Typed refusal across the popup RPC | `walletErrorFromPayload` rebuilds `ScopeViolationError` and `AuthRegistryRefusalError` (`packages/extension-messaging/src/errors.ts:641-650`) | reuse as is |
| Window tests that drive estimate and preview failures | `popup/windows/execute/index.test.ts:55-91, 796, 882` (the fee-map mock's `onError`) | adapt; no test drives the preview's `onError` today |
| Real-path refusal e2e | `tests/e2e/network/scope-refusal.test.ts:100-149` (call binding via a `TextEncoder` patch; it presses Confirm) | adapt |
| A NO_FROM send that reaches a window | `pg-btn-sendTx-noFrom-sponsored` after the `transaction-contracts` grant (`tests/e2e/network/tx-sendTx-noFrom.test.ts:38-45, 115-133`) | used for the capture only |
| A playground action that raises a registry request | none: searched `apps/playground/src` for `registry`, `set_authorized`, `authwit`; only the custom `grantPublicAuthwit` RPC exists | not built: the registry refusal is proven at unit seams (`execution/dapp-send-executor.test.ts:1783-1830`) |
| Captures | `shotSend` (`tests/e2e/fixtures/send-page.ts:224-249`), `settleThemeTransitions` (`:210`) | reused by the scratch capture spec |

Absence trails: no code writes the journal kind `user_rejected` (`grep -rn user_rejected apps/extension/src packages`, non-test hits are readers only); no closed `known-limit` issue matches "estimate refusal window".

## Runtime facts (scratch capture, Chrome, `0c340d37`)

| Send | Window | Confirm | Then | dApp reads | History |
|---|---|---|---|---|---|
| Standard, default payer "Sponsored", call-binding refusal | toast "Couldn't estimate fee. Try again." | on | Reject | `4001 USER_REJECTED` | card "Transaction failed", detail "Popup closed early", kind `popup_bound`, titled "Balance Of Public" (the app's claimed name) |
| Standard, the account pays (Fee Juice) | not captured: the fixture account holds no Fee Juice, so the row is disabled | off by code (`index.vue:182-184`, `fee-figure.ts:34-40`) | | | |
| No sender (`NO_FROM`), call-binding refusal | toast "Couldn't preview authorizations. Try again." | on | Confirm | `4100 SCOPE_VIOLATION` | "Not allowed" / "The app asked for more than you allowed. Nothing was sent.", titled "Sponsor Unconditionally" |

## Collisions

- `execute-window-2` arc 1 (the window's call lines) and `consent-display-1` arc 3 (#806, token and fee copy) edit `popup/windows/execute/index.vue` and its tests; this arc rebases onto whatever lands first.
- `p42-followups-1` arc 2 (#719) landed as #826 at `8d9ff149` while this plan was audited: it renamed the refusal's title helper and added the refused call; the plan follows it.
- #828 (filed from this recon): a person's Reject files `popup_bound`. Not in this lane.
