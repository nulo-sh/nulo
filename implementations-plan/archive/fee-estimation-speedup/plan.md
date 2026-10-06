# Fewer simulations behind every fee estimate

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: A one-simulation estimate for the canonical Sponsored FPC in `apps/extension/src/wallet/services/execution/fee/fpc-strategy.ts`, estimate cancellation in `apps/extension/src/wallet/services/execution/estimate-cancel-registry.ts`, and dApp estimate-to-confirm reuse in `apps/extension/src/wallet/services/execution/operation-estimate-reuse.ts`.
- **Open items**: the admission cap frees a slot while its simulation still runs, because nothing tells the registry when the offscreen work drains; the fix is a completion or cancellation acknowledgement from the offscreen queue, tracked in [follow-ups](../../follow-ups.md).
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Cut the number of full ACVM simulations behind every estimating spinner and every post-confirm gap without changing what the user sees or how fees are chosen. Simulations are serialized, so fewer of them is the only lever. Three changes shipped: delete the debug node round-trips on every simulate and prove, a one-simulation estimate for the canonical Sponsored FPC only, and reuse of a dApp estimate at confirm. Folding authwit discovery into the first simulation was deferred.

## Why

- The private FPC reads the transaction's gas-settings envelope inside its fee call, so its first pass installs a bounded envelope the second depends on. Collapsing the two passes is valid only for the canonical Sponsored FPC, whose sponsor call reads nothing. The private FPC and user-added FPCs keep two passes.
- Folding discovery into the estimate widened the auto-sign surface, since a user-registered FPC's authorization requests would be signed where app-only discovery denies them, and in conservative mode it saved no simulation. It waits for measurements and an app-only first simulation.
- Cancellation cannot preempt a running simulation, so the cap on concurrent estimates has to count real unsettled jobs, not token bookkeeping.

## What shipped

- The debug node round-trips inside the exclusive PXE lock are gone, so each simulate or prove makes one fewer RPC and holds the lock a little less.
- The Sponsored fast path applies only when the FPC is the pinned canonical Sponsored one, decided wallet-side, and the dApp set no custom gas limits. It builds once and simulates once, finalizing with the FPC's own arguments so the multiplier is not applied twice. Cold-cache and other undecided cases fall back to two passes. Send estimates drop from two simulations to one, dApp estimates from three to two. A measured stubbed-versus-real gas delta for one operation shape was zero.
- Reuse generalizes the transfer cache: single-shot, short TTL, and a fail-closed ladder that rejects on profile, endpoint, base-fee, pending-transaction, chain-identity and resolved-FPC-identity drift. The fingerprint is an exhaustive canonical encoding of the pre-discovery actions plus the full fee options, and unsupported values make an operation ineligible. A hit skips discovery and the build but still records the transaction and its pending public authwits. Only standard-mode `aztec_sendTx` with Fee Juice or an FPC is eligible.
- The estimate id travels in a popup-only envelope on the approve call, so the shared wire type is untouched and a dApp cannot reach the field. The reuse TTL was cut to two minutes.

### Estimate cancellation

- Estimates have no journal record, so a registry keyed by a caller-minted token covers them. Entries are tagged with the profile; an unknown or foreign token is a silent no-op, a duplicate token is rejected, and cancel aborts a running estimate and evicts a stashed one.
- Admission counts unsettled underlying jobs per profile, four at most. A cancelled job keeps its slot until it settles. On overflow the oldest is cancelled and the newcomer parks in one latest-wins slot per profile and flow, admitted when a job settles. A test asserts the unsettled count never exceeds the cap even when every cancelled job is non-preemptible.
- Cancellation is checked at stage boundaries before the planner, each simulation and the stash, so a cancelled estimate never caches a signed request. A simulation already running cannot be stopped.
- A successful submit or approve hands the token off, so unmount cleanup cannot evict the entry the fire-and-forget confirm is about to consume. Reject and plain unmount still cancel.
