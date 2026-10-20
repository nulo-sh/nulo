# viewer-followups-1: phase 0 (reproductions and consults)

## Builds and runs

- **Arc build:** a throwaway branch in this worktree, `origin/dev` at `817cce9d` with arc 2's viewer and unit diff applied, plus an uncommitted trace patch. The patch logged each line, snapshot, scroll event, follow change, `focusin`, `target`, and CodeMirror update. Each record carried `scrollTop`, `scrollHeight`, `clientHeight`, the gap, the follow flag, and `lastScrollTop`. Armed builds for both browsers. The branch was deleted, and nothing was committed.
- **Base build:** `dc94581d`, the armed build of viewer-flake-1's own measure (dev's viewer, no trace).
- **Runs:** a scratch smoke file, through `test:e2e --retry=0`, one browser at a time, each started at load1 under 150 (33-94). The scratch file and the traces stay outside the repository.

## #921: the search panel and CodeMirror's end anchor

- **P921a, F3 at rest:** 60 lines, the view at its end, the content focused, F3, then 400 ms of trace. On both browsers and both builds, 8/8: the `focusin` stop ran, and no scroll event followed it. The panel lifted the view 28 px off the end (`clientHeight` 694 to 666 on Firefox, in two steps). The first line after it showed the button. CodeMirror anchors at the end only when the height map changes (recon), and a panel does not change it.
- **P921b, F3 with a follow in flight:** a `MutationObserver` saw the line's DOM. In the same microtask, after `scrollToBottom` had dispatched the follow, the probe dispatched a synthetic F3 `keydown` on `.cm-content`. The panel opened and focused 8/8.
  - Base: the next line was followed (gap 0 Firefox, 1-2 Chrome, no button), 8/8 per browser. The follow resumed.
  - Arc: the follow's one scroll event landed at the shrunk end (gap 0-2) with `lastScrollTop` pinned, and read no move down. The next line was held (gap 18-20, button), 8/8 per browser.
- **The same shape, natural:** in a Firefox trace of the search case, `focusin` (panel) came at 720 ms with a wallet line's follow due. The follow landed at the shrunk end at 724 ms (gap 0), pinned. #616's trace (`20 focusin (panel), 29 scroll gap=0`) has this shape.
- **P921c, a 500-line burst while following:** 0 later-frame corrections in 8 bursts per browser on the arc build. After the last line came the follow's own event (pinned), then at most one more at the same offset. CodeMirror's height corrections run inside one `measure` call (`dist/index.js:8153-8243`).
- **Conclusion:** the end-anchor mechanism the issue names does not occur on an F3 open, and the late height correction did not reproduce. A follow in flight across the F3 open does resume on base, and arc 2 fixes it. The 1-in-11 trace has that shape, but its cause cannot be proven now.

## #923: the deep link

- **P923:** a window logged 60 lines, a `console.warn` marker and 3 more lines, and read the marker's id. A second window opened at `src/popup/index.html?logId=<id>#/windows/logger`. After six frames, 3 lines were logged.
  - Firefox 8/8 and Chrome 5/8: after the mount the view rested at the end (gap 0-1) with no button. The 3 lines carried the marker 55 px up: the follow resumed.
  - Chrome 3/8: the marker sat outside the last half screen (gap 72). The view held with the button, which is correct.
  - Trace: `target`, then the target's scroll event read a move down from 0 in the end band, so `enable` ran.
