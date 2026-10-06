# Malformed-row profile purge

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: Profile purges that also delete rows the codec cannot read, in `apps/extension/src/wallet/services/purge-rows.ts` with key-based attribution through `parseAccountRowId` in `apps/extension/src/wallet/services/account/spec.ts` and `rawStringEntries` in `packages/wallet-core/src/storage/entity_storage.ts`.
- **Open items**: A profile deletion leaves a JSON-broken account row at its canonical key, tracked in [follow-ups](../../follow-ups.md).
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

The arc started as "repair malformed rows" and was redirected after recon. A boot-time repair sweep was rejected. The fix shipped is narrower: every profile purge that enumerates through the codec gets a raw second pass, so a row that fails validation but belongs to the deleted profile no longer survives.

## Why

- Repair on the next write already exists: `EntityStorage.set` overwrites the key whole, and about half the stores self-heal through it.
- No producer of malformed rows exists. Restores parse before writing, and without production users there is no version skew.
- The one durable harm is retention. Seven of nine profile purges enumerated through the codec, so a malformed row carrying the deleted profile id stayed forever, which breaks the promise that deleting a profile erases its data.
- A sweep would reintroduce the delete-versus-concurrent-write class for stores without a service-wide lock, and an auto-repair of an undecodable row is unsafe.

## What shipped

- **Raw second pass** in the codec-blind purges, deleting by the true storage key inside each service's existing serialized purge context. Account, token, token-balance, transaction and auth-registry purges are covered.
- **Attribution comes from the storage key, never from the bytes a row claims.** A row at another profile's canonical key is never deleted, however its value reads. `parseAccountRowId` is byte-canonical (it re-encodes and compares), so whitespace, escape and negative-zero variants are not ownership evidence. Numeric ids must round-trip as canonical integers before they feed the cascade.
- **Guarded re-read.** The delete helper snapshots the exact stored strings and refuses to delete when the bytes changed. It is a window-shrinking guard, not an atomic compare-and-delete. Safety rests on key attribution first, the site lock second, the re-read third.
- **Cascade harvest.** The profile-deletion coordinator unions typed reads with raw harvests taken from canonical keys, so a malformed parent's dependents still cascade.
- **Fail closed.** An unscoped malformed row is deleted only under sole ownership and otherwise left. A row that cannot be attributed is never deleted.
- Two stale doc comments that claimed a syntax-invalid row is dropped on read were corrected.

Left open on purpose: a syntax-broken parent row at a canonical account key survives the purge while its dependents cascade, and valid rows written by late writers after a purge are a separate lifecycle-fence problem across all write paths.
