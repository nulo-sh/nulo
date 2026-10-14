# Phase 4: playground inputs, the live scenario, screenshots

## What landed

- Playground: `pg-input-maxFeesPerGas` and `pg-input-maxPriorityFeesPerGas` (`da,l2` in base units); when either is set, every `sendTx` button passes it as `opts.fee.gasSettings` (one `sendOpts` helper replaces the eight inline option objects). README row added.
- `fee-sponsor-funding.test.ts`: "an app asking for a priority fee through Nulo's sponsor: the row names it, and the node admits the send". The app pays through the canonical sponsor (`sendTx-appSponsored`, salt 0) with a priority of 1e10 per gas on both dimensions; the test waits for the landed row, asserts B's sentence (priority > 0 and below the figure), shoots it, presses Confirm and waits for the `sendTx` result's hash (`NO_WAIT` resolves only after the node admitted the transaction). The priority input is cleared in `finally`, so the file's other tests never inherit it.

## E2E runtime budget

| Scenario | Failure mode | Why no cheaper layer | Estimate | Measured |
|---|---|---|---|---|
| priority through Nulo's sponsor | the node refuses a send with a non-zero priority and a cap that includes it; the row loses the real estimate's figure | the node's admission code is not installed; the estimate crosses the service worker and the window | ~90 s per browser | Chrome 21.1 s, Firefox 67.3 s (file: Chrome 87.2 s, Firefox 128.9 s for 4 tests) |

The PR body carries each browser's network-suite wall-clock before (the latest successful PR run of the same workflow) and after (this PR's run), per the `e2e-testing` skill's method.

## Screenshots

`screenshots/`, light and dark, Chrome and Firefox:
- `execute-app-fee-priority-*`: the app-paid row with a priority (from the new scenario).
- `execute-app-payer-short-*`: the app-paid row without a priority, "Fee up to X FJ", with the existing short-payer notice under it (from the file's third test).
- `activity-gas-breakdown-*`: the activity detail's expanded breakdown of a send with teardown limits: L2 gas, DA gas, Estimated. Taken with an uncommitted shot-only smoke spec (seeded row, armed smoke build), deleted after.

## Gotchas

- The smoke harness refuses a plain `build:chrome`: it needs the armed build (`VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:<browser>`) and `NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1` at run time (`tests/e2e/global-setup-smoke.ts`). Phase 5 step 3 uses that build.
- On Firefox, `page.reload()` on the extension popup never resolves its navigation; reopen the popup instead.
- The aztec CLI's own anvil bind error at boot ("Address already in use") is expected; setup continues.

## Gate (2026-10-14)

`NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/fee-sponsor-funding.test.ts --retry=0`: Chrome 4/4, exit 0; Firefox (`NULO_E2E_BROWSER=firefox`) 4/4, exit 0. Pass. Also run: `bun run test` 12122 passed, exit 0.
