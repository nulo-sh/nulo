# Phase 1: the fix and its component case

- Red before, on `index.vue` at `15a9bd9d3` with only the new case added: `bun --bun vitest run src/popup/windows/execute/index.test.ts -t "a fee method switched while queued" --retry=0` failed at step 2 only, `index.test.ts:925`, `expected true to be false`; no unhandled rejection.
- After the change: `src/popup/windows/execute/` 23 files, 357 tests green; `fee-race.composition.test.ts` 24 green, 1 skipped (its long mode, skipped in CI by design), 19.8 s; `bun run lint` exit 0 (4 infos, none in the touched files); `bun run typecheck:all` exit 0. All at retry 0.
