# A dApp message that wakes a dead service worker is dropped

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: A module-scope content-message relay in `apps/extension/src/wallet/services/wallet-sdk/content-message-relay.ts`, registered from `apps/extension/src/wallet/index.ts` and attached by the transport in `apps/extension/src/wallet/services/wallet-sdk/background.ts`, with unit pins in `content-message-relay.test.ts` and a network e2e in `apps/extension/tests/e2e/network/cold-wake-discovery.test.ts`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Register one `chrome.runtime.onMessage` listener for content-script traffic at module scope, so it exists the moment a woken worker's top level has run. Until the SDK transport attaches its listener, the relay holds a bounded queue of discovery requests and flushes it, once and in order, on attach. The relay is the only chrome listener for this traffic.

## Why

- The SDK handler's listener was attached at the tail of runtime start, after migrations, configuration and service startup. A content script's `sendMessage` that woke a dead worker was dispatched before any of that and was lost; the dApp saw no wallet. Alarms had already been fixed for the same MV3 rule with a module-scope shim.
- Only `discovery-request` is worth holding. Every later message type depends on in-memory session state that does not survive a worker restart, so its cold-wake loss is a different, existing gap.
- A second listener beside the SDK's would deliver twice, and a double delivery is harmful in every state: a locked wallet's duplicate rejects the entry the first one queued, an unlocked one opens two approval popups, and a secure message would journal and dispatch one send twice.
- The drain keys on attach, not on the runtime start promise, whose started flag is never reset on failure and so resolves early after a failed start.
- A module worker only receives its wake event at module-scope listeners if the whole static graph is free of top-level await; the built graph was checked and is.

## What shipped

- Admission before attach is strict: a validated, top-frame `discovery-request`, capped globally and per origin, rejecting new entries when full. Live traffic after attach takes today's forwarding path unchanged.
- Each entry records its arrival time and is dropped on flush when older than a few seconds. The SDK restamps a discovery at flush and downstream accepts it for about a minute, so without a tight relay budget the composed window would outlive the dApp's own timeout. A pin asserts the relay budget plus the downstream window stays inside the dApp's.
- Re-attaching replaces the listener, and the queue is cleared before the flush callbacks run so a throwing callback cannot replay messages.
- The e2e kills the real worker with alarms cleared, asserts it is dead at click time, proves the replacement boot finished, then unlocks. Strict security mode drops the session on a worker kill, so the replayed discovery lands on a locked wallet, is queued, and the unlock drain opens the approval. With the relay's two wired files reverted the spec fails; with them it connects.
- Separately noted and not fixed here: a content-script `ping` is rejected by the validator's message-type enum at all times, so that dApp liveness probe never worked.
