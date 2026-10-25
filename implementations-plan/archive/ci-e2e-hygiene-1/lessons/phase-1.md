# Phase 1: #749, the logs probe waits for its own last line

All runs: armed smoke build, retry 0, `viewers-csp.test.ts` whole file unless named.

## Attempts

1. **The plan's D1** (nonce, `pollUntil` on the last probe line's `.cm-line`, then two frames): Chrome 3/5. Both reds were `filledLogs`' `gapToEnd < 10`, at 56 and 37 px (3 and 2 lines of 18.19 px). An uncommitted probe of the editor's last lines and gap (4 Chrome runs) showed why: the logs window also receives the wallet's own lines, in bursts of two or three (`[pxe] WARN json-rpc:client`, `[pxe] ERROR [READ] getContractInstance failed`, `[execution] ERROR Failed to get public FeeJuice balance`, or `[network] ERROR Failed to fetch node info` with a PXE pair), from the smoke's refusing Testnet stand-in, at any moment relative to the probe. A line is in the DOM on `view.dispatch`; CodeMirror scrolls to it in its next measure frame, so a read in between sees the followed view short of its end. F1 and I1 missed these lines.
2. **`gapToEnd` reads after two frames with no mutation of `.cm-content`** (5 s give-up): Chrome 8/8, Firefox 3/5. Both reds in "focusing the search panel stops the follow". A traced build (uncommitted, 6 Firefox runs, 2 red) logged line, button and scroll events from the end of `filledLogs`:
   - every run, both browsers: the first line after a selection shows the button, CodeMirror then scrolls the view back to its end, and that scroll's `updateShouldAutoScroll` hides the button and re-arms the follow. A reproducer (2 more lines, the selection still held) had both followed on Firefox 2/2, the third on Chrome 2/2. This is #616.
   - a wallet line landing between the stop and the latch's install either showed the button before the precondition (red a) or used up the stop, so the probe was followed (red b).
   - once (run 4): the search panel's own layout change made CodeMirror scroll at the end after the panel's focusin and before any line, re-arming the follow (`20 focusin, 29 scroll gap=0, 187 line, 212 scroll gap=0`). Also #616.
3. **The follow check is armed before the stop step** (`armFollowCheck`), with the no-button precondition read in the same evaluate and any scroll that leaves the view 20 px or more from its end before the first show recorded and refused: Chrome 5/5, Firefox 5/5; the Firefox search test alone 12/12.

## Consults

- **Codex** (gpt-6.1-sol, high, session `01a14f1a`): the diagnosis holds (CodeMirror 6.43.9's end anchor in `measure`, then the viewer's unconditional re-arm within 20 px). Rejected recording the gate as "green except the product race". Flagged that counting `.cm-line` insertions is no line count (re-renders add them) and to keep the clean initial-button assertion; suggested the viewer's source filter, or re-focusing the panel after its layout settles. Owner-gated product fix.
- **Opus lens**: same diagnosis, worse than "one line": at the end the first line is still scrolled to; only the button flashes. Arming before the stop is right; replace the line count with the product's own scroll condition (gap ≥ `SCROLL_DISABLE_THRESHOLD`) and keep `toBeNull` at arming. The filter needs testids in `LogsToolbar.vue`, a product file. No honest test-only fix for the panel race: settling the panel first would hide a defect people hit.
- **Decision**: attempt 3 is Opus's shape (D10). The filter and the re-focus were not taken (D11). The panel race stays visible in the test and goes to the owner through #616 (OA-3).

## Gate

`bun run lint` 0, `bun run typecheck:all` 0; attempt 3 5/5 per browser, all 4 tests green. The panel race was seen in 1 of 11 Firefox runs of attempt 2 and in none of 17 since; it predates this arc and can still turn the Firefox smoke lane red until #616 is decided.
