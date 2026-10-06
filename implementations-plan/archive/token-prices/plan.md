# Live token prices and default token seeding

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: A background price service fetches fiat quotes and feeds fiat lines across the popup, and the wallet seeds a per-network default token list after unlock (`apps/extension/src/wallet/services/price/`, `apps/extension/src/wallet/services/token/seeder.ts`).
- **Open items**: a deleted default token returns after a full-backup restore on a fresh install, tracked in [follow-ups](../../follow-ups.md).
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Two coupled features built as a background service and a lazy seeder.

- **Prices.** A `PriceService` makes one batched request per refresh to CoinGecko's free simple-price endpoint, for a static map from (chain, contract) to a provider id. Aztec-native tokens with no listing are mapped to an Ethereum-side proxy, such as the stablecoin to USDC and Fee Juice to AZTEC. Quotes are cached and broadcast. A setting, on by default, turns fiat display and all fetching off.
- **Seeding.** After unlock, once the network is ready, the seeder adds the network's default tokens through the normal token-add path. Each entry is pinned to an expected contract class id, symbol and decimal bounds.
- **UI.** The home header shows the token amount with a fiat line and a real aggregate, token rows show holding value (omitted, never `$0.00`, when unpriced), fee displays use the live Fee Juice price instead of a fixed rate, and the send amount can be entered in fiat.

## Why

- A background service is needed because executors run service-worker side during dApp flows with the popup closed, so a popup-side fetch would leave fee quotes stale or empty there. Static token records with captured function implementations were rejected, since a protocol fork already changed address derivation once and captured fixtures would have broken.
- Refresh is gated on an unlocked session, and the executors read the cache only. A fetch at transaction time would leak transaction timing to the provider.
- The provider is a single oracle, so a persistently wrong or depegged quote is invisible to a check against itself. The send flow therefore freezes a quote snapshot when fiat editing starts, sends exactly the displayed token units with no re-conversion at submit, disables submit while a conversion is pending, blocks and asks again when the quote moves more than 1 percent, and labels the proxy (`via USDC`). The inverse conversion is fixed-point bigint, rounded down.
- A hostile RPC must not be able to forge a default token. The seeder validates one snapshot (class id, then metadata from that same interface) and persists exactly that snapshot, so there is no validate-then-refetch gap.

## What shipped

- `price/` holds the service, the static map with a per-id sanity band, the pure conversion helpers and a test that pins the service as not reachable by dApps. A read validates shape, band, staleness (15 minutes) and the setting in one place. Refreshes are serialised and a late response cannot repopulate a cleared cache.
- A three-minute alarm runs only while unlocked, with a top-level listener registered synchronously so a worker wake works; failure backs off with jitter.
- The seeder is single-flight per profile and chain, skips silently with no account, and caps failed attempts at three until the next extension version. A user deletion leaves a tombstone that survives a chain purge. Seeded additions are journaled with a distinct origin.
- Settings carry the fiat toggle and the provider attribution. The build refuses to proceed if a price API key is set in a release environment.

## Lessons

- A refreshed read is not atomicity. Storage without compare-and-swap needs a writer lock, and a promise-chain lock only protects what runs inside it, so the whole read-check-act sequence goes in one critical section.
- A guard that samples its generation after intermediate awaits passes exactly when the flip lands inside them. Sample before the first await and check again after the last.
- A purge cascade fences the party that can still write, here the seeder, before it sweeps what that party writes.
- The deletion tombstone lives in a marker that no backup slice carries, so a restore on a fresh install can bring back a deleted default token. This was accepted as a low-severity gap and left open.
