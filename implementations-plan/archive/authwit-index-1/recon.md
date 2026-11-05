# authwit-index-1: recon

One Sonnet explorer (reuse sweep, eight capabilities) plus the planner's own reads, at `origin/dev` `cdb61d0cf`. Paths are under `apps/extension/src/wallet/services/` unless they start with another root.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| The index write | `auth-registry/service.ts` `recordPendingAuthwits` (idempotent per hash in a scope, ids over the physical key space, `pending: true` with the tx hash) | reuse; add the deletion-epoch check (plan D3) |
| Its call site | `execution/dapp-send-executor.ts` `sentTxRecorder`: `await addTransaction(...)`, then the index write. Both grant-capable arms use it: `proveSendTransaction` (the `grantPublicAuthwit` route) and `proveStandardSend` (`aztec_sendTx`). NO_FROM builds none (`tx-request-builder.ts:467,479`); transfers record none | adapt (one site) |
| Where the items come from | `execution/tx-request-builder.ts:180-187` (`add_public_authwit` → `pendingAuthwitRecord`, `:544`), cap gate `assertWithinCap` inside the build, before any send (`:305`) | reuse as is |
| The shared send pipeline | `execution/execution-coordinator.ts` `proveAndSend`: commit `submitting` → `sendTxTask` (Terms check, `assertLive`, `node.sendTx`, `onSent`) → `recordTransaction` → `succeeded` | unchanged |
| Pending-row settlement | `reconcileFromTx` on `TransactionService.onTransactionUpdated`: proven success confirms, a settled revert removes, Dropped does nothing (documented residual) | reuse; driven by History rows only |
| History's guard | `transaction/service.ts:292-294` `addTransaction`: the fence's deletion epoch, then the owning account, under the tx lock; `profile/profile-deletion-state.ts` (`assertCurrent`, epochs never go back) | the epoch check mirrored in the index write; the account check not (D3) |
| A failed send's later reading | `operation-journal/send-check.ts`, `spec.ts` `isSendCheckable` / `wasNeverSent`; verdicts `sent`, `reverted`, `unconfirmed`, `expired`, `refused` | arc 1 does not read them; OA-1's B would |
| Cancel after `submitting` | `packages/wallet-core/src/jobs/fsm.ts:51-52`: `submitting` → `succeeded` or `failed` only; `execution-lane.ts` `cancelJob` aborts nothing once the transition is refused | fact for OA-1 option A |
| Composition harness | `apps/extension/tests/helpers/execution-graph.ts` (real `ExecutionService`, lane, coordinator and journal over `FakeBrowserApi`; `authRegistry` and `transactions` are stubs); `execution/service.composition.test.ts` (fake PXE `proveTx` → `toTx`, fake node `sendTx`, `failSimulationAfterBuild` spies the build) | reuse; a recording `recordPendingAuthwits` stub and a rejecting `addTransaction` |
| Restart staging | `tests/e2e/helpers/profile-chaos/restart.ts`, `tests/e2e/network/inflight-call-background-death.test.ts` (at the proof gate), `tests/helpers/profile-chaos-in-process.ts` (session services) | arc 1 needs none; arc 2 builds its own |
| Grant e2e | `tests/e2e/network/authwit-lifecycle.test.ts` (grant via `pg-btn-grantPublicAuthwit`, consume, revoke, registry toggle), `authwit-consume-smoke.test.ts` | reuse as the gate |
| The list | `popup/components/modules/settings/authwits/AuthwitCard.vue:26` shows a `Pending` chip for `pending` rows (owner pick #698 B) | unchanged |

## Prior decisions in this area

- `archive/harden-security-fixes-3/` Phase 2 designed the write before the broadcast (`commitSubmitting` then the index; a `sent` flag; rows removed unless the node accepted). Its OWNER-ASKS OA-6 put it to the owner, who picked B, P65-06 (2026-10-19): "Keep today's order: list them after History records the send." The same plan rejected a send-check reconcile without approval (a cross-service subscription and a recovery policy).
- Closed known limits read: #780 (stale Pending chip on an open page), #695 (one row per hash), #430, #397. None covers this change.

## Docs a change here touches

- `execution/dapp-send-executor.ts` `sentTxRecorder` doc ("One post-send closure owns BOTH the activity record AND the public-authwit index write, so the ordering is explicit") and the `recordPendingAuthwits` dep doc.
- `auth-registry/service.ts:229` (the write's doc), `:166-174` (`reconcileFromTx` residual), `auth-registry/spec.ts:41-45` (the `pending` field), `execution/tx-request-builder.ts:28, 95, 541` ("recorded POST-send"). Arc 1 keeps all of them true; option A of OA-1 would rewrite them.
- `SECURITY.md:290-293` (a public authorization a dApp obtains is in the wallet's index) stays true.
