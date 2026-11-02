# quality-execution-1 recon

Base: `origin/dev` at `93b9a2dfb`. Two Explore agents on Sonnet (a reuse sweep and a test-surface map), then the planner's own reads. All paths below are under `apps/extension/src/` unless they start with `apps/` or `implementations-plan/`.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| Executor lane typed from the class | `chainTip: Pick<ChainTipGate, "unconfirmed" \| "wait">` (`wallet/services/execution/transfer-executor.ts:129`, `dapp-send-executor.ts:239`), `sequencer: Pick<SendSequencer, "enterWaiter">` (`dapp-send-executor.ts:238`) | adapt: `Pick<ExecutionLane, …>` in the same style |
| One deps literal shared by two consumers | `reuseDeps: EstimateReuseDeps` (`execution/service.ts:387-397`), passed to both reuse caches | adapt: one read-deps literal for both send executors |
| A shared read-deps interface | none. Searched `Ports\b`, `interface .*Deps`, `extends .*Deps` in `wallet/services/execution/*.ts`; every `*Deps` stands alone | build new: one interface both executor deps extend; a new name is needed because no `*Ports` exist and the convention is `*Deps` |
| Executor with typed deps, wired by the facade | `ViewExecutor` (`execution/view-executor.ts:62-82`, wired at `service.ts:566-577`) | reuse as the template for `RegistrationExecutor` |
| Service lookup by spec name | `services.get(DAPP_SESSION_SERVICE_NAME)` (`service.ts:331`, type-only class import at :41); `EXECUTION_SERVICE_NAME` (`execution/spec.ts:16`), `AUTH_REGISTRY_SERVICE_NAME` (`auth-registry/spec.ts:5`); both classes set `static name` to the constant | reuse as-is |
| A narrowed registry view | `recordPendingAuthwits: AuthRegistryService["recordPendingAuthwits"]` (`dapp-send-executor.ts:223`); the builder's test stubs `{ assertWithinCap } as never` | adapt: `Pick<AuthRegistryService, …>` |
| Fee-option projection | `feeOptionsOf(route, opts)` (module-private, `execution/operation-planner.ts:95-113`), NO_FROM's inline literal (`dapp-send-executor.ts:1386-1403`), the embedded collapse in `execution/utils/fee-detection.ts:10-13` and again inside `feeOptionsOf` | adapt: one gas-field projection both build on; one embedded collapse |
| `NO_WAIT` return rule | `awaitRequested` (`dapp-send-executor.ts:1091-1098`), called by the standard path (:1086) and NO_FROM (:1015) since #1485 | already single; nothing to do |
| Post-send record | `sentTxRecorder` (`dapp-send-executor.ts:783-807`) with `indexGrants`; NO_FROM's inline `addTransaction` (:1350-1366) | adapt: NO_FROM calls `sentTxRecorder` |
| Live handles for a reused estimate | identical 6-step arm in `transfer-executor.ts:684-691` and `dapp-send-executor.ts:1216-1222`; `fenceChecks(this.deps, fence)` (`execution/execution-coordinator.ts:140-150`) is the deps-taking helper precedent | adapt: one function over the read deps, in `fenceChecks`' style |
| Confirm eligibility in the execute window | `approve()` guards (`popup/windows/execute/index.vue:473-490`) and `:confirm-disabled` (:732-744); `needsFeeSelection` (:585) | build new: one computed; no such computed exists (searched `confirmBlocked`, `canConfirm` under `popup/`) |
| Grant gating in the approval windows | `grantContentsOf`, `decodeGrantsOrUnavailable` (`popup/windows/execute/display-calls.ts`); `grantRefusalRow` (`execute/call-surface.ts:300`); `grantsPending` at `execute/index.vue:173-175` and `fee/index.vue:113` | adapt: one pending rule; the refusal is already single-sourced |

## Facts that shape the plan

