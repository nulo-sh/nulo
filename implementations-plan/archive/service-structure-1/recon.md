# service-structure-1: recon

Read at `dev` 0fe841be (2026-10-17). Three explorers: two Sonnet sweeps (#560 and #549; #545 and #547) and the driver's own read of #521. Paths are relative to `apps/extension/src` unless they start with `apps/`, `packages/` or `implementations-plan/`. The issues cite 110446a4; every line below is re-read at 0fe841be. Later arcs start after other lanes edit these files: the implementer re-reads every line at the arc's base.

## Issue claims checked against the tree

| Issue | Claim | Holds? |
|---|---|---|
| #521 | Two activation waiters; import's ignores a recorded failure and waits up to 30 s | Yes. `composables/waitForProfileActive.ts:30-47` watches `isLogined` and `profile.id` only; `popup/pages/import.vue:77-81` passes `timeoutMs: 30_000`. `composables/unlockWait.ts:68-104` adds the failure and supersede signals. |
| #521 | "First confirm that the shell records `bootstrapFailure` on the import path" | Yes. Popup import activates through the same listener as unlock: `popup/app.vue:282-308` runs `runFencedBootstrap`, whose failure writes `appStore.bootstrapFailure` (`popup/profile-bootstrap.ts:19-29`). |
| #545 | About 20 discovery functions use only `DiscoveryDeps` | Yes, plus stateless module constants and imports (`wallet-sdk/background.ts:844-1373`, 1,541 lines). |
| #545 | Six session-keyed maps end through a hand-written delete list | Partly. Four maps plus `KeyedLock` and `VerificationHolds` are session-keyed; `admission` is keyed by request id and has its own `onSessionGone` (`:572-579`). |
| #547 | The outbox depends only on the repository, TaskService, TokenBalanceService and the lock | Yes, plus `profileService.getActiveProfile` and `logWarn` (`incoming-transfer/service.ts:2586-2720`, 2,897 lines). |
| #549 | Two identical send-case bodies in `materialize.ts` | **No.** They are one fall-through arm at 0fe841be (`dapp-interaction/materialize.ts:69-82`). |
| #549 | `validateSession` has no `default` | **No.** It has a `never` default that refuses an unknown kind (`dapp-interaction/service.ts:757-761`), pinned by `service.test.ts:719`. |
| #549 | The execute window's `index.vue` holds the same lists | **Moved.** The switch is `popup/windows/execute/operation-display.ts:42-95`, whose default is a plain throw, not `never`. `index.vue` keeps kind `if`s: `isAppPaid` (`:173-174`), the fee seed (`:276-280`), the fee-settings guard (`:390`), the approve delta (`:427`). |
| #549 | Only `OPERATION_ACCESS_LEVEL` is compiler-checked | **No.** `materialize.ts:84`, `service.ts:759` and `execution/service.ts:1016` are `never`-exhaustive. Scope is also type-enforced: network requests carry `chain`, account requests carry `account`. Not checked by anything: `operation-display.ts`'s default, and which kinds carry fee settings (`index.vue`, `execution/service.ts:158-165` `FEE_SETTINGS_OF`). |
| #549 | The union lives in `dapp-interaction-protocol.ts:115-135` | Partly. That is `OperationRequest`; `OperationKind` is `packages/wallet-bridge/src/operation.ts:13`. |
| #560 | `finalizeGasLimits` takes eight positional arguments; callers pad with `undefined` | Yes (`execution/fee/fee-strategy.ts:297-306`). There are five production calls; about 30 test calls are in three files. |
| #560 | `handleWalletMessage` takes twelve | Yes (`wallet-sdk/background.ts:1391-1404`). There is one production caller (`:738-784`) and four test files. |
| #560 | The restore commits take eight each | Yes (`profile/service.ts:2314-2323`, `:2480-2489`). Each has one caller, and no test calls them directly. |
| #560 | The two estimate-reuse dependency interfaces are identical | Yes, field for field (`execution/operation-estimate-reuse.ts:67-77`, `execution/transfer-estimate-reuse.ts:95-104`). `execution/service.ts:346-363` wires two identical literals. |

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| Activation wait with the failure signal | `awaitProfileActivation` (`composables/unlockWait.ts:68`); its suite covers every case of the twin's (`unlockWait.test.ts:19-125`) | reuse as is |
| Same-profile bootstrap single-flight | `runBootstrapCore` (`composables/useProfileBootstrap.ts:189-212`): recovery joins a live run of the same profile | reuse as is (no new guard needed) |
| Per-kind table checked by the compiler | `OPERATION_ACCESS_LEVEL: Record<OperationKind, AccessLevel>` (`dapp-interaction/service.ts:95-117`); `satisfies Record<…>` precedents `token/functions/descriptors.ts:443`, `execution/operation-planner.ts:47` | adapt the pattern |
| Network/account kind partition | `packages/wallet-bridge/src/method-descriptors.ts:51-67`: the dispatcher's RPC routing, 7 + 3 kinds, not the 18 operation kinds | not reusable (other concept); do not merge |
| Exhaustiveness helper | none: searched `assertNever`, `unreachable(`, `exhaustive`, `: never =` over `apps` and `packages`; six inline `const x: never = y` sites | keep the inline idiom |
| Parameter-object precedent for fees | `feeCapFor(node, rule)` (`execution/fee/fee-cap.ts:24-35`), called inside `finalizeGasLimits` | adapt |
| Parameter-object precedent in `background.ts` | `discoveryDeps(deps, state)` (`:863-882`) | adapt |
| Shared estimate-reuse module | `execution/estimate-reuse-shared.ts` holds `ChainIdentity`, `ReuseEntryBase`, the TTL cache; no deps type | add the type there |
| Sibling-module convention in `wallet-sdk/` | free functions with an exported `XxxDeps` of `Pick<…>` slices; classes only where state lives (`verify-admission.ts`, `verification-hold.ts`); a sibling `.test.ts` drives the function with fakes | follow |
| Sibling-module convention in `incoming-transfer/` | pure free functions (`note-reconcile.ts`, `arrival-state.ts`, `scan-health.ts`); stateful helpers are small classes (`ScanEpisodeStore`, `PublicEventIndexer`) built in the constructor or `init` | follow |
| Outbox tests | `incoming-transfer/service.scenarios.test.ts:3450-3666` (write side and causal-ack drain, through `(service as …)` casts) | move the drain state machine to the class suite; keep the write-side and init-drain cases |

## Collision map (branches read with `git diff`, plans with `git show`, 2026-10-17 17:20Z)

| Issue | Files it edits | Running lane on those files |
|---|---|---|
| #521 | `popup/pages/import.vue`, `popup/pages/import.test.ts`, `composables/waitForProfileActive{,.test}.ts` | none. onboarding-3 edits `onboarding/pages/import.vue` and the import e2e specs, which this arc does not edit. |
| #545 | `wallet-sdk/background.ts`, new `wallet-sdk/discovery-flow.ts`, `wallet-sdk/session-holders.ts` | dapp-boundary-2 (PR #679: `background.ts`, `discovery-approval.ts`) |
| #547 | `incoming-transfer/service.ts`, `service.scenarios.test.ts`, new `balance-outbox.ts` | storage-privacy-1 (`service.ts`, `service.scenarios.test.ts`, `spec.ts`); test-infra-1's #540 plans the scenario suite (planning now) |
| #549 | `dapp-interaction/{materialize,service}.ts`, `popup/windows/execute/{operation-display.ts,index.vue}`, `execution/service.ts` (`FEE_SETTINGS_OF`) | execution-integrity-1 (`execution/service.ts`, its plan names `FEE_SETTINGS_OF`); dapp-boundary-1 and -2 (`execution/service.ts`) |
| #560 | `execution/fee/*.ts`, `execution/dapp-send-executor.ts`, `profile/service.ts`, `execution/{operation,transfer}-estimate-reuse.ts`, `execution/service.ts`, `wallet-sdk/background.ts` | execution-integrity-1 (`transfer-estimate-reuse.ts`, `execution/service.ts`); dapp-boundary-1 (`execution/service.ts`); dapp-boundary-2 (`background.ts`, `execution/service.ts`) |

No other lane edits `execution/fee/*`, `dapp-send-executor.ts`, `profile/service.ts`, `dapp-interaction/*` or `popup/windows/execute/*` today.

Closed known limits the moves must keep exactly as they are (`gh issue list --state closed --label known-limit --search …`): #443 (a section the incoming-transfer lock's watchdog displaces keeps writing; the outbox's ticket checks exist for it), #606, #681 and #682 (discovery: a verify-window slot, a wait across a profile switch, a connect row kept for a gone duplicate). None found for activation waits, operation kinds or fee finalization.
