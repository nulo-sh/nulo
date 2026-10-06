# Incoming public transfers in the activity feed

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: a public-event scan arm in `apps/extension/src/wallet/services/incoming-transfer/` (`public-event-indexer.ts`, `service.ts`), a node-read RPC in `packages/aztec-runtime/src/pxe/`, the received detail page `apps/extension/src/popup/pages/received/[id].vue`, and the network e2e `apps/extension/tests/e2e/network/incoming-public-transfers.test.ts`.
- **Open items**: a checked record shows no tx hash or explorer link; a reorg that re-mines a surviving incoming transfer emits nothing; incoming note rows are never reconciled against the PXE; an opt-in "Privacy maxi" setting; only transactions get explorer links. All are tracked in [follow-ups](../../follow-ups.md).
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Index incoming public token transfers in the background and show them in the activity feed at parity with the existing private-note "Received" rows. Both arms also trigger a token-balance refresh when a receive is discovered, which the private arm never did.

- Detection reads the token's public `Transfer` events through the node's tag index, with a cursor per network and contract. It does not diff balances.
- Records go through the same per-contract trust machine as notes, and their identity becomes a union keyed by kind, scoped by profile and network.
- The scan indexes to the checkpointed tip and reconciles reorgs, trading finality lag for receive latency.
- Only contracts whose current class equals the bundled standard token class are scanned.

## Why

The standard token emits a public `Transfer` for every public-balance change. Filtering `to` on the account catches plain public sends, private-to-public sends and mints, and cannot double-count with the note scanner, because a public-to-private send emits the private-address marker on its public leg. The tag identifies the event type, not the recipient, so a scan pages a contract's whole transfer history and filters locally. Backfill cost therefore grows with the contract's total traffic, which is accepted for current volumes, with a per-token start block as the seam.

A sender cannot be recovered for a public-to-private receive: a same-amount transfer to a third party in the same transaction looks identical, so any shown address would be an unverifiable hint. Those receives are labelled "Received privately" with the sender not disclosed.

Indexing the outgoing side was researched and deferred. Only sends debited in a public function reveal the sender, so a multi-device user would see a lopsided history that looks complete, and the honest answer is cross-device transaction sync.

## What shipped

- Scan arm per network and contract, recipient-filtered before any lock is taken so a busy token cannot starve note scans. Cursors persist only after a page's matches are committed, and a crash replays idempotently.
- A persisted balance-refresh outbox, written before the record for both kinds. A row is acknowledged only by a refresh task created after the receipt: a refresh that was already in flight reports busy and gets no anchor, so it cannot acknowledge a later receipt. Only the active profile's rows drain.
- Reorg reconciliation: detection through the node's reference-block check, a staged and resumable marker pinned to the window's top block hash, a rewind floor taken from the finalized tip recorded at the last scan, and orphan deletion by stored block hash only after the whole window is rescanned, with the refresh enqueued before the delete.
- The class gate reads the contract's current class straight from the node. The wallet's own instance lookup returns the preimage's original class for a registered token, so it never notices an upgrade.
- A dust filter: a setting `incomingDustUsdThreshold` hides sub-threshold receipts at read time using the price service, compared by integer cross-multiplication. It shows the row and marks pricing unavailable when a price is missing or stale, runs after the visibility gates, and does not stop the balance refresh.
- Detail page and labels: "Public → Public", "Private → Public", "Received privately" and "Minted", with a "From" card that never renders a sentinel as an address.

### Explorer links

Every received transaction links its hash to the explorer wherever an explorer URL exists, for private and public receipts alike, for consistency with sent transactions. The sandbox has no explorer, so it copies the hash. Only a transaction URL builder exists, so block hash, token contract and account address stay copy-only.

Privacy cost, accepted: a link on a private receipt sends that hash and the user's address to the explorer, and the automatic fee fetch narrows the RPC's view to one transaction. Hardening both belongs to a future opt-in setting, listed under Open items.

## Lessons

### Pruning

Blocks above the proven tip can be pruned, and the checkpointed tip can roll back to it. After a rollback, records above the new tip and a cursor stranded above it survived, so reconciliation now deletes records above its bound and rewinds a stranded cursor. A symbolic block tag can name a different fork on each call, so reads pin to one block hash.
