# wallet-followups-2: recon

Base: `origin/dev` at `29d9e49`. Two read-only Explore agents (sonnet) plus the driver's own reads. Every line below was checked against the tree; where an issue claim did not hold, it says so.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| Send: select the next token, or leave on the last delete | `onTokenDeleted` in `apps/extension/src/popup/pages/send.vue:116-131` already holds both branches (`tokens.value[0]`, the "The last token has just been deleted" toast, `leaveSend()`); the mount path picks `t[0]` the same way (`send.vue:604-606`) | reuse as is, reorder one read |
| Send component harness | `send.test.ts` (`mountSend`, `lastClient(TokenServiceClient).onTokenDeleted`, `listed`, `card`, `mocks.openToast`, `mocks.routerBack`/`routerReplace`) | reuse as is |
| Registered service names | Every class added to the worker's `ServiceCollection` (`apps/extension/src/wallet/runtime.ts:478-556`) and the offscreen PXE (`packages/aztec-runtime/src/offscreen/entry.ts:48`) declares `static name = <CONSTANT>`: 26 classes, 26 constants (24 `*_SERVICE_NAME`, 2 `*_COORDINATOR_NAME`) | reuse as the drift pin's source |
| A list of service names importable by the popup | none. Searched `SERVICE_NAMES`, `import.meta.glob`, `readdirSync` over `services/`, `grep SERVICE_NAME` in tests; `ServiceCollection` (`packages/wallet-core/src/base/index.ts:38`) holds instances in a private map | none needed: `LOG_SOURCES` stays a literal list and the drift pin derives the required set from the registrations (plan D5) |
| Coordinator name constants | `PROFILE_DELETION_COORDINATOR_NAME` in `profile-deletion/coordinator.ts:20`, `ACCOUNT_INTEGRITY_COORDINATOR_NAME` in `account-integrity/coordinator.ts:18`; both coordinator modules import every leaf service, so the popup must not import them. Each folder has a light `types.ts` | reuse as is: the list uses literals, so nothing moves (plan D5) |
| Source labels | `getDisplayName("source", k)` (`JsonViewer/logs-format.ts:104-117`): splits on `-`, capitalises each part, upper-cases `fpc`/`pxe`/`rpc` | reuse as is |
| Drift-pin shape | scan tests with `readdirSync` (`src/utils/amount.callers.test.ts:82`, `components/composite/DottedTerm.scan.test.ts:15`); the coverage keystone in `services/backup/footprint-coverage.test.ts` | adapt (scan for `static name =`) |
| Idempotent listener re-add | `EventHandler.add` (`packages/wallet-core/src/utils/event-handler.ts:34-38`) pushes only if absent | reuse as is |
| Logs window harness | `LogsViewer.test.ts` (`mountViewer`, `mountOn`, `H.onLog`, `H.getLogs`); `clearLogs` is a bare `vi.fn()` with no handle; `onLog` is a pair of `vi.fn`s, so a removed listener still "delivers" when the test calls the captured callback | adapt: a real `EventHandler` and a `clearLogs` handle for the new case |
| Debt for an observer with a retry stake | `adoptGasRetryDebt` (`stores/balances.store.ts:578-589`) states the rule "debt follows the observing cause, not the flight's" for an ensure that joins a failing forced flight | adapt: the same rule at the forced failure commit |
| Retry arming | `scheduleRetry` (`balances.store.ts:603-610`) is a no-op without a retry-capable union, without debt, or with a timer armed | reuse as is |
| Co-mount harness | `popup/components/modules/fee-cards.comount.test.ts` (`mountBoth`, `txHandlerFor`, fake timers, `fee-init-degraded` testid) | reuse as is |

## #283: Send, deleting the selected token

