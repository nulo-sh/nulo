# Phase 2: #305, a seed the test cannot run exactly is refused

## Gate (2026-10-11)

- `cd apps/extension && bun --bun vitest run scripts/e2e/chaos-seed.test.ts`: 15 pass (8 refused values across three classes, 5 accepted, unset and empty).
- `NULO_E2E_CHAOS_SEED=abc` through `e2e:agent` (proverless, retry 0): red as specified. The file fails at load with `Error: NULO_E2E_CHAOS_SEED="abc" is not a decimal integer seed` (`send-chaos.test.ts:32` → `chaos-seed.ts:12`), `Tests no tests`, no `[send-chaos] seed=` line, the sandbox torn down, `vitest exited with code 1` and `e2e:agent` exit 1 (not 86, so no infra retry).
- `NULO_E2E_CHAOS_SEED=1095865833`, Chrome: green (1 test, 169 s; longest silence 39.7 s). Firefox (`NULO_E2E_BROWSER=firefox`): green (1 test, 188 s; longest silence 53.9 s).
- Replay check: the `[send-chaos] seed=1095865833 … actions=` line of both local runs equals the one in PR run 38162383273's chaos leg (job 114537885785, read with `gh run view --log`) once each distinct `destination` is relabelled by first appearance (`d1`, `d2`); the head (seed and replay hint) is byte-equal.
- `bun run lint`, `bun run typecheck:all`, `bun run test` (741 files, 11314 tests): exit 0.

## Notes

- The refusal lands in vitest's "Failed Suites" before the `burst` fixture boots, about a minute into the run (the build and sandbox start come first, in `agent.sh` and global setup).
