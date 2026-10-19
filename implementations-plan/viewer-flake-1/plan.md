---
plan: viewer-flake-1
tier: light
status: approved (orchestrator, 2026-10-19, two arcs); arc 1 in progress; arc 2 waits for owner ask A1
issues: "#849 (arc 1 refs, arc 2 closes)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); one Codex audit (gpt-6.1-sol, high) and its resumes; one Opus Plan leg; one fresh final Codex pass
base: origin/dev at ce48691e
trunk: dev
post_implementation_hardening: not scheduled
---

# viewer-flake-1: the viewer's own follow no longer reads as the reader's scroll; the e2e reads what the viewer judges

Two arcs, one PR each against `dev` (§ Delivery). Recon: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md) (A1: KL-2's behaviour). Probes and consults: [lessons/phase-0.md](lessons/phase-0.md). Over the light target (about 190 lines): three traced causes with their evidence, and four audit rounds that changed the design twice.

## Root cause (#849)

Three causes, each traced: one in the product, two in the test.

**P1, the viewer reads its own follow as the reader returning (demonstrated).** Initial conditions: the logs window follows at its end; wallet lines land at any time. Events, in order:

1. A line lands; `onLogAdded` appends it and `scrollToBottom` dispatches the follow (`LogsViewer.vue:66-73,121-127`).
2. CodeMirror scrolls to it in its next measure.
3. Before that scroll's event is handled, a selection or the search field stops the follow (`disableAutoScroll`, `:92-98`, called at `:262-271`).
4. The event then arrives. `scrollTop` exceeds `lastScrollTop`, which the handler last set before the line (`:101-113`), and the gap is 0, so the handler reads the reader scrolling back down and resumes the follow.

The stop can land before CodeMirror's measure or after it. The cause is that the viewer compares its own scroll against a reference taken before that scroll: harmless while it follows, wrong once a stop lands first. Invariant broken: #616's rule, hold while a selection or the search panel is open. Consequence: later lines carry the selection or the match away. That is the case-A red: 72 px is four 18.2 px lines. Evidence (base build): R1b (selection stop) resumed 8/8 on Firefox and on Chrome; R3 (search-field stop) resumed 7/8 on both.

**T1, the follow check reads before the viewer judges (demonstrated).** `armFollowCheck` reads the gap in a capture-phase `scroll` listener (`viewers-csp.test.ts:109-125`). That runs before CodeMirror's own listener, which measures in the event and applies a follow still due, and before the viewer's (recon § CodeMirror mechanics). A wallet burst landing between CodeMirror's follow scroll and its event makes the latch read 36-55 px while the viewer reads 0 and never stops. Consequence: `scrolledAway` reds the follow case (case B) on a view that followed every line. Evidence: R2, latch 54-55 vs viewer 0 (Firefox) or 1 (Chrome), no button; a natural near-miss in a green run (latch 18, viewer 0).

**T2, the hold's baseline predates the hold (demonstrated).** `middleLine` reads the line's top before the drag (`:353-358`). Until the viewer learns of the selection it follows, as it must. Moves land in that span from three sources: lines during the drag's setup round trips; lines between the drag's first `select.pointer` dispatch and Firefox's `selectionchange` (31 ms in the trace); and the follow already due at the stop. Consequence: `expectHeld` reds a view that held from its stop on. Evidence: R1b, every iteration on a fixed build moved 18-19 px at the stop and then held.

**Not the cause:** a trim (the cap is never near, per #749's record), `holdPlace`'s snapshot (every held line kept `scrollTop`).

## Outcome & Quality Bar

For a person reading a busy log and for the maintainer reading a red smoke lane:

- Arc 2. Once the viewer stops the follow, its own follow still in flight no longer resumes it; a scroll down by the reader, the button or the 30 s timer still does. The exceptions are KL-2 (owner ask A1) and the F3 geometry change (an issue). R1b and R3 resume 0/16 per browser, a unit case red on base proves it, and a success control keeps the reader's scroll down resuming.
- Arc 1, then arc 2. The two #849 cases no longer red on the three traced causes. The follow check reads what the viewer reads, and the hold is measured once the follow due at the stop has settled. No assertion is loosened, no wait on time is added, and the 1 px bound stays; it now covers the hold from two frames after the stop, not from the drag's start (D5).
- At retry 0 under the load class, all green: 10 Firefox runs of the file and 2 full Firefox smoke suites, 5 Chrome runs and 1 full Chrome suite.

## Architecture & Implementation

- **Viewer** (`apps/extension/src/components/JsonViewer/LogsViewer.vue`). After `scrollToBottom` dispatches the follow, it sets `lastScrollTop` to the scroller's largest offset (`scrollHeight - clientHeight`). The follow lands at most there, so its own scroll never reads as a move down past the reference. The reader's scroll does: the handler resets the reference on every event. The stops, the scroll handler, `holdPlace`, the timer and the `logId` target are unchanged. Nothing is dispatched. One comment sentence states the invariant. The read forces a layout CodeMirror would otherwise leave to its measure, once per followed line: Phase 1's burst control bounds its cost.
- **Unit** (`LogsViewer.test.ts`, no stub change).
  - New case, two rows (the follow's scroll before or after the stop): following at the end, a line grows `scrollHeight`, a selection stops the follow, and the follow's scroll to the new end fires its event. The next line is not followed. Both rows are red on base.
  - New success control, same setup: after that event the reader scrolls up past the band, then back into it, and the next line is followed.
  - The three "follow after a hold" cases stay unchanged.
- **e2e** (`apps/extension/tests/e2e/viewers-csp.test.ts` only).
  - `armFollowCheck`'s latch becomes a plain `scroll` listener, added after the viewer's. It reads the gap after CodeMirror's measure and after the viewer's judgement. The button observer no longer stops the latch: a stop inside the dispatch would skip the latch's own listener, so `followedSinceArmed` stops it instead. The comment and the `scrolledAway` message drop "before the button showed".
  - `selectAcross` returns the line with its top read two animation frames after the test's `selectionchange` listener sees the selection. That listener runs right after the viewer's stop. CodeMirror measures in the next frame and applies the follow already due, so two frames on, the view has settled from that stop. That span is excluded on purpose: it holds the follow already due, which base follows too. Both selection cases pass that line to `expectHeld`. The header comment says where the hold is measured from.
- **Not changed:** `fixtures/**`, the search case, `LogsToolbar.vue`, the thresholds (`AT_END`, `SCROLLED_AWAY`, 1 px), timeouts.

### Alternatives not taken

- **Snapshot the place at the stop** (round 1): F3 focuses the field inside CodeMirror's update, so the dispatch throws (both legs). It also hides the line already due with no button (an owner question), reads after a trim, and trips a stale `snapshotPending`.
- **Pin `lastScrollTop` to the end at the stop** (round 2): once the 30 s timer, or a reader's scroll into the band, has resumed the follow short of the end, a stop and a scroll to the end stay held (Codex). The pin belongs where the viewer causes the scroll.
- **Test-only fix for case A:** a test change would hide P1.
- **No re-arm while a selection or the panel holds:** rejected in #789, since it stops a reader's scroll from resuming the follow.
- **Stop on CodeMirror's own selection transactions** (Opus): it would close Firefox's lag, but adds a second stop source. Recorded as KL-1.

## Phases

Arc 1 is Phase 1, the test half; arc 2 is Phase 2, P1, once A1 is signed (the orchestrator's order).

**E2E runs.** Warning: start every build and every run only once `until [ "$(cut -d. -f1 /proc/loadavg)" -lt 150 ]; do sleep 30; done` returns. Run one e2e at a time in this worktree. `agent.sh` runs only the network config, so this smoke file runs through `test:e2e`, which claims its own ports in `~/.agents/ports.md`.

- Build each browser armed: `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:<browser>`.
- Firefox, from `apps/extension`: `NULO_E2E_BROWSER=firefox NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 env -u EXTENSION_PATH bun run test:e2e --retry=0 tests/e2e/viewers-csp.test.ts`, ten times. Then the full suite twice: the same command without the file.
- Chrome: the same without `NULO_E2E_BROWSER`, five times for the file and once for the full suite.
- Record the file's wall-clock for each run, plus one base run per browser. No pass bound on them.

### Phase 1 (arc 1) — the e2e reads what the viewer judges

1. Apply the e2e changes.
2. Controls, with the probe copied in from `~/.cache/nulo-backlog/viewer-flake-1/` and never committed. Record each in `lessons/phase-1.md` with the build it ran on.
   - Base viewer: R1b reds with the new baseline, so T2 keeps P1 caught. R2's latch, read after the viewer, sees no gap of 20 px or more.
   - P1 trial (the `scrollToBottom` pin applied uncommitted; arc 2's evidence): R1b and R3 resume 0/16 per browser. R5 asserts, per browser, the follow resumed in the band, held after the stop, resumed at the end, and the next line followed.
   - Burst cost, P1 trial against base. The logs window follows at its end with 60 lines at its default size; one task logs 500 `console.info` lines. A page-side `MutationObserver` and `requestAnimationFrame` time with `performance.now()`: from the first burst line's appearance in `.cm-content` to the first frame showing the last one with the view at its end. Each sample gets a fresh window; 5 samples per build per browser, alternating base and trial, with one build each chosen by `EXTENSION_PATH`. Record `(trial median / base median - 1) x 100`. Above 10 on either browser stops arc 2 for the orchestrator. This is a latency guard, not proof of zero layout cost.

**Validation gate.** Run `bun run lint`, `bun run typecheck:all` and `bun run test:all`, then the E2E runs. Pass: each exits 0, and every e2e run is green with the file at `6 passed`. The base viewer still carries P1, so a red may be P1's, but no red is excused. Any red fails the gate and stops the arc for the orchestrator. Its attribution comes from a traced reproduction with the probe instrumentation, recorded in `lessons/phase-1.md`. A rerun is diagnostic only and never replaces the failed run.

### Phase 2 (arc 2, once A1 is signed) — the viewer's follow pins its reference

1. Apply the viewer change; add the unit case and the control.
2. Negative control, never committed: restore `LogsViewer.vue` from the arc's base, keep the tests, run the unit gate. Pass: only the new case's two rows red. Then restore the change.

**Validation gate.** `bun run lint`; `bun run typecheck:all`; `bun run test:all`; `cd apps/extension && bun --bun vitest run src/components/JsonViewer`; the E2E runs on the arc's build. Pass: each exits 0, the control reds as stated, and every e2e run is green.

## UI impact

Logs window. Today a line that lands within a frame of a selection or a search-field focus is followed, and then the follow resumes. After the fix that line is still followed, and the view then holds; lines after the stop show the button, as today. One change a person could notice, owner ask A1: a reader who scrolls down to the end within that frame stays held (KL-2).

## Security & Adversarial Considerations

The viewer reads only its own state and the scroller's geometry. It adds no input, message, storage, permission, log line or dispatch. A page that floods log lines can already move a following view; the change only stops the viewer's own scroll from resuming a stopped follow. The test changes loosen nothing: the same assertions run, at the moment the rule promises them.

## Assumptions

- **Facts.** F1 CodeMirror's `onScroll` is on `.cm-scroller` before the viewer's listener; while the editor intersects it runs a synchronous measure that applies a pending scroll target; it re-registers only if the ancestor chain changes, which here it never does (recon). F2 the viewer's lines as quoted (`LogsViewer.vue:56-127,260-271`). F3 the reproducer numbers and traces (`lessons/phase-0.md`); Firefox R5's printed summary came from its reader before a fix, and its trace shows the resume. F4 Firefox can dispatch `selectionchange` after CodeMirror's next measure (31 ms in the trace). F5 the browser clamps `scrollTop` to `scrollHeight - clientHeight`, and CodeMirror's follow scrolls toward that end (traces: rest gap 0 on Firefox, 1 on Chrome). F6 the test lines as quoted (`viewers-csp.test.ts:102-147,193-273,345-392`).
- **Inferences.** I1 #849's case-B red was the `scrolledAway` latch: a hypothesis, since the issue gives no message. I2 its 72 px red was P1 plus two wallet lines; that run's trace is gone.
- **Asks.** A1, KL-2 (OWNER-ASKS.md): it changes when the view holds. KL-1 and the F3 race are pre-existing and unchanged.

## Decision ledger

- D1 Fix P1 in the viewer and T1, T2 in the test: each is demonstrated, and none hides another.
- D2 `scrollToBottom` pins `lastScrollTop` to the largest offset. The stops do not touch it (rounds 1-2).
- D3 The line already due at a stop is followed, as on base: no button question.
- D4 Keep `scrolledAway`, read after the viewer, with corrected wording (Opus #5).
- D5 The hold is measured from two frames after the viewer's stop. What moves the view before that is base behaviour: the drag's setup, Firefox's lag, the follow already due. P1 stays caught there: a resumed follow moves the view at the next line.
- D6 No new e2e scenario, no fixture change, the search case untouched.
- KL-1 (closed `known-limit` issue at close-out): lines that land between a drag's first `select.pointer` and Firefox's `selectionchange` are followed, with no bound on how many. Visible, pre-existing. Reopen on a user report.
- KL-2 (owner ask A1; a closed `known-limit` issue at close-out if accepted): a reader who scrolls down to the new end inside the one frame between a stop and the pending follow's scroll event stays held. That scroll ends where the follow's does, so geometry cannot tell them apart; base resumes both, which is P1. A scroll down at the end moves nothing and fires no event, so the next line lands below the view with the button shown; a scroll down, the button or the 30 s timer then resumes. Tracking wheel and key input would add state and event-order duties for a sub-frame window. Reopen on a user report.
- Out of scope, an issue at close-out each, deduplicated first:
  - CodeMirror's stick to the end after F3 shrinks the scroller can still resume the follow (#616's comment). This includes a follow in flight across the F3 open.
  - The search case reads `gapToEnd < AT_END` after the focus, so a wallet line held in between reds a correct viewer (Opus #4). Base has the same exposure.

## Delivery

Two arcs, one PR each against `dev`, in the orchestrator's order (2026-10-19). Each PR opens ready, after its gate, its Codex loop, and `origin/dev` merged in. No label: smoke runs on `apps/extension/**`.

- **Arc 1**: branch `viewer-flake-1-a1` off `origin/dev`, with the plan commit. Merge `origin/dev` first: ui-polish-4 changed `LogsToolbar.vue`.
  - Title: `test(e2e): viewers-csp reads the follow and the hold where the viewer judges` (76 characters).
  - Body: T1, T2, the controls with their builds, the runs with the file's wall-clock per browser before and after, `UI impact: none`, `Refs #849`.
  - No close-out and no archive.
- **Arc 2**, once A1 is signed: branch `viewer-flake-1-a2`, stacked on arc 1 while it is open, else off `origin/dev`.
  - Title: `fix(logs): the viewer's own follow scroll no longer resumes a stopped follow` (76 characters).
  - Body: P1 with Phase 1's controls, the unit controls, the runs, `UI impact` with A1's sign-off quoted, the limits (KL-1, KL-2, the F3 path), `Closes #849`.
  - The close-out lands as its final commits.
- If A1 is answered B or C, the orchestrator replans arc 2, and the plan stays open until then.

## Post-implementation

Follow `implementations-plan/README.md` § Post-implementation standard at `ce48691e`, once per arc over that arc's diff. `code_review: off`.

- Codex loop: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`. Prompts live under `~/.cache/nulo-backlog/viewer-flake-1/`. Stop at three rounds, and log the rounds in `lessons/phase-N.md` and under Audit verdicts.
- Run one Opus diff review beside each arc's round 1. A fix that grows the design stops for the orchestrator.
- Close-out, arc 2 only: the standard's step 4, plus a flake-ledger row in the `e2e-testing` skill (the next free number), and KL-1, KL-2 (if A1 accepts it) and the two issues filed, each deduplicated first.
- Teardown after arc 2 merges: `agent-worktree done viewer-flake-1 --merged`.

## Audit verdicts

**Round 1, Codex** (gpt-6.1-sol, high, session 01a1549d): reject as written.
- #1 a nested dispatch on F3: accepted, design changed.
- #2-#4 (trim, stale `snapshotPending`, the button): moot once the snapshot went.
- #5 T2's boundary: stated (D5, KL-1).
- #6 quiet frames are not proof: that focus was dropped.
- #7 overreaching claims: corrected.

**Round 1, Opus Plan:** conditional approve.
- The same nested-dispatch and button findings.
- The lag (KL-1).
- The search race: an issue.
- The latch wording: accepted.
- Controls for the e2e phase: accepted.
- F1 and F2: corrected.

**Round 2, Codex** (resume): reject.
- #1 the stop-time pin blocks a resume after the timer: accepted. The pin moved into `scrollToBottom` (D2).
- #2 the max bound under later layout: qualified, part of the F3 issue.
- #3 stale recon and outcome: fixed.
- #4 KL-1 unbounded: reworded.

**Round 3, Codex** (resume): reject.
- #1 a reader's scroll down inside the pending follow's frame stays held: accepted as KL-2.
- #2 "never" overpromises given the F3 path: accepted, all wording qualified.
- Confirmed: the timer and band regressions are gone, both event orders are covered, Chrome's 1 px rest gap stays under the pin, and line wrapping is not installed.

**Final fresh pass, Codex** (session 01a154cc): conditional approve.
- #1 KL-2's consequence was understated (a scroll down at the end fires no event) and it is an owner call: accepted, reworded, now owner ask A1. KL-1's wording corrected.
- #2 Firefox R5's summary contradicts its trace: accepted. The trace shows the resume, and R5 asserts its outcome in Phase 1.
- #3 T2 changes temporal coverage: accepted, stated in Outcome, Architecture and D5; the negative controls stay planned.
- #4 the new layout read per followed line: plausible, unverified. Phase 1 bounds it.

**Final pass, resume 1** (after the orchestrator's approval and two-arc order): conditional approve. #1-#3 resolved.
- #4 the burst bound timed nothing defined (a producer loop ends before the viewer delivers): accepted, the measure is defined (Phase 1).
- #5 Delivery, close-out and seeds still described one arc that closes and archives: accepted, rewritten for two arcs.

**Final pass, resume 2:** conditional approve. #4 and #5 resolved.
- #3 the gate's P1 exception (a screenshot attribution plus a rerun) is a retry-to-pass: accepted. The exception is gone; any red stops the arc, with a traced reproduction for attribution.

**Final pass, resume 3:** approve, no new material finding.

## Seeds

`/goal` (recommended): `/goal Phase 1 (arc 1) of implementations-plan/viewer-flake-1/plan.md is ✓, backed by its gate passing in the transcript (lint, typecheck:all, test:all; 10 Firefox and 5 Chrome file runs plus 2 Firefox and 1 Chrome full smoke suites at retry 0 started at load1 < 150; the controls recorded with their builds: R1b red on base under the new baseline, R1b/R3 0/16 and R5 asserted on the P1 trial, the burst ratio per browser); LESSONS_FILE=implementations-plan/viewer-flake-1/lessons/phase-1.md printed; code_review is off and /code-review was not run; the Codex loop converged (a resumed pass with no new material finding, quoted); the arc 1 PR referring to #849 exists, opened after the loop. Phase 2 starts only once A1 is signed.`

`/loop` (fallback): `/loop 15m Drive implementations-plan/viewer-flake-1 forward; never idle. Read plan.md and lessons/. If the plan directory is gone, git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/viewer-flake-1/plan.md: success means merged, so run agent-worktree done viewer-flake-1 --merged and stop; failure means delivered, so watch the PR's checks. Otherwise run the next phase's gate, then the Post-implementation section; Phase 2 waits for A1's signature in OWNER-ASKS.md. Never merge. The same step failing 5 times: reassess with Codex.`
