# Lock ownership

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: Ticketed leave in `packages/wallet-core/src/utils/lock.ts`, a serialized session-artifact section in `apps/extension/src/wallet/services/profile/session-manager.ts`, and post-await epoch re-checks in `apps/extension/src/wallet/services/incoming-transfer/service.ts`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Three fixes, part of [production-ready-audit-remediation](../production-ready-audit-remediation/plan.md).

**The lock.** Every grant mints an opaque ticket at hand-off, and `enter()` resolves with it. `leave(ticket)` checks the ticket first and returns, with a warning, on a mismatch. The watchdog closes over the ticket of its own grant and force-releases only if that ticket is still current. `withLock` threads the ticket internally, so no caller changed. The network service's lock gets no watchdog (`maxHoldMs: null`), because chain deletion legitimately holds it far longer than the default.

**The session.** Session artifacts (the stored row and the lock alarm) are written and deleted under a private mutex with no watchdog. A generation counter is bumped as the last act of `open()`. An expiry close captures the generation at entry and stands down inside the mutex if it changed.

**Incoming transfers.** The note check re-reads its lifecycle epoch after the two awaits that can outlast a lock hand-off, and stops if the epoch moved.

## Why

A holder that outlived the watchdog could later release a stranger's acquisition, collapsing mutual exclusion for every service lock. The sharpest case was chain deletion, which holds the network lock across a drain that carries the long proving envelope. A ticket stops theft and cascade. It cannot prevent overlap while the watchdog fires during a still-running legitimate hold, which is why that one lock opts out.

The ticket check has to be the first statement of `leave`. Clearing the timer first would let a stale leave disarm the current holder's watchdog while every other assertion stays green.

An expiry close that runs outside the facade lock could delete a newer session's row, which sits on a singleton key, and clear its alarm. A bare generation check was not enough, because the check precedes the await it guards. Serializing the artifact operations, with the bump last, covers every interleaving. A storage write that rejects is indeterminate, so the code compensates and reads back before deciding; if absence cannot be confirmed it installs nothing and leaves cleanup to the pending close.

Re-checks went at the two park points only. A check before every mutation adds partial-commit opportunities and cannot undo a storage write already running.

## What shipped

- `LockTicket`, the ticketed `enter` and `leave`, and the watchdog's own ticket.
- The session-artifact mutex and generation fence, with a read-back on an indeterminate write.
- Colocated regression pins for each interleaving, each failing when its fix is reverted, in `packages/wallet-core/src/utils/lock.test.ts` and beside the session manager.
