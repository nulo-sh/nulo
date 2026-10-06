# First-account token seeding

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: the token seeder now runs when an account is added, and the e2e-only seed seam is double opt-in and absent from production bundles: `apps/extension/src/wallet/services/token/service.ts`, `apps/extension/src/e2e/config.ts` and `apps/extension/src/e2e/chrome-storage-token-seeds.ts`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Subscribe the token seeder to `onAccountAdded` in `TokenService.init()`, with no guard at the subscription. Make the seeder's seed list a `getSeeds()` read at pass time so an armed e2e build can inject the sandbox token. Keep the seam fail-closed behind four publication guards.

## Why

Default tokens never seeded for a profile's first account. The seeder ran on profile activation and on network change, and both fire before the first account exists: networks and the first account are created by the popup after the profile is active. The seeder correctly skips an accountless pass without consuming an attempt, but nothing ever triggered the retry. A later popup open happened to re-run a seed pass, and the account switch that users did as a workaround only refreshed the list.

The seeder already re-derives the active profile and network and re-checks its purge epoch before every write, and it coalesces a trigger arriving mid-pass, so a guard or generation counter at the subscription would duplicate machinery it owns. Not taken: a second `onTokenAdded` subscription in the view, which balance backfill already covers; seeding from the popup after account creation, which puts a background concern in the UI and misses the network-switch path; and a live-testnet seed in a required gate, which would depend on an external RPC and a token surviving network resets.

## What shipped

- The one-line subscription, plus a unit pin that a new trigger retries a skipped pass and a composition assertion for the wiring. A network e2e proves registration on the sandbox. `AccountService.restore()` emits no event; full-backup import is correct because the profile activates after accounts are restored.
- The seam: a build needs both `VITE_NULO_E2E_TOKEN_SEEDS` and its confirm flag, and exactly one set throws at module evaluation, because an accidentally armed production build would silently stop seeding defaults. The reader replaces the production list, accepts one entry on the sandbox chain with canonical hex fields, hardcodes the expected symbol, and returns an empty list on anything malformed. The pre-registration class-id check and metadata bounds are untouched.
- Four publication guards: a normal import constructed inside a statically false branch (a dynamic import still emitted a chunk); a live-pinned build stamp, since an unused export is tree-shaken even in armed builds; a fail-fast env rejection in the production build workflow; and a negative bundle grep over both browser outputs for the stamp and the storage key.
- CI isolation: the source-built smoke arms the seam with no injected seed so no fresh profile calls a public RPC, and artifact-mode smoke blocks the price host at the browser, leaving the shipped bytes untouched. The RPC host stays reachable there, because blocking it made the node client retry and pushed profile deletion past the reset specs' waits.
- Accepted residual: the attempt is persisted before the slow preview to bound crash loops, so three service-worker deaths mid-preview can cap a seed. Fixing that needs a durable in-progress lease, not moving the write.
