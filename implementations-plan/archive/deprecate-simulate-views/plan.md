# Retire the simulate_views operation kind

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: The `simulate_views` operation kind is gone. The batching and decode logic it held is a pure helper, `apps/extension/src/wallet/services/execution/helpers/batched-view-simulation.ts`, used by the balance projector, the gas-balance reads and the token metadata read.
- **Open items**: the two `BATCH_SIZE = 12` constants that size the batched balance views, tracked in #120.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Remove `simulate_views` from every layer. The dApp wire surface had already dropped it, so what remained was an internal-only operation type and an `ExecutionService` method with three internal callers. The batching moves into a dependency-injected helper that the callers use directly. The helper's inputs are the PXE, node, account and contract resolver, and its dependencies come from a pure `get-view-simulation-deps.ts` function rather than a service method.

## Why

- A kind no dApp can send is dead weight in the operation union, the dApp-interaction switches, the popup's operation card and its humanize test. The popup template branch would also stop compiling under strict type checks once the union shrank.
- The balance projector, the two gas-balance reads (public Fee Juice, private FPC) and the token metadata read were the only users, and a pure helper is unit-testable in isolation where the service method was not.
- The helper keeps the existing launch order for utility calls: all are started eagerly and awaited in order. Changing it would have changed timing with no user-visible gain, and the refactor's hard constraint was no behaviour change in the token list or the gas balance.
- Two further choices: the helper unpacks private return values differently depending on whether the request origin is the account, and it wraps each call's decode in its own try/catch so one bad call does not poison the batch.

## What shipped

- `helpers/batched-view-simulation.ts` and `helpers/get-view-simulation-deps.ts`, with unit tests, an integration test and a pin test for the mixed public/private arm.
- The balance projector (`apps/extension/src/wallet/services/token-balance/balance-projector.ts`) and the gas-balance reader use the helper; the projector has its own tests for chunking at 12 tokens.
- The operation type, request type, dispatcher comment, dApp-interaction switch cases, materialiser branch, execute-window narrowing and operation card branch for the kind are removed. The playground and wallet-bridge docs name it only as retired.
- The plan also bundled passing the popup's pre-fetched token interface to the register-token executor. The tree does not carry that field on the materialised operation, and a test pins its absence, so it is not recorded as shipped.
