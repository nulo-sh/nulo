# Phase 2: pictures, then the pre-delivery gate

- 2026-10-20, step 1: `bun run audit:vue` 0 at 755b490e5 (242 s). `bun run test:all` 0 again at ce45a01c6 (303 s; 883 extension files, 14596 tests).
- Step 2: armed `build:chrome` 0 at ce45a01c6.
- Step 3: scratch spec in `after` mode, retry 0: green in 84 s. Every frame's words asserted before it was taken; the switch's USD-mode title read "Type in token"; all 20 `-after` PNGs present. With step 0's four `-today` PNGs and shots-949's sixteen, 40 PNGs in `screenshots/`.
- Step 4, first attempt: the Chrome smoke suite run as a foreground call was moved to the background at 600 s, where the harness stops it after 10 more minutes; nothing was red when its own process group was stopped (SIGTERM). Rerun detached with a long timeout (the same trap as token-dash-2's phase 3).
- Step 4, rerun: Chrome smoke suite, armed build at ce45a01c6, retry 0: 60 files passed, 7 skipped; 268 tests passed, 17 skipped; 2158 s.
