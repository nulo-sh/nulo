# Aztec 5.0.0 stable

## Outcome

- **Date**: —
- **Status**: superseded by aztec-5.2.0-js-line.
- **Shipped**: the `@aztec/*` line moved from the second release candidate to the 5.0.0 stable, with the signing-key-root account derivation in `packages/wallet-crypto/src/account-derivation.ts`, per-profile encrypted OPFS stores in `packages/aztec-runtime/src/pxe/opfs-store.ts` keyed by `packages/wallet-crypto/src/pxe-store-key.ts`, and reference vectors under `reference/aztec-5.0.0-stable/`. The bridge redeploy it coupled to belongs to the alejoamiras/unleashed repository.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Bump the Aztec packages and the first-party packages to 5.0.0 and adopt upstream's signing-key-root account model under a frozen derivation spec: upstream's removed signing-key construction carried over verbatim, then upstream's own derivation from signing key to secret key. The live network had reset, so the bump was coupled to a testnet redeploy of the bridge and fee components, run under a machine-checked deployment intent.

The PXE browser store had to be injected explicitly: if OPFS were unavailable in the offscreen document the work would stop, and no IndexedDB fallback would ship. At-rest encryption of that store was adopted in the same change rather than deferred.

## Why

The network reset left the deployed faucet pointing at a dead rollup, so the wallet and the bridge had to move together. Addresses change under the new model whatever we do, so the derivation was pinned instead of left to upstream: vectors captured from the installed release candidate prove the unchanged construction, and vectors generated from the hash-pinned published 5.0.0 tarballs prove everything downstream. The implementation must equal them, with no explanatory exceptions. Upstream's default store would have ignored our data directory and wiped on a rollup change, so ownership of the store handle had to be ours, with fail-closed close and delete.

## What shipped

- One exported derivation helper and a wallet account that stores only the derived secret key, never the seed or the signing key. The registered address returned by the PXE is asserted equal to the derived one.
- The PXE seam registers an instance and its class separately, and an effective-class helper (`packages/aztec-runtime/src/pxe/effective-class.ts`) rejects upgraded instances explicitly.
- Per-profile, per-chain SQLite-OPFS stores opened with a 32-byte HKDF-derived key, owned by the chain runtime, with a registry derived from the directory layout that drives purge without a live runtime and crypto-erase on profile deletion. Legacy IndexedDB stores are not migrated. The SQLite worker resolves its WASM through a runtime path bundlers cannot rewrite, so the build emits the unhashed asset beside the hashed ones and the store open is time-bounded.
- The canonical PrivateFPC identity at its published salt, pinned and derivation-tested in `apps/extension/src/wallet/services/fpc/protocol-fpcs.test.ts`, and the backup compatibility epoch bumped so older-epoch backups are refused.
- The Noir toolchain move, the token dependency swap and the deploy tooling for the bridge and fee components belong to the alejoamiras/unleashed repository.
