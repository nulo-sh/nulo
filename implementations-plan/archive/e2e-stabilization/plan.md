# e2e stabilization

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: the discover popup's Allow button waits for its interaction payload (`apps/extension/src/popup/windows/discover/index.vue`), and the cap-granting fixtures in `apps/extension/tests/e2e/fixtures/extension.ts` move cold popup round trips out of the test budget, as used by `apps/extension/tests/e2e/network/register-token.test.ts`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Fix the network suite's remaining flake in three pieces, iterating locally first and treating CI as the last gate:

1. A popup identity-load race in the discover window, plus a check that the authwit popups' Enter handlers mirror their buttons' full disabled predicates.
2. Restructure the register-token spec so it no longer stacks two cold popup flows in one test.
3. Address cold-shard rotation, where the first cap-driven test on a fresh shard pays all cold-start cost.

The register-token fix took the smaller shape: a file-local pre-grant fixture, one spec, no extra capability-grant file, because the accounts-grant path already has its own test.

## Why

- The discover Allow button was gated on the request id, which becomes truthy before the dApp's metadata has loaded, so the button was clickable while the hostname and logo were still empty. Together with a silent `if (!requestId) return` in `approve()` this is both a flake and a trust problem: a scripted Enter could approve a session the user never identified. The gate is now an `isReady` flag and `approve()` throws if called before init.
- `registerToken` needs the `accounts` capability, not `basic`, so the old spec's cap popup, execute popup and token prefetch had to fit one 60-second budget on a cold shard.
- A warm-up tap in global setup was the first plan for cold shards. A local probe showed no gain, but a warm laptop cannot model a fresh CI VM, so the probe was inconclusive. Log analysis pointed elsewhere: the slow shards were load imbalance plus tests that are intrinsically slow, not a cold capability popup. The remedy pivoted to generalising the pre-grant fixture, splitting the heavy fee tests into their own job and giving genuinely slow tests honest budgets.
- Raising timeouts only moved the same failure higher. A five-run acceptance gate then met 2 of 5, so the structural fixes were kept, `tx-sendTx-default` was quarantined on CI, and its assertion was later redesigned to observe the proving stage instead of the dApp's full send promise, which un-quarantined it.

## What shipped

- The `isReady` gate with component tests, and tightened Enter handlers on the authwit popups.
- Send-style waits that do not mine a receipt, and a split of the heavy fee tests into a separate CI job.
- Retry scope for rotating dapp-connected victims, kept narrow and not used to hide real failures.

### Cap fixtures

`dappConnectedExtensionWithAccountsCap`, `dappConnectedExtensionWithTransactionCap` and the two-account variants connect the playground and drive the capability popup to approval during fixture setup, where the hook timeout is 300 seconds, instead of inside the test's own budget. The accounts fixture exposes the first account the popup selected. The grant helper is deliberately duplicated across fixtures to keep each independently auditable; refactor once a third such fixture appears. A warm-up that rejects the capability request, never silently granting it, was the safe design had warm-up been needed.
