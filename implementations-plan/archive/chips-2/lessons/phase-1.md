# chips-2 phase 1: captures at the base

Base `9ce6bb0bd`, armed Chrome build (16 s). Captures kept in the lane's scratch dir until Phase 4 commits them.

- Arrival capture (`NETWORK_ARRIVAL_CAPTURES=1`, "the arrival over Home"): pass, 8 s. Stale-network captures (`STALE_NETWORK_CAPTURES=1`, "every takeover state"): pass, 41 s; `A1-network-reset` kept.
- Takeover top bar at 360 px (scratch spec): network chip 75.1×30, Lock chip (padlock and LOCK) 73.5×30. So one label line is 14 px, and the padlock alone in `.chip` would be 15 + 14 + 2 = 31 px: D2's `min-height: calc(1lh + 16px)` is needed (I1 holds).
- #1372 A, `dev`, 240 px, Testnet active: chip 15.6×28 at `6px 3px` and a 4 px gap; name 0 wide; the dot 7 px from the left border, 0.59 px inside the right border.
- #1372 B, the `(width < 359px)` `.network_chip` set to `6px 8px` and a 6 px gap (local edit, rebuilt, reverted; `git status` clean after): chip 18×28; the dot 14 px from the left border and 4 px past the right border (chips-1 measured 3 px).
- Slip: the first revert ran from `apps/` and missed the path; rerun from the repo root, clean. Run every revert from the root.
- Agent shell (zsh): `"$c:legal/x"` expanded as `$c` with the `:l` (lower-case) modifier and printed `<sha>egal/x`. Brace a variable before a colon: `"${c}:legal/x"`.
