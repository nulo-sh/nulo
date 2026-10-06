# Firefox arc closeout

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: A stale-session reply that rejects a dApp call within seconds when the background died (`apps/extension/src/wallet/services/wallet-sdk/stale-session.ts`), and both execution canaries running prover-on on Chrome and Firefox, with CI reading their results back (`scripts/ci-cd/assert-canary-results.ts`, `scripts/ci-cd/canary-expectations.json`).
- **Open items**: whether the dApp SDK should refuse a discovery request id that collides with a live session, an upstream question tracked in [follow-ups](../../follow-ups.md).
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Close the Firefox arc with three calls. A dApp call in flight when the background dies is answered fast: the pending call is rejected within seconds, the dApp learns it is disconnected and reconnects as it does today, and no session keys are persisted. The two execution canaries run on Firefox as well as Chrome, in the PR lanes and nightly, and a red Firefox canary on an Aztec bump holds the bump. The one-round-trip residual in Firefox's privileged background termination is consciously accepted, because closing it would have meant editing the privileged helper, which a session never authors.

## Why

A restarted background has an empty session map, so it silently dropped the dApp's pings and encrypted messages, and the dApp gave up only at its own timeout (210 seconds measured on both browsers). The SDK already has the right message, an unencrypted session-disconnected notice that makes the dApp reject everything in flight, but only the handler that holds a session can send it, and after a restart nothing does. The canaries are the only gate that sees execution breakage against the frozen account bytecode, so running them on one browser only left half the surface unwatched, and a canary that silently skipped would have looked green.

## What shipped

- The wrapper around the content transport answers a ping or secure message for a session this background does not hold, using the browser-supplied tab id and never the envelope's, then does not forward it. The reply is tab-bound: an id held by another tab is answered like an absent one, and the owning tab is never written to, so there is no liveness oracle. A permanent network spec kills the background three ways and asserts the rejection deadline; healthy sessions are never disconnected.
- The frozen-account canary and the passkey canary run on both browsers. The passkey canary relies on a driver fact, `credentialOutlivesPage`, instead of branching in specs, and its CI gap (it had never run with real proving there) was closed. Every canary lane runs the same four prover-on files.
- A canary that skipped, vanished or never ran fails its job: the lane reads vitest's json report against the expectations file. `CHROME_ONLY` lost its canary entry, so each remaining entry is a capability statement.
- The bump rule is stated in `CLAUDE.md`, `CI.md`, `UPDATE.md`, the `e2e-testing` and `aztec-update` skills, and `apps/extension/tests/e2e/FIREFOX.md`.

### Closing ledger

- **Accepted**: the Firefox termination residual; recovery from a cold background riding on the dApp's heartbeat, so "within seconds" is what an attached background answers; four stated limits in `ARCHITECTURE.md` section 8 (a dApp with no heartbeat, a hidden tab's throttled timers, an invalidated extension context, and a handshake in progress when the background dies); and the Firefox canary being a rule, not a required check, while its lane stays advisory.
- **Noted for later**: a page that chooses a discovery request id equal to another tab's live session. The SDK uses the page-chosen id as the session id; the tab-bound reply gives that page no oracle and never writes to the owning tab, and isolation rests on approval, the browser-supplied tab id and the content script's port match. Whether the SDK should refuse a colliding id is upstream's question.
- **Only time-gated**: promoting the two Firefox aggregators to required checks after their nightly streaks, the first release's Firefox smoke going green, and confirming the add-on id before a listing.
