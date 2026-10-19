---
plan: egress-flake-1
tier: light
status: planned, final Codex approve; arc 1 in progress
issues: "#857 (arc 1 closes)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); one Codex audit (gpt-6.1-sol, high) and its resume; one Opus Plan leg
base: origin/dev at 691e69eb (dev at 2a5960da when planned; #860 touches no fixture)
trunk: dev
post_implementation_hardening: not scheduled
---

# egress-flake-1: a reply to a request its worker's stop cancelled is no interception failure

One arc, one PR against `dev`. Recon: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md) (none). The probe, its output and every consult: [lessons/phase-0.md](lessons/phase-0.md).

## Root cause (#857)

**Path (the probe demonstrates it; it is the strongly supported explanation of the CI failure).** Initial conditions: a spec arms its own `interceptRpc` on the Testnet node's origin, which stays armed through a kill (`fixtures/browser/standing-interception.ts:29-31`); `rows.test.ts:1105-1160` redirects it to a stub that never answers, which keeps the defaults' node requests open. Actions, in order: Chrome pauses one of the worker's node requests (`Fetch.requestPaused` on the interception's worker session); `stopBackground` closes the worker with an unattached `Target.closeTarget` (`fixtures/browser/chrome.ts:140-194`, `closeTarget` at `:162`); Chrome cancels the paused request; the interception's reply (`Fetch.continueRequest`, or `Fetch.failRequest` in `refuse` mode) arrives after the cancel. The worker's session stays attached (Chrome parks a stopped worker's host for any attached session), so Chrome answers `Invalid InterceptionId.`, not `Target closed` / `Session closed`. `failUnlessGone` (`fixtures/browser/chrome-rpc-intercept.ts:60-63`) treats only those as gone and records a failure, which the egress guard turns into the launch's close failure (`fixtures/egress-guard.ts:364-385`). Invariant broken: only a live target that could not be armed, resumed or answered is a failure; Chrome had already cancelled this request. Consequence: a red required gate (`extension-smoke-e2e-status`) on a passing test.

**Evidence.**
- CI, job 118121924844: `reply to /aztec-testnet/<key> failed: ProtocolError: Protocol error (Fetch.continueRequest): Invalid InterceptionId.`, label `service_worker:…/service-worker-loader.js`, on every attempt.
- Probe, Chrome 152.0.7977.42 (Puppeteer 25.8.0's pin, the build CI installs from `bun.lock`; the CI log prints no version), the fixture's own attach mode: pause, close the worker, wait, reply. The session got no `detachedFromTarget` and Puppeteer no `targetdestroyed` in 5 s; the reply failed with that exact string (and `Fetch.failRequest` with its twin). A reply sent in the tick after `closeTarget` succeeded: the window is real. Control, a reply on the live worker: success.
- Probe, the same message's other causes: a live worker aborting its own paused fetch, and an id no paused request has. A second reply to an answered id gets a different message, `Invalid state for continueInterceptedRequest`.
- Probe, Firefox 153.0.4, the real `observeAndIntercept` and `stopBackground`: three redirected requests open at the stub, all three closed by the kill, `failures: []` in both modes. The observer decides inside `http-on-modify-request` (`firefox-rpc-intercept.ts:39-51`), so Firefox has no paused request to answer late.

**Claims that held:** every step of the issue's path reproduces, and its invariant stands. **Not established:** that CI's failure took this path. The CI string is also what a caller's abort or an unknown id gets; the kill in the test and the worker session's label make the stop the strong candidate. **Not reproduced locally** in the issue's own runs (rows green on `b152e88e`): the probe makes the order deterministic instead.

## Outcome & Quality Bar

For a maintainer reading a red smoke lane: an interception failure means a live target or a still-paused request the harness could not handle, never a request Chrome itself cancelled.

- A reply Chrome refuses because the paused request no longer exists is logged, not failed, on both reply methods; any other refused reply still fails, proven by a unit test fed the recorded strings.
- No assertion, timeout or retry changes; the Firefox path does not change.

## Architecture & Implementation

- **Change.** `failUnlessGone`'s one regex gains `invalid interceptionid`; its comment gains one clause, claiming only what the message proves: Chrome holds no paused request under the event's id, because its worker's stop or its caller's abort cancelled it before the reply.
- **Test.** `scripts/e2e/chrome-rpc-intercept.test.ts` (already in `bun run test`): the existing fake gains a child session that delivers a `Fetch.requestPaused` and rejects the reply with Puppeteer's `ProtocolError` carrying the recorded message. The fake stores the child's `Fetch.requestPaused` listener and fires it only after `cdpInterceptRpc` resolves (a rejection before then throws from the arm, not the path CI took); `Fetch.enable` and `Runtime.runIfWaitingForDebugger` resolve, only the reply rejects; one macrotask passes before the reads. Three cases: `Invalid InterceptionId.` on `Fetch.continueRequest` (redirect) and on `Fetch.failRequest` (refuse) leaves `failures()` empty; `Invalid state for continueInterceptedRequest` gives one failure naming it. Each case also asserts the one reply the event got: its method, the event's own `requestId`, and the redirect URL (origin swapped, path and query kept) or `errorReason: "ConnectionRefused"`. Since a wrong id now reads as gone at run time, these assertions are what catch one.
- **Docs.** `tests/e2e/FIREFOX.md`'s interception row: its phrase becomes "no target to arm, no first request to race and no paused request to answer late". No new sentence.
- **Ledger.** One row in `.claude/skills/e2e-testing/SKILL.md` § 5 (the owning skill for a flake root-cause).
- **File map:** `chrome-rpc-intercept.ts`, `scripts/e2e/chrome-rpc-intercept.test.ts`, `FIREFOX.md`, the skill. No product, config or CI change.

### Trade-offs and alternatives not taken

- **Scope the class to the reply path** (a second classifier or a flag): only `Fetch.continueRequest` / `Fetch.failRequest` can return the message, so the behaviour is the same; one regex stays the one place that decides. Rejected (D1).
- **Gone only after a kill**, telling death from a caller's abort: Chrome's one message carries no cause, so this needs kill state passed from `standingInterceptions` into every arm, a coordination protocol for no consequence (D2). Rejected.
- **Suspend the spec's interception across the kill too** (`whileReleased`): a context still polling during the kill would reach the real seed endpoint with nothing armed; the spec's interception stays armed for that reason. Rejected (D3).
- **Reply faster / reorder:** the cancel can land after any pause; no order closes the window. Rejected.

## Phase 1 — classify the cancelled request as gone ✓

1. Edit the regex and the comment in `chrome-rpc-intercept.ts`.
2. Add the three cases to `scripts/e2e/chrome-rpc-intercept.test.ts`.
3. Run a negative control, never committed. Remove `|invalid interceptionid` and run the test file. Accept only red on the two gone cases, with the recorded message in the failure. Restore it, then confirm `git diff` shows only the fix.
4. Add the `FIREFOX.md` clause.

**Validation gate.** Warning: start a build or an e2e run only after `until [ "$(cut -d. -f1 /proc/loadavg)" -lt 150 ]; do sleep 30; done`, inside the same tool call. Run one e2e suite at a time in this worktree.

- Run `bun run lint`, `bun run typecheck:all`, `bun run test` and `bun run test:all`. Pass: each exits 0, and the new cases run in `bun run test`.
- Build each browser's armed dist: `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run build:<browser>` in `apps/extension`. Pass: exit 0.
- Run the whole smoke suite per browser (the fixture is shared): `NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 env -u EXTENSION_PATH bun run test:e2e --retry=0`, then with `NULO_E2E_BROWSER=firefox`. Smoke claims its loopback ports in `~/.agents/ports.md`; `agent.sh` runs only the network suite. Pass: every file green; a known-flake red gets one rerun of that file, recorded.
- Run `bun run check:plans` after staging plan files. Pass: exit 0.
- Layers: lint, typecheck, unit, smoke e2e on both browsers. No local network suite (D7).

## Security & Adversarial Considerations

Test harness only: no product, permission, storage, wire or CI change. The risk is the guard's honesty. `Invalid InterceptionId` says Chrome holds no paused job under the id the reply named (Chromium's `FindJob`), nothing more. For the id the event supplied, that means the request was cancelled before the reply (the worker's stop, the caller's abort); whatever Chrome did with it next, the proxy contains. A reply with a wrong id would now also read as gone, and the right request would stay paused; a spec that never awaits that fetch (`rows.test.ts` expects unanswered polls) would pass. The unit cases close that gap at the source: they pin the reply's method, id and target. The egress guard's proxy is separate containment within its configured routes and exceptions, not a detector of interception bugs. `NULO_E2E_INTERCEPT_LOG=1` still prints each gone reply.

## Assumptions

- **Facts.** F1 `failUnlessGone` and its three callers (`chrome-rpc-intercept.ts:60-63, :77, :106, :107`). F2 the spec's interception stays armed through `stopBackground`; only the launch's is released (`standing-interception.ts:29-31, :73-87`; `fixtures/browser/index.ts:284-285`). F3 Chrome's `stopBackground` is an unattached `Target.closeTarget` (`chrome.ts:140-194`). F4 the probe records above, both browsers. F5 the CI string, job 118121924844. F6 `bun run test` includes `scripts/**/*.test.ts` (`apps/extension/vitest.config.ts`). F7 the egress guard fails the close on the interception failures present when it reads them, before the browser closes (`egress-guard.ts:364-385`).
- **Inferences.** I1 on CI's runner the bundle shifted the poll timing so a paused poll met the kill on every attempt of one tree; unverified, and the fix does not depend on it. I2 Chrome's message comes from its interceptor's job lookup, `FindJob` in `devtools_url_loader_interceptor`, when the named id is absent (Codex checked the source); it proves the id's absence, not the cause.
- **Asks.** None. The ledger row's number is A1 in [recon.md](recon.md#collisions).

## Decision ledger

- D1 One regex in `failUnlessGone` decides; no reply-only classifier.
- D2 The class also covers a caller's abort and a wrong id: Chrome's one message carries no cause. For the event's own id both mean the request was cancelled before the reply; a wrong id is the fixture's bug, caught by the unit cases' pin on the reply (Codex r1 #1), not at run time.
- D3 The spec's interception stays armed through the kill.
- D4 Test through `cdpInterceptRpc` and the existing fake: no new export.
- D5 No e2e scenario: the race cannot be parked in the suite; the probe is the reproducer, the unit test the pin.
- D6 No `lessons.md` line: the ledger row in the owning skill is the home.
- D7 Deviation from CLAUDE.md § Quality gates: no local network suite on either browser, though the fixture is shared. The change only turns one CDP reply error into a log line on Chrome; no spec asserts on interception error text (Opus grep); Firefox's path is unchanged; the PR's four network and smoke lanes run in CI on `apps/extension/**` (Opus r1 #3).

## Delivery

Branch `egress-flake-1-a1` off `origin/dev`, carrying the plan commit. One PR against `dev` with `gh pr create`, opened ready after the gate passes, the Codex loop converges and `origin/dev` is merged in. Title: `test(e2e): a reply to a request chrome cancelled is no interception failure` (75 characters). Body: the path and the probe's record, the negative control, the gate with outcomes, `UI impact: none` (the lane brief's record), `Closes #857`. No label: the smoke and network lanes run on `apps/extension/**`.

## Post-implementation

Follow `implementations-plan/README.md` § Post-implementation standard at `175d8268`, once over the arc's diff. `code_review: off`: no `/code-review`. The Codex loop: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; three rounds at most; one Opus diff review beside round 1; each round in `lessons/phase-1.md`. A fix that grows the design stops for the orchestrator. Close-out, as the PR's final commits: the Outcome, the ledger row, `STATUS.md` deleted, the `git mv` into `archive/` in its own commit with the index line moved. Then `gh pr checks <n> --watch`. Never merge. Teardown after the merge: `agent-worktree done egress-flake-1 --merged`.

## Audit verdicts

**Round 1, Codex** (gpt-6.1-sol, high, session 01a15512): conditional approve, 4 findings, all accepted. #1 a wrong-id reply now reads as gone and need not hang a spec (`rows.test.ts` never awaits its polls): the unit cases pin each reply's method, id and target; Security and D2 corrected. #2 the probe demonstrates the path, CI's own history stays the strong explanation; F7 narrowed to failures present when the guard reads them. #3 `FindJob` proves the id's absence, not its cause; the proxy is containment, not detection. #4 keep one regex; no kill tracking.

**Round 1, Opus Plan:** conditional approve, 7 findings, all accepted. #1 the fake fires the pause after the arm resolves, or a rejection throws from the arm. #2 record the Codex round. #3 the local network suite is skipped without saying so: D7; wall-clock dropped, no scenario changes. #4 "keeps polling" and "never sent" overclaimed: reworded. #5 `hits()` proves nothing about the fix: dropped (the reply pin shows the handler ran). #6 the `FIREFOX.md` change folds into the row's phrase. #7 F3's range. Its Ask on CI's Chrome version: the log prints none; `bun.lock` pins Puppeteer 25.8.0, whose build is 152.0.7977.42.

**Final pass, Codex** (resume, session 01a15512): **approve**, no findings, high confidence. It confirmed the four fixes, that a pre-arm rejection would throw from the arm (so the pause fires after it), the dropped `hits()`, and D7 as a documented, proportionate deviation.

**Implementation rounds 1-2** (diff 25f2c63e..b238a08b). Codex r1 (gpt-6.1-sol, high, session 01a15530): approve, 2 comment findings, fixed. Opus diff review: conditional approve, 3 comment findings, fixed (`b238a08b`). Codex r2 (resume): approve, none; the loop converged. Log: [lessons/phase-1.md](lessons/phase-1.md).

## Seeds

`/goal` (recommended): `/goal Phase 1 of implementations-plan/egress-flake-1/plan.md is ✓, backed by its validation gate in the transcript (lint, typecheck:all, test, test:all exit 0; the negative control red on the two gone cases; the whole smoke suite green on Chrome and Firefox at retry 0); code_review is off; the Codex loop converged (a resumed pass with no new material finding, quoted); the PR exists, opened after the loop, with Closes #857.`

`/loop` (fallback): `/loop 15m Drive implementations-plan/egress-flake-1 forward; never idle. If the plan directory is gone, git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/egress-flake-1/plan.md: success means merged, so run agent-worktree done egress-flake-1 --merged and stop; failure means delivered, so watch the PR's checks. Otherwise run phase 1's gate, then the Post-implementation section. Never merge. The same step failing 5 times: reassess with Codex.`
