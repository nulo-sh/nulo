---
plan: e2e-followups-6
tier: light
status: delivered (#337), awaiting merge
issues: "#325, #326 (arc-1); #324, #310, #321, #316, #294, #290, #262, #277 (no arc)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); one Codex audit (gpt-6.1-sol, high) with the Opus Plan lens beside it; Codex resume rounds until an explicit verdict
base: origin/dev at 32b7bf4
trunk: dev
post_implementation_hardening: not scheduled
---

## Outcome

- **Date:** 2026-10-13.
- **Status:** delivered in one PR against `dev`, [#337](https://github.com/nulo-sh/nulo/pull/337) (arc 1: phases 1 and 2 and this close-out). The merge that lands it closes this plan; the merge is the orchestrator's call.
- **Shipped:**
  - **#326 (closed by the PR).** Both zombie tests take their child from one helper that returns only once `/proc/<parent>/comm` reads `sleep`, past exec's point of no return; cleanup kills the child first, then the parent, on every path. Before and after on Bun: a widened copy (a 2,000-step loop forced before the `exec`) lost its zombie 5/5 on base and 0/20 on the fix; the unwidened file passed 20/20 pinned beside three busy loops on both, 10/10 unpinned on the fix (`lessons/phase-1.md`).
  - **#325 (closed by the PR).** `recordPageErrors` is exported with a record-once guard and attached in `waitForPopup` right after `asPage()`; `own-window` and `rows` record their windows; a smoke test proves a window's errors reach the arrays exactly once (red on base for each of its two reasons, on both browsers); the asserting network tests assert before each `openPopup` that would clear a window's errors and once their last window has closed; `grantCapBundle` waits for the grant window to close (D12, D13). One product line: `data-testid="logger-window"`, rendering the same.
  - **The sweep found nothing.** Every window-driving network file on both browsers (74 proverless + 4 prover-ON each, plus `send-chaos`'s two CI seeds), the full Chrome smoke suite and the touched smoke files on both browsers, with a temporary tap on the recorder: the arrays received only the capture tests' control nonces. No harness fix, product fix, issue or `OWNER-ASKS.md` entry came out of R1-R4. Firefox's close-time print (#328) showed only the documented "Client disconnected" cascade, which `pageErrorOf` drops by design (`lessons/phase-2.md`).
  - **Docs:** the e2e-testing skill's reset and attach sentences (both arrays restart at each `openPopup` and `openOnboarding`; a window's teardown is covered only after `waitForPopupClosed`; the pre-attach gap and Firefox's print).
  - **`lessons.md`:** nothing promoted (at its 8 KiB budget, no retirement pays for it; D-orch-6).
- **Gates (final head, retry 0, nothing rerun):** lint, typecheck:all, test, test:all, test:ci-gating, check:plans; smoke three files on both browsers and the full Chrome suite, each twice; the eight asserting network files three rounds per browser. Codex: approve, approve (converged at round 2). Opus: pre-sweep conditional approve (four accepted, three rejected), final approve (all four applied).
- **Dropped or rejected:** a browser-level recorder, a Chrome pre-attach capture and a non-shell zombie parent (§ Architecture, trade-offs); ending the `openPopup` reset (D9); the Opus nits on a late `waitForPopup` failure's leaked window and on the zombie helper's unknown-pid path (`lessons/phase-2.md`, pre-sweep table). Not in this lane: #324, #310, #321, #316, #294, #290 (`owner-decision`); #262, #277 (product bugs owned elsewhere).
- **Open items:** #336 (the window-driving tests each assert only one of the two arrays).
- **Seeds retired:** the `/goal` and `/loop` seeds below are retired; this plan is evidence, never instructions.

# e2e-followups-6: record every window a test asserts on; give the zombie test a zombie it keeps

Two e2e-harness findings, one arc, one PR against `dev`. Neither changes anything a person sees.

- **#325.** The launch's `pageErrors` and `consoleErrors` record only the onboarding page and the popup page. `waitForPopup` hands an approval window back with no recorder, so a test that asserts the arrays after a dApp flow proves nothing about the windows that flow opened. Two smoke tests have the same gap with windows they open themselves. Phase 2 records each window a helper hands back, once, from that point on. Then it runs the suites that open windows and treats every error that appears as a finding.
- **#326.** The zombie-owner unit test kills a child of `sh -c "sleep 120 & echo $!; exec sleep 120"` as soon as it reads the pid. When the kill lands before the `exec`, dash reaps the child, so no zombie exists and the read of `/proc/<pid>/stat` throws ENOENT. A probe confirmed this (8 of 300 rounds on an idle host). Phase 1 kills the child only after the parent is past its `exec`.

Recon: [recon.md](recon.md). Owner questions: [OWNER-ASKS.md](OWNER-ASKS.md). Planning log, probes and consults: [lessons/phase-0.md](lessons/phase-0.md).

## Scope

**In (arc-1):** #326 (Phase 1) and #325 (Phase 2). The PR says `Closes #325` and `Closes #326`. If the stop rule (§ Decision rules, R3) holds back part of #325, the PR says `Refs #325` instead, and #325 gets a comment that names what was left out and why.

**No arc, with reason:**
- #324 (Testnet reset to 6.0.0-rc.3) and #310 (release published detached from its tag) carry `owner-decision`: the owner decides them.
- #321, #316, #294 and #290 carry `owner-decision` too.
- #262 (lockless chain sweep) and #277 (reset or delete stalls while the node is unreachable) are product bugs outside this lane's e2e-harness scope; the orchestrator's lane map assigns them elsewhere.

**Out:** any wider wait, raised timeout, added retry, `skipIf`, suppression or error filter. No product change except under R2. `implementations-plan/lessons.md` is at its 8 KiB budget, so the close-out promotes nothing unless the same commit retires an entry of at least the same size.

## Outcome & Quality Bar

**For whom:**
- The maintainer who reads a green e2e lane and trusts that an asserted-empty `pageErrors` means the windows of that flow raised nothing.
- The maintainer who reads a red `quality-status`: it must never come from the zombie test's fixture.

**What excellent looks like:**
- Every window a test asserts on is recorded. An error raised in it after the attach is in the arrays exactly once, on both browsers. A smoke test proves this, red on the base fixtures and red without the record-once guard.
- The zombie tests hold their zombie on every round: 20 runs green, pinned to one CPU beside three busy loops. A copy with the parent's `exec` forced late is red on the base fixture and green on the fix.
- Each error the wider recording surfaces ends in one of three places: a harness fix in this arc, a product fix in this arc under R2, or an issue. Nothing is filtered.

**What good enough looks like:** errors a window raises before the recorder attaches may stay out of the arrays. The comment at the attach says so, and says where that case is reported instead: in the Firefox launch's close-time print once `e2e-followups-5` is on `dev`, and nowhere on Chrome. The lane does not build a pre-attach capture.

## Assumptions

**Facts** (verified on 32b7bf4, by probe, or in the issue logs):
1. `recordPageErrors(ctx, page)` (`apps/extension/tests/e2e/fixtures/extension.ts:1214-1233`) is private and has no guard against a second call. Its only callers are `openOnboarding` (`:327`) and `loadPopup` (`:1244`). Its listeners read `ctx.consoleErrors` and `ctx.pageErrors` at push time, so a page keeps pushing into the arrays that `openPopup` (`:1269-1270`) or `openOnboarding` (`:324-325`) put in place later.
2. `waitForPopup` (`apps/extension/tests/e2e/fixtures/popups.ts:22-100`) resolves the target, calls `target.asPage()` (`:53`) and returns the page without a recorder. `PopupKind` (`:16`) is `discover | verify | capabilities | execute | json | network-unavailable`. Its `preExisting` snapshot is by URL (`:35-40`).
3. puppeteer-core 25.8.0 returns one `Page` per target from `asPage()` on both drivers (`lib/puppeteer/cdp/Target.js:54-69` caches it; `lib/puppeteer/bidi/Target.js:43-54` holds the page it was built with), so two `waitForPopup` calls that match one target return one `Page` object. One caller can do that today: `reconnectPlayground` (`fixtures/send.ts:15`) leaves a `waitForPopup(ctx, "verify")` pending for up to 30 s when the reconnect needs no check, and that call can resolve a verify window a later call also resolves. A discover window that moves to `#/windows/verify` in the same document is passed on by `approveConnect` (`popups.ts:149-169`), not resolved again.
4. Two smoke tests assert `registeredExtension.pageErrors` after driving a window that nothing records: `own-window.test.ts` (`openWindow` at `:21-35`, assertion at `:70`) and `rows.test.ts` (the logger window at `:431-446`, assertion at `:449`). The logger window (`src/popup/windows/logger/`, opened at `src/popup/pages/settings/developer/index.vue:45`) is the only `#/windows/*` route that needs no `requestId`.
5. `connect-one-window.test.ts:126-130` attaches its own `pageerror` listener to the discover window and asserts that local array at `:182`. It is the only copy of `recordPageErrors` (recon item 1).
6. Eight network files drive a window and assert an array: `connect-dapp`, `connect-one-window`, `connect-verify-mismatch`, `delete-after-prove`, `execute-scope-account`, `execute-scope-chain`, `register-token`, `snack-placement`. 78 of the 118 network files drive a window (`grep -l -E 'waitForPopup\(|connectPlayground\(|dappConnectedExtension'`). No smoke file calls `waitForPopup`.
6a. Recording a window does not by itself put it under an assertion: every `openPopup` replaces both arrays (`extension.ts:1269-1270`), so an assertion covers only what was recorded since the last `openPopup` or `openOnboarding`. Known windows that a later `openPopup` erases before the assertion: `execute-scope-chain` (window `:56-64`, `openPopup` `:66`, assertion `:82`); `execute-scope-account` (windows before `openPopup` at `:128` and `:162`, assertion `:216`); the fixture's connect and grant windows in `connect-dapp` (`openPopup` `:24`), `delete-after-prove` (`:52`) and `snack-placement` (`balanceDrainedBehindTheWallet` `:249`). The dApp fixtures run `openPopup` first and then their windows (`setupConnectedPlayground`, `extension.ts:456-470`), so a test body that opens no popup before its assertion (`register-token`) covers them.
7. On Firefox, Puppeteer gets an add-on page's `pageerror` only through the driver's relay (`fixtures/browser/firefox-page-errors.ts`), which covers every top-level context BiDi knows, approval windows included. On dev, Firefox's `waitForTarget` failure (`fixtures/browser/firefox.ts:622-630`) lists nothing. On `e2e-followups-5`'s branch it lists Firefox's windows, BiDi's contexts, Puppeteer's pages and the watch's closes, and the add-on's latest exceptions print at the launch's close instead.
8. `scripts/e2e/owned-processes.test.ts` runs in the extension's unit suite (`apps/extension/vitest.config.ts` includes `scripts/**/*.test.ts`), so `bun run test` and `quality-status` run it. Both zombie tests are Linux-only (`describe.skipIf(process.platform !== "linux")`, `:409`). `/bin/sh` on this host is dash 0.5.12; Ubuntu CI runners also use dash.
9. The probes in `lessons/phase-0.md`: dash reaps a dead background child between commands, even with only builtins between the `echo` and the `exec` (37/40 reaped). The unfixed fixture lost its zombie 8 of 300 times unpinned. Killing only after `/proc/<parent>/comm` reads `sleep` gave 300/300 zombies, and 40/40 with the `exec` forced late. A `node -e` parent reaps its spawned child (libuv), so the issue's example parent cannot hold a zombie.
10. `apps/extension/**` is in both the `smoke-surface` and the `extension-network` path filters, so the PR runs all four e2e lanes without a label.
11. CI runs five network files prover-ON on a dedicated `canary` job (`pr-extension-network-e2e.yml:262-267`): `transfers`, `tx-sendTx-default`, `frozen-account-canary`, `passkey-execution-canary` and `delete-after-prove`. `delete-after-prove` is one of the eight asserting files. CI's smoke config retries twice (`apps/extension/vitest.e2e.config.ts:41`) over file-scoped fixtures.
12. `rows.test.ts:338-350` opens a wallet tab with a Ctrl-click through `waitForNewTab`, in a test that asserts the arrays (`:363`). `waitForNewTab` returns only a `close` handle, never a `Page`: on Firefox the tab is found through the classic handle list because BiDi may never announce it (`fixtures/browser/firefox.ts`, `waitForNewTab`). The logger window closes itself when no profile is active (`src/popup/windows/logger/index.vue:14-16`).

**Inferences** (unverified; the audits attack these):
- I1. On Chrome, an error the window raises before `asPage()` resolves is lost: Puppeteer resumes the target before any `Page` exists, and the exceptions CDP replays when the page enables `Runtime` arrive before the caller can attach a listener. Moderate confidence. The comment at the attach states only that such errors may be absent, which holds either way. Nothing guarantees that a pre-attach error fails a later wait: `waitForPopup` checks only the main frame and the worker's heartbeat, not that the window's app mounted.
- I2. The wider recording may surface errors no test saw. Their number and kind are unknown until the sweep runs; R1-R3 decide each.
- I3. `e2e-followups-5`'s PR lands on `dev` before this arc's final gates. The attach comment names its close-time exception print only if `origin/dev` carries it then (Phase 2, step 8).
- I4. The logger window boots without raising after the attach, on both browsers. The new smoke test proves or refutes that part only; it says nothing about a pre-attach boot error. An error it records is a finding under R1-R3, never a filtered entry.

**Asks:** none open. A question about what a person sees, raised by the sweep, goes to `OWNER-ASKS.md` (R3); the arc ships what does not depend on it.

## Architecture & Implementation

**Shape.** No new layer. The recorder stays where it is and becomes the one way a helper records a page. Each place that hands back an extension window calls it. Recon's reuse map (recon.md) has the verdict per capability.

**Interfaces.**
- `export function recordPageErrors(ctx: ExtensionContext, page: Page): void` in `fixtures/extension.ts`. A module-level `WeakSet<Page>` makes a second call on the same page a no-op. A `Page` belongs to one launch, so the first `ctx` is the only one.
- `PopupKind` gains `"logger"`, so `waitForPopup(ctx, "logger")` resolves the logger window.

**Critical flow (waitForPopup).** `waitForTarget` → `asPage()` → `recordPageErrors(ctx, page)` → main-frame wait → polling patch → liveness wait. The recorder attaches before any wait, so the window is recorded for the whole time the caller holds it. The comment at the attach states the one gap and where it shows: an error raised before that line, module evaluation first of all, may be absent from both arrays; on Firefox the launch's close prints the add-on's latest exceptions (only under I3), and on Chrome nothing reports it. It claims no later wait catches it (I1).

**Assertions where the arrays hold the window.** Recording is necessary, not sufficient (Fact 6a). The `openPopup` reset stays as it is: it is the documented contract every array assertion in the suite is written against, and changing it is a suite-wide change this lane does not need. In each asserting test, an assertion must run before any `openPopup` or `openOnboarding` that follows a window:
- after the window closes and before the next `openPopup`, assert both arrays the test already asserts;
- in a test on a dApp fixture whose body opens a popup before its first window, assert the arrays at the top of the body, which covers the fixture's connect and grant windows.

**`waitForPopup` and the logger window.** The logger window has no `requestId`, so its URL is the same every time. `waitForPopup` excludes the URLs present when it is called, so a caller arms it before the action that opens the window, as every existing caller already does. A second logger window at the same URL cannot be matched while the first is open; the one-line doc on `PopupKind`'s new member says so.

**Zombie fixture.** A test-local helper in `owned-processes.test.ts` spawns `sh -c "sleep 120 & echo $!; exec sleep 120"`, reads the child's pid, and returns only once `/proc/<parent>/comm` reads `sleep`. From then on no shell code runs in the parent, and `sleep` never waits, so a child that dies stays a zombie until the test kills the parent. Both zombie tests use it: the second kills the child itself, and the first kills it too instead of letting it exit after 0.1 s. One line at the helper states the race it closes.
- **Ownership on every path.** The helper bounds the pid read (the file's `until` budget), refuses a pid that is not a positive integer, and treats a parent that exits, or a `/proc` read that fails, as a fixture failure, never as a zombie. On any failure inside the helper it kills the parent and, once known, the child, then rethrows. Each test's `finally` kills both, so a test that fails before its own kill leaks nothing. Cleanup kills the child first, while the parent still holds it, then always the parent; it ignores only `ESRCH` (already gone), so a cleanup error never replaces the test's own failure.
- **The state checks stay.** Each test still waits for `) Z ` in the child's `/proc/<pid>/stat`. An inherited `SIGCHLD` set to `SIG_IGN` survives `exec` and would auto-reap; that check then fails loudly instead of passing on a reaped child.

**Trade-offs and alternatives not taken:**
- *A browser-level recorder* (`browser.on("targetcreated")` for every extension page): it double-records the popup and onboarding pages, records scratch and offscreen documents no test asserts on, and on Chrome it still attaches after the target is resumed. Rejected.
- *Recovering pre-attach exceptions on Chrome* through a second CDP session's `Runtime.enable` replay: Chrome-only, duplicates later errors, and nothing in the lane needs it. Rejected; R1-R3 cover what the gap could hide.
- *A non-shell zombie parent*: `node -e` reaps (Fact 9); `perl -e` or `python3 -c` with `fork` would work but add an interpreter dependency to a unit test for no gain over the `comm` wait. Rejected.
- *Keeping `rows.test.ts` on its own `waitForTarget`* and adding the recorder call there: it works, but the new smoke test needs `waitForPopup(ctx, "logger")` anyway, and one path to a window page is simpler. Chosen: `rows` uses `waitForPopup`, armed before its Enter. It keeps its own `before` target set for its later window-count assertion, which counts targets, not URLs.
- *Stop `openPopup` from resetting the arrays* (make them per launch or per test): it would close Fact 6a everywhere at once, but every array assertion in the suite is written against the reset, and the change would need a suite-wide sweep. Rejected for this lane: the asserting tests are fixed where they assert.

## Security & Adversarial Considerations

- **Threat model.** Test harness only: no product trust boundary, no message, storage or dApp surface changes. The failure this lane guards against is a false green, where a test asserts that a window raised nothing while nothing listened to it.
- **Process safety.** The zombie helper signals only the pids it spawned (the parent and its child), never by name. The certification's busy loops are started and killed by their own pids, never with `pkill` (CLAUDE.md § Run isolation).
- **The sweep tap never ships.** Phase 2's diagnostic tap writes error text, which can quote page data, to a gitignored file under `apps/extension/.e2e-state/`. It is never staged: Phase 2's gate checks `git diff` for it before any commit.
- **Supply chain.** No new dependency, interpreter or CI change.
- **Least privilege / crypto / input validation.** N/A: no credentials, tokens, cryptography or new input boundary.

## UI impact

- **Harness and fixture changes (Phases 1 and 2):** none. Nothing a person sees changes.
- **Logger window (`src/popup/windows/logger/index.vue`):** one `data-testid` attribute on the root element. The window renders exactly as before.
- **A product fix under R2:** it may ship only under the orchestrator's `no_ask` record in the lane brief, quoted here: "A product cause surfaced by #325's wider recording that changes nothing a person sees may ship in this arc under the orchestrator's `no_ask` record (precedent #205 / #210 / #214 / #312), with the panel's agreement, a test red on base and the one-line record quoted in the plan's UI impact; one that changes what a screen shows is an issue (dedupe first) and that issue stays open, named in the report." The implementer adds one line here per such fix, naming the surface and stating that it shows the same thing before and after.

## Decision rules

- **R1. A harness error** (raised by the suite's own action: a navigation away mid-load, an evaluate, a close) is fixed at its cause in this arc. If that cause sits in a file another lane's open PR changes, file an issue (dedupe first) and leave the file alone.
- **R2. A product error whose fix changes nothing a person sees** ships in this arc only with the panel's agreement (Codex and the Opus lens), a test red on base, and a UI impact line. Otherwise it becomes an issue.
- **R3. A product error whose fix would change what a person sees, or a behaviour they would notice,** becomes an issue: dedupe first with `gh issue list --state all --search "<words>"`, five-section body, label `bug`. It stays open and is named in the report. If it reds any required test that asserts the arrays (the eight network files of Fact 6, `rows`, `own-window`, or the new capture test), the recorder cannot land without a red required check, and loosening the assertion is refused. Then the arc ships Phase 1 alone, writes an `OWNER-ASKS.md` entry ("what ships now: #326; #325's recorder waits on <surface>"), and comments on #325.
- **R4.** An error in a page the recorder already covered before this change (the popup, onboarding) is out of #325's scope. It is listed in `lessons/phase-2.md` and filed as an issue only if no issue owns it. R4 never makes a red required test acceptable: such a red is handled by R1-R3.
- **Control errors are not findings.** The nonces the capture test raises on purpose are excluded from the sweep's dispositions by their `NULO-PAGE-ERROR-` prefix.
- **Error text is reviewed before it is committed.** A disposition in `lessons/phase-2.md` quotes an error's text only after it is checked for addresses, keys, URLs with paths and other page data; anything sensitive is replaced by its category.

## Phase 1: #326, a zombie the test keeps ✓

**Assumptions:** Facts 8 and 9; nothing inferred.

**Steps:**
1. Reproduce on the base before any edit. Copy `scripts/e2e/owned-processes.test.ts` from `32b7bf4` to an uncommitted sibling, `scripts/e2e/owned-processes.widened.test.ts`. In the copy, insert a 2,000-step builtin loop before each `exec` (`i=0; while [ $i -lt 2000 ]; do i=$((i+1)); done; exec sleep …`). Run the copy 5 times with `-t zombie`. Expect ENOENT reds. Log the count in `lessons/phase-1.md`.
   - Warning: the unit suite includes `scripts/**/*.test.ts`, so a widened copy left in the tree runs in every `bun run test`. Delete each copy before any other test run or commit.
   - The scratch probes ran on Node; the certification below runs on Bun, which is what CI runs.
2. Run the unmodified file 20 times pinned to one CPU beside three busy loops (step 5's harness). Log the red count. Zero reds here does not weaken the proof: step 1 is the forced-order proof.
3. Add the helper to `owned-processes.test.ts`: spawn the fixture, read the pid, wait with `until` until `/proc/<parent>/comm` reads `sleep`, and throw if it never does. Write one comment line at the helper: the shell reaps a dead background child between commands, so the child must not die before the parent's `exec`.
   - Bound the pid read with the file's `until` budget, and refuse a pid that is not a positive integer.
   - Treat a parent that exits, or a failed `/proc` read, as a fixture failure.
   - On any failure inside the helper, kill the child (once known) and then the parent, ignoring only `ESRCH`, and rethrow the original error.
4. Move both zombie tests onto the helper. The first test kills the child itself instead of `sleep 0.1`. Each test's `finally` kills the child, then the parent, ignoring only `ESRCH`. Keep each test's wait for `) Z ` in the child's stat.
5. Certify, per the e2e-testing skill's bar for process-sensitive helpers:
   - the file 10 times as is;
   - then 20 times with vitest, its workers, the spawned processes and three busy loops pinned to one CPU (`taskset -c <n>`, a core no other run uses);
   - start each busy loop as `taskset -c <n> sh -c 'while :; do :; done' &`, record its pid, and kill those three pids afterwards.
6. Apply the step-1 widening to a fresh copy of the fixed file. Run it 20 times with `-t zombie`: expect 20 greens. Delete both copies.

**File-level change map:** `apps/extension/scripts/e2e/owned-processes.test.ts` (helper + two tests). Nothing else.

**Tests:** the two existing zombie tests, now deterministic. No new test: the widened copies are the red/green proof and are never committed.

**Validation gate:**
- **Commands:**
  - `cd apps/extension && bun run test scripts/e2e/owned-processes.test.ts`, as step 5 runs it.
  - the widened-copy runs of steps 1 and 6.
  - `bun run lint`.
  - `bun run typecheck:all`.
- **Pass criteria:**
  - Step 1: at least one ENOENT red in 5 runs on the base copy.
  - Step 5: 10/10, then 20/20 pinned, all green.
  - Step 6: 20/20 green.
  - `lint` and `typecheck:all` exit 0.
  - `git status` shows no `*.widened.test.ts`.
- **Layers:** lint, typecheck, unit.

## Phase 2: #325, every window a test asserts on is recorded ✓

**Assumptions:** Facts 1-7, 6a and 10-12; Inferences I1-I4.

**Steps:**
1. In `fixtures/extension.ts`, export `recordPageErrors`. Add the `WeakSet<Page>` guard, with one line saying why a page can arrive twice (`asPage()` returns the same `Page` per target).
2. In `fixtures/popups.ts`:
   - add `"logger"` to `PopupKind`;
   - call `recordPageErrors(ctx, page)` right after `target.asPage()`;
   - write the attach comment (§ Architecture): a pre-attach error may be absent from both arrays, and Chrome reports it nowhere; the Firefox clause waits for step 8.
3. Move each window a test asserts on onto the recorder:
   - `own-window.test.ts`: `openWindow` calls `recordPageErrors(ctx, page)` after `asPage()`.
   - `rows.test.ts`: start `waitForPopup(registeredExtension, "logger", { timeout: 10_000 })` before the Enter that opens the window, await it after, and close that page in the `finally`. Keep the `before` target set for the window-count assertion. The Ctrl-click tab (`:338-350`, Fact 12) stays unrecorded: `waitForNewTab` yields no `Page` on Firefox. Its exclusion is D4's.
   - `network/connect-one-window.test.ts`: delete the local listener and its `pageErrorOf` import, and assert `expect(ctx.pageErrors).toEqual([])` at the same point.
4. Add `data-testid="logger-window"` to the logger window's root element (`src/popup/windows/logger/index.vue`). It changes nothing a person sees and gives the e2e a readiness signal, since e2e selects only by test id.
5. Add one test to `page-error-capture.test.ts`, "a window `waitForPopup` hands back is recorded once from then on":
   - open a popup page `a` with `openPopup`, and unlock it with `ensureUnlocked` (the logger window closes itself without an active profile);
   - start `waitForPopup(ctx, "logger")`, then from `a` `chrome.windows.create` a popup window on `src/popup/index.html#/windows/logger?capture=<uuid>`, then await the page. The per-run query keeps a window left by an earlier attempt (CI's smoke retries twice, Fact 11) from sharing the URL;
   - wait in the window for `[data-testid="logger-window"]` and for `typeof console._error === "function"`, so a red can only mean a missed capture;
   - attach `hear()` as ground truth, then raise a throw and a native console error in it (`raiseThenSettle`);
   - call `recordPageErrors(ctx, window)` again, as a second helper resolving the same target would (Fact 3), and raise a second throw. This tests the guard directly, with no dependence on a target's URL updating after a hash change;
   - raise the file's per-channel sentinels in the window and in `a`, and wait for all of them, as the file's first test does (`page-error-capture.test.ts:139-158`);
   - assert with `expectExactly`: each nonce once in `ctx.pageErrors` and `ctx.consoleErrors`, nothing else, and the same in `hear()`;
   - close the window in a `finally`.

   Then prove it red on base, each red for its own reason:
   - with the base `popups.ts` (plus the `"logger"` kind only), the test fails on the first nonce missing from `ctx.pageErrors`;
   - with the guard removed, it fails on the second nonce counted twice.

   A red from a discovery timeout, a boot failure or a missing `console._error` does not count as either proof. Log both reds in `lessons/phase-2.md`.
6. Put each array assertion where the arrays still hold the window (Fact 6a; § Architecture, "Assertions where the arrays hold the window"):
   - `execute-scope-chain`: assert `ctx.consoleErrors` at the top of the body, before the first `openPopup` (`:42`), which covers the fixture's windows; and again after `waitForPopupClosed` (`:64`), before `openPopup` (`:66`);
   - `execute-scope-account`: the same at the top of the body, before the first `openPopup` (`:86`), and before each `openPopup` that follows a window (`:128`, `:162`);
   - `connect-one-window`: keep the assertion at `:182` and add a final `ctx.pageErrors` assertion after `rejectCapabilities` (`:211`) once the capabilities window has closed (`waitForPopupClosed`), since the verify approval and the capabilities window come after `:182`;
   - `connect-dapp`, `delete-after-prove` and each `snack-placement` test: assert the arrays the test already asserts at the top of the body, before its first `openPopup`;
   - read all eight files, including those listed above, for two patterns and fix each one found: an `openPopup` or `openOnboarding` between a window and the assertion (directly or inside a helper), and a window still open or driven after the test's last assertion. Log the audit per file in `lessons/phase-2.md`.
7. **The sweep.** Add an uncommitted tap to `recordPageErrors`: for each pushed entry, append one JSON line (browser, test file, test name, `page.url()`, array, text) to `apps/extension/.e2e-state/window-error-sweep.jsonl`. With the tap in place, run:
   - Warning: smoke builds nothing and loads `dist/<browser>`, which an `e2e:agent` run overwrites with a network build. Before each smoke run, build that browser armed, from `apps/extension`: `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run build:<chrome|firefox>`. Run smoke under `env -u EXTENSION_PATH` with `NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1`.
   - the smoke files `page-error-capture`, `own-window` and `rows` on both browsers: `cd apps/extension && bun run test:e2e -- tests/e2e/<file>.test.ts --retry=0`, and the same under `NULO_E2E_BROWSER=firefox`;
   - the full smoke suite once on Chrome: `cd apps/extension && bun run test:e2e -- --retry=0`;
   - every network file that drives a window, on each browser through the agent runner, in CI's build mode for that file. Warning: never run two `e2e:agent` runs in this worktree at once, and start only after `e2e-followups-5`'s PR is open. From the repo root:
     - the files outside CI's `canary` job, proverless: `NODE_OPTIONS=--dns-result-order=ipv4first NULO_E2E_RETRY=0 NULO_E2E_PROVERLESS=1 bun run e2e:agent $(cd apps/extension && grep -l -E 'waitForPopup\(|connectPlayground\(|dappConnectedExtension' tests/e2e/network/*.test.ts | grep -v -E 'transfers|tx-sendTx-default|frozen-account-canary|passkey-execution-canary|delete-after-prove')`;
     - the window-driving files of the `canary` job, prover-ON: `NODE_OPTIONS=--dns-result-order=ipv4first NULO_E2E_RETRY=0 bun run e2e:agent tests/e2e/network/tx-sendTx-default.test.ts tests/e2e/network/frozen-account-canary.test.ts tests/e2e/network/passkey-execution-canary.test.ts tests/e2e/network/delete-after-prove.test.ts`;
     - then both again with `NULO_E2E_BROWSER=firefox`.
   - The tap records the current test with each entry. A window a test leaves open keeps pushing into the next test of a file-scoped fixture, so that attribution is approximate; the URL is the reliable field.

   The JSONL is an inventory of what the windows raised, not proof of assertion coverage: step 6 and the gate's eight files are that proof. Classify every window entry in the JSONL by R1-R4, after removing the control nonces. Record each one, with its file, URL, text and disposition, in `lessons/phase-2.md`. Fix R1 and R2 entries in this arc, each with a test red on base. File R3 entries as issues. Then remove the tap and check that `git diff` no longer shows it.
8. Merge `origin/dev` into the branch. If it carries the close-time print of the add-on's latest exceptions (`fixtures/browser/firefox.ts`), add to the attach comment that on Firefox the launch's close prints the add-on's latest exceptions. Then run the gate on the merged head.
9. Update `.claude/skills/e2e-testing/SKILL.md`:
   - replace "Approval sub-windows carry no listeners at all." (`:461`) with: `waitForPopup` records the window it hands back from then on, and an error the window raised earlier can be in neither array;
   - rewrite the reset sentence (`:459-460`), which becomes false once `waitForPopup` records without resetting: the arrays restart empty at each `openPopup` and `openOnboarding`, so an assertion covers a window only if neither runs between the window and the assertion;
   - correct the `fixtures/popups.ts:53` reference (`:566-570`).

**File-level change map:**
- `apps/extension/tests/e2e/fixtures/extension.ts`: export, guard.
- `apps/extension/tests/e2e/fixtures/popups.ts`: `"logger"` kind (with its one-line arming note), attach, comment.
- `apps/extension/src/popup/windows/logger/index.vue`: one `data-testid`.
- `apps/extension/tests/e2e/network/{execute-scope-chain,execute-scope-account,connect-dapp,connect-one-window,delete-after-prove,snack-placement}.test.ts`, and any other asserting file step 6 finds: assertions added before a reset or after the last window.
- `apps/extension/tests/e2e/page-error-capture.test.ts`: one test.
- `apps/extension/tests/e2e/own-window.test.ts`: one call.
- `apps/extension/tests/e2e/rows.test.ts`: `waitForPopup("logger")`.
- `apps/extension/tests/e2e/network/connect-one-window.test.ts`: local recorder removed.
- `.claude/skills/e2e-testing/SKILL.md`: two sentences.
- Plus a source file and its test for each R1/R2 finding (named in `lessons/phase-2.md`).
- `e2e-followups-5` touched none of these files except the skill; that merge is line-level.

**Tests:** the new `page-error-capture` test (both browsers, red on base twice, each for its own reason); the eight asserting network files, with each assertion placed where the arrays still hold the window; a red-on-base test per R1/R2 fix.

**Validation gate (on the merged head, step 8):**
- **Commands:**
  - `bun run lint`, `bun run typecheck:all`, `bun run test`.
  - The touched smoke files on both browsers at retry 0: `page-error-capture`, `own-window`, `rows`, each after a fresh armed build of that browser (step 7's warning).
  - The full smoke suite once on Chrome at retry 0, after a fresh armed Chrome build.
  - The eight asserting network files on both browsers through `e2e:agent` with `NULO_E2E_RETRY=0`, twice more each after the sweep's round, so three rounds per browser: `connect-dapp`, `connect-one-window`, `connect-verify-mismatch`, `execute-scope-account`, `execute-scope-chain`, `register-token` and `snack-placement` with `NULO_E2E_PROVERLESS=1`; `delete-after-prove` prover-ON, as CI's `canary` job runs it. Three rounds, because a native console error such as Chrome's "Unchecked runtime.lastError" can depend on a window closing with a message in flight.
  - The touched e2e files of each R1/R2 fix, on both browsers.
- **Pass criteria:**
  - Every command exits 0.
  - The two red-on-base proofs of step 5 are logged, each failing for its own reason.
  - Step 6's per-file audit is logged.
  - Every sweep entry has a disposition in `lessons/phase-2.md`.
  - `git diff` shows no tap.
  - No assertion was loosened, no wait widened, no filter added.
  - One rerun is allowed for a known flake fingerprint from the e2e-testing skill's flake ledger, and the rerun is logged.
- **Layers:** lint, typecheck, unit, smoke e2e (both browsers), network e2e (both browsers).

## Arc gate (final head, before the Codex loop)

- **Commands:** `bun run test:all` once; `bun run test:ci-gating`; `bun run lint`; `bun run typecheck:all`; `bun run check:plans`.
- **Pass criteria:** all exit 0, on the head that the PR will carry.
- `test:release` is not needed: nothing under `scripts/release/` or `.github/` changes.

## Delivery

Single arc, one PR, no stack (orchestrator D-orch-1).

| Arc | Phases | Base | `/code-review` |
|---|---|---|---|
| arc-1 | 1, 2, close-out | `dev` | off |

- Branch: `worktree-e2e-followups-6`.
- Open the PR only after the arc gate passes and the Codex loop has converged: `gh pr create --base dev`, no labels (`apps/extension/**` already runs all four e2e lanes).
- Title (≤ 93 characters): `test(e2e): record each window a test asserts on; keep the zombie test's zombie`.
- Body: what changed and why, the validation runs with outcomes, the sweep's dispositions, `Closes #325` and `Closes #326` (or `Refs #325` under R3), and the issues R3 opened. End with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- Then `gh pr checks <n> --watch`. Merging is the orchestrator's call.

## Post-implementation

Run once, over the whole arc diff, after the arc gate passes.

1. **Codex audit.** Write the prompt to a fresh `mktemp` file under `~/.cache/nulo-backlog/e2e-followups-6/`. Run `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol` (with `CODEX_ACCOUNT` unset). Send:
   - the net diff from `32b7bf4` (after the `origin/dev` merge, the diff against the merge base);
   - this `plan.md` and its decision ledger;
   - the sweep's dispositions;
   - the adversarial ask: "What could go wrong? What would an attacker target? What are we trusting that we shouldn't? Where are the supply-chain / crypto / least-privilege weaknesses? Where can this harness still report green while a window raised an error?";
   - both rules below, verbatim.
2. **Fix loop.**
   - Verify each finding against the repo first.
   - Apply the accepted ones, commit, and log the round (consult + verdict) in `lessons/phase-2.md`.
   - Resume the same session with `resume-codex.sh "" <followup-file> <codex-dir> high`, sending the fix diff.
   - Repeat until a round yields no new material finding. Rejected nitpicks do not count.
   - Hard stop at three rounds: if a round still yields material findings, stop and report `ARC_FAILED: arc-1 <reason>`.
   - The no-over-engineering rule, verbatim in every prompt: *"Report bugs and small, targeted improvements only. Do not propose speculative abstractions, extra configuration surface, new layers, or rewrites — the smallest change that fixes each real problem. If code works and is clear, leave it alone."*
   - The comment-quality rule, verbatim in every prompt: *"Audit the comments for value per character. Flag any comment that narrates what the code visibly does, restates its line, references implementation plans / phases / reviews, or spends a paragraph where a sentence works — and flag places where a non-obvious invariant or constraint deserves a comment it doesn't have. Comments are permanent context every future reader, human or LLM, pays to re-read: they must be few, dense, and exact."*
3. **Delivery** per § Delivery. This is the first time any PR is opened.
4. **Close-out**, as the PR's final commits:
   1. Merge `origin/dev` again and read what changed in `implementations-plan/index.md` and `implementations-plan/lessons.md`. Never use a union merge.
   2. Write an `## Outcome` block directly after the front matter. It carries Date, Status, Shipped (PR number), a disposition line for each dropped or rejected item, `Open items:` (issue numbers, or `none`), and a line retiring the `/goal` and `/loop` seeds below.
   3. Promote to `lessons.md` only by retiring at least as many bytes in the same edit (8 KiB budget).
   4. File every open item in its home:

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

      Dedupe before opening an issue. An issue body has five sections: What happens, Where, Impact, Possible fix, Record.
   5. Delete `STATUS.md`.
   6. In its own commit, `git mv implementations-plan/e2e-followups-6 implementations-plan/archive/e2e-followups-6`. Repair links that the extra directory level breaks (`git grep -n e2e-followups-6`). Move the index line to `archive/index.md`.
   7. Run `bun run check:plans`, push, and report.
5. **Teardown after the merge.** When `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/e2e-followups-6/plan.md` succeeds, run `agent-worktree done e2e-followups-6 --merged --trunk dev`. A session that entered the worktree through `EnterWorktree` runs `ExitWorktree` with `keep` first. Never force past a refusal: relay its output. A `/loop` session checks on every firing. A `/goal` session arms one background wait after its report (`until <the check>; do sleep 300; done`, at the maximum timeout).

## Decision ledger

| # | Decision | Views | Status |
|---|---|---|---|
| D1 | #326: kill the child only after `/proc/<parent>/comm` reads `sleep`; one helper for both zombie tests | Planner, from probes (Fact 9). The issue's `node -e` parent refuted by probe | accepted |
| D2 | #325: attach in `waitForPopup` right after `asPage()`; state the pre-attach gap at the line | Lane brief; alternatives in § Architecture | accepted |
| D3 | Record each `Page` once (`WeakSet`) | Fact 3: `asPage()` returns one `Page` per target, and `reconnectPlayground`'s pending verify wait can resolve a target another call resolves (Opus R1 #4) | accepted |
| D4 | Extend the recorder to `own-window` and the logger window, both asserted on and unrecorded (Fact 4). Not to passkey windows, which no test asserts on, nor to `rows`' Ctrl-click tab, for which `waitForNewTab` yields no `Page` (Fact 12) | Planner; Opus R1 #9 named the tab | accepted |
| D5 | `"logger"` joins `PopupKind`; `rows` and the new smoke test resolve it with `waitForPopup`, armed before the open. The capture test proves the guard with a direct second `recordPageErrors` call, not a hash change: whether a target's URL updates on a same-document hash change is unchecked on Chrome (Opus R1 #4) | Planner; Codex R1 #2, Opus R1 #3-4 | accepted |
| D6 | Delete `connect-one-window`'s local recorder; assert `ctx.pageErrors` | Planner (dedupe) | accepted |
| D7 | The sweep: an uncommitted tap; the 78 window-driving network files on each browser, each in CI's build mode (the `canary` job's four window files prover-ON); the touched smoke files on both browsers. Then the eight asserting files twice more per browser | Lane brief's validation; Opus R1 #2, #6 | accepted |
| D11 | Keep the assertions inside the eight files rather than file an issue for the reset and leave them as they are | Codex R1 #1 (fix in place) over Opus R1 #1 (document the coverage, file an issue): #325's point is that those assertions prove nothing about their windows, and a handful of placed assertions fixes that without changing the reset | accepted |
| D8 | R1-R4 classification, with R3's ship-Phase-1-alone fallback, applied to every required asserting test | Lane brief's stop rule; Codex R1 #7 widened the trigger | accepted |
| D9 | Keep the `openPopup` reset; place each assertion before a reset that follows a window, and at the top of a dApp-fixture test that opens a popup first | Codex R1 #1 (blocker). Alternative (per-test arrays) rejected in § Architecture | accepted |
| D10 | Arm `waitForPopup` before the action that opens a logger window; one `data-testid` on the logger root as the capture test's readiness signal | Codex R1 #2, #4 | accepted |
| D-orch-1 | Single arc, one PR against `dev`, no stack | Orchestrator | accepted |
| D-orch-2 | The no-ask record in § UI impact is the whole visible budget. The logger window's `data-testid` is the one product edit outside R2 (it renders the same). An R2 fix ships only with the panel's agreement, a test red on base and its own UI impact line stating the surface shows the same before and after; an R3 finding is an issue, the PR says `Refs #325`, Phase 1 ships alone and `OWNER-ASKS.md` gets the "what ships now" entry. The record is quoted in the PR body | Orchestrator, at approval | accepted |
| D-orch-3 | Nothing is filtered: every error the wider recording surfaces is classified R1-R4 and recorded in `lessons/phase-2.md` with file, URL, text and disposition. An assertion moves only to a point where the arrays still hold its window (the `openPopup` reset kept); the PR body lists every move with its reason | Orchestrator, at approval | accepted |
| D-orch-4 | #326 is fixed in the fixture and proven by the probe record: the child is killed only past the parent's `exec`, the sibling zombie test uses the same helper, the report carries the counts. No retry, wider wait or `skipIf`; widened copies run with `-t zombie` and never stay in the tree | Orchestrator, at approval | accepted |
| D-orch-5 | Host sequencing: e2e runs start only once `e2e-followups-5`'s PR is open (it opened as #328); unit work and Phase 1 probes earlier but off cores 0-1. Merge `origin/dev` before the final gates; the attach comment's Firefox clause only if that merge carries the close-time exception print. Fresh armed build per browser for smoke under `env -u EXTENSION_PATH`; the sweep tap removed and `git diff` proven clean before the PR | Orchestrator, at approval | accepted |
| D-orch-6 | Never dispatch `nightly.yml`, `release*.yml` or `publish-*.yml`; `lessons.md` gains nothing unless a retirement pays for it; never a union merge | Orchestrator, at approval | accepted |
| D-orch-7 | An R3 or R4 issue is filed deduped, five sections, with a `Record` link to this plan, and named in the report with its disposition | Orchestrator, at approval | accepted |
| D12 | `grantCapBundle` waits for the capabilities window to close (10 s, as `approveVerify` waits for its own) before returning, so a cap fixture's first assertion covers the grant window's teardown | Pre-sweep Opus review #1 (`resolveInteraction` precedes `closeWindow(true)`); the fix sits in the helper that owns the window | accepted |
| D13 | Pattern (b) of the step-6 audit, a window still open or closing at the last assertion, is closed by waiting for the window's close (`register-token`) or by closing it through its own control (`snack-placement`'s execute window, `rejectExecute`) before the assertion | Implementer, from the audit; no assertion removed or loosened | accepted |
| D14 | Order: the Codex loop and the final Opus review ran while the gate's network rounds ran, on the committed head (the uncommitted sweep tap excluded), not after the unit arc gate. The code was final but for what the reviews changed; the unit arc gate and the gate's rounds 2-3 then ran on the reviewed head | Implementer: the gate's e2e rounds hold the worktree for hours and the tap must stay applied through them, while `test:all` cannot pass with the tap applied (the browser-seam guard reds on it) | accepted |

## Audit verdicts

### Implementation: Opus 5.5 pre-sweep review (general-purpose): conditional approve

Run on the first three implementation commits while the host's other lead held the e2e slot, before any e2e spend. Seven findings, all checked against the tree; four accepted (`grantCapBundle` returned before the capabilities window closed, D12; the step-6 audit table's line numbers and fixture scope; the attach comment implied Firefox reported a pre-attach error; the top-of-body comments omitted the setup popup), three rejected with reasons (a window leaked when `waitForPopup` fails late affects only a retry, which `RetryErrorReporter` already explains; asserting arrays a test did not assert before is outside this arc, and the sweep inventories both arrays anyway; the zombie helper cannot kill a child whose pid it never read). Table in `lessons/phase-2.md`.

### Implementation: Codex round 1 (gpt-6.1-sol, high, read-only): approve

Over the net diff from the merge base (8d01f9b) at 55d6a86, with this plan, the ledger and the sweep's record. "No material findings. Confidence: high." Session `01a1327a-…`.

### Implementation: Opus 5.5 final review (general-purpose), beside Codex round 1: approve

One minor and three nits, all checked and accepted (36d8ea5): the skill now states that an assertion covers an approval window's teardown only once `waitForPopupClosed` returned; `grantCapBundle` asserts the dApp's answer before the close wait; the zombie helper checks the parent is alive before reading `comm`, so a shell that dies before its exec fails as such (re-certified 10/10 unpinned and 10/10 widened); `PopupKind`'s logger note no longer claims one URL (the developer page adds `?logId=`), and the attach comment fits 100 columns. It confirmed the Firefox clause against #328's relay (`recent` keeps every exception, emitted or not; printed at close when non-empty) and that no `grantCapBundle` caller leaves the window open after approve.

### Implementation: Codex round 2 (resumed): approve

Over the round's delta (`55d6a86..36d8ea5`): "No material findings. The delta introduces no new problems and leaves the round-1 approval unchanged. Confidence: high." The loop converged at round 2.

The plan's own audits, before approval:


### Codex, round 1 (gpt-6.1-sol, high): reject

Blocking: popup resets still erase approval errors; logger discovery can exclude the window just opened. Every finding was checked against the tree and held.

| # | Finding | Disposition |
|---|---|---|
| 1 | [blocker] Recording does not put the windows under the eight assertions: `openPopup` replaces the arrays (`extension.ts:1269`), e.g. `execute-scope-chain` `:64-66`, `execute-scope-account` `:128, :162`, `connect-dapp` `:24` | **Accepted.** Fact 6a, D9, Phase 2 step 6. The reset contract stays. |
| 2 | [major] `waitForPopup`'s URL snapshot can exclude a logger window opened before the call (`rows.test.ts:432`, the new test) | **Accepted.** D10: arm before the open; `rows` keeps its target set for the count; the arming note on `PopupKind`. |
| 3 | [major] Nothing guarantees a pre-attach error fails a later wait (`popups.ts:81-91` checks frame and heartbeat only) | **Accepted.** I1 and the attach comment narrowed to "may be absent"; Chrome reports it nowhere. |
| 4 | [major] The capture test's red must be attributable: logger readiness, `console._error`, the sentinel barrier, each mutation failing for its own reason, the window closed on failure | **Accepted.** Phase 2 steps 4 and 5 (one `data-testid` on the logger root). |
| 5 | [major] The zombie helper needs failure-path ownership: bounded pid read, pid check, both processes killed on setup failure, parent exit is a failure | **Accepted.** § Architecture, Phase 1 steps 3 and 4. |
| 6 | [minor] Smoke builds nothing: fresh armed builds per browser, `env -u EXTENSION_PATH`, runtime declarations; the JSONL is an inventory, not coverage; control errors and sensitive text | **Accepted.** Phase 2 step 7 and the gate; R-rules on control nonces and text review. |
| 7 | [minor] R3's trigger covers every required asserting test, not only the eight network files | **Accepted.** R3 and R4 reworded. |

### Opus 5.5 Plan lens, round 1: conditional approve

Conditions: findings 1-5 fixed in the plan. Every finding was checked against the tree and held.

| # | Finding | Disposition |
|---|---|---|
| 1 | [major] `openPopup` empties the arrays after the windows in `connect-dapp`, `execute-scope-chain`, `execute-scope-account`; the skill's reset sentence becomes false | **Accepted in part.** Same as Codex #1, fixed in place (D11 records the split: Opus proposed documenting and filing an issue instead). The skill sentence is rewritten (Phase 2 step 9). |
| 2 | [major] CI runs `delete-after-prove` and three other window files prover-ON on the `canary` job; the sweep ran them proverless | **Accepted.** Fact 11, D7; the sweep and the gate run them prover-ON. |
| 3 | [major] Arm `waitForPopup` before the open; CI's smoke retries twice over a shared fixture, so a stale logger window at the same URL never matches; the logger closes without an active profile | **Accepted.** D10; the per-run `capture` query, the `finally` close, `ensureUnlocked`. |
| 4 | [major] A second `waitForPopup` after a hash change rests on an unchecked URL update on Chrome; and Fact 3's "no caller does that today" is wrong (`fixtures/send.ts:15`) | **Accepted.** D5: the guard is proven by a direct second call; Fact 3 corrected and cited for D3. |
| 5 | [major] The attach comment's "the next wait fails" claims a safeguard that does not exist | **Accepted.** Same as Codex #3. |
| 6 | [minor] One pass cannot catch timing-dependent errors; attribution across a file-scoped fixture is approximate | **Accepted.** Three rounds of the eight files per browser; the tap's attribution caveat. |
| 7 | [minor] R3 must cover the smoke tests; R1 needs a stop for a cause in another open lane's files | **Accepted.** R1 and R3 reworded. |
| 8 | [minor] Helper failure cleanup; "the shell", not "dash"; probes ran on Node; widened copies with `-t zombie`, never left in the tree | **Accepted.** Phase 1 steps 1, 3, 6. |
| 9 | [minor] `rows`' Ctrl-click tab is unrecorded under an array assertion | **Accepted as an exclusion.** D4, Fact 12: `waitForNewTab` yields no `Page`. |

Opus confirmed: I1 holds (on Chrome, `Runtime.enable` replays earlier exceptions before `asPage()` resolves); the `WeakSet` guard on both drivers; the `comm` rule for any shell; `"logger"` has two callers; the tap's file is gitignored; R3's fallback is the only one that loosens nothing.

### Codex, round 3 (resumed): approve

"No new material findings. The round-2 conditions are resolved in the plan." Confidence: high. This is the plan's final Codex verdict.

### Codex, round 2 (resumed): conditional approve

Conditions: complete the assertion coverage at the sites below and specify a safe cleanup order. All three findings checked and accepted.

| # | Finding | Disposition |
|---|---|---|
| 1 | [minor] `execute-scope-account:86` and `execute-scope-chain:42` also clear the fixture's window errors before the body's first assertion | **Accepted.** Phase 2 step 6 names both. |
| 2 | [major] `connect-one-window` drives the verify approval and the capabilities window after its only assertion (`:182`, `:197-212`) | **Accepted.** A final assertion after the capabilities window closes; step 6's audit also looks for windows after the last assertion. |
| 3 | [minor] Cleanup order: kill the child while the parent still holds it, then the parent; tolerate only `ESRCH`; never replace the original failure | **Accepted.** § Architecture and Phase 1 steps 3-4. |

Round-1 findings: 2, 3, 6 and 7 resolved; 1, 4 and 5 resolved at plan level with the clarifications above. Codex kept D11 (assertions in place) over the Opus alternative, and judged the direct second recorder call, the UUID logger URL, the readiness test id and the Ctrl-click exclusion proportionate.

Codex confirmed: the `comm == sleep` wait is the cause fix (Linux sets `comm` after `exec`'s point of no return); one helper for both zombie tests; the export, the attach right after `asPage()` and the `WeakSet` guard; removing `connect-one-window`'s local recorder.

## Seeds (draft; the orchestrator owns execution)

```
/goal Phases 1 and 2 of implementations-plan/e2e-followups-6/plan.md are marked ✓ in the file, each backed by its validation gate reported passing in the transcript; LESSONS_FILE=implementations-plan/e2e-followups-6/lessons/phase-N.md printed for each phase; /code-review NOT run (code_review: off); the Codex fix loop on gpt-6.1-sol converged, evidenced by a resumed pass reporting no new material findings, quoted in the transcript; one PR against dev exists, opened only after that (gh pr view output in the transcript), carrying the close-out that archived the plan (git show --stat of the archive-move commit); bun run test:all and bun run lint both exit 0 in the transcript.
```

```
/loop 15m Drive implementations-plan/e2e-followups-6 forward. Never idle waiting for input. Each firing: read plan.md and lessons/ (authoritative, not the chat); if implementations-plan/archive/e2e-followups-6/plan.md is on origin/dev (git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/e2e-followups-6/plan.md), run agent-worktree done e2e-followups-6 --merged --trunk dev, report and stop; if the PR exists, babysit CI only. Otherwise take the next pending step, run lint + the touched unit file after each edit, commit. Stuck or facing a decision: consult Codex (run-codex.sh, high, read-only, gpt-6.1-sol) and log it in lessons/. Same step failed 5 times: reassess with Codex. Phase gate passed: mark ✓, print LESSONS_FILE=…, advance. All phases ✓: the arc gate, the Codex fix loop (hard stop at 3 rounds), gh pr create --base dev, the close-out commits, gh pr checks --watch, report and stop. Hard limits: never merge, never push to main, never widen a wait, add a retry, skipIf, suppression or filter, never change what a person sees without an owner record.
```
