# E2E flake fixes

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: the service-worker stop helper and the no-popup assertion identify what they wait for by identity and witness, not by URL or timeout: `apps/extension/tests/e2e/fixtures/browser/chrome.ts`, `apps/extension/tests/e2e/fixtures/playground.ts` and `apps/extension/tests/e2e/fixtures/extension.ts`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Two CI flakes were fixed at their mechanism, and no timeout was raised. Both reproduce locally only under a two-core CPU affinity (the envelope of a hosted runner), so every fix was validated there with retries off.

## Why

A timeout bump would have hidden both races. The retries on the failing specs could never pass either: the first attempt locks the wallet, and later attempts start against a locked popup, so a retry on a state-mutating spec is false comfort.

- **Service-worker stop.** Puppeteer's `worker.close()` attaches, closes the target, then detaches. Chrome keeps a stopped worker's DevTools host alive while any session is attached and hands the same host to the next start. An MV3 worker restarts within milliseconds, so when the stop lands before the detach the restarted worker inherits the host: same target id, no destroy event, and the 15-second wait expires. The sibling failure ("No session with given id") is the same race in the other order.
- **Wallet locked mid-session.** The no-popup helper diffed popup targets by URL. A pre-existing extension page that navigates to the auth route when the lock redirect lands was reported as a popup that appeared, though none ever opened.

## What shipped

- The stop helper (`stopBackground` on the browser driver) closes the target from a browser-level session with no worker session attached and asserts success. Because Puppeteer auto-attaches briefly to every starting worker, a second proof is accepted next to the identity-keyed destroy event: a newer `performance.timeOrigin` on whichever worker is live. The whole wait is one race of destroy, witness and deadline. Each probe, attach included, has its own two-second budget and releases its session without awaiting, so no CDP round trip can hold the helper past it. The resilience specs call the helper instead of carrying inline copies.
- `callExpectingNoPopup` decides "new" by target identity: the targets alive before the action plus a created-target listener armed for its duration, with the URL read at the end. A real popup is always caught, even on a URL another page already has.
- `launchExtension` closes the extension's first-run onboarding tab before it flips the onboarding-completed flag, because that tab otherwise re-routes itself on every lock and replaces itself with a popup. On a fresh profile the tab id is required within the poll and setup fails otherwise. Freshness is read from the filesystem before Chrome writes the profile, and a failed setup closes the browser it owns before rethrowing.
- Validation: the restart specs looped under the two-core limit with retries off, and the no-popup scenario twelve times through the new helper, all green.
