# PXE incarnation fence on same-session re-import

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: a fix to the PXE lifecycle fence in `packages/aztec-runtime/src/pxe/` (pinned by `incarnation-fence.test.ts`) and the same-session delete-then-import e2e matrix in `apps/extension/tests/e2e/network/profile-reimport-matrix.test.ts`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Fix the deadlock between a deleted profile's tombstone and its successor's fresh-generation PXE operations, and close the test gap that hid it with an e2e matrix that deletes and imports within one browser session.

- Leg A is a full-backup re-import of the just-deleted profile. Restore is the flow that keeps the backup's profile id while it is free (a just-deleted id is free) and mints a fresh PXE generation, so the tombstone meets the successor.
- Leg B imports a different plain secret and proves the clean-successor case.
- Both legs check post-import health with the two operation families the bug killed: a read (the gas card shows a Fee Juice amount, never the failed-read dash) and a write (a token import registers the contract and toasts).

## Why

Un-fixed, every PXE operation after the import failed with a stale-capture error until the offscreen document restarted: the fee balance showed a dash and FPC discovery and token registration died. The existing backup-restore e2es missed it because their re-import lands in a fresh extension context, whose offscreen document has an empty in-memory lifecycle map, so no tombstone can fence the successor. The bug needs the opposite: the same offscreen document surviving the delete.

The matrix's construction taught two things. A plain secret import mints a random profile id and can never collide with the tombstone, so only full-backup restore reaches the collision. And the synthetic-backup builder had hardcoded the wrong chain id for the local network, which Nulo identifies as 0. Chain 0 is the only id exempt from the live chain-identity check, so any other id is read as a real chain, mismatches, and fails every view simulation. The test was the first to view-simulate on a synthetic-restored profile, which is why the builder bug stayed invisible. Adding account-state slices to the fixture instead was rejected because it could only warm the PXE and hide an invalid fixture.

## What shipped

- The fence fix and its pins in the PXE runtime package.
- The delete-then-import matrix, with a gas-card wait that reports the card state and recent console errors when it times out.
- The synthetic backup builder in `apps/extension/tests/e2e/helpers/import-drivers.ts` writes local-network account rows with chain id 0.
