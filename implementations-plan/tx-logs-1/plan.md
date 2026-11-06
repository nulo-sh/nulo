---
plan: tx-logs-1
tier: mid
status: approved (Codex reject → folded; Opus conditional approve → folded; final fresh Codex pass approve with nits, round 3)
issues: none; the work is the owner's picks P116-15 B and P117-03 A
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: origin/dev at 961f90642
trunk: dev
post_implementation_hardening: not scheduled
---

# tx-logs-1: developer mode downloads the logs of one failed request

The wallet mints an 8-hex `walletTraceId` when a dApp message arrives and returns it in every error the dApp gets. In developer mode it keeps that request's tagged log lines and a timeline of its stages. A developer downloads `nulo-request-<8 hex>.txt` from the History detail of a failed send or from the execute window's failure block. Recon: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md). Consults: [lessons/phase-0.md](lessons/phase-0.md).

## Sign-offs

- **P116-15 B** (page 116, 2026-11-06 17:04 UTC): "A, plus a random walletTraceId returned to the dApp in the error envelope's data, so a developer can quote it and find the request in the wallet (a dApp-facing wire change that reveals nothing about the wallet)." A: "A trace id minted when a request enters; every tagged line and a structured timeline (journal transitions, prove phases, the error envelope) kept per request in the log store (about 300 lines or 64 KB each, 50 requests, memory plus session storage in developer mode); 'Download logs' on the History detail of a failed send and on the execute window's failure block; a scrubbed .txt." The owner's note: "provide some proposals on how you'll do it. a ".txt" or csv? or… whatever logs already use?"
- **P117-03 A** (page 117, 18:18 UTC): "One .txt per request: a header (wallet version, browser, network name, the trace id, the dApp's origin host), the timeline (stage, start, duration, outcome), then the scrubbed log lines in order, and the error envelope as a JSON block at the end."
- **Not signed:** the buttons' look and label (OA-1), the file's label words and what it can still hold (OA-2), the CSV export honouring filters (OA-3). The PR stays a draft until all three are answered.

## The brief, checked

- **Holds:** the CSV export has columns time, source, level, data, is named `NuloWalletLogs_<unix>.csv`, and exports every loaded line (`LogsViewer.vue:180`); redaction is by key name (`trim`).
- **Did not hold: "a formatted string passes through untouched".** `trim` runs `scrubUrls` on every string primitive (`E/wallet/logger/utils.ts:199`), so URLs are already cut to scheme and host; hex inside a string passes untouched.
- **Missed by the brief:** an unclassified failure reaches the dApp as a bare string (`error-envelope.ts:215`), and its comment says that string "is preserved" (`:207-209`), so `data.walletTraceId` on it is a contract change, signed by P116-15 B. The execute window closes at approval (`dapp-interaction/service.ts:301-306`), so its failure block only shows failures before approval. Expected refusals log at `debug` (`wallet-message.ts:389`), so without Debug Mode a refused request's file has few or no lines (OA-2).

## Outcome & Quality Bar

- **For whom:** a dApp developer whose request failed in a tester's or their own wallet, holding the trace id from the error, and the person who downloads the file and pastes it into an issue.
- **Excellent:** (1) the trace id in the dApp's error and the file's name and header are the same 8 hex, for every error a dApp can get, refusals included; (2) the timeline alone says which stage failed and how long each took, and the failing stage's outcome carries the cause (the app's assertion, the refusal text); (3) the file holds no address, hash, class id, `http(s)`/`ws(s)` URL path or key material and opens cleanly in any editor and terminal; what no scrubber recognises is a decimal amount or a word quoted inside an error text the wallet does not author, and a protocol-relative `//host/path` (OA-2 states both); (4) a failed send's capture survives a worker restart, ring churn and the same dApp's later calls while developer mode is on, and nothing of it outlives developer mode.
- **Good enough:** lines are those the wallet tags (chokepoints, not every helper); PXE-page lines are not attributed; the level follows the ring (info unless Debug Mode).

## Assumptions

**Facts** (verified at `961f90642`; `E` = `apps/extension/src`)

