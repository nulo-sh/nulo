---
plan: firefox-pin-1
tier: light
status: approved
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: origin/dev at 5ef0c119d
trunk: dev
issues: "#1111"
budget: two Explore recon agents (sonnet); one Codex audit (gpt-6.1-sol, high) with its resume; one Opus Plan leg
post_implementation_hardening: not scheduled
---

# firefox-pin-1: the e2e suite on Puppeteer's Firefox 158

One arc, one PR. The suite's Firefox pin moves from `stable_153.0.4` to `stable_158.0`, the revision Puppeteer 25.14.0 pins, once the driver absorbs the three refusals #1111's 2026-10-28 comment lists. Test files, fixtures, e2e scripts and e2e docs only; no product file, no workflow. Recon: [recon.md](recon.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). Owner asks: none ([OWNER-ASKS.md](OWNER-ASKS.md)). `E` = `apps/extension/tests/e2e`, `B` = `E/fixtures/browser`.

## What held

Every claim of #1111's comment held against the 158.0 sources. Each path: Firefox 158, a wallet page (an extension page, so a privileged context), `--allow-system-access` on; the call reaches `RootBiDiModule._getNavigable`, which throws for a command without `supportsPrivilegedScope` (158 `RootBiDiModule.sys.mjs:87-107`). Consequence: the spec fails; 35 of 276 smoke tests at retry 0. All three are **demonstrated** (e2e-infra-3 phase 6, 2026-10-28).
- `pickFile` → `uploadFile` → `input.setFiles`. Classic commands pass under system access (158 `marionette/driver.sys.mjs:1438-1448`).
- `interceptHealth` → `page.setRequestInterception(true)` → `network.addIntercept` with the page's context (158 `root/network.sys.mjs:700-720`).
- `security.test.ts` → 158's schema adds an optional `content_security_policy.sandbox` (`schemas/manifest.json:235-240`; 153 has none), and Firefox reports an unset optional key as `null`.
- Not in the issue: two tool paths 158 also refuses (recon § Other refused calls). Neither is in a gate; both are a known limit (D6).

## Outcome & Quality Bar

- **For whom:** every contributor whose PR meets the two required Firefox lanes, and the release smoke of the shipped zip.
- **Excellent:** (1) the suite runs the Firefox Puppeteer ships, with no spec skipped, loosened or retried to get there; (2) each 158 difference that needs a mechanism lives on `BrowserDriver`, the manifest's `null` lives in its one expectation, and FIREFOX.md names all of them, so the next Firefox bump reads one doc.
- **Good enough:** no new e2e scenario; screenshots of extension pages on Firefox stay unsupported.

## Assumptions

**Facts**
- F1. On a fresh single-file input, classic Element Send Keys and BiDi `setFiles` do the same: `File.createFromFileName`, `mozSetFileArray`, then `input` and `change` from `shared/webdriver/Event.sys.mjs` (158 `interaction.sys.mjs:565-590`, :690-693; `windowglobal/input.sys.mjs:47-104`). They differ elsewhere: classic appends on `multiple`; BiDi refuses a disabled input and fires `cancel` for an unchanged selection. With `moz:webdriverClick` at its default `true`, classic neither scrolls nor focuses a file input (`interaction.sys.mjs:660-664`). The Marionette actor is registered for every process (`MarionetteCommandsParent.sys.mjs:522-535`).
- F2. Every `pickFile` caller opens the picker with `clickByTestId`, whose `prepareClick` switches the classic session to the page first (`E/fixtures/dom.ts:250-251`, :301).
- F3. The product checks no `isTrusted` and no `type`; it reads the name, size and content, keeps `lastModified` on decompression, and listens for `change` and `cancel` (`src/utils/files.ts:105-180`).
- F4. Firefox's BiDi `provideResponse` answers through `nsIHttpChannelInternal.setResponseOverride`, on a channel it suspended at the request stage and then resumes (158 `root/network.sys.mjs:1483-1518`; 153 too). DevTools handles its overrides at `http-on-before-connect`, before the server is reached (`NetworkObserver.sys.mjs:425-426`).
- F5. `cdpInterceptRpc` attaches no page target (`B/chrome-rpc-intercept.ts`, doc comment), so it cannot see the popup's own probe. The probe comes from the page (`src/composables/usePrestoCheck.ts`, `usePrestoStatus.ts`).
- F6. 158 dismisses a picker only when `unhandledPromptBehavior` is set and its effective `file` handler is not `ignore` (158 `Session.sys.mjs:478-490`, `UserPromptHandler.getPromptHandler`). The suite sets none (`B/firefox.ts:291-316`).
- F7. Puppeteer 25.14.0 pins `stable_158.0`. The CI cache key is the hash of `firefox-revision.ts` (`.github/actions/setup-puppeteer/action.yml:34`), so the value change alone re-keys it.

