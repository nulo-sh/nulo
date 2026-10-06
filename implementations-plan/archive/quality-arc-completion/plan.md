# Quality arc completion

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: Contained deduplications and one concurrency fix from a whole-codebase quality audit, among them `apps/extension/src/wallet/services/purge-rows.ts`, `apps/extension/src/composables/useIncomingTransfers.ts`, `apps/extension/src/wallet/services/profile/require-active-profile.ts`, `apps/extension/src/wallet/services/execution/mark-failed-unless-cancelled.ts` and the injected `browserApi` port wired in `apps/extension/src/wallet/runtime.ts`. The umbrella is [harden-quality-arc](../harden-quality-arc/plan.md).
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

The audit's remaining quality findings were finished on an isolated integration branch, in two batches, one finding per branch. Each finding was re-verified against the current code first and marked moot or shrunk where earlier work had overtaken it. Every change was behaviour-preserving and passed unit, smoke and the full network suite, with every network job confirmed to have run and not been skipped.

The first batch took the eight contained findings and shipped the safe part of three of them. The second batch took the six that the first had deferred as architectural, authorization or concurrency work. One of the six was moot because the execution service had already been decomposed.

A red network job was re-run once. Still red meant a real break to root-cause and fix, never retry-until-green, a skip or a weakened assertion.

## Why

Contained deduplications could be proven equivalent by tests, so they went first. The harder findings (a service-wide guard sweep, a composition-root storage migration, a claim and cancel coupling) were done only with two independent reviews of each design, one from each model family. A disagreement between the two on an authorization or concurrency call was escalated, never settled by either reviewer alone.

The reviews found real bugs the end-to-end suites would not have. A reordered row filter left the home balance stuck after the displayed token was deleted. A function made synchronous changed the timing of a `finally` by a microtask. A guard sweep nearly flattened the dApp-interaction identity check, which compares a session's profile and is not an absence check. Each was fixed and pinned by a test that fails on the old behaviour.

## What shipped

- A shared `purgeRows` for the lifecycle purge cascade, a single-contract `ensureRegistered`, and a form-state `rebase` with a dirty flag.
- A `useIncomingTransfers` composable and a named processed-payload type for the execution layer.
- `requireActiveProfile` across the services, with every error message kept verbatim and the identity guards left alone, and one synchronous helper for the three identical dApp-send failure arms.
- A `browserApi` port, carrying storage and alarms, injected into the services at the composition root.
- A serializer for the session-expiry alarm, so a refresh write-back cannot resurrect an expired session.

## Lessons

### Proactive TTL

Wiring the `browserApi` port into the profile service was meant to migrate storage, but the port also carries alarms, so it activated the session manager's dormant proactive TTL auto-lock. That is a user-visible, security-relevant change, accepted as the intended completion of the migration. A comment at the wiring site documents it, and an integration test pins both directions: with a port the manager subscribes to the alarm, without one it stays dormant.

The activation exposed an alarm-versus-refresh race, since the alarm's close ran outside the facade lock. The alarm path now runs inside it, and the config-driven TTL change, which cannot take the non-reentrant lock from a synchronous listener, remains lock-free.
