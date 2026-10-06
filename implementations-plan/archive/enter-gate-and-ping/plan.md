# Enter gate and ping

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: one submit-validity source in `apps/extension/src/popup/components/popups/EditProfilePopup.vue`, and `"ping"` accepted by `apps/extension/src/wallet/services/wallet-sdk/content-script-validator.ts`, pinned by `apps/extension/src/wallet/services/wallet-sdk/ping-pong.test.ts`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Two small behaviour fixes. First, the profile-edit popup's submit validity moves into one computed that both the button and the Enter handler use. Second, the content-script validator's message-type enum gains `"ping"`. The cold-wake relay is left alone: a ping sent before the relay attaches stays droppable by design.

## Why

- Enter submitted the unchanged profile name right after the popup opened. The button was gated on "editing has started", but the Enter path checked only an availability computed whose unchanged and collision guards themselves require editing to have started, so before any edit nothing could block it. A pin test had recorded the bug; it became a regression pin.
- The SDK's dApp side sends unencrypted ping messages as a liveness heartbeat and the vendored background handler answers pong, but the validator omitted `"ping"`, so every heartbeat died at the boundary. The dApp silently fell back to its legacy-peer path: dead-wallet detection waited the full dead window instead of one heartbeat round trip. Safe by SDK design, but slower.

## What shipped

- The editing-started condition moved into the shared availability computed; the button's redundant check was dropped, and the warning predicates keep their own condition so nothing flashes on open.
- `"ping"` added to the validator enum, with a unit test that a ping envelope validates.
- A reachability test that drives the real vendored handler over a fake transport with a session seeded into its private map, since a real session needs the full key exchange the network suite covers. A ping for an active session answers pong to the session's tab and an unknown-session ping is ignored. It deliberately reds if upstream reshapes the handler, because the validator change relies on that behaviour.
- Review confirmed the ping path opens no session oracle or amplification: pages cannot submit raw internal envelopes, the pong goes only to the session's own tab, and unknown ids allocate nothing.
