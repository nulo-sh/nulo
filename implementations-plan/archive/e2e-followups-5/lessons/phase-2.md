# Phase 2: #322, the capability window and the recursion

Implementer session, 2026-10-12. Measurements run on the base product source: the five files the #319 fix touched are restored from `208f5f4` in the working tree for this phase (the harness is HEAD's, which differs from base only in `security.test.ts`). The probe is a throwaway patch under `~/.cache/nulo-backlog/e2e-followups-5/` (`apply-probe-322.py`), `nulo:probe:` sentinel throughout. Firefox builds are armed for smoke and copied to their own non-prefixing `EXTENSION_PATH` directory; `e2e:agent` runs build from the probed tree.

## Step 1: the probe and its dumps

- **Background** (synchronous buffer `nulo:probe:buf`, read once by the inventory): the `requestCapabilities` handler's entry, its accounts read and its ask; the interaction service's entry, `ensureInitialized`, the session lookup and the protocol addresses; the `interaction()` lock with the request id; the window manager's open, bounds anchor, create (window and tab ids), create failure, removal and settle.
- **Pages**: a `nulo:probe:doc` console call at the end of the console sniffer (the first module every page runs) and a `nulo:probe:mounted` call after the popup mounts; both carry `location.href`. A hash carrying `nulo-probe-throw` makes the popup entry throw at module evaluation (I3).
- **Relay listener copy** (`firefox-page-errors.ts`): every error-level `nsIScriptError` from an add-on frame and every `nulo:probe:` console call, with the document URL, top-level or not, browsing-context ids, line, column and the SavedFrame stack (depth, first and last 20 frames); the parent stores each with its BiDi id (or none) and never emits it.
- **Seam** (`firefox.ts`): every synthetic close `watchForSilentCloses` reports, and an inventory (targets, BiDi open contexts, synthetic closes, classic handles, classic windows with URLs, relay records, background buffer), raced against 5 s, written in `waitForTarget`'s timeout branch before the throw and at every launch's close.
- Proved with `page-error-capture.test.ts` on Firefox: green; the close inventory held the targets, contexts, handles, windows and relay records, and each of the test's three page errors carried its document, line and column and its BiDi context. First pass: the document URL read empty (`WindowGlobalChild` exposes no `documentURI`); now read from the context's document. A plain launch already records 8 synthetic closes, so a synthetic close alone is not W2.

## Steps 2 and 6: the forced throw (I3) and R3

**R3** (probe build, Firefox, `taskset -c 0,1`, 2 launches × 50 fresh popup windows, window 0 of launch 0 forced to throw at module evaluation): **100 windows, 99 listed and mounted, zero recursion records.** The only miss is the forced throw.
- First attempt discarded (probe fault, not counted): the marker sat in the hash, and the router's first redirect (`#/popup/general?m` → `#/popup/general`) rewrote it, so one plain window looked unlisted although its context, its classic handle and its `targets()` entry were all there under the rewritten URL. The marker moved to the query, outside the hash.

**I3 is refuted: a window whose module throws at load is listed in `targets()`, but as `about:blank`.** Its context is open in BiDi and in the classic handle list, with its real URL there, and the relay saw its error with a BiDi id; `waitForTarget` never matched it.

**Why, read off the BiDi stream** (a probe on the shim recording every `browsingContext.*` event, `r3b`, 3 windows): for each popup window Firefox sends `contextCreated` (`about:blank`), `navigationStarted` and `navigationCommitted` with the real URL, and **no `domContentLoaded` or `load`**. Puppeteer 25.8's BiDi `BrowsingContext` updates its URL only on `domContentLoaded`, `load`, `historyUpdated` and a fragment navigation (`puppeteer-core/src/bidi/core/BrowsingContext.ts`), never on `navigationCommitted`. A healthy window becomes visible when the router's first history write emits `historyUpdated` (300-500 ms after commit here); a document whose app never runs its router stays `about:blank` for good. That is W4, and it is exactly what a page that fails module evaluation produces.

## Steps 3 and 4: R0 and R1, the CI replay

The exact replay (`send-chaos.test.ts`, Firefox, seed 1960252198, proverless, retry 0) through `e2e:agent` on the probed base tree:
- **R0**: 1 run, green, no `too much recursion` line.
- **R1**: 4 more as is and 5 under `taskset -c 0,1`: **9 of 9 green, no recursion line.**
- The logs carry Firefox's own `JavaScript error:` lines (24-28 per run: `ConduitsChild`, `FormHandlerParent`, the relay's `unsafe filename`), so a recursion would have shown; the background buffer recorded each run's capability path end to end (`cap:handler-in` through `cap:ask-done`, five `int:locked` and window opens). One `Client disconnected` from `client-*.js` in R1 run 1 is the worker-restart cascade the launch fixture already drops.
- CI itself passed the same seed on its retry (lessons/phase-0.md), so a green replay is the expected majority outcome.

## Step 5: R2, cold capabilities windows

`_probe-cap-window-cold.test.ts` through `e2e:agent` on Firefox, proverless, retry 0, `taskset -c 0,1`: 20 fresh launches, each registering, connecting the playground and granting the accounts capability once. **20 of 20 found and granted, no recursion line.**

## Step 7: classification

