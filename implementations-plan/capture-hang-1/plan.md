---
plan: capture-hang-1
tier: light
status: arc 1 implemented, gate green, Codex loop converged; PR pending
issues: "#885 (arc 1 closes)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); one Codex audit (gpt-6.1-sol, high) and its resume; one Opus Plan leg
base: origin/dev at 24399338
trunk: dev
post_implementation_hardening: not scheduled
---

# capture-hang-1: photograph only a page that is shown

One arc, one PR against `dev`. Recon: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md) (none). Experiments: [lessons/phase-0.md](lessons/phase-0.md).

## Root cause (#885)

**Path (demonstrated, two runs).** Initial conditions: capture mode (`NULO_E2E_SHOT_DIR` set), Chrome. `connect-verify-mismatch.test.ts` case 2 opens the wallet with `openPopup`, then the playground with `openPlayground`. On Chrome `newPage` opens a tab in the same window (`fixtures/browser/chrome.ts:239`), so the wallet tab becomes a background tab: `document.visibilityState` is `hidden` from then on. Actions, in order: the spec drives the hidden wallet tab to Connected apps and calls `shotSend(wallet, …)` (`:81`). `shotSend` takes the light capture, flips the theme, waits up to 1 s for transitions that a hidden tab never runs, and takes the dark capture. Invariant broken: `shotSend` photographs what a person sees, so its page must be shown. Consequence: the dark `page.screenshot` does not return within the test's 150 s (Puppeteer's `protocolTimeout`, 300 s, would reject it later); the test times out and the CSP read at close times out after it. Capture mode cannot picture this file.

**Evidence** (r1 and r2 in the lessons): in the hidden tab no animation frame runs in 20 s. One capture returns, and a second one at once returns too. A capture 2 s later did not return in 20 s with no theme change (C); r1's dark capture is the same after one. r2's capture D, after the flip, proves nothing alone: it queued behind C's screenshot lock (F2). After `page.bringToFront()` the page is `visible`, a frame runs in 27 ms, and the dark capture takes 44 ms. `page.evaluate` answers throughout, so the renderer is alive. Why Chrome serves the first capture of a hidden tab is not established; the fix does not depend on it.

**Not the cause.** The theme flip: capture C hung with no flip. A page that never settles: `settleThemeTransitions` returns at its 1 s bound. A different window: the probe reads the same page.

**Why only this case.** Case 1 shoots a popup window, which is visible. Firefox opens every page as a window (`firefox.ts:395`). The other `shotSend` sites shoot a page opened just before, a popup window, or a page brought to front first (recon samples them; the arc's capture run over every shooting file settles it).

## Outcome & Quality Bar

For a maintainer who captures pictures for a popup PR:

- Capture mode runs a file exactly as CI runs it, plus the files it writes. It never changes which page is shown.
- A shot of a page that is not shown fails at once with a message that names the cause and the remedy, never as a 150 s timeout.
- `connect-verify-mismatch.test.ts` passes in capture mode 3 of 3 on Chrome at retry 0, with all six pictures written, and passes without capture mode on both browsers.

## Architecture & Implementation

- **The spec drives each page while it is shown** (`network/connect-verify-mismatch.test.ts`, case 2). Add `await wallet.bringToFront()` before `listConnectedApps(wallet)` and the row click, and `await dapp.bringToFront()` before `clickByTestId(dapp, "pg-btn-disconnect")`. One comment: the playground's tab hides the wallet's, and a hidden tab draws no frame to photograph. The dApp is brought back so its own steps keep today's order of activation, not for a seen failure (I2). Capture and CI then follow the same order.
- **`shotSend` refuses a page that is not shown** (`fixtures/send-page.ts`). In capture mode only, as the first statement after `if (!dir) return`, so a hidden page skips the scroll and the 3 s enter wait: read `document.visibilityState`; if it is not `visible`, throw `shotSend(<name>): the page is <state>; a hidden page draws no frame, and its capture can hang. Bring it to the front where the spec acts on it.` The doc comment states it as an entry precondition, not a guarantee against every later hang. No browser branch.
- **Regression test** (`apps/extension/scripts/e2e/shot-send.test.ts`, new, run by `bun run test`). A fake `Page`: an `async` `evaluate` that runs the passed function with its arguments in the test's jsdom document (a throw becomes a rejection, as in Puppeteer), a resolving `waitForFunction`, and a `screenshot` spy that records the path and the theme at the call. `document.getAnimations` is stubbed to `[]` (jsdom has none); `afterEach` restores mocks, the stubbed env, the visibility getter and the theme. Test 1, refusal: `vi.spyOn(document, "visibilityState", "get")` returns `hidden`; `shotSend` rejects with the named error and makes no `screenshot` call. Test 2, success control: `visible` gives two captures, `<name>.png` under the light theme then `<name>-dark.png` under the dark one, and the theme ends as it began. Test 3, the CI boundary: without `NULO_E2E_SHOT_DIR`, `shotSend` makes no page call at all. The unit test proves the refusal and the mode boundary only; that showing the page repairs the capture rests on r2, the negative control and the capture runs.
- **Docs and one false comment.** `e2e/README.md:273`: the `shotSend` row adds that it refuses a page not shown. `e2e/README.md:275`: the flags live in `fixtures/browser/chrome.ts`, not `extension.ts`. `chrome.ts:60-64`: one clause, r2's finding: the flags do not make a background tab draw; a tab behind another runs no frame until it is brought to front. `.claude/skills/e2e-testing/SKILL.md` § Env vars: a `NULO_E2E_SHOT_DIR` row (capture mode; the shot page must be shown, Chrome's `newPage` hides the tab before it).
- **File map:** the spec, `send-page.ts`, the new unit test, the two README lines, the skill row, the `chrome.ts` comment. No product file, no driver or CI behaviour.

