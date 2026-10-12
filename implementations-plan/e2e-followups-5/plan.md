---
plan: e2e-followups-5
tier: light
status: approved (orchestrator, 208f5f4); arc-1 in implementation
issues: "#319, #322 (arc-1); #321, #316, #310, #294, #290, #262, #277 (no arc)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 explorers (sonnet); one Codex audit (gpt-6.1-sol, high) with the Opus Plan lens beside it; Codex resume rounds until an explicit verdict
base: origin/dev at 32b7bf4
trunk: dev
post_implementation_hardening: not scheduled
---

# e2e-followups-5: classify and fix two single CI reds by reproduction

Two CI reds, each seen once and cleared by a replay. The arc classifies each one by reproduction with recorded state, never by reading alone, then fixes the cause it finds. One arc, one PR against `dev`.

- **#319.** After a password change, `lockWallet` saw the session record leave, but the popup did not reach `#/popup/auth` within 15 s. The audit found a lost-route path in the code (L2 below): a stale "still active" answer that the background posts after its own lock event sets `isLogined` back to true, and the route guard then bounces the lock's push to `/popup/auth`. Phase 1 measures it with probes that do not disturb it, forces it to prove it sufficient, and fixes it with a red-on-base unit test. If the records show another branch, that branch's rule applies instead.
- **#322.** On Firefox, the chaos leg's first `requestCapabilities` never showed a matching target in 60 s, while Firefox printed `too much recursion` from `creator-*.js` three times. Phase 2 records three things: which document raised the recursion and why, how far the request got, and what happened to the window (never requested, never created, created then closed, never announced, removed by the harness, or listed off its route).

Recon: [recon.md](recon.md). Owner questions: [OWNER-ASKS.md](OWNER-ASKS.md). Planning log and consults: [lessons/phase-0.md](lessons/phase-0.md).

## Scope

**In:** #319 and #322, in arc-1. The arc closes an issue only when the stop rule settles it (§ Decision rules).

**No arc, with reason:**
- #321, #316, #310, #294 and #290 are labelled `owner-decision`: the owner decides them, not this lane.
- #262 (a token-row sweep across chains) and #277 (reset or delete stalls while the node is unreachable) are product bugs outside this lane's e2e scope. The orchestrator's lane map assigns them elsewhere.

**Out:** any change that widens a wait, raises a timeout, adds a retry or a `skipIf`, filters an error, or rotates a chaos seed. `lessons.md` is at its 8 KiB budget (8,168 bytes), so the close-out promotes nothing unless it retires an entry of at least the same size.

## Outcome & Quality Bar

**For whom:** two people.
- The maintainer who reads a red on `extension-smoke-e2e-status` or `extension-network-e2e-firefox-status`.
- A wallet user who locks right after changing a password, or who connects a dApp on Firefox.

**What excellent looks like:**
- Each issue ends with a named mechanism backed by a recorded reproduction (a timeline, a stack, a window inventory).
- Each fix is at that mechanism, with a test that is red on the base copy and green after.
- The lock keeps every fence it has. A lock that does not land, or a window the harness cannot see, fails with its reason. No wait gets longer.

**What good enough looks like:** an issue that does not reproduce after its floor, and has no mechanism that explains it, stays open. It carries the measured distribution and the one measurement that would name it next time. The arc does not close an issue on reasoning alone.

## Assumptions

