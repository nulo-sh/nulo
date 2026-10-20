# test-infra-1: recon

Read at `origin/dev` 0fe841be (2026-10-17). Three read-only explorers (sonnet) plus the planner's own checks. Every path is under `apps/extension/` unless it starts with `packages/` or `scripts/`. The issues cite `110446a4`; line numbers below are current.

## Reuse map

| Capability | Existing code | Verdict | Reason |
|---|---|---|---|
| One walk over the sources | `scripts/type-roles/source-scan.ts:50-64` (`sourceFiles`, typography roots, `SKIPPED`, `EXEMPT`) | adapt | Right base; roots and extensions are hard-coded for the typography guards. A policy argument carries each guard's roots, extensions and skips. |
| Every `packages/*/src` root | copied in `utils/log-payload-ban.test.ts:39-52` and `components/JsonViewer/useLogFilters.scan.test.ts:27-38` | build new (one export) | The same expression twice, verbatim. |
| `.vue` split into script blocks with their start line | `source-scan.ts` `parseSource` (`scripts[].startLine`) | reuse | Exactly what a line-keeping tokenizer needs. |
| Template expressions of a `.vue` | `source-scan.ts` `walkTemplate`, `walkElements`, `directive` | reuse | `DottedTerm.scan` and the call scanners can read templates through it. |
| A TypeScript-based tokenizer | none shared; `ts.createSourceFile` in `utils/copy-dash-ban.test.ts:289`, `utils/icon-names.test.ts:131`, `utils/type-role-ban.test.ts:347` | build new | No masker or call reader exists; the three hand lexers produce different outputs. No code uses `ts.createScanner`. |
| Call-argument reader | `useLogFilters.scan` `skipToken`/`callArgs`; `toast-call-sites` `pastString`/`closing`; `service.fence-entry` `callArguments`; `amount.callers` `callArgs`/`topLevelArgs` | build new, replaces four | Four divergent copies; none skips both strings and comments. |
| A walk that cannot pass on nothing | per-guard `> 500` checks; none in `storage-facade-ban`, `useConfirm`, `a11y-css`'s skeleton check | adapt into the walker | The issue's path: a root the walk stops seeing passes. |
| Approval-window shell contract | `composables/useDappApprovalWindow.test.ts` (14 tests) | reuse as is | Proves the six contracts the window suites re-pin. |
| Shared window harness | none; three copies (`popup/windows/capabilities/index.test.ts:25-250`, `discover/index.lifecycle.test.ts:25-234`, `execute/index.test.ts:29-351`) | build new | `vi.mock` stays per file (hoisted); state, spies and builders move. |
| Popup key events | `tests/helpers/press-key.ts` (`pressOn`) | reuse | The key primitive exists; the matrix does not. |
| Authwit keyboard matrix | `ChangeAuthwitsRegistryPopup.test.ts:118-308`, `RevokeAuthwitsPopup.test.ts:126-375` | build new | Line-for-line copies apart from the service mock, the submit testid and the fee control. |
| Await a handler's result | `tests/helpers/held-read.ts:24` `liveBus` (a real `EventHandler` with spied `add`/`remove`) | adapt | `invoke` drops handler promises (`packages/wallet-core/src/utils/event-handler.ts:47`); the bus can keep them without touching production. |
| Parked call with a reached signal | `held-read.ts` `holdReads`, `deferred` from `@nulo/wallet-core/utils` | reuse | Covers the "has not happened yet" sites that are not event handlers. |
| Shared `deferred` | `packages/wallet-core/src/utils/deferred.ts:8` | reuse | Three local copies left after #595. |
| Generic e2e poll | none; `tests/e2e/fixtures/dom.ts:83` `withTimeoutMessage` wraps Puppeteer waits only | build new | About 30 hand-rolled deadline loops. |
| Transient-state probe | `tests/e2e/passkey-backup.test.ts:63-86` `armProgressObserver` (Creating phase only) | adapt | Parameterise its predicate for the Encrypting phase. |
| In-file poll helpers | `tests/e2e/network/account-switch-isolation.test.ts:208-236` | reuse | `:371-393` is a line-for-line copy of both. |
| Token-balance graph builder | `wallet/services/token-balance/service.test.ts:1168` `startWorld` (4 users) | adapt | 15 near-identical `ServiceCollection` builds. |
| `chrome.storage.local` stub | `tests/helpers/chrome-storage-mock.ts` `installChromeStorage` (persisting only; 10 users) | adapt | 24 hand stubs discard writes; a blanket swap to a persisting map changes behaviour. |
| Real repository over a fake browser | `incoming-transfer/service.composition.test.ts:72,129`; `packages/wallet-core/src/testing/fake-browser-api.ts:292` | reuse | The scenario suite already builds a `FakeBrowserApi` (`:457`) that its mocked repository never reads. |
| Builder harness precedent | `wallet/services/token/seeder.harness.ts` (no `vi.mock`, plain builders) | reuse the shape | For the backup pair. |
| Unit tests for e2e fixtures | `scripts/e2e/*.test.ts` (e.g. `chaos-seed.test.ts`) | reuse the place | Pure-TS e2e helpers are unit-tested there, in `bun run test`. |

