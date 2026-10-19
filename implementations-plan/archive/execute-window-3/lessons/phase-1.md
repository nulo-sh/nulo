# execute-window-3: phase 1 (the advice, the refusal, the authorization notice)

- Before pictures taken on the base build with the scratch decode-failure edits (`ew3-scratch.patch`, outside the repo), one `e2e:agent` run, 2/2 in 132 s; all four scenes reached, the #832 refusal over three unreadable calls included. Edits reverted with `git apply -R` before any commit.
- Red on base: with `OperationCard.vue` and `SendTxSummary.vue` taken from `993b3efc`, the summary and grant tests fail 9 of 22 (every new or rewritten case); with `index.vue` unwired, T5 fails in its four refusal cases and its control.
- Gate: `bun run lint` (format fix on the touched files), `bun run typecheck:all`, `bun --bun vitest run src/popup/windows/execute`, `bun run audit:vue` (860 files, 14092 tests, build), `bun run test:all`: all exit 0. `audit:vue` started at load1 196, above the lane's 150 limit for builds; it passed, and every later build or e2e run waits for load1 under 150.
