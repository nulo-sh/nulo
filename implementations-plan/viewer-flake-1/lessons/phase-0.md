# viewer-flake-1: phase 0 (root cause of #849)

All runs: armed smoke build (`VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1`), retry 0, started only at load1 under 150 while other leads built (load1 at start 131-149). The probe code was never committed: an event trace in `LogsViewer.vue` (each line, follow, stop, snapshot and scroll, with `scrollTop`, the gap to the end, the follow flag, the button and `lastScrollTop`), the test's marks, and a throwaway `_probe-viewer.test.ts`. Line height: 18.2 px (Firefox).

## The natural runs

- `viewers-csp.test.ts` on Firefox, 6 runs unpinned and 1 pinned to two cores: 7/7 green, 42 cases. The failure rate the issue saw (1 in about 18 per case) was not reached; the reproducers below make each window deterministic instead.
- The traces show the wallet's own lines in bursts of three (`Failed to fetch from the remote server`, two `no node answers a guarded e2e run` lines) a few milliseconds apart, at any moment.
- One near-miss of case B in a green pinned run: a wallet line landed between CodeMirror's follow scroll (`scrollTop` 952 → 970) and that scroll's event. At the event the capture-phase read (the test's latch) saw `gap=18`; CodeMirror's own listener then applied the follow still due, and the viewer's listener read `top=988 gap=0`. A burst of two lines in that slot reads 36.

## The reproducers (`_probe-viewer.test.ts`, Firefox, one run each build)

- **R1b**, the selection stop with a follow in flight. Eight times: re-arm the follow at the end, log a line, and when its `.cm-line` is in the DOM (CodeMirror's scroll to it still due) set a DOM selection over a shown line, then log two lines. Base: the follow resumed after the stop 8/8; the selected line moved 18-55 px. Trace (base, iteration 1): `2380 line follow` → `2386 selchange, disable (top 1043, gap 18)` → `2410 scroll top 1061 gap 0 movedDown=true` → `enable` → both later lines followed.
- **R3**, the same with the search field's `focus()` as the stop (synchronous `focusin`). Base: resumed 7/8, moved 54-55 px; the eighth had a wallet line land before the measure.
- **R2**, case B. After CodeMirror's follow scroll and before its event, three lines dispatched as a follow dispatches them. Base: the capture latch read gaps `[55, 0]`, `scrolledAway=true`; the viewer read 0, never stopped, no button.
- **The snapshot trial** (the first design: a stop from a selection or the search field carries the current place and resets the scroll reference): R1b resumed 0/8, R3 0/8, every later line held with the button shown. R1b iterations 0 and 3 still moved 18-19 px: Firefox dispatched `selectionchange` 31 ms after the DOM selection, after CodeMirror's scroll (`1461 focusin`, `1475 selchange top=2190`, scroll from 2171), so the view moved before the viewer could know; the stale event then read `movedDown=false`. That is the test-side half of case A.
- A first R1b reset (`removeAllRanges()` only) left CodeMirror's selection in its state; CodeMirror wrote it back on the next update, a new stop. Only the first iteration of that run counted; the reset now collapses CodeMirror's selection too.
- **Chrome**, same probes: base R1b resumed 8/8 and R3 7/8. The snapshot trial resumed 0/8 and 0/8. R2: latch `[55, 1, 38, 1]` against the viewer's 1 px rest gap (Chrome rests one pixel short of the end). Chrome fires `selectionchange` before CodeMirror's measure, so no move came before the stop.
- **Pin-only trial** (`holdFollow`: `lastScrollTop` set to `scrollHeight - clientHeight` at the stop, no dispatch), Firefox: R1b and R3 resumed 0/16 after the viewer's stop. Every iteration followed the line already due (18-19 px), as base does, then held both later lines with the button shown. Two R1b iterations flagged `enable` from the follow's scroll event; it fired before Firefox's late `selectionchange`, so it was not a resume after the stop.

## Consults

- **Round 1, Codex** (gpt-6.1-sol, high, session 01a1549d, CLI 0.160.0): reject as written. The stop-time snapshot dispatches inside CodeMirror's update when F3 mounts the panel (the search panel's `mount()` calls `select()`); it then reads after a trim, trips the stale `snapshotPending`, and hides the line already due with no button (an owner question). T2's baseline change must state its boundary. Quiet frames are no proof of a settled scroll. The recon overstated `scrollIntoView: false`. Verdicts are in `plan.md` § Audit verdicts.
- **Round 1, Opus Plan leg:** conditional approve, with the same nested dispatch and button findings. Also: the Firefox `selectionchange` lag is partly product (fix it at the source or record a known limit); the search case has its own pre-existing race (a held wallet line before its `gapToEnd` read); the latch wording goes stale; the proof needs Phase 2 controls; F1 and F2 needed corrections.
- **Driver's call:** pin only. It dispatches nothing, so the nested dispatch, the trim, `snapshotPending` and the button question all fall away. The trial shows 0/16 resumes. Its only difference from base is that the follow no longer resumes.
- **Round 2, Codex** (resume): reject. The pin at the stop blocks a resume. When the 30 s timer, or a reader's scroll into the band, has resumed the follow short of the end, a stop and then End stay held. The pin moved to where the viewer causes the scroll.
- **Follow-side pin trial** (`scrollToBottom` sets `lastScrollTop` to `scrollHeight - clientHeight`; the stops are untouched), Firefox: R1b 0/8, R3 0/8, each following the due line, then holding with the button shown. R2 is unchanged, since it is a test misread.
- **Round 3, Codex** (resume): reject.
  - #1: a reader who scrolls down to the new end inside the pending follow's frame stays held. Geometry cannot separate that scroll from the follow's, and base resumes on both. Taken as KL-2: the consequence is one more scroll, and input tracking would add state.
  - #2: "never" overpromises, since the F3 geometry path is excluded. The wording is qualified.
  - Confirmed: the timer and band regressions are gone, both event orders are covered, and Chrome's 1 px rest gap stays under the pin.
- **Follow-side pin trial, Chrome:** R1b 0/8 and R3 0/8 resumed, each following the due line (18-19 px) and then holding with the button shown. R2: latch `[55, 1]` against the viewer's 1 px rest gap. R5 (a follow resumed in the band 10 px short, a stop, the reader scrolls to the end): it resumed.
- **R5's Firefox summary is wrong.** `traces/firefox-probe-R5-*.json` prints `followingInBand=false, resumed=false`, from the reader before its `follows()` fix. Its trace shows the resume: `1020 enable` at gap 10, both stops, then `1121 enable` at gap 0. Chrome's run, with the fixed reader, agrees.
- **Final fresh pass, Codex** (gpt-6.1-sol, high, session 01a154cc): conditional approve.
  - #1: KL-2 understated its consequence. A scroll down at the end fires no event, so only the next line (held, with the button), the button or the 30 s timer resumes. It is also a follow/hold change, so it went to the owner as A1.
  - #2: the R5 summary above.
  - #3: T2 trades the hold's start for a settled baseline. Stated.
  - #4: the pin's geometry read forces a layout per followed line. Unverified; Phase 2 bounds it.
  - By the planner brief, a verdict other than approve ends the session at the plan report. The arc waits for the orchestrator.
