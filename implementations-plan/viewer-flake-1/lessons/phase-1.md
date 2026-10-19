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