| Question | Floor | Natural record | Forced record | Reading |
|---|---|---|---|---|
| The missed window | R0 1, R1 9, R2 20 cold capability windows, R3 99 cold popup windows (plus the forced throw) | none missed | a document that throws at module evaluation is listed in `targets()` as `about:blank` for good (W4) | W4 is sufficient; it explains the CI sample only if the recursion broke that window's module evaluation (I2), which no run recorded |
| The recursion | the same | none | none | unanswered: no document, no stack, no column |

## Step 8: consults on the classification

- **Codex** (gpt-6.1-sol, high, session `01a1306f-95f6-7551-9935-6dc389d29af9`): Q1 W4 sufficient, but the CI miss is not attributable to it (W0-W3, W5, W6 unexcluded); R3 is 99 natural windows plus the forced throw (corrected above). Q2 conditional approve of a W4 seam fix with corrections: the full identity fence with liveness from Firefox's own scope; keep `Target` identity during predicate evaluation (a stand-in breaks `before.has(t)`); reconcile `waitForPopup`'s `preExisting` snapshot; compare the `moz-extension` host explicitly; prove it with a capabilities URL. It called avoiding a synthetic `historyUpdated` right, without an argument. Q3 land a bounded D4 too, and give a script error with an empty stack its own source, line and column. Q4 record the next-occurrence checklist on the issue.
- **Opus lens** (general-purpose, opus): Q1 the brief's timing was backwards: teardown logged at 05:02:18.3, so the 60 s wait was armed by about 05:01:18.3 and the recursion (05:01:18.59) came 0.3 s after it, around the click, which keeps I2 possible; W1 (`FIREFOX.md`'s unannounced-tab row, load-sensitive, 4 of 6 on CI) and W2 (the plain launch's 8 synthetic closes were never checked against Firefox's own scope) stay live. Q2 conditional approve as its own decision, `Refs #322`: the mechanism is recorded naturally (no `load` for any popup window) and has already cost the suite the licences tab (`FIREFOX.md`, `waitForOpenedUrl`). It names the two holes Codex named, and proposes the smaller design: the shim injects `historyUpdated` with the committed URL for a top-level context it has seen announced, the pattern of its injected `contextDestroyed`. Puppeteer consumes `historyUpdated` only to set the URL and in `waitForNavigation`, which no e2e file calls, so identity, every predicate and every `targets()` reader stay consistent; iframes and unannounced contexts excluded. Q3 land D4, printing the relay's records for the missed window even when Puppeteer knows its context; the location fallback is one line. Q4 record on #322: the corrected timing, W1 and W2 live, and that mapping "line 5" needs the CI build's sourcemaps at the same chunk hash; open an issue for approval windows' page errors, which reach no array on either browser.
- **Decision (D16):** Opus's design. It meets Codex's corrections 2 and 3 by construction. Its first and fourth are answered differently: the injected URL is Firefox's own report for that context at that moment, so the seam adds no acceptance rule (each caller's predicate still decides), and the gate is a context the shim saw announced, still open and not reported closed, committing an add-on page (`moz-extension:`), the class Firefox withholds `load` events for. D4 and the location fallback land with it. #322 stays open.

## Steps 9-11: the harness fix and its proof

- Commits `264a638` (the shim's committed-URL update, D4's report, the relay's location fallback, `waitForOpenedUrl` retired, FIREFOX.md) and `c792d71` (the e2e skill's ledger row 54).
- **Red on base** (`scripts/e2e/firefox-driver.test.ts`, 7 new tests): with the three base fixture files in place every new test fails (`trackContexts is not a function`, and the missing `withInventory` and `errorFrames`); a mutant that forwards a commit without the update fails exactly the update test (`expected [] to deeply equal [ { type: 'event', … } ]`). Restored: 52 of 52.
- **Browser proof** (Firefox, a throwaway build whose popup entry throws when its hash names a marker, `_probe-w4-proof`): on the fix, the forced-throw `#/windows/capabilities?requestId=…` window and the `text/plain` licences tab are both found by `waitForTarget` with their URLs; on the base fixtures both miss for 15 s. A forced `waitForTarget` failure printed the report: Firefox's four windows with their URLs, BiDi's four open contexts, Puppeteer's four pages, six closes the watch reported with their ages, and the forced throw among the relay's exceptions with its BiDi context. A first version listed every add-on error and filled its 20 slots with the background logger's `console.error` lines; it now keeps exceptions only.
- Step 10 (re-running the stage that reproduced, on the fix): no stage reproduced, so the forced proofs above stand in; none of them settles #322.
- Probes removed; `git status` clean outside the plan directory; the throwaway forced-throw build lives only under `~/.cache/nulo-backlog/e2e-followups-5/`.

## Step 12: the gate, stopped and moved to the final head

- Lint, typecheck:all and `bun run test` on `264a638`: exit 0. The first `bun run test` had one red, `owned-processes.test.ts` › "a zombie owner is dead to the identity check and to the reap" (`ENOENT` reading `/proc/<pid>/stat` after the SIGKILL), a file this branch does not touch; it passed alone three times and in the next full run (742 files, 11,358 tests). Filed as its own issue at close-out.
- The certification chain started on `264a638` and was stopped after 3 of its 10 replays (all green, no recursion line): the post-implementation review (started early, read-only, beside the chain) found that the new failure report moved focus mid-test (lessons/phase-3.md, round 1), and its fix changes the fixture files every Firefox run loads. The stop was ownership-checked: vitest's teardown removed anvil, aztec and the playground; the orphaned worker and its geckodriver and Firefox carried this worktree's marker and were stopped by their own group. The whole Phase 2 gate runs once on the final head instead.
