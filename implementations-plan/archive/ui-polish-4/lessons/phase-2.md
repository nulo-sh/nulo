# Phase 2: #823

- 2026-10-19: triggers on `Flex tag="button"`, the ring, `aria-label`, testids; `Popover`'s Escape handled and focus returned. Unit: LogsToolbar 5/5, Popover 10/10; the two new Popover cases red on the base `Popover.vue`.
- 2026-10-19: smoke `viewers-csp` on the armed head: Chrome 7/7 (file 38.4 s, new scenario 1.9 s), Firefox 7/7 (45.0 s, scenario 4.3 s). Red proof: a head build with the base `Popover.vue` fails the scenario at the Level panel's Escape (not marked handled).
- 2026-10-19: base `948670ca` for the before-numbers: Chrome 6/6 (49.4 s at load1 ~180); Firefox first run 2 failed in the two view-hold tests at load1 180-255 (untouched by this arc), rerun at load1 134 6/6 (40.6 s). Wall-clock on this host moves with load by more than the scenario costs.
- 2026-10-19: the two base builds started at load1 203, over the 150 rule (the check printed but did not gate); every later build and e2e run waits in a loop for load1 < 150.
- 2026-10-19: captures (scratch spec, Chrome 400x600 DPR 1, both themes): every trigger clip equal to the base by sha256 at rest, on hover and after a pointer open and close, every trigger box equal, so no `text-rendering` or other local rule was needed; after the pointer close focus sits on the button with no ring. Clear logs' row 28 -> 24 px. Holdings' summary height equal on both builds, fiat on (39) and off (21).
