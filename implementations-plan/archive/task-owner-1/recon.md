# Recon: task-owner-1

Read at `origin/dev` `9c913679b`. One Sonnet explorer (reuse sweep) plus the lead's own trace of every creator. Paths are under `apps/extension/src/wallet/services/` unless they say otherwise.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| The registry's own profile, cleared on a switch | `task/service.ts:39` `profile`, set at start (`:49-52`, the silent-restore pull) and by `onActiveProfileChanged` (`:268-276`); a lock (`undefined`) leaves it; only a different profile clears | reuse as-is: the insertion check compares against it |
| A synchronous "is this fence live" | `profile/service.ts:567` `isFenceLive` (serial, profile, epoch; no lock) | not used: several creators hold no fence, and a lock and an unlock of the same profile keep its tasks by design |
| Session publish and the profile event in one step | `profile/session-manager.ts:327-336`: `activeSession` is set, then `onChange` runs synchronously in the same block | reuse: no tick exists in which a new session is live and the registry still names the old profile |
| "This task is no longer tracked" idiom | `WrappedTask.exists` / `completeIfTracked` (`task/wrapped-task.ts:32,57`), `hasTask` in `token-balance/balance-job-queue.ts:123,281,448`, `transaction/service.ts:370` | reuse: a refused root reads as untracked |
| A step that runs untracked without a parent | `transaction/service.ts` `waitForTx` (`parentTask?.startSubtask` inside try/catch; it never creates a root) | reuse its shape for the coordinator's three step wrappers |
| Call-site scan | `legal/call-sites.test.ts` (exact file set by regex), `utils/toast-call-sites.test.ts` (`callsTo` from `apps/extension/scripts/type-roles/source-code.ts:191`, per-argument checks, a floor, a self-test) | adapt: copy the toast scan's shape |
| A started registry over a stub profile service | `task/test-task-service.ts` `startedTaskService` (6 users) | reuse; its stub already answers `getActiveProfile` |
| A real registry beside a revoke | `auth-registry/service.test.ts:933-948` (`revoking()`, `internals.taskService = tasks`) | reuse for the reproducer |
| Owner on the `Task` record and read-side filtering | none: `task/spec.ts:22-36` has no owner; no consumer filters by profile | build nothing: insertion keeps the registry single-profile, as the clear already does |

Absence trail for the last row: `git grep -n -E "profileId|owner" -- apps/extension/src/wallet/services/task`, and every consumer below.

## Root-task creators (non-test), and what each holds

| Site | Content | Profile in scope at creation | Note |
|---|---|---|---|
| `auth-registry/service.ts:429` `revokeAuthwits` | `RevokeAuthwitsContent` (row ids and row keys) | `fence` captured first | created after `await revokeOperation(...)` |
| `auth-registry/service.ts:482` `setRegistryEnabled` | step "Enable/Disable auth registry" | `fence` | created after `await getNetwork` |
| `auth-registry/service.ts:522` `checkRegistry` | step "Sync auth registry" | `scope.profileId` (the network row's) | created after `syncRegistry`'s `await getNetwork` |
| `execution/service.ts:1027` `executeOperations` | `ExecuteOperationContent`, dApp origin, trace id | `authorizedFence` on every in-tree caller (`dapp-interaction/service.ts:457,797`, `packages/wallet-bridge/src/dispatcher.ts:259,586`); none on the RPC form (`execution/spec.ts:73`), which no page calls | op N>0 is created after op N-1's awaited work |
| `execution/transfer-executor.ts:210` | `TransferContent` (sender, recipient, amount, network) | `fence`, captured in `executeTransfer` (`execution/service.ts:668`) after `ensureInitialized` and the Terms read | the popup composed the request before the fence exists |
| `execution/execution-coordinator.ts:261,287,325` | steps "Simulating", "Generating proof", "Sending" | none | every production caller passes a parent: strategies pass their estimate task; `dapp-send-executor` and `transfer-executor` pass the operation's task (`execution/service.ts:1025-1027,1107,1152`; `auth-registry/service.ts:437,484`; `transfer-executor.ts:260`); `executeSendTransaction` is not an RPC (`execution/service.ts:201-216`) |
| `execution/fee/fee-strategy.ts:429` `startEstimateTask` | step "Estimating fee" | `ctx.fence` (`FeeStrategyContext`, `fee-strategy.ts:142`) | root on estimate paths |
| `execution/tx-request-builder.ts:169,441` | step "Processing transaction" | `fence` parameter | root on estimate paths |
| `token/service.ts:777` `parseTokenInterface` | step "Parsing token interface" | `network.profileId`, from the network the parse reads | root from the popup RPC and the seeder (`:863`) |
| `token-balance/balance-job-queue.ts:149,282` | `BalanceUpdateContent` (balance id, account) | `balance.profileId` (`token-balance/spec.ts:35-41`) | `startBatchTasks` runs outside `syncBatch`'s try/finally, so a throw there drops the batch (its comment, `:270-280`) |
| `task/wrapped-task.ts:15,19` | subtasks | the parent | not root creators |

## Registry readers

- RPC `getTask`, `getTasks` (`task/service.ts:29`): all roots, no filter.
- Events `onTaskCreated`, `onTaskUpdated`, `onTaskDeleted` reach the popup through `task/client.ts`.
- Popup: `composables/useExecutingTask.ts` (a `Transfer` or `ExecuteOperation` root and its processing subtask labels, via `RecentActivityView.vue`), `useBalanceTasks.ts` (balance roots, by account), `useRevokeTasks.ts` (revoke roots), `useTokenImport.ts` (balance updates). No surface renders a root step.
- Background: `wallet/request-captures.ts` (a finished task with a trace id adds a stage to the request log), `incoming-transfer/balance-outbox.ts:172-183` (`getTaskSync` by id), `token-balance/balance-job-queue.ts` (by id).

## Start-up order

`ServiceCollection.start` runs services in dependency phases (`packages/wallet-core/src/base/index.ts:69-80`) and RPC handlers are live while it runs (`apps/extension/src/wallet/runtime.ts:279-287`); a request waits only for its own service's `init` (`packages/extension-messaging/src/core/base-service.ts:65-83`). `ExecutionService` and `AuthRegistryService` declare no dependencies (phase 0); `TaskService` declares `ProfileService` (phase 1); `TokenService` (phase 2) and `TokenBalanceService` (phase 3) start after it.

## Collisions

- `wallet-followups-9-decimals` edits `token/service.ts` at lines 3, 47 and 1076; this lane edits 772-790.
- The parked `authwit-grant-build-1-a1` edits `auth-registry/service.ts` up to line 340; this lane edits the three creators at 425-525.
- Closed known limits searched (`gh issue list --state closed --label known-limit --search "task"`): #1629 and #1628 (balance-row presentation) touch the balance queue's timing, not ownership.
