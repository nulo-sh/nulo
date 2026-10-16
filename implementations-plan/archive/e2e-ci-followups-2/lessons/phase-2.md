# Phase 2: one ladder for every speed (#405)

## Base

The new `feeMultiplierFor` case at `VITE_NULO_FEE_MULTIPLIER=10`, run before the fix (Bun): `expected [ 10, 2, 3, 5 ] to deeply equal [ 10, 10, 15, 25 ]` for no speed, `normal`, `fast`, `urgent`. An explicit `"normal"` priced 2 while no speed priced 10: the Send page's Normal (no `priorityLevel`) and any caller naming `normal` disagreed in an e2e build, beside the Normal-above-Urgent inversion the issue reports.

## Deviation

- The control case stubs the env to `""` and re-imports, rather than reading the file's static import: a shell or job that exports `VITE_NULO_FEE_MULTIPLIER` would otherwise red the control. Both cases share one `test.each`.

## Gate

- `bun --bun vitest run src/wallet/services/execution` (Bun): 64 files, 1,244 tests, exit 0; the two pin files unchanged (`git diff --stat` empty for `*.pins.test.ts`).
- Node: `estimate-reuse-shared.test.ts` and both pin files, 92 tests, exit 0.
- `bun run lint`, `bun run typecheck:all` exit 0.
- Chrome, CI env (`NULO_E2E_PROVERLESS=1 NULO_E2E_RETRY=0 VITE_NULO_FEE_MULTIPLIER=10`, `e2e:agent`), launched at load1 114, 23:32-23:46Z: ``bundle contains parseFloat(`10`) ✓``; `same-token-concurrent-sends` 16/16 (the Fast-then-Urgent case 42 s) and `popup-escape-layered` 2/2 green, 800 s, exit 0; no Fee Juice shortfall at Urgent's 25×. No row for the worktree left in `~/.agents/ports.md`.
- `bun run test:all` exit 0 (every workspace; extension 795 passed, 3 skipped).
