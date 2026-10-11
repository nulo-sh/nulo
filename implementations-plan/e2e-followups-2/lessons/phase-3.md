# Phase 3: Firefox sees extension-page errors (#281)

All runs at retry 0 on armed smoke builds (`VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1`, rebuilt after the Phase 2 network runs), Firefox 153.0.4, puppeteer-core 25.8.0.

## Red before the driver change, green after

- `tests/e2e/page-error-capture.test.ts` at e04178a (no relay): Firefox ✗ at its barrier, `expected +0 to be 1` (`ctx.pageErrors` empty, while Firefox's stderr printed `JavaScript error: moz-extension://…/src/popup/index.html#/popup/general, line 1: Error: NULO-PAGE-ERROR-A-THROW-…`); Chrome ✓ (1/1, 6.9 s), the self-close and web-page cases included.
- With the relay wired: Firefox ✓ (1/1, 8.7 s). The launch's close check passed, so the extension process reported ready and nothing faulted.

## Deviations from § Architecture

- **The relay's state is read through an observer topic**, not a window slot as `firefox-rpc-intercept.ts` keeps its observer: the relay outlives every browser window by design, and a read through a notification needs no window to hold a handle.
- **`close()` runs once.** A second `ctx.close()` (the CSP latch calls the driver's close again on a second close) returns the first one's outcome; without it the relay read would fail on the ended session and turn a harmless second close into a failure.
- **A record from a window already gone is dropped in the content process** (optional chaining up to `document`), the same class the relay drops in the parent for a closed page: neither browser has a listener left to hear it. Any other throw while reading the principal is a fault.
- **One `unsafe filename` line per launch on stderr.** The parent process refuses the `data:` process script under its system principal; every probe in Phase 0 printed it too. It is why Probe 7 found process scripts never run in the parent, and the relay runs in a sandbox there. Recorded at the code.
- **The close check judges every extension process the launch saw**, not only the live ones: the relay records each through `ipc:content-created` and `process-type-set` (the subject and data Firefox's own `ExtensionProcessCrashObserver` reads), seeded from `getAllDOMProcesses()` when armed. From review round 1.
- **The listener judges the window that raised the message** (`isCurrentGlobal && !windowContext.isInBFCache`, Firefox's own `active` test in `ExtensionCommon.sys.mjs`), not the principal of whatever document its tab shows when the record is made. No observed case changed (A/B below); it closes a latent misattribution.

## Review round 1

- Codex (`gpt-6.1-sol`, high, read-only), `changes-requested`, five findings. **1 rejected** (the receipt read is not bounded by `timeoutMs`): the old helper awaited each read unbounded too, the test timeout bounds it, and the diagnostic read runs only after a deadline the node answered every poll of. **2 accepted** (an exited, never-ready extension process passed the close check). **3 accepted** (the control polled for its console error and could not see a console error routed to the other page): the console nonce now meets the same barrier as the throw, and each page's console errors are checked on that page; Puppeteer 25.8 emits `console` synchronously on CDP (`Page.#onConsoleAPI`) and BiDi (`bidi/Frame.js`). **4 accepted** (the relay comment claimed an ordering it does not establish). **5 partly**: two narrating comments and the network test's header deleted, the module header shortened; `RELAY_HELPERS`' line kept (the relay runs the unit-tested code).
- Opus (general-purpose), `changes-requested`, six findings: 2 and 3 duplicate Codex's 3 and 2; 1 is this file's gate (below). **4 accepted as a documented limit**: the close read has nothing ordering it after a content process's last message; FIREFOX.md says so, no flush round-trip. **5 accepted**: the revert and drop cases match the SDK's wording for their own hash. **6 accepted**: two comments corrected (`Unchecked runtime.lastError` arrives on Chrome only; `waitForTxMined` also rejects when a receipt read fails). No fail-open path found.
- Commit d9249ad. The control re-run after it: Chrome ✓ (1/1, 8.1 s), Firefox ✓ (1/1, 13.8 s).

## Smoke (full), Firefox, run 1

Started on d4398b3 before the round-1 edits; files that loaded after an edit ran the edited harness, so the run counts as evidence for the triage only. 50 passed, 1 failed, 1 skipped files (209 passed, 1 failed, 12 skipped tests), 29 min.

- **Newly recorded:** `sw-resilience.test.ts` › "extension survives SW stop+respawn": `TypeError: error loading dynamically imported module: …/assets/spec-*.js` in `pageErrors`, no stack (`line 0`).
- **Diagnosis.** A labelled copy of the test (each page's `pageerror` with timestamps, `framenavigated`) reproduced it in 1 of 6 runs: the error came from the second popup (`#/`, not closed), at the moment the page navigated to `about:blank`. After `stopBackground` the cold boot outlasts `openPopup`'s 2 s fast path, so its fallback navigates the same tab to `about:blank` and loads the popup again, while the auth route's lazy chunk (`PasskeyScreen`, which pulls `spec-*.js`) is still loading.
- **Mechanism, deterministic probe.** 30 uncached `import()`s of an extension chunk, then a navigation: Firefox printed 30 rejections every run. Navigating to another extension page recorded 150/150 over 5 rounds with either listener version; to `about:blank`, 30/30 or 0/30 depending on whether the report came before the commit. The rejection comes from the left document while it is still current. Chrome's required smoke never records one.
- **Disposition: harness cause, fixed** (c0be903). `recordPageErrors` returns a detach function; the fallback detaches before leaving and re-attaches once `about:blank` has loaded, without resetting the arrays, so what the abandoned document raised before stays recorded. Probe of that ordering: 30 rejections on stderr, 0 recorded, 6 of 6 runs. With a fast path that succeeds, nothing changes. Not a filter by text, URL or count: the fixture stops listening to a document it chose to abandon. The class beyond the fixture (a spec that itself leaves an extension page mid-boot) is a FIREFOX.md row; none surfaced in this run.
- Every other file passed with the relay on. A test that does not read the arrays shows nothing it recorded, so Firefox's stderr, which prints every script error of every context, is the inventory of the run's `pageerror` kind (a native `console.error` never reaches stderr; the array checks are the only evidence for those):
  - `NULO-PAGE-ERROR-*` ×6 in `page-error-capture.test.ts`: the control's own.
  - `Error: Client disconnected` from `assets/client-*.js` ×311, 294 of them in `sw-resilience.test.ts`: pending RPCs rejected when a client disconnects, there mostly in the background's PXE frame as `stopBackground` ends it (no BiDi id, so the relay drops it). No check failed on one.
  - `NS_ERROR_NOT_INITIALIZED` from `assets/client-*.js` ×15 in `passkey-retry`, `passkey-toolbar-panel`, `import-errors-scroll` and `tooltips-glossary`: no check failed on one.
  - `error loading dynamically imported module` ×1 (printed with no file, `line 0`): the failure above.

## Review round 2

- Codex (resumed), `changes-requested`, three findings on c0be903's fallback fix. **1 accepted, another fix**: detaching both listeners until `about:blank` loaded also dropped, on both browsers, any console error or exception raised meanwhile. Confining it to Firefox inside `openPopup` would break the seam rule (no browser test in `fixtures/**`), so the fallback no longer navigates the slow tab: it detaches its recorder, closes it and loads the popup in a fresh tab, leaving the arrays as they were. A closed page delivers nothing more on either browser. **2 accepted as moot** (a record queued before the detach could land after the re-attach): nothing re-attaches now. Its proposed parent-side re-check was rejected: it would drop an error raised while its document was current and delivered after the commit, which Chrome records. **3 accepted**: two comments (the relay's overclaim; the recorder's, which also cited an archived plan).
- Commit ed05853. `sw-resilience.test.ts`, which takes the fallback after each background kill: Firefox 3/3 green (4 fallbacks a run), Chrome 2/2 green (2 a run), no cancelled import.

## Review round 3

- Codex (resumed), `changes-requested`, two findings on ed05853, both **accepted**. **1**: Puppeteer 25.8's BiDi `Page.close()` catches and discards the close command's error (`bidi/Page.js`), so a failed close let the fallback open its fresh tab beside a live one; the fallback now waits for the page's `close` event, bounded at 10 s (`closeConfirmed`). `isClosed()` is still false right after `close()` resolves on Firefox (0 of 5), so the event is the proof. **2**: detaching the recorder before the close could lose an error already on its way. Probe: closing a popup tab with 30 uncached imports in flight raised nothing on Firefox, 0 on stderr and 0 recorded, over 15 closes with the listener attached. So the recorder stays on through the close, and `recordPageErrors` no longer returns a detach function.
- Commit 5a89d52. `sw-resilience.test.ts`: Firefox 2/2 green (3–4 fallbacks a run), Chrome 1/1 (2); `page-error-capture.test.ts` green on both.
- Round 3 was the plan's last; its findings were consequences of round 2's fix, so two scoped passes followed (D16).

## Passes 4 and 5 (scoped, past the cap)

- Pass 4, over 5a89d52 only: the recorder change resolves round 3's second finding; **one new finding, accepted**: the 10 s bound started only after `page.close()` settled, so a close with no protocol answer waited out the protocol timeout first. The bound now covers the request and the event together (09659e9). **Declined**: bounding `openPopupOnce`'s re-close after a failed confirmation (that catch predates the branch, and the test's own timeout ends the test while it waits), and a regression test with a never-settling `close()` (it would export a fixture-internal three-line race for a fake page). `sw-resilience.test.ts` on Firefox green after it (4 fallbacks).
- Pass 5, over 09659e9 only: "No new material findings", `VERDICT: approve`. The loop converged there.

## A full Chrome smoke voided by my own runs

Started alongside Firefox run 2 because `openPopup` changed. Six failures in its first 25 files, each while I ran a Chrome file of my own from the same worktree; all six files pass alone (3 + 2 files, 11/11 tests). Cause: `global-setup-smoke.ts` runs `pkill -f "chrome.*--load-extension=<dist>"` at start, so every smoke run kills every Chrome loading the same `dist/chrome`. Stopped and discarded; Chrome's full smoke reruns alone. Firefox's setup has no such reap.

## Smoke (full), Firefox, run 2

Started on c0be903; the fallback changed under it (ed05853, 5a89d52), so it counts as evidence, not as the gate. 51 passed, 1 skipped of 52 files (210 passed, 12 skipped of 222 tests), 0 failed, 29 min. Firefox's stderr: `Client disconnected` ×18 (311 in run 1, 294 of them in `sw-resilience`; not investigated), `NS_ERROR_NOT_INITIALIZED` ×15, the control's own ×6, no `error loading dynamically imported module`. No newly recorded error.

## `wait-for-tx-mined.test.ts` after the assertion change

Chrome, proverless, retry 0: 1/1 file, 3/3 tests. Firefox runs it in N-full's pool.

## Gates
