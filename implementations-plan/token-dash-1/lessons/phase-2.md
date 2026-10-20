# Phase 2: pictures, then the pre-delivery gate

- **Pictures** (scratch spec and read hold, Chrome, 400×600 at scale 2): 1 of 1 passed at retry 0; agent.sh run 159 s (vitest 107 s, the test 28 s), started at load1 144. The scratch gate (`git diff --quiet 817cce9d -- …/index.vue` and no file left under `tests/e2e/network`) passed after the cleanup.
- **Readings** (CSS px, card top at 170): blank read (name `""`, symbol three spaces) shows `SYMBOL: — NAME: — DECIMALS: 18`; the sandbox token shows `TST`, `TestToken`, `18`. Rows at y 222, 246, 270, each 24 tall; the address row at 294; the card 162 tall; identical in both captures, so the dash moves nothing (I2).
