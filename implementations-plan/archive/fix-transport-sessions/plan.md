# Transport and dApp-session fixes

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: Four fixes in the transport and dApp-session layer: `apps/extension/src/wallet/services/wallet-sdk/session-established.ts`, `applyCapabilityDecision` in `apps/extension/src/wallet/services/dapp-session/`, the call site in `packages/wallet-bridge/src/dispatcher.ts`, and the request deadline in `packages/extension-messaging/src/core/base-client.ts`. The fifth finding, queued discovery lost across a background restart, was escalated to [fix-discovery-restart-durability](../fix-discovery-restart-durability/plan.md).
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Fix each finding prove-first: a failing test against the unfixed source, then the smallest change that turns it green, with no new abstraction unless three sites benefit. A wrong or missing decision at the session-approval boundary must fail closed, by terminating the session or surfacing an error, never by carrying on. The one finding that needed a persisted state machine, queued discoveries surviving a background restart, was pulled out into its own plan once the audit showed the SDK's own pending map also dies on restart, so persisting only the queue would not make a discovery approvable.

## Why

The layer had five defects of one family: unguarded async callbacks, per-tuple state shared by per-session actors, a multi-write sequence that lost updates, a timeout that did not cover connecting, and an in-memory queue that vanished with the background. The security-relevant one was the verification window, which could display another session's emojis when two live sessions shared one stored row, so "always trust" could trust a channel the person never verified. The fix passes an immutable snapshot of the session's own hash into the verify window's URL instead of adding a per-session store, which review advised against.

## What shipped

- The session-established callback is fail-closed. A missing stored session or any failure while setting up verification terminates that session, the pending-verification entry is cleared in a `finally`, popup creation is awaited and a missing window counts as failure, and an establishment gate runs before any side effect, including the durable journal write.
- The verify window prefers the hash snapshot from its URL, and the settings copy calls the stored hash the most recent connection's.
- Capability decisions are one service mutation that reacquires the latest row under the lock and merges the approved delta, accounts, aliases and rejections in a single write, with capability-specific union for concurrent approvals and scoped clearing of prior rejections. A revoke mid-decision surfaces a structured error instead of a cryptic one.
- Every request deadline now starts before the connection wait and covers readiness, send and response; an expired request never sends, a shared transport is not disconnected, and the wire send is no longer awaited past the timer.
- Left as documented gaps: the connect retry loop's cancellation, a pre-existing mismatch in what a deselected same-type widening reports, and the settings row showing only the last-established hash.
