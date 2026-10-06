# Row-service method families: pins first, one extraction

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: A shared `persistToken` in `apps/extension/src/wallet/services/token/service.ts` behind `addToken` and `addSeededToken`, plus characterization pins in `apps/extension/src/wallet/services/token/service.test.ts`, `apps/extension/src/wallet/services/token/service.composition.test.ts` and `apps/extension/src/wallet/services/network/service.test.ts`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

A zero-behavior-change quality arc over three duplicated method families in the token and network services. Pins first, then structure-only changes with every existing test green unmodified. Of the three proposed extractions, only the `addToken` and `addSeededToken` machine shipped; the token-interface assembly and the endpoint pipeline were rejected and replaced by tests.

## Why

- Two of the targets had no coverage at all: the token interface getter and `updateEndpoint`. Refactoring them blind was the risk, so the pins came first.
- The endpoint pipeline looked shared but is not: update has ordered preparation (normalize, id guard, shared index, old-URL capture, write then evict) that would have needed five or six knobs for about three identical lines. The abstraction would cost more than the duplication.
- The token-interface getter had no production callers, so half of that duplication was dead code. Extracting a shared assembly for one live and one dead method failed the over-engineering bar, and registry iteration order differs from the methods' field order, which is observable. Deleting the dead method is a user-visible removal and stays a product decision.
- `persistToken` was the byte-identical machine worth sharing: the idempotency short-circuit, journal creation, one lock hold, the re-check under the lock, the row build, the write and emit, and the succeeded or failed transitions with the catch inside the lock.

## What shipped

- The metadata source is a discriminated value, either seeded data or a live fetch, so the seeded path structurally cannot refetch. That keeps the earlier no-refetch fix by construction, not by convention.
- The live fetch and the title backfill run inside the lock, in the not-yet-persisted branch, which the doc comment states and a pin asserts: a blocked fetch blocks a queued token operation.
- Endpoint pins cover replace in place, an unchanged URL not colliding with itself, another endpoint's URL colliding, an invalid id, chain mismatch, eviction of the old URL, eviction of the primary node only when it is the edited one, eviction observed before the emit, and guard precedence (an unknown id on the wrong chain reports the chain mismatch).
- Token pins cover all nine stored picks, the candidate shape, journaling and title backfill, idempotency creating no journal operation, and a failed fetch journaling as failed.
- Recorded and accepted as inert for contract-valid input: `addToken` now reads its operation context before the idempotency lookup.