- **Unit row** (`LogsViewer.test.ts`, mounted at `?logId=3` of 3, the target's scroll landing at 590 of 600): red on arc 2 alone, green with `lastScrollTop = Number.POSITIVE_INFINITY` after the target's dispatch. The control "the reader's scroll down into the band after it still resumes" was green on both.

## Beside #923: a line before the first measure replaces the target

- **P923-pump:** the first window logged one line every 2 ms for 4 s while the deep link opened. Firefox 1/6 and Chrome 5/6 opened at the top of the log: `scrollTop` 0, the marker more than 17,000 px below.
- **Trace:** `target`, `disable`, then a line within 1-5 ms. `holdPlace` snapshotted offset 0, and that snapshot replaced the pending target (`dist/index.js:8005-8007`). Without the pump, 0 of 16 P923 runs showed it.

## #922: the search case's gap read

- **P922** (the case's own steps, arc build), 8 per variant per browser:
  - Plain: Chrome 0/8 red, Firefox 1/8 red. The Firefox red was natural. A wallet line landed at 831 ms, between the case's `scrollTop = scrollHeight` and its scroll event, while F3's focus held the follow. The line was held (gap 18). At 852 ms the event resumed the follow in the band without scrolling, and the refocus at 854 ms stopped it at gap 18.
  - A line injected after the refocus (the issue's path): red 8/8 per browser (gap 18-83, wallet lines included).
  - A line injected between the scroll-back and its event: red 8/8 per browser (gap 18, or 54 with wallet lines).
- **The issue's first option fails here:** reading the gap before the refocus does not help in the second window. The view is already 18 px off the end when the refocus comes.
- **P922ob, the planned setup:** F3, blur, one line held (the button showed 12/12), a `pointerClick` on `logs-scroll-btn`, the gap read while following, then a refocus of `.cm-search .cm-textfield`, the line read two frames later, 2 lines, the hold. Green 18/18 per browser: 6 plain, 6 with a line injected right after the click (followed, gap 0-2), and 6 with a line injected in the refocus's own task (held, the baseline read after it). The click hit the button at its centre every time.

## The planned viewer change in the browser (after audit round 1)

A second throwaway branch carried arc 2's viewer, the trace patch, and the planned `scrollToTargetLog` lines: the pin, then `snapshotPending` with its `requestMeasure` read. It had armed builds for both browsers and was deleted after.

- **P923:** 0/16 resumed. Every target's scroll event read the pin, and no line was followed.
- **P923-pump:** 0/16 opened away from the target. Every first scroll landed at the target (12,500-17,250 px), and none resumed the follow.
- **D5's residual (P923-residual).** Clear logs, then a `console.warn` marker as the first line, then 40 lines. The window opened at the marker with no scroll, then Ctrl+End jumped to the end, then one line. 3 runs per browser and build.
  - Chrome, both builds: wallet lines held within about 10 ms of the opening lowered the pin, so the jump resumed the follow on both. The residual did not show.
  - Firefox, today's build: 2/3 followed the line after the jump (the third was held by wallet lines).
  - Firefox, fix: 3/3 held with the button. In run 2 the jump's scroll event read the pin intact: the residual is demonstrated. Screenshots: `firefox-arc-residual-1.png` and `firefox-fix-residual-2.png`, kept outside the repository.

## The Phase 1 probe (after audit round 2)

`vf-probe.test.ts` asserts instead of recording. `probe-hooks.patch` only exposes the window's logs, so the probe can find the marker's id. Both live outside the repository. Each ran on a throwaway branch, which was deleted after.

- **Planned change** (arc 2's viewer, the pin and the pending flag): `PROBE_PIN=1 PROBE_N=8`, green on both browsers. Chrome took 17 s and 46 s, Firefox 27 s and 53 s.
- **Arc 2's viewer alone:** red on both tests, on both browsers.
  - Chrome: run 1 failed "the log held" (moved 54 px), and run 1 under the pump opened away from the log.
  - Firefox: run 0 failed "the log held" (55 px), and run 3 under the pump opened away.
- The first version of the probe read a closure variable inside `page.evaluate` and failed on every run. The value is now passed as an argument.

## Consults

- **Recon, Sonnet explorer:** the reuse map in recon.md. It found no helper that clicks the scroll button or focuses the search field, and no unit test that mounts with a URL query.
- **Audit round 1, Codex** (gpt-6.1-sol, high, session `01a157a3`): conditional approve.
  - D5 needs the owner.
  - #921's attribution is an inference.
  - F4 needed precise wording.
  - The gates were missing `audit:vue`, a full smoke run, the CI suite wall-clock and an explicit burst guard.
  - It confirmed #923-B against the measure loop, the fold-in and the restructure.
- **Audit round 1, Opus Plan:** conditional approve.
  - The `focusin` mutation control failed in setup, so it tested nothing.
  - D5 needs the owner.
  - The fix needed a browser probe on the fixed viewer. It was run above.
  - Smaller points covered F4's exceptions, #921's wording, #923-B on #923, the cap, the CodeMirror dependency and housekeeping. All were accepted (plan § Audit verdicts).
- **Audit round 2, Codex** (resume): conditional approve.
  - A1 understated the residual and had no branch for option B.
  - The probe step was not executable and only recorded results.
  - The before-edit reds needed scoping.
  - The manifest claim was unsupported: CRXJS writes web-accessible resources into the built manifest.
  - All were accepted. It confirmed both mutation controls by trace.
- **Audit round 3, Codex** (resume): approve, no new material finding.
