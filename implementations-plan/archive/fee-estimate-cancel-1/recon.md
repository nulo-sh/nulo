# fee-estimate-cancel-1: recon

Base `origin/dev` at `b3d6e0a2a`. One Sonnet explorer (reuse sweep, eight capabilities) plus the planner's own reads. Line numbers are at the base.

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| End the window's unfinished estimates and keep the handed-off ones | `createFeeEstimationEngine().dispose()` (`apps/extension/src/composables/internal/fee-estimation-engine.ts:182-190`): clears every debounce timer, aborts and remote-cancels every started run and every completed token not handed off, then marks the engine disposed so every later settle is stale and no sink fires. Pinned by `useFeeEstimationMap.test.ts:76` ("(ASYMMETRY PIN) … IS remote-cancelled on dispose"). | adapt: return a promise that settles once every remote cancel it sent has settled; refuse `schedule` once disposed |
| An acknowledged remote cancel | `ExecutionServiceClient.cancelEstimate` resolves only after the worker's handler resolved (`packages/extension-messaging/src/core/base-client.ts:105-227`, `core/base-service.ts:92-130`); the handler runs `EstimateCancelRegistry.cancel` synchronously after two awaits (`apps/extension/src/wallet/services/execution/service.ts:732-737`), which aborts an active entry's controller (`estimate-cancel-registry.ts:197-217`). | reuse as is |
| A bounded wait before a window closes | `endAndClose(send)` (`apps/extension/src/composables/useDappApprovalWindow.ts:121-135`): detaches the unload rejection, waits for `send` or `END_ACK_TIMEOUT_MS` (3 s), then closes. | reuse as is |
| A cancel check between a build and its simulation | `ctx.signal` checks sit only before a rebuild (`fee/fpc-strategy.ts:178, 244, 255`, `fee/fee-juice-strategy.ts:47`); every build goes through `buildFor` (`fee/fee-strategy.ts:227-236`, 9 callers, all strategies). | adapt: one check at the end of `buildFor` |
| Strategy test harness | `fee/strategies-lifecycle.test.ts`: `harness()` (lines 99-130) with `abortOnFirstSim`, `FOLD_MATRIX` (313-346) of builds and simulations per path and cell, the cancel pins at 369-386. | adapt: an `abortOnBuild` option and one `test.each` |
| Window approve tests | `apps/extension/src/popup/windows/execute/index.test.ts` mocks `useFeeEstimationMap` (59-79, `dispose: vi.fn()` already in the mock) and orders events through `callLog` and `windowsRemoveMock` (`tests/helpers/approval-window-harness.ts`). | adapt: approve-order tests |
| A composition test of the window and the worker's estimate path | none. `tests/COMPOSITION-TESTS.md` D2, D3 and D6 forbid a simulation, a built `TxExecutionRequest` and bb in that layer; no harness mounts a popup window over the worker's service graph (searched `*.composition.test.ts` under `src/`, 12 files, and `estimate-hold.integration.test.ts`, which stubs `dappSendExecutor`). | not built: covered by the unit, component and e2e layers (plan D5) |
| Counting the wallet's public simulations in an e2e run | none committed. `tests/e2e/global-setup.ts:585-595` forwards only node lines naming "Aztec", "ready" or "error". The node logs `Simulating public calls for tx <hash>` at verbose under `node:public-calls-simulator` (Aztec 6.0.0-rc.3, `aztec-node/dest/aztec-node/node_public_calls_simulator.js:138`) and `Simulated tx <hash> fails: …` at warn (`:170`). | scratch instrument, never committed (plan Phase 3) |

## Facts the plan rests on

- No code unmounts the popup app: no `app.unmount`, `pagehide` or `unload` handler under `apps/extension/src` (grep `unmount()`, `pagehide`, `"unload"`). `closeWindow(true)` → `closeCurrentWindow()` → `chrome.windows.remove` (`apps/extension/src/utils/close-current-window.ts:2-5`). So `onScopeDispose(engine.dispose)` and the window's `onUnmounted` never run when an approval window closes, and the execute window's own reject path says so (`index.vue:516-518`).
- `approve()` (`index.vue:447-500`): `handoffFeeEstimates()` and `handoffAuthwitPreviews()` hand over completed estimates only; then `approveInteraction`, `scopeFollow.follow`, `closeWindow(true)`. No cancel is sent on this path.
- Confirm does not wait for an estimate when the person's pick is a sponsor (`fee-figure.ts:40-45`, `payer?.type !== "fpc"`), the default `authwit-lifecycle` takes (`approveExecute(popup)` with no fee method).
- The worker's `approveInteraction` has no await before it starts execution (`dapp-interaction/service.ts:229-271`); `executeAndResolve` runs detached.
- Without a reused estimate, a sponsored first send on the fast path runs a stubbed and a validated simulation (`FOLD_MATRIX` row "fpc fast path, init"); a reused one runs none (`dapp-send-executor.ts:1139-1176`).
- `EstimateCancelRegistry.cancel` on a token not yet admitted is a silent no-op (`estimate-cancel-registry.ts:197-217`).

## Collisions

- `useFeeEstimation` (single-slot, `send.vue`) shares the engine; its `cancelRemote` callers stay fire-and-forget, and a `void` return stays assignable to the widened type.
- Open issues in the area: #989 only. Closed known limits: #398 (admission counted per profile across chains), #397 (revoke over 12 chunks): neither overlaps.