Absence trails: walkers by `readdirSync|readdir(|walk(|globSync|Glob|withFileTypes|isDirectory|SCAN_ROOTS|listFiles|sourceFiles|recursive|source-scan` under `apps/`, `packages/`, `scripts/`; tokenizers by `createScanner|createSourceFile|stripNoise|skipToken|closing(`; e2e polls by `Date.now() <|deadline|for (;;)|while (` in `tests/e2e`; deferred copies by `function deferred|const deferred\b|const _deferred|withResolvers|function (held|gate)\b`.

## Source guards (#561)

| Guard | Walk today | `.vue` | Collides |
|---|---|---|---|
| `utils/copy-dash-ban.test.ts:336` | `src`, `packages/design/src`, `packages/extension-messaging/src` + one file; ts/js/vue; skips test, stories, `.d.ts` | SFC parse + `ts.createSourceFile` | no |
| `utils/log-payload-ban.test.ts:114` | `src` + every `packages/*/src`; ts/js/vue; skips `node_modules`, `dist` (tests dropped later by its allowlist) | template blanked by a per-line regex | no |
| `components/JsonViewer/useLogFilters.scan.test.ts:40` | same roots (copied); ts/vue; skips test, spec | raw text | no |
| `utils/storage-facade-ban.test.ts:53` | `src`; ts/js/vue; no skip | raw lines | no |
| `utils/profile-ui-keys.scan.test.ts:32` | `src`; ts/js/vue; skips tests and `types/` later | raw lines | no (onboarding-3 edits the scanned `profile-ui-keys.ts`, not the test) |
| `utils/toast-call-sites.test.ts:13` | `src`; ts/js/vue; skips test, stories, `.d.ts` | raw text | no |
| `wallet/services/legal/call-sites.test.ts:13` | `src`; ts/vue; skips test | raw text | no |
| `wallet/services/profile/expiry-deferral.pins.test.ts:13` | `src`; ts/vue; skips test | raw text | no |
| `components/composite/DottedTerm.scan.test.ts:14` | `src`; vue only | regex `<DottedTerm\b([^>]*)>` | no |
| `utils/icon-names.test.ts:153` (missed by the issue) | `src`, `packages/design/src`; ts/js/vue/css | SFC + TS | no |
| `composables/useConfirm.test.ts:226` (missed) | `src`; ts/js/vue; skips tests, `types/` | raw text | no |
| `utils/a11y-css.test.ts:62` (missed, half on the shared reader) | `src`; vue/css | raw text | no |
| `scripts/type-roles/identifier-sites.ts:446-465` `filesUnder` (missed) | `apps/*/src`, `packages/*/src`; ts/js/vue | raw text | no (lanes edit only `identifier-sites.expected.json`) |
| `wallet/services/execution/service.fence-entry.test.ts:214` | `src`; ts/vue; skips test | raw text + own `callArguments` | **execution-integrity-1** (in its diff) |
| `utils/amount.callers.test.ts:82` | `src`; ts/vue; skips test | raw text + own `callArgs` | **ui-leftovers-1** (PR #678) |

Not source guards, left alone: `packages/design/src/theme-vars.ts:58` (a package helper; a package cannot import from an app), `src/manifest.test.ts:103` (reads `apps/landing`), `scripts/phantom-sweep.ts` (a CLI), and the build-output readers.

Tokenizers: `log-payload-ban`'s `stripNoise` (`:173`, complexity acceptance 41 in `scripts/complexity-baseline/manifest.json`) blanks comments, string and regex contents line by line, keeps `${}` bodies and every offset; 60 fixture tests drive it through `findLoggedSecrets`. `useLogFilters`' `skipToken`/`callArgs` (`:52-86`) skip strings and comments in place and do not parse `${}`. `toast-call-sites`' `pastString`/`closing` (`:21-60`) skip quotes only. No guarded call (`openToast(`, `assertCurrent`, `services.add(`, `formatAmount(`, `executeOperations`) appears in any `.vue` template today (planner's check).

