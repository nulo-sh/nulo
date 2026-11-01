# Phase 4: full gate, e2e and captures

- The smoke suite needs the armed build first (`VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:chrome`, or `build:firefox`); without it the run stops at "No chrome extension at dist/chrome".
- Diff review, Codex round 1: the window test's map fake only cleared `failed`, so its recovery case passed without ever going through the pending state the real engine enters. Fixed by mirroring the engine's transitions in the case's own mock implementations, not the shared fake (`8616a3829`).
- Diff review, Opus: a case about a template ref on a design-system component must mount the real component. `FeeSettingsCard.test.ts` stubs `Flex` with a `<div>`, whose ref is the element's component proxy in a different shape from the real one's exposed proxy. `Flex: false` does not work in this config (no resolver in the test transform), so the case imports `Flex` from `@nulo/design` (`060f1d4a4`).
- Diff review, Codex round 2: clean.
- Captures: the smoke `extension` fixture has no profile (it opens on register); `listedExtension` does. A Home activity row is opened through its own link (`[data-testid="tx-card"] a[href*="#/popup/tx/"]`, clicked as an element): a pointer click at the card's centre can land on the explorer link, which the egress guard reports.
- The network captures ran first try on both builds (head 173 s, base 146 s, Chrome). Base restored from `8191ccb8b`; `git status --porcelain` empty after the scratch specs were deleted.
- Before/after runtime of the one e2e case this plan touched, Chrome, in the same filtered run: base 14.1 s, head 15.5 s (+1.4 s; estimated +2 s). In full-file runs on the head: Chrome 20.8 s, Firefox 24.2 s.
- Gate at `8191ccb8b`: test:all exit 0 (150 s), lint 0, typecheck:all 0.
