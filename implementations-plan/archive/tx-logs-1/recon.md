# tx-logs-1 recon

Read at `961f90642` (origin/dev). Three read-only explorers (reuse sweep, logger pipeline, dApp request path), every claim below re-checked by hand. Paths are relative to the repo root; `E` = `apps/extension/src`.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| Blank 32-byte hex | `scrubHex32` (`E/wallet/logger/utils.ts:296`): `0x[0-9a-f]{64,}` and a run cut by `…`, plus bigints ≥ 2^128; only caller `E/offscreen/frame-logger.ts:9` | adapt: the export needs a stronger text scrubber (shortened forms from `trimAddress` `E/utils/string.ts:14` and `masked-address.ts:4`, unprefixed runs, 20-byte L1 addresses, a run wrapped by whitespace or an escaped newline). New `scrubReportText` beside it; `scrubHex32` stays as is for the PXE frame |
| Reduce URLs to scheme + host | `scrubUrls` (`E/utils/scrub-urls.ts:36`); `trim` already runs it on every string primitive (`utils.ts:199`) | reuse as is |
| Key-name redaction | `trim` + `REDACTED_KEYS` (`utils.ts:83-136`), static guard `E/utils/log-payload-ban.test.ts` | reuse; no new sensitive key is added |
| Random hex id | `randomIdNotIn(taken, length)` (`E/wallet/services/id-allocators.ts:69`), `getRandomHex` (`packages/wallet-core/src/utils/random.ts:9`) | reuse `randomIdNotIn(…, 8)` |
| Download a text file | `downloadFile({ data, filename })` (`E/utils/files.ts:36`), `.txt` → `text/plain`; e2e reads it with `armDownloadCapture`/`readCapturedDownload` (`apps/extension/tests/e2e/helpers/download-capture.ts`) | reuse both |
| Format one log line | `formatLogData`, `getLogLevelName` (`E/components/JsonViewer/logs-format.ts`) | adapt: move the two pure functions (and `formatArg`) to `E/wallet/logger/format.ts` so the worker can render; `logs-format.ts` re-exports them |
| Bounded store | `CircularBuffer` (`utils.ts`); no LRU class (searched `LruMap`, `BoundedMap`, `LRU`, `RingBuffer`, `MAX_ENTRIES`) | build new: a `Map` in insertion order, oldest evicted |
| Session persistence with purge | `LoggerStore` (`E/wallet/logger/store.ts`): debounced flush to `nulo:logs`, one serial queue, purge on Developer Mode off and Clear logs, `rehydrate` + `applyRetentionPolicy` | adapt: the same store writes, reads and purges a second key |
| Developer-mode gate | worker: `config.get("developerMode")` (as `store.ts:39`); popup: `showsDeveloperFields` (`E/popup/pages/detail-page.ts:9`) | reuse |
| Wallet version / browser | `__VERSION__` with the `typeof` guard (`E/wallet/services/account-integrity/coordinator.ts:21`); no `navigator.userAgent` use in `src` | reuse `__VERSION__`; build new a one-line browser name + major version from `navigator.userAgent` |
| Stage timings | `TaskService` tree: `createdAt/startedAt/finishedAt/error`, steps "Simulating transaction", "Generating proof", "Sending transaction" (`E/wallet/services/execution/execution-coordinator.ts:242-330`); in memory, 60 min, cleared on a profile switch | adapt: a task records its request's id, subtasks inherit it, finished tasks feed the capture |
| Journal transitions, prove backend | `OperationJournalService.onOperationAdded/onOperationUpdated` (`E/wallet/services/operation-journal/service.ts:342-680`); `progress.backend` written by `updateProvingBackend` (`:510-528`) | reuse the events |
| Golden text test | only the storage baseline (`E/wallet/storage/stored-shapes/baseline.test.ts`); no `toMatchFileSnapshot` (searched `toMatchSnapshot`, `__snapshots__`, `.golden`) | build new: `readFileSync` of a committed `.txt` fixture |
| Request id | none spans every method. The interaction id (16 hex, per window), the journal id (16 hex, top-level `sendTx` only) and `executeOperations`' 8-hex `traceId` (`E/wallet/services/execution/service.ts:942`, per operation, log text only) | build new: one id minted per message at ingress |

## The request path (what carries what)

