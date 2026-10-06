# Service-level balance and FPC cache

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: `apps/extension/src/stores/balances.store.ts` owns the popup's gas and FPC reads; `GasBalanceCard.vue` and `FeeSettingsCard.vue` subscribe to it, and `packages/wallet-bridge/src/fee.ts` carries an honest unknown (`null`) balance.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Lift the balance and FPC fetch machinery out of the two cards into one Pinia store that owns app-lifetime service clients and a keyed cache. The store keeps the background `GasBalanceReader` as it is (TTL, cross-popup dedup, invalidation epochs). The bar was behavior-preserving: every existing pin keeps passing and the UI stays identical, except one deliberate wire-shape change.

- **Scope key**: profile, network, chain and account address, with a store-level epoch bumped on every profile switch. The map is cleared on a switch, and a fetch that began under an older epoch discards its commit.
- **Split slices**: each entry holds an independent gas slice and FPC slice, with cause-specific versions (any commit, retry-path commit, successful forced commit).
- **Display versus verified**: the gas slice keeps last-known data for painting and a separate verified value that a failed refresh clears. Only the verified value gates fees.
- **Subscriber capabilities**: a subscriber declares its legs, whether it retries, whether it refreshes on settled transactions, and whether it peeks. The union per key drives the loops.
- **Optimistic deduction** stays a card-local display overlay and never mutates the shared entry.
- **FPC events** stay card-side: selection reconciliation is not routed through store versions.

## Why

Both cards carried private copies of init coalescing, single-flight with raw-request reuse after a timeout, retry backoff and generation guards. The FPC list is profile-filtered, so a profile-free key could serve one profile's FPCs to another. A wire shape that fabricated `"0"` for an unreadable public balance made a failed read look like a confirmed zero, so fee gating and the bridge nudge treated unknown as empty.

## What shipped

- The store with the epoch fence, split slices, per-leg raw-promise reuse (a timed-out leg keeps its raw request, and the next attempt re-attaches a timeout to it rather than stacking new requests), an LRU cap that never evicts subscribed keys, and one transaction-settle subscription that forces a gas refresh.
- `GasBalances` fields are `string | null` end to end, and the hand-copied duplicate type in the fee helpers is deleted in favour of the canonical one.
- Unknown balance shows as an unknown value instead of `0`; the fee-juice method is disabled with a distinct reason, and the get-fee-juice nudge fires only on a confirmed zero.
- The background execution service invalidates the gas cache on an active-profile change, closing a leak where the reader's profile-free cache could serve one profile's private balance to another within the TTL.

### Testing

- Store and card tests run against the real Pinia store with mocks at the service-client layer (`vi.mock` of the clients), never a testing-pinia stub of store actions, which would gut the pins.
- The raw-request non-accumulation pin counts client calls: a hung `getGasBalances` is called exactly once across a retry-after-timeout cycle.
- Both cards are plain-JS components, so typecheck cannot see their null handling and `null === "0"` typechecks anyway. The red-first tests written before the producer flip are the only guard on that fail-open case.
- The store suite covers profile flap with a late completion discarded and no cross-epoch reuse, a pending ensure superseded by a switch, release-before-subscribe on account and network change, capability-union transitions, last-good FPC retention, subscribed keys surviving eviction, the traffic matrix per subscriber type, retry debt that only a retry-path success clears, a stale peek never overwriting a newer commit, and the overlay resetting only on a successful forced commit.
