# Phase 2: settle the `auth-*.js` rejection

## Step 1: the lock helpers' callers (frozen 2026-10-11, before any probe)

Read on 8f2ca65. The lock helpers are `lockWallet`, `lockThroughConfirmDialog`, `waitForLockScreen`, `unlockAfterBackgroundDeath` and `reopenAndRecoverAfterImport` (`fixtures/helpers.ts`); every one ends in `waitForLockScreen`. No fixture file other than `helpers.ts` calls them.

The lock lands through the background's lock event, not through an `isLogined` watcher: the header chip's `useLockWallet` reads the session handle, sets `isLogined = false` (which only seals, through `watchLockStart`) and sends `lockActiveProfile`; the background clears the session and emits `onActiveProfileChanged(undefined)`, and `app.vue`'s handler runs `createLockedState().onLockEvent`, which seals, awaits `getProfiles()` and pushes `/popup/auth` (`src/popup/locked-state.ts:45-53`).

"Same page" means the helper locks and observes the page the test passed; "after the event" means the page was opened after a background death, whose boot finds no session. "Reopen" is the test's own, after the helper returned (the lock had landed); no caller reopens before it.

| Caller | Helper | Page | Test's own reopen |
|---|---|---|---|
| `auth-flows.test.ts` ×4 | `lockWallet` | same page | closes and opens a new popup after the helper returns |
| `backup-imported-account.test.ts` | `reopenAndRecoverAfterImport` | same page (after `closeStuckPopup`) | none |
| `backup-roundtrip.test.ts` | `reopenAndRecoverAfterImport` | same page | none |
| `helpers/handshake-import.ts` ×2 (used by `import-handshake-note`, `import-handshake-note-matrix`, `same-token-concurrent-sends`) | `lockWallet` | same page | none |
| `imported-account-lifecycle.test.ts` ×2 | `lockWallet` | same page | none |
| `legal-acceptance.test.ts` | `lockWallet`, then `waitForLockScreen` ×2 | same page | the test's `reloadExtensionPage` after the lock landed, then `waitForLockScreen` on the reloaded document |
| `own-window.test.ts` ×2 | `lockWallet(home)` | same page; another window observes the lock itself | none |
| `security.test.ts` | `lockWallet` | same page | closes and opens a new popup after |
| `sw-resilience.test.ts` ×2 | `lockWallet` | same page | one closes, stops the background and opens a new popup after |
| `sw-restart-network.test.ts` | `lockWallet` | same page | closes, stops the background, opens a new popup after |
| `tooltips-glossary.test.ts` | `lockWallet` | same page | closes and opens a new popup after |
| `wallet-lock.test.ts` ×2 | `lockWallet`; `waitForLockScreen` after its own `waitForHash("#/popup/auth")` | same page | closes and opens a new popup after, each time after the auth assertion |
| `network/account-balance-orphans.test.ts` | `reopenAndRecoverAfterImport` | same page | none |
| `network/auto-lock-defers-while-proving.test.ts` | `waitForLockScreen` (auto-lock) | same page | none |
| `network/backup-migration-roundtrip.test.ts` | `reopenAndRecoverAfterImport` | same page | none |
| `network/backup-restore-integrity.test.ts` | `reopenAndRecoverAfterImport` | same page | none |
| `network/connect-locked-queue-sw-restart.test.ts` | `lockWallet` | same page | none |
| `network/connect-locked-queue.test.ts` ×2 | `lockWallet` (password; passkey anchor) | same page | none |
| `network/delete-after-prove.test.ts` | `lockWallet` | same page | none |
| `network/failed-send-check.test.ts` | `unlockAfterBackgroundDeath` | after the event | none |
| `network/firefox-background-restart.test.ts` | `unlockAfterBackgroundDeath` | after the event | none |
| `network/imported-account-execution.test.ts` | `lockWallet` | same page | none |
| `network/incoming-arrival.test.ts` | `lockWallet` | same page | none |
| `network/inflight-call-background-death.test.ts` ×3 | `unlockAfterBackgroundDeath` | after the event | none |
| `network/lock-cancels-dapp-send.test.ts` | `lockThroughConfirmDialog` | same page | none |
| `network/profile-switch-sweeps-transfer.test.ts` ×3 | `lockWallet`, `lockThroughConfirmDialog` | same page | none |
| `network/same-token-concurrent-sends.test.ts` ×2 | `unlockAfterBackgroundDeath` (after the event); `lockWallet` (same page) | as listed | none |
| `network/wallet-locked-mid-session.test.ts` | `lockWallet` | same page | closes after |

