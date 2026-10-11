# Recon: wallet-followups-3

Base: `origin/dev` at 0643a14. Two Explore agents (sonnet) plus direct reads by the planner. Every path is repo-relative; `apps/extension/src` is shortened to `src/` where unambiguous.

## Reuse map

| Capability needed | Existing code found | Verdict |
|---|---|---|
| A plain record of a picked fee row | `recordOf` in `src/popup/components/modules/send/fee-privacy.ts:137` (Send key only: `{ type }` or `{ type: "fpc", fpc: { id, name? } }`); `asRecord` in `fee-send-selection.ts:17` (sanitises the Send key on every write) | **adapt**: the legacy key needs `title` and `subtitle` (the trigger pre-fill shows them) and the sponsor identity (`fpc.id`, `fpc.isProtocol`), which `recordOf` drops. A sibling projection beside `resolveSavedSelection`, the key's reader, in `fee-helpers.ts` |
| One storage boundary for every UI write | `storageLocalSet` in `src/utils/storage.ts:78` (the migration barrier facade; `storage-facade-ban.test.ts` forbids raw `chrome.storage.local` in UI code) | **reuse-as-is** as the place a cross-engine rule lives |
| Strip Vue state before a structured-clone sink | `jsonSanitize` (`packages/wallet-core/src/utils/serialization.ts:57`, `JSON.parse(jsonStringify(x))`) on the RPC wire (`packages/extension-messaging/src/core/base-client.ts:130`, `src/core/base-service.ts:113,130`) | **not reused**: it is a wire codec (bigint, class instances); on storage it would silently rewrite persisted values (a `Map` becomes an entries array, a `Set` an array, a `bigint` a string, `undefined` keys vanish). See decision D1 |
| Handled rejection of a fire-and-forget write | `pickForSend` in `FeeSettingsCard.vue:381` (`mutateSendSelections(...).catch((e) => console.error(...))`) | **reuse the pattern**; the argument follows the logging policy (`{ error }`), not `getErrorData` |
| A storage fake that clones like Firefox | `fee-send-selection.test.ts:11-19` mocks the facade with `structuredClone` on read and write; `FeeSettingsCard.test.ts:711,1753` clone on read only | **adapt**: `FeeSettingsCard.test.ts`'s `stubChromeStorage().set` clones too |
| Boundary unit tests | `src/utils/storage.test.ts` with `installChromeStorage` (`apps/extension/tests/helpers/chrome-storage-mock.ts:23`, `set` does `Object.assign`, no clone) | **reuse-as-is** |
| Error projection in logs | `trim()` → `projectError()` in `src/wallet/logger/utils.ts:174,201` (`{ name, message }`, message URL-scrubbed and capped at 200); `LoggerStore.log` runs `trim` on every argument (`store.ts:76`); `LoggerStore.get(count)` reads the buffer | **reuse-as-is**: passing `{ error }` is the whole fix |
| A scanner rule for flatteners | `log-payload-ban.test.ts:60` `EXTRA_NAMES` bans the flatteners `getErrorMessage` and `errorMessageFromUnknown` by name | **no new rule**: see decision D3 |

## #297 claims checked against the tree

- **Holds.** `persistSelection` (`FeeSettingsCard.vue:362-373`) writes the picked row into the `nulo:ui:feePaymentMethods` map; `handleMethodPicked` (`:391-402`) calls it as `void persistSelection(m)`.
- **Refined.** The emitted row `m` is a plain object: `menuMethods` is a computed and `FeeMethodSelector`'s `menu` is `menuOrder(props.methods)`, both raw. Only `m.fpc` is a Proxy: `buildFeeMethods` takes it from `knownFpcs`, which reads `registeredFpcs` (a deep `ref`, `:108`), `fpcEdits` (a `reactive(Map)`, `:113`) or the Pinia store's FPC list (`earlyFpcs`, `:128`). So `fj` picks save; `private_fpc` and sponsor picks fail.
- **Holds, with a count.** The seven network files the issue lists each pick `sponsored` in an app window or an authwit popup, where `originPrivacy` is null: `approveExecute(..., { feeMethod: "sponsored" })` in `tx-sendTx-sponsoredFpc:56`, `concurrent-sendtx-confirm:81,86` (×2), `concurrent-sendtx-approve:100`, `same-token-concurrent-sends:417`, `selfpay-phase:383`; `pickFeeAndSubmitAuthwitPopup` in `authwit-lifecycle:130` (three popups); `popup-escape-layered`'s Enter on a fee row. That is 10 picks, the issue's 10 errors. Inference: every recorded `DataCloneError` is this one write.
- **Holds.** Send's own pick (`pickForSend`) writes `recordOf(m)` through `fee-send-selection.ts`, whose `asRecord` rebuilds the record from primitives. Send is not affected.
- **Did not hold: `BalanceView.vue` is not a caller.** It imports `storageLocalGet` and `storageLocalSet` (`:19`) and calls neither.
- **Missed by the issue: `src/composables/syncedRef.js:18`** also calls `storageLocalSet` (unawaited, in a `watch`). Its one user (`app.store.ts:68`, `loggerWindowId`) stores a number or `null`. Plain today.
- **`popup/windows/execute/index.vue:560`** writes `{ "nulo:ui:activeAccount": address }`, a string. Plain. The errors in the app windows come from the fee card the window hosts, not from this write.

