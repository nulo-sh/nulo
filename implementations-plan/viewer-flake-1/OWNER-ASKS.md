# viewer-flake-1: owner asks

## A1. Logs window: a scroll down to the end within one frame of a stop (KL-2)

**Surface.** The logs window's follow, while text is selected or the search field has focus.

**What the fix changes.** Today, a selection or a search-field focus that lands within a frame of a new line is undone by the viewer's own scroll to that line: the follow resumes, and later lines carry the selection or the match away (#616's rule broken, #849's case-A red). After the fix the viewer holds there. Geometry cannot tell one reader action from that follow: a scroll down to the new end after the stop and before CodeMirror's next measure (under one frame, about 16 ms). That scroll ends where the follow's does, and today it resumes the follow.

**Options.**

- **A. Accept it (recommended).** That reader stays held at the end with no button. A further scroll down there moves nothing and fires no event. The next line lands below the view with the button shown, and a scroll down, the button, or the 30 s timer resumes the follow. Today that line is followed. The window is under a frame and needs a line in flight; the cost is one line held with the button.
- **B. Track the reader's input.** Wheel, keyboard and scrollbar input on the scroller would mark the next scroll as the reader's. That removes the case but adds state, its ordering against CodeMirror's measure on both browsers, and tests for each input kind, for a sub-frame window. It is a plan change of its own.
- **C. Keep today's behaviour.** No viewer change: the follow keeps resuming at its own scroll after a stop, and the selection and search smoke cases keep that red.

**What ships now.** The test half (the follow check read after the viewer, the hold measured from the viewer's stop) depends on nothing here and builds without waiting, as a PR that refs #849. The viewer half waits for A1. Until it lands, the selection and search cases keep the viewer's red at its base rate. Each red in that arc's gate is traced, and must show the follow resuming at the viewer's own scroll.

## Considered and not asked

- **KL-1.** Lines that land between a drag's first move and Firefox's `selectionchange` are followed, as today, however many land in that span (31 ms in the trace). This is pre-existing and unchanged, so it ships unchanged.
