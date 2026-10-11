# e2e-followups — owner asks

Questions only the owner can answer, for the orchestrator to put on a page. Each one says what ships now without an answer.

## OA-1 — The Settings and History compact title bar can stay hidden after a fast scroll (#269)

**Surface.** The compact title bar ("SETTINGS", "HISTORY") that fades in at the top of the Settings and History pages once the large title scrolls away (`apps/extension/src/popup/pages/settings/index.vue`, `apps/extension/src/popup/pages/activity.vue`).

**What happens today.** The page decides whether to show the bar from the browser's visibility reports for the large title. When the user scrolls fast, the browser can deliver two reports at once, oldest first. The page reads the oldest one, so it can believe the large title is still on screen while it is not. The bar then stays hidden until the user scrolls back to the top and down again. A scripted fast scroll on Chrome left the bar hidden in 4 of 12 tries, with the large title 300 to 1100 px above the view. This is the smoke-test failure in #269; the test is right.

**Options.**
- **A. Fix.** The page reads the newest report. The bar shows whenever the large title is off screen, and hides whenever it is on screen, however fast the scroll. One line in each of the two pages, with a unit test each.
- **B. As is.** The bar keeps its occasional stuck-hidden state, and the smoke test keeps its occasional red at retry 0.

**What each looks like.** A: the same bar, the same look and fade, at the same scroll positions as today's normal case; it is never missing while the large title is gone. B: no change.

**Recommendation.** A. It makes the page do what the approved design says ("the compact bar shows once the hero leaves"); nothing new appears.

**What ships now.** B. Arc 1 ships #249, #272, #274 and #275 without it. #269 stays open with a comment naming the cause, the fix and its tests. If A arrives before arc 1 merges, Phase 1.5 joins arc 1 and the PR closes #269. Until then a retry-0 red of the smoke case is reported as #269, never rerun to green.
