# Bundling PrivateFPC and Wonderland NFT note schemas

## Outcome

- **Date**: —
- **Status**: completed in part.
- **Shipped**: The PrivateFPC note schema (balances at slot 1, a `UintNote`) is live in `packages/aztec-runtime/src/pxe/note-schemas.ts`, pinned by `apps/extension/src/wallet/services/note/note-schemas.test.ts`. The Wonderland NFT artifact and schema are not in the tree, so that half of the plan did not ship.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Extend the bundled-contract set from three note-bearing contracts to five by adding PrivateFPC and Wonderland NFT, each with a note-schema entry, and stay at those two. The bar for bundling a contract is that the wallet itself uses it, or that it is so widespread that leaving it out creates user friction. PrivateFPC meets the first; Wonderland NFT was judged to meet the second; the other Wonderland standards meet neither.

## Why

Notes from PrivateFPC already came back from the PXE but rendered as raw field arrays, because no schema entry existed for its class id. The artifact itself was already compiled in, since the fee-payment service imports it for auto-discovery, so for PrivateFPC the change was a schema entry and not new bundle weight.

Bundling only widens what `aztec_registerContract` can do without a dApp-supplied artifact. The contract metadata methods still report a class as unregistered until it is in the PXE, so the change does not make a contract appear by itself. Every bundled class becomes a permanent target for dApps that omit the artifact, which is why the bar is deliberately high.

## What shipped

- **PrivateFPC schema.** A `UintNote` entry at slot 1, resolved through the shared artifact catalog so the schema key and the known-artifact key cannot diverge (`packages/aztec-runtime/src/pxe/artifact-catalog.ts`). A storage-layout test pins the slot.
- **Wonderland NFT.** Planned as a 2.8 MB artifact with an `NFTNote` entry at slot 5 and a unit test for the no-artifact registration path. Its manual check was weak, since decoding needs a registered instance and the wallet has no NFT auto-discovery; the plan proposed shipping on the layout test alone. No Wonderland NFT alias, bundle entry or schema exists in the tree.
- **Deferred.** One shared module of artifact and class id per contract, a test that every schema class id exists in the known set, and a slot-collision test. The shared catalog above later removed the drift risk that motivated the first.