- Holds. `onTokenDeleted` (`send.vue:116-131`) splices before it reads `activeToken`; `activeToken` (`:139`) is a computed over `tokens`, so after the splice it is `undefined`, `undefined !== token.id` returns early, and neither the next-token branch nor the last-token branch runs.
- Pinned as `(BUG PIN) deleting the active token selects no token, not the next one` (`send.test.ts:1116-1128`). A second, unrelated pin sits beside it: `(BUG PIN) a token deleted after the token answer, while the contacts read is out, stays listed and active` (`:1094-1114`). That one is a different defect (a delete during an identity fetch), out of this lane; it stays as is.
- "The next token" is `tokens.value[0]`, the first remaining row: the rule the handler was written with and the rule the mount path uses when the saved token is gone (`send.vue:604-606`). The Send picker orders its rows with `orderTokenRows`, but the page's own selection has never used that order.
- `leaveSend()` (`send.vue:63-69`) prefers `router.back()` and falls back to `router.replace("/popup/general")`.

## #288: logs from five services leave the logs window

- Holds for four of the five: `price`, `incoming-transfer`, `operation-journal`, `legal-acceptance` are registered services whose names are missing from `LOG_SOURCES` (`JsonViewer/useLogFilters.ts:5-31`). `isLogInclude` refuses a source with no filter row, while the first document is built unfiltered (`LogsViewer.vue:218`), so those rows show at open and vanish at the first rebuild or never append live.
- Did not hold for `imported-account-keys`: `IMPORTED_KEYS_SERVICE_NAME` (`account/spec.ts:116`) is a backup slice key, not a registered service, and nothing logs under it (`AccountService` logs as `account`).
- Wider than filed:
  - Two registered coordinators log under their own names and have no row: `account-integrity-coordinator`, `profile-deletion-coordinator`. Neither has a popup client.
  - The price service's own helper logs under the class-name literal `"PriceService"` (`price/service.ts:39,427-429`), not `price`.
  - About 18 non-service sources have no row either: `wallet-sdk-bg`, `SendCheck`, `JournalGC`, `JournalReaper`, `ContractResolver`, `TxRequestBuilder`, `TokenSeeder`, `SessionManager`, `batched-view-simulation`, `window-manager`, `balance-job-queue`, `balance-projector`, `background-ticker`, `offscreen-telemetry` and a few unread helpers (`rw-guard.ts`, `public-event-indexer.ts`). Search trail: `grep -rn 'logger.log("'`, `const LOG_SOURCE = `, `this.log(` over `apps/extension/src` and `packages/*/src`.
- Rows that nothing produces: `faucet`, `rpc` (and their `-client` forms), `wallet-sdk-client`. `logger` and `log-viewer` use `DummyLogger`, so their rows are probably silent too.
- The filter lists rows in `LOG_SOURCES` order (`LogsToolbar.vue`, no sort): alphabetical, except `passkey` last. `LogsToolbar.vue` carries no `data-testid`; no e2e opens the logs window.
- Bundle: the popup already imports `ConfigServiceClient` and `LogViewerServiceClient` in `LogsViewer.vue`, and the send page imports most clients, so the spec modules that hold the name constants are already in the popup bundle; `biome.json:352-385` restricts service imports only under `components/{core,ui,composite}/**`, not `components/JsonViewer`.

## #289: a failed Clear logs stops the window

- Holds. `handleClearLogs` (`LogsViewer.vue:149-161`) removes `onLogAdded`, awaits `clearLogs()`, re-adds only on success; the `catch` toasts "Failed to clear logs" and never re-adds.
- Success-path order matters: the listener is back before `logs.value = []` and `await nextTick()`, so a log that lands during that tick is kept. A `finally` around the whole block would re-add after the tick and lose it; the fix re-adds right after `clearLogs()` settles, either way.

## #291: the fee card claims a gas retry that is not running