No caller needs the helper's reload: every caller either locks the page it passes, or passes a page opened after the background death. D3 applies to all of them unchanged.

## P2a: instrumented reproduction (`account-balance-orphans.test.ts`, Firefox, proverless, retry 0)

Instrumentation (temporary, reverted before the phase commit): a timestamped log of each test stage; for every page `recordPageErrors` attaches, a label (`L<launch>.P<page>`), a 50 ms poll of `page.url()`, its `close` event and each `pageerror`; a line in `openPopup`'s fallback branch; a line in `waitForLockScreen`'s reload branch (the helper otherwise the original); a line when `reopenAndRecoverAfterImport`'s lock lands. Firefox's stderr is timestamped per line on arrival. Contention per the e2e-testing skill: the run under `taskset -c 0,1`, three busy loops pinned to CPUs 0-1 from the moment the run's tests start, killed by pid.

### Run 1 (2026-10-11 14:06-14:10 UTC, contention): **red, reproduced the departure**

- `dist/firefox/assets` listing hash 0918d7dc31b234a1 at tests-start and at the end (unchanged; H3a excluded for this run).
- Launch 3 (`ctx2`), page `L3.P6` (`page2`), route timeline: `about:blank` 14:10:01.555 → `#/` 02.575 → `#/popup/register` 03.087 → `#/popup/import` 03.189 → (restore submitted 04.240) → `#/popup/general` 25.437 → (lock clicked) → **`waitForLockScreen`'s reload branch 25.913**, hash still `#/popup/general` → **`pageerror` 25.982: `Error: Unable to preload CSS for …/assets/auth-CxlUN_c6.css`** (stderr 25.961, raised from the shared chunk that carries Vite's preload helper) → `#/popup/auth` 27.712 (the reloaded document) → `#/popup/general` 29.372 → re-import → close 35.481.
- `openPopup` took its fast path for every page of the run (no fallback line).
- The test failed only at its final `pageErrors` assertion, on that one entry.
- Stderr placement: launch 3's BackupService line at 14:10:03.906, 9.2 s after its arming line and 22 s before the lock (launches 1 and 2: 8.7 s and 6.6 s after arming); no PXE slow-script warning in launch 3.
- Reading: the lock's `/popup/auth` navigation had started loading the `auth` route (its CSS dependency, Vite's preload step, which precedes the chunk's `import()`) when the helper reloaded the document; Firefox fails the departing document's pending load and the router's rejection goes unhandled. This is H1's action on `page2`, in the preload phase of the same route load whose import phase gives the archived text. It is not the archived text, so P2a continues.

### Runs 2-4 (contention)

| Run | Result | Reload branch | `page2` errors | Fallback | dist hash (start = end) |
|---|---|---|---|---|---|
| 2 (14:12-14:16) | green, 2/2 | no (lock landed 0.5 s after the restore settled) | `Client disconnected` (the test filters it) | none | 12bacd42ab276b96 |
| 3 (14:19-14:22) | green, 2/2 | no | `Client disconnected` | none | 42ec8bfaad13bd31 |
| 4 (14:25-14:29) | **red**, 1/2 | **yes**, 14:29:30.245, hash `#/popup/general` | **`Unable to preload CSS for …/assets/auth-CxlUN_c6.css`** at 14:29:30.366 | none | e11e6f2992152a6d |

Each run rebuilds `dist/firefox` before its tests (the port pack is baked in), so the hash differs per run; within a run it is constant. In every run the fresh wallet's first popup (`page2`) boots `#/` → `#/popup/register` → `#/popup/import` and never visits `/popup/auth` before the lock; a popup opened on a wallet with a profile boots `#/` → `#/popup` → `#/popup/auth` → `#/popup/general` (the guard's auth-required gate before the session check settles), so a slow tab on such a wallet can carry an `auth` load. No PXE slow-script warning fell in launch 3 of any run; BackupService fell 6.6-10.2 s after each launch's arming.

