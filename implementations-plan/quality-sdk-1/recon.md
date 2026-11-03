# quality-sdk-1 recon

Base: `origin/dev` at `51a692426`. Two Sonnet explorers (#1451 sites, #1474 headers); #1444 read by the planner. The issues cite `51ea220b1`, an ancestor of the base; every line below is at the base.

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| A promise against a timer, timer always cleared | none shared. `withTimeout` (`apps/extension/src/stores/balances.store.ts:140`, store-local, auto-imported, called only in its file and its test); file-local `withinDeadline`, `settleBy`, `runWithWatchdog`. Searched `withTimeout\|raceDeadline\|raceTimeout\|withDeadline\|withinDeadline\|settleBy\|pTimeout\|timeoutAfter\|AbortSignal.timeout` over `apps/` and `packages/` | build new: `raceTimeout` in `packages/wallet-core/src/utils/` |
| A promise against an `AbortSignal` | none shared. File-local `settledOrAborted` (`chain-tip-gate.ts:133`), `untilOrAborted` (`execution-lane.ts:711`), `waitForPriorOrAbort` (`execution-mutex.ts:250`); `abortableSleep` (`utils/abortable-sleep.ts`) is a timer, not a race. Searched `untilOrAborted\|settledOrAborted\|OrAbort\|raceAbort\|AbortSignal.any` | build new: `raceAbort` beside it |
| Where a shared helper lives | `packages/wallet-core/src/utils/` (barrel `index.ts`, subpath `@nulo/wallet-core/utils`); `extension-messaging`, `aztec-runtime` and the extension already depend on and import it (`sleep`, `deferred`) | reuse-as-is, no `package.json` change |
| Parse a `_headers` file | `siteHeaders` (`apps/landing/scripts/headers.ts`, the `/*` block, keeps case, imported by `vite.config.ts` and its test); a private `headerRules` in `infra/token-list/test/host.test.ts:8` (every block, lower-case, skips `#`) | reuse `siteHeaders`, lower-case in the caller |
| The three Workers' header maps | `export const OWN_HEADERS` (`apps/landing/src/worker.ts:14`), `SECURITY_HEADERS` (`infra/subscribe/src/respond.ts:3`), `POLICY` (`infra/passkey-rp/src/worker.ts:21`); none of the three files has a side-effecting import | reuse-as-is by relative import |
| A cross-workspace drift test | `scripts/ci-cd/*.test.ts`, run by `test:ci-gating` (`bun test scripts/ci-cd/`, inside `_unit-tests.yml`); they read sibling files as text (`build-env-guard.test.ts:12`); no static import from `apps/` or `infra/` yet (searched `from ".*\(apps\|infra\)/`) | build new test there |
| Move a cluster out of `background.ts` | precedent `discovery-flow.ts` (#741, `689d0934e`): its own `DiscoveryDeps`, projected by `discoveryDeps(deps, state)` in `background.ts:786` | adapt the precedent twice |

## #1444 facts

- `background.ts` is 971 lines. Wiring `:110-317`, plus `serializeDecryption`, the discovery drain and `discoveryDeps` (`:742-803`). Content admission `:320-474`: `DiscoveryCredit`, `ContentWrapperDeps`, `buildContentTransport`, `admitContentMessage`, `keyExchangeFromItsDiscovery`, `senderDocumentOrigin`, `replyIfStale`. It reads no `SdkDeps` field; its imports are the logger, `content-message-relay`, `content-script-validator`, `stale-session`, `describeExternalId`, `isReceiverGoneRejection` and `chrome.tabs.sendMessage`. The request pipeline `:100-102` (`SESSION_NO_LONGER_VALID`) and `:528-740`, `:805-971`: `onWalletMessage`, `createQueuedJournalIfStamped`, `refuseOverPendingCap`, `dropUnrunMessage`, `runEstablishedMessage`, `WalletMessageDeps`, `handleWalletMessage`, `isExpectedRefusal`.
- Test-only exports: `dispatcherNetworks` (`background.unserved-chain.test.ts`), `createSdkHandlerState` (`session-holders.test.ts`), `handleWalletMessage` (`background.{refusal-log,legal,reset-wait}.test.ts`, `session-revocation.test.ts`). Every other `background.*.test.ts` drives `initWalletSdkHandler`.
- Admission is covered black-box by `background.transport.test.ts` (order of checks, stale reply, key exchange from its discovery's tab and origin, the iframe flag), so a wrong move turns it red.
- Pins that name the file: `legal/call-sites.test.ts:36`, `utils/copy-dash-ban.test.ts:177` (`SESSION_NO_LONGER_VALID`'s em dash), `price/not-dapp-exposed.test.ts:11` (reads `background.ts?raw`), `JsonViewer/useLogFilters.scan.test.ts:296` (`OWNED`), `tests/e2e/helpers/profile-chaos/model.ts:355` (`cite(…background.ts, 766, "discoveryQueue.drain(")`, checked by `scripts/e2e/profile-chaos-model.test.ts:794`). Docs: `CLAUDE.md` § Terms acceptance, `ARCHITECTURE.md:178` and `:187`. Comments naming moved functions: `operation-journal/spec.ts:222` and `service.ts:581` (the latter already stale).
- No import-cycle lint (searched `noImportCycles\|madge\|dependency-cruiser` in `biome.json` and `scripts/`).

## #1451 facts (sites at the base)

| # | Site | On timeout or abort | Clear | Work rejects? | Pinned by |
|---|---|---|---|---|---|
| 1 | `wallet-core/src/migration/migrator.ts:85` `runWithWatchdog` | `staging.revoke()`, throws `UpTimeoutError` | finally | yes, pre-caught | `migrator.test.ts` "a stuck up() fails at the watchdog bound" |
| 2 | `extension-messaging/src/core/base-client.ts:295` | throws `makeTimeoutError` | finally | yes | `base-client-readiness.test.ts` "(PIN) a wedged transport readiness…" (asserts a rejection, not which) |
| 3 | `extension-messaging/src/background/service.ts:65` `announceReady` | `"bound"` | after the await | no (deferred) | `service.test.ts` "a port still waiting at the init bound…" |
| 4 | `aztec-runtime/src/pxe/opfs-store.ts:125` | throws `ChainStoreOpenTimeoutError` | outer finally | yes | `opfs-store-open.test.ts` (four cases) |
| 5 | `stores/balances.store.ts:140` `withTimeout` | throws `` `${label} timed out after ${ms}ms` `` | both arms | yes | `balances.store.test.ts` `describe("withTimeout")` |
| 6 | `popup/auth-guard.ts:85` `withinDeadline` | throws "lookup deadline exhausted" | `.finally` | yes, pre-caught | `auth-guard.test.ts` (deadline, unhandled-rejection cases) |
| 7 | `composables/useLockWallet.ts:62` | `{ answered: false }` | `.finally` | mapped | `useLockWallet.test.ts` (incl. "no timer is left") |
| 8 | `wallet/services/token/service.ts:1120` `settleBy` | `{ kind: "late" }`; `late` at once when no time is left | `.finally` | mapped | `token/service.test.ts:543`, `:583` |
| 9 | `composables/importPreflight.ts:40` | `{ kind: "timeout" }` | `.finally` | mapped | `importPreflight.test.ts` (incl. "leaves no timer behind") |
| 10 | `composables/importChainSync.ts:118` | `undefined` | `.finally` | mapped | `importChainSync.test.ts:194`, `:303` |
| 11 | `composables/full-backup-restore.ts:674` | void, then disconnect | finally | caught | `useFullBackupImport.test.ts:722` |
| 12 | `composables/useDappApprovalWindow.ts:122` `endAndClose` | void, then close | finally | caught | `useDappApprovalWindow.test.ts:248` |
| 13 | `wallet/services/profile/service.ts:1558` | void (monotonic clock) | after the await | no (deferred) | `service.integration.test.ts` ~2264-2298 |
| 14 | `wallet/services/network-reset/service.ts:297` | void | after the await | no | `service.test.ts:971` |
| 15 | `components/JsonViewer/LogsViewer.vue:227` | rejects the string `"Logs fetch timeout"`, swallowed by its `catch {}` | finally | yes | `LogsViewer.test.ts:107`, `:120` |
| 16a | `execution/chain-tip-gate.ts:119` `readWithin` | races the injected `deps.sleep` | aborts the sleep | yes | `chain-tip-gate.test.ts` (injected sleep) |
| 16b | `chain-tip-gate.ts:133` `settledOrAborted` | void | n/a | `void promise.finally(done)`: a rejection would go unhandled (latent: `refresh` catches) | "a cancel ends the wait while a tip read is still out" |
| 17 | `execution/execution-lane.ts:711` `untilOrAborted` | `false` | n/a | hangs (latent: its input is deferreds) | `execution-lane.test.ts:893` (fulfil), `:909` "an abort ends the wait for earlier sends with false" |
| 18 | `execution/execution-mutex.ts:250` `waitForPriorOrAbort` | throws `ExecutionMutexAbortError` | n/a | both arms resolve | `execution-mutex.test.ts` (five abort cases) |

Not in the issue, same family, left out (different mechanism): `apps/landing/src/feed-dom.ts:120` (another app, no `wallet-core` dependency), `wallet/utils/offscreen.ts:405` (a shared gate's deferred), `utils/core.ts:38` `waitForServiceReady`, `composables/unlockWait.ts:77`, `wallet/utils/toolbar-popup.ts:128`, `NewTokenPopup.vue:113` (timer against an event or a watcher).

Corrected after Codex r1: the site 17 row first read "none for abort". Claims that did not hold: sites 5, 17 and 18 hold no `Promise.race` (hand-built `new Promise`); site 4 has one race (the "two spots" are its timer and its clear); `wallet-core/src/utils/` exports far more than `deferred` and `sleep`, but nothing time-related besides them; `abortableSleep` is site 16a's timer. Closed #202 fixed sites 9 and 10's leaks; closed #222 deferred `raceDeadline` until timing pins exist.

## #1474 facts

| Header | landing `_headers` `/*` | landing Worker `OWN_HEADERS` | subscribe | passkey-rp `POLICY` | token-list `_headers` |
|---|---|---|---|---|---|
| HSTS | `max-age=63072000; includeSubDomains; preload` | absent | as landing | `max-age=31536000; includeSubDomains` | as passkey-rp |
| nosniff | yes | yes | yes | yes | yes |
| X-Frame-Options | `DENY` | absent | `DENY` | `DENY` | absent |
| Referrer-Policy | `strict-origin-when-cross-origin` | `no-referrer` | `no-referrer` | `no-referrer` | `no-referrer` |
| Permissions-Policy | camera, microphone, … `browsing-topics=()` | absent | as landing | `publickey-credentials-create=(), publickey-credentials-get=()` | absent |

- Hosts: landing and its Worker serve `nulo.sh` (the Worker only `/api/*`, empty-bodied 404, 405, 503); subscribe has no hostname (service binding behind `nulo.sh/api/subscribe`); passkey-rp `passkey.nulo.sh`; token-list `tokens.nulo.sh` (JSON, CORS `*`).
- Each surface's own test pins its own literal (`apps/landing/src/worker.test.ts:22`, `infra/subscribe/test/worker.test.ts:45`, `infra/passkey-rp/test/policy.ts`, `infra/token-list/test/policy.ts`); `apps/landing/scripts/headers.test.ts` pins only the CSP. Nothing compares surfaces; `infra/subscribe/README.md:35` says HSTS and Permissions-Policy are "as the landing sets it".
- No doc gives a reason for any HSTS value or for a missing X-Frame-Options (searched `hsts\|max-age\|preload\|x-frame` in the READMEs and `SECURITY.md`).

## Open work and neighbours

- Issues: #1444, #1451, #1474 open, no comments. No related issue (`gh issue list --state all --search "security headers"`, `"HSTS"`). Closed known limits searched (`timeout`, `headers`, `background.ts`): none covers these refactors.
- Neighbour lanes: quality-services-1 arc 1 (in flight) edits `token/service.ts`'s constructor and `network-reset/service.composition.test.ts`, not sites 8 or 14; quality-profile-1 (#1439, `profile/service.ts`) and quality-popup-1 (#1443, `full-backup-restore.ts`) have not started; quality-execution-1 arc 2 touches `execution/{operation-planner,dapp-send-executor,transfer-executor,execution-coordinator}.ts`, not the lane, mutex or tip gate. No open PR touches a file here.
