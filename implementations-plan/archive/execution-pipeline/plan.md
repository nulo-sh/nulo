# Execution pipeline complexity burn-down

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: the execution path split into small helpers across `apps/extension/src/wallet/services/execution/helpers/batched-view-simulation.ts`, `apps/extension/src/wallet/services/execution/claim-helper.ts`, `apps/extension/src/wallet/services/execution/tx-request-builder.ts`, `apps/extension/src/wallet/services/execution/transfer-executor.ts`, `apps/extension/src/wallet/services/execution/service.ts` and `apps/extension/src/wallet/services/execution/fee/fee-strategy.ts`, plus `apps/extension/src/wallet/services/fpc/service.ts` and `apps/extension/src/composables/internal/fee-estimation-engine.ts`, with the pins in `apps/extension/src/wallet/services/execution/tx-request-builder.pins.test.ts`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Burn down eleven complexity suppressions on the money path in two behavior-preserving refactors, with no wire-shape or journal-schema change.

- **First change**: the two largest functions and the transaction builder, namely the batched view simulation, the claim helper and the standard builder.
- **Second change**: the length-only splits and the fee tail, namely the execution service dispatch, the transfer executor, fee strategy, the fee estimation engine and the FPC service.
- **Seam toolkit**: synchronous guard-ladder helpers, tail returns, and an awaited helper only where its call replaces a span that already awaited, under a caller-side applicability guard. A span that must register something immediately never gains an extra await.
- **Equivalence bar**: existing suites pass with zero edits, error and log strings are byte-identical, and the execution e2e specs run in both changes.

## Why

These functions sit on the send path, where an extra promise hop changes observable ordering. A helper that creates a cancellable resource and returns before registering its abort controller opens a window in which a cancel finds nothing to abort and proving carries on. The refactor therefore had to be provably order-preserving, not just under the complexity budget.

## What shipped

- The batched simulation resolves contracts, classifies calls and prepares the fast arm in helpers. One validated chain identity feeds both arms, pinned by a mixed-arm batch that makes exactly one node-info call. The utility launch stays owned by the caller, so a rerun never launches it twice.
- The claim helper has one create-and-register routine for the three places that created a fresh record. Its failure path is a helper that always throws the cancel sentinel or the original error, while the happy transition keeps no helper so the transition write and controller registration stay adjacent.
- The standard builder resolves its context and the authwit message hash in helpers. The synchronous `message_hash` path and the capsule arm stay inline so their continuations stay synchronous. Before the split, new pins fixed per-action dispatch, drift rejection before any resolver work, authwit and capsule ordering, registry-call fields, gas settings and build provenance.
- The transfer path creates its journal row, abort controller and registration in one helper that returns both, with pins that resolve the create promise by hand and then await exactly one tick.

## Lessons

- Biome charges nesting for every branch inside a lambda inside a closure, so trimming branches inside a nested timer callback barely moves its score. Hoisting the body to a module-level function does.
- Any helper that creates a cancellable resource must own the create-to-register span and return both the record and its controller. Returning only an id moved registration one settlement hop after the durable pending row was visible.
- The regeneration diff catches what the count hides: more than once a first split left a function just over budget and the generator inserted a suppression, which was cut deeper instead of shipped.
- Pin files that compute real selectors need `// @vitest-environment node`, since the proving library misbehaves under jsdom.
- An end-to-end spec gated on the standard-contracts environment variable runs only on the testnet, so a local gate has one spec fewer.
