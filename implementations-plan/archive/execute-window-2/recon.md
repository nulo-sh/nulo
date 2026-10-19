# execute-window-2: recon

Read at `24c68cb4` (origin/dev). Two Explore agents (sonnet) plus the planner's own reads. Paths are under `apps/extension/src/` unless they say otherwise.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| A refusal crosses the worker → popup hop typed | `buildErrorResponseContent` → `walletErrorFromPayload` rebuilds `ScopeViolationError`, `AuthRegistryRefusalError` and `OwnAccountIntentRefusalError` by code and constant message (`packages/extension-messaging/src/errors.ts:626-636`); the window's `onError(key, err)` receives that instance (`composables/internal/fee-estimation-engine.ts:140-148`) | reuse as is |
| The estimate's worker entry, bound to a stored request | `ExecutionService.estimateOperationFee(interactionId, index, …)` and `previewOperationAuthwits(interactionId, index, …)` (`wallet/services/execution/service.ts:763-787`), both through `interactionOperations()` (`:806`) | adapt: record a refusal there |
| The execution → interaction seam | `InteractionOperationSource` (`execution/service.ts:128-134`), implemented by `DappInteractionService` | adapt: one method |
| The pending request and its end | `DappInteraction` in `storage` (`dapp-interaction/service.ts:145`); `rejectInteraction` cancels the window handle with `new UserRejectedError(reason)` (`:301-311`); `WindowManager.cancel` hands the awaiting caller the same `Error` instance (`window-manager/window-manager.ts:158-163`) | adapt: settle with the recorded refusal |
| dApp answer and History row for a refusal | `toWalletResponseError` → `SCOPE_VIOLATION_ENVELOPE` / `AUTH_REGISTRY_REFUSAL_ENVELOPE`, code 4100 (`wallet-sdk/error-envelope.ts:227-261`); `failQueuedForError` → `scope_refused` / `registry_refused`, retitled "Transaction" (`wallet-sdk/queued-journal.ts:248-294`), called from `wallet-sdk/background.ts:951`; rows "Not allowed" (`utils/journal-state.ts:249-253`) | reuse; adapt the title line |
| The resolved title of a call-binding refusal | `refusalTitleOf(error)`, a worker-side `WeakMap` (`execution/contract-resolver.ts:94-104`), used by `markFailedUnlessCancelled` | reuse in the queued path |
| A fee-card-sized slot in the card | `OperationCard`'s `<slot name="fee">` replaces the fee block (`popup/windows/execute/OperationCard.vue:394-395`); used today only by `windows/fee/index.vue:272` | reuse as is: no `OperationCard.vue` edit |
| An orange warning line | `UnreadableArgsNotice.vue` (orange `warning` icon, `Text variant="body" color="orange"`) | match its look, not the component (its strings are the unreadable-call ones) |
| A footer without Confirm | `components/composite/DappApprovalFooter.vue` has no such prop; shared by the execute, connect, capabilities and fee windows | adapt: one boolean prop |
| Pictures at 400 px, both themes | `shotSend` (`tests/e2e/fixtures/send-page.ts:220-251`, inert unless `NULO_E2E_SHOT_DIR`), `type-roles-windows.test.ts`'s `openExecute` and its delegated send with a discovered authorization (`pg-btn-sendTx-delegated`) | reuse in scratch specs, never committed |
| A decimals lookup (for #106) | `TokenService.previewTokenMetadata` (`wallet/services/token/service.ts:767-786`) | not used: #106 is deferred |

Absence trails: no popup code classifies a scope refusal (searched `ScopeViolation|AuthRegistryRefusal|instanceof .*Error` in `popup/`, `composables/`: only `JobCancelledError`, `index.vue:441`). No path lets the popup settle a request with an error other than `UserRejectedError` (searched `rejectInteraction`, `resolveInteraction`, `settle(`, `cancel(` across `dapp-interaction/`, `window-manager/`, `popup/`). No class `CallBindingError` exists: the binding refusal is a plain `ScopeViolationError` (`contract-resolver.ts:108-110`). No e2e drives a registry refusal (searched `registry_refused`, `AuthRegistryRefusal`, `authorization registry` in `tests/e2e`). No Storybook story covers `popup/` (`.storybook/main.ts` globs).

## The paths (verified)

- **Where a refusal meets the window.** The registry refusal throws in `decodeAuthwitEffects` (`execution/decode-authwit-effects.ts:35-37`) on all three discovery paths: standalone discovery, the folded probe, the no-sender preview (`execution/dapp-send-executor.ts:486-607, 1326`). The call-binding refusal throws in `assertSelectorBinding` (`contract-resolver.ts:114-128`) from every build (`tx-request-builder.ts:209, 359, 617-624`) and from discovery (`authwit-discoverer.ts:197`). Both reach `withEstimateAdmission` (`execution/service.ts:666-700`), which rethrows the same instance.
- **Only these two plain-or-subclass scope refusals reach an estimate.** Every other `ScopeViolationError` thrower is the bridge's scope check (`packages/wallet-bridge/src/method-scope-checkers.ts`, `scope-enforcement.ts`, `dispatcher.ts:1139`), which runs at dispatch, before a window opens.
- **The window today.** `onError` logs and toasts "Couldn't estimate fee. Try again." unless the app pays (`popup/windows/execute/index.vue:163-169`); the preview's `onError` toasts "Couldn't preview authorizations. Try again." (`:211-214`). Confirm waits for the figure only when the person pays (`fee-figure.ts:32-38`), so with Sponsored it stays on. Reject calls `rejectInteraction(id, "User rejected")` (`:455-464`); the window's unload calls the same `reject` (`composables/useDappApprovalWindow.ts:91, 130`).
- **One operation per window.** The bridge builds every interaction with one operation (`packages/wallet-bridge/src/dispatcher.ts:516, 584, 629, 676`).
- **A new `.vue` under `popup/windows/execute/`** needs a row in `apps/extension/scripts/type-roles/surfaces.expected.json` (`inventory.test.ts:77`).

## Tests on the path

- `popup/windows/execute/index.test.ts` mocks `useFeeEstimationMap` and calls `opts.onError` directly (`:802-870`): the seam for the window's new cases.
- `execution/dapp-send-executor.test.ts:1783-1855` drives the registry refusal through the real decoder at both estimate paths and the preview.
- `tests/e2e/network/scope-refusal.test.ts` test 2 (`:89-160`) sends a call whose selector runs another function than its name. Today the estimate fails, the payer is Sponsored, Confirm stays on, and the test presses Confirm; the refusal then lands at execution. After the change the window refuses first, so this test moves to Reject. It asserts the 4100 envelope, `scope_refused`, and the title "Transfer (public)" from `refusalTitleOf`.
- `snack-placement.test.ts:412, 507-511` and `fixtures/send-burst.ts:51` read the estimate-failure toast of an unfunded send: not a refusal, unchanged.

## #104, #106, #777, #575 at HEAD

- **#104**: still true. `tx-request-builder.ts:194-205` records a `call` with no figure; `utils/tx-amount.ts:17, 68-87` reads an amount only for the three standard mint names with two arguments on a listed token of its pinned class.
- **#106**: still true. `txAmount` needs `pinnedListedToken` (`tx-amount.ts:38-40`). The issue's `Where` does not hold: `runFastArm` (`execution/helpers/batched-view-simulation.ts:548-566`) only simulates for the fee and authorizations; no mint display passes through it.
- **#777**: as written. The authorizations list (`popup/windows/execute/SendTxSummary.vue:104-111`) reads `Lets <caller> call <selector> on <consumer>` for a raw surface and never mounts `UnreadableArgsNotice`; the warning lives only in `CallArguments` under Show all details (`OperationCard.vue:380`); a failed decode batch marks every authorization `unavailable` (`index.vue:368-379`). No test fixture produces an `unavailable` authorization.
- **#575** (out of scope): its surface is the `send_transaction` card that `grantPublicAuthwit` opens (`OperationActionRow.vue`). p42-followups-1's report maps P42-19 to #514 and #719 and the `createAuthWit`, simulation and utility cards; it does not name #575.

## Collisions (open PRs at planning time)

- **#795** (consent-display-1 arc 2, in CI): edits `popup/windows/execute/index.vue` and `index.test.ts`, `dapp-interaction/service.ts` and `spec.ts`, `execution/service.ts`. Its hunks are in other regions (imports, token metadata, the approval binding at `:239`, `:374`; `execution/service.ts:963-1093`).
- **p42-followups-1 A1** (implementing): P42-07 B makes `DappApprovalFooter.vue`'s Confirm label wrap to two lines.
- **#793** (owner-feedback-1 arc 3): edits `OperationCard.vue` and `OperationCard.fee.test.ts`; this plan edits neither.