1. One decrypted message enters `onWalletMessage` (`E/wallet/services/wallet-sdk/wallet-message.ts:66`) and binds one `LiveSession` (:78); every answer goes out through that object's `respond`: the over-cap refusal (:194), the binding guard's `SESSION_INVALID_ERROR` (:331) and the tail (:417). The handling chain settles in `.then(release, release)` (:144). `handleWalletMessage` (:294-423) is at 73 of its 80 lines.
2. `SessionContext` is built per message (:347) and reaches every handler and batch leg; `DispatchHooks` never reaches a batch leg (`packages/wallet-bridge/src/dispatcher.ts:335-346,469-476`); no code tests a hooks bag for truthiness, only its fields (`dapp-interaction/service.ts:592,688,744`).
3. `hooks.onJournalCreated(journalId)` fires after `claimOrCreateJournal`, for a claimed queued row and a fresh one (`E/wallet/services/execution/dapp-send-executor.ts:328-338`). `createAuthWit` takes no hooks and writes no journal row (`execution/service.ts:1067`); `registerToken` takes no hooks, and `TokenService` writes its own `token_import` row (`execution/service.ts:1012` → `token/service.ts:453`). A token import is not a send: its History row gets no button in this lane.
4. `executeOperations` starts one task per operation, a root one unless a caller passes `parentTask` (UI callers; every dApp path passes none) (`execution/service.ts:946`); subtasks come from `WrappedTask.startSubtask` → `TaskService.createTask(content, parentId, origin)` (`task/service.ts:47`). Steps "Simulating transaction", "Generating proof", "Sending transaction" (`execution-coordinator.ts:242-330`); at estimate time they start root tasks (`:252,278,316`; `fee/fee-strategy.ts:428`).
5. `estimateOperationFee` and `previewOperationAuthwits` run inside `refusalBound(interactionId, …)` (`execution/service.ts:757-786,823-834`); an estimate that waits behind a send answers queued and is asked again (`:789-809`).
6. The journal emits `onOperationAdded`/`onOperationUpdated` on every stage, backend and error write (`operation-journal/service.ts:342-680`, `:510-528`); heartbeats (`touchOperation`) emit nothing. The queued row's `onOperationAdded` fires before its id resolves at ingress (`queued-journal.ts:193`).
7. `LoggerStore.logWithContext` stores every context's line (`E/wallet/logger/store.ts:69-85`); it drops a line below the level before `trim`; `trim` keeps bigints (`utils.ts:287`); a flush is scheduled only by a stored line (`:82`); errors of a flush are swallowed (`:138-141`); persistence is developer-mode only and purged on Developer Mode off and Clear logs (`:130-207`).
8. Boot restricts `chrome.storage.local` to trusted contexts (`E/wallet/index.ts:54`); `chrome.storage.session` stays at Chrome's default, trusted contexts only; Firefox has no `setAccessLevel`. `nulo:logs` relies on the same defaults today.
9. `downloadFile` writes through `chrome.downloads` (`E/utils/files.ts:36`); e2e reads a download with `armDownloadCapture`/`readCapturedDownload` (`apps/extension/tests/e2e/helpers/download-capture.ts`).
10. The dApp SDK sends `new Error(jsonStringify(error))` (`extension_wallet.js:164-165`); the wallet-bridge README recipe parses `err.message` and handles a string or an object (`packages/wallet-bridge/README.md:88-115`).
11. `stripWireControl` removes C0 (tab, CR and LF included), C1, format characters (bidi included) and variation selectors, but not U+2028/U+2029 (`dapp-session/capability-meta.ts:155-158`).
12. `describeWireMethod(type)` returns a registered method name, `[unsupported-method]` for any other string, or a type placeholder such as `[object]` for a non-string (`packages/wallet-bridge/src/external-id.ts:61`).
13. Six e2e files pin an envelope exactly: `tests/e2e/network/{tx-sendTx-noFrom,scope-refusal,data-privateEvents,tx-sendTx-fields,connect-unserved-chain,sim-methods}.test.ts`; the others use `toMatchObject` or read single fields.

**Inferences** (each with the gate that settles it)

- I1. 300 lines or 64 KB holds one failed request at debug level, since only chokepoint lines are tagged. Phase 4's e2e prints the real file's line count with Debug Mode on.
- I2. `chrome.storage.session` (10 MB on both browsers) holds the captures beside the ring's 2,000 lines: only sends' captures (failed or not) outlive their request, at most 50 × 64 KB. Unit test bounds the serialized size; not measured in a browser.
- I3. `navigator.userAgent` in the worker carries `Chrome/<major>` or `Firefox/<major>` (Brave and Edge read as Chrome). The e2e checks the header line on both browsers.

