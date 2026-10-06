# Execution decomposition

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: the split of the execution service into focused modules under `apps/extension/src/wallet/services/execution/`: `execution-coordinator.ts`, `transfer-executor.ts`, `dapp-send-executor.ts`, `transfer-estimate-reuse.ts`, `gas-balance-reader.ts`, `execution-lane.ts` and the resolver helpers in `contract-resolver.ts`, each with colocated tests; `service.ts` stays as the RPC facade and dispatcher.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Decompose the execution service with zero behavior change, in a fixed order: characterize first, finish the contract resolver seam, replace positional result tuples with named objects, extract one shared "prove and send" tail used by all four send paths, extract the estimate-reuse and gas-balance caches, trim the facade with flow-family executors, and move the concurrency machinery into an execution lane last. The lane step carried a pre-defined bail-out that would have been escalated for a decision rather than silently shrinking scope.

## Why

Every send flow passes through this service: signing, proving and the fee path. A regression there moves money, so the arc was sequenced to keep each step independently revertable and proven by tests before the next. Named result objects went before the tail extraction because several tuple slots shared a type (gas, teardown, fee) and a silent transposition would cost funds. The lane went last because its semantics are the riskiest and the earlier steps already met every done-condition.

## What shipped

- One coordinator method owns the stage transitions, cancellation checkpoints and prove/send wrappers for all four paths. Variation between paths is data (scopes, record builder, journal marker), never branches. Failure handling and receipt shaping deliberately stay caller-side because the paths really differ.
- The facade ended the arc under its hard 1,200-line budget, with the estimate-reuse cache and the gas-balance cache in their own unit-tested modules.
- Executors receive slot, claim and cancel through an injected lane-shaped interface, so the lane step swapped the implementation behind it.
- Structural parity fixtures put distinct sentinel values in every same-typed slot, so a transposition that scenario e2e would hide inside fee-multiplier tolerance fails loudly. Tests characterize the rejection branches the code really has, never one it lacks.
- Pinned behaviors: the direct send path takes no execution slot, the exact scopes passed to simulate and prove on each path, the chain-identity guard on every moved path, the profile-drift rejection in estimate reuse, and the lane's capacity-rejection mapping and queued-wait heartbeat.
