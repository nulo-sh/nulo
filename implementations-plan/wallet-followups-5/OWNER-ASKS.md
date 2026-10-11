# Owner asks: wallet-followups-5

No screen layout, copy or format changes, and every window closes on the same step as today. One effect a person could notice goes to the owner; its answer gates #312's delivery only.

## OA-1. The log viewer stops gaining a spurious "unhandled rejection" row

- **Surface:** Settings → Developer → Logs (the log viewer window) and its CSV export. The rows appear there for a user who opens the viewer; the buffer is kept for every user (CLAUDE.md § Logging policy).
- **Today:** when a page closes a window that the background or the user already closed, the page's unhandled rejection reaches `console-forwarding.ts`, which logs an Error row, "unhandled rejection", carrying `Invalid window ID: N` (Firefox) or `No window with id: N.` (Chrome), when the closing page still processes it.
- **Options:**
  1. **Ship #312's fix.** That row no longer appears. A remove the browser does not confirm logs one Error row, "This window could not be closed", with the error under `error`.
  2. **Hold #312.** The row keeps appearing on a lost race; #312 stays open.
- **Recommendation:** option 1. The row reports a race that is not an error, and the new row appears only when a window really failed to close.
- **What ships now:** #302 in full, in this arc's PR. #312 is built and validated (Phases 2 and 3) only when the owner's own "ship", relayed by the orchestrator, is recorded in `STATUS.md` before Phase 2 (and quoted in the PR body); with no answer by the time Phase 1 is green, the PR carries #302 alone and #312 stays open with a comment pointing here.
