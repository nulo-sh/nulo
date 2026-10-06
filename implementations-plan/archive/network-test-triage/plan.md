# Network test triage

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: The network-switch default-account fix in `apps/extension/src/popup/network-switch.ts` (tested by `network-switch.test.ts`), the no-account guard in `apps/extension/src/popup/components/popups/NewTokenPopup.vue`, and the network-switch helper in `apps/extension/tests/e2e/fixtures/helpers.ts`. The import carries no recorded delivery; the surfaces are in the tree.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Treat the 19 failing network e2e tests (of 66) as a diagnosis problem before a timeout problem. Two review passes had sorted them into five clusters, blaming PXE serialization, 60-second RPC timeouts and a popup closing mid-request. Three instrumented diagnostic runs came first, then one pull request of wallet fixes plus helper fixes, with no retry wrappers and no timeout bumps as the fix.

## Why

- The probes showed one unifying cause neither review predicted. Switching to a network that has no account yet left the popup's account state empty, because default-account creation lived only in the initial profile load, not in the network-switch handler.
- That broke the three clusters differently: adding a token read the address off an undefined account, threw inside a swallowed catch and never raised the toast; the fee-juice fixture waited on a stored active account that never settled; the contact sender chip never rendered. Slow PXE and a cold sandbox were real but not the blocker.
- Pending requests being rejected when a service client disconnects was real but not on the failing path, so it was demoted from a root cause to a correctness fix.

## What shipped

- Switching networks re-fetches accounts and creates the default account when the new network has none.
- The add-token popup refuses to proceed when no account is selected, instead of failing silently.
- The e2e network-switch helper waits for the stored active account to be populated.
- After the fixes all 19 originally failing tests passed, with no regressions. A full run still showed two load-induced flakes that pass in isolation; a scoped per-test retry went onto the flaky tests (it remains in `meta-getChainInfo.test.ts`) and the rest of the rotation was accepted, since the trustworthy signal is each file passing alone.
- Not done: a rewrite of the PXE access guard and any workaround for the sporadic local-database error, which did not reproduce.