### Caller audit (every `storageLocalSet` call site)

| Call site | Value | Verdict |
|---|---|---|
| `src/popup/components/modules/send/FeeSettingsCard.vue:365` | the map, with the picked row inserted | **is-proxy** (nested `fpc`) |
| `src/composables/usePinnedTokens.ts:178` | `next`, rebuilt by `sanitizePinMap` from the storage read, then edited | plain |
| `src/popup/components/modules/send/fee-send-selection.ts:84` | `update(stored)`, rebuilt from primitives by `asRecord` | plain by construction |
| `src/popup/pages/settings/fpcs/index.vue:101` | the map just read from storage, with entries deleted | plain |
| `src/stores/app.store.ts:135,380,402,477` | a boolean, an address string | plain |
| `src/popup/windows/execute/index.vue:560`, `NewAccountPopup.vue:86`, `new-profile-helpers.ts:53`, `settings/accounts/import.vue:124` | an address string | plain |
| `src/utils/lastActiveProfile.ts:15` | a profile id string | plain |
| `src/composables/syncedRef.js:18` | a window id or `null` | plain today (an object synced later would be reactive) |
| `src/popup/components/modules/general/BalanceView.vue` | none: import only | not a caller |

Other UI writers: `MigrationBarrier.vue:101` (raw `local.set` of a literal, allowlisted) and `LegalAcceptanceSheet.vue:63` (`session.set` of a version string). Popup-to-worker RPC payloads pass `jsonSanitize`, so they carry no Proxy. Searched: `storageLocalSet` over `*.ts`, `*.vue`, `*.js`; `storage\.(local|session|sync)\.(set|remove)|browser\.storage|sendMessage\(|\.postMessage\(` over `src/`.

### Readers of `nulo:ui:feePaymentMethods`

- `FeeSettingsCard.vue` `prefillSelection` (`:621-627`) assigns the saved record to `selectedMethod` before the fetch. The trigger then shows its `title` and `data-fee-method={subtitle}` (`FeeMethodSelector.vue:54,56`). On a same-identity re-run, the gate stays open, so the saved record also drives `derivedSettings` (`type`, `fpc.id`), `payerOut` (`type`, `fpc.id`, `fpc.isProtocol`), `feePayer` (`fpc.isProtocol`) and `FeeMethodRow` (`type`, `fpc`) until the commit replaces it.
- `resolveSavedSelection` (`fee-helpers.ts:147`) reads `type` and `fpc.id`.
- `settings/fpcs/index.vue:92-102` reads `fpc.id` per entry when an FPC is deleted.
- `settings/security/reset.vue:86` removes the key.
- Not in any backup slice or migration footprint (`realMigrations` is empty; searched `feePaymentMethods|fee.?payment.?method` and `nulo:ui:` over `src/wallet` and `packages/*/src`).
- No reader uses a saved record's `spend`, `disabled`, `disabledReason`, `setAside` or `checking`, or `fpc.profileId` / `fpc.chainId`.

### Engines

- `structuredClone` refuses a Proxy on V8 (Node: `DataCloneError: #<Object> could not be cloned.`) and on JavaScriptCore (Bun 1.4.2: `DataCloneError: The object can not be cloned.`), checked with a bare Proxy and a Vue `reactive` element. Unit tests run on Bun, so a clone-based pin is red on base there too.
- `cacheStore.feePaymentMethods` (`src/stores/cache.store.ts:24`) is written by the card (`:366-371`, `:849`) and read nowhere (searched `feePaymentMethods` over `src/`).

## #295 claims checked against the tree

