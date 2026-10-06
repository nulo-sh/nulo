# A lock after a worker restart locks the popup

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: `lockActiveProfile` in `apps/extension/src/wallet/services/profile/service.ts` always announces the lock, the popup reconciles a locked boot through `apps/extension/src/popup/reconcile-locked-boot.ts`, `apps/extension/src/popup/lock-landing.ts` and `apps/extension/src/popup/apply-boot-outcome.ts`, and the e2e liveness gates use `waitForWorkerLiveness` and `readLivenessBaseline` in `apps/extension/tests/e2e/fixtures/helpers.ts`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

An explicit lock always produces the lock event, and a popup that boots into a locked answer while still showing an authenticated route locks itself. Both layers were needed: fixing only the service leaves a stale popup until the next click. The test harness also stopped trusting a heartbeat read from before a worker kill.

## Why

After a worker restart the replacement holds no in-memory session, so the Lock click cleared the persisted record without the `onActiveProfileChanged(undefined)` event that drives the redirect. The popup kept its logged-in shell with the header stripped. A person who leaves the popup open across a worker death (crash, update, idle reaper) hits the same state, and the passkey canary only passed by polling the record away and navigating by hand. Separately, every post-restart liveness gate took its baseline before the kill, which the old worker's last tick could satisfy.

## What shipped

- **Service.** `SessionManager.close()` reports whether it emitted, and `lockActiveProfile` emits the event itself when it did not, after the persistence read-back so a lock that did not persist throws instead of announcing. This covers the persisted-only record and the nothing-left case.
- **Popup decision.** `decideLockLanding` is a pure choice between staying, selecting and authenticating, or locking; it triggers on a selected profile plus an auth-required route, not on the logged-in flag, because the header flips that flag before the worker answers. The passkey exemption is unchanged.
- **Fence.** The boot path never bumps the profile-event sequence. `reconcileLockedBoot` captures it before the lookup and checks both it and the load run before any action, so an unlock or lock that landed in between owns the outcome and the boot result is discarded. `applyBootOutcome` still settles the retry and session-checked flags for a superseded run, so the auth form is not hidden and Retry stays enabled.
- **Harness.** `readLivenessBaseline` throws unless it reads a finite positive heartbeat, and the liveness gates take it after the stop. The passkey canary asserts the automatic landing on the auth page, and a smoke spec keeps the original popup open across the kill.
- **Scope of the guarantee.** It covers the auth-required routes and session modes that restore; approval windows carry no auth-required meta and only settle.