**Asks** (none blocks the build; each ships its "what ships now" form; all three gate the PR's ready state): OA-1 the buttons' look and label, OA-2 the file's words and limits, OA-3 the CSV filters. See [OWNER-ASKS.md](OWNER-ASKS.md).

## Architecture & Implementation

### Shape

```
onWalletMessage ─ begin(describeWireMethod(type), origin host, chain) ─▶ walletTraceId
   │  live = traced(live): respond adds data.walletTraceId to an error and ends the capture
   │  ctx.walletTraceId; hooks.onJournalCreated → alias journal
   ▼
dispatcher ─ IExecutionHooks.walletTraceId ─▶ DappInteractionService.interaction (alias interactionId)
   │                                        ▶ executeOperations (root task carries it)
   │                                        ▶ refusalBound (fee estimate / authwit preview stage)
   ▼
release (answered or not) ─▶ end: a capture with no journal alias is deleted

LoggerStore.logWithContext ─ worker line with { walletTraceId } ─▶ RequestLog.take
runtime.ts: task finished ─▶ stage · journal event ─▶ journalEvent · onProvePhase ─▶ provePhase
LogViewerService.findRequestTrace / getRequestReport ─▶ buildRequestReport ─▶ downloadFile (popup)
```

### Key interfaces

```ts
// packages/wallet-bridge/src/types.ts — minted by the wallet at arrival, never read from the dApp.
SessionContext.walletTraceId?: string
// packages/wallet-bridge/src/dispatcher.ts — top-level only, like the other hooks.
DispatchHooks.onJournalCreated?: (journalId: string) => void
// packages/wallet-bridge/src/services-contract.ts (IExecutionHooks.onJournalCreated already exists)
IExecutionHooks.walletTraceId?: string

// E/wallet/logger/request-log.ts — concrete, owned by LoggerStore as `logger.requests`; runtime.ts
// hands it to the wallet-sdk background, DappInteractionService and ExecutionService (optional
// constructor argument: absent in tests means no capture).
type RequestRef = { journalId: string } | { interactionId: string }
type RequestStage = { stage: string; start: number; end?: number; outcome?: string; journal?: true }
type CapturedLine = { at: number; context: string; source: string; level: LogLevel; text: string }
type RequestCapture = {
  walletTraceId: string; method: string; originHost: string; chainId: number
  startedAt: number; endedAt?: number; journalId?: string; interactionId?: string
  stages: RequestStage[]; lines: CapturedLine[]; dropped: number; bytes: number
  journalError?: string; envelope?: WalletErrorEnvelope
}
class RequestLog {
  begin(meta: { method: string; originHost: string; chainId: number }): string  // always mints
  alias(walletTraceId: string, ref: RequestRef): void
  find(ref: RequestRef): string | undefined
  stage(walletTraceId: string, stage: RequestStage): void
  journalEvent(record: OperationRecord): void
  provePhase(journalId: string, phase: string, backend: string | undefined): void
  take(log: Log): void                                     // never throws
  end(walletTraceId: string, envelope: WalletErrorEnvelope | undefined): void
  get(walletTraceId: string): RequestCapture | undefined
  onChange?: () => void                                    // LoggerStore schedules its flush
}

// E/wallet/services/log-viewer/spec.ts — both answer undefined without developer mode.
findRequestTrace(ref: RequestRef): string | undefined
getRequestReport(walletTraceId: string): { fileName: string; text: string } | undefined

// E/wallet/services/wallet-sdk/error-envelope.ts
toWalletResponseError(error): WalletErrorEnvelope                  // always an object now
withWalletTraceId(envelope, walletTraceId): WalletErrorEnvelope    // a copy, data.walletTraceId set
```

### Mechanics that are not obvious

- **Minting and answering.** `onWalletMessage` calls `begin` once the hold check passes (:84-89), with or without developer mode, so the dApp-facing field never reveals the setting; `begin` draws `randomIdNotIn(id => live.has(id), 8)` and records a capture only while `config.get("developerMode")` is true. It then wraps the bound `LiveSession` once: the wrapper's `respond` puts `withWalletTraceId(response.error)` on an error, records the envelope and the request's end, then sends. Every answer path already goes through that object (Fact 1), so `handleWalletMessage` gains no branch. The chain's `release` ends a request that was never answered (`dropped`): the establishment drop (:229) and the suppressed answer (:407) included. `end` is idempotent: the first end wins (`endedAt`).
- **Retention.** At `end`, a capture without a journal alias is deleted: no surface can open it once its window has closed. Every alias arrives after `begin` (the queued row resolves asynchronously, the executor's later still), so `begin` uses the method it is given: `sendTx` and `grantPublicAuthwit`, the only two that can earn a journal alias, are send candidates. At most 50 captures; when full, `begin` evicts the oldest capture that has no alias and is not a send candidate. If there is none, a send candidate evicts the oldest capture, and any other arrival is not captured (its id is still minted and answered). So no run of ordinary calls, overlapping or not, displaces a send's capture, and a new send is always captured. Known limit: at 50 retained sends, a non-send request's execute-window failure has no capture, so its button does not show.
- **Lines.** `take` accepts a worker-context line (`context` `sw`) whose top-level data holds a plain object with an own `walletTraceId` naming a live, not yet ended capture. It stores the line rendered: first a structural pass over the trimmed data (the text pass on every string value and every key; a bigint ≥ 2^128 blanked as `scrubHex32` does), then `formatLogData`, then the text pass on the rendered line, capped at 4,000 chars. Scrubbing strings before JSON rendering matters: `JSON.stringify` turns a raw tab into `\t`, which no later pass can strip, so a tab-split address would survive. No bigint reaches `JSON.stringify` or `chrome.storage`, and a persisted capture holds scrubbed text only. `take` catches its own failure. Tagged lines: the ingress failure and drop lines, `describeApprovalFailure` (`dapp-interaction/service.ts:487`), `executeOperations`' three lines (its 8-hex `traceId` becomes the request's id when one is given). The level is the ring's: a `debug` line needs Debug Mode.
- **Text pass** (`scrubReportText`, beside `scrubHex32`), run on every stored and rendered string. First CR, LF, U+2028 and U+2029 become a visible `\n`; then `stripWireControl`; only then the scrubbers, so a stripped character can never join two hex halves. Then `scrubUrls`. Then `[hex]` for: a shortened address (`0x` + ≥4 hex, `..`, `...` or `…`, ≥4 hex: `trimAddress`, `maskedAddress`); a run wrapped by whitespace or `\n` (`0x` + ≥8 hex, the separator, ≥8 hex); any other `0x` run of ≥9 hex digits; any unprefixed run of ≥32 hex digits. Survivors: selectors (`0x` + 8), trace ids (8 hex), journal and interaction ids (16 hex). Linear patterns over disjoint classes (lessons: CodeQL ReDoS).
- **Timeline.** `request <method>` from arrival to its end: `ok`, `failed <code> <walletErrorCode>` or `dropped`. A traced task (the root takes `hooks.walletTraceId`; a subtask inherits its parent's in `createTask`) adds a stage when it finishes: label, `startedAt`, `finishedAt`, status and error. `refusalBound` adds `fee estimate` or `authwit preview` and its outcome (`queued` for a queued answer). An aliased journal row adds `journal created` at its `createdAt` on its first event (the queued row's own event fires before the alias exists, Fact 6), then `journal <stage>` on each stage change; its `error.message` becomes `journalError`, the outcome of its terminal entry. `onProvePhase` adds `prove <phase> (<backend>)` for an aliased row through the coordinator's `ProveEvidenceSink`. A journal or prove entry's duration runs to the next entry of its own kind, never to a task's. Labels are capped at 80 chars, outcomes at 300, `journalError` at 1,000, after the text pass.
- **Bounds.** Per capture: 300 lines, 100 stages, and 64 KB for the whole serialized capture. `bytes` counts the UTF-8 length of each entry's JSON, plus a fixed allowance for the record's own fields. Ordinary entries stop at 90 stages and 60 KB and then only count in `dropped`; the reserve holds the terminal entries (the request's end with its envelope, the journal's terminal entry with `journalError`), which always land. `rehydrate` applies the same bounds through a zod schema and drops an invalid entry.
- **Aliases.** `onWalletMessage` aliases the queued row when its id resolves; `onJournalCreated` aliases a claimed or fresh row (the dispatcher forwards it into `sendTx` and `grantPublicAuthwit` only); `DappInteractionService.interaction()` aliases the id it mints, right after `storage.set` (:674). The dispatcher puts `walletTraceId: ctx.walletTraceId` inline on the hooks of `sendTx`, `grantPublicAuthwit`, `registerToken`, both `createAuthWit` paths and the generic path; `onExecutionEnqueued` stays `sendTx`'s only, and `requestCapabilities` is unchanged.
- **Store.** A `Map` in insertion order owned by `LoggerStore`. Every change calls `onChange`, which schedules the existing debounced flush, so a capture with no stored line still persists. The flush writes `nulo:logs` and `nulo:request-logs` as two `set`s on the same serial queue, so one failing write cannot take the other down. `rehydrate` reads both. `clear()`, Developer Mode off and `applyRetentionPolicy` with retention off first empty the `Map` (captures and aliases) synchronously, then queue the removal of both keys; an event for a removed capture finds nothing and creates nothing.
- **Wiring.** `runtime.ts` subscribes `logger.requests` to task and journal events after registering the services; `ExecutionService` points the coordinator's `ProveEvidenceSink.provePhase` at it. `LogViewerService` only reads.
- **Report** (`E/wallet/logger/request-report.ts`, pure). Header: `Wallet version` (`__VERSION__`), `Browser`, `Network` (the profile's network for the capture's chain id, read at report time; `unknown` when none; capped at 64 chars), `Trace id`, `dApp origin host` (`new URL(origin).host`). Then `Timeline` (start ISO UTC, duration ms, stage, outcome), `Log lines (<n>[, <m> dropped])`, and `Error envelope` (`JSON.stringify(envelope, null, 2)`, or `(no answer yet)`). Every line takes the text pass. `formatArg`, `formatLogData` and `getLogLevelName` move from `E/components/JsonViewer/logs-format.ts` to `E/wallet/logger/format.ts`, re-exported from the old module.
- **Envelope.** The unclassified fall-through returns `{ code: -32603, message: UNCLASSIFIED_ERROR_MESSAGE }`, the integrity arm's shape, and its comment states the new contract; `withWalletTraceId` copies (frozen envelopes stay frozen).
- **UI.** One service-bound component, `E/components/RequestLogButton.vue` (prop `journalId` or `interactionId`). It owns a `LogViewerServiceClient`, asks `findRequestTrace` on mount and renders nothing without a trace. A click runs `getRequestReport` → `downloadFile` → the CSV export's toasts ("Logs downloaded successfully", "Failed to download logs"). History detail mounts it inside "Error (developer mode)"; the execute window mounts it in one row above the footer while a refusal, a failed estimate or a processing error stands.

### File-level change map

| Phase | Files |
|---|---|
| 1 | `packages/wallet-bridge/src/{types,dispatcher,services-contract}.ts` (+ `dispatcher.test.ts`); `E/wallet/services/wallet-sdk/{wallet-message,error-envelope,live-session,background}.ts` (+ tests); `packages/wallet-bridge/README.md` (error shapes); the six e2e pins (Fact 13) |
| 2 | new `E/wallet/logger/{request-log,format}.ts` (+ tests, + `request-log.reach.test.ts`); `E/wallet/logger/{store,utils}.ts` (+ tests); `E/components/JsonViewer/logs-format.ts`; `E/wallet/services/task/{service,spec}.ts` (+ test); `E/wallet/services/execution/{service,execution-coordinator}.ts`; `E/wallet/services/dapp-interaction/service.ts`; `E/wallet/runtime.ts`; `E/wallet/storage/stored-shapes.scan.test.ts` |
| 3 | new `E/wallet/logger/request-report.ts` (+ test, golden `request-report.golden.txt`); `E/wallet/services/log-viewer/{spec,service,client}.ts` (+ test) |
| 4 | new `E/components/RequestLogButton.vue` (+ test); `E/popup/pages/journal/[id].vue` (+ test); `E/popup/windows/execute/index.vue` (+ test); `E/components/JsonViewer/LogsViewer.vue` (+ test); `apps/extension/tests/e2e/network/scope-refusal.test.ts`; `.claude/skills/logging-policy/SKILL.md`; `implementations-plan/tx-logs-1/screenshots/*.png` |

### Trade-offs and alternatives not taken

- **Outline B, "slice the ring":** `Log.trace` on every line, a viewer filter, the export slicing the ring at download; no store. Rejected: the signed A names a per-request store; the ring evicts the request before a developer looks; tasks die with the worker, so the timeline still needs a persisted source.
- **Widen `ILogger.log` with a trace parameter:** every service helper changes for the few lines that tag; a named data property is what the logging policy already asks for and shows in the viewer and the CSV.
- **Build the file in the popup:** the capture is scrubbed, but the popup would need the whole capture over RPC plus the network list to name the chain; the worker already holds both and answers one string.
- **A dispatcher helper for the hooks:** each call site needs a different subset (`onExecutionEnqueued`, `queuedJournalId`, `originKey`), so a helper needs a flag per site; inline fields are smaller.

## Security & Adversarial Considerations

- **Threat model.** A connected dApp sends arbitrary messages and reads every envelope. New to it: one random 8-hex value per error, unrelated to wallet state, minted in every mode. It never learns another request's id. A line joins a capture only when the worker logs an object carrying the id, before that capture ends; the wallet never logs a dApp's arguments whole (logging policy), and `method` is `describeWireMethod`'s output, never the dApp's string.
- **Flooding.** Captures without a journal alias are deleted at their end, and at capacity an ordinary call evicts only another ordinary call's capture or goes uncaptured, so a dApp's ordinary calls cannot push out a send's capture; only a flood of sends evicts the oldest of 50. Memory stays under 50 × 64 KB.
- **The file.** It leaves the wallet only by the person's download. Controls are stripped before any scrubber, so a dApp-authored assertion cannot drive a terminal, reorder text or rejoin a split address. The structural pass over raw strings, keys and bigints, then the text pass on the rendered line, blank every address, hash, class id and shortened address; `http(s)` and `ws(s)` URLs keep scheme and host; key-name redaction already ran at log time; the raw normalized error and its stack are never read. Residual: a decimal amount or a word inside an error text the wallet does not author (a contract's assertion, a simulator message) passes, as does a protocol-relative `//host/path`; balances, notes and contact data are otherwise kept out by the call sites (logging policy, `log-payload-ban.test.ts`). OA-2 states it. The network name is user-typed: scrubbed and capped; the owner signed it into the header.
- **Persistence.** `nulo:request-logs` lives in `chrome.storage.session` with `nulo:logs` (Fact 8), only with developer mode, purged with it, and holds only scrubbed text.
- **RPC boundary.** `findRequestTrace` and `getRequestReport` are same-extension RPCs; zod refuses a ref that is not 16 hex or a trace id that is not 8 hex; both answer `undefined` without developer mode.
- **Wire contract.** Classified envelopes gain one `data` key; the unclassified answer becomes an object with code -32603 and the same text, so both generic failures read alike. No new dependency; no crypto beyond `crypto.getRandomValues`.

