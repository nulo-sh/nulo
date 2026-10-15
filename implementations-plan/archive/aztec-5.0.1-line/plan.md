# Aztec 5.0.1 client line

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: The wallet client moved to the 5.0.1 Aztec packages, import recovery after a worker restart (`apps/extension/src/composables/completeImportWithRecovery.ts`), the profile-deletion fence (`apps/extension/src/wallet/services/profile-deletion/coordinator.ts`), refuse-and-preserve PXE stores (`packages/aztec-runtime/src/pxe/opfs-store.ts`) and struct-path-tolerant token descriptors (`apps/extension/src/wallet/services/token/functions/descriptors.ts`).
- **Open items**: route the unknown-address lookup to the `aztec-update` skill, tracked in #185.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Bump the client first, then fix on the new substrate. One arc carried the client bump to 5.0.1 (compatible with the 5.0.0 node, so no network reset), the restore-boot fix, a deletion fence for per-profile PXE stores, the move to the foundation-scoped standards package, and a candidate-first redeploy of the PrivateFPC, bridge and faucet contracts at the new identity.

## Why

5.0.1 fixed the store-lifecycle area the lock and fence work hardens (browser SQLite handle release, partition semantics, a typed encryption error); building on the old line would have hardened around bugs that vanish. The suspected lock and emit deadlock did not exist: a routine MV3 worker restart mid-bootstrap drops the in-memory master, and only the import page wedges, while reopening the popup recovers. So the fix aimed at the page, not at the session or store subsystems.

Wiping a store on a schema or stamp mismatch was rejected for refuse-and-preserve. The PXE store holds user state (added senders, registered contracts), and the stamp's rollup input is node-derived, so a lying RPC could have driven a wipe loop.

## What shipped

- **Client bump.** All Aztec packages and the accelerator at 5.0.1, derivation vectors regenerated from upstream's own oracle, backup compatibility epoch unchanged. The tree has since moved to a later line (see the `aztec-update` skill); the identity-generation and deploy items below describe this arc's state, not the current pins.
- **Import recovery.** `completeImportWithRecovery` settles, then recovers an import whose worker restarted. Restoring account state moved after the session opens, because the exported slice now carries the account's own contract and registering it earlier hit a missing store key.
- **Deletion fence.** A persisted random generation per profile row, send-time derivation under the facade lock, and an offscreen unseen, live, deleting, deleted lifecycle. Deleting a profile shows a visible wait for an in-flight proof.
- **Identity generation.** Standards from `@aztec-foundation/aztec-standards`; PrivateFPC re-pinned from the source-bound fee-payment package behind a digest-keyed node-compatibility gate; the token constructor takes a fifth argument.
- **Deploy tooling.** Intent identity pinning, candidate-first faucet records, a receipted `promote`, and a token-reuse mode. The contracts, faucet and bridge deploy code now live in the unleashed repository.

## Lessons

### Rerun base

A red that looks environmental is reproduced on the base before the box is blamed. Here two named flakes (a frame detach and a port-in-use boot line) hid a deterministic regression in the restore trio and made the failure look systemic.

### Unknown address

An unrecognised contract address in an error is grepped across `node_modules` first. Seven wrong contract identifications preceded the grep that named the address: a registry from the old standards package, transitively pulled in by the test token and absent on the new sandbox.