- Holds, with the sequence below; every step is a real API call.
- `gasFailureEntry` (`balances.store.ts:185-198`) keeps `retryDebt` unchanged on a `forced` failure (D11). `onTransactionSettled` (`:651-660`) fires a forced gas fetch for each key with a `txRefresh` subscriber and never calls `scheduleRetry`. `runRetry` retries only legs with debt (`retryLegsFor`, `:672-677`) and re-arms only while some leg has debt (`shouldRearmRetry`, `:628-631`).
- `GasBalanceCard` subscribes `{legs:["gas"], retry:false, txRefresh:true, peek:true}`; `FeeSettingsCard` subscribes with `retry:true, txRefresh:false`. The fee card's recovery watch (`FeeSettingsCard.vue:715-731`) re-commits on either leg's `retryVersion`; `commitFromEntry` sets `FEE_DATA_UNAVAILABLE` ("Couldn't load fee data. Retrying in the background.", `:450`) whenever either leg is degraded, without reading debt or a timer.
- Failing sequence (store level): fee card and gas card subscribe on one key; the first FPC read fails (FPC debt, timer armed); a settled tx forces a gas read that fails (gas degraded, no debt); the timer fires, retries FPC only, succeeds, bumps `fpc.retryVersion`, clears FPC debt and arms nothing. Gas stays degraded with no debt and no timer. At component level the recovery watch re-commits, sees gas degraded, and shows the notice; 70 s later no gas read has been issued.
- Reachability (corrected after Opus round 1): `GasBalanceCard` renders only on Home (`BalanceView.vue:379`); the fee card renders in Send, the execute window and the authwit popups (`ChangeAuthwitsRegistryPopup.vue:107`, `RevokeAuthwitsPopup.vue:205`). `PopupManager` sits outside `RouterView` (`popup/app.vue:465,489`), but the authwit popups open only from the Authwits settings page (`authwits/index.vue:96-102`), `RouterView` has no `KeepAlive`, and `Popup` renders under `v-if="show"`; so Home is not mounted under them and no production surface shares a key between the two cards. The state is reproduced by `fee-cards.comount.test.ts`, not by a user flow.
- Constraints: the D11 pin `a tx-refresh FAILURE creates no retry debt` (`balances.store.test.ts:387`) subscribes only `CAPS_CARD` (`retry:false`). The fuzz oracle (`balances.store.fuzz.test.ts`) owes a gas recovery only when an ensure resolves gas-degraded under live retry coverage (C1); its control `passes a retry success that a failed tx-settle refresh then re-degrades` (`:650-662`) uses one subscriber with both `retry` and `txRefresh` and asserts the re-degraded slice carries no debt; the first pinned tape is commented with the same consequence (`:586-591`).
- The archived wallet-followups plan rejected "a forced failure takes debt while a retry-capable subscriber holds the key" for #259 on the ground that it "breaks D11, pinned at `balances.store.test.ts:387`". That pin subscribes no retry-capable subscriber, so the conditional rule leaves it green; what changes is the fuzz control above, which pinned D11's consequence for a key that does hold a retry stake.

## Lessons file

- `implementations-plan/lessons.md` is 8,164 of 8,192 bytes, 34 entries in six sections. The gate (`scripts/ci-cd/plans/structure.ts:37,269-305`) checks the byte budget, one line per entry, and an evidence link per entry that resolves inside `implementations-plan/` or to an allowlisted permalink.
- Checked against the tree: Biome is 2.5.13, Vue 3.5.42, VTU 2.4.11, vite-plugin-pages 0.33.3, Bun 1.4.2, Aztec 6.0.0-rc.1; the background RPC default is 60 s (`DEFAULT_RPC_TIMEOUT_MS`); `EventHandler.invoke` still drops a handler's promise; 150 of 207 extension SFCs lack `lang="ts"` (the entry's "149 of 205" is stale).
- One entry is restated whole by a live doc: `CI.md` § Concurrency carries the never-skip-required-aggregators entry (per-head queues, cancel only on dispatch, the supersede order, FAILURE on a cancelled head, "do not skip"). It stays: its dead end is still reachable, and `lessons.md` is the file read at every task start. SECURITY.md covers `bunx` in CI jobs only; the e2e-testing and aztec-update skills cover the conflicted-PR half of the merge-ref entry only.

## Open work read

- `gh pr list --state open`: only #271 (tokens-and-balances). It touches the token balance reducer, not `send.vue`'s token-delete handler, the logs window or `balances.store.ts`.
- Lanes beside this one on the host: `e2e-harness-gaps` arc 3 (network tests, the playground; its close-out edits `implementations-plan/index.md` and `lessons.md`) and the `e2e-followups-2` planner.
- Not in this lane: #262 (waits on tokens-and-balances arc 1, #271), #277 (waits on page 7 P7-09), #290 (`owner-decision`).