## UI impact

- **History detail** (`/popup/journal/:id`, developer mode, a failed send whose request was captured): before, "Error (developer mode)" shows the message and the raw error; after, a "Download logs" button under them (OA-1).
- **Execute window** (developer mode, a refusal, a failed estimate or a processing error before approval): a row with the same button above the footer (OA-1).
- **Logs viewer:** "Export logs to CSV" writes the lines the filters show (OA-3); nothing on screen changes.
- **dApp-facing:** every error carries `data.walletTraceId`; the unclassified error is an object (P116-15 B).
- **The downloaded file:** new (P117-03 A; words OA-2).

## Phases

### Phase 1: the id and the envelope

1. Add `SessionContext.walletTraceId`, `DispatchHooks.onJournalCreated`, `IExecutionHooks.walletTraceId`.
2. In the dispatcher, put the id on the hooks of the six calls named under Aliases; forward `onJournalCreated` into `sendTx` and `grantPublicAuthwit`.
3. In `onWalletMessage`, mint the id, put it on `ctx`, set `onJournalCreated`, and wrap the bound `LiveSession`.
4. Make the unclassified fall-through an object. Update the envelope tests, the README's error shapes and the six e2e pins.
- **Tests:** `error-envelope.test.ts`: every arm keeps its fields; `withWalletTraceId` adds the id and leaves a frozen envelope unchanged; the fall-through is the object. `dispatcher.test.ts`: each of the six calls carries `ctx.walletTraceId`; only `sendTx` carries `onExecutionEnqueued`; a batch leg sees the parent's id and no hooks. A `wallet-message` test: two concurrent messages answer with two different ids; the over-cap refusal and `SESSION_INVALID` carry one; a success carries none; an answered, a suppressed and an establishment-dropped request each end exactly once, with their own outcome.
- **Validation gate:** `bun run lint && bun run typecheck:all && bun run test:all`. Pass: exit 0 on each.

