# Phase 0: recon, measurements, consults

All probes ran at 29d9e49 from scratch files under this plan directory that were never committed, and were deleted before the plan commit. Firefox 153.0.4, puppeteer-core 25.8.0, geckodriver on `PATH`, `@aztec-labs/*` 6.0.0-rc.1. Smoke probes ran on an armed Firefox build (`VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run build:firefox`) through the smoke config with `retry: 0`. The network probe ran through `bun run e2e:agent` (ports claimed in `~/.agents/ports.md`, released at exit).

## #281: which source of extension-page errors works on Firefox

**Probe 1: a listener in the parent process (the issue's first candidate, as filed).** `Services.console.registerListener` armed once through `chromeScript`. Two popups at the same URL; popup A ran a timer throw, an unhandled rejection, a primitive rejection, a native `console.error` and an unchecked `chrome.tabs.get` error.
- The parent received A's throw, rejection and primitive rejection, plus `Unchecked lastError value: Error: Invalid tab ID`. Every copy had `innerWindowID: 0`, so it had no window to map to a page. The `sourceName` is the URL the error names, which two popups share, and for an evaluated script it is `pptr:evaluate…`.
- `isPromiseRejection` was false on the parent's copy of the rejection.
- The native `console.error` reached no `nsIConsoleService` listener: console-API calls go to `ConsoleAPIStorage`.
- Verdict: not attributable. A URL filter cannot tell two pages apart, which is the issue's own warning.

**Probe 2: the same listener inside the extension process.** `Services.ppmm.loadProcessScript(<data: URI>, true)` registers the listener in every content process (the extension process already existed when it was loaded). Each error is sent to the parent with `WindowGlobalChild.getByInnerWindowId(id).browsingContext.top.id`. The parent maps that to `NavigableManager.getIdForBrowsingContext(...)` and appends one JSON line per error to a file (`IOUtils.writeUTF8(..., { mode: "append" })`).
- Every throw, rejection and primitive rejection carried the page's own window id. Page A's errors mapped to A's Puppeteer context id (`Frame._id`) and page B's to B's, though both were at one URL.
- After `reloadExtensionPage(A)`, A's next throw mapped to A's id again, under a new inner window.
- `isPromiseRejection` was true on the rejections. The process-to-relay delay was 0-5 ms.
- `Unchecked lastError value` and Firefox's own `sendRemoveListener on closed conduit` noise carry window id 0 in the extension process too: unattributable, dropped.

**Probe 3: the whole chain, three runs.** The relay file was tailed every 50 ms from Node, and each line was injected into Puppeteer's connection as a BiDi `log.entryAdded` event. A `javascript` entry was used for a script error; a `console` entry with method `error` was used for a console-API message, which a second listener sent from the content process's `ConsoleAPIStorage`. The fixtures' own listeners did the rest.
- 3 of 3 runs: `ctx.pageErrors` = `["Error: A-THROW", "Error: B-REJECT", "uncaught exception: B-PRIMITIVE", "Error: A-AFTER-RELOAD"]` and `ctx.consoleErrors` = `["B-NATIVE-CONSOLE"]`.
- Page A's own `pageerror` listener heard only A's errors, before and after its reload, and page B's only B's.
- The popup's boot added nothing to either array.
- Text is Firefox's own wording, which its BiDi gives a web page: `Error: <message>`, `uncaught exception: <primitive>`.

**Probe 4: what an in-build or test-injected recorder could do (the issue's second candidate).**
- Page-level `error` and `unhandledrejection` listeners in the popup heard the throw, the rejection and the primitive rejection. The app's own `onunhandledrejection` left `defaultPrevented` false.
- They cannot hear the unchecked `lastError` either, and they hear nothing that a native console call logs.
- `page.exposeFunction` (a BiDi `script` channel) does deliver from an extension page.
- `page.evaluateOnNewDocument` (a BiDi preload script) did not run after a reload: Firefox does not apply preload scripts to extension contexts. So a test-side recorder must be installed after each document loads, and it misses boot errors and every navigation the app makes on its own.
- An in-build recorder avoids both gaps only in builds armed for it. The release and nightly artifact smokes run unarmed builds, so their Firefox `pageErrors` would stay vacuous there.

**Decision input.** Candidate A, moved into the extension process, is reliable (3/3), attributes exactly, survives reloads and covers boot errors. It needs no build change and uses only the system access the Firefox session already holds. Candidate B works only where the build was armed and installed per document. D1 in `plan.md` carries the panel's argument.

**Probe 6: is a file relay an ordering barrier? (run after Codex's round-1 blocker.)** One popup, 30 trials per kind, for each of two parent write modes: a synchronous append (`FileUtils.openFileOutputStream`, `MODE_APPEND`) and Probe 2's async `IOUtils` chain. Each trial was one `page.evaluate` that raised the error in a timer, then settled. Node read the file after the `await` returned.
- Sync append: throws 30/30 and console errors 30/30 were on disk; rejections 11/30. Async chain: throws 16/30, console errors 30/30, rejections 5/30. Everything was on disk a second later.
- **Superseded by Probe 7, and weaker than it looked.** The trial queued its settling timer *before* the error, so the page could answer before it reported the error. And Node read the file after handling the response, not when it arrived. So it measured "on disk within the response's transit time", not "ordered before the response".

**Probe 7: emit `log.entryAdded` straight onto Firefox's own BiDi socket (Opus audit F5).**

Setup:
- A content-process script, filtered to windows whose own `document.nodePrincipal.addonId` is `wallet@nulo.sh`, sends each error to the parent.
- The parent relay maps it to the context id and calls `RemoteAgent.webDriverBiDi.session._onMessageHandlerProtocolEvent(_, { name: "log.entryAdded", data })`. That is the same session and socket Puppeteer reads.
- Each trial's settling timer is queued *after* the error's task, so the page reports the error before it answers.
- Two runs, 30 trials per kind each. The fixture arrays were read on the line right after the `await`, with no wait.

What failed on the way (each run is in the probe logs):
- `loadProcessScript` never runs in the parent process, so Opus F1's fix as written (the parent listener in the process script) does not work.
- `WindowGlobalChild.documentPrincipal` is undefined in a content process. The window's `document.nodePrincipal` is what Firefox's own `isExtensionContext` reads.
- A chromeScript-scoped function is tied to that browser window's sandbox. A fresh `Cu.Sandbox(systemPrincipal, { wantGlobalProperties: ["ChromeUtils"] })` with `evalInSandbox(..., "resource://…")` lives independently of any window. A `data:` filename is refused ("unsafe filename"). It has `Services` but no `BrowsingContext` global, so the relay reaches it through `Cu.getGlobalForObject(NavigableManager)`.

Results, identical in both runs:

| Kind | In the array on the next line (no wait) |
|---|---|
| uncaught throw | 30/30 |
| native `console.error` | 30/30 |
| unhandled rejection | 15/30 (all by the end) |

- Each page's own `pageerror` listener heard only its own errors, before and after a reload. 0 relay faults.
- Every JS exception (throw, `Error` rejection, primitive rejection, a `chrome.tabs.get` promise rejection) carried `hasException: true` and category `content javascript`. Firefox's own BiDi turns **every** error-flag `nsIScriptError` into a `javascript` entry, whatever its category (`windowglobal/log.sys.mjs`). Chrome sends only exceptions to `pageerror`.
- Messages from the background page (an add-on principal, but no tab context) reached the parent and found no context, so they were dropped. This matches Chrome, where no page listener sees the service worker or the offscreen document.
- Rejections: Firefox reports an unhandled rejection after the task that dropped it. The page had not reported it when it answered, so no listener could have seen it. Firefox's own BiDi has the same timing for a web page.

**Decision input.** The socket relay is ordered with command responses by construction: one IPC channel from content to parent, and a synchronous emit in the parent's handler. It needs no file, tail, Node-side parser or polling. It replaces D6's file channel.

**Probe 8: the final pass's three cases (socket relay of Probe 7, one run).**
- **Throw, then self-close in the same task.** A second extension page called `window.close()` and threw in the same task. Its own `pageerror` listener heard the throw once. The driver had not yet reported the page closed: its silent-close poll needs at least two 150 ms reads.
- **A web page (`about:blank`).** A throw reached its listener once, in Firefox's own wording, with nothing from the relay. Firefox's BiDi serves that page, and the principal filter kept the relay out.
- **A non-exception error.** A missing same-origin `<script>` in a popup reached neither array on Firefox. Its console message never reached the content listener with an extension window. Chrome reports the same load as a `console` error (`Failed to load resource`), so this is a narrower Firefox gap, recorded in `FIREFOX.md`. No extension-page message was found that both browsers raise as a non-exception error, so D8's regression target is a unit test of the classifier.

## #280: a mined tx whose public part reverts

**Probe 5, network, Chrome build, one run (`bun run e2e:agent --dir <probe dir> <probe file>`).** The script wallet (`createTestWallet`, minter account, SponsoredFPC fee) sent `transfer_public_to_public(minter, random, 10^30, 0)`, which is more than any balance the run mints.
- Through `EmbeddedWallet.send()` the send was refused before proving: `Assertion failed` (its pre-simulation).
- Through `BaseWallet.prototype.sendTx` (prove and send, no public simulation) the node accepted it. 4.2 s later the receipt read `status: "proven"`, `executionResult: "reverted"`, `error: undefined`.
- `waitForTxMined` (29d9e49) **resolved** on that hash. This is the red the issue predicts.
- `waitForTx(node, hash, { waitForStatus: TxStatus.PROVEN, ignoreDroppedReceiptsFor: 0, timeout: 60 })` threw `Transaction 0x1dd5… reverted: reverted. Reason: unknown`.

## Consults

(Panel rounds are recorded in `plan.md` § Audit verdicts; this section logs failed or retried consults.)

- Final pass, round 2: the first `resume-codex.sh` call passed the prompt text where the script takes a prompt file, and exited 2 (usage) before reaching Codex. It was rerun with the file and the same session; no quota or auth retry was needed on any consult.
