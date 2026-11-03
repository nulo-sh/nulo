# Phase 1: cadence, RPC, page control, docs and privacy

## Step 1: cadence tests at the base (ff395c3d0)

- `bun --bun vitest run src/wallet/services/token-list/service.composition.test.ts` at the base with the new tests: 3 failed, 15 passed. Red: "one deadline: six hours plus jitter…" (stored `T0 + 25 h`, expected `T0 + 6 h 15 min`), "a usable answer waits six hours plus up to half an hour", "a runtime without Ed25519 waits the regular six hours…" (stored `1760090000000`, expected `1760022500000`). Green at the base, as planned: the two ceiling pins (the value does not change).

## Step 4: the e2e step, measured

- Armed builds (`VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run build:chrome` / `build:firefox`), then `NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- tests/e2e/token-list.test.ts --retry=0`. "Before" is the file without the new step, on the arc's build, so the delta is the step alone.
- Chrome: scenario 1 8.7 s → 9.4 s; the file 20.8 s → 21.8 s. Firefox: scenario 1 13.1 s → 13.0 s (noise); the file 34.3 s → 34.8 s. Estimate was +5 s; measured under +1 s.

## Steps 5 to 7

- `origin/dev` merged before the privacy step: #1612 had landed privacy 1.2.8 (undated), so this arc takes 1.2.9. One conflict, `ARCHITECTURE.md`'s token-list and price-feed lines: took dev's lines, then reapplied the cadence sentence.
- OA-1 captures with a scratch smoke spec (deleted after use) on the arc's armed Chrome build: option A as built (idle with two seeded tokens, no tokens, updated, unreachable), then B and C by swapping the template block and rebuilding, then A restored. A first run timed out navigating back to Settings from Settings → Tokens; the spec read the scope from the page instead.