**Inferences**
- I1. `(loadInfo.browsingContext ?? loadInfo.associatedBrowsingContext).browserId` names the tab whose page sent a request: DevTools filters a tab's requests by exactly that (158 `browser/omni.ja` `network-observer/NetworkUtils.sys.mjs:562-575`). The contract test's two pages prove it on Firefox; a red there stops Phase 1.
- I2. geckodriver 0.37.1 serves 158: every session of e2e-infra-3's 158 run opened on it. The Phase 2 gate proves it again.
- I3. An override set synchronously inside `http-on-before-connect`, with no suspend, takes effect; the interface allows it before connect (`nsIHttpChannelInternal.idl`, per Codex r1). The contract test's answered fetch proves it on Firefox; a red stops Phase 1.

**Asks:** none. Nothing here changes what a person sees.

## Architecture & Implementation

- **File pick (D1).** `WebDriverSession.setFileInput(handle, selector, path)`, inside `exclusive()`: switch to `handle`, `POST /element` with the CSS selector, then `POST /element/<id>/value` with the path. Firefox's `pickFile` keeps its stale marking, `open()` and wait. It then calls `setFileInput(contextIdOf(page), PENDING_FILE_INPUT, filePath)` in place of `page.$` and `uploadFile`. The switch selects the window the click's `prepareClick` already selected (F2). Chrome is unchanged.
- **Health answer (D2).** A driver method, since the mechanism differs per browser and `interceptRpc` cannot serve Chrome (F5): `answerRequests(page, answers: ReadonlyMap<string, RequestAnswer>): Promise<AnsweredRequests>`. `RequestAnswer = { status: number; body: unknown } | "refused"` (today's `HealthAnswer`). `AnsweredRequests.hits(url)` counts every request to `url` that `page` sent, answered or not, and rejects once any answer has failed, or once the answerer's state is gone.
  - Chrome: today's `interceptHealth` body, moved into `chrome.ts`, plus the count and a failed `respond`/`abort` kept as a fault.
  - Firefox: new `B/firefox-answer-requests.ts`. One `http-on-before-connect` observer per page, in Firefox's scope. It matches `channel.URI.spec` exactly and the page's `browserId`, read as DevTools reads it (I1). It answers with `channel.cancel(NS_ERROR_CONNECTION_REFUSED)` or a `@mozilla.org/network/replaced-http-response;1` with the status, `content-type: application/json` and the JSON (F4). The match reads only optional fields and sits outside the fault guard, so a channel it does not match is never touched. Inside the guard, a throw is kept as a fault and cancels the channel, so that request never reaches loopback; the fault, not the cancel, is what a test sees.
  - Ownership: the launch owns the observer and its tally, as `observeAndIntercept`'s are owned, in the Firefox window that Firefox-scope calls run in, keyed by the page's navigable id. After the page closes the observer matches nothing, since no later page has its `browserId`; it goes with the launch. A second arm on one page throws. No `stop()`: Chrome's interception also ends only with its page.
  - Arming and reading go over BiDi `script.callFunction` on a chrome-scope context, as `setViewport` does, so no window switch moves focus. The getTree-and-callFunction steps move out of `setViewport` into one helper both use. The answerer module takes that call from `firefox.ts`, as `observeAndIntercept` takes the session, so no import cycle forms.
  - `interceptHealth(page, answers)` maps its two URLs onto `answerRequests` and returns `AnsweredRequests`. `settings-proving` and `presto-host-permission` read `hits` instead of `page.on("request")`, so the answerer is the one witness. Each of their tests ends on a positive count of each scheme it expects probed (settings-proving: HTTPS at least 1 after the first test's check, `afterCheck` above 0 in the second, both schemes in the third), so a never-happens `0` sits beside a count that proves the counter works.
  - The harness self-test in `onboarding-tab.test.ts` grows into the answerer's contract test: two pages armed at once with different bodies for one URL each read their own body (the page filter), the refused URL rejects the fetch, and each page's `hits` counts its own requests only.
- **Manifest (D3).** `security.test.ts` removes `sandbox` from the loaded policy only when it is `null` and the source names no `sandbox`, then keeps its `toEqual`. Any other key, a changed or missing `extension_pages`, or a non-null `sandbox` still fails. Chrome reports no `sandbox`.
- **Seam ban (D4).** `uploadFile` and `setRequestInterception` join `DRIVER_PAGE_CALLS` in `scripts/e2e/browser-seam.test.ts`, outside `fixtures/browser/` as today, with a bite case.
- **Pin (D5).** `E2E_FIREFOX_REVISION = "stable_158.0"`, still apart from Puppeteer's, so a Puppeteer bump never moves the browser alone. `install-firefox.ts`, `setup-puppeteer` and `setup-geckodriver` stay as they are (F7, I2). The driver test that plants Puppeteer's revision beside the pin plants a newer decoy, since the two are now equal.
- **A fourth difference.** Every flow after a file pick ran only to the refused `setFiles` on 158. A new difference a gate finds stops the arc as a plan change, never a skip.
- **#1222.** The rewrite replaces only the file step after the input is pending. The opening click, an evaluated one included, does open the native picker (Puppeteer's BiDi evaluate passes `userActivation: true`; corrected after the final review, which found this sentence wrong), so `pickFile` still relies on a focused window's picker never answering, as at the base; the arc changes neither that nor #1222's cancel path, which stays open. 158 keeps 153's default, the native picker (F6). The one change for #1222: 158 no longer reads `remote.bidi.dismiss_file_pickers.enabled`; its switch is the capability. If `dev` carries a dismissal by that pref when this arc merges `dev`, this arc moves it to `unhandledPromptBehavior: { file: "dismiss" }`, which leaves every other prompt type's handler as it was (`UserPromptHandler.getPromptHandler`). That swap gets its own gate: a 158 session opens with it, and `contractIDToCID("@mozilla.org/filepicker;1")` no longer names the GTK picker (#1222's arming check). If this arc merges first, the PR comments on #1222 that its dismissal must be the capability, and the arc report says so.
- **Change map.** Modified: `B/webdriver-classic.ts`, `B/firefox.ts`, `B/chrome.ts`, `B/index.ts`, `B/firefox-revision.ts`, `E/fixtures/presto.ts`, `E/settings-proving.test.ts`, `E/presto-host-permission.test.ts`, `E/security.test.ts`, `apps/extension/scripts/e2e/browser-seam.test.ts`, `apps/extension/scripts/e2e/firefox-driver.test.ts`, `E/FIREFOX.md` (§ Which Firefox, the `pickFile` and missing-CDP rows, a row for the manifest's `null`), `MIN_MAJOR`'s comment in `B/firefox.ts`. Added: `B/firefox-answer-requests.ts`.

## Security & Adversarial Considerations

- **Threat model.** Test infrastructure on a single-tenant CI runner or a developer host; no wallet code, key or user path changes. The parent observer runs with Firefox's privileges inside the automation session, which `--allow-system-access` already grants (FIREFOX.md § How Firefox is driven).
- **Isolation.** It answers one page's exact URLs, so no other page's traffic, the PXE frame's included, gets a stubbed reply; the contract test proves the filter with two pages. A matched probe whose answer fails is cancelled and kept as a fault that fails the test's count. An unmatched probe (sent before arming, or from another context) still reaches loopback, as on Chrome today.
- **No weakened check.** The manifest compare still refuses any changed or added policy (D3). The probe counts can no longer pass on an event that never arrives (D2). The seam ban widens.
- **Supply chain.** No dependency or lockfile change. The Firefox binary comes from Puppeteer's installer at the revision Puppeteer pins; geckodriver keeps its SHA-256 pins. Not applicable: crypto, input validation, least privilege, domain risks.

## Phase 1: the three refusals, on the 153 pin

1. Add `setFileInput` and the classic `pickFile`.
2. Add `answerRequests` on both drivers, rewire `interceptHealth`, and move both counters to `hits`.
3. Change the manifest compare. Extend the seam ban and its bite case.

**Validation gate:** `bun run lint`, `bun run typecheck:all`, `bun run test`. Then, with the armed Firefox and Chrome builds (FIREFOX.md, top), at retry 0 on each browser: `cd apps/extension && NULO_E2E_BROWSER=<browser> NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 NULO_E2E_RETRY=0 bun run test:e2e -- tests/e2e/onboarding-tab.test.ts tests/e2e/settings-proving.test.ts tests/e2e/security.test.ts tests/e2e/account-import-export.test.ts tests/e2e/backup-roundtrip.test.ts --retry=0`, and on Firefox also `tests/e2e/presto-host-permission.test.ts tests/e2e/toolbar-panel.test.ts`. Pass: exit 0 everywhere, the new bite case red with the rule removed. Layers: lint, typecheck, unit, smoke e2e on both browsers.

## Phase 2: the pin on 158

1. Set the pin and change the driver test's decoy. Run `bun scripts/e2e/install-firefox.ts` from `apps/extension`.
2. Green on 158: run the Phase 1 Firefox file list at HEAD. Its red half is done: the same list at `5ef0c119d` on the 158 binary (`FIREFOX_PATH`) failed 10 of 21, each on one of the three signatures (`lessons/phase-0.md`). Green counts only with every launch printing `[firefox] 158.0`.
3. Rewrite FIREFOX.md § Which Firefox the suite runs, and its rows for `pickFile` and the missing CDP.

**Validation gate:** `bun run lint`, `bun run typecheck:all`, `bun run test`, `bun run test:all`, `bun run test:ci-gating`, `bun run check:plans` after staging. Then, all at retry 0: the full Firefox smoke three times (`NULO_E2E_BROWSER=firefox NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 NULO_E2E_RETRY=0 bun run test:e2e -- --retry=0` in six `--shard=N/6` runs each); the full Chrome smoke once; the network suite on Firefox once (`NULO_E2E_BROWSER=firefox NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent`; without the variable its config retries twice, `vitest.e2e.network.config.ts:31`). Pass: every run green, 158.0 printed by each launch (`[firefox] 158.0`), counts logged. Layers: everything, e2e on both browsers and the Firefox network suite.

## Delivery

Single arc on `worktree-firefox-pin-1`, `gh pr create --base dev`, no labels at creation. Title: `test(e2e): run the firefox suite on puppeteer's firefox 158` (59). Body: the three causes and their absorptions, D1-D6, every gate run with counts, `UI impact: none`, each browser's suite wall-clock before and after (the e2e-testing skill, § Runtime budget: "before" from the latest green PR run of each lane), and `Closes #1111`. Merge `origin/dev` before the PR (§ #1222 above). The close-out is the PR's final commits. No parallel lanes: two e2e runs never share a worktree.

## Decision ledger

- **D1** Classic Element Send Keys. Firefox does the file step itself, with BiDi's own body (F1). Rejected: a frame script from Firefox's scope that sets the files, a copy of Marionette's `uploadFiles`; a `DataTransfer` built in the page, which hands the product a script-made `File`, not the browser's.
- **D2** A driver method that answers one page's exact URLs, on Firefox through the response override at `http-on-before-connect`. Rejected: `interceptRpc` with a new mode (Chrome's attaches no page, F5); a redirect to a loopback stand-in (a server and a port per spec, and redirect CORS); a session-wide BiDi `addIntercept` beside Puppeteer's own request handling; answering browser-wide (the PXE frame's traffic would differ from Chrome's); a public `stop()` (callers would owe a cleanup Chrome does not need); a test-only switch that injects a fault (an option for one test, Codex r1).
- **D3** Remove only the `sandbox: null` 158's schema adds when the source names no `sandbox` (Codex r1 narrowed a blanket `null` drop). Rejected: compare `extension_pages` alone (misses an added key); a per-version expected shape.
- **D4** Ban the two calls outside the driver. Their refusal on Firefox would otherwise surface only on a 40-minute lane.
- **D5** Keep a pin apart from Puppeteer's, at its value. Rejected: drop the pin and read Puppeteer's revision; 25.13's 157 refusal is why the pin exists.
- **D6** Known limit, filed at close-out as one closed `known-limit` issue (deduplicated against #1306): no page screenshot of an extension page on Firefox 157+ (`shotSend`, the chaos `screenshot` verb), and the chaos session's preload capture is refused; `armDownloads` re-arms before each command, which cannot cover a new document's first moments. Reopen on a needed Firefox capture or a scheduled Firefox chaos session.
- **D7** (the orchestrator's call of 2026-10-28: approved as proposed, a test-only amendment inside the lane's scope; the stop rule, § A fourth difference, held the arc until then) `import-errors-scroll.test.ts`'s end becomes the browser's own: in the one test that asserts it, after the landing is read, set the scroller's `scrollTop` to its `scrollHeight` and compare the saved landing with the clamped value exactly; `popupLanding` drops its `maxScroll`. Firefox 158 keeps the fractional end (101.8) that `scrollHeight - clientHeight` rounds to 102. Rejected: MDN's `< 1` px check (passes a landing short of the end); restoring the probed offset (Firefox may quantize a fractional restore); changing `rows.test.ts:1220`'s same bound (no failing case).

## Post-implementation

The plan plus `implementations-plan/README.md` § Post-implementation standard at `e3a03c9b1`. Plan-specific values:
- **Step 1:** absent (`code_review: off`).
- **Step 2:** once, over `git diff 5ef0c119d...HEAD`, after Phase 2 is green: `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; one Opus `general-purpose` review beside round 1; hard stop at three rounds.
- **Step 3:** `gh pr create`, then `gh pr checks <n> --watch`. Never merge.
- **Step 4:** merge `origin/dev`, read `index.md` and `lessons.md`; the Outcome, the lessons promotion, the D6 issue, `STATUS.md` deleted, the `git mv` into `archive/` in its own commit.
- **Step 5:** once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/firefox-pin-1/plan.md` succeeds, `agent-worktree done firefox-pin-1 --merged`.

## Audit verdicts

| Round | Verdict | Taken | Rejected or kept |
|---|---|---|---|
| Codex r1 (`gpt-6.1-sol`, high, fresh) | `conditional approve`, six: a fault turned into a cancel can pass the offline case (high); the self-test proves delivery, not the filter or the counts; the blanket `null` drop; the observer's ownership; the network gate retried; F1, F3, F6 overstated | all six: faults kept and read by `hits`, positive counts in every test; the two-page contract test; `sandbox: null` only; launch-owned state, `hits` rejects when it is gone; `NULO_E2E_RETRY=0`; facts corrected | its fault-injection switch (an option for one test) |
| Opus (Plan) | `conditional approve`, eight: a missing arm reads as 0; the fault guard's scope; #1222's other merge order and an ungated capability swap; flows after a pick never ran on 158; the zero-delta case; F1, F3, F4 and the isolation claim; no `stop()`; docs and gate env | all eight: `hits` rejects on a missing arm; the match outside the guard, optional reads; the #1222 comment, the swap's own gate; a fourth difference stops the arc; positive counts; I3 and the narrowed isolation bullet; the ownership note; Outcome (2), the FIREFOX.md `null` row, `MIN_MAJOR`'s comment, the Phase 1 env | the red-run worktree: not needed, the red ran on the 158 binary at the base |
| Codex final (resumed) | `approve`: every fix verified, no new material finding; I1 and I3 stay gated by the contract test | — | — |
| Codex fix r1 (`gpt-6.1-sol`, high, fresh, over `5ef0c119d...4901ab3a4`) | `approve`, one low: `PxeHostState`'s doc comment left above the new types | moved back | — |
| Opus (code, beside fix r1) | `conditional approve`, four low or info: the same doc comment; Firefox assigns the JSON text to a byte-string `responseBody` (BiDi UTF-8-encodes, `network.sys.mjs:3213-3228`); Chrome's driver lets a page arm twice; an answered request never reports `responseCompleted` to Puppeteer on Firefox (`NetworkRequest.sys.mjs:346-355`) | the comment; UTF-8 encoding, with the contract test's second body outside ASCII (red first: `JSON.parse: bad control character`); a FIREFOX.md sentence on the missing response event | the second-arm guard: no caller arms twice, and Chrome already fails one (Puppeteer refuses a request handled twice) |
| Codex fix r2 (resumed, over `4901ab3a4..6129a71d7`) | `approve`, one low: the FIREFOX.md sentence overstated a network-idle hang | its narrower wording: an answered request stays in Puppeteer's in-flight count | — |
| Codex r3 (resumed, a decision: the smoke's one red on 158) | the fix is a bounded test-only amendment; pick an exact probe of the browser's end without restoring; reject the `< 1` px check; leave `rows.test.ts`; the plan's stop rule binds, so approval comes first | D7 as proposed | — |
| Codex final r1 (fresh, over `origin/dev...HEAD` after D7 and the `dev` merge) | `conditional approve`: the three smoke passes must finish green; no code finding; D7 keeps the exact compare and needs no restore; `Refs #1222`, not `Closes` | the gate, and `Refs #1222` | — |
| Opus (final, beside Codex final r1) | `conditional approve`, four: the plan's and FIREFOX.md's "an evaluated click opens no picker" is false (Puppeteer's BiDi evaluate passes `userActivation: true`, `shared/Realm.sys.mjs:220-227`); FIREFOX.md's screenshot advice ignores 157's refusal; the D7 FIREFOX.md row uncommitted; `hits`' doc promised a rejection Chrome never gives | all four: the claim corrected in the plan, FIREFOX.md and `pickFile`'s comment; the advice narrowed to web pages with #1329; the row committed; the doc says "once the count can no longer be read" | — |

## Seeds (not run; the orchestrator drives this lane)

`/goal Phases 1-2 of implementations-plan/firefox-pin-1/plan.md are ✓ with each gate reported in the transcript; the Codex loop converged (a resumed pass with no new material finding, quoted); the PR exists with Closes #1111; the close-out archived the plan.`

`/loop 15m Drive implementations-plan/firefox-pin-1 forward per its plan.md; never merge; stop after the PR's checks report.`
