# viewer-followups-1: owner asks

## A1. Logs window opened at a failure log that needs no scroll: the reader's first scroll to the end holds

**Surface.** The logs window that Settings → Developer opens at the last failure log (`?logId=`).

**What the fix changes.** Today, when the failure log is among the latest lines, the window's own scroll to it reads as the reader scrolling down to the end, so the follow resumes and later lines carry the log away (#923; Firefox 8/8, Chrome 5/8 in the planning probe). The fix tells the viewer that this scroll is its own. When the log sits in the top half of the first screen, the window does not scroll at all, and nothing clears that mark until a scroll or a new line does. In that one case, the reader's first scroll that lands in the end band (an End key, or a single wheel step on a log that barely overflows) keeps the follow stopped. The next line then lands below the view with the scroll-to-end button showing, where today it is followed. The button, a scroll down, or the 30 s timer from the window's opening resumes the follow. Any new line after the window's first frame clears the mark, so the case needs a log whose failure is among its first lines, which in practice means right after Clear logs.

**Pictures.** Two screenshots from the planning probe (Firefox, the planned change against today's build), handed to the orchestrator with the plan report, outside the repository:
- `firefox-arc-residual-1.png` (today): after the jump to the end, the next line is followed to the bottom, and no button shows.
- `firefox-fix-residual-2.png` (with the fix): the same jump. The next line lands below the view, and the button shows at the bottom right.

**Options.**
- **A. Accept it (recommended).** The cost is one missed resume: the reader's scroll to the end does not restart the follow, so lines stay held below the view with the button showing until the reader scrolls down again, presses the button, or the 30 s timer from the opening runs out. It needs a failure among the log's first lines. The outcome is P71-05's pick A (KL-2, #920), which gains this trigger by a comment.
- **B. Remove it.** A one-time frame check after the window opens clears the mark when the window did not move. That adds a mount-time callback that relies on the browser firing a scroll event before the next frame's callbacks, and its own test. It is not designed yet: choosing it sends the pin's part back to planning.
- **C. Keep today's behaviour.** No mark: the follow keeps resuming at the window's own scroll, and #923 stays open.

**What ships now.** Without waiting: #921's closure with its evidence, #922's test fix, and #923-B, which makes the window open at the failure log even while lines pour in. The mark that fixes #923 waits for this answer. If the answer is not in when the arc starts, the PR refers to #923 instead of closing it.