### Phase 2: the capture

1. Move the three formatting functions to `wallet/logger/format.ts`; add `scrubReportText`.
2. Write `request-log.ts`: bounds, aliases, retention at `end`, the zod restore schema, the text pass on stored strings.
3. In `LoggerStore`, call `take` in `logWithContext`; flush, rehydrate, purge and settle `nulo:request-logs` beside `nulo:logs`; schedule the flush on `onChange`.
4. Give `Task` an optional `walletTraceId`: the root takes it from `executeOperations`' hooks, a subtask inherits it.
5. Record the estimate and preview stage in `refusalBound`; alias the interaction in `interaction()`; add `provePhase` to the coordinator's sink.
6. In `runtime.ts`, pass `logger.requests` to the three consumers and subscribe it to task and journal events.
7. Tag the chokepoint lines; add the `nulo:request-logs` row to `NOT_LOCAL_STORAGE`.
- **Tests:** `scrubReportText` on adversarial lines: a full, a `trimAddress`- and a `maskedAddress`-shortened address; an address wrapped across a space, an escaped newline and U+2028; an address split by U+200B; an L1 address; a URL with a token in its path and query; a nested envelope string. A selector, a trace id and a journal id survive (success control). `request-log.test.ts`: past the ordinary bounds (lines, stages, multibyte text near 64 KB) the request's end, its envelope and the journal's terminal entry still land, and the final size and stage count stay within the bound; with 50 aliased captures, 60 ordinary requests (some overlapping) evict none of them and are not captured; with 49 aliased, two overlapping ordinary requests evict none of the 49; at 50 aliased, a `sendTx` in the real order (`begin`, then the alias a tick later) is kept and the oldest is evicted; a second `end` changes nothing; no capture without developer mode; a line after `end` and a popup-context line are refused; restore drops an invalid entry. A pipeline test (`trim` → `take` → report): an error whose message holds an address split by tabs and a bigint field element renders neither, while the selector and ids beside them survive. `store.test.ts`: a tagged line lands in its capture and in the ring, an untagged one only in the ring; a capture with no line persists; Developer Mode off then on, and Clear logs, leave no capture in memory or storage, while a capture made after them is kept (success control); a rehydrated capture is found. `task/service.test.ts`: a subtask inherits the id. Producers: the `executeOperations` test asserts a dApp operation's root task carries the hooks' id; the coordinator test asserts `provePhase` reaches the sink for two phases with the same backend. `request-log.reach.test.ts` (real `TaskService` and `RequestLog`; a journal stub that emits `added` before the alias, as the code does): one request's request stage, journal entries, task steps, prove phase and estimate stage land in one capture with per-kind durations; two interleaved requests never share a stage or a line.
- **Validation gate:** `bun run lint && bun run typecheck:all && bun run test:all`. Pass: exit 0 on each.

