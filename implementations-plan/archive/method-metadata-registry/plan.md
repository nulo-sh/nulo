# Wallet method metadata registry

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: a single method-descriptor registry in `packages/wallet-bridge/src/method-descriptors.ts`, with the scope checkers in `packages/wallet-bridge/src/method-scope-checkers.ts`, and `capability-map.ts`, `scope-enforcement.ts` and `dispatcher.ts` reading maps derived from it.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Replace six hand-synchronized, method-keyed tables with one flat `Record<method, MethodDescriptor>`, one literal row per method, and derive the old tables from it at module load:

- Each descriptor holds a capability (or null with a required exempt reason), a routing union (network operation, account operation or handler) whose kind is narrowed per route, an optional scope check, and preserved audit markers and notes.
- The checker bodies moved to a leaf module, and the capability type moved into the registry, so the import graph is acyclic: checkers, then registry, then the three facades.
- `dispatch()` resolves the descriptor at its top, before capability enforcement, and throws the same "Unsupported wallet method" error for an unknown method.
- Public accessors and the operation-building switches are unchanged.

## Why

Adding or reclassifying a method was a six-edit scavenger hunt with silent-omission failures. One such omission had produced a dead scope gate, since fixed: a popup method present in the scope table but absent from the capability map got no required capability, so enforcement returned nothing and the scope check never ran. That is an authorization hole on the dApp boundary.

A flat record was chosen over a discriminated union or a builder because capability, routing and scope are independent axes and a builder hides a security seam. Narrowing the kind by route makes illegal route and kind pairs unrepresentable. Safety is checked twice: a build-time exhaustiveness test over the patched wallet schema and over the handler branches that `dispatch()` takes, and the runtime descriptor resolution. Method-to-kind injectivity is imposed by a parity test rather than assumed.

A stale comment listing `getAccounts` as exempt was wrong and was deleted instead of transcribed, since carrying it into the registry would have recreated the same class of hole.

## What shipped

- The registry covering every wallet method, the leaf checker module, and the six derivations.
- Tests built before the swap: a frozen snapshot of the old tables with function-identity checks for the named checkers, the partition and capability-or-exempt invariants, the exhaustiveness checks, and a scope-or-note rule for every non-exempt method.
- The consumers swapped over with the existing dispatcher and scope tests unchanged. Parity held exactly, so no latent inconsistency surfaced and no behaviour changed.
- The package README names the registry as the single edit point.
- Left as is: `registerToken` has no scope check by design, since its session-account authorization is inline in its handler, and carries an explicit note saying so.
