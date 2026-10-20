# Phase 2: the awaited purge subscriber

- The new test's fixtures spread `mkTx(...)`, typed `never`; `typecheck:all` refused the spread (TS2698). Cast to `object` before spreading.
- Red proof on the base `service.ts`: (c) fails at the `settled` check (the reconcile resolved while the tx delete was parked), (d) resolves instead of rejecting, and the base's purge rejection escapes as an unhandled rejection: the fire-and-forget `onAccountDeleted` path.