### Trade-offs and alternatives not taken

- **`shotSend` brings the page to front itself.** Rejected: it changes which page is hidden for the rest of the test in capture mode only, so a capture run diverges from the CI run (in r2 the playground ran hidden afterwards). Undoing it needs the window's previous active tab, a save-and-restore step inside a test helper.
- **Chrome's `newPage` opens a window, as Firefox's does.** Rejected: it changes window and focus behaviour for every Chrome spec, far outside this issue.
- **The guard runs in CI too.** Rejected (D3): CI takes no picture, so a hidden page at a `shotSend` site has no consequence there, and a required gate would go red on a precondition with no consequence, with no Firefox evidence at any shooting site.
- **Wait for the capture with a bound, or retry it.** Rejected: a timeout or retry over a page that cannot paint (the lane's rule).

## Phase 1 — show the page, refuse a hidden one ✓

1. Take base timings first, from the base copy: case times of the file without capture mode, once per browser (Chrome on 24399338: 14.1 s and 22.6 s).
2. Make the spec, guard, unit test and doc changes above.
3. Negative control, never committed: remove the two `bringToFront` lines, run the file in capture mode on Chrome. Accept only a fast failure at the wallet's shot with the guard's message. Restore; `git diff` shows only the fix.

**Validation gate.** Warning: start each e2e run only when load1 < 150 (`until [ "$(cut -d. -f1 /proc/loadavg)" -lt 150 ]; do sleep 30; done`), and never run two `e2e:agent` runs in this worktree at once.

- Run `bun run lint`, `bun run typecheck:all`, `bun run test:all`, and `bun run --cwd apps/extension test -- scripts/e2e/shot-send.test.ts`. Pass: each exits 0; the new file has 3 passed.
- Run three times on Chrome: `NULO_E2E_PROVERLESS=1 NULO_E2E_SHOT_DIR=<scratch>/run-N NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/connect-verify-mismatch.test.ts --retry=0`. Pass: each run `2 passed`, and its dir holds six PNGs (`verify-mismatch-new`, `-settings-row`, `-reconnect`, each with `-dark`) that show the expected screens.
- Run the same file once with `NULO_E2E_BROWSER=firefox` in capture mode (the guard and the fresh check windows on Firefox). Pass: `2 passed`, six PNGs.
- Run the same file once without `NULO_E2E_SHOT_DIR`, on Chrome, then on Firefox. Pass: `2 passed` each. Record the case times beside the base.
- Run capture mode once over every other file that shoots, on Chrome; record the exact file list in `lessons/phase-1.md` (`grep -rl` for `shotSend` and for `journal-page`'s shot helpers at the arc's head). Network: the 16 other network files that call `shotSend` and the 2 that call it through `journal-page.ts` (recon; one fewer once #886 deletes `connect-one-window`), in one `e2e:agent` run. Smoke: the 21 smoke files, on an armed build (`VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:chrome`, then `NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 NULO_E2E_SHOT_DIR=<scratch> env -u EXTENSION_PATH bun run test:e2e --retry=0 <files>` from `apps/extension`). Pass: no guard refusal and no hang. A red that is not the guard is read honestly: one rerun for a known flake (the ledger in the e2e skill), a stop for anything else. A guard refusal is this issue's cause at another site: trace it, fix it the same way in that spec, list it in the PR, and rerun that file. Firefox gets no sweep: every page the suite opens there is a window; a missed site fails at once with the guard's message in a manual tool.
- Layers: lint, typecheck, unit, smoke and network e2e (Chrome; Firefox for the touched spec).
- **Result** (2026-10-20, head 7a68e198, retry 0): lint, `typecheck:all`, `test:all` exit 0; unit 3 passed; negative control red in 9.8 s with the guard's message; Chrome capture 3/3 and Firefox capture 1/1, six PNGs each; plain Chrome and Firefox `2 passed`; capture sweep: network 18 files (64 tests, 98 PNGs), smoke 21 files (105 passed, 1 skipped, 120 PNGs), no refusal. Case times (case 1 / case 2): base Chrome 14.1 / 22.6 s, Firefox 24.9 / 29.4 s; after Chrome 17.3 / 13.6 s, Firefox 21.2 / 20.8 s (one run each, host load 136-147). Log: [lessons/phase-1.md](lessons/phase-1.md).

## Security & Adversarial Considerations

Test code only: no product, permission, storage, wire or CI change. The capture dir is a local path the runner sets; nothing new reads from it. An attacker who can run code in an extension page already holds more than this test touches. The risk is the test's honesty: no assertion is loosened, skipped or retried, and the guard adds a refusal. Capture mode stays off in CI (`NULO_E2E_SHOT_DIR` appears in no workflow).

## Assumptions

- **Facts.** F1 Chrome's `newPage` is `browser.newPage()`, a tab (`chrome.ts:239`); Firefox's is `newPage({ type: "window" })` (`firefox.ts:395`). F2 Puppeteer 25.8's `_screenshot` sends `Page.captureScreenshot` with no `bringToFront` (`puppeteer-core/lib/puppeteer/cdp/Page.js:855-889`), and `screenshot` holds the browser context's screenshot lock (`api/Page.js:1012`), so one hung capture also holds later captures in the same browser context. F3 r1 and r2 as recorded in the lessons. F4 `shotSend` returns at once without `NULO_E2E_SHOT_DIR`, and no workflow sets it. F5 `scripts/e2e/*.test.ts` can import `send-page.ts` under `bun run test` (probe, import 4.6 s). F6 the launch adds `--disable-renderer-backgrounding` and `--disable-backgrounding-occluded-windows` (`chrome.ts:53-72`), and Puppeteer's default args add `--disable-background-timer-throttling` (`ChromeLauncher.js`, `ignoreDefaultArgs` drops only `--disable-extensions`). F7 the wallet's source registers no `visibilitychange` listener (`grep -rn visibilitychange apps/extension/src`: none).
- **Inferences.** I1 no other `shotSend` site shoots a hidden page; the Chrome capture run over every shooting file tests it, on Chrome only. I2 the dApp's reconnect is safe either way (r2 passed with it hidden). I3 showing the wallet tab changes nothing case 2 asserts: its frames and transitions now run, and the later waits check presence and size, which held on the hidden page too (F7; Opus r1 #5). I4 no fresh window reports `hidden` at its first `shotSend`; the Firefox capture run of the touched spec tests that path.
- **Asks.** None.

## Decision ledger

- D1 The cause is a capture of a hidden Chrome tab (demonstrated, r1 and r2).
- D2 Fix the spec's order: show each page before the spec acts on it. Not in `shotSend`, not in the driver (trade-offs above).
- D3 `shotSend` refuses a page not shown, in capture mode only.
- D4 The regression test is the unit test (refusal, success control, CI boundary) plus the negative control; the capture runs are the proof.
- D5 Correct the `chrome.ts` comment and README:275 that r2 contradicts; leave `wallet-pages.ts:141-144` as it is (its `bringToFront` is right).
- D6 (deviation, the tree won) `shotSend` and `settleThemeTransitions` move to a new leaf module, `tests/e2e/fixtures/shots.ts`, and `send-page.ts` re-exports both, so no importer changes. Importing `send-page.ts` in the unit test pulled its fixture graph (`legal-drivers`, `wallet-pages`, `extension.ts`, `journal.ts`) into `tsconfig.scripts.json`'s program, which lacks the e2e `ProvidedContext` typings: `typecheck:all` failed with 33 errors in untouched files. Excluding the test from that program would loosen a gate; a re-export is the house pattern (`composables/{toast,outside}.js`). The page builds the testid selector itself in place of `send-page`'s private `sel`.

## Delivery

Branch `capture-hang-1-a1` off `origin/dev`, with the plan commit cherry-picked on it. One PR against `dev` with `gh pr create`, after the gate passes and the Codex loop converges, and after merging `origin/dev`. Title: `test(e2e): capture mode refuses a hidden page; the reconnect case fronts its wallet` (83 characters). Body: the path and its evidence, the gate's runs with outcomes and the file's case times before and after per browser, `UI impact: none`, `Closes #885`. No label: the smoke and network lanes run on `apps/extension/**`. Overlap: PR #886 edits case 1's title in the same spec; no shared lines. Single arc; no parallel lanes.

## Post-implementation

Follow `implementations-plan/README.md` § Post-implementation standard at `24399338`, once over the arc's diff. `code_review: off`: no `/code-review`. The Codex loop: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; stop at three rounds; log each round in `lessons/phase-1.md` and under Audit verdicts. One Opus diff review beside round 1. A fix that grows the design stops for the orchestrator. Close-out as the PR's final commits: the Outcome, one line promoted to `lessons.md` (a hidden Chrome tab runs no frame; bring it to front before a capture), `STATUS.md` deleted, the archive move with its index line. Teardown after the merge: `agent-worktree done capture-hang-1 --merged`.

## Audit verdicts

**Round 1, Codex** (gpt-6.1-sol, high, session 01a15664, account alejo-icloud through `CODEX_ACCOUNT=best`): conditional approve, 6 findings. #1 F6 missed Puppeteer's default `--disable-background-timer-throttling`: verified, accepted (F6 fixed, the dApp's 1 Hz rationale dropped). #2 F7 overclaimed: accepted (I3). #3 a fresh window may read `hidden` at first; the Firefox run had capture off: accepted (Firefox capture run, I4; no sleep or retry). #4 the unit test proves refusal, not scheduling; fake details; a CI-boundary test: accepted (three tests). #5 I1 rests on one sweep: accepted (exact file list recorded). #6 keep D2 and capture-only D3; word the guard as an entry precondition: accepted.

**Round 2, Codex** (resume): conditional approve, 2 findings, both accepted: the gate and `/goal` now count three unit tests and the Firefox capture run; r2's capture D is confounded by C's screenshot lock, so the evidence rests on C (no flip) and r1 (after the flip), and F2 says "the same browser context".

**Round 3, Codex** (resume): **approve**, high confidence; both fixes verified, no regression.

**Implementation round 1** (diff 656ac563..2291972b). Codex (gpt-6.1-sol, high, session 01a1567c): conditional approve, 2 comment findings, both accepted: the `chrome.ts` comment kept two unverified claims beside r2's finding (rewritten to what the flags keep rendering and what they do not); the `shotSend` doc comment carried policy prose (trimmed). It found the move, the re-export and the guard's place behaviour-neutral. Opus diff review: approve, 2 nits accepted: the spec comment gave the dApp's fronting a reason I2 refutes (now: the rest of the case keeps its order); test 1 did not prove the refusal precedes the enter wait (it now asserts no `waitForFunction`). Fixes: 7a68e198.

**Implementation round 2** (Codex resume): **approve**, no findings; the loop converged.

**Round 1, Opus Plan:** conditional approve, 5 findings. #1 no Firefox capture run: accepted (as Codex #3). #2 the guard's place: accepted (first statement; browser-neutral message). #3 fake-Page details (`pretendToBeVisual`, async `evaluate`, `waitForFunction`, env and mock restore): accepted. #4 `chrome.ts:60-64` and README:275 contradict r2: accepted (D5). #5 case 2's CI conditions shift: no fix, recorded (I3). Also fixed: the title is 83 characters; "never returns" narrowed; the screenshot lock added to F2; recon's line range; the skill has an env-var table, not a focus section.

## Seeds

`/goal` (recommended): `/goal Phase 1 of implementations-plan/capture-hang-1/plan.md is ✓, backed by its validation gate in the transcript (lint, typecheck:all, test:all, the unit test 3 passed, the negative control failing fast with the guard's message, connect-verify-mismatch 3/3 in capture mode on Chrome and 1/1 on Firefox with six PNGs each, once without capture on Chrome and Firefox, the capture run over every other shooting file with no refusal or hang), LESSONS_FILE=implementations-plan/capture-hang-1/lessons/phase-1.md printed; code_review is off and /code-review was not run; the Codex fix loop converged (a resumed pass with no new material finding, quoted); the PR exists, opened after the loop (gh pr view output).`

`/loop` (fallback): `/loop 15m Drive implementations-plan/capture-hang-1 forward; never idle. Read plan.md and lessons/. If the plan directory is gone, git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/capture-hang-1/plan.md: success means merged, so run agent-worktree done capture-hang-1 --merged and stop; failure means delivered, so watch the PR's checks. Otherwise run phase 1's gate, then the Post-implementation section. Never merge. The same step failing 5 times: reassess with Codex.`
