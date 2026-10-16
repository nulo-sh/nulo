# Phase 1: first loads off the timed budgets (#500)

## Reproducer (scratch configs outside the repo)

Two configs, each spreading the package's own `vitest.config.ts` and adding a `load` hook that waits 12 s for the module under test: the extension one for `zod-jitless.ts`, `content-message-relay.ts`, `presto/client.ts`, `e2e/config.ts`; a second for `packages/wallet-bridge` delaying `wallet-sdk-schema-patch/src/register.ts` (the dispatcher test runs under the bridge's own config, not the extension's: deviation from the plan's one config).

| Run | Bun | Node |
|---|---|---|
| Base, extension | 3 failed: `zod-jitless` "Test timed out in 5000ms"; presto and relay case 1 "Hook timed out in 10000ms"; `config` case 1 green at 12,041 ms, inside its 30 s | same 3 failed |
| Base, bridge | 2 failed: `registerToken` and `getWalletFeatures` schema cases "Test timed out in 5000ms" | same 2 failed |
| Head, extension | 19/19 green; case 1s 4-7 ms; `import 48.33s` | 19/19 green; case 1s 3-21 ms; `import 48.78s` |
| Head, bridge | 263/263 green; `import 13.61s`, tests 354 ms | 263/263 green; `import 19.10s`, tests 370 ms |

The 12 s moved from the test and hook budgets into the `import` phase, which runs under no timeout.

## Gate

- Five files, default config: Bun 4 files / 19 tests green, Node the same; `bun run --cwd packages/wallet-bridge test` 17 files / 750 tests green; dispatcher on Node 263 green.
- `bun run test` (extension, Bun): 795 passed, 3 skipped, 12,860 tests, exit 0, at load 150-176.
- Extension on Node, `bun run vitest run`: exit 1 with 5 failures, all in the three reviewed `BUN_ONLY_FILES` (`scripts/ci-cd/test-soak/lib.ts`: `store-icons`, `windows/json`, `windows/logger`), which the soak's Node reference excludes; re-run with those three excluded, as the soak does: 792 passed, 3 skipped, 12,850 tests, exit 0.
- `bun run lint` exit 0 (biome on the five changed files: clean); `bun run typecheck:all` exit 0.

## Gotcha

- zsh does not word-split an unquoted `$F`: `vitest run $F` passed one filter matching nothing and exited 1 with "No test files found". Pass the files literally.
