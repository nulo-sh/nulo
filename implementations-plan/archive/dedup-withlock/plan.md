# Dedup: callback-scoped lock

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: `Lock.withLock` in `packages/wallet-core/src/utils/lock.ts`, and every hand-rolled enter/leave frame in the wallet services migrated onto it.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Add a callback-scoped `withLock` to the wallet-core `Lock` and migrate all 69 try/finally enter/leave pairs (15 files) onto it. `enter()` and `leave()` stay public as a split-hold escape hatch, matching the read and write guard primitive that already exposes callback-scoped methods.

To make one mechanical recipe sound everywhere, `enter()` was hardened to never reject: logger throws and a throwing timer are swallowed. After that, "enter resolved" means "ownership transferred" on every path.

## Why

About fifty of the sixty-nine frames put `enter()` inside the `try`, so a rejected acquisition ran `leave()` and could release another holder, while sixteen put it before. A single `withLock` that leaves only after a successful enter would have changed behavior at one of the two shapes. Hardening `enter()` made the question moot instead of preserving a latent bug at fifty sites or doubling the migration recipes.

Rejected: an enter-inside-try wrapper with per-shape recipes, sealing `enter` and `leave`, and regex mass-replacement, whose control flow varies per site.

## What shipped

- Site classes with their own recipes: the two domain wrappers became one-line delegations (names and about 45 callers untouched, the self-deadlock warning kept); token add, seed and update moved their try/catch inside the closure so the journal failure is recorded before the lock frees a waiter; the dApp interaction site creates its long-lived popup promise inside the closure and returns void, so the lock releases at creation and not after user interaction; a config store site was found late and included.
- Characterization tests pin force-release interplay, a synchronous throw, mixed raw and callback waiters keeping FIFO order, non-reentrancy, and the hardened `enter()`.
