# Incoming-transfer trust state machine

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: every writer of the incoming-trust and incoming-transfer tables runs behind one service-scoped lock in `apps/extension/src/wallet/services/incoming-transfer/service.ts`, with the lock primitive pinned by `packages/wallet-core/src/utils/lock.test.ts`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Serialize every mutation of the trust table and the incoming-transfer table behind a single global `Lock` per service, using the existing `packages/wallet-core/src/utils/lock.ts`. The external state machine is unchanged: `unknown`, `pending`, then `trusted` or `blocked`, with a re-add still modeled as delete plus rediscover. The repository stays last-write-wins with no compare-and-swap, because the lock is the one source of mutual exclusion. All eight writers moved in one change, as ordered commits that each stay green. UI return contracts and the storage schema are byte-identical.

The first design was a lock per `(profile, network, contract)` triple. Audits found it needed a wipe semaphore, a drain for late-discovered triples, and multi-lock acquisition. A single global lock removes all of that at the cost of serializing scans of different contracts.

## Why

Repeated race fixes had left an ad-hoc patch stack: scan generations, a per-hash in-flight set, compensating reverts, and re-checks inside loops. A residual race remained: a trust-allow landing while a scan was parked before building its record could leave the final record permanently hidden. A lock makes correctness structural instead of dependent on the stack. Critical sections are repository-bound (about a millisecond each), so contention is negligible, and PXE reads stay outside the lock.

## What shipped

- The service lock with public wrappers over private `_locked` helpers. The lock is non-reentrant, so a locked method never calls another locking method.
- Scan discovery (note and block-timestamp reads) runs unlocked. A lifecycle epoch captured before the reads is rechecked per note inside the lock, so a clear or account delete during PXE I/O makes the scan bail instead of persisting a stale snapshot.
- Clear paths hold the lock through scheduler re-hydration, and account deletion wipes every network matching the chain.
- The three race-guard primitives and the compensating reverts are deleted. A new regression pin closes the residual race above, and a multi-contract same-hash test covers the removed in-flight set.
- Known residuals, accepted: the lock force-releases after a long hold, and a service-worker restart can leave a `pending` trust row with no records until the next scan.
