---
plan: viewer-followups-1
tier: light
status: planned, Codex approve, awaiting the orchestrator; code waits until viewer-flake-1's arc 2 (#925) is on dev
issues: "#921, #922, #923 (one arc; #923's pin waits on owner ask A1)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); one Codex audit (gpt-6.1-sol, high) and its resumes; one Opus Plan leg
base: origin/dev at 817cce9d, plus #925 once merged
trunk: dev
post_implementation_hardening: not scheduled
---

# viewer-followups-1: the deep link holds on its log; the search case reads its gap while following

One arc, one PR against `dev` (§ Delivery). Recon: [recon.md](recon.md). Reproductions, probes and consults: [lessons/phase-0.md](lessons/phase-0.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md) (A1). Over the light target (about 200 lines): four findings with their evidence, the gates and probe the audit added, and A1's branches.

## Findings

Each finding was reproduced on arc 2's viewer (lessons/phase-0.md).

- **#923, demonstrated.** Settings → Developer opens the logs window with `?logId=` set to the last failure log.
  - Events: `scrollToTargetLog` dispatches a `center` scroll to the log, and `onMounted` then stops the follow (`LogsViewer.vue:149-158,279-286`). A log in the last half screen makes CodeMirror clamp the view at the end. The scroll's event reads a move down from 0 with a gap under 20, so `updateShouldAutoScroll` resumes the follow (`:103-115`).
  - Consequence: later lines carry the failure log out of view, when the window should hold on it for 30 s.
  - Evidence: Firefox 8/8 and Chrome 5/8; Chrome's 3 others put the log outside the last half screen and held, as they should.
- **#923-B, beside #923, demonstrated under a pump.** A line that lands between the target's dispatch and CodeMirror's first measure runs `holdPlace`. Its snapshot of offset 0 replaces the pending target (`@codemirror/view` `dist/index.js:8005-8007`), so the window opens at the oldest log, not the failure. The pump was one line every 2 ms; it hit Firefox 1/6 and Chrome 5/6, and 0 of 16 runs without it.
- **#922, demonstrated.** The search case reds a correct viewer in two windows; the issue named only the second.
  - Window 1: a wallet line lands between the case's scroll back to the end and that scroll's event, while F3's focus holds the follow. The line is held, then the event resumes the follow in the band without scrolling, and the gap reads 18. Natural Firefox 1/8; injected, 8/8 per browser.
  - Window 2: a wallet line after the refocus is held below the view. Injected, 8/8 per browser.
  - The issue's first option, read the gap before the refocus, does not cover window 1.
- **#921, not reproduced on arc 2.** The issue's mechanism does not hold as stated, and nothing else reproduced:
  - F3 at rest: no scroll event follows the panel's `focusin` (8/8 per browser, base and arc). The panel lifts the view 28 px off the end. CodeMirror's end anchor fires on a height-map change, not on a smaller scroller (recon).
  - A follow in flight across the F3 open does resume on base: with F3 forced between a follow's dispatch and its measure, base resumed 8/8 and the arc held 8/8, per browser. That is P1, which #925 fixes. The 1-in-11 trace has this shape, but its cause cannot be proven now (I1).
  - A follow corrected in a later frame: 0 corrections in 16 bursts of 500 lines, all while following, so a correction across a stop was not shown. Lines never wrap, so their heights are exact.
  - So #921 closes as not reproduced, with this evidence and no code. Reopen on a trace that shows a scroll event, with no follow due, resuming the follow after a search-panel or selection stop.

## Outcome & Quality Bar

For a person who opens the logs from a failure, and for the maintainer reading the required smoke lanes:

- The deep link opens at the failure log, even when lines are pouring in. A flood past the log's cap still trims the log away, as today. On A1 = A, the view also holds on that log until a scroll down, the button or the 30 s timer resumes the follow. Each fix has a unit row that reds on arc 2's viewer, and the browser probe passes on the fixed viewer and reds on arc 2's.
- The search case reds only on a viewer that breaks the hold. It reads the "at the end" precondition while the view follows, where a wallet line is followed too. It measures the hold from a line read two frames after the stop. No assertion is loosened, and no wait on time or retry is added.

## Architecture & Implementation