## P2b and P2c: forced probes (smoke level, Firefox 153.0.4, retry 0)

Scratch dists under `~/.cache/nulo-backlog/e2e-followups-3/` built from an armed Firefox build (`vite build --outDir`, never `dist/`), loaded through `EXTENSION_PATH`; listing hash unchanged across every probe run. The "mark" dist rewrites the `auth` route's loader in the route table to post `loader-start` (before Vite's preload step), `import-start` (before the `import()`), `import-done` / `import-fail`, each with a per-document nonce, on a `BroadcastChannel` to a sibling probe page; the "hold" dist adds a once-per-tab top-level `await` at the head of the `auth` chunk, released over the channel.

- **Channel control** (mark dist): a marker posted and then a reload in the same task, and a marker posted and then the harness's `page.close()`, arrived 5/5 each.
- **P2b-H1** (hold dist): **5/5 pass.** A fresh wallet, a profile created in the popup document that booted on `register`, then the real `lockWallet(page)` with the original helper. Each trial: no marker from the document before the lock; after it, `loader-start`, `import-start` and `hold-start` (the chunk evaluating, held), no `import-done`; the helper's reload branch fired; the reloaded document posted `loader-start`, `import-start`, `import-done` (unheld) and the hash reached `#/popup/auth` (0.98-1.23 s after the click). No page error was recorded: the held module had finished loading, so the departure meets no load in flight (I3).
- **P2b-H1 controls** (plain armed build, idle host): the reload branch fired in 3 of 5 locks; none recorded an error.
- **P2b-H2** (mark dist, fresh wallet, 10 trials): first form, with the 5 s background hold starting at once: the popup was not ready 2 s after its navigation in 10/10 (hash `#/popup/register`, loader shown), was closed as the fallback does (`page.close()` and its `close` event), and posted **no `auth` marker in 10/10** and recorded **no error in 10/10**. The background evaluation returned only after the hold, and the hold's record was written to the sandbox global, so the plan's "returns at once, asserted" form was not met. The corrected form (hold scheduled 200 ms after the call returns, recorded on the page's `window`) left the popup ready before the hold in 10/10, so those trials do not count. Either way a fresh wallet's first popup never starts an `auth` load (also every P2a route timeline).
- **P2b-H4** (plain build, 10 trials): first form (background hold scheduled 200 ms later) is void: the imports could finish before it began. Second form: 30 cache-busted `auth` imports, then a 5 s busy loop in the same task of the popup page (the extension process's main thread held); in 10/10 every import completed after the hold ended (pending through it), **0 failures, 0 recorded errors**. No rejection without a departure.
- **P2c, reload** (plain build, 30 cache-busted `auth` imports, then `reloadExtensionPage`; every trial had 30 pending at the action):
  - Firefox, idle: 10 counted; 9 recorded 30 `TypeError: error loading dynamically imported module: …` entries each, naming the module of `auth`'s graph whose load the departure failed: `auth-*.js` itself in 3, a dependency in 6 (`spec-*.js`, `browser-surface-*.js`); 1 recorded nothing.
  - Firefox, contention: 10 counted; 9 recorded the same class; **at least one entry naming `auth-*.js` in 7 of 10**; the rest named `spec-*`, `unlockWait-*`, `browser-surface-*` or `PasskeyCeremonyDialog-*`; 1 recorded nothing.
  - Chrome, idle (control): 10 counted, **nothing recorded in 10/10**.
- **P2c, close** (extra evidence, run although P2b-H2 found no marked import): Firefox, idle: 10 counted, 1 void, **nothing recorded in 10/10**, matching the archived probe.

### Run 5 (14:31-14:35, contention): green

The reload branch fired at 14:34:38.523 (hash `#/popup/general`), 0.8 s after the restore settled; nothing was recorded (only the filtered `Client disconnected` before it). dist hash 856c1eca061b9d6c at start and end. Over runs 1-5: the reload branch fired in 3 (1, 4, 5); the preload-phase rejection in 2 (1, 4); the archived import-phase text in none; no fallback anywhere.

- **P2c, close, contention** (extra evidence): 10 counted, **nothing recorded in 10/10**.

## Settlement after probe round 1: panel consult

- **Codex** (gpt-6.1-sol, high, read-only, session 01a12b63): **not settled.**
  - Rule 2 met for H1: the original helper preempted a marked, unfinished `auth` import 5/5, and P2c gave the archived text for that same action.
  - Rule 3 not met: the preload-phase reproduction and P2c's text establish a sufficient mechanism, but neither ties it to the archived instance.
  - The invariant's flaw: "a rejection needs a departure" does not follow from P2b-H4's 0/10; clean H4 trials cannot exclude every no-departure failure. H1 remains strongly supported; H4 unexcluded.
  - Departure audit: `pickFileByTestId` uploads into an existing input and hash navigations keep the document. But `openPopup`'s detach retry also closes a failed attempt page, so the static inventory is broader than `page2` plus the fallback's tab, and new fast-path runs do not establish the archived run's inventory. A restore can push `/popup/auth` before the explicit lock, and a failed lazy load never commits its route, so a timeline without `/popup/auth` does not prove no import started.
  - H2's caveat matters to calling its forced probe passed; it is not the blocker.
  - Path left: an exact P2a reproduction (the import-phase text, with document and action attributed) within the remaining two rounds; otherwise A1.

### P2a pool 5, run 1 (14:35-14:52, unpinned, the archived conditions)

`--shard=5/5` with CI's nine excludes: 21 files selected (`account-balance-orphans`, `backup-import-stalled-network`, `popup-escape-layered`, `scope-refusal`, `_probe-warmup-effect` (a tracked probe, skipped unless `NULO_E2E_PROBE=1`), `backup-migration-roundtrip`, `authwit-variants`, `receive-unregistered`, `multi-account-from`, `sim-from-selfpay`, `session-reconnect-flood`, `send-amount-clamp`, `execute-scope-chain`, `tx-sendTx-feePayer`, `cap-request-rerequest`, `sim-methods`, `wallet-locked-mid-session`, `tokens`, `cap-request-basic`, `session-explicitDisconnect`, `meta-getChainInfo`). 20 passed, 1 skipped; 31/32 tests. Vitest ran `account-balance-orphans` first (its cache held the earlier red runs). It passed: no reload branch, only the filtered `Client disconnected`; launch 3's BackupService line fell 13.0 s after arming, between the restore settling and the lock landing. No fallback in the whole shard. dist hash 424a8052e336b596 at start and end.

- **Opus lens** (Plan, fresh): **settled-H1** through the ordering invariant (inference b), with H4 excluded as a measured premise (P2b-H4 recreates the archived condition, a 5 s block of the same process's main thread, and rule 1 fires only on a positive record). Also: restate H1 as "the helper reloads while any `/popup/auth` load is pending"; the fallback's and the detach retry's closes fall twice (a fresh wallet never resolves the auth component; a close raises nothing); BackupService placement fits H1 at pool pace and excludes nothing.
- **Codex, resumed with Opus's argument**: **unchanged**. A negative forced probe is not an ordering invariant: ten clean trials do not establish that the rejection requires a departure, and rule 1's positive trigger does not make its converse true. Round-2 design: **go, with changes**: (1) order the entry by Firefox's source timestamp, not its delivery time; (2) confirm the reload occurred and tie the entry to the departing document, not the persistent `Page` (the replacement document loads `auth` too); (3) an entry with no reload-branch line before it is not automatically H4: rule 1 needs no departure of the error's document and an unchanged listing; an unexplained entry stays unsettled.
- **Decision**: Codex's reading holds. It is the stricter one, and D-orch-4 says a probe that did not reproduce settles nothing; a clean H4 probe is the same kind of evidence. **Round 1 ends unsettled.** Rule 2 is met for H1 (both legs agree), so D3's fix also removes a sufficient mechanism.

## Probe round 2 (design, agreed with Codex)

- P2a again: the original file instrumented in place and the original helper, **alone and unpinned** (no taskset, no busy loops: the archived run's pace; the archived test took 64.6 s, every pinned run longer). Up to 8 runs, then the plan's second pool-5 run. A bounded revision of the written P2a recipe (unpinned, 8 solo runs), recorded here.
- Instrumentation adds the page's raw BiDi events with Firefox's own timestamps (`log.entryAdded`, `browsingContext.navigationStarted`, `navigationCommitted`, `historyUpdated`, `load`), checked on a smoke probe first.
- **Qualifying reproduction:** on `page2`, a `log.entryAdded` with the exact text `TypeError: error loading dynamically imported module: …/assets/auth-*.js`, whose Firefox timestamp falls after the navigation the helper's reload started (`navigationStarted`, after the reload-branch line) and before that navigation's `navigationCommitted`: raised by the departing document while it was current.
- **Rule 1 (H4):** the `auth` rejection raised with no departure of its document (no navigation of that context between the document's own commit and the entry) and the listing hash unchanged. Anything else unexplained stays unsettled.

### Probe round 2: P2a solo, unpinned (14:54-15:18)

Eight solo runs at the archived pace (no taskset, no busy loops), the original file instrumented in place, the original helper, Firefox 153.0.4, proverless, retry 0. Instrumentation added `page2`'s raw BiDi events with Firefox's own timestamps, checked on a smoke probe first. The dist listing hash was constant within every run.

| run | result | helper's reload | recorded on `page2` |
|---|---|---|---|
| 1-5 | green, 2/2 | no | nothing (only the test's filtered `Client disconnected`) |
| 6 | green, 2/2 | yes | nothing: the departing document committed `#/popup/auth` 15 ms before the reload's `navigationStarted` (Firefox time), so its route load had finished |
| 7 | green, 2/2 | yes | nothing: the same, 17 ms before |
| 8 | **red**, 1/2, `ctx2.pageErrors` deep-equals `[]` (the archived failure's assertion) | yes, 183 ms after the restore settled | `Error: Unable to preload CSS for …/assets/auth-CxlUN_c6.css`, Firefox time 1 ms after the reload's `navigationStarted` and 54 ms before its `navigationCommitted` |

- The loop's stop-grep was miswritten (it matched a quoted `"page-error"` token the log never writes), so it could not have stopped a run. A rescan of every round-1 and round-2 log with a corrected scan (tested on run 8's log and on a synthetic positive and negative) finds no `error loading dynamically imported module` entry anywhere; nothing was missed.
- An edit to the run wrapper while run 4 was executing broke that run's post-run bookkeeping only (the meta lines stayed in a side file); its log, timings and hash are intact.
- Over the 13 solo runs of rounds 1 and 2, the helper's reload fired 6 times: 3 cut the CSS preload phase (round 1's runs 1 and 4, round 2's run 8), 3 landed just after the departing document committed `/popup/auth` (round 1's run 5, by URL polling; round 2's runs 6 and 7, by Firefox timestamps). None landed in the import phase, the phase whose cut gives the archived text.
- Bracketing lines: launch 3's first BackupService line falls 15.3-16.2 s after the test's launch-3 stage line in every run, pinned or unpinned (a fixed timer); the first slow-script warning of launch 3, in the 4 runs that printed one, falls 4.7-14 s after the lock. So the archived rejection, printed before both, lies in launch 3's first ~15.5 s and before its first slow-script warning: consistent with the lock, attributing nothing.
- Build: the `/popup/auth` loader preloads 10 CSS files and no JS (module preload is off); it waits for every CSS file the document has not yet requested to settle, then imports `auth-*.js`, which fetches its JS graph. A departure in the CSS phase gives `Unable to preload CSS`; in the import phase, `error loading dynamically imported module: …/<the module cut>.js`. The archived source differs in no file of the auth page, and the build inputs (Vite configs, `bun.lock`, manifests) do not differ at all. P2c's "`auth-*.js` named in 3-7 of 10" counts trials where at least one of 30 parallel cache-busted fetches named it, on a page with none of `auth`'s modules loaded: it is not the rate for one route import on `page2`.
- Durations: solo runs took 80.0-102.3 s for the file, pool-5 runs 82-83 s; the archived file took 66 s.

### Settlement after probe round 2: panel consult

- **Codex** (resumed, same session): round 3 **go, with one change**: validate the stop scan on an import-phase positive as well as on run 8 as a negative (done: it matches an `…/assets/auth-CG6VbMod.js` line and neither run 8's CSS text nor an `authwits-*.js` line). Run 8: **short**; it strengthens the mechanism, not the archived attribution, and its failing assertion catches any recorded error, so it adds no specificity. A source enumeration of what raises the error **does not count**: it cannot supply the missing exclusions (an I/O or other non-departure fetch failure; `window.stop` would need a reachability exclusion).
- **Opus lens** (fresh): round 3 **change**: size it by fired reloads, not runs, with a cap, and write the expected yield before it starts. Run 8 **short**: the archived failure got past the CSS phase, run 8 failed inside it. The source enumeration **does not count**: "channel cancelled on teardown" alone covers the reload, both closes, `window.stop` and the app's own departures, which only a per-document action record separates. Round 2's last three firing in a row is host-load clustering, not a property of the pace. Corrections taken above (module preload off and build inputs unchanged; P2c's rate; durations).
- **Decision**: both accepted; round 3 as below.

## Probe round 3 (design, agreed with both legs; the last before A1)

- P2a solo, unpinned, the original file instrumented in place, the original helper; round 2's qualifying criterion and rule 1 unchanged; the corrected stop scan.
- **Size:** stop at the first qualifying run, or at 15 fired helper reloads, or at 40 runs, whichever comes first. A bounded revision of the written P2a recipe, recorded here.
- **Expected yield, written before the round:** low. The exact text needs the reload to land while `auth-*.js` itself is being fetched (a 7.6 KB local file, a window of a few milliseconds between the CSS phase and the route's commit); 0 of 6 reloads so far landed there, so even 15 reloads give well under one expected qualifying run. A null result settles nothing and ends the arc on A1.

### P2a pool 5, run 2 (15:19-15:36, unpinned)

`--shard=5/5` with CI's nine excludes: 20 passed, 1 skipped (the tracked `_probe-warmup-effect`) of 21 files, 31 tests; `account-balance-orphans` first, green in 82.3 s; the helper's reload did not fire; no page of any launch recorded an error (beyond the test's filtered `Client disconnected`); dist hash c96cf2d0cf6ac20e at start and end. Round 2 ends with no qualifying reproduction.

### Probe round 3: P2a solo, unpinned (15:36-16:43)

23 runs, stopped at the first qualifying one; the helper's reload fired in 2. Runs 1-22 green, 2/2 each, nothing recorded on `page2` (corrected scan). Run 19: the reload's `navigationStarted` came 22 ms before the departing document committed `#/popup/auth` (and before the reload's `navigationCommitted`): the route load finished inside the reload's start, nothing cut, nothing recorded.

**Run 23 (16:41-16:43): the qualifying reproduction.** Red, 1/2: `ctx2.pageErrors` deep-equals `[]` (the archived failure's assertion). dist hash 9c3edefd0c1eacd0 at start and end. `page2` (`L3.P6`), the only page of launch 3, opened on `openPopup`'s fast path (no fallback line). Its event sequence (Firefox timestamps, ms since the epoch):

| Firefox ts | event on `page2` |
|---|---|
| …957560 / …957661 | `navigationStarted` / `navigationCommitted` of the document (`src/popup/index.html`) |
| …958118 | `#/popup/import`: a fragment navigation (same document) |
| …967055 | `historyUpdated` `#/popup/general` (the restore settled) |
| (harness 16:42:47.313) | the helper's reload branch, hash `#/popup/general` |
| …967319 | `navigationStarted` of the reload (a new-document navigation) |
| **…967320** | **`log.entryAdded` `TypeError: error loading dynamically imported module: moz-extension://…/assets/auth-B5oTbTSq.js`** |
| …967365 | `navigationCommitted` of the reload |
| later | the reloaded document lands on `#/popup/auth` |

No other new-document navigation of `page2` between its commit and the entry, and no close; the entry is raised by the departing document while it is still current, 1 ms into the helper's reload. It meets round 2's qualifying criterion element by element (exact text naming `auth-*.js`, `page2`, after the reload's `navigationStarted` and before its `navigationCommitted`, listing hash unchanged); rule 1 does not apply (the entry has a departure).

## Phase 2 settlement

- **Rule 3 met: P2a reproduces the archived instance with the lock helper's reload** (`waitForLockScreen` reloading while the lock's `/popup/auth` route load is in flight). Rule 2 was already met for that action (round 1). Rule 4: **settled, H1.** The archived rejection is the harness's own departure surfaced by the relay, not a product or Firefox fault; no issue is opened.
- The same action also yields the preload-phase text (`Unable to preload CSS for …/auth-*.css`) when it lands earlier in the route load: 3 of the 8 reloads over the three rounds; 1 landed in the import phase (run 23); 4 landed at or after the route's end and cut nothing.
- **Fix: D3** (the helper becomes observational; it never reloads). It removes the mechanism, whatever the phase.
- **Codex** (resumed, same session), asked to attack run 23 against the agreed criterion: **settled-H1**, high confidence; every element met (exact text naming `auth-*.js`, `page2` of launch 3, Firefox source timestamp 1 ms after the reload's `navigationStarted` and 45 ms before its `navigationCommitted`, no intervening document navigation or close, listing hash unchanged); rule 3 met by reproduction, so attribution no longer rests on the disputed exclusion invariant; rule 1 does not apply.

## The fix (D3) and its proof

- `waitForLockScreen` observes: it waits for the session record to leave `chrome.storage.session`, then for `/popup/auth` within the 15 s it already gave the hash, and never reloads. `lockWallet`'s doc now describes the chip as it is (it awaits the session handle and a read of the running sends, marks the popup locked, sends the lock unawaited; the background's lock event routes to `/popup/auth`); `reopenAndRecoverAfterImport`'s doc drops the reload bullet (lock and unlock run in one document). `reloadExtensionPage` stays imported for `seedUsdQuoteAndReload`.
- FIREFOX.md's dynamic-import row names the CSS-step variant and `waitForLockScreen`'s rule beside `openPopup`'s fallback.
- **Forced probe against the fix** (hold dist, listing hash ed6eb667bc8ca691 before and after, Firefox, the hold released 3 s after it started, while `lockWallet` waited): **5/5 pass.** Each trial: `loader-start`, `import-start`, `hold-start` on the locked document; no reload (the same document throughout); `hold-released` and `import-done` at 3.1-3.5 s; the lock landed on `#/popup/auth` in that document 3.1-3.6 s after the click; nothing recorded.

## Phase 2 gate (PASS)

Every command at retry 0. The callers ran the observational helper plus one temporary diagnostic line (an append of the session-clear-to-landing time to a scratch file, no behaviour change), removed before the commit.

- Fast: `lint`, `typecheck:all`, `test` exit 0 (740 files passed, 3 skipped). Relay units: 3 files, 96/96.
- Smoke (file), armed build right before each: Firefox 2 files, 3 tests passed; Chrome 2 files, 3 tests passed; `dist` listing hash unchanged across each run.
- Network (file), proverless: Firefox 3 files, 6 tests passed (`account-balance-orphans` 2, `inflight-call-background-death` 3, `firefox-background-restart` 1); Chrome 2 files passed, 5 tests, 1 skipped (`firefox-background-restart`, its pre-existing Firefox-only `skipIf`); hash unchanged within each. A first network attempt ran no test (zsh passed the three paths as one filter argument; vitest found no file) and is void.
- Session clear to `/popup/auth`, per caller (ms): Firefox `backup-roundtrip` 69, `wallet-lock` 55 and 47, `account-balance-orphans` 257, `inflight-call-background-death` 46, 44, 45, `firefox-background-restart` 47; Chrome `backup-roundtrip` 3, `wallet-lock` 3 and 2, `inflight-call-background-death` 203, 202, 2, `account-balance-orphans` 216. Every redirect landed; the slowest used 1.7% of the 15 s budget.
- Clean-up: every `_probe-*` file and scratch dist deleted, every temporary edit reverted; `git status` shows only the helper, FIREFOX.md and the plan's own files.