- **Holds.** `src/wallet/services/account-integrity/coordinator.ts:83` (`"boot integrity verification failed", String(error)`) and `:176` (`"integrity block persist failed", String(writeError)`), both `this.logger.log(..., LogLevel.Error, ...)`.
- **Did not hold: two lines, not five.** The same flattening sits in `src/wallet/services/account/service.ts:171` (`"imported-key orphan sweep failed", String(err)`), `:652` (`"integrity block persist failed", String(writeError)`) and `:657` (`"integrity session close failed", String(closeError)`), all at `LogLevel.Error`. The last two are the account service's half of the same integrity path.
- **Holds.** `trim()` projects an `Error` under any key to `{ name, message }`, URL-scrubbed and capped at 200 characters; a bare string gets URL scrubbing only, with no cap.
- **Holds.** `log-payload-ban.test.ts` matches denied names, not shapes, so `String(error)` passes it. Its `EXTRA_NAMES` already bans two error flatteners by name (`getErrorMessage`, `errorMessageFromUnknown`).
- No test asserts on these lines' arguments (searched `coordinator.test.ts`, `coordinator.default-deriver.test.ts`, `account/runtime-mismatch.test.ts`, `account/service.test.ts` for `integrity|logger|String\(`). Both coordinator suites and `runtime-mismatch.test.ts` build a real `LoggerStore`.

### Inventory for a `String(…)` refusal

Every logger call (the scanner's own `LOG_CALL` callee set) with `String(…)` as a direct argument:

- the five lines above;
- `packages/extension-messaging/src/core/base-client.ts:248`: `this.logDebug("Event received", String(event))`. `event` is a `keyof TEvents` (a property key, possibly a symbol) that the line above has just proven to be a declared event name; the comment says echoing it is deliberate. Flattening is required here (a symbol is not a loggable value), so this line is correct as written.

No `String(…)` nested in a logger call's object literal. Searched with a Node pass over the scanner's roots using its `LOG_CALL` regex and balanced windows, plus `grep -rnE "(\.log\(|logDebug\(|logInfo\(|logWarn\(|logError\(|console\.(warn|error|log|info|debug)\()"`.

### Adjacent, outside the lane

- `getErrorData(e)` (`packages/wallet-core/src/utils/errors.ts:17`, the stack or the message as a string) is passed to a log call at 13 sites, among them `FeeSettingsCard.vue:382` and `:704`. It flattens an error exactly as `String(error)` does, and `EXTRA_NAMES` does not list it. No issue tracks it (searched `gh issue list --state all --search getErrorData`).
- The mismatch line above `coordinator.ts:176` logs `` `profile=${profileId} chain=… index=…` ``: identifiers, not an error. Not the defect #295 names.

## E2E facts

- `bun run e2e:agent` is `apps/extension/scripts/e2e/agent.sh`: it runs `scripts/e2e/proverless-guard.sh` (refuses an `@requires-proverless` file unless `NULO_E2E_PROVERLESS=1`), builds `dist/<browser>`, then `vitest run --config vitest.e2e.network.config.ts`. Ports come from `~/.agents/ports.md`; `NULO_E2E_RETRY` sets the retry count (default 2).
- Firefox's stderr is inherited by the vitest fork (`tests/e2e/fixtures/browser/firefox.ts:166-175` spawns geckodriver with `stdio: ["ignore", "ignore", "inherit"]`), so `JavaScript error: … DataCloneError …` lines land in the run's own output. No log file captures it.
- Firefox extension-page errors do not reach `pageErrors` (`FIREFOX.md` line 46, #281), so `popup-escape-layered`'s `pageErrors` assertion is vacuous on Firefox today.
- Of the seven files, only `same-token-concurrent-sends` carries `@requires-proverless`; `concurrent-sendtx-confirm` and `concurrent-sendtx-approve` call `holdProofGate` and are on the README's STUB list. CI's Firefox lane runs all seven proverless (`pr-extension-network-e2e-firefox.yml:149-176`: the pool shard, `heavy` with `selfpay-phase`, `heavy` with `concurrent-sendtx-confirm` + `same-token-concurrent-sends`).
- Smoke loads a prebuilt `dist/<browser>` (`FIREFOX.md` line 5 names the build and run flags), has `retry: 2` in its config (`--retry=0` on the command line overrides it) and no stall watchdog. The only smoke test that picks a fee method is `send-keyboard.test.ts` (Send's own pick, not the affected write).

## Open work and collisions

- Open PRs: #298 (e2e-followups-2 arc 1: `waitForTxMined`, owner reaping), #293 (e2e-harness-gaps, draft), #271 (tokens-and-balances, draft). None touches `FeeSettingsCard.vue`, `fee-helpers.ts`, `storage.ts`, `chrome-storage-mock.ts`, `coordinator.ts`, `account/service.ts` or `log-payload-ban.test.ts` (checked with `gh pr diff <n> --name-only` on 2026-10-11; the implementer re-checks before delivery).
- Out of the lane, per its brief: #281 (its relay re-lands after #297), #294 and #290 (`owner-decision`), #262 (waits on #271), #277 (waits on page 7 P7-09).
