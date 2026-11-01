# Phase 4: full gate, e2e and captures

- The smoke suite needs the armed build first (`VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:chrome`, or `build:firefox`); without it the run stops at "No chrome extension at dist/chrome".
- Diff review, Codex round 1: the window test's map fake only cleared `failed`, so its recovery case passed without ever going through the pending state the real engine enters. Fixed by mirroring the engine's transitions in the case's own mock implementations, not the shared fake (`8616a3829`).
- Diff review, Opus: a case about a template ref on a design-system component must mount the real component. `FeeSettingsCard.test.ts` stubs `Flex` with a `<div>`, whose ref is the element's component proxy in a different shape from the real one's exposed proxy. `Flex: false` does not work in this config (no resolver in the test transform), so the case imports `Flex` from `@nulo/design` (`060f1d4a4`).
- Diff review, Codex round 2: clean.
