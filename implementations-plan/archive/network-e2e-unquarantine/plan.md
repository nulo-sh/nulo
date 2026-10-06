# Un-quarantine network e2e tests

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: The three quarantined network tests run on CI again, the `cancel-mid-prove` waits are back to 30 seconds, and the cap-popup-heavy tests use pre-grant fixtures, in `apps/extension/tests/e2e/network/` and `apps/extension/tests/e2e/fixtures/extension.ts`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Restore the network suite to zero skips and zero artificially stretched waits, in one change with one phase per test so any phase reverts alone. The trigger was the native proving accelerator ([accelerator-server-ci](../accelerator-server-ci/plan.md)), which removed the browser-WASM proving variance that had motivated the quarantine.

- Phase order is driven by attribution. The cap-popup-class fix (moving `sim-methods` to a pre-grant fixture) goes first, so that later proving-class results are not muddied by residual popup flake. Then the `cancel-mid-prove` waits, `tx-sendTx-default`, `tx-sendTx-multicall`, and `multi-account-from` with a new pre-grant fixture variant, then cleanup.
- The `multi-account-from` fixture migration lands upfront instead of "only if needed", because a three-green-runs acceptance gate cannot tell a real fix from luck when each test gets retries.
- Acceptance is three consecutive green runs, and zero retries used on the test most exposed to popup load.

## Why

Three tests were skipped on CI through an environment switch and one test's waits were tripled, all for the same reason: slow-runner variability in proving and in popup creation under cumulative load. With proving native and the pre-grant fixture pattern already proven elsewhere, the gates were no longer load-bearing, and a skipped test is a signal the suite stops giving. Raising the popup timeouts globally or converting the tests to expected-failure were rejected because they hide exactly the signal the change exists to recover.

## What shipped

- `sim-methods` and `tx-sendTx-multicall` moved to pre-grant fixtures, so the capability grant is paid in the fixture's hook timeout instead of the test budget.
- `multi-account-from` uses `dappConnectedExtensionWithFirstTwoAccountsCap`, a variant of the transaction-cap fixture that grants the first two accounts.
- The quarantine environment switch and its CI and docker-runner wiring were removed.
- The partial fix was completed by [journal-stage-restructure](../journal-stage-restructure/plan.md), which asserts on the wallet's journal proving stage instead of waiting for the dApp's full send promise. The three tests are un-quarantined by that stage assertion, and the fixture migrations and the stronger waits from this change stayed as foundations.
