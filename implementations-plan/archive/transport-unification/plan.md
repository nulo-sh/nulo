# Transport unification

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: one shared client correlator and one shared service core in `packages/extension-messaging/src/core/` (`base-client.ts`, `base-service.ts`, `decode.ts`, `error-response.ts`, `rpc-methods.ts`), extended by the background and offscreen transports in `packages/extension-messaging/src/background/` and `packages/extension-messaging/src/offscreen/`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

The background (long-lived port) and offscreen (one-shot message) RPC stacks were two forked copies of the same machinery. They are now one template-method design: a shared client request-correlator and a shared service core, with transport liveness left in the subclasses (port reconnect, keepalive, telemetry, uid). Error-value construction stays a per-transport hook (remote, timeout, send-failure and disconnect errors), so the shared core owns mechanics, success decode and dispatch but never decides what an error looks like. The work ran in phases that were each shippable and revertible: characterize first, extract helpers and fix the bugs they expose, extract the client core, extract the service core, flip the offscreen client to typed errors, then harden.

## Why

The two stacks had diverged in ways nobody chose. The background service emitted a typed error payload and the offscreen one only a string; the background client rejected with typed errors and the offscreen client with strings; the offscreen side swallowed a serialization failure into an eventual timeout. A change to the protocol meant editing four files in step.

The hook split is what made the client-core step behavior-preserving. If the core had owned error construction, extracting it would have flipped the offscreen client to typed errors early, or needed unplanned branching. With hooks, the offscreen hooks kept their strings until the dedicated flip.

The flip does reach dApps: a prove or simulate failure travels from the offscreen client through the execution coordinator to the dApp error envelope, so the envelope gained explicit cases for the timeout and disconnect errors with generic messages and no raw internal detail.

## What shipped

- Characterization suites moved into the messaging package first, including the service-side and timer-cleanup paths the old tests missed.
- Helper extraction plus three deliberate fixes, each flagged: the offscreen serialization failure becomes an immediate structured error instead of a client timeout (a user-visible change, decided on purpose), both clients guard malformed envelopes, and a null params value returns a clean error instead of getting no response.
- The correlator owns the single pending map with idempotent settle, so a request is cleaned up exactly once across timeout then late response, send throw then disconnect, and disconnect then late response. The offscreen timer side table was removed only together with the tests proving the shared path covers disconnect and send failure.
- The service core replaces the old "method exists on this" check with an explicit registered-method surface, so inherited and prototype methods are not callable. Every background service and the PXE service register their methods through an exhaustiveness-checked helper. Both transports now emit the typed error payload alongside the flat string.
- The offscreen error hooks flip to typed errors, with the dApp envelope cases and updated tests. Timeout and disconnect map to a generic internal error code so a disconnect cannot be read by a dApp as a session teardown.
- A hardening pass rejects unknown and forged lifecycle events, requires a strictly positive safe-integer request id, makes decode fail closed, and caps and requires contiguity in parameter unwrapping. A later change made the unwrap tolerate a gap left by a mid-list `undefined` within the same cap.
- Lifecycle properties sit on the network e2e leg, not on unit tests. A unit test with a mocked `chrome` proves correlation logic, exactly-once cleanup and that handlers fire; only a real browser proves idle-death and port reconnect, keepalive surviving a long prove, and which values trip a clone error.