### Phase 3: the report

1. Write `request-report.ts` and its golden.
2. Add the two `LogViewerService` methods with zod params; read the network name at report time.
- **Tests:** `request-report.test.ts`: the golden matches byte for byte; a capture holding an ANSI escape and a bidi override in an outcome renders neither; a capture with no envelope ends with `(no answer yet)`. `log-viewer` test: both methods answer `undefined` with developer mode off (and a value with it on: success control) and refuse a malformed ref.
- **Validation gate:** `bun run lint && bun run typecheck:all && bun run test:all`. Pass: exit 0 on each.

### Phase 4: the buttons, the e2e, the pictures

1. Build `RequestLogButton.vue` and mount it on both surfaces; switch the CSV export to `filteredLogs`.
2. Extend `scope-refusal.test.ts` case 2 (below).
3. Take light and dark pictures of looks A, B and C on both surfaces (OA-1), and of the file in a text view. Use a local, untracked capture script and temporary local variants; commit only the PNGs.
4. Update the logging-policy skill: the `walletTraceId` tag, the capture and its retention, the text pass, and what the file may hold.
- **Tests:** `RequestLogButton.test.ts`: nothing without a trace; the button with one; a click downloads `nulo-request-<id>.txt` with the report text; a failed report shows the error toast and downloads nothing. `[id].test.ts`: mounted inside the developer box for a failed row only. `index.test.ts` (execute): mounted only while a failure stands. `LogsViewer.test.ts`: the CSV holds only the filtered lines.
- **E2E**, `scope-refusal.test.ts` case 2 turned on from its start. Failure mode: the id the worker mints must reach the dApp's error, the window, History and a real download, through real ports, on both browsers; no unit or composition layer has the dApp SDK, the windows and `chrome.downloads` together. Steps: open the popup and turn on Developer Mode and Debug Mode first; then the existing call-name mismatch, refusal and Reject. Before Reject, download from the window; after, open History detail and download again. The detail's error-message assertion moves to the developer-mode value (case 1 keeps the hidden check). Assert: both file names carry the dApp's `data.walletTraceId`; file 1 holds `fee estimate` with the refusal outcome and `(no answer yet)`; file 2 holds `request sendTx`, `journal created`, `journal failed`, at least one line, and an envelope block equal to the dApp's error. Assert also that neither file holds the account, token or recipient address, a `0x` run of 9 or more hex digits, or a URL with a path. Estimate: +15 s per browser on the case.
- **Validation gate:**
  - `bun run lint && bun run typecheck:all && bun run test:all`, then `bun run audit:vue` (CLAUDE.md, before a UI PR);
  - `cd apps/extension && bun run test:e2e -- --retry=0` (smoke; it holds the logs window's `viewers-csp.test.ts`);
  - `NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent` on the six files of Fact 13, then the same with `NULO_E2E_BROWSER=firefox`;
  - `bun run check:plans` after staging the plan files.
  - Pass: exit 0 on each, at retry 0. Record `scope-refusal`'s wall-clock per browser before and after.

## Delivery

- One arc, one PR. Branch `tx-logs-1-a1` off `origin/dev`, carrying the plan commit. `gh pr create`, no label at creation; add `e2e:extension-network` afterwards only if the path filter would skip the network suite. Title: `feat(logs): developer mode downloads the logs of one failed request` (69 chars). Body: what and why; the validation runs and outcomes; `scope-refusal`'s wall-clock before and after per browser; the sign-off quotes, P116-15 B quoted for the unclassified string's change; the accessibility calls; the pictures. No issue closes.
- **Draft until OA-1, OA-2 and OA-3 are answered.** The session that applies the answers adjusts the look and words, re-runs Phase 4's gate, writes the close-out as the PR's final commits, and readies the PR.
- `code_review: off`. No lanes: the phases share `wallet-message.ts`, `store.ts` and the reach test, so they run in order.

## Decision ledger

| # | Question | Decision | Why |
|---|---|---|---|
| D1 | How a line names its request | a named `{ walletTraceId }` data property, worker lines only | the policy's named-property rule; no interface change; visible in viewer and CSV |
| D2 | Capture store or slice the ring | capture at log time, bounded, persisted beside the ring | the signed A names a store; the ring evicts the request; tasks die with the worker |
| D3 | Return the id only with developer mode | always | otherwise the field tells every dApp whether developer mode is on; B sets no condition |
| D4 | The unclassified string | `{ code: -32603, message }` | B's "in the envelope's data" needs an object; it matches the integrity arm; the README recipe handles it |
| D5 | Carrier | `ctx.walletTraceId` (reaches batch legs) + inline hook fields | `onExecutionEnqueued` stays `sendTx`'s; a helper would need a flag per site |
| D6 | Timeline source | task, journal and prove-phase events, plus `refusalBound` | every executed method already runs as a task tree; prove phases already reach the coordinator |
| D7 | Where the file is built | the worker | the scrubber is the only exit from the store |
| D8 | PXE-page and request-window lines | left out | the task and journal errors carry the PXE failure and its duration; attributing PXE lines needs a trace on three PXE RPCs and a slot under the write guard, a cross-package change nobody asked for yet |
| D9 | Capture without developer mode | none | the lane is developer-mode only |
| D10 | Two buttons or one component | one `RequestLogButton` | the same probe, download and toasts on both surfaces |
| D11 | CSV filters | `filteredLogs`, gated by OA-3 | one line, the lane brief names it; not an owner quote, so it is asked |
| D12 | What the scrubber keeps | selectors, 8- and 16-hex ids | the developer needs the function and the ids |
| D13 | E2E | extend `scope-refusal` case 2 | it reaches both surfaces and the dApp's error with no proof; a new file would repeat its setup |
| D14 | Where the id joins the answer | wrap the call's `LiveSession` | every answer goes through it; `handleWalletMessage` sits at 73 of 80 lines |
| D15 | Which captures outlive their request | those aliased to a journal row | no surface opens any other once its window is closed |
| D16 | `Task.walletTraceId` over RPC | keep the field | the popup is a trusted context that can call `getRequestReport` anyway; a private map would add a lifecycle |

## Audit verdicts

- **Codex round 1** (`gpt-6.1-sol`, high): **reject**. Accepted, with their paths in [lessons/phase-0.md](lessons/phase-0.md): controls stripped before scrubbing (a U+200B-split address was rejoined; demonstrated); whole-capture and stage bounds (repeated estimates; demonstrated); lines stored rendered, so no bigint reaches `JSON.stringify` (demonstrated for the plan's own fixture); per-kind durations, seeding on the first journal event, prove phases recorded (demonstrated ordering); a flush on every capture change (plausible); wiring in `runtime.ts`, the concrete class; e2e positive evidence; Facts 4, 6 and 8 corrected; OA-2 gates the PR, with the decimal-text limit stated. Rejected: `Task.walletTraceId` off the type (D16).
- **Opus 5.5 Plan:** **conditional approve**. Accepted: delete unaliased captures at `end` (F1, plausible; D15); `describeWireMethod` for `method` (F2); U+2028/U+2029 escaped (F3); the `LiveSession` wrapper (F4, demonstrated; D14); no helper, `onJournalCreated` only where a row is written (F5, demonstrated); all six e2e pins (F6, demonstrated); OA-3 gates the PR (F7); the Debug Mode fact in OA-2 and the e2e (F8); worker lines into open captures only (F9, needs unsupported conditions, local fix); the interaction alias in `interaction()` (F10); two `set`s (F11); extend case 2 (D13); Facts 2, 10 and 11 corrected.
- **Final fresh Codex pass, round 1** (new session): **reject**, seven findings, all accepted: scrub strings before JSON rendering (a tab-split address survived `formatArg`; demonstrated by a probe); Fact 3 corrected (`registerToken` writes a `token_import` row; out of scope, no plumbing); eviction prefers unaliased captures (at capacity an ordinary call evicted a retained failure; demonstrated); the in-memory purge made explicit; reserved room for terminal entries and UTF-8 byte accounting; idempotent `end` with suppressed and dropped completion tested, producer assertions, `audit:vue` and the smoke suite in the gate; OA-2 states the real limits and URL forms. None adds state, a lifecycle, a protocol, a recovery policy or a public contract.
- **Final pass, round 2** (resumed): **reject**, one blocker accepted: every alias lands after `begin`, so "the arriving one included" evicted a new send at 50 aliased; `begin` now treats `sendTx` and `grantPublicAuthwit` as send candidates, ordinary arrivals never evict an aliased or candidate capture, and the test runs the real begin-then-alias order. Nits folded: the quality bar and the security residual name the protocol-relative URL; the popup alternative's rationale corrected.
- **Final pass, round 3** (resumed): **approve with nits**; the one nit (Fact 12's citation and its non-string case) folded. An in-memory model of the eviction rule passed the three capacity scenarios.

## Post-implementation

Executes `implementations-plan/README.md` § Post-implementation standard at `961f90642`, with these values:

- **While implementing:** comments to CLAUDE.md § Code-comment style; attempts logged in `lessons/phase-N.md`; `agent-worktree status tx-logs-1 "phase N green: <next>"` at each gate; three failures on one step stop the arc.
- **Review loop** (single arc, once, over `git diff origin/dev...HEAD`): `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh` each round; the prompt carries the plan, the ledger, the adversarial ask and the standard's two rules verbatim. One Opus 5.5 diff review (`general-purpose`) runs beside round 1. Hard stop at three rounds.
- **Delivery:** as above; `gh pr checks <n> --watch` once; a known flake gets one rerun.
- **Close-out:** the PR's final commits, after OA-1, OA-2 and OA-3 are applied: Outcome block, lessons promotion, open items filed, `STATUS.md` deleted, `git mv` into `archive/` in its own commit, the index line moved, `bun run check:plans` green.
- **Teardown after the merge:** once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/tx-logs-1/plan.md` succeeds, `agent-worktree done tx-logs-1 --merged`.

## Seeds

```
/goal Every phase of implementations-plan/tx-logs-1/plan.md is marked ✓, each backed by its validation gate passing in the transcript; LESSONS_FILE=implementations-plan/tx-logs-1/lessons/phase-N.md printed per phase; the Codex loop converged (a resumed gpt-6.1-sol pass with no new material finding, quoted); PR `feat(logs): developer mode downloads the logs of one failed request` open as a draft against dev, OWNER-ASKS.md naming OA-1 to OA-3; `bun run test:all` and `bun run lint` exit 0.
```

```
/loop 15m Drive implementations-plan/tx-logs-1 forward: read plan.md and lessons/, take the next unticked phase, run its gate, tick it; after the last, run the Codex loop, then open the draft PR; never merge; stop once the PR is open and its checks are green.
```
