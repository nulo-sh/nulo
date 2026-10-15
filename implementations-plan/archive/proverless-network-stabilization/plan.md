# Proverless network e2e stabilization

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: Journal-truth stage assertions in `apps/extension/tests/e2e/fixtures/journal.ts`, a failure-classifying instrument for wait timeouts, a repeat-run soak workflow `.github/workflows/extension-network-e2e-soak.yml`, a pinned proverless safety test in `apps/extension/src/e2e/config.test.ts`, and a re-scoped `apps/extension/tests/e2e/network/concurrent-sendtx-confirm.test.ts`.
- **Open items**: the same-source concurrent send limit (#218); the missing Node-side stall watchdog and per-fork memory cap, and the dead sponsored-FPC salt in the PR gate (#155).
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

The goal was a proverless network suite that is reliably green on every PR, then a required check. It was treated as a stabilization project across several distinct failure classes rather than one bug. Only the part that could be fixed and validated without a resource decision shipped; the rest was handed back as follow-ups.

- The journal record is the source of truth for every stage assertion. The DOM is asserted only when a test is about rendering, and only after the card paints.
- The helper counts in-flight records within a dApp session instead of scoping to one record, because concurrent same-session transactions share a session id and the journal has no per-request key. Active excludes terminal stages, which fixes a helper that conflated "active" with "succeeded".
- A broad stub of the simulation or submit subsystems was rejected: faking real subsystems breaks the e2e contract and widens the proverless surface.

## Why

The first failure class was a race: tests read a popup card to learn a stage, and the card painted after the journal had moved on. The other classes were a frozen browser protocol channel on a four-core runner, dApp promises that never settle in budget, and a record stuck at `queued`. Raising `protocolTimeout` could not help because it was already 300 seconds. Instrumenting first made each class distinguishable, so a fix was not applied to the wrong cause.

## What shipped

- **Journal counting.** `fixtures/journal.ts` carries a typed shared journal read, an in-flight count and a wait on a predicate. The unscoped stage helper's six callers and three concurrency tests moved off the DOM card. On a real runner the shard that carried the race went green.
- **Instrument.** A wait timeout now dumps the journal, the playground's pending result, the browser target list and service health. The soak workflow repeats a file or the matrix with zero retries allowed, and `NULO_E2E_RETRY` parameterizes the retry count.
- **Safety pin.** A unit test pins that proverless arms only with both opt-in flags and is off in a default build.
- **Not done.** The load-reduction work did not ship: no progress-based stall watchdog and no per-fork memory cap. The resource-bound failure classes need a larger-runner or lighter-test decision first, so the suite was not made a required check by this work.

### Same source sends

Two concurrent sends from the same spend source cannot both land. The execution mutex releases at submit, not at mine, and the PXE's pending-nullifier cache is per-execution, so the second send simulates against pre-first state and fails with a duplicate siloed nullifier. Real proving masks the window because the first is usually mined before the second simulates. A pending-aware simulate or a hold-until-mined mutex is design work, so `concurrent-sendtx-confirm` asserts the mutex ordering and the first send's full confirmation only.
