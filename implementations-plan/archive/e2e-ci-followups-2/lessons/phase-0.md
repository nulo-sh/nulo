# Phase 0: planning

## Measurements

- `bun --bun vitest run` of `zod-jitless.test.ts` and `content-message-relay.test.ts` alone, load 135: `zod-jitless` 44 ms; relay case 1 78 ms, cases 2-7 2-6 ms.
- Full extension suite on Bun, load 160-190, 798 files, 12,822 tests, 0 failed, 2 m 28 s: `zod-jitless` 63 ms; relay case 1 336 ms, cases 2-7 2.6-7 ms. Only the first case pays the first fetch.
- The e2e-harness-gaps soak JSON at `685b032`: Node run 2, Bun runs 19 and 20 and Node re-run 25 fail `zod-jitless` at `zod-jitless.test.ts:3`; Node run 20 fails the relay at `content-message-relay.test.ts:17` (`beforeEach`), its first case. `pool: forks`, `maxWorkers: null`.

## Reproducer prototype (scratch config outside the repo)

A config that spreads `apps/extension/vitest.config.ts` and adds a `load` hook that waits 12 s for `zod-jitless.ts`, `content-message-relay.ts`, `presto/client.ts` and `e2e/config.ts`:
- Base files, Bun and Node alike: `zod-jitless` "Test timed out in 5000ms"; the relay's and presto's first case "Hook timed out in 10000ms"; `config`'s first case green at 12,035 ms, inside its 30 s `FRESH_IMPORT`.
- Two scratch tests with the fixed shape (a static import; for the relay, a static import plus `vi.resetModules()` and a re-import in `beforeEach`), same delay, Bun and Node: green, cases 1-5 ms. The 12 s moved to the `import` phase of the duration line.

## CI-log search (#322)

Summarised in `recon.md` § #322. The scan's raw hits stay in the lane's scratch cache, outside the repo.

## Consults

- **Codex round 1** (gpt-6.1-sol, high, read-only): `conditional approve`. Findings: the mocked fee test bypasses the real parse (medium); `dispatcher.test.ts`'s in-body `register` import has the #500 shape (medium); eight kept frames may lose the add-on frame (low); Fact 6 too broad. All adopted; its "run the static test in two env processes" variant rejected, because CI's unit job never sets the env.
- **Opus round 1** (Plan agent): `conditional approve`. F1 = Codex's fee finding, fixed by the env-stub re-import; F2 `popup-escape-layered.test.ts` presses Fast and Urgent (Fact 6 false); F3 = Codex's dispatcher finding; F4 fall back to the error's reported location; F5 stale hook comments; F6 one replay is enough, CI replays the seed in every Firefox run; F7 zod's own first native load also sat in the test body. All adopted.
- **Measured for the ledger**: a scratch test (static import of `estimate-reuse-shared`, then `vi.stubEnv("VITE_NULO_FEE_MULTIPLIER", "10")`, reset, re-import) runs the re-import in 50 ms on Bun and 17 ms on Node, and at base yields `[10, 3, 5]` for none, Fast, Urgent: #405 reproduced in a unit run.
- **Codex round 2** (resumed same session): `approve`; no remaining material finding; dispositions disputed: none.
