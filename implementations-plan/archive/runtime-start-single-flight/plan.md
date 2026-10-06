# Runtime start single flight

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: `createSingleFlightStart` in `apps/extension/src/wallet/single-flight-start.ts`, used by the wallet runtime's `start()`, with pins in `apps/extension/src/wallet/single-flight-start.test.ts` and `apps/extension/src/wallet/runtime.test.ts`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Replace the service worker's `if (started) return; started = true` latch with a single-flight start. Concurrent callers share one in-flight boot, success is memoized, and a failure re-throws to every waiter and resets the memo only when a retry is safe.

Retry safety is the design's core. Each attempt starts retry-safe and three vetoes keep the rejected memo, so a fresh worker lifetime is the retry:

- A Barretenberg initialization failure, because the upstream singleton retains its rejected promise and a retry could only re-observe it.
- Any migration-blocked throw, because every migration run bumps a durable attempt counter meant to advance once per boot; a surviving alarm retrying inside one lifetime would burn the whole budget and turn a recoverable block terminal.
- Anything after the first service registration, because registering a duplicate throws and the later registrations are not re-entrant. The veto makes re-entry impossible, which is stronger than guarding each one.

## Why

The old latch had two proven defects. A concurrent second `start()` resolved immediately while the first boot was still running, so an alarm landing during boot, whose handler chains off `start()`, grabbed a not-yet-registered service, threw and lost the tick. And a failed boot left the latch set forever, so every later call resolved against a half-booted runtime and no caller ever saw the failure. Both were reproduced red before the fix.

Two audit-driven reversals converged. Waiting for both boot legs to settle was dropped, since with the Barretenberg veto it protected an empty overlap set while adding a boot that can hang forever. The migration veto became unconditional rather than terminal-only. A plain memoize-once alternative would also fix both defects by deletion; it was not taken because the retry zone is genuinely reachable (transient storage writes, including the config load's own write), and the argument is recorded for any future simplification.

## What shipped

- The helper and its pins: concurrent callers share one boot, failed-boot retry driven by a transient storage write, a fast Barretenberg rejection keeps the memo with no overlapping re-run, the migration veto including the budget-burning variant, and the post-registration latch.
- Both callers of `start()` were already guarded, so the rethrow adds no unhandled-rejection noise. After a post-registration failure, a later price alarm now observes the rejection immediately instead of waiting out a service initialization; this fail-closed change was accepted.
- A header comment in the content-message relay was corrected; no transport semantics changed.
