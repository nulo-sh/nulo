# Profile service dedup

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: shared private helpers and phase-decomposed orchestrations inside `apps/extension/src/wallet/services/profile/service.ts`, pinned by `apps/extension/src/wallet/services/profile/service.integration.test.ts`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Collapse the profile service's clone families and remove its eleven complexity suppressions, keeping behavior identical. All helpers stay as private methods of `ProfileService`, with no new module, no public API change and no RPC change. A function that resisted natural decomposition could have kept a justified suppression, but none needed to.

## Why

The clones and the complexity were the same mass: every suppressed method sat in at least one clone family, and the file guards the wallet's most sensitive operations (key unsealing, session opening, deletion, export). Behavior preservation was the bar, so what the file does on error, in what order and under which lock was pinned before any extraction.

Helpers reach into the repository, the deletion state and the session manager, so free functions would have needed heavy injection for no testability gain. The integration suite drives the real service.

## What shipped

- **Mechanical helpers**: the sealed-key projection, a profile fetch under lock, a row-fence capture with its broken-fence check, the unlock snapshot, the new-profile persist, the restore marker-then-row bracket, and the trusted DEK unseal.
- **Phase splits**: unlock, password change, deletion, pending-deletion resume, restore and its finalize now split at their existing phase seams. The snapshot, slow-crypto and revalidate shape is preserved.
- **Not unified on purpose**: the unlock staleness checks, degraded-session log shapes, where each secret is zeroized, export error identities, and restore catch placement.
- **Ownership rule**: an extracted helper that allocates secret material either lets the caller own cleanup or zeroizes before rethrowing.
- **Result**: no suppression remains in the file, and duplicated lines in it fell from 202 to 56 across four adjudicated survivors.
