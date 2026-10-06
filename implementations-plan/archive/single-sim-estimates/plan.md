# Single-simulation estimates

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: A discovery-aware estimator that folds dApp fee estimation into fewer simulations (`apps/extension/src/wallet/services/execution/discovery-aware-estimator.ts`, `apps/extension/src/wallet/services/execution/dapp-send-executor.ts`, `apps/extension/src/wallet/services/execution/fee/fee-juice-strategy.ts`), a gas-limit clamp (`apps/extension/src/wallet/services/execution/fee/fee-strategy.ts`, pinned by `apps/extension/src/wallet/services/execution/fee/fee-strategy-clamp.test.ts`) and an e2e arming guard.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Cut the number of simulations a dApp `aztec_sendTx` estimate runs, but only after measuring that the shortcut sizes gas identically. Account addresses are stubbed during the first simulation so private authwit requirements can be discovered without real witnesses. The target counts were:

| Flow | Before | After |
|---|---|---|
| Sponsored, no authwit | 2 | 1 |
| Fee Juice, no effects | 2 | 1 |
| Private fee-payer or user-added fee payer | 3 | 2 |
| Authwit-bearing or intent-carrying | 2 to 3 | unchanged, validated path |

Sequencing was measure first: the inert extraction, then the testnet measurement, and only then any stub adoption. A failed measurement would have abandoned the private fee-payer fold, not tuned it.

## Why

Each simulation is a proof-sized round of node and PXE work, and estimates run before every confirm. Unstubbed discovery is impossible, because the authwit oracle throws on a missing witness before any result exists, so the stub is required rather than optional.

The cost is stated plainly. After the fold, the no-authwit Sponsored and Fee Juice flows have no pre-proof node validation on the happy path; a failure surfaces at the post-proof send, which the node still rejects, with no on-chain safety loss. An app that needs a standalone inner-hash authwit the user never attached emits no effect under the stub, so it fails loudly as a pre-submit proving error instead of at estimate time. Any operation that already carries a private authwit action takes the validated path, so nothing is sized from a stub with unverified witnesses.

## What shipped

- **Estimator.** A constructor-injected, chain-bound discovery probe and a decorator that owns its own probe-bearing strategy instances. The send path keeps probe-free instances, pinned structurally and by simulation-option pins on every unchanged route. Extraction runs on the first simulation only, and the live chain-identity guard is preserved through the probe.
- **Clamp.** Auto-derived gas limits are capped at the minimum of the node-advertised transaction limits and the protocol maxima, and throw when simulated usage already exceeds admission. Custom limits are validated, not silently capped. The node limits are retained from the existing node-info fetch, so no RPC was added.
- **Measurement.** Stub-derived gas equalled validated gas on every runnable shape, across interleaved repeats and a note-set change, because Aztec prices private execution by side effects and the stub preserves them. Inclusion canaries mined on stub-derived limits, including a private fee-payer transaction whose fee needed notes combined.
- **e2e arming.** The agent runner scans for a formal marker on specs that need a proverless build and refuses to start an unarmed run, with remedial text.

## Lessons

### Live canary

The delegated-authwit discovery path is exercised live on testnet, not locally. The local network does not seed the standard contract the consumer calls, so `apps/extension/tests/e2e/network/tx-sendTx-delegated-authwit.test.ts` is gated on `NULO_E2E_STANDARD_CONTRACTS=1`. The testnet measurement also exposed that the previous stub mechanism never engaged: the override constructor dropped the contract map, so a delegated call failed with an unknown-authwit error. The corrected class-swap override fixed it, as a production bug as well as a precondition of the fold.