- **Viewer** (`apps/extension/src/components/JsonViewer/LogsViewer.vue`, `scrollToTargetLog` only). After its dispatch:
  - #923-B: it sets `snapshotPending = true` with `view.requestMeasure({ read: () => (snapshotPending = false) })`. A line before CodeMirror's measure then adds no snapshot, and CodeMirror maps the pending target through the line's changes (F2, F4).
  - #923, on A1 = A: it sets `lastScrollTop = Number.POSITIVE_INFINITY`, the pin `scrollToBottom` sets. The target's landing then reads no move down, and its event resets the reference. A line between the landing and that event lowers the pin to the landing (`holdPlace`'s `Math.min`).
  - One comment states the invariant and the CodeMirror behaviour it rests on. Without the pin: a held line must not replace the pending target, since CodeMirror maps a pending target through later changes and a later scroll effect replaces it. With the pin, the comment adds that the target's landing is the viewer's own scroll, which the scroll handler must not read as the reader's.
  - `onLogAdded`, `scrollToBottom`, `holdPlace` and `updateShouldAutoScroll` stay unchanged, so the burst path is untouched (D3).
- **Unit** (`LogsViewer.test.ts`), a new `describe("LogsViewer opened at a log")` with an `openedAtLatest()` builder: `history.replaceState` to `?logId=3` of 3 before the mount, restored in `afterEach`. Rows:
  - #923-B: a line before the measure's read dispatches no snapshot. Then the test runs the recorded read and lands the target, and the next line dispatches one, the success control. The first half reds on arc 2.
  - #923 (with the pin): the target's scroll lands at 590 of 600 in the end band, and the next line is not followed and shows the button. It reds on arc 2.
  - #923's success control (with the pin): after the target's event, the reader scrolls up past the band and back into it, and the next line is followed.
