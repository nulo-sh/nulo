---
plan: restart-notify-1
tier: mid
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: origin/dev a51ebd220 (#907 merged)
issues: "#926"
---

# restart-notify-1: close the windows a restart ends, and tell apps before the lock's restart

When the wallet's background restarts, every dApp request it held is gone, but the windows that show those requests stay, and connected apps are not told. This plan closes the connection windows a restart ended: on the next boot after a crash, and right before the lock's own restart. It also ends every app's session in that same last moment, so an app that listens shows the disconnect at once. One arc, one PR against `dev`, `Closes #926`.

## Issue map

| Issue | Arc | Note |
|---|---|---|
| #926 | A1 | the build below; the send, sign, fee and notice windows wait for OA-1 (`OWNER-ASKS.md`) |
| #605 | no arc | upstream (`blocked:external`): a page drops a disconnect before its own `confirm()`; nothing here can reach it |
| #924 | no arc | its OA-4 case (They don't match in a check window a restart left open) remains only where the sweep fails: KL3 |

## Spike (measured 2026-10-20, retry 0, proverless network build, `agent.sh`)

Two throwaway specs opened each window from the playground, then restarted the background two ways: **unplanned** (`stopBackground`: the worker or event page ends and the pages stay) and **planned** (#907's lock with both session deletes refused, which calls `runtime.reload()`). They recorded the window and the app's page at +1 to +35 s. Chrome ran every row; Firefox ran the planned rows, the notice rows, the listing and the unplanned connect window. Results stay in the session scratch; the pictures used here are in `screenshots/`.

| Window | Unplanned restart (both) | Planned restart, Chrome | Planned restart, Firefox |
|---|---|---|---|
| Connect (before Allow) | Stays as if live. Allow → "Something went wrong", Allow disabled. App: still discovering (its own 60 s timeout). | Becomes a Chrome **New Tab** popup window (`chrome://new-tab-page/`), which stays. App: discovering. | Closes. App: discovering. |
| Emoji check | Stays. They match finds no hold and closes it; They don't match deletes the app's row (#606's stale-check hazard). App: connected until its next call. | New Tab window. App: disconnected (the lock ends an unanswered check). | Closes. App: disconnected. |
| Capabilities | Stays. Approve → "Something went wrong". App's call: `Wallet disconnected` within 12 s (the SDK heartbeat meets `stale-session.ts`). | New Tab window. App's call pending at +35 s. | Closes. App's call: 4001 (the window's own lock reject reached the worker first). |
| Send | Stays. "Couldn't estimate fee" snack; Confirm → "Processing error.". App: `Wallet disconnected` within 12 s. | New Tab window. App's call pending at +35 s. | Closes. App's call pending at +35 s. |
| Sign (`createAuthWit`) | As Send; app rejected within 2 s. | not run (the Send window) | not run |
| No window, app connected | Told on its next call. | Not told at +35 s. | Not told at +35 s. |

- **A notice fired before the reload reaches the app on both browsers.** The spec sent `session-disconnected` per live session from the background and reloaded, in the same tick and after the sends settled: the idle app read `disconnected` and the pending call failed with `Wallet disconnected` at +0.5 s, 2/2 runs per mode and browser.
- **A window removal fired in the same tick as the reload lands on Chrome.** The second spec fired `windows.remove` for the open request window and the notices, then `runtime.reload()`, with nothing awaited: the check, capabilities and connect windows were gone at +1 s with no New Tab window, and the app with a session read `disconnected`, 6/6 (two per window).
- **The background can find its own windows after a crash.** `runtime.getContexts({ contextTypes: ["TAB"] })` returns each extension page with its full URL (hash route included), `windowId` and `tabId`, on Chrome and Firefox. Without the `tabs` permission Chrome's `windows.getAll({ populate: true })` returns tabs with no URL.
- **After a planned restart Chrome leaves no context to find**: the New Tab windows are not extension pages. Only the background about to reload can close them.
- **#907's measured claim held for tabs, not for popup windows** ("the restart closes the popup and every open Nulo tab"). The wallet's own popup windows (logs viewer, request JSON, passkey) meet the same New Tab outcome by inference; filed at close-out, not built here.
- Not measured: whether the old page's content script answers a same-page connect after the reload (both runs queued that connect behind the lock screen).

## Outcome & Quality Bar

**For whom.** A person with a dApp window open when the wallet restarts (a crash, the browser ending the worker, or the lock's own restart), and the dApp page beside it.

**Excellent:**
- No connect, check or capabilities window outlives the request a restart ended, on either browser, and none turns into a New Tab window.
- Before the lock's restart every connected app hears `disconnect`: an idle app's `pg-status` reads disconnected within 5 s on both browsers.
- The lock's restart happens exactly when it does today: nothing is awaited between the failed deletes and `runtime.reload()`.
- Nothing new is drawn: a window closes or it does not.

**Good enough.** An app whose page is mid-connect (before Allow, or before its own `confirm()`) still waits on its own timer: the wire has no message for it.

## Assumptions

**Facts**
- F1. Approval handles (`WindowManager.handles`, `window-manager.ts:72`), interaction records (`DappInteractionService.storage`, `dapp-interaction/service.ts:151`), verification holds, verify reservations and transport sessions are memory only; a restart ends every request they carry. The operation journal persists, but it records sends, not open requests.
- F2. Request windows are `src/popup/index.html#/windows/<route>?…`: `discover` (also its `&expired=1` page), `capabilities`, `execute`, `fee`, `network-unavailable` (`service.ts:104`, `:305`) and `verify` (`wallet-sdk/session-established.ts:71-75`).
- F3. `RuntimePort.getContexts?` exists and the Chrome adapter wraps it (`runtime-port.ts`, `chrome-browser-api.ts:151-163`; the adapter throws where the browser lacks it); its declared result lacks `windowId` and `tabId`, which both browsers return (spike).
- F4. `SessionManager.close()` emits the lock event (`session-manager.ts:415`) before its delete attempts (`:427-433`); `lockActiveProfile` then calls `this.runtime.reload()` synchronously when both deletes failed and no successor session is live (#907).
- F5. On the lock event every popup page, request windows included, runs `lockedState.onLockEvent` and routes to `/popup/auth` (`popup/app.vue:332`, `locked-state.ts:33`). The connect, capabilities, send, fee and notice windows also reject their request and close themselves (`useDappApprovalWindow.ts:139-142` `reject("lock")` → `endAndClose`); the check window has no lock handler and stays on the lock screen.
- F6. `endSession` drops a session's hold, then `handler.terminateSession`, which sends `session-disconnected` through `buildContentTransport.sendToTab`, fire and forget (`wallet-sdk/background.ts:156-159`, `:357-370`). It keeps the app's `DappSession` row.
- F7. `ProfileService.setExpiryDeferral` is the existing in-process hook another service registers (`profile/service.ts:605`; `execution/service.ts:354`).
- F8. #886 (open, draft) rewrites `session-established.ts`, `verify-admission.ts`, `discovery-flow.ts`, `discover/index.vue` and `verify/index.vue`, and also edits `wallet-sdk/background.ts`, `wallet-sdk/test-ports.ts`, `chrome-browser-api.ts`, `window-port.ts` and `fake-browser-api.ts` (it removes `WindowPort.navigate`). It keeps the `#/windows/discover` and `#/windows/verify` routes.

**Inferences**
- I1. On a boot, every extension page that exists before this background's `services.start()` was opened by a predecessor, so a request window among them shows a dead request (F1). `retrySafe` allows a second boot only before service registration (`runtime.ts:258`), so a repeated sweep is still exact.
- I2. The URL the background created a window with, or last navigated it to, names the request it opened the window for, whatever the page's router shows later (F5): the lock screen it routes to is a page state, not a different window. A navigation the page makes itself is not observed; today every background navigation stays within the connect and check routes, and #886 removes background navigation.

**Known limits** (filed as closed `known-limit` issues at close-out if the review keeps them)
- KL1. A window whose creation was still in flight is missed: after a crash, it can appear after the boot sweep's read; before the lock's restart, its id has not reached the tracker when the preparation runs, and the browser finishes the creation after the reload. It keeps today's behaviour: "Something went wrong" on Allow, or on Chrome a New Tab window. Awaiting the creation would reopen #907's interval.
- KL2. After a crash, a request window that was showing the lock screen (a request opened while the wallet was locked) is not recognized: its URL reads `#/popup/auth`. After unlock it shows today's error. Recognizing it would need a record of open windows across the crash (new persistent state).
- KL3. If the boot sweep's read or a tab's close fails, the stale check window survives; once services are Ready, its They don't match still deletes the app's row (#924's case). A page cannot post before then: `ServiceClient` waits for Ready, which comes after the sweep.

**Asks**: OA-1 (`OWNER-ASKS.md`) is open and does not block A1: it decides the send, sign, fee and notice windows, which A1 leaves as they are.

## Architecture & Implementation

### Proposed architecture

1. **One rule for which windows a restart ends.** A new `src/wallet/services/window-manager/restart-ended-windows.ts` holds `RESTART_ENDED_ROUTES` (`discover`, `capabilities`, `verify`) and `isRestartEndedUrl(url, popupPageUrl)`: true when the parsed URL's `protocol`, `host` and `pathname` equal the popup page's (`runtime.getURL("src/popup/index.html")`; `origin` reads `"null"` for extension schemes, so it cannot tell two extensions apart) and its hash path is `/windows/<route>` with the route in the set. Both paths below use it; OA-1's option A would add three routes to the one list.
2. **After a crash: the boot sweep.** `closeRestartEndedTabs(runtime, windows, logger)` reads `getContexts({ contextTypes: ["TAB"] })` and closes the **tab** of each matching context through a new `WindowPort.closeTab(tabId)` (`chrome.tabs.remove`, no permission). A request popup closes with its only tab; a request URL somebody opened in an ordinary window loses that tab alone, never the window's other tabs. It never throws: a missing or failing `getContexts`, or a refused close, is caught and logged by category; the log carries a count, never a URL. `bootRuntime` awaits it in one line right after `setUninstallURL`, before the migration gate and `services.start()` (I1; the same reasoning as `journalBootCutoff`).
3. **Before the lock's restart: synchronous, from memory.** `trackOpenWindows(windows)` in the same file wraps the background's `WindowPort`, delegating each method to the original object (so the adapter's own state and `this` hold) with its arguments, results and failures unchanged. It records each window it creates with its creation URL, updates the URL on `navigate` (until #886 removes it), and forgets the window on `onRemoved`. `closeRestartEnded()` fires `remove` for every recorded window whose URL passes the rule, each guarded on its own (a synchronous throw or a rejection is consumed, never logged with the browser's error), and returns at once. `runtime.ts` builds one tracker over `browserApi.windows` and hands it to both `WindowManager` and `initWalletSdkHandler`, so connect and capabilities windows (opened by `DappInteractionService`) and check windows (opened or navigated by the wallet-sdk) are all recorded. A page that has routed itself to the lock screen (F5) is still recorded by the URL it was opened at (I2).
4. **The preparation runs in the same tick as the reload.** `ProfileService.setRestartPreparation(fn: () => void)` mirrors `setExpiryDeferral` (in-process only). In `lockActiveProfile`'s restart branch, a private helper calls `fn()` inside a try/catch (logging a failure by category) and the branch then calls `this.runtime.reload()`, with no `await` between. `initWalletSdkHandler` registers the preparation in one line through a helper in `wallet-sdk/restart-preparation.ts`: first `endSession` for every live session (each in its own try/catch, as `revokeLiveSessions` does), then `ports.windows.closeRestartEnded()`. Sessions end first, so each app's disconnect is sent before any window removal can produce a "closed by user" answer. The reload ends everything still pending.

### Data & control flow

- Unplanned: worker dies → a window's port or the dApp wakes a successor → `bootRuntime` → sweep closes the connection tabs → services start → the app's next ping or call meets `stale-session.ts` (unchanged).
- Planned: lock → `sessionManager.close()` → lock event (pages route to auth; connect and capabilities windows start their own reject and close) → deletes fail → restart branch → preparation (sessions end: `session-disconnected` fired per session; recorded connection windows: `remove` fired) → `runtime.reload()` in the same tick → the read-back throw for a reload that never comes (unchanged) → the successor's sweep finds nothing.

### File-level change map

| File | Change |
|---|---|
| `packages/wallet-core/src/ports/runtime-port.ts` | `getContexts?` result gains `windowId?: number` and `tabId?: number` |
| `packages/wallet-core/src/ports/window-port.ts` | `closeTab(tabId)`: close one tab; its window closes with its last tab |
| `packages/wallet-core/src/testing/fake-browser-api.ts` | the fake follows (`closeTab`, contexts with ids) |
| `apps/extension/src/core/adapters/chrome-browser-api.ts` | `closeTab` → `chrome.tabs.remove`; the contexts type follows |
| `apps/extension/src/wallet/services/window-manager/restart-ended-windows.ts` (+ `.test.ts`) | new: the route rule, the boot sweep, the tracker |
| `apps/extension/src/wallet/runtime.ts` | the sweep (one line); one tracker passed to `WindowManager` and to the wallet-sdk handler (`registerServices` returns it) |
| `apps/extension/src/wallet/services/wallet-sdk/restart-preparation.ts` (+ `.test.ts`) | new: end every live session, then close the recorded connection windows |
| `apps/extension/src/wallet/services/wallet-sdk/background.ts` | `ports.windows` typed as the tracker; one registration line |
| `apps/extension/src/wallet/services/wallet-sdk/test-ports.ts`, `background.connect-window.test.ts` | the test ports gain `closeTab`; `test-ports.ts` hands every `initWalletSdkHandler` test the real tracker over the fake; the connect-window test's own port object follows (reconciled with #886's edit to `test-ports.ts` on rebase) |
| `apps/extension/src/wallet/services/profile/service.ts` | `setRestartPreparation`; the call before `reload()` |
| `apps/extension/src/wallet/services/profile/service.integration.test.ts` | restart rows extended |
| `apps/extension/tests/e2e/network/restart-closes-check-window.test.ts` | new e2e, Chrome only by capability (Phase 3) |
| `apps/extension/tests/e2e/network/lock-restart-reconnect.test.ts` | extended (Phase 3) |
| `ARCHITECTURE.md` § 8 | two sentences: the boot sweep, the preparation before the lock's restart |

Line budgets: `bootRuntime` is at 74 of 80 non-blank lines and `initWalletSdkHandler` at 76 (79 once #886's block lands), so each takes a one-line call and nothing inline. Whichever of #886 and A1 merges second rebases onto the other; `navigate`'s tracking is deleted with `navigate`.

### Trade-offs and alternatives not taken

- **Each window probes its own request on reconnect** (outline B: `ServiceClient.onConnected` in `useDappApprovalWindow`, plus a new RPC for the check's hold). Exact by construction, but two mechanisms (verify has no interaction record), per-window lifecycle code in exactly the files #886 rewrites, and no page code runs in Chrome's New Tab windows. Rejected.
- **A `storage.session` registry of open request windows.** It would recognize KL2's windows, but `runtime.reload()` empties `storage.session`, so it cannot serve the lock's restart. It also needs a write per window and a reconcile, while `getContexts` gives the crash case the same list for free. Rejected (Proportion).
- **`getContexts` again before the reload, filtered by route.** It misses a check window that already routed to the lock screen (F5; both audits), and its round trip would have to be awaited. Rejected for the tracker.
- **Awaiting the notices' delivery before the reload, bounded at 1 000 ms** (the first draft). It holds a lock whose record could not be deleted open for up to a second longer; a worker death in that second lets the successor restore the session. The spike shows fired sends and removals land without the wait. Rejected.
- **Closing the window, not the tab, at boot.** A context's window may be an ordinary window with other tabs. Rejected for `closeTab`.
- **Tagging `WindowManager` handles by kind and reading verify reservations.** `kind` is documented as a log tag only, and the reservations live in a file #886 rewrites. Rejected for the tracker at the port.

**Proportion.** No persistent state: the tracker is a worker-lifetime map that the reload empties. No public contract: `WindowPort` and `RuntimePort` are internal ports of a private workspace, and no npm-staged entry changes. No coordination protocol: one in-process callback, set once at boot in the shape `setExpiryDeferral` already has, and nothing waits on anything. No owner ask arises from the design.

## Security & Adversarial Considerations

- **Threat model.** Attacker: a dApp page (scripted, hostile), or another extension. Surface: the boot sweep (runs whenever a message wakes a cold background) and the preparation before the lock's restart.
- **What a page can steer.** Nothing that reaches a close: `getContexts` returns only this extension's contexts, the rule matches the popup page's exact scheme, host and pathname, and the boot sweep closes a tab, never a window. No page can embed the popup (no `web_accessible_resources`, `manifest.test.ts:66`). Waking the background only triggers the sweep of windows whose requests are already dead. A page cannot trigger the lock's restart (it needs both session deletes refused).
- **The lock's guarantee is unchanged.** #907 reloads in the same tick as the failed deletes; the preparation only fires messages and removals in that tick and awaits nothing, so no page, hung or hostile, can widen the interval in which an undeletable session record exists. A throwing preparation still reloads (a unit row pins it).
- **No grant changes.** `endSession` ends transport sessions and keeps every `DappSession` row; no permission is granted or revoked. A closed window answers nothing on the person's behalf: its request is already gone (F1), or the reload ends it.
- **Logs.** URLs are never logged (they carry request ids and the verification hash); a count and a fixed category only, and no browser error object, which can carry the URL (logging-policy).
- **Crypto, supply chain, least privilege:** none touched; no new permission (`getContexts` and `tabs.remove` need none; `tabs` stays absent).

## UI impact

- **Connect, emoji check and capabilities windows** (both browsers, light and dark unchanged): after a restart that ended their request they close instead of staying (crash) or turning into a Chrome New Tab window (the lock's restart). Sign-off, the owner on P70-08 (2026-10-20): "If a wallet restarted, feels like we should close the connection pop-ups? (allows, capabilities, emoji matches) if they are going to "break" anyhow. We should close-them and inform the app, no?" Today's pictures: `screenshots/chrome-unplanned-discover-after-primary*.png`, `chrome-unplanned-verify-after*.png`, `chrome-planned-discover-after.png`.
- **A connected app** shows its own disconnect at the lock's restart. Sign-off, P71-06 **C** (2026-10-20): "Before restarting, the wallet tells each connected app it is disconnecting, so an app that listens shows it at once. On Chrome the app still answers only after its page loads again. New behaviour, built and reviewed on its own."
- **Send, sign, fee question and network notice windows:** unchanged until OA-1.
- No copy, layout or new screen anywhere; the popup that pressed Lock is not held open (nothing is awaited).

## Phases (arc A1)

### Phase 1 — the rule and the boot sweep ✓

1. Widen `getContexts?`'s result with `windowId?` and `tabId?`; add `WindowPort.closeTab`; follow in the Chrome adapter and the fake.
2. Add `restart-ended-windows.ts`: `RESTART_ENDED_ROUTES`, `isRestartEndedUrl`, `closeRestartEndedTabs`.
3. Call the sweep in `bootRuntime` after `setUninstallURL`.
4. Tests, `restart-ended-windows.test.ts`: the three routes close their tab; the popup page, the onboarding page, `execute`, `fee`, `network-unavailable`, `json`, `logger` and `passkey` routes, a `#/windows/verify` hash on another pathname, another extension's id under each scheme (`chrome-extension:`, `moz-extension:`) and a web URL stay (one table row each); a missing `getContexts`, a throwing one and a refused `closeTab` neither throw nor stop the rest. A boot-order row in the existing runtime boot test pins the sweep before `services.start()`.

**Validation gate.** `bun run lint && bun run typecheck:all && bun run test` exit 0; the new test file green. Layers: lint, typecheck, unit.

### Phase 2 — the preparation before the lock's restart ✓

1. `trackOpenWindows` in `restart-ended-windows.ts`; `runtime.ts` passes one tracker to `WindowManager` and to `initWalletSdkHandler`.
2. `ProfileService.setRestartPreparation`; the guarded call right before `reload()`.
3. `wallet-sdk/restart-preparation.ts` and its one-line registration in `initWalletSdkHandler`.
4. Tests. `restart-ended-windows.test.ts`: over a stateful fake adapter, the tracker delegates unchanged, records created windows, follows `navigate`, forgets removed ones; `closeRestartEnded` removes only matching windows, returns while a removal is still pending, and a removal that throws or rejects does not stop the rest. `restart-preparation.test.ts`: every live session ends through `endSession` before any window removal (one recorded call order), one that throws does not stop the rest, and no `DappSession` row is deleted. `service.integration.test.ts`: the preparation runs before `reload()` with no await between (call order in one synchronous turn); a preparation that throws synchronously still reloads; a lock that saves calls neither.

**Validation gate.** `bun run lint && bun run typecheck:all && bun run test && bun run test:all` exit 0. Layers: lint, typecheck, unit, integration.

### Phase 3 — e2e and docs ✓

1. New `network/restart-closes-check-window.test.ts`, under `describe.skipIf(isFirefox)(CHROME_ONLY.backgroundKillUnderPage, …)`: Firefox does not end an event page under an open extension page (`tests/e2e/FIREFOX.md`), which this scenario needs. Failure mode: the check window outlives the crash that ended its session. Why e2e: a real worker death, the real `getContexts` shapes and a successor woken by the window's own port. Steps: connect the playground to the check; keep the control popup open; clear alarms; `stopBackground`; assert the check window closes within 15 s and the control popup is still open and answers (the successor serves its next read). Estimated 40 s.
2. Extend `network/lock-restart-reconnect.test.ts`: before the restart, a second playground page connects up to an unanswered emoji check, whose window stays open. After `waitForExtensionRestart`: the first app (connected, idle) reads `pg-status` disconnected within 5 s, which only the preparation's notice can do (spike: not told at +35 s on either browser); the check window is closed, and on Chrome no New Tab page is open. Then the existing reload and reconnect. Failure mode: the app is not told, or the routed check window survives as a New Tab window. Both browsers; estimated +20 s each.
3. `ARCHITECTURE.md` § 8: the boot sweep and the preparation, one sentence each.

**Validation gate.** From the repo root, each at retry 0 through `agent.sh`, Chrome then Firefox: `NULO_E2E_RETRY=0 NULO_E2E_PROVERLESS=1 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/restart-closes-check-window.test.ts tests/e2e/network/lock-restart-reconnect.test.ts tests/e2e/network/inflight-call-background-death.test.ts tests/e2e/network/connect-verify-mismatch.test.ts` (the last two guard the stale-session answer and the check's refusal; `inflight-call-background-death` is `@requires-proverless`, which `agent.sh`'s guard enforces), then the same with `NULO_E2E_BROWSER=firefox`. Smoke, on the armed build `agent.sh` leaves for that browser: `cd apps/extension && NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- extension-restart.test.ts sw-resilience.test.ts --retry=0`, then the same with `NULO_E2E_BROWSER=firefox` (without the two flags `sw-resilience`'s held-boot case skips and the CSP check is unarmed). Pass: every file green; record each new scenario's measured runtime. Layers: e2e-live-network, smoke.

## Decision ledger

| Id | Decision | Why | Panel |
|---|---|---|---|
| D1 | After a crash, find request windows with `getContexts` at boot, by route (scheme, host, pathname, hash) | one read, no new state, outside #886's files | Codex ✓ (rounds 1–2; authority compare round 2), Opus ✓ |
| D2 | Before the lock's restart, close from the tracker's memory, not from `getContexts` | a check window routes to the lock screen before the reload (F5) | Codex finding 1, Opus finding 1; spike 2; Codex ✓ round 2 |
| D3 | Fire the notices and removals in the reload's tick; await nothing | #907's interval stays as it is; spike 2: 6/6 delivered | Codex finding 2 (blocking), Opus finding 4; Codex ✓ round 2 |
| D4 | Close the tab at boot, not the window | a context's window may hold the person's other tabs | Codex finding 3, Opus finding 9 |
| D5 | Ship the three connection routes; send, sign, fee, notice wait for OA-1 | the owner's P70-08 words name only the connection windows | Codex ✓, Opus ✓ |
| D6 | Crash e2e Chrome-only by the harness capability | Firefox keeps an event page under an open extension page | Opus finding 7 |
| D7 | One arc | #907 merged before planning ended; both halves share the rule | Codex ✓, Opus ✓ |

## Audit verdicts

**Round 1, Codex (`gpt-6.1-sol`, high): `reject (with blocking findings: planned sweep loses window identity after lock routing; awaited preparation weakens the failed-lock restart guarantee)`.**
1. High. The lock routes a check window to `/popup/auth` before a `getContexts` sweep could read it. **Accepted:** the tracker (D2), verified in `app.vue`/`locked-state.ts`.
2. High. The awaited preparation widens #907's window. **Accepted:** nothing awaited (D3), backed by spike 2.
3. Medium. `windows.remove` on a context's window can close an ordinary window; parse origin and pathname exactly. **Accepted:** `closeTab` (D4), exact parse.
4. Medium. Send tracking needs frame 0 and lock-event sends. **Moot:** no send is awaited or tracked.
5. Medium. The planned e2e can pass through the fallback or a 4001. **Accepted:** an idle app plus an unanswered check window.
6. Low. F1 and F7 wording. **Accepted:** F1, F8.
7. Low. Record OA-1 as open. **Accepted:** Asks.

**Round 1, Opus (Plan): `conditional approve`** (conditions: an unanswered check through the lock's restart in the e2e; one-line additions to the two near-budget functions; F7/D1 file overlap; unit rows for call order and a synchronous throw).
1. Medium. The same missed check window as Codex 1. **Accepted:** D2 and the e2e.
2. Medium-low. The line budgets. **Accepted:** one-line calls (File-level change map).
3. Low. #886's overlap. **Accepted:** F8.
4. Low. The awaited preparation as a known limit. **Superseded** by D3: there is no wait left to accept.
5. Low. Call order and a synchronous throw. **Accepted:** Phase 2 rows; the send-tracking part is moot.
6. Low. The Lock popup held on the unlock screen during the wait. **Moot** (D3).
7. Low. Firefox crash e2e. **Accepted:** D6.
8. Low. #924 "cannot arise" is too strong. **Accepted:** KL3.
9. Low. Removing an ordinary window. **Accepted:** D4.

**Round 2, Codex (resumed): `conditional approve (with conditions: compare URL authority explicitly, preserve port delegation semantics, and correct KL3's path)`.**
1. Medium. `new URL(...).origin` is `"null"` for `chrome-extension:` and `moz-extension:`, so origin equality cannot tell two extensions apart (demonstrated under Bun). **Accepted:** compare `protocol`, `host`, `pathname`; a row per scheme.
2. Medium. The wrapper must delegate through the original object, and each removal must be guarded alone. **Accepted:** Architecture 3 and the Phase 2 rows.
3. Low. KL1 also covers the lock's restart (a create in flight) and can leave a New Tab window. **Accepted:** KL1 reworded; it stays a known limit.
4. Low. KL3's path is unsupported: `ServiceClient` waits for Ready, which follows the sweep. **Accepted:** KL3 is now the failed-sweep case.
5. Low. I2 claimed too much about navigation. **Accepted:** I2 reworded.
What it found right: tracker coverage (both creators get the wrapper; `createPlaced`'s retry is recorded), no await between `close()` and the reload, ending confirmed sessions keeps grants and rows, the idle-app proof, the Chrome control popup.

**Final fresh Codex pass (new session `01a15931…`): `conditional approve (with conditions: correct Phase 3's executable gates and include the SDK test-port updates)`.**
1. Medium. The network command lacked `NULO_E2E_PROVERLESS=1` (the guard refuses `inflight-call-background-death` without it), and the smoke command lacked `NULO_E2E_MIGRATION_FIXTURE=1` and `NULO_E2E_CSP_REPORT=1`. **Accepted:** Phase 3's gate (verified in `agent.sh` and `sw-resilience.test.ts:20`).
2. Low. The file map omitted `wallet-sdk/test-ports.ts` and `background.connect-window.test.ts`. **Accepted.**
What it found right: no asynchronous boundary before #907's reload and the guard keeps the reload; exact scheme/host/pathname; tabs at boot; no row deleted, no URL logged; the design fits the budgets; the idle app and the unanswered check each prove their path; KL1–KL3 and OA-1 left as they are.

**Final pass, verification (resumed): `approve`.** Both conditions satisfied; the Proportion paragraph adds no obligation; no regression found.

**Implementation loop, round 1, Codex (session `01a15977…`): `approve`**, two low findings, both accepted: the crash e2e's popup assertion raced strict mode's lock on reconnect (now: heartbeat, unlock screen, unlock, Home); two comments restated code. **Opus diff review: `conditional approve`**: the same assertion; two tracker rows that could not fail; no row proved the handler's registration or that rows are kept (`background.restart-preparation.test.ts`); comment nits. All accepted; mutation checks recorded in `lessons/phase-3.md`.

## Delivery

- One arc, one PR against `dev`, no stack (the orchestrator's D-orch-1). Branch `restart-notify-1-a1` from the plan commit on `origin/dev`.
- Title: `feat(wallet): close the windows a restart ends and tell apps before the lock's restart` (86 characters).
- Body: what and why, the spike table, the validation runs, the e2e wall-clock before and after per browser, the UI impact quotes, OA-1's state, `Closes #926`. Opened as a **draft** only after the local gates pass and the Codex loop converges; no label at creation; add `e2e:extension-network` afterwards only if the path filter skips the network lane.
- `/code-review`: off.
- Parallelism: none; three short phases on one critical path.

## Post-implementation

The execution contract is this plan plus [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard) at `a51ebd220`. Plan-specific values:

1. No `/code-review` (`code_review: off`).
2. Codex loop, single arc, after Phase 3 is green, over `git diff origin/dev...HEAD`: `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; the prompt carries the plan, the ledger, the adversarial ask and the two verbatim rules from the standard. One Opus `general-purpose` diff review beside round 1. Hard stop at three rounds, then report.
3. Delivery as above; then `gh pr checks <n> --watch` once.
4. Close-out as the PR's final commits: merge `origin/dev` and read `index.md` and `lessons.md`; the Outcome block; lessons promoted (the New Tab finding; `getContexts` as the only cross-browser window reader without `tabs`; a removal fired in the reload's tick lands); open items filed (the wallet's own popup windows after the lock's restart; KL1–KL3 as `known-limit` issues if the review keeps them); `STATUS.md` deleted; `git mv` to `archive/` in its own commit; `bun run check:plans` green.
5. Teardown after the merge: `agent-worktree done restart-notify-1 --merged` once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/restart-notify-1/plan.md` succeeds.

## Seeds (orchestrator-owned; not run)

```
/goal Every phase of implementations-plan/restart-notify-1/plan.md is marked ✓ with its validation gate passing in the transcript; LESSONS_FILE lines printed per phase; the Codex loop converged (a resumed pass with no new material finding, quoted); the draft PR against dev exists (gh pr view) with the close-out commits archiving the plan; bun run test and bun run lint exit 0.
```

```
/loop 15m Drive implementations-plan/restart-notify-1 forward per its plan.md: reality check (plan, lessons, git status, PR checks), next pending phase, its gate, the Codex loop after Phase 3, delivery as a draft PR, close-out; never merge.
```
