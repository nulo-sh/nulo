# Phase 0: planning log

Planner session, 2026-10-12, on `origin/dev` at 32b7bf4. Every consult is logged here, failed ones included.

## Issue claims checked against the tree and the logs

### #322 (run 38205877849)

Read with `gh api repos/nulo-sh/nulo/actions/jobs/<id>/logs` (never `gh run view --log`, which echoes step sources).

- Attempt 1, job 114669197110 (`Run / chaos / seed 1960252198 / network suite`, failure). Timeline, runner clock:
  - 05:00:09.41 `[firefox] 153.0.4` (the burst fixture's launch).
  - 05:00:09.44 `JavaScript error: [System Principal], line 11: InternalError: unsafe filename: data:application/javascript;…nulo-e2e:page-errors…`. This is the relay's documented once-per-launch line (the parent process refuses the listener's `data:` script; content processes run it; `FIREFOX.md`, `firefox-page-errors.ts` `listenerSource` doc). It is not a relay failure: the green attempt 2 prints the same line at 05:22:22.37.
  - 05:01:15.51 `[send-chaos] seed=1960252198 … actions=[…]`, logged at the start of the test body, immediately before `connectAccount`.
  - 05:01:18.59, 05:01:18.59, 05:01:18.62: `moz-extension://…/assets/creator-DQZXbG1H.js, line 5: InternalError: too much recursion`, three times within 30 ms, about 3.1 s after the actions line.
  - 05:02:18.3 Firefox housekeeping errors (`FormHandlerParent`, `PrivateBrowsingUtils`) at teardown; 05:02:19.31 the failure, `waitForTarget: no matching target after 60000ms` from `grantCapBundle` (`send-chaos.test.ts:99`).
  - The issue's claim holds: three recursion errors during the 60 s wait. Refinement: they fall about 3 s into `connectAccount`, so inside `connectPlayground` (playground open, discover and verify windows) or at the very start of `grantCapBundle`, not spread across the wait. `connectPlayground` did succeed: the stack names `grantCapBundle`, which runs after it.
  - The stall watchdog line names 62.8 s as the longest silence, which is the failed 60 s wait plus teardown.
- Attempt 2, job 114674042445 (same seed, success, 147 s): the same `unsafe filename` line, no `too much recursion`, no `creator-` error.
- Both attempts built the same `dist/firefox/assets/creator-DQZXbG1H.js` (316.35 kB): one build, two outcomes.
- What the logs cannot say: which document raised the recursion. Firefox prints the script URL, not the page. The relay drops a record whose top context is gone or has no BiDi id (the background page and its frames); for a window BiDi never announced it still emits under an id Puppeteer has no context for, so the error reaches no array (corrected after audit finding C6). The failing test threw at the wait, before any assertion read `pageErrors`, so nothing printed what the relay delivered.

### #319

- The issue's evidence (archived `followups-6/lessons/phase-4.md`): the failing test took 24.5 s, of which the route wait was its full 15 s, so the steps before the lock took about 9.5 s. The test passed alone in 9.4 s end to end. Inference (not a measurement): the steps before the lock did not run noticeably slower than unloaded, which weakens "the whole popup ran late" and leaves the route itself as the outlier.
- History of the helper: until #313 (6488b1b), `waitForLockScreen` reloaded the popup when the hash missed `/popup/auth` at the moment the session record cleared, and its comment named a product race ("a stale post-password-change `bootstrapActiveProfile` flips `isLogined` back to true AFTER the lock"). e2e-followups-3 (D3) made the helper observational: it never reloads, and "a redirect that does not land is a product failure". That lane recorded the named race as guarded in product (`useProfileBootstrap.ts:164-179`, pinned by its test). So since #313 a lost route after a password change can no longer be hidden by the helper; #319 is the first red that would show one.

## Recon

Two Explore agents (sonnet), both returned: the lock route path, and the `creator` chunk with the capability-window wait. Their reports are folded into `recon.md`. One claim of the lock-path agent did not hold (it dismissed L2 because responses and events share one port in order; see the audit below).

## Consults

### Plan audit, round 1 (2026-10-12)

- **Codex**, gpt-6.1-sol at high, session `01a12eb8-783e-7901-a9ff-3c5fb7128eaa` (no `CODEX_ACCOUNT` set; the script ran on the alejo-icloud home). Verdict: **reject**, blocking finding C9 (D2 moved the route step from 15 s to 60 s, and an absent marker could mean "not started"). Fourteen more findings, all accepted or moot; dispositions in `plan.md` § Audit record.
- **Opus lens**, Plan agent on opus. Verdict: **conditional approve**. Its O3 found the lost-route path L2: the background posts a queued lock's event before the response of the read that held the mutex just ahead of it, so a stale "active" answer lands after the seal and sets `isLogined` back to true. The planner verified the hop counts in `lock.ts`, `service.ts` and `base-service.ts` before accepting it (plan Facts 5-7, D7).
- Revision: D2 cut; L2 pinned as the leading hypothesis with its fix shape; probes made non-perturbing with a `nulo:probe:` sentinel; cold samples; W0-W6; the e2e skill's certification bar adopted; S3 behind Ask A1.

### Plan audit, rounds 2 and 3 (2026-10-12)

- **Codex**, round 2, resumed the same session. Verdict: **conditional approve**. It confirmed L2's order in memory with the real `Lock` (read acquired, lock event posted, read response posted) and placed the fence at the `isLogined` write. Conditions: C3, C13, and C16-C21 (a bounded diagnostic race, a synchronized forced L2 probe, a boot and hydration contract, stack-depth honesty, per-context counters, full suites in the gates), plus stale recon lines. All were applied; the L2 fix now reuses `bootstrapFence.invalidate()` from the lock seal.
- **Codex**, round 3, confirmation only. Verdict: **conditional approve**. Every condition was met except C3, because the benign-filter rule still let an out-of-scope source keep the filter. Applied: that branch now leaves #319 open (`Refs`), and no filtered run counts as proof. The panel has converged; the orchestrator's approval is still pending.
