# Phase 2: pictures, then the pre-delivery gate

- 2026-10-20, step 1: `bun run audit:vue` 0 at 755b490e5 (242 s). `bun run test:all` 0 again at ce45a01c6 (303 s; 883 extension files, 14596 tests).
- Step 2: armed `build:chrome` 0 at ce45a01c6.
- Step 3: scratch spec in `after` mode, retry 0: green in 84 s. Every frame's words asserted before it was taken; the switch's USD-mode title read "Type in token"; all 20 `-after` PNGs present. With step 0's four `-today` PNGs and shots-949's sixteen, 40 PNGs in `screenshots/`.
- Step 4, first attempt: the Chrome smoke suite run as a foreground call was moved to the background at 600 s, where the harness stops it after 10 more minutes; nothing was red when its own process group was stopped (SIGTERM). Rerun detached with a long timeout (the same trap as token-dash-2's phase 3).
- Step 4, rerun: Chrome smoke suite, armed build at ce45a01c6, retry 0: 60 files passed, 7 skipped; 268 tests passed, 17 skipped; 2158 s.
- Step 5: `e2e:agent` on Chrome, retry 0: `send-amount-clamp`, `fiat-send`, `incoming-transfers`, 3 files and 5 tests passed, 308 s.
- After merging `origin/dev` (#953, #944, #956; no conflict): `bun run lint` 0, `typecheck:all` 0, `test:all` 0 (886 extension files, 14641 tests, 184 s), `bun run build` 0 with the generated sources unchanged.
