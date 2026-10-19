# Phase 2: the e2e and the pictures

- 2026-10-19 Chrome smoke (head armed build, retry 0): security-backup, onboarding-tab, passkey-paths, keyboard-guards, auth-flows 19/19 in 204 s. The new test took 13.6 s, and 15.8 s in a second run.
- 2026-10-19 E2E red proof: a Chrome build with the service mark disabled fails the new test with the full card (`get-started-hide`, `-aztec`, `-feeJuice`, `-presto`). The head build was rebuilt after it.
- Wall-clock of `security-backup` (base spec on the base build, head spec on the head build, host load 140-190, so noisy):
  - Chrome: 26.0 s before (tests 17.5 s), 62.7 s after (tests 37.2 s; transform and import took 41 s of it under load).
  - Firefox: 40.4 s before (tests 22.8 s), 62.1 s after (tests 48.0 s). The new test took 19.0 s.
- Pictures: the capture spec (kept under the lane's scratch dir) was copied into `tests/e2e/` for one Chrome run and removed; `git status` was clean after. 17.4 s. Six PNGs are in `screenshots/`.
- The first capture attempt sat in its wait for load under 150 past the tool's foreground limit and was stopped; the copied spec was removed at once. Waits now run in bounded calls before the copy.
- 2026-10-19 Firefox smoke (head armed build, retry 0): security-backup 3/3; onboarding-tab, passkey-paths, keyboard-guards, auth-flows, passkey-toolbar-panel 22/22 in 452 s. The own-window create test with the new assertion ran (22.5 s).
- 2026-10-19 Arc end: `bun run test:all` 0 (extension 14144 passed). The Chrome smoke ran before the comment-only commit `ee8bd438`, which changes no bundle behaviour.
- 2026-10-19 `audit:vue` failed on `typecheck:all`: the Firefox assertion passed `created.profile` (`string | undefined`) to the key builder; the phase 1 typecheck predated that edit. Fixed by listing the stored marks (`e832f723`); Codex round 3 showed the list dropped the value check, so it compares `[key, value]` pairs (`a502f56d`). Lesson for this run: rerun `typecheck:all` after the e2e edits, not only after the source edits.
- 2026-10-19 Final gates: the changed Firefox test rerun green at retry 0 (26.8 s); `bun run audit:vue` 0 (lint, typecheck:all, 14144 tests, build). Its bounded wait for load under 150 ran out and the run started at load 310, above the lane's bar; it passed, and nothing else ran above the bar.