**Facts** (verified on 32b7bf4 or in the run logs):
1. `waitForLockScreen` (`apps/extension/tests/e2e/fixtures/helpers.ts:71-84`) waits up to 60 s for `nulo:core:session` to leave `chrome.storage.session`, then 15 s for `/popup/auth`. It never reloads (since #313).
2. With an in-memory session, `close()` posts the lock event before it deletes the session record (`session-manager.ts:413-417`, then `:430`). A restarted worker has no in-memory session; there, `lockActiveProfile` emits its fallback event after the delete and the read-back (`service.ts:928-942`). "Posted" is not "delivered": the helper reads storage, which is a different channel from the popup's port.
3. The popup's lock landing does three things in order (`locked-state.ts:46-53`, `app.vue:190, 200-225`):
   - it awaits a `getProfiles()` RPC (60 s client timeout);
   - it returns if a newer profile event arrived;
   - it calls `router.push("/popup/auth")`, without awaiting or inspecting the result.
4. A password change reopens the session and emits a non-null `onActiveProfileChanged` (`service.ts:1139-1195`, `session-manager.ts:340`). That event starts `bootstrapActiveProfile` in the popup (`app.vue:204-218`). The bootstrap ends with a `getActiveProfile()` re-read and, if that answers "active", sets `appStore.isLogined = true` (`useProfileBootstrap.ts:169-174`). The same write is in `hydrateKnownProfile` (`:202`).
5. That `isLogined` write is not fenced against a lock. `runFencedBootstrap` (`popup/profile-bootstrap.ts:19-29`) fences only the failure record. The lock-wins test (`useProfileBootstrap.test.ts:281-292`) covers only a re-read that runs after the lock. The composable already owns a run fence, `bootstrapFence` (`useProfileBootstrap.ts:45`, `createRunFence` in `composables/runFence.ts`, whose `invalidate()` ends every earlier run), and `runBootstrapCore` checks it between steps. Nothing invalidates it on a lock. Its callers are the popup shell (`app.vue:212, 321`), the popup import page's recover path (`popup/pages/import.vue:73-78`), and onboarding (`onboarding/app.vue:61`, `onboarding/pages/import.vue:46-48`, `create.vue:57`), which has no lock listener.
6. The profile service's mutex hands off inside `leave()` (`packages/wallet-core/src/utils/lock.ts:104-122, 133-172`). A queued `lockActiveProfile` resumes `enter()` and `withLock()` (two continuations) and runs `close()`, which emits before its first await (`service.ts:919-929`, `session-manager.ts:397-417`). The response of the read that held the mutex just before it takes three reactions through `runExclusive`, `getActiveProfile` and `handleRequest`'s `await invoke` before `sendResponse` posts it (`service.ts:285-287, 496-503`; `packages/extension-messaging/src/core/base-service.ts:112-118`). So the popup can receive the lock event first and a stale "active" answer second. Codex reproduced that order in memory with the real `Lock` (audit round 2).
7. Committing a route change while `isLogined` is true calls `refreshSession()` (`app.vue:415-420`), which holds the same mutex (`service.ts:1008-1013`). The route guard bounces a push to `popup-auth` while `isLogined` is true (`route-guard.ts:30`). `auth.vue:45-47` runs `router.go(-1)` at setup if `isLogined` is true, and its `isLogined` watcher advances past auth (`:229-234`).
8. `security.test.ts:13-16` says a password change "forcibly disconnects every open service client". Nothing in the tree does that (recon.md, absence trail). The change-password page closes only its own client on unmount. `initAccount` replaces the account client (`useProfileBootstrap.ts:103-105`), which is a candidate source of the "Client disconnected" text the test filters.
9. In run 38205877849, attempt 1, the three `too much recursion` lines are at 05:01:18.59-.62, 3.1 s after the test logged its actions (05:01:15.51) and inside `connectAccount`. The test failed at 05:02:19.31 in `grantCapBundle` (lessons/phase-0.md).
10. The `unsafe filename: data:…` line in both attempts is the relay's documented once-per-launch line, not a relay failure (`firefox-page-errors.ts`, `FIREFOX.md`).
11. Every popup page loads `creator-*.js`, the approval windows included. `dist/firefox/src/popup/index.html` names it among its 131 module scripts. Only three of those scripts have it in their graph: `creator`, `JsonViewer` and the `popup` entry, through `PopupManager` → `DataViewerPopup` → `JsonViewer` → `theme.js`, whose module scope builds the CodeMirror theme. A local `build:firefox` at 32b7bf4 gives the same `creator-DQZXbG1H.js` hash as CI.
12. The relay resolves a top context's BiDi id through `NavigableManager.getIdForBrowsingContext` and emits without checking whether the context was announced (`firefox-page-errors.ts:201-214`). So for a window that BiDi never announced, the error is probably emitted with an id that Puppeteer has no context for, and Puppeteer drops it. The relay itself drops a record only when the top context is gone or has no id.
13. `watchForSilentCloses` reports a context closed after 8 reads, 150 ms apart, in which the classic handle list never named it (`firefox.ts:690-735`). `bidi-attach.ts` `reportClosed` then removes the target from `targets()`.
14. `requestCapabilities` awaits three steps before any window exists (`dapp-interaction/service.ts:466-472`): initialization, the dApp session lookup, and the protocol-address computation. The window is opened through `src/wallet/services/window-manager/window-manager.ts` (`openAndAwait`, `createPlaced`).
15. Run 38205877849 uploaded no artifacts: the step printed "No artifacts will be uploaded". CI's probe-string grep (`PROBE|nulo:probe:|VITE_E2E_PROBE`) runs only in `_extension-network-e2e.yml:339`. `_build-extension.yml`'s marker list does not include it.

**Inferences** (unverified; the phases test them):
- I1 (weak). In #319 the steps before the lock did not look slow: 24.5 s total minus the 15 s wait, against 9.4 s for a whole passing test. That passing time also includes the close, the reopen and the unlock. Comparable stage times come from Phase 1.
- I2. The three recursion lines came from one document. A module whose evaluation failed rethrows the cached error to every later script that imports it. That document's entry never ran, so it never mounted. The discover and verify windows mounted (`connectPlayground` returned), so the document is most likely the capabilities window.
- I3. A window whose module throws at load stays listed in `targets()` with its URL, because Puppeteer updates the URL on DOMContentLoaded and load. If so, the recursion alone does not explain "no matching target". Phase 2 settles I3 with a forced throw.

**Asks** (each carries the working assumption the arc proceeds on):
- A1. S3 (§ Phase 1) recreates the original load (four whole smoke suites and `test:all`). The e2e skill wants amplified loops alone on the host, and other agents use this host. *Working assumption:* S3 runs only if S0-S2 give no natural lost or late lock. Before it runs, the implementer records `uptime` and the port registry's live rows, and runs it only while no other e2e run is registered.

## Architecture & Implementation

### Probe rules (both issues)

All probe code is throwaway: a patch kept under `~/.cache/nulo-backlog/e2e-followups-5/`, never in a commit.
- **Sentinel.** Every product-side probe uses a `nulo:probe:` string literal, for its storage key, its global name and its labels. CI's grep finds that literal after minification.
- **Prove the bundle clean.** Before any commit:
  - remove the patch and rebuild both browsers from a clean tree;
  - `grep -RnE '(PROBE|nulo:probe:|VITE_E2E_PROBE)' apps/extension/dist/chrome apps/extension/dist/firefox` must find nothing;
  - `git diff origin/dev -- apps/extension/src` must show only the fix.
- **Do not perturb.** A probe pushes synchronously to an in-memory buffer and is dumped once at the end. It adds no `await` and no storage write on a facade-locked path, or anywhere between the lock click and the landing. A storage write delays an emit by a task and fans out `storage.onChanged`, which can heal the race it hunts.
  - The popup buffer is a page global, read by `page.evaluate`.
  - The background buffer is read once after the run, through a throwaway `nulo:probe:dump` message handler.
- **No secrets.** No record holds a password, a key, a session handle or a bearer.
- **Probe files.** Probe test files are `_probe-*.test.ts`, gated by an env variable, and never committed.
- **One run at a time.** Run every e2e alone at retry 0, one at a time, through `test:e2e` (smoke) or `agent.sh` (network). S3 is the one stated exception. Never build while a run uses `dist/`. Each S3 lane gets its own immutable, non-prefixing `EXTENSION_PATH` copy, built one after another. Smoke teardown kills browsers by path prefix.
- **Cold samples first.** The first sample of a fresh launch counts and is reported apart from the warm ones. Both CI reds were first-of-a-kind steps.

### #319: what the probe records

Each context keeps its own counter. Records carry the RPC request id or the event's kind and `seq`, so a background record (post order) pairs with its popup record (receipt and write order) without any added messages on the measured path.

**Background records:**
- entry and exit of `getActiveProfile`, `refreshSession`, `getProfiles` and `lockActiveProfile`;
- the post of each response and each `onActiveProfileChanged` event (`base-service.ts` `sendResponse` and `emit`), including the restarted-worker fallback emit.

**Popup records:**
- the click: read answered, abandoned (`sessionChanges` moved), or lock sent;
- each profile event, with its `seq` and kind;
- the landing: seal, `getProfiles` settled, the `isCurrent()` result, and the `route` call;
- the `router.push` result (`undefined`, or the `NavigationFailureType`) and when it settles;
- every guard decision, and every `afterEach` commit;
- every `router.push`, `replace`, `go` and `back` call, with the top five stack frames (this covers `auth.vue`'s `router.go(-1)`);
- route-component import start and resolve;
- every `isLogined` change, with its stack;
- the bootstrap's `stillActive` read: sent, answered, and its value;
- any boot or reconnect `loadProfile` run.

The probe test also polls the hash every 50 ms after the session record leaves, to record the full trajectory.

**The probe test.** `_probe-lock-after-password-change.test.ts` uses a fresh launch per test and runs 10 iterations in it, each in a freshly opened popup. Each iteration does these steps:
1. Change the password (two values, alternating).
2. Wait for the toast and for the hash to leave `change-password`.
3. Click `header-lock`.
4. Wait for the session record to leave.
5. Poll for 75 s. This is a diagnostic that records the trajectory and the final route, never a pass.
6. Dump the records, unlock with the current password, and close the popup.

**The forced probe for L2.** It is synchronized by recorded order, not by a timer.
- A throwaway hook holds the mutex in `refreshSession` until the background buffer records this queue: refresh holding, then the bootstrap's `getActiveProfile`, then `lockActiveProfile`.
- Only then does the hook release.
- The probe asserts three things: the lock event is posted before the stale response, the popup receives them in that order, and the push is bounced.
- A run whose queue did not form is an invalid experiment, not a negative result.

It runs on the base build and on the fix build. Red on base and green on the fix shows L2 sufficient at e2e level.

### #322: what the probe records

**The relay listener.** A copy of `listenerSource` also sends every error-level message of an add-on frame, with or without a BiDi id. Each record carries:
- the document URI, top-level or not, the browsing-context id, and the inner window id;
- `nsIScriptError` line and column;
- the full SavedFrame stack: its depth, plus the first and last 20 frames.

The relay logs each record before its BiDi emit, with whether Puppeteer has a context for that id. That separates three cases: id unavailable, id with no Puppeteer context, and context removed by the harness.

**The request's path**, from background probes:
- the wallet-sdk handler's entry for `requestCapabilities`;
- the end of each of the three pre-window steps (Fact 14);
- the `interaction()` lock;
- `openAndAwait` start and result: the window id, or the error;
- every removal or cancel of the window;
- the playground's result for the request, read at the timeout.

**The window**, recorded with timestamps:
- context and URL events seen over BiDi;
- every `reportClosed` the watch made, and whether Firefox's own scope still had that context;
- `browser.targets()` URLs;
- the window's mount state: the child count of `#app`, read once, bounded.

At the timeout, inside the seam's own timeout branch, one inventory runs after the failure. It races a 5 s deadline, and the original error is rethrown whatever the inventory does. `withTimeoutMessage` does not bound its callback and handles only `TimeoutError`, while the Firefox seam throws a plain `Error`, so it is not used here. Classic `windowsWithUrls` switches windows, so it runs only in this failure path.

**The forced throw (settles I3).** A throwaway build makes the popup entry throw at module evaluation. Open the capabilities window once and record whether the target is listed, and with which URL.

**The recursion hunt.** `_probe-popup-cold-load.test.ts` opens the popup page in 100 fresh extension windows on the base build, under `taskset -c 0,1`. For each window it records the document URI, the initial fragment, mount, the recursion records, and whether the target is still there.
- If the recursion appears, compare against a throwaway build in which `DataViewerPopup` loads its viewer lazily.
- How to read the stack:
  - map line and column through a `sourcemap: "hidden"` build with the same chunk hash;
  - thousands of frames that repeat a cycle is a JS recursion, named by that cycle;
  - a shallow or incomplete stack is `unknown/incomplete-stack` (the collector stops at a dead wrapper). Neither stack depth nor "the lazy build stopped failing" alone attributes it to Firefox's module evaluation. Only the mapped column plus the controlled loading comparison do.

### Decision rules

**#319.** Classify each lock by its final route and its traced mechanism. An operation still pending at 75 s is "unresolved", not lost.
- **Lost.** The final route is not `/popup/auth` (or `/popup/register`), and the trace names a terminal cause:
  - L1: a newer profile event dropped the landing.
  - L2: `isLogined` was set true after the seal, from a read answered "active" after the lock event, so the guard bounced the push. A duplicated or redirected push is the trace of that.
  - L3: another navigation cancelled or aborted the push.
  - L4: the lock event never arrived.
  - L5: the route landed, then left: `auth.vue`'s `router.go(-1)`, its watcher, or another push.
- **Late.** The push resolved with no failure and the route committed after 15 s. The trace names the await that held it: the `getProfiles` round trip (and whether the request waited before its handler or inside it), the guard, or the lazy `auth` chunk.
- **Not reproduced.** No lost and no late lock across the floor.

**#322, per missed window:**
- W0: the request never reached `interaction()`. Say where it stopped: the handler or one of the three pre-window steps.
- W1: the window was created, and classic lists it with the expected URL, but BiDi never announced a context for it.
- W2: BiDi announced it, then the watch reported it closed while Firefox's own scope still had it.
- W3: `openAndAwait` failed, or was never called after `interaction()` began.
- W4: the target is listed, but its URL is still `about:blank`.
- W5: the window was created, then really closed or cancelled. Say who removed it.
- W6: the target is listed with an extension URL off `#/windows/capabilities`, for example the auth route a window's boot pushes when not logged in (`useDappApprovalWindow.ts:121-126`).

**#322, the recursion:** the document that raised it (is it the missed window?), its stack class (JS recursion or native exhaustion), and the code on the stack (ours, CodeMirror or `style-mod` as we call them, or module evaluation).

**Settlement (the orchestrator's stop rule).** An issue settles in one of two ways:
- A recorded natural reproduction names its mechanism.
- After its floor, a named mechanism explains the single sample. That mechanism must be shown sufficient by a forced probe and a red-on-base test. A forced probe never stands in for the natural record when that record contradicts it.

Anything else leaves the issue open with the finding.

#319 settles only when its route mechanism is named and the benign filter is gone (§ Fix by branch).

#322 settles only when both questions are answered:
- why the window went unseen;
- which document raised the recursion, and why.

The PR says `Closes #n` only for an issue that settled; otherwise `Refs #n`, and the issue gets a comment.

### Fix by branch

- **#319 L2, the pinned shape.** The lock supersedes in-flight activations through the fence the composable already owns.
  - `useProfileBootstrap.ts` exports one function that calls `bootstrapFence.invalidate()`. The popup's lock seal calls it: `app.vue` wires it into the `createLockedState` shell, so the lock event and a boot-time lock both reach it.
  - `bootstrapActiveProfile` and `hydrateKnownProfile` keep the `isCurrent` of the core run they started or joined. After the final `getActiveProfile()` re-read, they commit `isLogined = true`, `refreshInFlight` and `setLastActiveProfileId` only if that run is still current. A superseded activation commits nothing and returns "not active" (`false` / `null`).
  - A newer unlock starts a fresh run after the seal, so it commits as today. `runBootstrapCore` already refuses to join a superseded run.
  - Onboarding has no seal, so its contract is unchanged.
  - On the boot path, `reconcileLockedBoot` keeps its two outcomes apart:
    - `superseded`: a newer boot run;
    - `event-superseded`: a lock event during the lookup, which still settles `bootRetrying` and `isSessionChecked` (`apply-boot-outcome.ts:28-36`).
    
    A superseded activation inside the lookup only makes `advance(false)`.
  - The `stillActive` re-read stays: it covers a lock that completed before the read. Its comment at `:164-168` is corrected: the mutex orders the service calls, not the popup's receipt of an answer and an event.
  - The route guard, the seal's order and the landing's `isCurrent` fence stay as they are.
  - Rejected shape: passing `app.vue`'s `profileEventSeq` into the bootstrap. The popup import page's recover path cannot reach that counter, and it would add a second fence for one fact.
  - Tests:
    - **red on base** (`useProfileBootstrap.test.ts`): `getActiveProfile` deferred; the lock supersedes; the read resolves "active"; `isLogined` stays false and the call returns "not active". The same test runs for `hydrateKnownProfile`.
    - **controls:** an ordinary activation with no lock commits `isLogined = true`; a newer unlock that begins after the lock commits while the older activation's late answer commits nothing; onboarding's calls (no supersede) keep their return values.
    - **boot path** (`reconcile-locked-boot.test.ts` / `apply-boot-outcome.test.ts`): a lock event during the lookup still settles `bootRetrying` and `isSessionChecked`.
    - **the guard-route link:** a test that runs the real guard (`createPopupGuard`) and a router shows that, after a stale answer, the lock's push lands on `popup-auth` with the fix and is bounced on the base copy. A test of `locked-state`'s route callback alone does not prove the landing.
- **#319 L1, L3, L4, L5:** fix the cause in the module the trace names (`locked-state.ts`, `app.vue`'s shell, `route-guard.ts`, `auth.vue`). Add a unit test red on the base copy, paired with a control for the fence that must still hold.
- **#319 late:** name the held await and fix the cause there. The cause must be in product work the landing need not wait for, and the fix must change nothing a person sees. Any harness change for a late route goes back to the panel as a new decision. A longer hash wait, a reload, a store read and a wait before the click are all out. A wait before the click would hide L2.
- **#319 not reproduced:** no fix, unless L2's forced probe and unit tests settle it under the stop rule. The panel decides D4: one diagnostic in `waitForLockScreen`, run only after its route wait has failed.
  - It reads, once, the hash, `header-lock`, `auth-password-input`, `data-boot-outcome` and `data-session-checked`.
  - The read races a 5 s deadline, and the original `TimeoutError` is rethrown with the read appended, or alone if the read did not answer. It never passes.
  - `header-lock` present after the record is gone is L2's signature.
- **The benign filter in `security.test.ts`.** No outcome keeps a filtered error.
  - Phase 1 runs the test once without the filter and records each "Client disconnected" entry with its source.
  - None recorded: remove the filter and correct the comment (Fact 8).
  - Recorded, from a source this arc reaches (for example a call left pending on a client the bootstrap replaced): fix that source with a unit test red on base, under the no-ask record if nothing a person sees changes, and remove the filter.
  - Recorded, from a source this arc cannot fix (the fix changes what a person sees, or the cause sits outside the profile and client layers): #319 stays open, the PR says `Refs #319`, and the source is recorded on #319 with the measurement. No filtered run counts as proof: every proof run for #319 reads the unfiltered error arrays. The arc neither edits nor relies on the filter.
- **#322 W0, W3, W5:** fix the product cause the trace names in the interaction service or the window manager, with a unit test red on the base copy. W5 by design (for example a request cancelled by the dApp) is a harness reading, and goes back to the panel.
- **#322 W1:** the Firefox seam supplies the missing announcement, the mirror of `reportClosed`. It may announce only a context that meets all of these:
  - Firefox's own scope reports it live;
  - its URL is the installed extension's exact `moz-extension://<id>/src/popup/index.html` with the expected route and `requestId`;
  - it is not in `bidi-attach.ts`'s `closed` set.
  
  Tests in `scripts/e2e/firefox-driver.test.ts`, red on base, cover a foreign page carrying the same fragment, a stale window, and a duplicate real announcement. A browser-level proof shows the supplied page is usable.
- **#322 W2:** the watch reports a never-listed context closed only on positive evidence from Firefox's own scope that it was discarded, never on a miss count alone. A `silentlyClosed` (or successor) test is red on base.
- **#322 W4:** the seam takes the URL from Firefox's state for a target still on `about:blank`, under the same identity fence as W1. A unit test covers it.
- **#322 W6:** the window's own boot routed it; follow the cause into the product as for W0.
- **#322 recursion, ours or the dependency as we call it:** fix the cause (the input or the call pattern), with a unit or component test red on base.
- **#322 recursion from native exhaustion in module evaluation:** the panel decides between two outcomes:
  - a bundle-shape fix, for example `DataViewerPopup` loading its viewer lazily, shown to stop the recursion in the cold-load hunt on base;
  - recording the limit.
  
  A bundle-shape fix must also prove that the viewer's first open looks as it does now; otherwise it goes to OWNER-ASKS.md.
- **#322 not reproduced:** no fix. The panel decides D4 for the Firefox seam: one inventory inside `waitForTarget`'s own timeout branch, racing a 5 s deadline, with the original error rethrown. It names:
  - the watch's synthetic closes with their times;
  - BiDi's open contexts;
  - the classic handles;
  - the relay's records for contexts Puppeteer does not know.
  
  It adds no wait before the failure.

### File-level change map

Only the branch the evidence selects lands. Probe code stays uncommitted.

| File | Change | Branch |
|---|---|---|
| `apps/extension/src/composables/useProfileBootstrap.ts` (+ `.test.ts`) | the supersede export; the `isLogined` commits gated on the run's fence; correct the `:164-168` comment | #319 L2 |
| `apps/extension/src/popup/app.vue`, `src/popup/locked-state.ts` (+ `.test.ts`, `reconcile-locked-boot.test.ts`, a guard-route test) | the seal supersedes activations | #319 L2 |
| `apps/extension/src/popup/locked-state.ts`, `route-guard.ts`, `pages/auth.vue` (+ tests) | the cause the trace names | #319 L1, L3-L5 |
| `apps/extension/tests/e2e/fixtures/helpers.ts` | D4 diagnostic only | #319 not reproduced |
| `apps/extension/tests/e2e/security.test.ts` | the corrected comment and the filter's disposition | always |
| `apps/extension/tests/e2e/fixtures/browser/bidi-attach.ts`, `firefox.ts` (+ `scripts/e2e/firefox-driver.test.ts`) | W1, W2 or W4 seam fix, or D4 | #322 W1, W2, W4, not reproduced |
| `apps/extension/src/wallet/services/dapp-interaction/service.ts`, `src/wallet/services/window-manager/window-manager.ts` (+ tests) | the request or window fix | #322 W0, W3, W5, W6 |
| `apps/extension/src/components/JsonViewer/*`, `src/popup/components/popups/DataViewerPopup.vue` (+ test) | the recursion fix | #322 recursion |
| `apps/extension/tests/e2e/FIREFOX.md`, `.claude/skills/e2e-testing/SKILL.md` | the row or ledger line for what was found | whichever settles |
| `implementations-plan/e2e-followups-5/*` | lessons per phase, STATUS, close-out | always |

### Trade-offs and alternatives not taken

- **D2, a shell `data-lock-landing` attribute observed by the helper.** Cut after the audit (Codex C9, Opus O8):
  - it moves the route step from 15 s to the helper's 60 s;
  - an absent attribute cannot tell "settled" from "not yet started";
  - boot-path landings never set it.
- **Waiting for the page to settle before the lock click.** Rejected: under L2 the unsettled step is the cause, and the wait would hide it.
- **Fixing L2 in the guard** (for example, let `/popup/auth` through after a seal). Rejected. The guard is right to bounce auth while `isLogined` is true; the wrong state is `isLogined` itself. A fence at the write is the smallest change that keeps every existing check.
- **A warm loop as the main #322 instrument.** Replaced by cold launches and a cold-load hunt (Opus O9): both CI reds were first-of-a-kind.
- **Reading the Pinia store from a fixture.** Rejected, as in e2e-followups-3.

## Phases

Mark a phase header ✓ only when its gate passes. Phases 1 and 2 never share a running browser or a build.

### Phase 1: #319, the lock route ✓ (2026-10-12; the pinned certification half unmet, D15)

Steps:
1. Record the base SHA. Build the #319 probe patch by § Probe rules. Log both in `lessons/phase-1.md`.
2. Run the forced L2 probe on the base build until it has 3 valid runs (its queue formed). Record whether each reproduces #319's symptom: session record gone, hash never on auth, `header-lock` present.
3. Run S0: the unmodified `security.test.ts`, no probe, base build, under `taskset -c 0,1`, 10 runs. Each run is a fresh launch.
4. Run S1: the probe test, 5 launches under `taskset -c 0,1` (5 cold and 45 warm locks).
5. Run S2: the same, with Chrome, vitest and three busy loops pinned to one CPU (`taskset -c <n>`), 5 launches.
6. Run S3 only if S0-S2 give no natural lost or late lock (Ask A1). S3 reproduces the original condition once: four whole smoke suites (armed and artifact, Chrome and Firefox; separate, non-prefixing `EXTENSION_PATH` copies built one after another; started 15 s apart) and `bun run test:all`, all at retry 0. The armed Chrome copy carries the probe patch. A throwaway edit to `waitForLockScreen` dumps the records on its timeout and polls 60 s more, then rethrows.
7. Run `security.test.ts` once without the benign filter, and record each "Client disconnected" source.
8. Write the stage table into `lessons/phase-1.md`: per stage, cold and warm counts, landing median and max, every lost or unresolved lock with its branch. Add the classification.
9. Take the classification to Codex, then to the Opus lens. Log the consult.
10. Apply the branch's fix and tests (§ Fix by branch), the comment correction and the filter's disposition.
11. Prove the fix:
    - the forced L2 probe on the fix build (3 runs): all green;
    - the stage that reproduced naturally, at least 3 rounds on the fix build with the probe on top: zero lost locks.
12. Remove the probe patch, and prove the bundle clean (§ Probe rules).

**Validation gate (Phase 1):**
- Commands:
  - `bun run lint` and `bun run typecheck:all`: exit 0.
  - `bun run test`: exit 0, with the new tests in the run.
  - Red-on-base proof: put the base copy of the fixed module in place, taken from the base SHA and never from `HEAD`. Run the new test and see it fail. Restore the fix and see it pass. Log both outputs.
  - Step 11's runs: green, zero lost locks.
  - `cd apps/extension && bun run test:e2e -- tests/e2e/security.test.ts --retry=0`, 10 runs as is, then 20 runs with vitest, the browser and three busy loops pinned to one CPU: all green. This is the e2e skill's certification bar for a timing-sensitive change.
  - If popup code changed (the L-branches): the full smoke suite once on each browser at retry 0, `cd apps/extension && bun run test:e2e -- --retry=0` and the same with `NULO_E2E_BROWSER=firefox`: green. Then the network callers of the lock helpers on Chrome and on Firefox, one `e2e:agent` run per browser with the file list from `grep -rlE "lockWallet|waitForLockScreen|lockThroughConfirmDialog|unlockAfterBackgroundDeath|reopenAndRecoverAfterImport" tests/e2e/network`: green.
  - If `fixtures/helpers.ts` changed (D4): the full smoke suite on both browsers, and the full Firefox network suite (`NULO_E2E_BROWSER=firefox NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent`), once each: green.
  - Step 12's grep: no hits.
- Pass criteria:
  - every command exits 0;
  - each red-on-base test fails on base and passes on the fix;
  - zero lost locks in step 11 and in the certification runs.
- On the not-reproduced branch with no committed change, the stage table is the gate.
- Layers: lint, typecheck, unit, smoke e2e (amplified, both browsers).

**Gate outcome (Phase 1):** L2 settled by natural reproduction (S0 1 of 10 red on base; S1 6 of 50 lost, all L2); fix `7d2e5fb`, typed `fb3aa70`, filter removed `e9f5b6e`. Green: lint, typecheck:all, test; red-on-base (base copy and fence-removal mutant both red); forced L2 on the fix build 4 of 4 landed; S1 on the fix build 150 of 150 landed; `security.test.ts` 10 of 10 unpinned and 20 of 20 on one CPU without busy loops; full smoke on Chrome (49 files, 213 tests) and Firefox (51 files, 210 tests) at retry 0; the 16 lock-caller network files on Chrome (15, one Firefox-only skipped) and Firefox (16); the bundle grep, no hits. **Not met:** the pinned whole-file run, red on base and fix alike before any changed path (D15); the changed test alone under that load completed the lock 18 times in 60 attempts with no lock-path failure ([lessons/phase-1.md](lessons/phase-1.md#step-12-the-gate)).

### Phase 2: #322, the capability window and the recursion

Steps:
1. Build the probe harness, the background probes and the relay listener copy on the base SHA. Prove that the dumps work with `NULO_E2E_BROWSER=firefox bun run test:e2e -- tests/e2e/page-error-capture.test.ts --retry=0`. Log it in `lessons/phase-2.md`.
2. Run the forced throw once (I3). Record whether the target is listed, and its URL.
3. Run R0, the exact CI replay, once:
   ```
   NULO_E2E_BROWSER=firefox NULO_E2E_CHAOS=1 NULO_E2E_CHAOS_SEED=1960252198 NULO_E2E_PROVERLESS=1 NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/send-chaos.test.ts
   ```
4. Run R1: 4 more replays, then 5 under `taskset -c 0,1`. Each one is a cold launch with a cold first capabilities window.
5. Run R2: `_probe-cap-window-cold.test.ts` through `e2e:agent`, 20 tests in one run under `taskset -c 0,1`. Each test is a fresh launch that registers, connects and grants once.
6. Run R3, the cold-load recursion hunt: 100 fresh popup windows on the base build under `taskset -c 0,1`. Run the lazy-viewer comparison only if the recursion appears.
7. Classify each missed window (W0-W6) and each recursion record. Write the table into `lessons/phase-2.md`.
8. Take the classification to Codex, then to the Opus lens. Log the consult.
9. Apply each branch's fix and its tests (§ Fix by branch).
10. Prove the fix: the stage that reproduced, at least 3 rounds on the fix build, plus 2 more than it took to reproduce. Zero misses and zero recursion records.
11. Remove the probe code, and prove the bundle clean.

**Validation gate (Phase 2):**
- Commands:
  - `bun run lint`, `bun run typecheck:all` and `bun run test`: exit 0. This includes `scripts/e2e/firefox-driver.test.ts` when the seam changed.
  - The red-on-base proof for each new test, as in Phase 1.
  - Step 10's runs: green.
  - If `tests/e2e/fixtures/browser/**` changed:
    - the certification bar: R0's replay 10 times as is, then the seam's most direct spec (`waitForPopup` through `connectPlayground`, the R2 test unpinned) 20 times pinned to one CPU with three busy loops;
    - `NULO_E2E_BROWSER=firefox bun run test:e2e -- --retry=0` (the full Firefox smoke suite), once;
    - `NULO_E2E_BROWSER=firefox NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent` (the full Firefox network suite), once.
    
    All green.
  - If product code changed: the Chrome R0 replay (`e2e:agent` without the browser variable) once, and the full smoke suite once on each browser at retry 0: green.
  - The bundle-clean grep: no hits.
- Pass criteria:
  - every command exits 0;
  - zero missed windows and zero recursion records in the fix-build rounds;
  - each red-on-base test fails on base and passes on the fix.
- Layers: lint, typecheck, unit, smoke and network e2e on Firefox, plus Chrome where product code changed.

### Phase 3: arc gates, quality loop, delivery

Steps:
1. Merge `origin/dev` into the branch. Read what changed in `index.md` and `lessons.md`.
2. On the final head, run these: `bun run test:all` once, `bun run lint`, `bun run typecheck:all` and `bun run test:ci-gating`. Add `bun run test:release` if the root `scripts/` or `.github/` changed. Add `bun run check:plans` after staging the plan files.
3. Run the Post-implementation section, then Delivery.

**Validation gate (Phase 3):** every command in step 2 exits 0 on the final head, and the Codex loop converged: a resumed pass reports no new material findings.

## Security & Adversarial Considerations

- **Threat model.** This work touches test-harness code and the popup's lock state. It adds no new trust boundary, no new dApp-facing surface and no key material. The probes run partly under Firefox's system principal (`chromeScript`). They stay uncommitted, and each launch is local and owned.
- **Probe leakage.** An uncommitted source edit still enters a build. The `nulo:probe:` sentinel, a clean rebuild and the local grep of both bundles (§ Probe rules) are the guard. CI's grep runs only in the network e2e workflow (Fact 15), so the local grep is required.
- **The lock's fences.** The L2 fix adds a fence and loosens none. These stay as they are, and a control test pins each one the fix touches:
  - the seal runs before any await;
  - a newer event supersedes a landing, never the seal;
  - the `stillActive` re-read;
  - the guard's auth bounce.
  
  A fix that let `/popup/auth` through while `isLogined` is true would hide an unlocked-looking popup over a locked worker. That is the state L2 produces and the fix removes.
- **The seam's identity fence.** A W1 or W4 fix must never let the harness accept a window that is not the extension's own. It requires:
  - the installed extension's exact origin, the popup path, the route and the `requestId`;
  - a context Firefox's own scope reports live;
  - an id not in the `closed` set.
  
  Tests include a foreign page carrying the same fragment. The relay's fail-closed close check stays as it is.
- **Records.** No password, key, session handle or bearer is recorded. Probe files stay under `~/.cache/nulo-backlog/e2e-followups-5/`, never in the repo or `/tmp`.
- **Supply chain.** No dependency is added. A recursion fix changes our call pattern or our bundle shape, never a vendored copy, and adds no override.
- **Logging.** Any new log line follows CLAUDE.md § Logging policy: a named property, a fixed category, and an identifier rather than a payload.

## UI impact

None planned. The orchestrator's no-ask record, which is the whole visible budget, quoted from the lane brief:

> "A product cause that changes nothing a person sees (a dependency's recursion, a lost lock route) may ship in this arc under the orchestrator's `no_ask` record (precedent #205 / #210 / #214 / #312), with the panel's agreement, a test red on base and the one-line record quoted in the plan's UI impact"

What can ship under it:
- **The L2 fix.** A lock after a password change shows the lock screen, as designed, instead of a popup that looks unlocked over a locked worker.
- **A request, window or recursion fix.** The window opens, or the page renders, as designed.

What goes to OWNER-ASKS.md in the "what ships now" form (the arc ships without it):
- a fix that would change a screen's layout, copy or rows;
- a fix that would land the lock anywhere other than `/popup/auth` or `/popup/register`;
- a fix that would change when or how the JSON viewer first appears.

The PR quotes the record and names the branch it used.

## Decision ledger

| # | Decision | Source | Status |
|---|---|---|---|
| D1 | Classify by probes that do not perturb: a sentinel, synchronous per-context buffers with correlation ids, no storage writes or added awaits on the measured path; the forced L2 probe is synchronized by recorded queue order. Cold samples are counted apart. Floors: S0-S3 for #319, R0-R3 for #322. The unmodified test is the control. | planner; Codex C1, C10, C14, C15, C17, C20; Opus O1, O7, O9 | revised after round 2 |
| D2 | Cut: no `data-lock-landing` attribute, no harness change for a late route without a new panel decision. A late route is fixed at its cause. | Codex C9 (blocker), Opus O8 | accepted |
| D3 | #322's probe records every add-on error with its document, stack depth and column, with or without a BiDi id. It records the request's path (W0-W6) and the window's mount state. The forced throw settles I3. | planner; Codex C6, C11, C12; Opus O4, O10-O12 | revised after round 1 |
| D4 | A committed diagnostic only on a not-reproduced branch: one read after the failure, raced against a 5 s deadline, the original error rethrown; on Firefox inside the seam's own timeout branch | planner; Codex C13, C16 | revised after round 2 |
| D5 | #322 closes only when both of its questions are answered | planner | kept |
| D6 | e2e rounds run one at a time with no build under a running browser. S3 is the one exception, with isolated `EXTENSION_PATH` copies. | planner; Codex C15 | revised after round 1 |
| D7 | L2 is the leading #319 hypothesis. Its fix shape is pinned: the lock seal invalidates the composable's existing `bootstrapFence`, and every `isLogined = true` commit is gated on its run's fence; the guard stays as it is; boot outcomes stay distinct; onboarding is unchanged | Opus O3 (verified by the planner, Facts 5-7); Codex round 2, C18 | revised after round 2 |
| D8 | The `security.test.ts` benign filter: measure its source; remove the filter when nothing is recorded or when the arc fixes the source. A source the arc cannot fix leaves #319 open (`Refs`), recorded on the issue; no filtered run counts as proof | Codex C3 (rounds 2 and 3) | revised after round 3 |
| D-orch-1 | No stack: one arc, one PR | orchestrator | standing |
| D-orch-2 | The no-ask record in § UI impact is the whole visible budget: a lost lock route, a window that fails to open or a recursion in a page is fixed so the screen behaves as designed, and nothing new appears; a fix that would change what a person sees goes to OWNER-ASKS.md and stays out. The PR body quotes the record | orchestrator, at approval | binding |
| D-orch-3 | Classify by reproduction under § Decision rules: each branch's fix lands only when its probe recorded the mechanism (L2 only with the queue order recorded); "did not reproduce" closes nothing; S3 only if S0-S2 settle nothing; an unsettled issue stays open with `Refs` and a comment carrying the probe record | orchestrator, at approval | binding |
| D-orch-4 | D2 stays cut: no route-wait widening, no filter, no retry, no `skipIf`. The benign filter is removed or its source fixed; no filtered run counts as proof. Every timing-sensitive change passes the certification bar (10 runs, then 20 on one CPU under load), at retry 0 | orchestrator, at approval | binding |
| D-orch-5 | The lock seal is a security boundary: the L2 fix ships with a unit test red on base that pins "after the seal, no reply sets `isLogined` true", the Codex fix loop is asked for an adversarial read of that path, the guard and onboarding stay unchanged, and the invariant is named in one sentence at the code | orchestrator, at approval | binding |
| D-orch-6 | Probes never reach the bundle: the `nulo:probe:` sentinel, no await or storage write on the measured path, both final dists grepped clean and `git diff` empty of probes before the PR opens | orchestrator, at approval | binding |
| D-orch-7 | Never dispatch `nightly.yml`, `release*.yml` or `publish-*.yml`. `lessons.md` is at its budget: promote nothing unless a retirement pays for it. Merge `origin/dev` before the final gates, read what changed in `index.md` and `lessons.md`, never a union merge | orchestrator, at approval | binding |
| D9 | The forced L2 probe holds the bootstrap's tagged final read inside its critical section until the click's `lockActiveProfile` is queued behind it, instead of holding `refreshSession`: with `refreshSession` holding, the bootstrap's own network and account init block on in-process `getActiveProfile` calls and never reach the read (four invalid runs, recorded). Validity: the first `in` after the release is `lockActiveProfile` | implementer, Phase 1 step 2 | deviation, recorded in lessons/phase-1.md |
| D10 | The probe test's trajectory stops 3 s after the route lands (the dwell catches L5) and runs the full 75 s only while it has not landed | implementer | deviation |
| D11 | S2 ran one launch (10 locks), not five: each lock took about four minutes on one CPU with three busy loops, and #319 had already settled by natural reproduction in S1 | implementer | deviation |
| D12 | The fix supersedes activations from `markLocked` in `app.vue`'s locked-state shell (no new shell member); an activation commits `isLogined` only while its core run is current. Consequence stated, not denied: an activation superseded by any newer one (not only by a lock) now returns `false` / `null` in every shell, onboarding included, where before it could set `isLogined` early | Codex and Opus, Phase 1 step 9 (Opus finding 5) | accepted |
| D13 | Not fixed, recorded: after a seal, a same-profile unlock starts a fresh core whose client replacement can reject a call a superseded boot-path core still awaits, turning that stale boot run into `failed`. Base was no better (the joined run kept calling the locked worker and failed with "unauthorized"), and the window needs an outside lock during a boot-time bootstrap plus an unlock before its pending call returns | Opus finding 2, Phase 1 step 9 | disposition |
| D14 | The `security.test.ts` filter is removed as dead code: the launch fixture already drops "Client disconnected" from both arrays. Measured with the fixture's own drops removed too (a throwaway edit): the file is green with no entry. The fixture's suite-wide drop of the worker-restart cascade is outside this lane | Opus finding 1, step 7 | accepted |
| D15 | **Unmet, not claimed.** The pinned half of Phase 1's certification bar (the whole `security.test.ts`, 20 runs, one CPU with three busy loops) cannot go green on this host on any build: the base build failed it 3 of 3 at the same steps as the fix build (3 of 3), the 60 s default test timeout in the input-validation and auto-lock tests (the per-test registration fixture alone takes 40-50 s on that load) and the 5 s toast wait after the password change, all before the lock. Raising those budgets is out of bounds. Evidence gathered instead, none of it presented as the bar: the changed test alone, pinned the same way, until 20 runs pass through the lock, every attempt reported, any failure at or after `lockWallet` a red; the whole file 20 runs on one CPU without the busy loops; the base control. Codex (consulted on this disposition) rejected it as gate satisfaction and found no timing dependency in the diff that the pinned whole-file run alone would expose; the bar's acceptance is the orchestrator's call | implementer; Codex consult | open: orchestrator |
| D16 | #322 does not settle: W4 is shown sufficient by a forced throw and a red-on-base unit test, and explains the CI miss only if the recursion broke that window's modules (I2), which no run recorded; W1 and W2 stay live; the recursion did not recur (10 replays, 119 cold windows). Lands as harness fidelity, `Refs #322`: the BiDi shim hands Puppeteer a `historyUpdated` with the committed URL after an add-on page's commit in a top-level context it saw announced and still holds open (Firefox sends that page no `load`); D4's report in the Firefox `waitForTarget` timeout branch (Firefox's windows, BiDi's open contexts, Puppeteer's pages, the watch's closes, the relay's latest exceptions, 5 s budget, original failure first); an add-on error without a saved stack names its reported location. Rejected: judging the predicate on a stand-in target (breaks `before.has(t)` and `waitForPopup`'s snapshot) | Codex and Opus consults (lessons/phase-2.md, step 8); the shim design is Opus's, over Codex's unargued preference against a synthetic event | accepted |
| D17 | `waitForOpenedUrl` is removed: it existed only because a `text/plain` add-on tab stayed `about:blank` in `targets()`, which D16 ends; its one caller (`legal-acceptance` S10) uses `waitForTarget`, which makes S10 the committed Firefox regression test for D16 (the licences tab was missed on the base fixtures and found on the fix, `w4proof`) | implementer | accepted |

## Audit record

Round 1, 2026-10-12, on the first draft.

**Codex** (gpt-6.1-sol, high, session `01a12eb8-783e-7901-a9ff-3c5fb7128eaa`). Verdict: **reject**, blocking finding C9.

| # | Finding | Disposition |
|---|---|---|
| C1 | [major] The probe guard was overstated: `_build-extension.yml` has no `PROBE` grep | **Accepted.** Verified (Fact 15). Sentinel, clean rebuild and local grep of both bundles (§ Probe rules). |
| C2 | [major] W4 needs W1's identity fence | **Accepted.** Exact origin, path, route and `requestId`, live context, not closed; a foreign-page test. |
| C3 | [major] Seeing an error does not justify filtering it | **Accepted** as D8. |
| C4 | [major] A pending marker needs generation ownership | **Moot**: D2 is cut. |
| C5 | [minor] Fact 2 holds only with an in-memory session; the delete is at `:430` | **Accepted.** Fact 2 qualified; the fallback emit is probed. |
| C6 | [major] Fact 9 confused id allocation with announcement | **Accepted.** Verified; now Fact 12. The relay probe logs before the emit, with whether Puppeteer has the context. |
| C7 | [minor] Wrong window-manager path | **Accepted.** Verified (`src/wallet/services/window-manager/`). Fixed in recon and the map. |
| C8 | [minor] I1 compares unlike spans | **Accepted.** I1 marked weak. |
| C9 | [blocker] D2 raises the route budget 15 s → 60 s, and an absent marker can mean "not started" | **Accepted.** D2 cut. |
| C10 | [major] "Lost" was over-claimed; a duplicated push and still-pending work were not separated | **Accepted.** Classification by final route and trace; "unresolved" kept apart; import, push and go records. |
| C11 | [major] W1-W4 did not cover pre-creation, cancel or close | **Accepted.** W0-W6 and the request-path probes. |
| C12 | [major] The module-evaluation experiment was missing; three errors need not be three windows | **Accepted.** R3 cold-load hunt, lazy-viewer comparison, forced throw. |
| C13 | [major] D4's "one read" was not bounded; `windowsWithUrls` switches windows | **Accepted.** Verified (`webdriver-classic.ts:132-141`). Bounded by `withTimeoutMessage`, after the failure, with retained history. |
| C14 | [major] The post-fix floors were below the skill's certification bar | **Accepted.** The reproducing stage ≥3 rounds; 10 + 20 certification runs for timing-sensitive changes. |
| C15 | [major] S3 needed run isolation | **Accepted.** Separate non-prefixing copies, built one after another; S3 stated as the exception (D6). |

**Opus lens** (Plan agent, opus). Verdict: **conditional approve**. Conditions: O3 measured and its fix pinned, O6, O7, O8, O9, O10 and O11 pre-registered, O13 adopted, O5 surfaced.

| # | Finding | Disposition |
|---|---|---|
| O1 | [minor] Product probes need a literal CI can grep; W1 must refuse closed ids | **Accepted** (§ Probe rules, § Fix by branch W1). |
| O2 | [minor] Citation errors; "posted" is not "delivered" | **Accepted.** Corrected (Facts 2, 4, 14). |
| O3 | [major] Recon dismissed L2 on a false premise: the background posts a queued lock's event before the held read's response | **Accepted.** The planner verified the hop counts (Fact 6) and the queue condition (Fact 7). D7 pins the fix. Recon corrected. |
| O4 | [minor] Settle I3 by a forced throw; Fact 9 | **Accepted** (Phase 2 step 2; Fact 12). |
| O5 | [major] S3 conflicts with "alone on the host" | **Accepted** as Ask A1, with S3 run only if S0-S2 give nothing. |
| O6 | [major] Missing branch: the route lands, then leaves (`auth.vue`) | **Accepted** as L5, with go/back stacks and the full hash trajectory. |
| O7 | [major] Probes can heal the race (storage writes, awaits) | **Accepted** (§ Probe rules, "Do not perturb"; the forced probe shows sufficiency). |
| O8 | [major] Cut D2 | **Accepted** (with C9). |
| O9 | [major] The floors sampled warm state | **Accepted.** Cold launches counted apart; R2 cold; a fresh popup per #319 iteration. |
| O10 | [major] The three error lines are probably one document | **Accepted** as I2, tested by the document URI on each record and the mount read. Attempt 2's `connectPlayground` duration is not in its log (no step lines), so that part is dropped. |
| O11 | [minor] The recursion classifier needs a discriminator without a stack | **Accepted** (column, hidden-sourcemap build, stack-depth rule). |
| O12 | [minor] W list incomplete | **Accepted** (W0 split out, W6 added). |
| O13 | [major] Gates below the certification bar | **Accepted** (with C14). |

Round 2, 2026-10-12, Codex resumed in the same session on the revised plan. Verdict: **conditional approve** (conditions: resolve C3 and C13; apply C16-C21; make the forced L2 ordering and the boot and hydration controls explicit; remove stale D2 and event-order claims from recon). Codex confirmed L2's order in memory with the real `Lock`: `read acquired → lock event posted → read response posted`, and agreed the fence belongs at the write, not the guard or the service.

| # | Finding | Disposition |
|---|---|---|
| C3 | [major] D8 still let a "designed" source keep a filter | **Accepted.** D8 revised; the residual exception it kept was removed in round 3. |
| C5 | recon still stated the event-before-delete order unconditionally | **Accepted.** recon corrected. |
| C9 | recon still named D2 | **Accepted.** recon corrected. |
| C13, C16 | [major] `withTimeoutMessage` neither bounds its callback nor sees the Firefox seam's plain `Error` | **Accepted.** Verified (`fixtures/extension.ts:1143-1153`, `firefox.ts:629`). D4 and the probe inventory race a 5 s deadline and rethrow the original error, on Firefox inside the seam's timeout branch. |
| C17 | [major] The forced L2 probe was timer-based | **Accepted.** Released only after the recorded queue refresh → `getActiveProfile` → `lockActiveProfile`; a run without that queue is invalid, not negative. |
| C18 | [major] D7 needed a boot and hydration contract and tests | **Accepted.** The planner verified the callers (Fact 5). The fix reuses `bootstrapFence.invalidate()` from the seal, so every popup caller is covered and onboarding is unchanged; boot outcomes stay distinct; the tests Codex listed are in § Fix by branch. |
| C19 | [major] A shallow stack does not prove native exhaustion | **Accepted.** `unknown/incomplete-stack` outcome; attribution needs the mapped column plus the controlled comparison. |
| C20 | [major] A shared counter contradicts independent buffers | **Accepted.** Per-context counters with request and event correlation ids. |
| C21 | [major] Gates omitted required suites | **Accepted.** Popup changes run the full smoke suite on both browsers and the lock helpers' network callers on both; a helper change adds the full Firefox network suite. |
| C12 | partly resolved in round 1 | Closed by C19's disposition. |

Round 3, 2026-10-12, Codex resumed in the same session, confirmation only. Verdict: **conditional approve** (with conditions: remove C3's retained-filter exception from the benign-filter rule, D8 and its disposition; an out-of-scope source stays explicitly unresolved and no filtered assertion counts as validation). C13 and C16-C21, the forced L2 ordering, the boot and hydration controls and the recon corrections: met. No new blocker or major finding. **Applied:** the third branch of the benign-filter rule now leaves #319 open (`Refs #319`) with the source recorded on it, and every #319 proof run reads the unfiltered arrays; D8 and the C3 row updated. With that condition met, the planner records the panel as converged; the orchestrator's approval is still required.

## Delivery

Single arc, single PR, no stack (orchestrator standing decision D-orch-1).

| Arc | Phases | Base | code_review | Closes |
|---|---|---|---|---|
| arc-1 | 1, 2, 3, then the close-out as its final commits | `dev` | off | #319 and #322 when each settles; otherwise `Refs #n` |

- **Branch:** `worktree-e2e-followups-5`. Open the PR only after Phase 3's gate and the Codex loop converge: `gh pr create --base dev`, with no labels at creation.
- **Title:** at most 93 characters, by outcome. Examples:
  - `fix(popup): keep a stale activation from unlocking the popup after a lock` (73)
  - `fix: land the lock after a password change; name the unseen firefox window` (74)
- **Body:** what changed and why, per issue; the stage tables; the validation run with outcomes; the no-ask record quoted with the branch used; `Closes #319` / `Closes #322` only for a settled issue, `Refs #n` otherwise; ending with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- **Labels:** after creation, add `e2e:extension-smoke` or `e2e:extension-network` only if the path filter would skip a suite the change needs. Then run `gh pr checks --watch`.
- **Unsettled issues:** for an issue that did not settle, or whose fix was left out, post a comment with the floor run, the distribution, the candidates still open, and what would name it next.
- **No change at all:** if neither issue settles and no change ships, the PR is docs-only. It archives the plan with its findings, the Outcome reads `Open items: #319, #322`, and both issues get their comment.

## Post-implementation

Run these in order after Phase 2's gate and before Phase 3's PR step. `code_review` is `off`, so there is no `/code-review` pass.

1. **Codex audit.** Write the prompt to `implementations-plan/e2e-followups-5/_codex-impl.md` and run `~/.claude/skills/codex/scripts/run-codex.sh implementations-plan/e2e-followups-5/_codex-impl.md <worktree> high read-only gpt-6.1-sol`. The prompt starts with `You are a subagent. Don't run memo.` and contains:
   - the net diff from the plan base (`git diff <base>...HEAD`);
   - this plan.md with its decision ledger, and the phase lessons;
   - an adversarial and security ask: what could go wrong, what an attacker would target, what we trust that we should not;
   - the two rules below, verbatim.
2. **Fix loop.** Verify each finding against the repo before acting on it. Apply the accepted fixes, commit, and log the round (consult and verdict) in `lessons/phase-3.md`. Resume the same session with the fix diff (`resume-codex.sh`) for a re-review under the same rules. Repeat until a round yields no new material findings; rejected nitpicks do not count. If findings are still material after 3 rounds, stop and report a scope smell.
3. **Delivery** per the Delivery section. Open the PR only now, never earlier as a draft.
4. **Close-out**, as the PR's final commits:
   - **Outcome block,** directly after the front matter: date, status, what shipped (with the PR number), a disposition line for each dropped or unsettled part, an `Open items:` line (`#n` per issue that stays open, or `none`), and one line retiring this plan's `/goal` and `/loop` seeds.
   - **Lessons.** Promote generalizable gotchas into `implementations-plan/lessons.md`, one line each, linking the archived detail. It is at its budget: deduplicate, and promote only by retiring an entry of at least the same size. The e2e skill's ledger is the main home for e2e lessons; a durable product lesson from L2 (the mutex orders calls, not the popup's receipt of answers and events) is a candidate for `lessons.md` § Extension runtime.
   - **Open items.** File each one in its home:

     | Situation | Home |
     |---|---|
     | Work inside the implementation you are on | the active `plan.md` and the PR |
     | Actionable work that outlives the plan: a bug, a gap, a missing test, a deferred refactor | a GitHub issue, with a domain label and a `Record` link to the archived plan |
     | Needs a product call, or waits on something outside the repo | an issue labelled `owner-decision` or `blocked:external` (the body names the trigger) |
     | A suspected exploitable weakness | a private draft security advisory; `plan.md` records only "tracked privately: GHSA-…" until it is published |
     | Rejected, superseded or already done | a disposition line in the plan's Outcome block; no open item anywhere |
     | Knowledge that prevents a repeat | `implementations-plan/lessons.md` (8 KiB budget) |
     | A legal or store blank with a release deadline | `BEFORE-LAUNCH.md` |
     | Accepted code work that blocks launch | the `v1.0.0` milestone, pointed at once from `BEFORE-LAUNCH.md` |

     Dedupe first (`gh issue list --state all --search "<words>"`). An issue body has five sections: What happens, Where, Impact, Possible fix, Record.
   - **Merge `origin/dev`.** Before the close-out commit, merge it and reconcile `index.md` and `lessons.md` by reading what the other side added. Never use a union merge.
   - **STATUS.md.** Delete it.
   - **Archive.** In its own commit, `git mv implementations-plan/e2e-followups-5 implementations-plan/archive/e2e-followups-5`. Repair the relative links the extra directory level breaks (`git grep -n e2e-followups-5`), and move the index line to `archive/index.md`.
   - **Report.** Push and report. Merging is the orchestrator's call.
5. **Teardown after the merge.** Once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/e2e-followups-5/plan.md` succeeds, run `agent-worktree done e2e-followups-5 --merged --trunk dev` without asking. Relay a refusal verbatim, and never force. Who notices the merge:
   - a `/loop` session checks on each firing;
   - a `/goal` session arms one background wait after its wrap-up report: `until <the check>; do sleep 300; done`, at the maximum timeout.

**The no-over-engineering rule** (verbatim in every post-impl Codex prompt): *"Report bugs and small, targeted improvements only. Do not propose speculative abstractions, extra configuration surface, new layers, or rewrites — the smallest change that fixes each real problem. If code works and is clear, leave it alone."*

**The comment-quality rule** (verbatim in every post-impl Codex prompt): *"Audit the comments for value per character. Flag any comment that narrates what the code visibly does, restates its line, references implementation plans / phases / reviews, or spends a paragraph where a sentence works — and flag places where a non-obvious invariant or constraint deserves a comment it doesn't have. Comments are permanent context every future reader, human or LLM, pays to re-read: they must be few, dense, and exact."*

## Seeds

Not run by the planner; the orchestrator owns execution.

```
/goal All phases marked ✓ in implementations-plan/e2e-followups-5/plan.md, each backed by its validation gate reported passing in the transcript; LESSONS_FILE=implementations-plan/e2e-followups-5/lessons/phase-N.md printed per phase; code_review is off and /code-review was NOT run; the Codex fix loop (gpt-6.1-sol, high) converged on the whole diff, evidenced by a resumed pass quoted in the transcript; the PR against dev exists (gh pr view output), opened only after the loop, with the close-out's archive-move commit (git show --stat); bun run test:all and bun run lint report exit 0 on the final head.
```

```
/loop 15m Drive implementations-plan/e2e-followups-5 forward; never idle. Each firing: read plan.md and lessons/ (not the chat); if the plan path is gone and FETCH_HEAD:implementations-plan/archive/e2e-followups-5/plan.md exists on origin/dev, run agent-worktree done e2e-followups-5 --merged --trunk dev, report and stop; if delivered and unmerged, babysit CI only. Otherwise take the next step of the current phase; run e2e rounds alone, at retry 0, through test:e2e or agent.sh; never widen a wait, add a retry, skipIf or filter, or rotate a seed; probes carry the nulo:probe: sentinel and never enter a commit. A decision you would bring to the owner: argue it with /codex high (gpt-6.1-sol) and log it; anything a person would see goes to OWNER-ASKS.md and is left out. Phase green = its gate as written. All phases green: run the Post-implementation section, then Delivery, then the close-out; stop and report. Same step failed 5 times: reassess with codex.
```
