---
plan: send-page-split-1
tier: mid
status: approved (final Codex pass approve; orchestrator auto-continue); arc 1 landed (#2014); arc 2 amended at 48ef589bd for #2018
issues: "#1930 (arc 3 closes it)"
driver: claude-code
claude_model: opus
codex_model: sol (gpt-6.1-sol, the lane brief's pin)
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 explorers (sonnet); Codex gpt-6.1-sol high + Opus Plan leg; final fresh Codex pass
base: origin/dev at 6bab0009e (arc 2: 48ef589bd)
trunk: dev
post_implementation_hardening: not scheduled
---

# send-page-split-1: Send's data, estimate and fiat gate move into composables; the page keeps orchestration

## The issue, checked (#1930)

- Holds: `send.vue` is 1,359 lines, script `:10-1066` at `6bab0009e`. It builds seven clients (`:127,182,225,250,408,598,758`), makes seven composable calls, has eight top-level watchers, one `onMounted` and one `onBeforeUnmount`. The pure helpers exist (`send-amount.ts`, `send-fee-gate.ts`, `send-fiat-gate.ts`, `send-labels.ts`, `send-submit.ts`).
- Does not hold: "hand-rolls `usePopupStack`". `usePopupStack` returns only `order` (undefined while closed) and `depth` (`NaN` while closed), with no `isOpened`, `open` or `close`. The page reads `order ?? 0`, and `useSendReview`'s sync watch reads `isTop` as `order === len - 1`, which is true for a closed sheet when one other popup is open. Swapping in the composable changes the values a closed sheet's props carry and the runs of that watch. The sheets stay inline (D2).
- The issue's line numbers are from `8ae2c06a4`; #1945, #2001 and #2002 moved them. This plan cites `6bab0009e`.
- #1930 carries `enhancement`. Inference: the lane's launch is the orchestrator's recorded decision to take it (Assumptions).

## Outcome & Quality Bar

- **For whom**: the next contributor who changes token loading, the estimate or the fiat gate on Send, and the person sending, who must notice nothing.
- **Excellent**: (1) every site does the same operations in the same order relative to every await, shown by a site table and by the mount suites passing unedited; (2) each moved concern reads top to bottom in one file whose inputs are named, with a suite of its own; (3) the pause Send passes stays in one place under one name (`ESTIMATE_PAUSE_MS`); when an estimate starts is the engine's rule since #2018 (D13).
- **Good enough**: the page still owns side selection, recipients and send-again, the fee line, submit and the sheets. They write the form's own state, so cutting them needs a callback per write; they stay.

## Assumptions

**Facts**
- F1. Inside one flush, a component's pre watchers run in the order they were queued (Vue 3.5.42 scheduler). A write queues a source's subscribers in their list order, and that list is not creation order: a watcher whose dependency drops and returns is appended again (Codex probe). So order is preserved when every getter, first evaluation, dependency change, write and flush mode happens in the same sequence. `useSendReview`'s watch is `flush: "sync"`, immediate (`composables/useSendReview.ts:37-50`); the page's eight are `pre`.
- F2. Biome 2.5.13 counts nested-function lines into the outer function and charges a nested function one extra nesting level per structural increment; comments and blank lines are not counted (recon, measured).
- F3. `useFeeEstimation` registers `onScopeDispose(engine.dispose)` (`composables/useFeeEstimation.ts:88` at 48ef589bd); `useTicker` registers `onUnmounted` (`composables/ticker.ts:30`).
- F4. Tests reach `w.vm.tokens` and `w.vm.contacts` (`send.test.ts:2186,2292`); no mock is keyed on a page-local module.
- F5. `popupStore.open` closes the key first and re-stacks it (`stores/popup.store.ts:19-24`).
- F6. A client's `disconnect()` rejects its pending requests (`packages/extension-messaging/src/core/base-client.ts:257`).
- F7. #2018 (48ef589bd, page 209 question 2) put when an estimate starts in the engine: at the end of the task that asked for it, after the pause only in a task `pauseThisTask` marked (typing, or a settle, which marks its own); `startWaiting` starts one still waiting and creates none, deferred by `nextTick` (`useFeeEstimation.ts:95-98`). Send binds both in five template bindings (`@input.capture` and `@picked` on `SendPersonStep`, `@typed` and `@picked` on `AmountCard`, `@reread` on `FeeSettingsCard`), and `requestEstimate` first lands a pending USD conversion (`convertNow`, `send.vue:853`).

**Inferences**
- I1. A hook call that creates no effect and evaluates no computed links no source (checked on the three drafts). A watch evaluates its sources when created, so each watcher a hook creates is created at its old place in the sequence (Watcher table). Example of why first subscription, not creation, decides: `activeToken` first subscribes to `tokens` during W0's immediate run (`:505` at 6bab0009e), so a commit to `tokens` queues W5 and W7 before W6 today, and still will.
- I2. Every moved getter keeps its read order (the fiat gate's two object expressions stay verbatim, `now` last): `usePrices` subscribes to the same 30-second ticker as `gateNow`, so a reordered read could reorder subscribers.

**Asks**: none for the owner. `OWNER-ASKS.md` says none: nothing a person sees changes.

## Decisions

| Id | Question | Decision and reason |
|---|---|---|
| D1 | Homes (settled question 1) | `useSendData`, `useSendEstimate`, `useSendFiatGate` in `src/composables/`, like `useSendReview`. The first two import nothing from `@/popup`. `send-fiat-gate.ts` and its test move by `git mv` to `src/utils/`: pure policy, shared once a composable reads it, as the layer rule's own message says. `recent-sends.ts` stays: no hook needs it. Explicit imports in the page, as today. |
| D2 | Seams (settled question 2) | The issue's cut, less the sheets. Arc 1 `useSendData`: identity-scoped reads, their fences, token-change and contact events. Arc 2 `useSendEstimate`: the estimator, the queued answer, the slow clock, the failure snack. Arc 3 `useSendFiatGate`: the reactive gate and the wall-clock gate at the press. The page keeps route preselection (`applyQueryContact`, `applyQueryToken`), the active token and sides, `onTokenDeleted` (it moves the selection), submit, the sheets, every watcher whose source is page state, `onMounted` and `onBeforeUnmount`. |
| D3 | Client ownership (settled question 3) | Unchanged for all seven: see the Client table. No hook constructs, connects or disconnects a client. |
| D4 | Budgets (settled question 4) | Measured on drafts: Budget table. Inner functions that would pass 15 become module-level functions (`fetchIdentity`, `transferFeeAsk`). No suppression, no manifest entry. |
| D5 | Arcs (settled question 5) | Three PRs against `dev`, no stack, each green on its own: data, then estimate, then fiat gate with the close-out. |
| D6 | The post-load step | `useSendData` takes `onLoaded(list)`, called in the commit's task right after `tokens`, `contacts`, `journalOps` are written. The page's handler runs today's five lines verbatim (`awaitingNewToken`, `applyQueryContact`, the rebind, `applyQueryToken`, `initSendType`, `initReceiverType`). Returning and awaiting instead adds a microtask: the watcher flush would run between the commit and the rebind. |
| D7 | Fences | `createRunFence` replaces `tokenReadSeq` and `identityFetchSeq`: `++seq` with its compare is `begin()`, a bare `seq++` is `invalidate()`. Same checks at the same points. |
| D8 | `useSendData.dispose()` | Only `identityFetches.invalidate()`, at today's `identityFetchSeq++` slot: deliberately not terminal, against `lessons.md` ("a C1 hook's `dispose()` must be terminal"), because today's unmount is not either and a `disposed` guard would add an operation. Known path (KL-1, plausible but unverified): an add-token import resolving after Send unmounts calls `pickAddedToken` → `reloadTokens()` before the `cancelled` check (`:818-821`); the request reopens the disconnected token client's port (`background/client.ts:208-211`), so token events reach the dead page's handlers while the popup document lives. KL-2 (plausible but unverified, found in the final audit's trace): the unmount's `cancelFeeEstimate()` runs after `disconnectExecution()`, and the engine remote-cancels a started or landed estimate (`internal/fee-estimation-engine.ts:100-103`), so that `cancelEstimate` reopens the execution port too. Consequence of both: stray reads and a port open until the popup closes, no screen or data change; the class #457 closed as a known limit. The unmount order is load-bearing here, so both stay verbatim, filed as #2010, a closed `known-limit` issue. |
| D9 | The template | Untouched. The page keeps every binding name: destructuring keeps the estimate's refs and `pauseThisTask: pauseFeeEstimate`, `startWaiting: startWaitingFeeEstimate`; `requestEstimate` stays a page function (D12); `w.vm.tokens`, `w.vm.contacts` keep working. |
| D10 | The journal clients | Both stay page-owned. `readPastSends` stays in the page and is passed in as a do-the-thing function (C1); the settlement read in `submitDeps` is untouched. |
| D11 | W1's place | Arc 2 moves `watch(accountUnusable)` up, above `new ExecutionServiceClient()`, and calls `useSendEstimate` where `useFeeEstimation` is today. Not required (W1 shares no source with W2 or W3); it keeps the creation sequence identical, so no argument is needed. The declarations it crosses (`isSending`, `cancelled`, `canSubmitNow`, `submit`, `snapshotTransfer`, `submitDeps`) are functions, lazy computeds, plain `let`s and an object of arrows: none evaluates a reactive source at setup. |
| D12 | The estimate's input | Two page callbacks: `ready()` (today's three checks, in order) and `params()` (today's object). The page's `requestEstimate` keeps its first line, `if (fiatGuard.value?.converting) amountCardRef.value?.convertNow()` (the fiat state and the card's ref are the page's until arc 3), then calls the hook's `request`, which runs `clearEstimateFailure`, `ready`, `clearQueued`, `params`, schedule, `restartSlowClock`: 48ef589bd's order, `convertNow` ahead of every guard. The three `cancel; return` branches become one, the same single operation in each case. A `before` callback into the hook was rejected: one caller, and it would pull fiat state into the estimate hook. |
| D13 | The pause | `debounceMs: 800` becomes `ESTIMATE_PAUSE_MS = 800` beside `ESTIMATE_SLOW_MS` in the hook: the pause it passes, which a task `pauseThisTask` marked waits. When an estimate starts is the engine's rule (F7), not a constant. The hook returns `useFeeEstimation`'s `pauseThisTask` and `startWaiting` as received, and the page destructures them under today's names, so the template stays untouched. |
| D14 | Tests | `send.test.ts` and `send.integration.test.ts` stay unedited. A listed mutant that survives every test gets a case in the hook's suite. A page-wiring mutant that only a page mount can catch stops the arc for the orchestrator: adding a page case edits a suite the lane keeps unedited. |
| D15 | Competing outline B (rejected) | One composable per client (tokens with balances, contacts, journal with recents), colocated under `src/popup/pages/send/`. It splits the identity fetch's barrier across three hooks, so the barrier logic stays in the page as a coordinator: the exact code #1930 wants out, and the "fetch barrier split" mutant made easy. |

## Architecture & Implementation

**Shape.** Each hook is C1: it receives connected clients or do-the-thing functions and refs the page already owns, returns refs and functions, and exposes `dispose()` that the page calls in today's slot. No hook registers `onMounted`, `onUnmounted` or `onBeforeUnmount`. `useSendEstimate` creates W2 and W3 at its call; `useFeeEstimation` inside it keeps its `onScopeDispose`, still after `useSendReview`'s. `useTicker` stays in the page (`gateNow` feeds both recents and the gate) and is passed to the fiat hook.

**Interfaces.**
- `useSendData({ tokenService, contactService, balances, tokenBalances, balancesState, live, readPastSends, onLoaded })` → `{ tokens, tokensLoading, tokensFailed, contacts, contactEvents, journalOps, onTokensChanged, onReadFailed, reloadTokens, refetch, retry, dispose }`; `onReadFailed` (the one `"send page read failed"` debug line) is returned too, not exported: an export from `src/composables/` becomes a global auto-import. `live` is `appStore`. The page subscribes the handlers: `tokenService.onTokenAdded/Updated.add(onTokensChanged)`, `onTokenDeleted.add(onTokenDeleted)` (page), `contactService.onContact*.add(contactEvents.*)`.
- `useSendEstimate({ executionService, instanceId, ready, params, onUnusable })` → `{ feeEstimate, isEstimating, feeQueued, queuedCap, estimateFailed, estimateSlow, request, handoff, pauseThisTask, startWaiting, dispose }`; `pauseThisTask` and `startWaiting` are `useFeeEstimation`'s own functions. It calls `useToast()` from `@/composables/toast.js` (a module singleton). The two log lines keep their text, with `instanceId` for `sendInstanceId`.
- `useSendFiatGate({ prices, token, now })` → `{ liveQuote, proxyTicker, fiatMode, fiatGuard, fiatQuoteBlocked, fiatNeedsRequote, fiatQuoteMoved, allowsSendNow }`. `allowsSendNow()` is `canSubmitNow`'s wall-clock `evaluateFiatGate` call. Both gate calls keep today's object expressions verbatim, `now` read last (I2); no shared helper. `handleRequote` stays in the page (it drives the card's ref).

**File map.**

| Arc | Added | Changed | Moved |
|---|---|---|---|
| 1 | `src/composables/useSendData.ts`, `useSendData.test.ts` | `send.vue` (`:125-260`, `:929-1003`, mount, W8, unmount slot), `src/types/auto-imports.d.ts`, `.eslintrc-auto-import.json` | none |
| 2 | `src/composables/useSendEstimate.ts`, `useSendEstimate.test.ts` | `send.vue` at 48ef589bd (`:442-459`, `:613-667`, `:764-783`, `:850-884`, unmount `:986-987`), the two generated files | none |
| 3 | `src/composables/useSendFiatGate.ts`, `useSendFiatGate.test.ts` | `send.vue` (`:421-443`, `:682-695`), the two generated files, plan close-out | `popup/pages/send-fiat-gate{,.test}.ts` → `utils/` |

**Client table** (settled question 3; identical before and after; lines at 6bab0009e).

| Client | Constructed | Disconnected | After |
|---|---|---|---|
| `TokenServiceClient` | page `:127` | unmount, 4th | page; `useSendData` calls `getTokens` |
| `TokenBalanceServiceClient` + snapshot | page `:182-191` | `balances.dispose()` 2nd, client 3rd | page; `useSendData` calls `invalidate`, `fetchTokenBalances` |
| `ContactServiceClient` | page `:225` | unmount, 1st | page; `useSendData` calls `getContacts` |
| `PriceServiceClient` | page `:408` | `prices.dispose()`, client, 5th-6th | page; `useSendFiatGate` reads `prices` |
| `ExecutionServiceClient` | page `:598` | unmount only with no submit in flight; else `submitDeps.onSettled` | page; `useSendEstimate` calls `estimateTransferFee`, `cancelEstimate`, `onEstimateStarted`; `submitDeps` untouched, so no disconnect moves relative to a pending `executeTransfer` |
| journal, per identity read | page `readPastSends` `:250` | its own `finally` | page, passed in |
| journal, settlement read | page `submitDeps.readJournal` `:758` | its own `finally` | page, untouched |

**Site table, arc 1** (every row: same calls, same order; lines at 6bab0009e).

| Site | Before | After |
|---|---|---|
| Fetch prelude | `++identityFetchSeq`; `balances.invalidate()`; `balancesState="loading"`; `tokenReadSeq++`; `tokensFailed=false` | `fetchIdentity`: `begin()`; the same four |
| No identity | if current: tokens, tokenBalances, contacts, journalOps `=[]`, `tokensLoading=false`; return | same lines |
| Pre-read clear | tokens, tokenBalances, journalOps `=[]`; `tokensLoading=true`; changed flag false (contacts kept) | same |
| Combined barrier | one `Promise.all` of `getTokens`, `readBalances`, `getContacts`, `readPastSends` | same four, one `Promise.all` |
| Token re-read loop | `while (changed && isCurrent())`: reset flag, await `getTokens` | same |
| Commit | `if (!isCurrent()) return`; tokens, contacts, journalOps; then the five post-load lines | same writes; `onLoaded(t)` runs the five lines, same task |
| Refusal, settle | catch: current → `tokensFailed=true`, rethrow; finally: current → `tokensLoading=false` | same |
| `onTokensChanged` | loading → mark; failed → retry; else `reloadTokens().catch(onReadFailed)` | same, in the hook |
| `reloadTokens` | identity guard; `++tokenReadSeq`; await `getTokens`; compare; write | `begin()` for the counter |
| Subscriptions | `tokenService.onToken*.add` at `:128-130`, contacts at `:227-229` | after the hook call; one listener per list, and no event arrives during synchronous setup |
| Retry, mount, identity watch, `pickAddedToken` | `refetchIdentityScopedState().catch(onReadFailed)` / `reloadTokens()` | `refetch()` / `reloadTokens()` from the hook |
| Unmount | `identityFetchSeq++` at its slot; `contacts.value=[]` later | `dispose()` at that slot; `contacts.value=[]` unchanged |

**Site table, arc 2** (lines at 48ef589bd).

| Site | Before | After |
|---|---|---|
| `requestEstimate` `:850` | `convertNow` if converting; clear failure; three refusals each cancel and return; `clearQueued`; schedule(object); `restartSlowClock` | page: `convertNow` if converting, then `request()`: clear failure; `ready()` false → cancel, return; `clearQueued`; schedule(`params()`); `restartSlowClock` |
| Estimator `:626` | destructure; `lastEstimateParams=params`; debug line; `estimateWhenClear(...)` with `onQueued`, `start` | same order: `transferFeeAsk` destructures and returns the RPC closure, then the save, the line, `estimateWhenClear(...)` returned as today |
| `onError` `:658` | requeue → schedule last; `clearQueued`; unusable → `leaveUnusable`; error line; failed; toast | same; `onUnusable` is `leaveUnusable` |
| `pauseThisTask`, `startWaiting` `:622-623` | `useFeeEstimation`'s, destructured; five template bindings | the same two functions, returned by the hook and destructured under the same names; same bindings |
| W2, W3 `:769`, `:783` | `isEstimating` → `clearQueued` if false; `isEstimating` → `restartSlowClock` | same watchers, same order, created in the hook |
| `snapshotTransfer` `:723` | `handoffFeeEstimate()` when an id exists | `handoff()` under the same name |
| Unmount `:986-987` | `cancelFeeEstimate()`; `clearTimeout(estimateSlowTimer)`, after the execution disconnect | `estimate.dispose()` does both, same slot |

**Site table, arc 3.** `fiatGate` and its three derivatives: same `evaluateFiatGate` / `requoteReason` calls on the same refs. `canSubmitNow`: `allowsSendNow()` makes today's wall-clock call. `handleRequote` unchanged.

**Watcher table** (each watcher created at its old place in the sequence, same getters, same flush, so first-subscription order holds; Before: lines at 48ef589bd).

| Rank | Watcher | Sources | Flush | Before | After |
|---|---|---|---|---|---|
| W0 | review readiness (`useSendReview`) | `isOpen`, `isTop`, `isGated`, `rearmOn` | sync, immediate | `:495` | unchanged |
| W1 | `accountUnusable` → `leaveUnusable` | `accountUnusable` | pre | `:764` | arc 2: above the execution client |
| W2 | `isEstimating` → `clearQueued` | `isEstimating` | pre | `:769` | arc 2: in `useSendEstimate`, at its call |
| W3 | `isEstimating` → `restartSlowClock` | `isEstimating` | pre | `:783` | arc 2: right after W2 |
| W4 | `activeTokenIdx` → close sheets, init sides, clear amount | `cacheStore.activeTokenIdx` | pre | `:819` | unchanged |
| W5 | transfer kinds → forced side | `activeToken` capabilities | pre | `:833` | unchanged |
| W6 | first token while awaiting | `tokens` (deep) | pre | `:839` | unchanged, reads the hook's `tokens` |
| W7 | estimate inputs → `requestEstimate` | 11 sources, deep | pre | `:889` | unchanged, calls the hook's `request` |
| W8 | identity → close sheets, `refetch` | profile, network, account | pre | `:950` | unchanged |

**Unmount order.** Unchanged, line for line: debug line; `cancelled`; data `dispose()` (was `identityFetchSeq++`); `closeSheets()`; contact client; `balances.dispose()`; balance client; token client; `prices.dispose()`; price client; `legal.dispose()`; execution unless a submit is in flight; estimate `dispose()` (was cancel, clear timer); the six resets.

**Budget table** (Biome 2.5.13; lines / cognitive complexity; arcs 1 and 2 on their final files).

| Function | Lines | Complexity |
|---|---|---|
| `useSendData` | 39 | under 2 |
| `fetchIdentity` (module level) | 41 | 12 |
| `onTokensChanged`, `reloadTokens` | under 6 each | 4, 5 |
| `useSendEstimate` | 67 | under 2 |
| `transferFeeAsk` (module level) | 13 | under 2 |
| estimator callback, `onQueued`, `onError`, `request` | 9, under 6, 6, 7 | under 2, 7, 4, 2 |
| `useSendFiatGate` | 29 | under 2; `proxyTicker` 3, `fiatGate` 2 |

Biome's count skips blank, comment and bracket-only lines (measured; a by-hand count of the same draft gives 80 with closers). Inline in the hook, the RPC call puts `useSendEstimate` near 80 and `fetchIdentity` at 19 complexity: hence the two module-level functions. The implementer re-measures the final typed files; if `useSendEstimate` passes 72, `onQueued` moves to module level beside `transferFeeAsk`. A function over budget is cut differently, never accepted.

## UI impact

None. No template, style, copy, testid, Tab stop or Enter rule changes; no toast or log text changes; nothing stored.

## Security & Adversarial Considerations

- **Threat model**: no trust boundary moves. Token rows, contacts and journal records come from the wallet's own services, already parsed by their client schemas; the hooks read them as the page does. A dApp cannot reach Send.
- **What could go wrong**: a reorder that lands a superseded identity's rows (a stale account's balance on screen), an estimate that outlives its inputs (a fee shown for another transfer), an execution port closed under a pending `executeTransfer` (a false "not sent" for a sent transfer). Each is a site-table row, a mutant and a named test.
- **Logs**: the four log lines keep their text and level; `onReadFailed` stays one definition. `log-payload-ban.test.ts` scans the new files.
- **Least privilege, crypto, supply chain**: no new dependency, permission, key or network call.

## Phases

### Phase 1 (arc 1): `useSendData` ✓
1. Read `send.vue` at the base. Add `useSendData.ts` with `fetchIdentity` at module level and the interfaces above.
2. In `send.vue`, keep the client constructions in class order; call the hook after the snapshot and the contact client; subscribe its handlers; add `function onIdentityLoaded(list)` (a declaration: the hook call above it passes it) with the five lines; point mount, W8, `retryTokens`, `pickAddedToken` and the unmount slot at the hook.
3. Add `useSendData.test.ts`, at least ten cases: barrier (nothing lands until all four reads answer), commit before `onLoaded`, latest run wins, no identity clears, pre-read clear keeps contacts, an event during load re-reads tokens, a refused read and a refused balance read mark failed, a superseded refusal marks nothing, an event after a refusal retries, `reloadTokens` superseded by a fetch, `dispose` ends a fetch in flight, contact events update in place.
4. File KL-1 and KL-2 (D8) as one closed `known-limit` issue citing #457, after `gh issue list --state all --search "port after unmount"`.
5. Mutants, each failing a named test: drop the commit's `isCurrent` check; split `Promise.all` into two awaits; call `onLoaded` before the contacts write; put an `await` before `onLoaded` (a hook case asserts `onLoaded` runs before a `pre` watcher on `tokens` sees the commit); skip `dispose()` at unmount (`send.test.ts:1931`).

**Validation gate**: `bun run lint`, `bun run typecheck:all`, `bun run test:all`, `bun run audit:vue`, `bun run test:ci-gating`, one at a time, exit 0 at retry 0; `send.test.ts` and `send.integration.test.ts` unedited; every mutant red, then restored; `bun run --cwd apps/extension build-storybook` exit 0. E2E at retry 0 (`NULO_E2E_RETRY=0` on every invocation; the network config otherwise retries twice, `vite.shared.ts` `e2eRetry`), Chrome, then the same with `NULO_E2E_BROWSER=firefox`: smoke `cd apps/extension && NULO_E2E_RETRY=0 bun run test:e2e -- tests/e2e/send-picker-add.test.ts tests/e2e/token-list.test.ts tests/e2e/home-links.test.ts tests/e2e/rows.test.ts --retry=0`; network, from the root, `NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/send-picker.test.ts tests/e2e/network/transfers.test.ts tests/e2e/network/send-amount-exact.test.ts`. A red is run alone at the base on the same host; both outcomes are reported.

### Phase 2 (arc 2): `useSendEstimate` ✓
1. Add `useSendEstimate.ts` with `transferFeeAsk` at module level and both constants.
2. In `send.vue`, move W1 above the execution client; replace the estimator block with the hook call and the page's `ready()` and `params()`; destructure the template's names; point `snapshotTransfer` and the unmount slot at the hook.
3. Add `useSendEstimate.test.ts`, at least ten cases: a request starts at the end of its task with the params, and waits `ESTIMATE_PAUSE_MS` in a task `pauseThisTask` marked; `startWaiting` passes through (starts a waiting estimate before its pause ends); not ready cancels; a failure toasts, logs and marks failed; the next request closes only its own toast; a queued answer sets the flag and cap, a spent token keeps the cap, the start event clears it; an aborted attempt's queued answer is ignored; a requeue re-asks the same params; an unusable account calls `onUnusable` with no toast; the slow clock fires at 20 s and restarts on a request; `handoff` keeps the remote cancel off; `dispose` cancels and clears the clock.
4. Mutants: drop `clearQueued` before the schedule; drop `restartSlowClock` from `request` (an old slow deadline kept across a new question); move the execution disconnect before the pending submit settles (`send.test.ts:627`); skip `estimate.dispose()`; drop `clearEstimateFailure()` from `request` (a stale failure snack outlives a new question); the hook drops the `pauseThisTask` pass-through (a no-op in its place), so a typed amount starts at once: red on `send.integration.test.ts` "a typed amount waits the 800 ms pause…"; the hook drops the `startWaiting` pass-through: red on "Max on the amount already typed starts the waiting estimate at once…".

**Validation gate**: phase 1's static gates. E2E as phase 1 (retry 0, both browsers): smoke `send-fee-privacy`, `send-keyboard`, `send-picker-add`; network prover-on `fee-methods`, `fee-shortfall-recheck`, `fee-sponsor-funding`, `send-amount-clamp`, `snack-placement`, `send-picker`, `send-amount-exact`, `fiat-send` in one invocation; proverless `NULO_E2E_PROVERLESS=1 ... failed-send-check same-token-concurrent-sends send-chaos` in one, with `NULO_E2E_CHAOS=1` and `NULO_E2E_CHAOS_SEED` set to each of CI's two fixed seeds in turn (`1095865833`, `1960252198`; CI's chaos jobs run both on each browser), the second seed in a run of `send-chaos` alone: unarmed, `send-chaos` skips. `send-picker-add`, `send-picker`, `send-amount-exact` and `fiat-send` drive #2018's bindings (a typed amount, Max, the unit switch, a typed USD figure, the person step's picks).

### Phase 3 (arc 3): `useSendFiatGate` and close-out
1. `git mv` `send-fiat-gate.ts` and its test to `src/utils/`; repoint the imports.
2. Add `useSendFiatGate.ts`; in `send.vue` call it after `gateNow`; `canSubmitNow` calls `allowsSendNow()`.
3. Add `useSendFiatGate.test.ts`, at least ten cases: the quote and ticker for the token, none without a price, the gate inert outside fiat mode, blocked without a guard, stale needs a requote, moved, the ticker re-evaluates, `allowsSendNow` refuses an expiry between ticks and passes a fresh guard at the live quote, a token change re-reads the quote.
4. Mutants: `allowsSendNow` on the ticker's time; the reactive gate on `Date.now()` alone, ignoring the ticker.
5. Close-out per Post-implementation.

**Validation gate**: phase 1's static gates. E2E as phase 1 (retry 0, both browsers): smoke `send-keyboard`; network `fiat-send`.

## Delivery

- Arc 1: branch `send-page-split-1-a1` off `origin/dev`, PR `refactor(send): the send page's data loading moves into a composable` (68 characters), "Part of #1930". Arc 2: `send-page-split-1-a2` off `dev` after arc 1 merges (at 48ef589bd), `refactor(send): the send page's fee estimate moves into a composable` (68). Arc 3: `send-page-split-1-a3`, `refactor(send): the fiat gate moves into a composable and the send split closes` (79), `Closes #1930`, with the close-out as its final commits. No stack: each arc opens only once the previous one is on `dev`.
- Each PR opens ready, no label at creation, base `dev`. Body: the five settled questions, the arc's site table, the watcher table, test edits (none expected), mutants and the tests that caught them, the validation runs with outcomes, "No visible change.", ending `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- Commits: conventional, lower case, signed, ending `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Run `gh pr list --state open` at each arc start and before each push; if `dev` moves under these files, merge it, never rebase a pushed branch, and rerun the gates.
- Parallelism: none. Each arc edits `send.vue` and rests on the previous one.

## Post-implementation

The contract is this plan plus [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard) at `6bab0009e`. Specific here:
- Step 1 is absent (`code_review: off`). Step 2 runs per arc at its boundary over `git diff origin/dev...HEAD`: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`, until a round has nothing material, hard stop at three rounds. Then one Opus 5.5 diff review (`general-purpose`). Both get the lane's adversarial asks: an order changed around an await, a watcher now ahead of one it depended on, a stale closure, reactivity lost by destructuring, a client used after its disconnect or a pending submit rejected by unmount, a `dispose` run twice or never, an estimate that outlives its inputs, a test whose expectation moved. Prompts go under `~/.cache/nulo-backlog/send-page-split-1/`. After arc 3, one fresh Codex session over the three arcs' net diff for cross-arc issues.
- Approval boundary (a plan change; stop): any template, copy or style edit; a new watcher, timer, listener or client; a moved disconnect; a changed error, log or toast; a behaviour fix (a found bug stays verbatim, gets a `(BUG PIN)` test when surprising, and is filed after `gh issue list --state all --search`).
- Close-out, in arc 3: merge `origin/dev` first and read `index.md`, `lessons.md`; the Outcome; lessons promoted within 8 KiB; `STATUS.md` deleted; `git mv` into `archive/` in its own commit, index line moved to `archive/index.md`; `bun run check:plans` after staging. Teardown after the merge: `agent-worktree done send-page-split-1 --merged`, trunk `dev`; the archived plan is `implementations-plan/archive/send-page-split-1/plan.md`.

## Audit verdicts

| Round | Leg | Verdict | Accepted | Rejected |
|---|---|---|---|---|
| plan 1 | Codex, gpt-6.1-sol (session 01a20edc) | conditional approve | F1 restated (a resubscribed watcher is re-appended, so creation rank is not the invariant); the fiat gate's two object expressions kept verbatim, `now` last (I2); D14: no page-suite edit, a mount-only mutant stops the arc; the W2/W3 swap mutant replaced by a dropped slow-clock restart | none |
| plan 1 | Opus 5.5 (Plan) | conditional approve | I1's condition and the first-subscription example; D11 marked not required; D8 cites the lesson and KL-1; a tenth fiat case; the subscriptions row; `onIdentityLoaded` a declaration; six resets; `onReadFailed` returned, not exported; a fallback cut for `useSendEstimate` | the budget numbers: Opus counted closers by hand (80); Biome, which is the gate, skips bracket-only lines and measures 64 (shown on a scratch probe) |
| final 1 | Codex, gpt-6.1-sol, fresh (session 01a20eeb) | conditional approve | `NULO_E2E_RETRY=0` on every e2e invocation (the network config retries twice by default), Firefox spelled out; two equivalent mutants replaced (W6 after W7, W7 before W4: both subscribe through `activeToken`, so first-subscription order is unchanged) by an `await` before `onLoaded` and a dropped `clearEstimateFailure` | none |
| final 2 | Codex, resumed | **approve** | the fixes verified; KL-2 (found while checking: the unmount's cancel reopens the execution port) traced correct and its known-limit disposition proportionate | none |
| arc 1 r1 | Codex, gpt-6.1-sol (session 01a20f0c) | findings: 2 | the `onLoaded` comment promised order over every watcher, false for a sync watcher (probe): now "before queued pre watchers flush"; a narrating test comment cut | none |
| arc 1 r2 | Codex, resumed | **clean** | the fixes verified | none |
| arc 1 | Opus 5.5 (general-purpose) | findings: 3 | `dispose`'s doc overclaimed (the balance read is fenced by the snapshot's own `dispose()`); the no-identity case pins the resets before the guard and both skipped reads; the refused-balance half asserts the reset before awaiting; `onLoaded`, `readPastSends` and the page's snapshot comment state their contracts | none |
| arc 1 r3 | Codex, resumed | **clean** | the Opus fixes verified; no regression | none |
| arc 2 amendment | Codex, gpt-6.1-sol (session 01a2102f) | approve with changes: 4 | both fixed `send-chaos` seeds on each browser, as CI runs them; the person step's `@picked` (five bindings, not four); the estimator keeps destructure before the save and the line (`transferFeeAsk`); the Opus-leg note dropped from the plan, not a #2018 change (lessons/phase-2.md) | none |
| arc 2 r1 | Codex, gpt-6.1-sol (session 01a21047) | findings: 2 | the slow-clock case now resolves before the deadline and proves an early answer stops the clock (it also reds a dropped W3); a redundant test comment cut; M4 traced equivalent (the engine's own scope dispose sends the same remote cancels in the same unmount) | none |
| arc 2 r2 | Codex, resumed | **clean** | the fixes verified; no regression | none |
| arc 2 | the lead (Opus 5.5), own read | clean | none (deviation: lessons/phase-2.md) | none |

## Seeds (not run; orchestrator-owned)

```
/goal Phases 1 to 3 of implementations-plan/send-page-split-1/plan.md marked ✓ with their gates passing in the transcript; each arc's Codex loop (gpt-6.1-sol, high) converged and its Opus review applied; three PRs against dev, the last with Closes #1930 and the archived plan; bun run test:all and bun run lint exit 0.
```

```
/loop 15m Drive implementations-plan/send-page-split-1 per its plan.md and the README § Post-implementation standard at 6bab0009e: run the gates, decide open questions with Codex (gpt-6.1-sol, high), open each arc's PR once the previous is on dev, never merge, never change what a person sees; stop once the last PR's checks are green and report.
```
