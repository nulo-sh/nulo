# viewer-flake-1: phase 2 (arc 2, the viewer fix)

Base: `origin/dev` at `dc94581d` (#902, arc 1, merged). The arc is built on the orchestrator's call on A1, A, recorded on #849; the owner's signature is pending on a decision page (D9). The first design stopped at the burst guard and the review loop's third round. The orchestrator replanned it (D12, 2026-10-20), and this record covers both designs.

## The first design: a geometric pin

Three local iterations, folded into the replan's commit and never pushed:

1. `scrollToBottom` pinned `lastScrollTop` to `scrollHeight - clientHeight`.
2. One pixel past that, since a fractional `scrollTop` against integer sizes resumed the follow (Opus #2).
3. Set only with a pixel to travel, and lowered by `holdPlace`'s snapshot (Codex round 2).

Each iteration's controls held: dev's viewer redded only the hold rows, and each half of the third redded only its own control.

- **Codex round 1** (gpt-6.1-sol, high, fresh): approve, with two comment fixes.
- **Opus diff review:** conditional approve.
  - #2, the fractional offset: fixed (iteration 2).
  - #3, CodeMirror's height correction landing a follow short in a long burst: into the F3 issue.
  - #6, `scrollToTargetLog` shares the bug class: an issue.
  - #5, the `selectionchange` listener is never removed: pre-existing and harmless, left.
- **Codex round 2:** conditional approve. A no-op follow leaves the reference armed with no event to lower it. Walking that path found the snapshot path: a held line's snapshot is a later `scrollIntoView` effect that replaces a follow still due (`@codemirror/view` 6.43.9 `dist/index.js:8005-8007`). Both fixed (iteration 3).
- **Codex round 3, the hard stop:** conditional approve, two findings, verified and left unfixed.
  - #1: a follow with under a pixel to travel set no pin, but CodeMirror still scrolls any non-zero `moveY` (`:600`).
  - #2: search navigation (`findNext` scrolls with `nearest`, `@codemirror/search` 6.7.1 `dist/index.js:531,851`) or a keyboard selection replaces the follow and moves nothing, so the reference stays stale.
- **Gate before the stop:** `test:all` and the unit run green on iterations 2 and 3. The base build's `viewers-csp` ran green once per browser: Firefox 37 s, Chrome 26 s.

### Burst cost, and why the design stopped

Phase 1's measure: 500 lines, from the first in `.cm-content` to the first frame showing the last one at the end. Each sample runs in one fresh browser and window, with the builds chosen by `EXTENSION_PATH`.

- **Alternating base and arc, medians of 5.** Iteration 3 cost Firefox +33.4% and Chrome +14.2%; iteration 2 cost Firefox +45.3% and Chrome +3.2%. Both are over the 10% guard.
- **Interleaved at load1 36-88:** base, iteration 3, and a throwaway build that kept iteration 3's snapshot reset but read no geometry:

| Build | Firefox (ms) | vs base | Chrome (ms) | vs base |
|---|---|---|---|---|
| base | 386.0 `[608, 392, 357, 383, 386]` | | 360.5 `[356.5, 378.1, 360.5, 352.7, 392.1]` | |
| geometric pin | 551.0 `[706, 551, 494, 681, 488]` | +42.7% | 378.3 `[349.2, 378.3, 381.5, 392.2, 371.0]` | +4.9% |
| no-read pin | 390.0 `[451, 384, 373, 391, 390]` | +1.0% | 353.1 `[359.6, 353.1, 344.9, 369.4, 340.2]` | -2.1% |

- The cost was the layout forced by reading `scrollHeight` after each followed line's dispatch, which CodeMirror would otherwise take once per frame. A 500-line burst forced 500, mostly on Firefox. Phase 1's trial had read +1.8% and +1.7% at load1 142-150 on Firefox (base medians 792 and 557 ms), where the spread hid it.

## The replan: D12

The orchestrator approved the no-read pin and option (a) for the residual, which widens KL-2 (D12; A1's text in `OWNER-ASKS.md` widened to match).

- **The pin:** after its dispatch, `scrollToBottom` sets `lastScrollTop = Number.POSITIVE_INFINITY`. The next scroll event's handler resets it to the real offset. CodeMirror's scroll listener runs first and measures, landing every follow still due (`dist/index.js:7194-7198`). Opus traced the order: the listener is registered at construction (`:7191`), and the parent is appended before the observer is created (`:7906`, `:7919`).
- **Kept:** `holdPlace`'s snapshot reset. **Dropped:** the travel condition.
- **Commits:** `4dc82ab9` (the fix and its unit rows); `6e772a2a` (the comment names the listener it relies on; the rows tightened).

### Unit controls (each variant uncommitted, the tests at the commit)

- Fixed: 19/19.
- Dev's viewer reds exactly the three hold rows: landing at 618, at 618.4, and the sub-pixel follow in a document a line overflows by under a pixel.
- Without the snapshot reset, only the snapshot control reds.
- A mutation that keeps the sentinel past its event reds only the end-band control and the bound row.
- At `4dc82ab9`, before the rows were tightened, the geometric pin redded exactly round 3's sub-pixel row and the bound.

### Burst cost, re-measured on `4dc82ab9`

Base, arc and the no-read pin interleaved, medians of 5. 29 of 30 samples started at load1 under 90 (50-90); one Firefox base sample fell back to 124.5.

| Build | Firefox (ms) | vs base | Chrome (ms) | vs base |
|---|---|---|---|---|
| base | 586.0 `[460, 586, 623, 525, 1087]` | | 400.0 `[416.7, 351.8, 354.2, 404.6, 400.0]` | |
| arc | 429.0 `[451, 470, 420, 370, 429]` | -26.8% | 351.9 `[413.7, 350.9, 351.9, 384.9, 350.7]` | -12.0% |
| no-read pin | 402.0 `[413, 402, 953, 366, 365]` | | 372.2 `[350.9, 385.1, 372.2, 409.8, 345.8]` | |

The guard passes on both browsers. The negative ratios are this pass's spread, not a gain: the arc and the no-read pin are the same code, and this pass's base is above the last pass's.

### Probe controls on the arc (a trace build, never committed)

- **First pass:** the trace patch lost its `enable` and `disable` points in a rejected hunk, which voided R5's assertion and R1b's and R3's `reArmed` count. The follow flag that every trace entry carries, and the line's position, stand:
  - R1b and R3 left the follow off after the stop in 8/8 per browser, and held the line with the button in 8/8.
  - Stop moves were 18-19 px, the follow due at the stop, plus one 73 px drag on Firefox before the stop (D5's window).
  - The raw R5 trace shows the follow resumed in the band, stopped by the selection, resumed by the reader's scroll to the end, and the next line followed.
- **Second pass** (trace points restored):
  - R1b and R3: 0/8 re-armed and 8/8 held with the button, per browser.
  - R5 passes its assertions on both browsers: the follow resumes in the band, holds after the stop, resumes at the reader's scroll to the end, and follows the next line (rest gap 0 on Firefox, 1 on Chrome).

## The review loop on the replan

- **Codex round 1** (gpt-6.1-sol, high, a fresh session): approve, with two low findings.
  - #1: the bound row appended a held line between its two scrolls, whose snapshot lowers the reference by itself. The line is gone.
  - #2: the comment should name the listener-order dependency. It does.
  - Its replay matched every control.
- **Opus diff review**, beside round 1: conditional approve.
  - #1: the same comment point.
  - #2: the "before" row ran the "after" row's path, since nothing reads geometry at the stop. Dropped.
  - #3: the bound row asserted the accepted limit, which reds on base and would red on a later fix. It now asserts only that the second scroll resumes. Phase 2's negative-control count was corrected too.
  - It verified that `Math.min` cannot reopen P1, and that KL-2's three triggers are complete: a mouse drag dispatches `select.pointer` with no scroll (`:4828-4831`).
- **Codex round 2** (resume): approve, no new material finding. The loop has converged.
- **Cross-arc pass** (a fresh session over the plan's net diff from `ce48691e`):
  - Round 1: conditional approve.
    - #1: A1's and KL-2's text still bound the widened triggers to a frame. Fixed.
    - #2: the bound row cannot tell the pin from base. It is the pin lifetime's success control, and the hold rows tell the pin from base, so Architecture's claim was corrected rather than the row.
  - Round 2: conditional approve. The no-op trigger has no timing bound at all, so both proportion justifications drop "within a frame". Fixed.
  - Round 3: approve. It also confirmed that arc 1's two-frame baseline, its 1 px bound and the after-viewer latch still describe the fixed viewer.

## Gate (`4dc82ab9`'s build; `6e772a2a` changes only a comment and the tests; retry 0, each run started at load1 under 150)

- `bun run lint`, `bun run typecheck:all`, `bun run test:all` and `bun --bun vitest run src/components/JsonViewer`: green.
- `viewers-csp.test.ts`: Firefox 10/10 green and Chrome 5/5 green, 8 of 8 tests each.
- Full smoke suite: Firefox 2/2 green (2518 s, 2484 s) and Chrome 1/1 green (1670 s), each 268 passed and 14 skipped.
- The file's wall-clock, base (one run) and arc:
  - Firefox: 35.6 s on base, 37.5 s on the arc (median of 10, range 35.0-43.9).
  - Chrome: 26.0 s on base, 27.5 s on the arc (median of 5, range 26.8-29.9).
  - The arc adds no e2e scenario, and the spread is the host's load.

## Tooling

- `resume-codex.sh` runs its own default model unless the fifth argument names one. The first design's round 2 started on another model and was restarted on gpt-6.1-sol within seconds; every later resume passed the model.
- A cost guard needs its host state pinned. Waiting a bounded time per sample for a load ceiling, then running at the run gate's ceiling with the load logged, keeps the pass moving.
