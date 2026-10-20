# viewer-followups-1: phase 1 (the deep link)

Base: `origin/dev` at `e6a68cd5` (#925 merged), merged into the lane branch. The pin is in `scrollToBottom`. A1 was answered A (the owner's P71-08), so every step ran.

## Unit rows

- The three rows of `describe("LogsViewer opened at a log")` were run on arc 2's viewer before the edit. "A line before CodeMirror's first measure leaves the target pending" and "the target's own scroll into the end band keeps the hold" were red at their first assertion after the mount (`expected true to be false`). The success control "a reader's scroll down into the end band after it still resumes the follow" was green.
- With the change, the JsonViewer units passed 107/107.
- Negative control: dropping the two `snapshotPending` lines, with the pin kept, reds only the #923-B row (21/22). The file was restored from a copy.

## Browser probe

`probe-hooks.patch` was applied, and `vf-probe.test.ts` was copied beside the smoke specs. Both browsers were built armed, and each test ran `PROBE_PIN=1 PROBE_N=8` at retry 0, each start at load1 under 150. Neither file was committed.

- **The change:** green on both tests, on both browsers. Chrome took 26 s and 51 s, Firefox 32 s and 50 s.
- **The old viewer** (origin/dev's `LogsViewer.vue` with the hooks patch):
  - Chrome red on both tests: run 2 "the log held" (moved 54 px), and run 0 under the pump opened away from the log.
  - Firefox red on the hold test: run 0, 55 px. The pump test passed 8/8 this time; planning saw it in 1 of 6 runs.
- Then the patch was reverted, the copy deleted and the arc's viewer checked out. `git status` showed only the plan files, and both browsers were rebuilt armed and clean.
