# dapp-disconnect-1: recon

At `f738cba62`. One Explore agent (sonnet) traced the fee question; the planner read the rest. Paths are under `apps/extension/src/wallet/services/` unless named.

## The fee question, end to end

- **Asked.** `DappSendExecutor.askAboutFee` (`execution/dapp-send-executor.ts:943-972`) parks the send and runs `askFeeAgain` (`execution/fee-reask.ts:89-108`). That writes the row `{ stage: "queued", reask }`, then `onAsked` calls `ExecutionService.askInWindow` (`execution/service.ts:879-891`), which calls `DappInteractionService.askFeeAgain` (`dapp-interaction/service.ts:465-483`). It reads `this.approved` (filled by `executeAndResolve`, `:378`) and opens the `"fee"` window through `interaction()` with `hooks.queuedJournalId` set to the send's row.
- **Declined.** The window's `reject` (`popup/windows/fee/index.vue:209-212`) calls `rejectInteraction(id, "User rejected", end)`. `endInteraction` deletes the record, then `windowManager.cancel` rejects the window's promise (`dapp-interaction/service.ts:228-231`). `askFeeAgain` does not catch. `askInWindow` turns every rejection into `false` (`.catch(() => false)`, `execution/service.ts:884`) and calls `lane.cancelQuestion` (`execution/execution-lane.ts:447-451`). That cancels only while the row still asks that fee, through `cancelJob` (`:205`): journal `cancelled` first, then the controller aborts. The waiter ends `"aborted"`, and `fee-reask` throws `JobCancelledSentinel`: nothing is proved or broadcast.
- **Closed, timed out, never opened.** Each rejects the same promise, so each takes the same branch. `execution/service.composition.test.ts:1720-1730` pins "a refusal" and "a window that closed or never opened" against a fake `askFeeAgain`.
- **Row.** `cancelled` with no `error.kind` reads "Cancelled" / "This transaction was cancelled." (`src/utils/journal-state.ts:100`, `:229`).
- **The dApp.** The window's error never reaches the send: `askInWindow` swallows it. The send ends on the sentinel either way, so a disconnect and a decline give the dApp the same answer. The app's channel is gone anyway (`wireSessionTeardown`).

## Today's skip

- `endRequestsOfApp` (`dapp-interaction/service.ts:196-208`) skips `isFeeQuestionPayload` at `:202`.
- The re-read after registration skips it too, at `:692`.
- `dapp-interaction/service.composition.test.ts:297-311` pins "a fee question of the app's approved send stays open". It opens the question through `internals.interaction("fee", …)`.

## Harnesses

- `dapp-interaction/service.composition.test.ts` `makeHarness` has a real `DappInteractionService`, `WindowManager` and journal, plus stubs for profile, network, account, session (with real `EventHandler`s) and execution. The execution stub has only `executeOperations`, so no fee question can open through it.
- `tests/helpers/execution-graph.ts` `startExecutionGraph` builds the real `ExecutionService` (lane, `queuedFeeAnswers`, executors) over the real journal. It stubs the session service as `{}` (`:81`) and the interaction service through `svc()` (`:88`). `svc()` spreads a plain object, so a class instance cannot pass through it.
- `FakeBrowserApi.reset()` resets a shared fake browser (`packages/wallet-core/src/testing/fake-browser-api.ts:316-320`). So a second instance's reset wipes the first one's storage.
- `dapp-interaction/service.approval-binding.test.ts:319-345` (`asking()`) drives `askFeeAgain` by stubbing `executeOperations` to call it, with materialize stubs (`getNetworks`, `getAccount`).

## Other facts

- Session ids are random (`dapp-session/service.ts:236`), so a connection made after a deletion gets a new row id, and a re-read keyed on the old id finds nothing. A remembered reconnect keeps its row.
- `tx-sendTx-default.test.ts:120-232` opens the real dApp fee window (`waitForPopup(ctx, "fee")`) by approving half the estimate, then accepts; a grep for the route string misses it. No e2e disconnects while it is open. The app's own disconnect (`session-explicitDisconnect`) keeps its row, so `endRequestsOfApp` never runs there.
- `ARCHITECTURE.md:189` names the fee question only among the windows a restart ends. No doc states the disconnect skip.
- Known limit #1413 (closed) covers two timings inside a request's own awaits. Its case 2 applies to a fee question in the same way once the skip goes.
