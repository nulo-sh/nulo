# God-service splits

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: the execution collaborators in `apps/extension/src/wallet/services/execution/` (`operation-planner.ts`, `contract-resolver.ts`, `authwit-discoverer.ts`, `tx-request-builder.ts`, `fee/fee-strategy.ts`, `execution-coordinator.ts`), the per-chain runtime in `packages/aztec-runtime/src/pxe/chain-runtime.ts` and `packages/aztec-runtime/src/pxe/artifact-registry.ts`, the read-write guard in `packages/wallet-core/src/utils/rw-guard.ts`, the balance split in `apps/extension/src/wallet/services/token-balance/`, the node factory port in `packages/aztec-runtime/src/ports/node-factory-port.ts` and `apps/extension/src/wallet/services/window-manager/window-manager.ts`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

The three largest wallet services were split into small collaborators behind their unchanged public surfaces, as three sets of independently mergeable pieces. Each piece replaced the old method in place rather than running beside a legacy pipeline.

- The execution service became an operation planner, a contract resolver, an authwit discoverer, a transaction-request builder (standard, plus a separate no-sender path), a fee strategy interface with four implementations (fee juice, fee juice with claim, fee payment contract, embedded) and an execution coordinator that owns the send pipeline and journal updates.
- The PXE service was narrowed rather than faceted: per-chain state moved into a runtime keyed by profile and chain, artifact resolution got an explicit policy with pinning, the offscreen-startup call moved into the PXE client's readiness hook, and the concurrency guard was finished.
- The worker-heavy services were made constructable with fake ports: the token balance service became a repository, a projector and a job queue driven by a background ticker port, the node client creation went behind a node factory port, and window creation moved into one window manager service.

## Why

The execution service was the largest file in the wallet and could not be tested in pieces. The facade pattern had already been proven on the profile service, so the same playbook applied at larger scale, with incremental merging mandatory because a single big-bang change was not reviewable.

Order was decided by dependencies. The fee strategies depend on the request builder, which depends on the authwit discoverer, so the natural a-to-e order could not ship as written; the contract resolver and planner go first. Within the PXE work the guard fix goes first, because it is the only piece that fixes a correctness bug (a profile-switch race), and shipping the rest on a broken guard would leave any regression ambiguously a race or a refactor.

Two pieces of the original design were dropped. The parallel-run verification gate assumed a strangler-style split with a legacy pipeline to compare against, and the in-place approach left nothing to compare, so end-to-end coverage and manual checks stayed the bar. The preview and shared-builder paths (simulate, profile, views) were kept off the coordinator and consume the request builder directly, since they never prove or send.

## What shipped

- The public surface of each service was frozen across its split, so clients did not change.
- The gas-balance read stayed outside the send pipeline, owned by the facade through its own reader, because it is a public RPC and not a send-pipeline step.
- The guard drains readers, queues writers in order and force-releases after a timeout, which closed the profile-switch read and write race. Moving the runtime lookup inside the guard also fixed a latent double-initialization.
- The balance job queue drains until empty in batches by chain, preserving the old worker's behavior. A profile switch stays a no-op. Generation fences for a switch during an in-flight batch came later, described in [service-fences](../service-fences/plan.md).
- Node client creation sits behind the node factory port and its adapter, and the dapp-interaction and passkey services open their windows through the window manager.