- `DappSendExecutorLane` (`dapp-send-executor.ts:119-159`) restates 15 `ExecutionLane` members; `beginJournal` has no call (only a comment at :870); `recordBuiltCall` takes `Tx["calls"]` there and `readonly TxCall[]` on the class (`execution-lane.ts:683`). `TransferExecutorLane` (`transfer-executor.ts:77-95`) restates 7. `service.ts:446-455` and `:533-552` forward each through a closure. Executors call lane members as methods (`this.deps.lane.x(...)`) and pass `this.deps.lane` whole to `markFailedUnlessCancelled` (:417), so `lane: this.lane` binds `this` correctly.
- Eleven read deps are declared in both deps interfaces and wired twice (`service.ts:460-471`, `:521-532` plus `:557`). The widths differ: the dApp side reads `getActiveProfile(): Promise<{ id } | undefined>` and `getPendingForAccount(): { hash }[]`; the transfer side needs `ProfileInfo` (it calls `requireActiveProfile(this.deps)` at :801) and reads only `.hash` from pending rows (:431).
- `getNode`, `getPXE` and `getAccountContract` are read only in the two reuse arms (`transfer-executor.ts:686-689`, `dapp-send-executor.ts:1217-1220`).
- `txBuilder` is built at the end of `wireLaneAndTransferExecutor` (`service.ts:482-491`) and read eagerly by `DappSendExecutor` (:516), `ViewExecutor` (:569) and the fee-strategy deps (:344).
- The cycle: `execution/service.ts:29` value-imports `AuthRegistryService` for `.name` (:327); `auth-registry/service.ts:8-14` value-imports `ExecutionService` for `.name` (:137). Biome 2.5.13 `suspicious/noImportCycles` reports both edges today. Its `ignoreTypes` (default on) cuts only `import type`; `import { type X }` still counts. `src/wallet` has 7 more cycle warnings (task, logger), so widening the lint scope is a separate job.
- Execution reads the registry only through `assertWithinCap` (`tx-request-builder.ts:322`) and `recordPendingAuthwits` (`service.ts:559`).
- The registration block: `executeRegisterContract`, `executeRegisterSender`, `executeRegisterToken` (`service.ts:1115-1213`), `registrant`, `admitDappRegistration`, `executeAztecRegisterSender`, `executeAztecRegisterContract` (`:1254-1330`). It reads `networkService.getNetwork`, five `pxeService` methods, `tokenService.parseTokenInterface` and `addTokenAuthorized`, `profileService.captureExecutionFence`, and `dappSessionService.admitDappRegistration`; nothing of the lane, executors, caches, sequencer or tip gate. A stale TSDoc block that names no method sits at `:1226-1235`.
- `wallet/services/legal/call-sites.test.ts` pins the exact file set calling `.assertCurrent()` (`execution-coordinator.ts`, `execution/service.ts`, `wallet-sdk/background.ts`, `wallet-sdk/discovery-flow.ts`). No registration handler calls it.
- #1472: #1501 already moved the decode helpers into `execute/display-calls.ts` and `execute/operation-display.ts` (owner's comment on the issue). Open: one confirm list, and the per-window grant computeds.
- The execute window's Confirm is a native button in `components/composite/DappApprovalFooter.vue` (:59-65); `approve()` has no other caller in `execute/index.vue` (:746). So every `approve()` guard that the template also disables is unreachable from the window.

## Tests the plan moves or relies on

- Lane fakes: `dapp-send-executor.test.ts` harness at 218-228 plus overrides at 590-599, 1042-1053, 1091-1094; `feesettings-invariant.test.ts:23-74` (`satisfies DappSendExecutorDeps`); `service.characterization.test.ts:83-125`. `beginJournal` fakes at 222, 594, 1048, 1091, feesettings:39, characterization:83/113; the `not.toHaveBeenCalled` pins at `dapp-send-executor.test.ts:334` and `service.characterization.test.ts:187`. Transfer fakes: `transfer-executor.test.ts` 150, 448, 506; `transfer-executor.cancel-window.pins.test.ts` 56, 135.
- Registration internals reached by cast: `service.class-id.test.ts:67-110`, `register-bounds.test.ts:86-106`, `register-contract-account.real.test.ts:43-50`, `register-contract-void-conformance.test.ts:54-61`, `register-token.test.ts:42-54`, `service.fence-entry.test.ts` (its `register_token` Terms case and the facade fields it assigns). `register-counts.composition.test.ts` drives registration through the real facade and real `DappSessionService`.
- Order pins: `transfer-executor.cancel-window.pins.test.ts:100-125` (one microtask); `invocationCallOrder` pins in both executor tests; the dApp reuse arm pins `assertFence` before `getAccountContract` (`dapp-send-executor.test.ts:1578-1621`); no test pins `getNode`/`getPXE` on either reuse arm. NO_FROM's record (`Fr.ZERO`, `EXTERNAL`) is pinned near `dapp-send-executor.test.ts:2467` and :904-913. FPC byte-parity: `execution/fee/strategies-structural.test.ts:218`.
- Window holds: `execute/index.test.ts` covers fee selection (570-615, 797-823), estimates, payer short, token flag, metadata, cancelled, grants (1447-1584) and refusal (1586-1686), and calls `vm.approve()` directly; `fee/index.test.ts:376-435` covers the fee window's grant holds.
- E2E: no smoke file opens the execute or fee window. Network files that drive the touched paths: `tx-sendTx-default` (fee window), `tx-sendTx-noFrom`, `tx-sendTx-delegated-authwit`, `contracts-register`, `register-token`, `transfers`.

## Collisions

- PR #1568 (exec-window-1, open) edits `popup/windows/execute/index.vue` near the authwit preview props; arc 2's confirm list sits in other hunks. Arc 2 merges `origin/dev` after #1568 lands.
- quality-services-1 edits `auth-registry/service.ts` (#1436 sealing shell near :153-164, the purge matcher near :663-679); arc 1 touches only its import block and `init()`.
- quality-sdk-1's #1451 edits `execution-lane.ts:704-714`; this lane edits no line of that file.
- Closed #222 deferred the `NO_WAIT`, NO_FROM recorder and `resolveLiveHandles` extractions until order pins exist; arc 2 adds the missing pins first.
- No closed `known-limit` issue covers this area (searched "execution executor registration").
