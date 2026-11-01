# boot-profile-1: phase 1 (event bus)

- Tests first: unit (a) and (c) red at `51ea220b1`, (b) green there (an earlier sibling's splice already skips the removed one). Fix: `invoke` over a copy, skipping callbacks no longer subscribed.
- Composition case: two `runUnattended` waiters over the real reset graph, the client delegating to the service and sharing its `onStaleNetworkChanged`. Red with the base `event-handler.ts` ("a run never ended"), green with the fix. The bound is a zero-delay timer started after the completion event: a waiter that heard it settles within microtasks.
- `twoChains`'s network-row builder moved to module scope (`networkRow`, `staleTestnet`) so the never-opened case seeds the same Testnet without accounts.