- **Ingress** `E/wallet/services/wallet-sdk/wallet-message.ts`: `onWalletMessage` (:66) per decrypted message; the over-cap refusal (:183-201); the queued journal row for a top-level `sendTx` only (:125-128, `queued-journal.ts:193`); `handleWalletMessage` (:294) builds `SessionContext` per message (:347) and catches every failure into `response.error = toWalletResponseError(error)` (:383); `SESSION_INVALID_ERROR` is sent from the binding guard (:331).
- **Dispatcher** `packages/wallet-bridge/src/dispatcher.ts`: `ctx` reaches every handler and every batch leg; `DispatchHooks` deliberately does not reach batch legs (:358-365). Seven calls into the worker take an execution hooks bag or none: the generic path (:254), `handleSendTx` (:514), `createAuthWit` silent (:574) and windowed (:583), `registerToken` (:628), `grantPublicAuthwit` (:674), `requestCapabilities` (:773).
- **Interaction** `E/wallet/services/dapp-interaction/service.ts`: `execute` (:580) keeps `hooks` on the interaction record; the interaction id is the window's `?requestId=`; `approveInteraction` (:265) detaches the window and does not await `executeAndResolve` (:306), so a failure after approval never reaches the window.
- **Pre-approval work** `E/wallet/services/execution/service.ts`: `estimateOperationFee` and `previewOperationAuthwits` both run inside `refusalBound(interactionId, …)` (:757-786); they take no task.
- **Execution** `executeOperations` (:904) starts one root task per operation (:946); `dapp-send-executor.ts:337-338` fires `hooks.onJournalCreated(journalId)` after `claimOrCreateJournal`, for a claimed queued row and for a fresh one.
- **Envelope** `E/wallet/services/wallet-sdk/error-envelope.ts`: classified errors are `{ code, message, data: { walletErrorCode, … } }`; an unclassified one is the bare string `UNCLASSIFIED_ERROR_MESSAGE` (:215); the integrity refusal is `{ code: -32603, message: <the same text> }` with no `data` (:156-164). The dApp's SDK sends `new Error(JSON.stringify(error))` (`@aztec-labs/wallet-sdk` `extension_wallet.js:164-165`); the wallet-bridge README recipe parses `err.message` and handles a string or an object.

## UI surfaces

- **History detail** `E/popup/pages/journal/[id].vue:332-348`: the "Error (developer mode)" box, `v-if="showDevFields && (errorMessage || errorNormalizedRaw)"`, `showDevFields` = debug or developer mode (:227).
- **Execute window** `E/popup/windows/execute/index.vue`: failures before approval only: the wallet's refusal card `execute-op-refusal` (:735), the app's failing assertion under the fee card (`appFailures`, `OperationCard.vue:503`), the "Couldn't estimate fee. Try again." toast (:239) and the footer's processing error (`DappApprovalFooter.vue:43`). No developer-mode reference in the window today.

## Tests and e2e to match

- Envelope pins that change with a `data.walletTraceId`: `E/wallet/services/wallet-sdk/error-envelope.test.ts` (fall-through `typeof … "string"`), `apps/extension/tests/e2e/network/tx-sendTx-noFrom.test.ts:76` (`JSON.stringify(UNCLASSIFIED_ERROR_MESSAGE)`), `network/scope-refusal.test.ts` (`JSON.stringify(SCOPE_VIOLATION_ENVELOPE)`); the implementer greps the rest (`UNCLASSIFIED_ERROR_MESSAGE|_ENVELOPE|walletErrorCode` under `tests/`).
- `network/scope-refusal.test.ts` case 2 is the cheapest real failure that reaches both surfaces: a call-name mismatch shows `execute-op-refusal` in the window, Reject answers the dApp, and the History row fails as `wallet_refused`; no proof.
- Session keys: `E/wallet/storage/stored-shapes.scan.test.ts` `NOT_LOCAL_STORAGE` (:26) needs a row for a new `nulo:` session key.
- Log sources: `E/components/JsonViewer/useLogFilters.scan.test.ts` pins every logger source to `LOG_SOURCES`; this plan adds no source.

## Collisions and side findings

- No open issue covers this lane (`gh issue list --state all --search "logs request trace"`); closed known limits in the area (#929, #919, #920, #901, #900, #432) concern the viewer, not a capture.
- `dapp-send-executor.ts:1237` writes `additionalScopes` and the account address into a formatted debug string; the orchestrator files it separately. The export's scrubber blanks the addresses in it; the line itself is out of scope.
- `LogsViewer.vue:180` exports `logs.value`, not the `filteredLogs` computed at :44: a one-line change the lane brief allows.
- The interaction id's comment claims 128 bits; `randomIdNotIn(…, 16)` draws 64. Not this lane's.
