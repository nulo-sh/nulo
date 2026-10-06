# Session and profile lifecycle fixes

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: Four correctness fixes in the profile service and session manager: session open and close no longer report false success, a credential-mismatch throw zeroizes the recovered secret, an abandoned restore's master secret is swept, and a failed tombstone write no longer reserves a live profile. Live in `apps/extension/src/wallet/services/profile/service.ts` and `apps/extension/src/wallet/services/profile/session-manager.ts`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

The first remediation wave of the mid-size bug and quality audits (see [fix-ui-storage](../fix-ui-storage/plan.md) for the UI and storage arc). Four fixes bundled because they share three files and one test surface, each proved first by a test that fails against the old code. Smallest safe change each, with no new abstraction beyond one private sweep helper that has three call sites.

## Why

- **Session open and close.** `open()` wrote storage before setting the in-memory session, so a rejected write threw into a swallowing catch, left the wallet locked, and still let unlock resolve a valid profile. `close()` was the mirror image.
- **Zeroize gap.** The passkey credential-mismatch throw sat outside the `try`/`finally` that zeroizes the recovered master secret, while its two sibling call sites wrapped it.
- **Parked secret.** A restore closed before finalize or delete left the raw master secret in a map with no expiry, for the life of the worker.
- **Wedged profile.** `deleteProfile` reserved the id and bumped the epoch before writing the tombstone, so a rejected write left a live profile permanently reserved and every unlock failed with "Invalid profile id".

## What shipped

- **Open is memory-first.** The in-memory session commits first. A swallowed storage failure is a documented degraded success: the secret is usable for this worker's life but not persisted. A post-open `isActive` check stays as a cheap invariant.
- **Close is memory-first but not silent.** The in-memory session clears first, the persisted delete has its own `try`, and the lock alarm always clears. `lockActiveProfile` then reads back through `SessionManager.hasPersistedSession()` and surfaces a persisted bearer that survived, since one would silently re-unlock on the next worker restart.
- **Zeroize.** The mismatch check moved inside the existing `try`/`finally`.
- **Restore sweep.** Pending restore secrets carry their capture time, and `sweepStalePendingRestore` zeroizes entries past a thirty-minute expiry on entry to `restore`, `finalizeRestore` and `deleteProfile`. Finalize removes its own entry before awaiting the session open, so a concurrent sweep cannot zeroize a buffer in use. No alarm: sweep-on-next-use is enough, since an idle entry is harmless.
- **Tombstone failure.** Only the tombstone write is caught. On rejection the raw reserved ids are read back and the reservation is released only when the key is confirmed absent; a present, corrupt or unreadable result keeps it, since a rejection can be commit-ambiguous. The epoch bump is kept, because rolling it back would let a later deletion mint the same epoch and re-authorize a stale writer.
- **Rejected.** Making `open()` rethrow on a storage failure, which contradicts the class's stated intent and turns a transient hiccup into a failed unlock.
