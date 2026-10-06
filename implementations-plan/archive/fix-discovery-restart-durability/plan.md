# Fix discovery restart durability

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: The discovery queue repaints the toolbar badge on every service-worker boot, so a restart can no longer leave a ghost count, and an end-to-end spec pins the accepted loss of queued discoveries. Live in `packages/wallet-bridge/src/discovery-queue.ts` and `apps/extension/tests/e2e/network/connect-locked-queue-sw-restart.test.ts`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Queued dApp discoveries are lost when the service worker restarts, and that is the accepted behaviour. The planned fix, persisting each queued discovery in session storage and replaying it at boot through the wallet SDK's own entry point, was rejected. What shipped is clean-loss semantics: the queue reconciles the badge when it is constructed.

## Why

A dApp that asks for wallets while the wallet is locked has its request queued in memory and the badge set. The idle worker is killed about 30 seconds later, a user who unlocks after that finds an empty queue, no popup, and a dApp that times out. The window is bounded by the stale limit, deliberately under the dApp's own timeout, and the failure is a retry, not lost funds. Worse, the badge is browser state that survives the kill while the queue boots empty, and an empty drain never touched it, so the ghost count was permanent.

Replay was rejected because it cannot be made safe:

- The manifest has no `tabs` permission, so a rehydrate probe can show a tab still exists but not that it still shows the persisted origin. A navigation during the dead window would turn a replayed approval into a key exchange with the wrong site, and closing that needs a user-visible permission expansion.
- Replaying a request id resets an in-flight approved handshake with the same id.
- The persisted-row lifecycle had holes: rejected discoveries could resurrect on a later restart, and hostile rows or timestamps could throw before a guard ran.
- The wallet SDK owns the pending-discovery map and offers no restoration contract.

Nothing here touches the transaction arrival path, so queued sends are unaffected.

## What shipped

- **Badge reconcile.** `DiscoveryQueue` calls its badge update in the constructor, which runs on every boot, so a stale count is cleared before anything is unlocked.
- **Unit pins.** Construction repaints an empty badge; enqueue still paints the live count.
- **End-to-end pin.** `connect-locked-queue-sw-restart.test.ts` locks the wallet, queues a discovery, kills the worker for real, checks the replacement boots with a clean badge before unlock, then unlocks and checks that no discover popup appears and the badge stays clean.
