---
plan: e2e-followups-2
tier: mid
status: completed (delivered in #298; Phase 3 stopped under its stop rule, #297)
issues: "#284, #280, #281 (arc 1)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 Explore agent (sonnet) plus eight planner probes; dual audit (Codex gpt-6.1-sol high + one Opus Plan agent); one final fresh Codex pass, resumed once
base: origin/dev at 29d9e49
trunk: dev
post_implementation_hardening: not scheduled
---

## Outcome

- **Date:** 2026-10-11.
- **Status:** delivered in one PR against `dev`, [#298](https://github.com/nulo-sh/nulo/pull/298) (arc 1: Phases 1, 2 and 4; Phase 3 stopped under its stop rule), awaiting the orchestrator's merge; the merge that lands it closes this plan.
- **Shipped:** #284 (`readStartTime` gives a zombie no start time, so every identity check and the prior-run reap call a zombie owner dead; a deterministic zombie case beside the flaky one), #280 (`waitForTxMined` is the SDK's `waitForTx` at `PROVEN`, a dropped receipt terminal at once, the hash and last status on a timeout; `FrozenArtifactWallet.sendUnsimulated`; `network/wait-for-tx-mined.test.ts`, red on the old helper).
- **Orchestrator records:** D-orch-2 to D-orch-6; D-orch-5 applied as D17.
- **Dropped, rejected, superseded:** #281's relay (D1, D5, D6, D8, D10-D13) was built and passed its smoke control and the full Firefox smoke, then was reverted (9094cf9) when the Firefox network run recorded a product error, #297 (D17); its commits stay in #298's history and the measurements are on #281. The `openPopup` fallback change (D14) left with it. D16, the Codex loop past its three-round cap, is surfaced to the orchestrator; its rounds concerned the relay. Rejected findings: Codex round 1's unbounded receipt read (the test timeout bounds it), round 2's parent-side re-check, pass 4's two declined items (reasons in [`lessons/phase-3.md`](lessons/phase-3.md)). No lesson promoted to `implementations-plan/lessons.md`: it sits 54 bytes under its 8 KiB budget and this arc supersedes none of its entries. The zombie rule lives in the e2e-testing skill's ownership paragraph, the pre-simulation skip in `sendUnsimulated`'s TSDoc, the Firefox findings on #281 and in the lessons files; Firefox's `DataCloneError` on a reactive value is #297's, for its fix to promote.
- **Open items:** #281 (the relay; re-land after #297), #297 (Firefox refuses to store a sponsor pick).
- **Seeds retired:** the `/goal` and `/loop` seeds below are retired; this plan is a record, not a task list.

Owner questions: [OWNER-ASKS.md](OWNER-ASKS.md). Recon: [recon.md](recon.md). Probes: [lessons/phase-0.md](lessons/phase-0.md).

# e2e-followups-2: reverted txs fail the mined wait, zombie owners are dead, Firefox sees extension-page errors

Three follow-ups to the e2e harness, filed by the program's own leads. All three are in the test harness, and nothing a person sees changes. One arc, one PR against `dev`.

- **#284.** A zombie (a process that has exited but that its parent has not yet reaped) still shows its start time in `/proc`, so the ownership code calls a zombie owner alive. Under load a reap test then fails. The fix: a zombie has no start time to compare, so every identity check calls it dead. The flaky test stays as the proof, and a deterministic zombie case joins it.
- **#280.** `waitForTxMined` returns for a transaction whose public part reverted. Its body becomes one call to the SDK's own `waitForTx`, which reads the 6.0 receipt (`executionResult`) and refuses a revert. A new network test sends a transaction that reverts in public execution and sees the old helper pass it (red), then the new one refuse it.
- **#281.** Firefox's WebDriver BiDi sends no log events for extension pages, so `ctx.pageErrors` and `ctx.consoleErrors` check nothing on Firefox. The Firefox driver supplies the missing events itself. A listener inside the extension process sends each error, tagged with its page, to the parent process. The parent emits it on Firefox's own BiDi socket as the `log.entryAdded` event Firefox would send for a web page. The fixtures, their arrays and every assertion stay as they are. A new smoke test on both browsers proves the arrays fill.

## Scope

**In:** #284, #280, #281, in that order inside the arc (D7). Each issue is a phase; the close-out is the PR's final commits.

**Claims that did not hold, or hold narrower** (detail in [`recon.md`](recon.md)):

- #280: 17 call sites in 10 files at 29d9e49, not 20 in 13. The issue counted e2e-harness-gaps arc 3's unmerged branch. Its fix ("throw with the receipt's `error`") holds, but a public revert's receipt carries no `error` (measured: `undefined`), so the message says "Reason: unknown".
- #284: wider than filed. `ownerLives` (`fixtures/browser/ownership.ts:175`, the Firefox launch reaper) has the same blind spot. D2 fixes both at the one primitive they share.
- #281: the first candidate as filed ("a privileged `nsIConsoleListener` registered through `chromeScript`, attributed to the page's own window") cannot attribute. Every extension-page error reaches the parent process with window id 0 (measured). Registered inside the extension process, the same listener attributes exactly; that is the chosen design (D1). An "Unchecked lastError" message carries window id 0 in every process, so no design attributes it to a page. That narrower gap stays in `FIREFOX.md`.

## Outcome & Quality Bar

**For whom.** Agents and CI lanes that read a green e2e run as proof. That covers the two Firefox lanes required on `dev`, the network suite's mined-transaction checks, and `bun run test:all` on a loaded shared host. Also the next maintainer of `fixtures/browser/`.

**What excellent looks like.**
- On Firefox, an uncaught throw, an unhandled rejection or a native `console.error` in an extension page lands in the same fixture array as on Chrome. It lands only for the page that raised it, and only once. An error the page reported before a command's response is in the array when that command's `await` returns. A spec's `expect(ctx.pageErrors).toEqual([])` then means the same thing on both browsers. A smoke test that runs on both browsers fails if that ever stops being true, and a launch whose relay faulted or never started fails at close.
- A transaction that reverts in public execution, or that is dropped, fails `waitForTxMined` with a message that says which. Every network file that calls it still passes at retry 0 on both browsers, or the plan's stop rule explains why not.
- A zombie owner is dead to every reap that reads `/proc` identities. A deterministic test proves it without host load.
- No assertion is loosened, no timeout raised, no retry or skip added. No file under `apps/extension/src` changes.

**What good enough looks like.** The Firefox relay covers what Chrome reports to the two arrays: page exceptions as `pageerror`, other error-level messages as `console`. It does not invent attribution for messages Firefox itself leaves unattributed. An unhandled rejection arrives when Firefox reports it, a task or more after the page dropped it (Probe 7). `waitForTxMined` keeps its signature and its 120 s default.

## Assumptions

### Facts (verified at 29d9e49, or by a probe in [`lessons/phase-0.md`](lessons/phase-0.md))

1. `TxStatus` is `dropped | pending | proposed | checkpointed | proven | finalized`; `TxExecutionResult` is `success | reverted`; receipts from `createAztecNodeClient(...).getTxReceipt` are class instances with `isMined()`, `isDropped()`, `hasExecutionSucceeded()` (`@aztec-labs/stdlib/dest/tx/tx_receipt.{d.ts,js}`, 6.0.0-rc.1).
2. `waitForTx(node, txHash, opts)` from `@aztec-labs/aztec.js/node` polls until `status ≥ waitForStatus`. It throws on `dropped` (after `ignoreDroppedReceiptsFor` seconds, default 5). Once the receipt reaches that status, it throws if the execution did not succeed. It does not catch an error `getTxReceipt` throws. Its timeout error names neither the hash nor the status (`dest/utils/node.js:35-79`, `@aztec-labs/foundation` `retryUntil`).
3. `waitForTxMined` (`apps/extension/tests/e2e/fixtures/aztec.ts:818-836`) returns on `success | finalized | proven`. It throws on `dropped` immediately and on three status strings that 6.0 no longer has, and swallows `getTxReceipt` errors.
4. Probe 5: a script-wallet send through `BaseWallet.prototype.sendTx` of an over-balance `transfer_public_to_public` reached `proven` with `executionResult: "reverted"` in 4.2 s. `waitForTxMined` resolved on it, and `waitForTx(..., { waitForStatus: PROVEN, ignoreDroppedReceiptsFor: 0 })` threw "reverted". `EmbeddedWallet`'s own send refused the same call in its pre-simulation. `EmbeddedWallet.sendTx` also runs `pxe.sync()` first, because its PXE has auto-sync off (`@aztec-labs/wallets` `embedded_wallet.js:85-88`); the base send does not.
5. `readStartTime` (`apps/extension/tests/e2e/owned-processes.ts:46`) returns field 19 of `/proc/<pid>/stat` for any process that has a `/proc` entry, a zombie included. `identityIsDead` (`:71`), `stillRunning` (`:186`) and `ownerLives` (`fixtures/browser/ownership.ts:175`) all compare it to a recorded start time. `readEnviron` already treats a zombie as `gone` (`:93-110`), and `scripts/e2e/owned-processes.test.ts:399-410` already makes a zombie for that case.
6. The flaky case is `scripts/e2e/owned-processes.test.ts:312-328`: its `kill` waits on `running()`, which treats a zombie as not running (`:52-60`), while `reapPriorRun` refuses on `identityIsDead(lock.owner)` (`sandbox-ownership.ts:131`).
7. Firefox's BiDi skips a context whose **own** document principal is an add-on's (`isExtensionContext` reads each frame's principal; `BrowsingContextUtils.sys.mjs:59-77,239-244`, Firefox 153.0.4). For contexts it does serve, its windowglobal log module turns **every** error-flag `nsIScriptError` into a `javascript` entry, whatever its category, and every console-API call into a `console` entry (`webdriver-bidi/modules/windowglobal/log.sys.mjs`). Chrome sends only exceptions to `pageerror`; CSP, network and other error-level messages reach `console`.
8. Puppeteer 25.8.0 routes `log.entryAdded` to the `BrowsingContext` whose id equals `entry.source.context`. It emits `pageerror` for `type: "javascript"` (`new Error(entry.text)`) and `console` for `type: "console"`, whose text it builds from `args` (`lib/puppeteer/bidi/core/BrowsingContext.js:249`, `Frame.js:218-243`, `bidi/util.js:48-57`).
9. Probes 1-2: the parent process sees extension-page errors with window id 0. A process script in the extension process sees each with its page's window id; `loadProcessScript` never runs it in the parent process (Probe 7).
10. Probe 7: `RemoteAgent.webDriverBiDi.session._onMessageHandlerProtocolEvent(_, { name, data })` sends an event to every connection of the session geckodriver opened, which is the socket Puppeteer reads (`shared/webdriver/Session.sys.mjs:555-557`). A relay that maps each content-process error to its context id and emits it there filled the arrays per page and across a reload, in two runs. A throw or a console error raised before a command's response was in the array on the next line, 30 of 30 each time. Every page exception carried `hasException: true`.
11. `chromeScript` switches the session to a browser window and focuses it (FIREFOX.md, "A privileged call focuses a browser window"), so it is safe at launch and at close, and unsafe as a poll during a spec. A function it defines lives in that window's Marionette sandbox; a `Cu.Sandbox(systemPrincipal)` does not (Probe 7).
12. No network file that calls `waitForTxMined` carries `@requires-proverless`. Two are prover-ON canaries in CI (`frozen-account-canary`, `passkey-execution-canary`), `selfpay-phase` runs in the heavy job, and the rest run in the proverless pool. The PR's network lanes check out `pull_request.head.sha`, not the merge ref (`pr-extension-network-e2e.yml:181`, its Firefox twin `:144`).

### Inferences (unverified; audits attack these)

- I1. Turning #281 on will surface few errors in the Firefox suites. The probes' popup boots added nothing, and a Firefox-only uncaught error would show on Chrome too unless its path is Firefox-only. Unknown until Phase 3's full runs; the stop rule covers the opposite.
- I2. `waitForTx`'s propagation of a `getTxReceipt` error is intended, not a new flake source. The node client retries a failed POST three times (delays 1, 2, 3 s, `aztec-node.js:386-390`), and an error that survives those (a transport failure, or a 4xx it never retries) surfaces where the old helper hid it.
- I3. Waiting for `proven` keeps the old helper's own success threshold, so detecting a revert at `proven` adds no wait the suite does not already pay.
- I4. The relay never duplicates an entry Firefox's BiDi sends: both filter on the same per-frame principal rule (Fact 7), and the relay keeps only the add-on's frames that BiDi skips (Probe 8: a web page's throw arrived once). If Firefox later serves extension contexts (Bug 1755014), its native entries would most likely reach the smoke control before the sentinels and fail its exact counts. That is likely, not proven: the native path is not ordered with the relay's.
- I5. Treating a zombie as having no start time changes no caller in an unsafe direction. Besides the three identity checks, `readStartTime` feeds `ownIdentity`, `unreapedLeader` (`sandbox-ownership.ts:89`), `startTimes` (`global-setup.ts:796`), `runIdentity` (`resolve-ports.ts:250`) and geckodriver's launch record (`firefox.ts:110`). For each, `undefined` only drops the record of a process that has already exited. A zombie's pid cannot be reissued until it is reaped (D2).

### Asks (each with the working assumption the plan proceeds on)

- A1. **A product error surfaced by #281.** This lane changes no product code. If the Firefox runs surface a real uncaught error in product code, the implementer opens an issue for it and applies Phase 3's stop rule. An in-lane fix is admitted only if the orchestrator approves that specific fix in writing; the plan then records it.
- A2. **Order against e2e-harness-gaps arc 3.** CI does not integrate the two branches: their network lanes test each PR's head commit (Fact 12). Working assumption: whichever lands second runs the other's `waitForTxMined` callers against the combined tree. If arc 3 merges first, Phase 2's merge of `origin/dev` and its caller run cover it. If this arc merges first, arc 3's lead must merge `dev` and rerun its callers before its merge. Any later merge of `origin/dev` into this branch, the close-out's included, repeats the caller discovery and runs every newly incorporated caller on both browsers before the push. This PR's body and the planner's report say so.

## Architecture & Implementation

### #284: a zombie has no start time

`readStartTime(pid)` reads `/proc/<pid>/stat` once and returns `undefined` when the state field is `Z`, as it already does when the entry is gone. Its contract becomes "`undefined` once the process has exited, whether or not its parent has reaped it". One read, so there is no window between the state and the start time. `identityIsDead`, `stillRunning` and `ownerLives` need no edit; each now calls a zombie dead (D2). `isZombie` keeps serving `readEnviron`.

### #280: the SDK's wait, at the proven tip

```ts
/** Wait until the node reports `txHash` proven or finalized with a successful execution. Rejects
 *  when the node reports it dropped, when its public execution reverted, or after `timeoutMs`. */
export async function waitForTxMined(aztecConfig: AztecTestConfig, txHash: string, timeoutMs = 120_000): Promise<void> {
	const node = createAztecNodeClient(aztecConfig.nodeUrl)
	const hash = TxHash.fromString(txHash)
	try {
		await waitForTx(node, hash, { waitForStatus: TxStatus.PROVEN, timeout: timeoutMs / 1000, ignoreDroppedReceiptsFor: 0 })
	} catch (err) {
		if (!(err instanceof TimeoutError)) throw err
		const status = await node.getTxReceipt(hash).then((r) => r.status, () => "unavailable")
		throw new Error(`tx ${txHash} not proven within ${timeoutMs}ms (status ${status})`, { cause: err })
	}
}
```

- `ignoreDroppedReceiptsFor: 0` keeps today's "dropped is terminal at once". The grace exists for a hash sent to another node; the suite has one node, and every caller passes a hash the node already accepted. No test pins the timing.
- The timeout rethrow restores the hash and status the old helper printed (Fact 2); a failed status read keeps the timeout, with the status `unavailable`. `TimeoutError` is the class `retryUntil` throws, from `@aztec-labs/foundation/error`. The extension declares that package, and its isolated install resolves the same copy `aztec.js` uses, so `instanceof` holds.
- `TxStatus` comes from `@aztec-labs/stdlib/tx`, beside the `TxHash` the file already imports; `waitForTx` from `@aztec-labs/aztec.js/node`, where `createAztecNodeClient` and `waitForNode` already come from.

**The pairing test**, `apps/extension/tests/e2e/network/wait-for-tx-mined.test.ts` (no browser; script wallet only):

- Success control: a `mintPublicTokens` hash resolves.
- Revert: the minter sends `transfer_public_to_public(minter, randomAztecAddress(), 10n ** 30n, 0)`. The amount is more than any balance the run mints. `EmbeddedWallet.sendTx` pre-simulates and would refuse it. So the test syncs the wallet's PXE as that send does (Fact 4), then sends through `BaseWallet.prototype.sendTx.call(wallet, payload, { from, fee, wait: NO_WAIT })`, which proves and sends, as a wallet without a pre-simulation does. The proof's anchor block is then the synced tip, not whatever an earlier call left, so the result does not depend on test order. The test expects `waitForTxMined` to reject with `/reverted/` (D4).
- Dropped: a random `TxHash` rejects with `/dropped/` (the node answers `dropped` for a hash it never saw, as `failed-send-check.test.ts:182` relies on).

### #281: the Firefox driver emits the log events BiDi omits

New `apps/extension/tests/e2e/fixtures/browser/firefox-page-errors.ts`, beside `firefox-rpc-intercept.ts`. One `chromeScript` arms it right after the session opens and **before** `installAddon`, so no extension page exists yet and the focus switch is harmless.

- **The content listener** (a source string, `Services.ppmm.loadProcessScript(<data: URI>, true)`). It runs in every content process that exists and, through the delayed load, in each later one before its first page script. That covers the extension process the install starts. It registers an `nsIConsoleListener` and a `ConsoleAPIStorage` log-event listener. It keeps a message only when the message is error-level (no warning or info flag; console level `error`) and its window id resolves through `WindowGlobalChild.getByInnerWindowId`. That window's **own** `document.nodePrincipal.addonId` must equal the id in the build's `manifest.json`. This is Firefox's per-frame skip rule (Fact 7), narrowed to one add-on: a web frame inside an extension page stays with Firefox's own BiDi, and another add-on in a caller-supplied profile is never read. The principal is read as Firefox's own `isExtensionContext` reads it; no page value is read through a waived Xray. It sends `{ kind, topId, text, args, timeStamp, callFrames }` with `Services.cpmm.sendAsyncMessage`:
  - an `nsIScriptError` with `hasException` becomes `kind: "javascript"`;
  - any other error-level `nsIScriptError`, and a console-API error, becomes `kind: "console"`, with its arguments as strings (D8).

  That choice is a pure `kindOf(message)` exported from the module and serialised into the listener's source, so its unit test runs the code Firefox runs.

  `topId` is the top-level context, the only extension context Puppeteer lists. Once both listeners are registered, it sends one `ready` message carrying its process's child id and remote type. A registration or listener body that throws sends `{ kind: "fault" }` instead.
- **The parent relay** (evaluated in its own `Cu.Sandbox(systemPrincipal)`, so it outlives any browser window; Fact 11). On arming it checks that `RemoteAgent.webDriverBiDi.session._onMessageHandlerProtocolEvent` and `NavigableManager.getIdForBrowsingContext` exist, and throws at launch otherwise. Its `Services.ppmm` listener maps each record's `topId` to the BiDi context id (the Puppeteer `Frame._id`) and emits `logEntryFor(record, context)` synchronously on that session. A record whose context has no id is dropped: the background page and its PXE frame. A record `logEntryFor` refuses, or an emit that throws, adds to a fault count. Each `ready` adds its child id to a ready set.
- **`logEntryFor`** first checks every field of the record: kind from the closed set, numeric `topId` and `timeStamp`, string `text`, string `args`, and well-formed `callFrames`. It returns `null` for anything else. Otherwise it builds the params Firefox's windowglobal module builds for a web page (Fact 7): `type`, `level: "error"`, `source: { realm: "", context }`, `text`, `timestamp`, `stackTrace`. For `console` it adds `method: "error"` and `args` as BiDi string remote values, which Puppeteer reads (Fact 8). It is a plain function in the module, serialised into the relay source, so the unit test runs the same code. D8's regression target is `kindOf`'s unit test (`hasException: false` gives `console`, `true` gives `javascript`). No extension-page message was found that both browsers raise as a non-exception error (Probe 8).
- `firefox.ts`: `launch` arms the relay between `assertVersion` and `installAddon`. `close` reads the relay's state through one `chromeScript` before it disconnects (the spec has finished, so focus no longer matters). A pure verdict function then judges it:
  - healthy only when no fault was counted, at least one extension-type process of this launch reported ready, and every extension process the relay saw (`ipc:content-created`, `process-type-set`, D13) or that is live (`ChromeUtils.getAllDOMProcesses()`, remote type `extension`) is in the ready set;
  - a failed or malformed read is a failure too.

  Disconnect, session close and the launch release still run in `finally`, and the verdict's error is thrown after them. A relay that broke, or never started in the process that hosts the pages, fails that launch instead of leaving an empty array. No listener is unregistered: they live and die with the Firefox process the launch owns, and a loaded process script is never written to the profile.

**Ordering.** The content listener's message and the page's command responses both travel from the content process to the parent, and the relay emits synchronously in its handler. Measured, an error the page reported before answering a command reached Puppeteer before that answer, 60 of 60 (Fact 10). A throw in the task that closed its page reached that page's listener (Probe 8). The driver's own `reportClosed` follows at least two 150 ms window-list reads after a close. No Firefox document promises this order across the two message kinds. So the smoke control's barrier and self-close cases are the proof, and they fail if a Firefox update reorders them. No drain, file, tail or poll exists.

**What stays outside the arrays, on both browsers.**
- The background page and its PXE frame. These match the service worker and offscreen document on Chrome, which no page listener sees.
- Unattributable messages (window id 0, such as `Unchecked lastError`).
- On Firefox only: a failed resource load (a missing script), which never reaches the content listener with an extension window (Probe 8). Chrome reports it as a `console` error.
- Timing: an unhandled rejection arrives when Firefox reports it, which is later than the task that dropped it. A web page under Firefox's own BiDi has the same timing.

No fixture, helper or spec learns which browser runs. `ctx.pageErrors`, `ctx.consoleErrors`, `pageErrorOf` and `connect-one-window.test.ts`'s own handler receive Firefox's entries through the same Puppeteer events as Chrome's. The texts are Firefox's own wording (`Error: <message>`, `uncaught exception: <value>`), which its BiDi gives a web page; every spec filters by substring (recon).

**The success control**, `apps/extension/tests/e2e/page-error-capture.test.ts` (smoke, both browsers). It opens popups A and B first, because each `openPopup` resets the arrays.
- **Barrier.** A throws in a task that ends before a command's response. The very next line, with no wait, finds it in `ctx.pageErrors`.
- **Kinds.** A calls the sniffer's saved native `console._error`. B rejects with an `Error` and with a primitive. These are waited on as conditions with a deadline, because a rejection arrives when the browser reports it.
- **Reload.** A is reloaded and throws once more.
- **Self-close.** A third extension page, with its own `pageerror` listener as `connect-one-window` has, throws in the task that calls `window.close()`. Its listener hears the throw once.
- **Refused.** The background page throws (`evaluateInBackground`, on both drivers); its nonce never appears in either array. A web page (`about:blank`) throws; its own listener hears it exactly once. That is Firefox's native entry, with no copy from the relay.
- **Exact contents.** Once every expected entry is in, each page raises a sentinel on each producer path: a throw and a native console error. The test waits for all of them. Each path delivers a page's records in order, so a duplicate the relay made on either path arrives before that path's sentinel. Only then does it assert that each array holds exactly its entries, each nonce once.
- **Per page.** A's own `pageerror` listener heard only A's errors, before and after the reload, and B's only B's.

On Firefox at 29d9e49 it fails with both arrays empty; that is #281's red. It replaces the second case of `_probe-console-capture.test.ts`, which is deleted (the probe's other two cases stay).

### File-level change map

| File | Change | Phase |
|---|---|---|
| `apps/extension/tests/e2e/owned-processes.ts` | `readStartTime` returns `undefined` for a zombie; TSDoc | 1 |
| `apps/extension/scripts/e2e/owned-processes.test.ts` | a zombie identity case beside the existing "process reads" one: live control, then identity and `reapPriorRun` | 1 |
| `.claude/skills/e2e-testing/SKILL.md` | the ownership paragraph: a zombie owner counts as dead | 1 |
| `apps/extension/tests/e2e/fixtures/aztec.ts` | `waitForTxMined` body → `waitForTx`; timeout rethrow; imports; TSDoc | 2 |
| `apps/extension/tests/e2e/network/wait-for-tx-mined.test.ts` | new: success, revert, dropped | 2 |
| `apps/extension/tests/e2e/fixtures/browser/firefox-page-errors.ts` | new: content listener, parent relay, `logEntryFor`, the close check | 3 |
| `apps/extension/tests/e2e/fixtures/browser/firefox.ts` | arm before `installAddon`; check at close | 3 |
| `apps/extension/scripts/e2e/firefox-driver.test.ts` | `kindOf`: `hasException` false and true. `logEntryFor`: both shapes, one malformed case per field. The close verdict: healthy; healthy after a ready process exited; a fault; a live process not ready; no ready at all with no live process; a failed read | 3 |
| `apps/extension/tests/e2e/page-error-capture.test.ts` | new smoke success control | 3 |
| `apps/extension/tests/e2e/_probe-console-capture.test.ts` | delete the moved second case | 3 |
| `apps/extension/tests/e2e/fixtures/extension.ts` | the two "Firefox emits neither event" comment clauses | 3 |
| `apps/extension/tests/e2e/FIREFOX.md`, `.claude/skills/e2e-testing/SKILL.md` | the log row becomes "absorbed", narrowed to unattributable messages, failed resource loads and rejection timing; the evidence-channel lines and row 23 | 3 |

### Trade-offs and alternatives not taken

- **D1, #281's source.** *Chosen:* a listener in the extension process, relayed by the parent onto Firefox's BiDi socket. It attributes exactly, survives reloads, covers boot errors, works on every build including the release's artifact smoke, adds no product code, and uses only the system access the Firefox session already holds. *Rejected:* the parent-process listener (no window id, Probe 1). *Rejected:* an e2e-armed recorder in the build (the `csp-report.ts` pattern). It hears throws and rejections in its own page, but only in armed builds: the release and nightly artifact smokes would stay vacuous. It adds a fourth shipped e2e module and a release-grep marker, and still needs a per-document channel to reach the arrays, because BiDi preload scripts do not run in extension pages (Probe 4). *Rejected:* a test-injected recorder (`exposeFunction` after each load). It misses boot errors and every navigation the app makes on its own.
- **D2, #284's place.** *Chosen:* `readStartTime`, the one primitive the three identity checks share; a zombie has exited. *Rejected:* a `Z` test inside `identityIsDead` only, as the issue proposes. It leaves `ownerLives` (the Firefox launch reaper) with the same blind spot. *Rejected:* the test-only fix (wait until `/proc/<pid>` is gone), which the issue itself calls the symptom.
- **D3, #280's helper.** *Chosen:* the SDK's `waitForTx`, which already classifies 6.0 receipts and fails closed on an unknown execution result, plus a rethrow that keeps the hash in a timeout. *Rejected:* repairing the hand-written loop, which keeps a second copy of the SDK's receipt rules to drift on the next Aztec bump.
- **D4, the reverting transaction.** *Chosen:* one script-wallet send through the base wallet after a PXE sync. It proves and sends without the embedded wallet's pre-simulation (Probe 5: deterministic, 4 s). *Rejected:* a two-send race under `mining-hold.ts` (both simulate against the same state, and the second in the block reverts). It is realistic, but it needs the admin port, a hold released in `afterEach`, and a block-order assumption, for the same evidence.
- **D5, console-API errors on Firefox.** *Chosen:* relay them too, so `consoleErrors` means the same on both browsers. The sniffer reroutes app `console.*` on both, so what remains is what bypasses it, such as the sniffer's own fallback `original(...)` calls. *Rejected:* `pageErrors` only, which leaves `consoleErrors` vacuous on Firefox.
- **D6, the channel to Puppeteer.** *Chosen:* emit on the BiDi session geckodriver opened, from the parent (Probe 7). It needs no file, no Node parser and no poll. Errors a page reported before a command's response arrived before it, 60 of 60 (measured, not promised by any Firefox document). The smoke control's barrier and self-close cases gate that order. It uses an internal Firefox API, as `closeTab` already uses `NavigableManager`; the arming check fails the launch if a Firefox update removes it. *Rejected after Probe 7:* an append-only file tailed by Node and injected through the transport. It needs a drain before every delivered message to order anything, a Node-side trust boundary, file creation and cleanup rules, and partial-line handling. *Rejected:* draining an in-browser buffer with `chromeScript`, which focuses a browser window on every read (Fact 11). *Rejected:* a loopback HTTP server, which needs a port claim in the host registry.
- **D7, one arc in the order #284, #280, #281.** The two small fixes ship first inside the arc. #281 changes every Firefox run and carries the only stop rule; if it stops, its commits are reverted on the branch and the PR ships the other two. A split into two PRs was considered and rejected: the lane brief asks for one arc unless the tree proves a split necessary, and the stop rule already keeps #281 from holding the others.
- **D8, which array an error lands in.** *Chosen:* Chrome's split. An `nsIScriptError` carrying an exception becomes `javascript` (`pageerror`), and every other error-level message becomes `console`. *Rejected:* Firefox's own split for web pages, which sends every error-flag message, CSP and network ones included, to `pageerror` (Fact 7). Under it the arrays would mean different things on the two browsers, and Phase 3 would triage Firefox-only categories as product bugs.

### Competing outline (sent to both audits)

*Test-side only, smallest diff:* (1) #284: the test's `kill` waits until `/proc/<pid>` is gone. (2) #280: fix the hand loop to read `executionResult`; test with a unit test that stubs the node client's receipt. (3) #281: an e2e-armed recorder in each extension page (`src/e2e/script-error-report.ts`, armed like `csp-report.ts`) that forwards `error` and `unhandledrejection` to the background. A launch-level latch, checked at close on both browsers like the CSP check, replaces the per-page arrays on Firefox.

The main plan wins on the quality bar. (1) fixes a symptom, which the issue itself says. (2) proves the helper against a receipt the test invented, not one the node produced, and keeps a second copy of the SDK's rules. (3) leaves artifact smokes vacuous, changes what the arrays mean on Firefox (a latch at close instead of per-page arrays), misses console errors, and adds shipped e2e code where the driver can absorb the difference. Both audits agreed.

## UI impact

None. Every change is under `apps/extension/tests/e2e/**`, `apps/extension/scripts/e2e/**`, `.claude/skills/e2e-testing/` and this plan. A product error Phase 3 surfaces goes to an issue (Ask A1), never into this arc's diff without the orchestrator's written approval.

## Security & Adversarial Considerations

- **Threat model.** The changes run only inside e2e runs on a developer host or a single-tenant CI runner. The adversary that matters is a regression that makes a check pass without checking. A Firefox lane with vacuous error checks is one such regression; a mined-wait that passes a reverted transaction is another. The design closes both. Each fix is paired with a test that fails if it reverts, and the relay fails its own launch if it breaks or never starts.
- **Least privilege.** #281 adds no capability. The Firefox session already runs with geckodriver's `--allow-system-access`. It already loads frame scripts into the extension process and arms a parent-process observer for RPC interception. The content listener reads only messages from the add-on under test's own frames, never another add-on's or a web page's. It evaluates nothing the page provides and reads no page value through a waived Xray. The parent emits only fields it has checked, onto the socket the test already owns.
- **Trust boundary: page text into Node.** Error text from the extension under test reaches Node as a BiDi event, the path Chrome's CDP already uses for the same tests. Puppeteer parses it; nothing evaluates it. No file holds it.
- **An internal Firefox API.** `_onMessageHandlerProtocolEvent` and `NavigableManager` are not public. The launch checks both exist and throws if not, and the smoke control fails if their behaviour drifts, so a Firefox update cannot silently empty the arrays again.
- **Process signalling (#284).** Calling a zombie owner dead lets these act on that owner's leftovers: `reapPriorRun`, the orphan sweeps, `killChromesLoading` (a `pkill` by pattern, via `chromesUnclaimed`, `sandbox-ownership.ts:213`), and breaking the reconcile lock (`lockfile.ts:247`). All are safe. An orphan sweep signals only a process whose own environment names a dead owner. A zombie owner has exited, and its pid cannot be reissued while the zombie exists; after reaping, the start time differs anyway. No process of a live run names a zombie owner.
- **Production.** No file under `apps/extension/src` changes. No build flag, no release-grep marker, no manifest or CSP change.
- **Supply chain.** No dependency is added or bumped; `waitForTx` and `BaseWallet` come from packages the extension already pins.
- **Funds.** #280's test spends only sponsored fees on the run's own local sandbox.

## Phases

**Shared gate commands.** Run from the worktree root unless a command names another directory. `<files>` are relative to `apps/extension`.

- **Fast:** `bun run lint`, `bun run typecheck:all`, `bun run test`.
- **Unit (file):** `cd apps/extension && bun --bun vitest run <files>`.
- **Smoke build (armed), per browser `<b>`:** `cd apps/extension && VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run build:<b>`. Rebuild after any plain `build`.
- **Smoke (file):** `cd apps/extension && NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- <files> --retry=0`; the Firefox twin adds `NULO_E2E_BROWSER=firefox EXTENSION_PATH=$PWD/dist/firefox`. Smoke (full) is the same with no files.
- **Network (file):** `NODE_OPTIONS=--dns-result-order=ipv4first NULO_E2E_RETRY=0 [NULO_E2E_PROVERLESS=1] bun run e2e:agent <files>`, then the same with `NULO_E2E_BROWSER=firefox`. Set `NULO_E2E_PROVERLESS=1` exactly for files CI runs proverless: every network file except the five canary-lane files (`transfers`, `tx-sendTx-default`, `frozen-account-canary`, `passkey-execution-canary`, `delete-after-prove`). Put proverless and prover-ON files in separate calls.
- **N-full (Firefox):** with `NULO_E2E_BROWSER=firefox`: the pool (`NULO_E2E_PROVERLESS=1`, one `--exclude` per file in `pr-extension-network-e2e.yml`'s `exclude_files`); the heavy pair and the heavy-concurrent pair (proverless); the five canary files (prover-ON).
- **Pass, for every command:** exit 0 at retry 0, and vitest's summary shows every targeted test ran (no skip the plan does not name). One rerun is allowed for a failure the e2e-testing skill lists as a known flake; log it in the phase's lessons file. The stall watchdog's 10-minute limit stays as it is.
- **Host etiquette.** Never run two `e2e:agent` runs in one worktree at once. Every network run goes through `agent.sh`.

### Phase 1: a zombie owner is dead (#284) ✓

1. Add a case beside the existing zombie case in `scripts/e2e/owned-processes.test.ts`'s "process reads" describe (`:399-410`), in its shape. The child must live until the test kills it: `sh -c 'sleep 120 & echo $!; exec sleep 120'`, not the existing `sleep 0.1`, so a loaded host cannot turn it into a zombie before the control is read. While it runs, record its identity and assert `identityIsDead(identity)` is false (the control). SIGKILL the child, leaving the parent alive. Once its `/proc` state reads `Z` (the existing condition), assert:
   - `readStartTime(pid)` is `undefined`;
   - `identityIsDead(identity)` is true;
   - `reapPriorRun` of a lock owned by that identity returns `{ cleared: true }`.
2. Run the case before the fix. Record the red in `lessons/phase-1.md`.
3. Change `readStartTime` as § Architecture says.
4. Update the e2e-testing skill's ownership paragraph: a zombie counts as gone, and a zombie owner as dead.

Validation gate: Fast; Unit (file) `scripts/e2e/owned-processes.test.ts scripts/e2e/webdriver-ownership.test.ts scripts/e2e/reconcile-lock.test.ts`, three runs; `bun run test:all` once; `bun run test:ci-gating`. Pass: all exit 0; the new case red before step 3 and green after; the #284 case green in all three runs. Layers: lint, typecheck, unit.

### Phase 2: a reverted transaction fails the mined wait (#280) ✓

1. Merge `origin/dev` into the branch. Read what changed under `tests/e2e/network/` and `fixtures/`.
2. Write `tests/e2e/network/wait-for-tx-mined.test.ts` per § Architecture.
3. Run it against the old helper. Expect the revert case red because the helper resolves. Record the red in `lessons/phase-2.md`.
4. Replace `waitForTxMined`'s body and doc comment.
5. List the callers: `git grep -l 'waitForTxMined(' -- apps/extension/tests/e2e/network`.
6. Run the new file and every caller on both browsers. Split proverless and prover-ON files per the shared gate.
7. Read every red honestly. A caller that now fails because its transaction reverted is a finding, not a flake. Find which transaction reverted and why before anything else. A test that waited on the wrong hash or asserted the wrong outcome gets a real fix. A wallet send that reverts is a product bug: open an issue (Ask A1), stop the arc and report `ARC_FAILED` with the evidence.

Validation gate: Fast; Network (file) for the new file and every caller, Chrome and Firefox. Pass: all exit 0 at retry 0; the revert case red on the old helper and green on the new; the success and dropped cases green on both. Layers: lint, typecheck, unit, e2e-live-network.

### Phase 3: Firefox sees extension-page errors (#281), stopped

Stopped under the stop rule (D17): the Firefox network run recorded a product error, a sponsor pick in the fee card that Firefox refuses to store (#297). Phase 3's commits are reverted in 9094cf9; #281 stays open with the measurements. Record: [`lessons/phase-3.md`](lessons/phase-3.md).

1. Write `tests/e2e/page-error-capture.test.ts` per § Architecture. Run it on Firefox before any driver change and expect it red (both arrays empty). Run it on Chrome and expect it green. Record both in `lessons/phase-3.md`.
2. Write `fixtures/browser/firefox-page-errors.ts`.
3. Wire `firefox.ts` `launch` and `close`.
4. Add the unit cases to `scripts/e2e/firefox-driver.test.ts`.
5. Delete the moved case from `_probe-console-capture.test.ts`.
6. Run the new smoke file on both browsers. Expect green.
7. Run Smoke (full) on Firefox, then N-full on Firefox.
8. Triage every newly recorded error by its stack URL and text (**Stop rule**, below).
9. Update `FIREFOX.md`, the e2e-testing skill and the two comment clauses in `fixtures/extension.ts`.

**Stop rule.** Each error the Firefox runs now record is a real failure; never filter it. For each one:
- If its cause is in the harness, including the relay itself, fix it.
- If its cause is in product code: dedupe and open an issue (Ask A1). Then revert Phase 3's commits on the branch, comment on #281 with the measurements and the issue numbers, and ship the arc with #284 and #280. The orchestrator's written approval of a specific fix is the only exception.
- If the relay itself proves unreliable on a full run (the smoke control red, a launch's close check failing, or an entry whose stack URL names another page), the same revert applies.

Validation gate: Fast; Unit (file) `scripts/e2e/firefox-driver.test.ts scripts/e2e/browser-seam.test.ts scripts/e2e/page-errors.test.ts`; `bun run test:ci-gating`; Smoke (file) `tests/e2e/page-error-capture.test.ts` on Chrome and Firefox; Smoke (full) on Firefox; N-full on Firefox. Pass: all exit 0 at retry 0. The new smoke file is red on Firefox before step 2 and green after on both browsers. It is green in every full run, and no launch's close check fails. Every newly recorded entry is triaged under the stop rule, with its disposition logged. Layers: lint, typecheck, unit, e2e, e2e-live-network.

### Phase 4: close-out (the PR's final commits) ✓

Per § Post-implementation, Close-out.

## Decision ledger

| # | Decision | Source | Status |
|---|---|---|---|
| D1 | #281: extension-process listener, parent relay | planner, from Probes 1-4 | accepted (both audits) |
| D2 | #284: `readStartTime` calls a zombie exited | planner | accepted (both audits) |
| D3 | #280: `waitForTx` at `PROVEN`, dropped terminal at once, hash kept on timeout | planner; timeout rethrow from Opus O9, final pass F7 | accepted, amended |
| D4 | #280's test: PXE sync, then a base-wallet send that skips the pre-simulation | planner, Probe 5; sync from Opus O8 | accepted, amended |
| D5 | #281 relays console-API errors too | planner | accepted (both audits) |
| D6 | #281's channel: emit on the BiDi session from the parent; order measured and gated, not promised | Opus O5, Probes 7-8; final pass F1, R3 | revised (was: file tailed by Node) |
| D7 | one arc, order #284 → #280 → #281, #281 droppable | lane brief, planner | accepted (both audits) |
| D8 | Chrome's split: exceptions to `pageerror`, other errors to `console`, in the unit-tested `kindOf` | Opus O2, Probe 7; final pass R2 | added |
| D-orch-2 | Ask A1 answered: no product fix in this lane. Every in-lane change under `apps/extension/src` is pre-declined; a real product error Phase 3 surfaces becomes an issue (dedupe, five sections, `Record` link) and triggers the stop rule as written | orchestrator | accepted |
| D-orch-3 | Ask A2: this arc most likely lands before e2e-harness-gaps arc 3 (a draft held on an unsigned owner page). Right before the final gates, merge `origin/dev`; if `dev` moved, re-run Phase 2's full `waitForTxMined` caller list against the merged tree and record the counts | orchestrator | accepted |
| D-orch-4 | D1 and D6 accepted as the best solution, on two conditions: the arming and the close verdict are fail-closed (no try/catch-and-continue, no warn-and-proceed, no flag that disables the relay); `FIREFOX.md` and the e2e-testing skill name the Firefox version the relay was proved on and say a bump whose arming check fails is a hold on the bump, never a `skipIf`, soft-fail or removed assertion | orchestrator | accepted |
| D-orch-5 | The stop rule is final and binary: on any of its three causes, revert Phase 3's commits (no half relay, no relay behind a flag), ship #284 and #280 with `Refs #281`, and comment the measurements and issue numbers on #281 | orchestrator | accepted |
| D-orch-6 | D7 stands: one PR, order #284, #280, #281; each phase's gate is logged before the next starts | orchestrator | accepted |
| D9 | #280's test: the PXE sync and the pre-simulation-free send live on the fixture wallet as `sendUnsimulated`, because `BaseWallet.pxe` is `protected`; behaviour as D4 | implementer (the tree) | deviation, placement only |
| D10 | #281: the relay's state is read through an observer topic, not a window slot: the relay outlives every browser window, and a notification needs no window to hold a handle | implementer (the tree) | deviation, mechanism only |
| D11 | #281: `close()` runs once and answers a second call with the first one's outcome; the relay read fails on an ended session, which would turn the CSP latch's second close into a failure | implementer (the tree) | deviation |
| D12 | #281: the listener keeps a message only from a window its tab still shows (`isCurrentGlobal && !windowContext.isInBFCache`, Firefox's own `active` test) and judges that window's principal; a gone or replaced window's message is no page's | implementer (the tree) | deviation, a rule the plan did not state |
| D13 | #281: the close check judges every extension process the launch saw, exited ones included (`ipc:content-created`, `process-type-set`), not only the live ones | review round 1 (Codex 2) | accepted |
| D14 | #281 triage: `openPopup`'s fallback closes the tab it gives up on, still recorded, waits for its `close` event and loads the popup in a fresh tab; navigating it away instead makes Firefox reject its in-flight imports from it, which Chrome does not report (`lessons/phase-3.md`, Smoke run 1; review rounds 2 and 3) | stop rule, harness cause | fixed in-lane |
| D15 | The quality loop's first round ran during Phase 3's first full smoke, before N-full, so N-full runs on the code the loop converges on; Phase 3's gate is still logged before Phase 4 starts | implementer | deviation, order only |
| D16 | The Codex loop ran past its three rounds: round 3 still had two material findings, both narrow consequences of round 2's fallback fix (5a89d52); a fourth pass scoped to that commit found one more (09659e9), and a fifth scoped pass approved. Surfaced to the orchestrator, not counted as convergence within the cap | implementer | deviation, surfaced |
| D17 | Phase 3 stopped: N-full on Firefox recorded `DataCloneError` from `FeeSettingsCard`'s `persistSelection`, which stores a reactive sponsor row (product, #297). Per D-orch-5 every Phase 3 commit is reverted (9094cf9), except d9249ad's two #280 edits (the `waitForTxMined` doc line, the test's exact-wording assertions); D10-D14 and D16 left with the code they record. #284 and #280 ship, `Refs #281` | stop rule | applied |

## Audit verdicts

### Round 1

**Codex (gpt-6.1-sol, high): reject pending fixes.** It found D2-D4 sound, but #281 could lose errors silently and rested on a wrong context-filter assumption.

| # | Finding | Disposition |
|---|---|---|
| C1 | [blocker] Async delivery: errors raised just before an assertion or a page close can be missed; the tail stopped first at close | **Accepted.** Resolved by D6's revision, which emits on the socket that carries command responses. Measured, an error reported before a response arrives before it (Probe 7: 30/30 for throws and console errors, two runs). A planner-side file barrier was probed first (Probe 6) and dropped. No sleeps. The final pass narrowed the "by construction" wording (F1). |
| C2 | [major] The filter should be the frame's own principal, not the top document's | **Accepted** (verified `BrowsingContextUtils.sys.mjs:59-77`). Own `nodePrincipal.addonId`, mapped to the top. No nested-frame test: no extension page has a child frame. |
| C3 | [major] Producer failures have no failure path | **Accepted.** Fault and ready counts are checked at close and fail the launch; the unit test covers both refusals. The file-write case is moot under D6. |
| C4 | [major] Startup, delayed processes, teardown, non-tab contexts | **Accepted:** arm before `installAddon`; delayed load; a ready signal; the non-tab contexts are listed. **Rejected:** unregistering at teardown. The listeners die with the browser the launch owns, and nothing is written to the profile. |
| C5 | [major] Restrict to the add-on principal, validate IPC fields, create the file exclusively | **Accepted:** add-on id filter and field checks in the parent. File permissions are moot (no file). |
| C6 | [major] The control proves too little | **Accepted:** emits after both popups exist; covers reload, the barrier, a refused background error, and sentinels before exact counts. The UTF-8 split case is moot (no file). |
| C7 | [major] A2's CI integration does not exist | **Accepted** (verified `pr-extension-network-e2e.yml:181`); A2 rewritten. |
| C8 | [major] Product-fix authority | **Accepted.** No product edit without the orchestrator's written approval; A1 rewritten. |
| C9 | [minor] I2/I3 wording | **Accepted;** both narrowed. |

**Opus Plan agent: approve with fixes.** D2, D3 and D7 hold.

| # | Finding | Disposition |
|---|---|---|
| O1 | [major] The relay can die silently (window-bound sandbox, poisoned write chain) | **Accepted, different fix.** Its fix (the parent listener from the process script) was measured not to work: process scripts never run in the parent (Probe 7). The relay runs in its own system sandbox and checks its APIs at arming; the close check catches the rest. |
| O2 | [major] Firefox's BiDi sends every error-flag message to `pageerror`; Chrome does not | **Accepted** (verified `windowglobal/log.sys.mjs`): D8, split on `hasException` (measured true on all four exception kinds). |
| O3 | [minor] The filter should mirror BiDi's per-frame rule | **Accepted** (same as C2). Its "never touch the content window" is met as Firefox's own `isExtensionContext` meets it: the principal only, no waived Xray. |
| O4 | [minor] #284 also lets `killChromesLoading` and the reconcile-lock break act | **Accepted** (verified); listed in Security. |
| O5 | [major] Emit on Firefox's own BiDi socket instead of the file | **Accepted after Probe 7;** D6 revised. |
| O6 | [minor] File details (create first, decoder, stop once, orphan `.jsonl`) | **Moot** under D6. |
| O7 | [minor] `console` entries need `args` and `method` | **Accepted** (`logEntryFor`). |
| O8 | [minor] The base send skips `pxe.sync()` | **Accepted** (verified `embedded_wallet.js:85-88`); D4 syncs first. |
| O9 | [minor] Timeout loses the hash and status | **Accepted;** rethrow in D3. |
| O10 | [minor] An existing zombie test exists | **Accepted** (verified `:399-410`); Phase 1 extends it. |
| O11 | [major] "No wrong-page entry in any run" has no oracle | **Accepted;** the gate reads the smoke control, the close check and stack-URL triage. |
| O12 | [minor] Refused cases: background page, file retention, malformed line | **Accepted:** background page. The other two are moot. |
| O13 | [minor] The dropped case does not pin the 0 s grace | **Accepted:** the claim is dropped; no wall-clock assertion. |
| O14 | [minor] Local N-full on Firefox duplicates CI | **Rejected.** The program runs every e2e locally through `agent.sh` and opens the PR only after local gates pass. The local run decides the stop rule before any CI is spent. |

Both audits preferred the main plan to the competing outline.

### Final fresh pass

**Codex (gpt-6.1-sol, high, new session): reject.** It found that D6 overstated its ordering and failure-detection guarantees. It judged sound: D1/D5's seam, D2/I5, D3's SDK reuse, D4, D7, C4's rejection, O14's local runs and A1.

| # | Finding | Disposition |
|---|---|---|
| F1 | [blocker] "Ordered by construction" is not established: responses travel as JSWindowActor queries, the relay as `cpmm`; destroy events are synthesised from a classic-channel poll; no throw-then-self-close case | **Accepted.** The ordering is stated as measured, not promised (60/60, Probe 7). The throw-then-self-close case was measured (Probe 8: heard once, before the driver's close report) and joins the smoke control as a regression. Phase 3's gate reruns both. |
| F2 | [major] Historical readiness; a broken replacement producer; close needs lifecycle tests | **Accepted.** A ready carries the process's child id and is sent only after both listeners register. Close requires every live extension process to be ready, no fault, and a readable state, and the read failing fails too. Teardown runs in `finally` before the throw. The verdict function is unit tested: healthy, fault, missing ready, failed read. **Rejected:** a fake-launch harness to test the `finally` ordering, which is code shape, not a new behaviour. |
| F3 | [major] The sentinel argument assumes cross-path ordering | **Accepted:** a sentinel on each producer path (a throw and a console error per page), and I4 now says a future native path is caught likely, not provably. **Rejected:** a deliberately duplicated delivery path to test the exact-count assertion itself. |
| F4 | [major] No regression target for D8; no web-principal refusal; partial record validation | **Accepted:** `logEntryFor` validates every field and returns `null`, unit tested per field. D8's classifier is the pure `kindOf`, serialised into the listener and unit tested (round 2 corrected the first target). The `about:blank` refusal joins the smoke control (Probe 8: once, natively). No e2e non-exception case: a missing script never reaches the listener on Firefox (Probe 8), now a recorded gap. **Rejected:** a second add-on, which the id equality covers without installing one. |
| F5 | [major] A2 misses the close-out's later merge | **Accepted:** every later merge repeats caller discovery and runs new callers on both browsers before the push (A2, close-out step 5). |
| F6 | [minor] The zombie control can race on a loaded host | **Accepted:** the child lives until the test kills it. |
| F7 | [minor] The timeout's receipt read can throw; Fact 2 and I2 wording | **Accepted:** the status falls back to `unavailable`; Fact 2 and I2 narrowed. |

**Round 2 (same session, resumed): approve with fixes.** The other accepted fixes close their findings, and the three rejections hold.

| # | Finding | Disposition |
|---|---|---|
| R1 | [major] The close verdict passes when no extension process is live and none reported ready | **Accepted:** it also requires at least one extension-type ready from this launch; unit cases for that refusal and for a ready process that later exited. |
| R2 | [major] D8's test targeted `logEntryFor`, not the classifier | **Accepted:** `kindOf`, serialised into the listener, is the unit-tested code. |
| R3 | [minor] D6's rationale still said "by construction" | **Accepted:** reworded to the measured guarantee and its gates. |

R1-R3 were applied as specified. No third round was run: round 2 found that every other fix closed its finding and raised nothing new beyond these three.

## Delivery

One PR against `dev`, no stack (the orchestrator's D-orch-1), from `worktree-e2e-followups-2`. The close-out lands as its final commits.

| Branch | Phases | PR title (≤ 93 chars) | Closes | code_review |
|---|---|---|---|---|
| `worktree-e2e-followups-2` | 1-4 | `test(e2e): fail reverted txs, reap zombie owners, record page errors on firefox` | #284, #280, #281 | off |

- If Phase 3 stopped, the title is `test(e2e): fail reverted txs in waitForTxMined, reap zombie owners`. The PR then says `Closes #284, #280` and `Refs #281`.
- Open the PR only after the Codex loop converges and the local gates pass. Open it without labels. Add `e2e:extension-network` or `e2e:extension-smoke` afterwards only if the path filter would skip a suite the change needs. A label at creation cancels the run.
- PR body: what changed and why; the validation runs with outcomes, the reds recorded; the `Closes` lines; under Ask A2, whether e2e-harness-gaps arc 3's callers ran here or must run on that branch.
- Commits are signed and conventional, with a lower-case subject. Each ends with the `Co-Authored-By` trailer that names the model that wrote it. Afterwards `git log --format='%h %G?' -3` shows no `N`; on a hang, rerun as `env -u SSH_AUTH_SOCK git <cmd>`.

### Issue to arc

| Issue | Arc | Closed by |
|---|---|---|
| #284 | arc 1, Phase 1 | the PR |
| #280 | arc 1, Phase 2 | the PR |
| #281 | arc 1, Phase 3 | the PR; if Phase 3 stops, it stays open with a comment naming the measurements and the issues it opened |

## Post-implementation

This section is self-contained: the implementing session follows it from here.

### Quality loop (once, over the whole arc, after Phase 3's gate or its stop)

1. Codex audit: `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol` (no `CODEX_ACCOUNT`). On a quota or 401 error, retry once with `CODEX_ACCOUNT=alejo-icloud`. If that fails too, log the failed consult in `lessons/phase-N.md` and continue on your own judgment within scope. The prompt carries:
   - the arc's diff from 29d9e49 (after the merge of `origin/dev`, the diff against the merge base);
   - this plan and its decision ledger;
   - the adversarial ask: what could go wrong, what would an attacker target, what are we trusting that we should not;
   - the two rules below, verbatim.
2. Triage each finding. Verify Codex's factual claims against the repo first; it can misread code. Apply the accepted fixes, commit, and log the round (consult and verdict) in the phase's lessons file.
3. Resume the same Codex session (`resume-codex.sh "" <followup> <codex-dir> high`) with the fix diff. Ask for a re-review under the same rules. Repeat until a round yields no new material finding; rejected nitpicks do not count. Still material after three rounds: stop and surface it to the orchestrator.

**The no-over-engineering rule** (verbatim in every post-implementation Codex prompt): *"Report bugs and small, targeted improvements only. Do not propose speculative abstractions, extra configuration surface, new layers, or rewrites — the smallest change that fixes each real problem. If code works and is clear, leave it alone."*

**The comment-quality rule** (verbatim in every post-implementation Codex prompt): *"Audit the comments for value per character. Flag any comment that narrates what the code visibly does, restates its line, references implementation plans / phases / reviews, or spends a paragraph where a sentence works — and flag places where a non-obvious invariant or constraint deserves a comment it doesn't have. Comments are permanent context every future reader, human or LLM, pays to re-read: they must be few, dense, and exact."*

### Delivery

4. Before the push: `bun run test` and `bun run lint:actions`. Then `gh pr create --base dev` per § Delivery. This is the first time any PR is opened, drafts included. Then `gh pr checks --watch`.

### Close-out (the PR's final commits)

5. Merge `origin/dev` into the branch. Read what changed in `implementations-plan/index.md` and `lessons.md`; never a union merge. If the merge brought new `waitForTxMined` callers (`git grep -l 'waitForTxMined(' -- apps/extension/tests/e2e/network`), run them on both browsers per Phase 2's gate before the push (Ask A2).
6. Write an `## Outcome` block directly after the front matter. It holds the date and the status. It lists what shipped with the PR number. It gives one disposition line for each thing dropped or not holding. It has an `Open items:` line (issue numbers, or `none`). It ends with a line retiring the `/goal` and `/loop` seeds below.
7. Promote the generalizable gotchas into `implementations-plan/lessons.md`, one line each, linking the archived detail. Candidates:
   - Firefox's BiDi skips extension contexts, and the parent's console copy has no window id.
   - Process scripts never run in the parent process.
   - A zombie keeps its `/proc` start time.
   - A script wallet's send pre-simulates, so a public revert needs the base wallet.

   Keep the file under 8 KiB, deduplicate, retire what a new line supersedes, and date tool-specific lines.
8. File every open item in its home:

| Situation | Home |
|---|---|
| Work inside the implementation you are on | this `plan.md` and the PR |
| Actionable work that outlives the plan | a GitHub issue with a domain label and a `Record` link to the archived plan |
| Needs a product call, or waits on something outside the repo | an issue labelled `owner-decision` or `blocked:external` |
| A suspected exploitable weakness | a private draft security advisory; the plan records only "tracked privately: GHSA-…" |
| Rejected, superseded or already done | a disposition line in the Outcome block |
| Knowledge that prevents a repeat | `implementations-plan/lessons.md` |
| A legal or store blank with a release deadline | `BEFORE-LAUNCH.md` |
| Accepted code work that blocks launch | the `v1.0.0` milestone, pointed at once from `BEFORE-LAUNCH.md` |

   Dedupe first (`gh issue list --state all --search "<words>"`). An issue body has `## What happens`, `## Where`, `## Impact`, `## Possible fix`, `## Record`. An issue left open or not holding gets a comment with the reason.
9. Delete `STATUS.md`. Keep `OWNER-ASKS.md` (it archives with the plan). Run `git mv implementations-plan/e2e-followups-2 implementations-plan/archive/e2e-followups-2` in its own commit. Repair the relative links the extra level breaks (`git grep -n 'e2e-followups-2'`). Move the index line to `implementations-plan/archive/index.md`. Run `bun run check:plans`.
10. Push, and report. Merging is the orchestrator's call; the merge completes the plan.

### Teardown after the merge

11. Once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/e2e-followups-2/plan.md` succeeds, run `agent-worktree done e2e-followups-2 --merged --trunk dev`, without asking. This session started inside the worktree, so there is nothing to exit. The helper refuses rather than forces: relay a refusal and stop. A `/loop` session checks this on every firing. A `/goal` session arms one background wait after its wrap-up report: `until git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/e2e-followups-2/plan.md; do sleep 300; done`.

## Seeds

Recommended: `/goal`. Use exactly one per session; they do not compose. Both are drafts until the orchestrator approves the plan.

```
/goal Phases 1-3 of implementations-plan/e2e-followups-2/plan.md are marked ✓ (or Phase 3 is marked stopped under its stop rule, with the revert and the #281 comment in the transcript), each backed by its validation gate reported passing in the transcript; for each phase the transcript prints LESSONS_FILE=implementations-plan/e2e-followups-2/lessons/phase-N.md; /code-review was NOT run (code_review is off); the Codex fix loop (run-codex.sh … high read-only gpt-6.1-sol) converged over the arc, evidenced by a resumed Codex pass reporting no new material findings, quoted in the transcript; the PR against dev exists, created only after the loop converged (gh pr view in the transcript), and carries the close-out commits that archived the plan (git show --stat of the archive-move commit); bun run test and bun run lint both exit 0 in the transcript.
```

```
/loop 15m Drive implementations-plan/e2e-followups-2 forward. Never idle. Each firing: (1) read plan.md, STATUS.md and lessons/; if the plan path is gone, check `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/e2e-followups-2/plan.md`: success means merged, so run `agent-worktree done e2e-followups-2 --merged --trunk dev`, report, clear this loop and stop; failure means delivered, so babysit CI only. (2) Waiting on CI is fine; confirm it progresses. (3) No task in hand: take the next pending step; run lint and the touched tests after each edit; commit. (4) A decision you would bring to a person: consult Codex (run-codex.sh … high read-only gpt-6.1-sol) and act on the stronger argument; log it in lessons/. Anything a person would see goes to OWNER-ASKS.md, never decided. Never merge, never push to main, never expand scope. (5) Same step failed five times: stop and reassess with Codex; a gate that failed three times on one step ends the arc with ARC_FAILED. (6) Phase green per its gate: mark ✓, log lessons, print LESSONS_FILE=…. (7) All phases ✓ or Phase 3 stopped: run the quality loop, then Delivery, then the close-out per Post-implementation, then report and stop.
```
