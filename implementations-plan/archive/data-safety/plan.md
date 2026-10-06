# Data safety

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: the awaited orphan-key sweep in `apps/extension/src/wallet/services/account/service.ts`, the duplicate-safe authwit restore in `apps/extension/src/wallet/services/auth-registry/service.ts`, and the hardened allocator in `apps/extension/src/wallet/services/id-allocators.ts`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Three surgical fixes in two services and one allocator, with no storage shape change and so no migration:

- Build the orphan imported-key sweep's live set from raw storage keys, and await the sweep inside service init.
- Reject duplicate authwits when restoring: the identity is the account and hash pair, scoped to the profile and chain.
- Make the numeric id allocator ignore keys that are not safe integers.

## Why

Backup blobs and storage keys are hostile input, and each fix keeps a destructive or allocating path conservative:

- The sweep built its live set from codec-validated rows, so an account row that was present but schema-invalid got its sealed imported signing key really deleted, leaving the account permanently unable to sign. The fire-and-forget sweep also raced the import's key-first write order. Awaiting it in init closes the race, and an unparseable row now keeps its key.
- Authwit hashes are legitimately shared across accounts, so the dedupe identity is the account and hash pair (scoped to profile and chain), encoded injectively as a JSON array because a delimiter is forgeable. Seeding from raw payloads stops codec-hidden rows from escaping the check. Restore never applies the per-account cap, since these are already-granted authorizations and rejecting them would destroy the only revocation index.
- A single hostile key such as `"999999999999999999999"` would pin the allocator at a float where adding one changes nothing. No production path was found to write such a key, so this shipped as hardening, with a correct pin in place of the defective proof.

Two review lessons shaped the final form. A reviewer-demanded fix is new code with its own failure modes: the occupied-key skip became an unbounded loop at the float boundary until it was bounded. Changing the allocator's post-condition from max plus one to any free safe id also invalidated callers that assumed forward contiguity, so the audit walked the callers.

## What shipped

- **Sweep**: the live set comes from `getKeys()`, the widest physical view, because skipping non-string values would still delete an object-stored account's key.
- **Authwit restore**: validate, check the seen set, write, then add to the set, so a malformed row neither blocks nor poisons valid siblings.
- **Allocator**: `nextNumericId` keeps the purge helper's canonical filter plus a local safe-integer bound, and the returned candidate must itself be safe and physically free. On overflow it clamps to the maximum safe integer and walks down to the first free key. Token restore re-allocates per row, because the allocator no longer promises forward contiguity.
