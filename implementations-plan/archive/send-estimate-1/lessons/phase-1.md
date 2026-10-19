# Phase 1: becoming sendable asks

- Base red (`send.vue` byte-equal to `1531e5f9`; `origin/dev` had moved to `f214e5cb` with no send file touched): T1 (public), T3 and T4 (private, real fee card) failed at the post-rise count (0 or 1 estimates where 1 or 2 were due); every earlier assertion held, T2 passed.
- Head: `send.test.ts` and `send.integration.test.ts` 143/143.
- Counter-runs on scratch copies of the head `send.vue`:
  - the issue's getter added to the deep watch, second watch removed: T2 red (`feeEstimate` null right after a covered refresh) and T3 red (`cancelEstimate` called on the drop);
  - design A (`computed(() => amountValidation.value.valid)` as a deep-watch source, second watch removed): T3 red on the drop's cancel. T1, T2, T4 green, as expected: only P5 separates C from A.
- Biome reformatted the hoisted `balanceUpdated` onto one line.
- Gate on `2967e24b`: `bun run audit:vue` exit 0 in 273 s; `bun run test:all` exit 0 in 212 s; armed builds per browser (52 s Chrome, 43 s Firefox), then the three send smoke files at `--retry=0`: Chrome 8/8 in 121 s, Firefox 8/8 in 179 s. No e2e scenario added, so no before/after budget applies.
- Fix loop: Codex round 1 clean; Opus diff review clean (one optional comment nit, not taken).
