# Recon: harden-security-fixes-5

Read at `origin/dev` `fe2a12524`. Two Explore agents (sonnet): one over the dApp boundary, the batch path and the task registry; one over the execute window and incoming transfers. The planner re-read every claim used below.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| Check a content-script message's id against what the handler holds | `admitContentMessage` (`wallet/services/wallet-sdk/content-admission.ts:62-123`) already binds a key exchange to its discovery (`keyExchangeFromItsDiscovery`, `:130-138`) and answers a session-bound message from a tab that does not hold it (`replyIfStale`, `stale-session.ts`); the handler exposes `getSession` and `getPendingDiscovery` (`background.ts:101-102` wires both) | adapt: one more admission check, beside the two |
| A two-tab test on the real SDK handler | `background.transport.test.ts` (`boot`, `establish`, `approve`, `sender(tab)`, `OTHER_TAB`); `fakeSdkPorts(over)` lets a test capture `onRemoved` | reuse |
| A log line that must not carry a value | `trim()` blanks by key name and projects an `Error` to a capped `{ name, message }` (`wallet/logger/utils.ts:185-200`); the logging policy: a message that can hold any text logs a fixed category | reuse; no new key in `REDACTED_KEYS` |
| The static log guard | `utils/log-payload-ban.test.ts`: denied names from `REDACTED_KEYS`, `URL_KEYS`, three flatteners; its header lists aliasing and helper indirection as its false negatives | keep as is (D3) |
| Pace discovery | `VerifyAdmissionGate` (`wallet-sdk/verify-admission.ts`): a per-origin token bucket (3 tokens, one per 20 s) with idle-origin eviction, but bound to verify-window reservations, a FIFO queue and deadlines | adapt its refill arithmetic and eviction rule for a lighter gate (arc 2) |
| Bound a batch | `argsBatch`, the batch's arity guard (`packages/wallet-bridge/src/method-descriptors.ts:106-110`); `handleBatch` re-enters `dispatch` per leg (`dispatcher.ts:474-481`); the nested-batch characterization (`dapp-grant.characterization.test.ts:312`) changes with P4 | adapt `argsBatch` (arc 2) |
| Keep the task registry bounded | `cleanupStaleTasks` and `deleteTaskTree`, which emits `onTaskDeleted` (`wallet/services/task/service.ts:200-244`) | reuse both (arc 2) |

## Measurements behind the arc-2 numbers

- **Discovery cadence.** `@aztec-labs/wallet-sdk` 6.0.0 posts one discovery per `discoverWallets` call (`dest/extension/provider/extension_provider.js:156`), with a fresh id, no retry and no interval; the call waits up to 60 s (`:5`, `DEFAULT_DISCOVERY_TIMEOUT_MS`). `WalletManager.getAvailableWallets` calls it once. `apps/playground` discovers once per Connect press (`src/lib/wallet.ts:72-105`). A dropped discovery gets no reply today either: `rejectDiscovery` sends nothing (`dest/extension/handlers/background_connection_handler.js:150-157`).
- **Batch legs.** The SDK's `batch` input schema excludes `batch` itself, so a stock client cannot nest one. aztec.js 6.0.0 `BatchCall.simulate` sends one wire batch: one `executeUtility` leg per utility call plus one `simulateTx` (`dest/contract/batch_call.js:70-101`), with no limit. `apps/playground` sends batches of 3, 3 and 2 legs (`src/sections/batch.ts`).
- **Registry readers of finished tasks.** `balance-outbox.ts:175-187` maps an absent task to `missing`, which re-marks the row dirty (another refresh, no loss); `useRevokeTasks` shows a finished revoke's result; `request-captures.ts` reads the task it is handed in `onTaskUpdated`. None of them reads a finished task created for a dApp.

## Collisions

- `harden-security-fixes-4` arc 2 changes `TaskService.init` (`wallet/services/task/service.ts`); arc 2 here plans on top of it and starts after it merges.
- `contact-names-1` and `backup-contracts-1` touch none of these files.
- Closed known limits read: #371 (a session's pending bound is a count, not a memory budget), #606 (a verify-window slot can outlive its check), #440 (a note receipt settled by a finalized tip). None covers the changes here.
