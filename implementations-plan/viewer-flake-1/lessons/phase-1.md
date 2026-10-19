# viewer-flake-1: phase 1 (arc 1, the test half)

Base: `origin/dev` at `f214e5cb` merged into the plan branch. The arc's code change is in `apps/extension/tests/e2e/viewers-csp.test.ts` only. Controls ran on builds kept outside the repo, chosen by `EXTENSION_PATH`, all armed as Phase 1 says:

- `base`: the arc's head.
- `base-trace`: the head with the viewer's event trace, a throwaway probe.
- `p1`: the head with the `scrollToBottom` pin.
- `p1-trace`: the pin with the trace.

## Deviation

- `agent.sh` runs only the network config, and `viewers-csp` is a smoke file, so every run here goes through `test:e2e --retry=0`, which claims its own ports. This is the command the plan's E2E-runs block already names.

## Review rounds

- **Codex round 1** (gpt-6.1-sol, high, a fresh session): conditional approve.
  - T1 is confirmed on both engines. Target capture listeners run before non-capture ones, which keep registration order (CodeMirror, then the viewer, then the latch). Microtask checkpoints between UA-dispatched listeners justify dropping the observer's stop.
  - #1, labelled plausible: T2's baseline could absorb a broken hold, by P1 resuming, a wallet line following, and the drag re-stopping, all before the read. I rebutted it on frame order, and the comments were qualified anyway. Round 2 withdrew the rebuttal (below).
  - #2: two frames drain only the follow pending at the stop. The comment now says so.
- **Opus diff review**, beside round 1: approve, with the claims traced in the CodeMirror source.
  - Folded: D5 now says the window would also absorb a one-line break of the hold inside it, while a break that repeats still reds. The 10 s timeout names a frame stall apart from a missing `selectionchange`. The returned line narrows to `text` and `top`. The observer's comment is reworded.
  - Kept, per D4: `scrolledAway`. It now reads what the viewer reads, so it only labels why the button showed. That label is the diagnosis #849 lacked.
  - Noted: the arc ships on a viewer that still carries P1, so case A can red at its natural rate. The gate excuses no such red.
- **Codex round 2** (resume): conditional approve. The fixes check out.
  - #1, plausible: the frame-order rebuttal misses a synchronous measure. Each drag `mousemove` reaches `posAndSideAtCoords`, whose `readMeasured()` runs a scheduled measure at once (`@codemirror/view` 6.43.9 `dist/index.js:5037`, `:8512`, `:8313`). So a follow requested after a resume can land inside the window, before the read, and a later `selectionchange` in the drag re-stops it. Verified in the source; the rebuttal is withdrawn.
  - Accepted into D5's window, with no code change: the test comments claim only the follow pending at the stop. For P1 the gap is a false green in that window. Arc 2's unit case pins P1 directly.
- **Codex round 3** (resume): approve, no new material finding. The loop has converged.

## Controls (retry 0, each run started at load1 under 150, the host busy with other leads)

Resumes are counted on the viewer's trace: a scroll judged `movedDown` that enables the follow after the viewer's own stop, before the next iteration's reset. Visible moves are counted on the selected line, from the new baseline.

- **R2, base.** Firefox: the old capture latch read `[55, 0]`, a false scroll-away; the after-viewer read `[0, 0]`. Chrome: `[55, 1]` against `[1, 1]`. T1's latch sees no gap of 20 px or more.
- **R1b, base, with the new baseline.**
  - Firefox: resumed 7/8. Each of the 7 is red, moving 36 px after the baseline. The eighth flagged an `enable` before Firefox's late `selectionchange` and held.
  - Chrome: resumed 8/8, with no visible move. The next line's dispatch makes CodeMirror rewrite the DOM selection, Chrome's `selectionchange` re-stops the follow before that line's scroll lands, and the held line after it replaces the pending follow with its snapshot. Firefox fires that `selectionchange` after CodeMirror's measure, so there the follow lands first. That is why #849 reds on Firefox.
  - So the negative control is demonstrated on Firefox. On Chrome, R1b has no visible resume for the baseline to catch.
- **P1 trial.** R1b and R3 resumed 0/8 each per browser, on the trace and on the line. Each iteration followed the due line (18-19 px), then held with the button. R5 passed its asserts on both browsers: following in the band, held after the stop, resumed at the end, and the next line followed (rest gap 0 on Firefox, 1 on Chrome).
- **Burst cost, P1 trial against base.** The measure is Phase 1's: 500 lines, from the first in `.cm-content` to the first frame showing the last one at the end. One fresh browser and window per sample, alternating builds.
  - Firefox: base `[1330, 757, 958, 792, 541]` ms, median 792; trial `[941, 756, 1049, 806, 797]`, median 806, so **+1.8%**.
  - Chrome: base `[554.8, 444.7, 557.1, 755.1, 2396.5]`, median 557.1; trial `[439.4, 566.3, 627.7, 789.5, 509.5]`, median 566.3, so **+1.7%**.
  - Both are under the 10% bound, so arc 2 is not stopped. The spread under this load is wide, so the guard is coarse: it rules out a large regression, not a small one.

## The before runs, and dev moving under the arc

- The first before runs read `origin/dev` after other lanes had moved it. #868 had added keyboard tests that my build predated, so the toolbar cases red against it on both browsers, and the runs were discarded. `origin/dev` was merged again (#868 changed `LogsToolbar.vue` and this file, not the viewer). The before file is now pinned to the merged dev commit and runs on the merged head's build.
- The discarded Firefox run also redded case A, "a selection at the end holds the view", with the old test on the base viewer: #849's red, at retry 0.