## Window and popup suites (#550)

Shell suite (`useDappApprovalWindow.test.ts`, 14 tests) pins: connects first, session gate, auth redirect, listener after init, unload rejects, dispose order, `closeWindow(true|∅)`, exact listener detach, `completeInteraction`, the profile-change guard, strip precedence, `setError`, `clearError`, the slow-session path. Per window (capabilities 35 tests, discover lifecycle 15, execute 45): six re-pin the shell (A2 session gate, A3 auth redirect, A4 listener after init, A6 close semantics, A7 no double reject, C12 profile guard), two prove the window's own connect and disconnect lists (A1, A5), the rest are per-window. C12 also proves the window subscribes the guard to its profile client, which the shell suite cannot see. Stale headers: `capabilities/index.test.ts:1-19` ("so a shell extraction can be graded"), `execute/index.test.ts:1-23` and `:602-606`. `discover/index.test.ts` has its own unrelated harness. Five windows use the shell; `fee` and `network-unavailable` have no lifecycle suites.

Authwit popups: identical nested-form fixture (`createApp`, because a second VTU mount drops the first's stubs) and seven "Enter elsewhere" tests; Send/Revoke-button blocks share Enter, Space, held Enter, unset fee, second press in flight and click. Revoke keeps its content-button, chunk-shortfall and error-keeps-disabled cases.

## Test collaborators (#540)

- `incoming-transfer/service.scenarios.test.ts` (7348 lines, about 264 tests): `vi.mock("./repository")` at `:71-165` over five module `Map`s. Verified: `setTrust` writes `updatedAt: 0` (`:102`; real: `Date.now()`); `readTrustForWrite` (`:96`) exists only in the fake. Not in the issue: the fake's `clearProfile` keeps cursors and outbox (real `clearScope` clears all five, `repository.ts:243-249`), its `clearChain` matches values not key prefixes (`repository.test.ts:46` pins the real one), and `commitAcceptance` is two writes, not one batch. About 155 tests read or seed the maps directly, 11 park through `readTrustForWrite`, about 22 reach `.repo`. Complexity acceptance 30 on the fake's `clearChain`. Collides: **storage-privacy-1** (re-keys note rows, edits this file) and **service-structure-1** #547 (moves the balance-refresh outbox out of the service).
- `token-balance/service.test.ts`: 15 `new ServiceCollection()` builds (`:197 … :1420`), `startWorld` at `:1168` (4 users), `boot()` at `:1414`. No lane edits it.
- `useFullBackupImport.test.ts` / `.stages.test.ts`: byte-identical `buildBackup`; the stages copy of the mock scaffold has drifted (no `restore-outcome` mock, no `assertRunFence`, no `FENCE`). Literal roots each equal a real constant today. Collides: **ui-dedupe-1** #541 (import selection union).
- `packages/wallet-bridge/src/dispatcher.test.ts`: 44 `new WalletSdkDispatcher(` sites, about 11 named builders (the issue said four). Collides: **dapp-boundary-2** (PR #679) and dapp-boundary-1 (`dispatcher.ts`).
- Hand `chrome.storage.local` stubs: 24 discard writes (11 identical one-liners, 13 `stubGlobal` variants), 2 record writes, 6 persist with extras (`structuredClone`, `QUOTA_BYTES`, `getKeys`). Colliding files: `onboarding/pages/import.test.ts`, `popup/pages/profile/new.test.ts`, `settings/security/export/{full,seed}.test.ts` (**onboarding-3**), `popup/pages/settings/index.test.ts` (**sheet-1**).

## Waits (#536)

- `EventHandler.invoke` returns nothing and drops handler promises; `#callbacks` is private.
- Guessed turns, current lines: token-balance `:831` (40), `:895` (40), `:957` (20, a "not yet"), `:1089` (40; the comment at `:1084-1086` says the un-awaited dispatch is the property under test), `:1455` (10, not in the issue); `network/client.test.ts:8-10` (5); `composables/importChainSync.test.ts:207,324` (5); `useArrivals.test.ts:96-98` (60; **storage-privacy-1**); `wallet-sdk/background.{connect-window,admission,transport,reset-wait,unserved-chain,verify-reservation.pins}.test.ts` (20 to 300; **dapp-boundary-2** edits two, **service-structure-1** #545 moves the discovery code they drive); `execution/dapp-send-executor.test.ts:2172-2174` (**execution-integrity-1**).
- Local deferred copies left: `popup/components/modules/send/FeeSettingsCard.test.ts:190`, `popup/windows/execute/scope-follow.core.test.ts:50` (free), `popup/pages/send.integration.test.ts:222` (**execution-integrity-1**). Same shape under another name: `popup/locked-state.test.ts:48` `held()` (free), `wallet-sdk/background.unserved-chain.test.ts:57` (dapp-boundary-2). `gate()` (two promises) is a different shape.
- E2E: `tests/e2e/fixtures/helpers.ts` is a 27-line barrel since #632; its loops live in `session.ts`, `profiles.ts` (**onboarding-3**), `tokens.ts`. Deadline loops with contract T (throw with a label): `session.ts:28`, `profiles.ts:44,211`, `tokens.ts:300`, `journal.ts:89,131,352`, `browser/firefox.ts:360,418,650,712,736`, `browser/webdriver-classic.ts:60` (falls through to a failing request), `send-burst.ts:160,187,214`, `aztec.ts:78,865`, `token-list.ts:160`, `incoming-poll-gate.ts:41`, `mining-hold.ts:59`, `popups.ts:122,150`, `boot-guard.ts:121`; L (last state): `send-burst.ts:67`, `owned-processes.ts:240`; B (best effort): `aztec.ts:486` (documented), `extension.ts:204`; H (holds for a window): `send-burst.ts:89,176`, `network/verify-hold.test.ts:82`, `tx-sendTx-noFrom.test.ts:78`. About 15 more in specs. `passkey-backup.test.ts:175-183` polls for "Encrypting your backup" after the click; its observer (`:63-86`, armed `:109`) covers Creating only. Stall watchdog: `tests/e2e/stall-watchdog.ts`, `STALL_MS` 10 min (`tests/e2e/run-limits.ts:6`).

## Running lanes and their files (git diff `origin/dev...worktree-<lane>` at 17:10Z, plus their plans)

dapp-boundary-1: `execution/{service,view-executor,app-facing-results}.*`, two network specs. dapp-boundary-2 (PR #679): `dispatcher.{ts,test.ts}`, `wallet-sdk/background.ts`, `background.{connect-window,unserved-chain}.test.ts`, `discovery-approval.*`. execution-integrity-1: `execution/*` incl. `service.fence-entry.test.ts`, `send.integration.test.ts`, `auth-registry/*`, `task/*`. storage-privacy-1: `incoming-transfer/*` incl. `service.scenarios.test.ts`, `useArrivals.test.ts`, `RecentActivityView.test.ts`, `tests/e2e/rows.test.ts`. network-identity-1: `network/*` (not `client.test.ts`), `network-reset/*`. onboarding-3: onboarding, Home, export pages, `tests/e2e/fixtures/profiles.ts`, `helpers/{import,legal}-drivers.ts`. sheet-1: `Popup*`, `FormPopup`, settings search, `tests/e2e/{README,FIREFOX}.md`, `.claude/skills/e2e-testing/SKILL.md`, `fixtures/address-book.ts`. ui-leftovers-1 (PR #678): Header, BalanceView, holdings, `amount.callers.test.ts`, `fixtures/widgets.ts`. type-roles-coverage: no diff (arc 2 not started; its plan names `tests/e2e/fixtures/type-roles.ts` and `network/type-roles-windows.test.ts`). service-structure-1 and ui-dedupe-1: planning (no diff); their briefs name `background.ts` (#545), the incoming-transfer outbox (#547), `useFullBackupImport` (#541).

Closed known limits searched (`walker`, `source guard`, `deferred`, `poll`, `harness`, `fake repository`, `keyboard matrix`, `turn count`): none on these areas.
