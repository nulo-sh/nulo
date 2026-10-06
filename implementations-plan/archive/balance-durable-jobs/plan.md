# Balance and durable-job complexity burn-down

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: the balance pipeline and the durable-job services refactored under the Biome complexity budgets: `apps/extension/src/stores/balances.store.ts`, `apps/extension/src/wallet/services/token-balance/`, `apps/extension/src/wallet/services/incoming-transfer/service.ts`, `apps/extension/src/wallet/services/token/seeder.ts` and `apps/extension/src/wallet/services/operation-journal/{service,reaper}.ts`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Burn the thirteen production functions in those files out of the complexity baseline, in two stacked changes: the balance pipeline first, then the durable jobs (incoming-transfer scan and outbox drain, token seeding, the operation journal). The refactor is behaviour-preserving: no storage shape, wire shape or journal schema changes.

## Why

The baseline only shrinks, so each accepted function is a debt that stays until it is rewritten. Recon showed most of the score came from nesting rather than branching: bodies living inside closures-in-closures pay for every enclosing lambda. Hoisting them to nesting zero did most of the work before any seam was cut. These paths carry fences (epoch, ticket, generation, ownership) whose order is the correctness story, so the cuts follow a fixed toolkit:

- Helpers that are synchronous guard ladders, or tail returns, are always safe.
- An awaited helper is allowed only where it replaces a span that already awaited.
- A register-immediately span (write then map-set, write then emit, mark-dirty then upsert) never gains an extra hop.
- A re-check stays in the continuation of the await it follows.
- A helper that creates a cancellable or registered resource owns the whole create-to-register span.

Every cut is pinned first by characterization tests that pass before and after it, with the existing suites left unedited, and hoisting a call out of a loop keeps instantiation lazy, since an up-front build can reorder which job's error is persisted. Part of the [complexity-residue](../complexity-residue/plan.md) burn-down.

## What shipped

- The balances store's setup closure became a module-level core class: bodies verbatim, closure state as fields, the store only constructing it, installing the Pinia-context watcher and returning the same API. An async method call runs synchronously to its first await like the IIFE it replaced, so single-flight registration kept its position.
- The unpinned transaction-update refresh branching in the token-balance service was pinned before any change; the queue, projector and reconcile code were split into synchronous builders and a few awaited helpers.
- The incoming-transfer lock callbacks became private methods, with separate trust helpers for the note and public arms (sharing would have weakened one arm's fence).
- The seeder's commit block stayed one method, because any inner marker update would re-acquire its lock.
- The journal's invariants became synchronous asserts, with the storage write and its emit kept adjacent.
