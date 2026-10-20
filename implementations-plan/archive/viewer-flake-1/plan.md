---
plan: viewer-flake-1
tier: light
status: closed (two arcs against dev: #902 merged; arc 2's PR a draft until the owner signs A1; the merge that lands it closes the plan)
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

## Outcome

- **Date:** 2026-10-20.
- **Status:** closed. Two arcs against `dev`: #902 (arc 1, merged) and arc 2's PR from `viewer-flake-1-a2`, a draft until the owner signs A1. Merging it, the owner's call, closes the plan.
- **Shipped:** #849, closed by arc 2.
  - Arc 1 (T1, T2): the follow check reads the gap after the viewer has judged it, and the hold is measured two frames after the viewer's selection stop.
  - Arc 2 (P1, as replanned by D12): after its dispatch, the follow sets a reference no scroll exceeds, and its own scroll event resets it. A held line's snapshot lowers it. The pin reads no geometry: the geometric pin it replaced cost +42.7% on Firefox's 500-line burst.
  - On the shipped pin, R1b and R3 resume 0/16 per browser and R5 passes. The gate is green: Firefox 10/10 and Chrome 5/5 file runs, and the full smoke suites 2/2 and 1/1.
- **Owner decision:** A1. The orchestrator's call is A ([#849](https://github.com/nulo-sh/nulo/issues/849#issuecomment-6279625586)), widened by D12. The owner signs on a decision page, pending at close-out.
- **Known limits:** #919 (KL-1), #920 (KL-2, widened).
- **Open items:** #921 (CodeMirror's stick to the end after the search panel opens, and the height correction's late landing), #922 (the search case's gap read), #923 (the `logId` deep link resumes the follow).
- **Dispositions:**
  - The geometric pin is superseded by D12, for its layout cost.
  - Option (b), an update listener with an annotation, is out of proportion (D12).
  - The never-removed `selectionchange` listener predates the plan and is harmless, so it is left.
- **Lessons:** nothing new in `lessons.md` (8,133 of 8,192 bytes). The cost-guard point is an e2e measuring technique and went to the `e2e-testing` skill (§ Runtime budget; flake-ledger row 63).
- **Seeds retired:** the `/goal` and `/loop` seeds below are retired; this plan is a record, not a task list.

# viewer-flake-1: the viewer's own follow no longer reads as the reader's scroll; the e2e reads what the viewer judges

Two arcs, one PR each against `dev` (§ Delivery). Recon: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md) (A1: KL-2's behaviour). Probes and consults: [lessons/phase-0.md](lessons/phase-0.md). Over the light target (about 190 lines): three traced causes with their evidence, and four audit rounds that changed the design twice.

## Root cause (#849)

Three causes, each traced: one in the product, two in the test.

**P1, the viewer reads its own follow as the reader returning (demonstrated).** Initial conditions: the logs window follows at its end; wallet lines land at any time. Events, in order:

1. A line lands; `onLogAdded` appends it and `scrollToBottom` dispatches the follow (`LogsViewer.vue:66-73,121-127`).
2. CodeMirror scrolls to it in its next measure.
3. Before that scroll's event is handled, a selection or the search field stops the follow (`disableAutoScroll`, `:92-98`, called at `:262-271`).
4. The event then arrives. `scrollTop` exceeds `lastScrollTop`, which the handler last set before the line (`:101-113`), and the gap is 0, so the handler reads the reader scrolling back down and resumes the follow.

The stop can land before CodeMirror's measure or after it. The cause is that the viewer compares its own scroll against a reference taken before that scroll: harmless while it follows, wrong once a stop lands first. Invariant broken: #616's rule, hold while a selection or the search panel is open. Consequence: later lines carry the selection or the match away. That is the case-A red: 72 px is four 18.2 px lines. Evidence (base build): R1b (selection stop) resumed 8/8 on Firefox and on Chrome; R3 (search-field stop) resumed 7/8 on both. On Chrome the resume rarely shows: Chrome's `selectionchange` from CodeMirror's next selection rewrite re-stops the follow before its scroll lands (lessons/phase-1.md).

**T1, the follow check reads before the viewer judges (demonstrated).** `armFollowCheck` reads the gap in a capture-phase `scroll` listener (`viewers-csp.test.ts:109-125`). That runs before CodeMirror's own listener, which measures in the event and applies a follow still due, and before the viewer's (recon § CodeMirror mechanics). A wallet burst landing between CodeMirror's follow scroll and its event makes the latch read 36-55 px while the viewer reads 0 and never stops. Consequence: `scrolledAway` reds the follow case (case B) on a view that followed every line. Evidence: R2, latch 54-55 vs viewer 0 (Firefox) or 1 (Chrome), no button; a natural near-miss in a green run (latch 18, viewer 0).

**T2, the hold's baseline predates the hold (demonstrated).** `middleLine` reads the line's top before the drag (`:353-358`). Until the viewer learns of the selection it follows, as it must. Moves land in that span from three sources: lines during the drag's setup round trips; lines between the drag's first `select.pointer` dispatch and Firefox's `selectionchange` (31 ms in the trace); and the follow already due at the stop. Consequence: `expectHeld` reds a view that held from its stop on. Evidence: R1b, every iteration on a fixed build moved 18-19 px at the stop and then held.

**Not the cause:** a trim (the cap is never near, per #749's record), `holdPlace`'s snapshot (every held line kept `scrollTop`).

## Outcome & Quality Bar

For a person reading a busy log and for the maintainer reading a red smoke lane:

- Arc 2. Once the viewer stops the follow, its own follow still in flight no longer resumes it; a scroll down by the reader, the button or the 30 s timer still does. The exceptions are KL-2 (owner ask A1, widened by D12) and the F3 geometry change (an issue). On the shipped pin, R1b and R3 resume 0/16 per browser and R5 passes; the unit hold rows red on base, and success controls keep the reader's scroll down resuming.
- Arc 1, then arc 2. The two #849 cases no longer red on the three traced causes. The follow check reads what the viewer reads, and the hold is measured once the follow due at the stop has settled. No assertion is loosened, no wait on time is added, and the 1 px bound stays; it now covers the hold from two frames after the stop, not from the drag's start (D5).
- At retry 0 under the load class, all green: 10 Firefox runs of the file and 2 full Firefox smoke suites, 5 Chrome runs and 1 full Chrome suite.

## Architecture & Implementation

- **Viewer** (`apps/extension/src/components/JsonViewer/LogsViewer.vue`), as replanned (D12).
  - After `scrollToBottom` dispatches the follow, it sets `lastScrollTop` to `Number.POSITIVE_INFINITY`. Until the next scroll event no scroll reads as a move down, and that event's handler resets the reference to the real offset.
  - CodeMirror's own scroll listener runs first and measures, so every follow still due has landed before the viewer reads (F1). The pin reads no geometry and forces no layout.
  - When `holdPlace` takes a snapshot, it lowers the reference to `scrollTop`: the snapshot replaces a follow still due, whose scroll then never comes.
  - The stops, the scroll handler, the timer and the `logId` target are unchanged. Nothing is dispatched. One comment sentence at each line states its invariant.
- **Unit** (`LogsViewer.test.ts`, no stub change; `followingAtEnd()` comes out of `held()`).
  - Hold rows, each red on base: following at the end, a line grows `scrollHeight`, a selection stops the follow, and the follow's scroll fires its event; the next line is not followed and the button shows. The scroll lands before or after the stop, at 618 or a fractional 618.4. A further row: a sub-pixel follow, in a document a line overflows by under a pixel.
  - Success controls: after that event, the reader scrolls up past the band and back into it, and the next line is followed. A held line whose snapshot replaces the follow still due leaves the reader's next scroll down free.
  - KL-2's bound, a success control: after a follow with nothing to travel, the reader's second scroll down resumes, so the pin outlives at most one scroll event. The hold rows, not this one, tell the pin from base.
  - The three "follow after a hold" cases stay unchanged.
- **e2e** (`apps/extension/tests/e2e/viewers-csp.test.ts` only).
  - `armFollowCheck`'s latch becomes a plain `scroll` listener, added after the viewer's. It reads the gap after CodeMirror's measure and after the viewer's judgement. The button observer no longer stops the latch: a stop inside the dispatch would skip the latch's own listener, so `followedSinceArmed` stops it instead. The comment and the `scrolledAway` message drop "before the button showed".
  - `selectAcross` returns the line with its top read two animation frames after the test's `selectionchange` listener sees the selection. That listener runs right after the viewer's stop. CodeMirror measures in the next frame and applies the follow already due, so two frames on, the view has settled from that stop. That span is excluded on purpose: it holds the follow already due, which base follows too. Both selection cases pass that line to `expectHeld`. The header comment says where the hold is measured from.
- **Not changed:** `fixtures/**`, the search case, `LogsToolbar.vue`, the thresholds (`AT_END`, `SCROLLED_AWAY`, 1 px), timeouts.

### Alternatives not taken

- **Snapshot the place at the stop** (round 1): F3 focuses the field inside CodeMirror's update, so the dispatch throws (both legs). It also hides the line already due with no button (an owner question), reads after a trim, and trips a stale `snapshotPending`.
- **A geometric pin** (arc 2, before D12): `scrollHeight - clientHeight`, then a pixel past it, then only with a pixel to travel. Reading the end after each followed line forced a layout, +42.7% on Firefox's burst, and a follow with under a pixel to travel escaped the pin (Codex).
- **Lower the reference wherever CodeMirror replaces the follow** (D12, option b): an update listener and an annotation on the follow, new plumbing for one held scroll after a rare sequence.
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

### Phase 1 (arc 1) — the e2e reads what the viewer judges ✓

1. Apply the e2e changes.
2. Controls, with the probe copied in from `~/.cache/nulo-backlog/viewer-flake-1/` and never committed. Record each in `lessons/phase-1.md` with the build it ran on.
   - Base viewer: R1b reds with the new baseline, so T2 keeps P1 caught. R2's latch, read after the viewer, sees no gap of 20 px or more.
   - P1 trial (the `scrollToBottom` pin applied uncommitted; arc 2's evidence): R1b and R3 resume 0/16 per browser. R5 asserts, per browser, the follow resumed in the band, held after the stop, resumed at the end, and the next line followed.
   - Burst cost, P1 trial against base. The logs window follows at its end with 60 lines at its default size; one task logs 500 `console.info` lines. A page-side `MutationObserver` and `requestAnimationFrame` time with `performance.now()`: from the first burst line's appearance in `.cm-content` to the first frame showing the last one with the view at its end. Each sample gets a fresh window; 5 samples per build per browser, alternating base and trial, with one build each chosen by `EXTENSION_PATH`. Record `(trial median / base median - 1) x 100`. Above 10 on either browser stops arc 2 for the orchestrator. This is a latency guard, not proof of zero layout cost.

**Validation gate.** Run `bun run lint`, `bun run typecheck:all` and `bun run test:all`, then the E2E runs. Pass: each exits 0, and every e2e run is green with the file at `6 passed`. The base viewer still carries P1, so a red may be P1's, but no red is excused. Any red fails the gate and stops the arc for the orchestrator. Its attribution comes from a traced reproduction with the probe instrumentation, recorded in `lessons/phase-1.md`. A rerun is diagnostic only and never replaces the failed run.

### Phase 2 (arc 2, on the orchestrator's call on A1) — the viewer's follow pins its reference ✓

1. Apply the viewer change; add the unit case and the control.
2. Negative control, never committed: restore `LogsViewer.vue` from the arc's base, keep the tests, run the unit gate. Pass: only the hold rows red (three under D12). Then restore the change.

**Validation gate.** `bun run lint`; `bun run typecheck:all`; `bun run test:all`; `cd apps/extension && bun --bun vitest run src/components/JsonViewer`; the E2E runs on the arc's build. Pass: each exits 0, the control reds as stated, and every e2e run is green.

## UI impact

Logs window. Today a line that lands within a frame of a selection or a search-field focus is followed, and then the follow resumes. After the fix that line is still followed, and the view then holds; lines after the stop show the button, as today. One change a person could notice, owner ask A1: a reader who scrolls down to the end within that frame stays held, as does a reader's next scroll down after a search step or keyboard selection within a frame of a line, or after a follow with nothing to travel (KL-2, widened by D12).

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
- D5 The hold is measured from two frames after the viewer's stop. What moves the view before that is base behaviour: the drag's setup, Firefox's lag, the follow already due. The window would also absorb a one-line break of the hold inside it (Opus, arc 1), and a follow a drag's synchronous measure (`readMeasured`) lands inside it (Codex, arc 1 round 2). P1 stays caught whenever its resumed follow lands after the read, and so does any break that repeats; arc 2's unit case pins P1 directly.
- D6 No new e2e scenario, no fixture change, the search case untouched.
- D7 (arc 1) Every run goes through `test:e2e --retry=0`, since `agent.sh` runs only the network config.
- D8 (arc 1) During the arc, dev's #868 added keyboard tests to this file. The gate's pass becomes every test in the file (8 at the merged head), not `6 passed`. The controls ran on the pre-merge head; `LogsViewer.vue` is identical at the merged head.
- D9 (arc 2) The arc is built on the orchestrator's call on A1, A, recorded on #849, before the owner signs; its PR would open as a draft until then.
- D10 (arc 2, superseded by D12) The pin is one pixel past the rounded end: `scrollTop` can be fractional while `scrollHeight` and `clientHeight` are integers (Opus #2).
- D11 (arc 2; its travel condition superseded by D12) The pin is set only when the follow has a pixel to travel, and `holdPlace`'s snapshot, which replaces a follow still due, lowers it to the view's place: otherwise no scroll event lowers it again (Codex round 2).
- D12 (the orchestrator's call, 2026-10-20, on the arc 2 stop report) The pin reads no geometry: after its dispatch `scrollToBottom` sets `lastScrollTop = Number.POSITIVE_INFINITY`, and the follow's own event resets it to the real offset. `holdPlace`'s snapshot reset stays; the travel condition goes. Burst, base / the last geometric pin / no-read pin, interleaved, medians of 5 at load1 36-88: Firefox 386.0 / 551.0 (+42.7%) / 390.0 ms (+1.0%); Chrome 360.5 / 378.3 (+4.9%) / 353.1 ms (-2.1%). The residual takes option (a), KL-2 widened; option (b)'s plumbing is out of proportion for that window.
- KL-1 (#919, a closed `known-limit` issue): lines that land between a drag's first `select.pointer` and Firefox's `selectionchange` are followed, with no bound on how many. Visible, pre-existing. Reopen on a user report.
- KL-2 (#920, a closed `known-limit` issue; owner ask A1, the orchestrator's call A, widened by D12): a reader's scroll down stays held where the viewer cannot tell it from its own follow's. Three triggers:
  - a scroll down to the new end inside the one frame between a stop and the pending follow's scroll event. That scroll ends where the follow's does;
  - a scroll that replaces the pending follow and moves nothing: a search step with a query (F3 or Enter) or a keyboard selection within about 16 ms of a line, with the match or the cursor already in view. The reader's next scroll down, before another scroll event or held line, stays held;
  - a follow with nothing to travel, then growth with no held line (a filter change). The reader's first scroll down stays held.

  Base resumes in each case, which is P1. The first trigger's window is one frame; the other two start within a frame of a line or need no line at all, and the scroll they hold can come later, until another scroll event or a held line clears the pin. A scroll down at the end moves nothing and fires no event, so the next line lands below the view with the button shown; a scroll down, the button or the 30 s timer then resumes. Telling them apart means tracking input or every scroll target, which is state and plumbing for one held scroll after a rare sequence. Reopen on a user report.
- Out of scope, an issue each (#921, #922; and #923 for `scrollToTargetLog`, Opus):
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

**Arc 1, Codex round 1** (fresh session): conditional approve. T1 is confirmed on both engines.
- #1, a baseline that absorbs a broken hold: the comments are qualified. The frame-order rebuttal was withdrawn in round 2.
- #2, two frames drain only the pending follow: the comment is restricted to that.

**Arc 1, Opus diff review:** approve. Folded: the D5 clause, the timeout's message, and the returned line narrowed. `scrolledAway` is kept (D4).

**Arc 1, Codex round 2** (resume): conditional approve. #1: a drag's synchronous measure can land a resumed follow before the read. Verified and accepted into D5, with no code change.

**Arc 1, Codex round 3** (resume): approve. The loop has converged.

**Arc 2, Codex round 1** (fresh session): approve, with two comment fixes, applied.

**Arc 2, Opus diff review:** conditional approve. #2 a fractional `scrollTop` resumes: accepted (D10). #3 the height correction's undershoot: into the F3 issue. #6 `scrollToTargetLog` shares the class: an issue. #1 the A1 record: the Outcome and the PR. #4 explained; #5 pre-existing, left.

**Arc 2, Codex round 2** (resume): conditional approve. #1 a no-op follow leaves the reference armed: accepted, with the snapshot path found beside it (D11).

**Arc 2, Codex round 3** (resume, the hard stop): conditional approve, two findings verified, not fixed (lessons/phase-2.md). #1 a follow with under a pixel to travel still scrolls, and its event resumes a stop in its frame. #2 search navigation, or a keyboard selection, that replaces the follow leaves the reference stale until the next held line or scroll event, which widens KL-2. Together with the burst guard (+33.4% Firefox, +14.2% Chrome on the last geometric pin), the arc stops for the orchestrator.

**Arc 2 replanned (D12), Codex round 1** (a fresh session): approve. Two low findings: the bound row's held line lowered the reference by itself (removed), and the comment now names the listener order it relies on.

**Arc 2 replanned, Opus diff review:** conditional approve. The comment point; the "before" row ran the "after" row's path (dropped); the bound row asserted the accepted limit (it now asserts only the second scroll's resume). Verified: `Math.min` cannot reopen P1, and KL-2's three triggers are complete.

**Arc 2 replanned, Codex round 2** (resume): approve, no new material finding. Converged.

**Cross-arc pass, Codex** (a fresh session over the net diff from `ce48691e`). Round 1, conditional approve: A1's and KL-2's text still bound the widened triggers to a frame (fixed); the bound row cannot tell the pin from base (the claim corrected, since the hold rows do). Round 2, conditional approve: the no-op trigger has no timing bound, so both justifications drop "within a frame" (fixed). Round 3, approve.

## Seeds

`/goal` (recommended): `/goal Phase 1 (arc 1) of implementations-plan/viewer-flake-1/plan.md is ✓, backed by its gate passing in the transcript (lint, typecheck:all, test:all; 10 Firefox and 5 Chrome file runs plus 2 Firefox and 1 Chrome full smoke suites at retry 0 started at load1 < 150; the controls recorded with their builds: R1b red on base under the new baseline, R1b/R3 0/16 and R5 asserted on the P1 trial, the burst ratio per browser); LESSONS_FILE=implementations-plan/viewer-flake-1/lessons/phase-1.md printed; code_review is off and /code-review was not run; the Codex loop converged (a resumed pass with no new material finding, quoted); the arc 1 PR referring to #849 exists, opened after the loop. Phase 2 starts only once A1 is signed.`

`/loop` (fallback): `/loop 15m Drive implementations-plan/viewer-flake-1 forward; never idle. Read plan.md and lessons/. If the plan directory is gone, git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/viewer-flake-1/plan.md: success means merged, so run agent-worktree done viewer-flake-1 --merged and stop; failure means delivered, so watch the PR's checks. Otherwise run the next phase's gate, then the Post-implementation section; Phase 2 waits for A1's signature in OWNER-ASKS.md. Never merge. The same step failing 5 times: reassess with Codex.`