- **e2e** (`apps/extension/tests/e2e/viewers-csp.test.ts`, the search case only, #922). After F3 the case:
  1. Blurs the field, logs one probe line (`logLines(page, 1)`), and asserts the button shows: F3's focus stopped the follow.
  2. Calls `pointerClick(page, "logs-scroll-btn")`, which resumes the follow at the end through `scrollToBottom`.
  3. Asserts `gapToEnd(page) < AT_END` while the view follows.
  4. Focuses `.cm-search .cm-textfield` in one `evaluate` that resolves two frames later. A follow due at the stop lands in that span, as in `selectAcross`.
  5. Reads `middleLine`, logs 2 lines, and calls `expectHeld`.
  - The in-page `scrollTop = scrollHeight` and the rAF refocus go. The comment says the hold is measured from two frames after the stop, so a move inside that span is not covered (the predecessor's D5). No helper is added, and the other cases, `fixtures/**` and the thresholds stay as they are. The button's centre sits about 7 px above the search panel, which draws over it (F6). A cover fails `pointerClick` loudly; it never passes falsely.
- **#921:** no code. The PR body and a comment on #921 carry the evidence, crediting #925 for the in-flight part.

### Alternatives not taken

- **#922, drop the gap read** (the issue's second option): it removes an assertion, and a run hit by window 1 would start off the end, out of reach of CodeMirror's end anchor (D2).
- **#922, read the gap before the refocus** (the issue's first option): window 1 still reds. A wheel or keyboard scroll back has the same race; only the button lands the view at the end through the viewer itself.
- **#923, a one-shot frame check that clears the pin when the target moved nothing** (A1's option B): exact, but a mount-time frame callback that relies on a scroll event preceding the next frame's callbacks. A nested `requestMeasure` cannot do it, since CodeMirror applies the target only once the request queue is empty (`dist/index.js:8217`).
- **#923, one helper that dispatches and pins, shared with `scrollToBottom`:** it touches the burst path for a two-line saving (D3).
- **#921, a size-change rule** (the issue's possible fix): it answers no reproduced path, and it would hold the reader's first scroll down after any resize.

## Phases

**Before Phase 1:** merge `origin/dev`, with #925, into the worktree branch. Confirm that `LogsViewer.vue` carries the pin (`grep -n POSITIVE_INFINITY`). Read A1's answer in `OWNER-ASKS.md` or the orchestrator's message:
- A: run every step, and the PR closes #923.
- C, or no answer by the arc's start: leave out the steps marked "A1 = A", and the PR refers to #923.
- B: stop and replan the pin's part with the orchestrator before Phase 1. B's frame check is not designed here.

**Browser probes and builds.** Warning: start every build and every e2e run only once `until [ "$(cut -d. -f1 /proc/loadavg)" -lt 150 ]; do sleep 30; done` returns. Run one e2e at a time in this worktree.
- Build each browser armed: `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:<browser>`.
- Smoke runs go through `test:e2e`, which claims its own ports in `~/.agents/ports.md` (`agent.sh` runs only the network config). From `apps/extension`: `NULO_E2E_BROWSER=firefox NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 env -u EXTENSION_PATH bun run test:e2e --retry=0 <file>`. For Chrome, drop `NULO_E2E_BROWSER`.
- The Phase 1 probe lives outside the repository, in `~/.cache/nulo-backlog/viewer-followups-1/`: `vf-probe.test.ts` (it asserts) and `probe-hooks.patch`, which only exposes the window's logs so the probe can find a log's id. Neither is ever committed.

### Phase 1 — the deep link opens at its log and holds there (#923-B; #923 on A1 = A)

1. Add the #923-B row and, on A1 = A, the two #923 rows. Run them on arc 2's viewer: only the rows marked "reds on arc 2" red.
2. Apply the #923-B lines and, on A1 = A, the pin. Run the gate.
3. Negative control, uncommitted: drop the `snapshotPending` lines only. Only the #923-B row reds. Restore.
4. Browser probe, uncommitted:
   1. `git apply ~/.cache/nulo-backlog/viewer-followups-1/probe-hooks.patch`, and copy `vf-probe.test.ts` to `apps/extension/tests/e2e/`.
   2. Build both browsers armed, then run, per browser, `PROBE_N=8 bun run test:e2e --retry=0 tests/e2e/vf-probe.test.ts` with the smoke flags above. Add `PROBE_PIN=1` on A1 = A.
   3. Pass: exit 0, both tests green. Each of the 8 runs asserts that the window opened with the log in view; under `PROBE_PIN=1` it also asserts that the log held within 1 px with the button shown. Without the pin, a later resume is still allowed (#923 stays open).
   4. `git apply -R` the patch, delete the copy, check that `git status` shows only the arc's files, and rebuild both browsers armed before any later gate.

**Validation gate.** `bun run lint`; `bun run typecheck:all`; `bun run test:all`; `cd apps/extension && bun --bun vitest run src/components/JsonViewer`. Pass:
- Each exits 0, and the controls and the probe pass as stated.
- `git diff <base> -- apps/extension/src/components/JsonViewer/LogsViewer.vue` touches `scrollToTargetLog` only.

### Phase 2 — the search case reads its gap while following (#922)

1. Run `tests/e2e/viewers-csp.test.ts` three times per browser on the Phase 1 head, before the edit. Record the file's wall-clock and the search case's own duration. A red here is #922's known defect on the old case: record it with its gap, and do not count it as a candidate regression.
2. Apply the e2e change.
3. Mutation controls, uncommitted, one rebuild and one file run per browser each, then restore and rebuild:
   - `holdPlace` returns `[]`. Pass: the search case reds at `expectHeld`, because the end anchor carries the view. Other cases may red too; only the named failure counts.
   - The `focusin` handler stops nothing. Pass: the search case reds at the probe line's button assertion.
   - Run the two mutations separately, each on its own build.

**Validation gate.**
- Fast layers: `bun run lint`, `bun run typecheck:all`, `bun run audit:vue`.
- The file: 10 runs on Firefox and 5 on Chrome. Record each run's file wall-clock and the case's duration.
- The full smoke suite once per browser.
- viewer-flake-1's burst guard: 500 lines; base (arc 2) and the arc's head interleaved, medians of 5 per browser, each in a fresh browser. The measure is viewer-flake-1's (its archived plan, Phase 1), run as the `e2e-testing` skill, § Runtime budget, says.
- Pass: each exits 0, every run on the candidate is green, the mutation controls red where stated, and the burst ratio stays under +10% on both browsers. Any red on the candidate stops the arc for the orchestrator, with a traced reproduction. A rerun is diagnostic only.

## UI impact

- **Logs window, opened from Settings → Developer at a failure log.**
  - #923-B: under a burst, the window can open at the oldest log today. After the fix it opens at the failure log. That is the deep link's purpose, so it is no new behaviour.
  - #923, on A1 = A: today, when the log is among the latest, the view follows on and lines carry it away. After the fix it holds there, with the button and the 30 s timer of #616's hold rule.
  - The one residual is owner ask A1. A target that needs no scroll keeps the pin until a scroll event or a held line clears it. Until then, the reader's first scroll into the end band stays held. Such a target is a log in the top half of the first screen.
- `viewers-csp` changes no screen.

## Security & Adversarial Considerations

The viewer reads only its own state and the scroller's geometry; the change adds no input, message, storage, permission or log line. `logId` is an untrusted numeric selector: parsed with `+` and matched with `===` against loaded log ids, so an unknown id scrolls nowhere, as today. A page that can make the wallet log lines can no longer time one to defeat the deep link (#923-B); a flood past the cap still trims the failure log away. The fix trusts two CodeMirror 6.43.9 behaviours (F2, F4) that no committed browser test covers: the comment names them, and a CodeMirror bump re-runs the Phase 1 probe. The test change loosens nothing: the same gap and hold assertions run, at moments the viewer's rule fixes.

## Assumptions

- **Facts.**
  - F1 arc 2's lines as quoted (`LogsViewer.vue:81-88,103-133,149-158,279-286`).
  - F2 CodeMirror maps a pending scroll target through later changes, and replaces it with a later `scrollIntoView` (`dist/index.js:7994-8007`).
  - F3 the end anchor needs a height-map change of more than a pixel (`:8226-8240`).
  - F4 a `requestMeasure` read runs in a measure iteration with no viewport change, before the pending target is applied in the same synchronous `measure` call (`:8176-8223`). No message task runs between them, and the editor refuses a reentrant update (`:7947`). The target can stay unapplied after the read only in a zero-height editor or after five loop restarts (`:8170,8218`), which `holdPlace`'s flag already accepts.
  - F5 the reproductions and their counts (lessons/phase-0.md).
  - F6 `pointerClick` hit-tests the button's centre before it clicks (`helpers/legal-drivers.ts:181-206`). The button sat clear of the search panel 12/12.
  - F7 the deep link's URL shape (`popup/pages/settings/developer/index.vue:44-47`).
- **Inferences.**
  - I1 #616's 1-in-11 trace was a follow in flight. Its trace is gone, and its shape matches the reproduced one; the cause is not proven.
  - I2 window 1 can red Chrome too: it was forced on both browsers and seen naturally on Firefox only.
- **Asks.** A1 (OWNER-ASKS.md): the pin's residual on a target that needs no scroll. Codex and Opus both read it as beyond P71-05.

## Decision ledger

- D1 #921 closes as not reproduced, with its evidence, its reopening condition and no code (the lane brief: never fixed blind).
- D2 #922 keeps the gap check and reads it at the one moment the viewer's rule makes "at the end" certain: while it follows. The button is the only way back to the end that the viewer lands itself. Phase 2's `holdPlace` control proves the case still catches a broken hold.
- D3 `scrollToTargetLog` repeats the pin and the pending flag inline. A shared helper would touch the burst path, and the two call sites differ.
- D4 #923-B is folded into this arc: same function, same consequence, demonstrated, two lines on an existing flag, one row. The implementer adds it to #923 by a comment, so `Closes #923` covers it.
- D5 The pin's residual is owner ask A1 with the recommendation A, and the arc ships without the pin until it is answered. The residual is one missed resume: after it, lines stay held until the reader resumes or the 30 s timer runs out. If the answer is not in by the arc's start, the PR says `Refs #923`, and #923 stays open with a comment.
- D6 No new e2e scenario. The unit rows reproduce #923 and #923-B, and the probes cover the browser paths.

## Delivery

One arc, one PR against `dev`, from `worktree-viewer-followups-1`, opened only after the gates pass and the Codex loop converges. No label: smoke runs on `apps/extension/**`.
- Title, A1 = A: `fix(logs): a deep link holds on its log; the search case reads its gap while following` (86 characters). Without the pin: `fix(logs): a deep link opens at its log; the search case reads its gap while following` (86).
- Body: the findings with their evidence, the unit, mutation and probe controls, and the file's wall-clock and the case's duration per browser before and after. Then each browser's smoke suite wall-clock from CI, before and after (the `e2e-testing` skill, § Runtime budget). Then `UI impact` with A1's answer quoted, and `Closes #921`, `Closes #922`, and `Closes #923` (or `Refs #923`).
- The close-out lands as the PR's final commits.

## Post-implementation

Follow `implementations-plan/README.md` § Post-implementation standard at `817cce9d`, once, over the arc's diff. `code_review: off`.
- Codex loop: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh … gpt-6.1-sol`. Prompts live under `~/.cache/nulo-backlog/viewer-followups-1/`. Stop at three rounds, and log the rounds in `lessons/phase-N.md` and under Audit verdicts.
- One Opus diff review beside round 1. A fix that grows the design stops for the orchestrator.
- Close-out per the standard's step 4. Comment on #921 with its evidence. On A1 = A, comment on #920 with the residual's path and its reopening condition. Add a flake-ledger row to the `e2e-testing` skill for the search case's two windows, at the next free number.
- Teardown after the merge: `agent-worktree done viewer-followups-1 --merged`.

## Audit verdicts

- **Round 1, Codex** (gpt-6.1-sol, high, session 01a157a3): conditional approve. Accepted:
  - D5 needs the owner: now A1, and the pin waits for it.
  - #921's attribution is an inference: the Findings and D1 are qualified, with a reopening condition.
  - F4 is worded as one synchronous call.
  - The gates were short: `audit:vue`, a full smoke run per browser, the CI suite wall-clock and the burst guard are added.
  - The probe line's button is asserted, the comment names the two-frame span, and the seeds stop at 3 failures.
  - Confirmed: #923-B is correct against the measure loop, folding it in is proportionate, and the restructure is better than dropping the read.
- **Round 1, Opus Plan:** conditional approve. Accepted:
  - #1 the `focusin` mutation failed in setup: a `holdPlace` mutation now proves the hold check, and each control names the assertion it fails.
  - #2 D5: as above.
  - #3 a browser probe on the fixed viewer: run in planning on a trace build of the planned change. P923 resumed 0/16 and the pump opened away from the target 0/16 (lessons/phase-0.md). The probe also stays in Phase 1.
  - #4 F4's two narrow exceptions, #6 #921's wording, #7 #923-B on #923, #8 the cap and the CodeMirror dependency, #9 the housekeeping.
  - #5 D2's reason is reworded.
- **Round 2, Codex** (resume): conditional approve. Accepted:
  - A1 understated the residual: it is one missed resume, with lines held after it until another resume or the timer. The text is corrected.
  - A1 had no branch for B: B now stops the arc for a replan, and the Outcome no longer promises the hold under C.
  - The probe step was not executable and only recorded results. The probe now asserts, uses a repo-path hooks patch, and ends with a clean rebuild. Planning ran it green 8/8 per test per browser on the planned change, and red on arc 2's viewer on both browsers.
  - A red in the "before" runs is #922's known defect, not a candidate regression.
  - The manifest claim is dropped, and the phase-0 conclusion on #921 is qualified.
  - Confirmed: both mutation controls trace to their named assertions, and shipping #923-B and #922 without the pin is coherent.
- **Round 3, Codex** (resume): approve, no new material finding. The loop has converged.

## Seeds

`/goal` (recommended): `/goal Phases 1 and 2 of implementations-plan/viewer-followups-1/plan.md are ✓, each backed by its gate in the transcript (lint, typecheck:all, test:all, audit:vue, the JsonViewer unit run with its controls, the Phase 1 browser probe; viewers-csp 10 Firefox and 5 Chrome runs at retry 0 started at load1 < 150, both mutation controls red at their named assertions, one full smoke suite per browser, the burst ratio under +10% on both); A1's answer applied as plan.md says; LESSONS_FILE printed per phase; code_review off and /code-review not run; the Codex loop converged (a resumed pass with no new material finding, quoted); the PR exists, opened after the loop, with the close-out as its final commits.`

`/loop` (fallback): `/loop 15m Drive implementations-plan/viewer-followups-1 forward; never idle. Read plan.md and lessons/. If the plan directory is gone, git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/viewer-followups-1/plan.md: success means merged, so run agent-worktree done viewer-followups-1 --merged and stop; failure means delivered, so watch the PR's checks. Otherwise run the next phase's gate, then the Post-implementation section. Never merge. The same step failing 3 times: stop and report.`
