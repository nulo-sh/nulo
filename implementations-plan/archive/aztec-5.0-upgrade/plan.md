# Aztec 5.0 upgrade

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: every `@aztec/*` dependency moved from the 4.2 line onto the 5.0 line in one change, with the fee re-derivation in `packages/aztec-runtime/src/account/fee-options.ts`, the sender-for-tags fix in `packages/aztec-runtime/src/pxe/service.ts`, the schema patch in `packages/wallet-sdk-schema-patch/src/apply.ts` and the 5.0-aware fixtures in `apps/extension/tests/e2e/fixtures/aztec.ts`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Move the whole Aztec family to 5.0.0-rc.1 together, bottom-up by layer, as a single feature-branch change. The workspaces share one lockfile, so a deps-only intermediate state does not compile and a green-per-step stack was not possible. `@aztec/viem` stays on its own version axis. Existing local wallets and testnet Schnorr accounts do not survive the hard fork; that is documented, not migrated.

The definition of done was the full network e2e suite green on a real 5.0 sandbox, with native proving enforced on the canary shards (the bulk shards stay proverless by design) and no silent WASM fallback on any shard that declares native proving.

## Why

5.0 is a protocol hard fork: address derivation changes, Schnorr's challenge moves to Poseidon2, the PXE deletes pre-5.0 local databases on first open, and the fee, receipt, deploy and message-delivery APIs changed. A "bump everything, then chase typecheck" order would have missed the failures typecheck cannot see:

- `fee-options.ts` is a copy of the SDK wallet's fee logic, not imported types, so a port that compiles can still under- or over-fund a fee.
- The schema patch is a boot-time runtime guard, so a moved import path fails the service worker at start-up.
- Recompiled Noir artifacts change class ids, which the address tripwire test catches.
- The release-age gate blocks `bun install` itself, so the temporary excludes had to come first.
- The bb.js WASM is extracted from `node_modules` at build time, so a layout change fails the build emit.

## What shipped

- Exact 5.0.0-rc.1 pins everywhere except `@aztec/viem`, the re-keyed noir patches, and a zod 3 to 4 bump the new packages required.
- A fee fallback re-derived from the node's per-transaction gas limit, with new unit cases for that path.
- A storage schema bump that wipes stale PXE stores, plus documentation of the reset and of the dead pre-fork accounts.
- A fix for a real wallet bug found by the e2e run: private-note transactions failed in witness generation because the wallet calls the PXE directly and so never inherited the sender-for-tags the SDK wallet injects. The sender is now passed on every prove and simulate call, with the caveat that a flow with no signing account would tag the wrong address.
- Bridge crates recompiled against the 5.0 Noir libraries and the bridge TypeScript migrated, including the portal withdraw's seven-argument encoding. That code now lives in the `alejoamiras/unleashed` repository.
- Network e2e adapted to 5.0: renamed bundled binaries, the wrapper that puts the version-matched forge on the path, the fee ceiling, the node API rename for message sync, a prover-aware toast timeout and construction-time deploy options for the private FPC.

## Lessons

### Quiet blocks

5.0 mints an L2 block only when a transaction is pending, so a helper that waits for N more blocks, or that tries to make one with `.simulate()`, hangs on a quiet sandbox. Gate such waits on a real signal (the anchor's checkpoint reaching the message's) with a time cap, and drive blocks with a real `.send()`.

### Sponsor ceiling

The e2e fixture's flat `maxFeesPerGas` ceiling had to clear 5.0's live L2 base fee, which rose about four orders of magnitude, yet stay under the sponsor's limit: the sponsored FPC asserts gas limit times max fee against its Fee Juice balance. 1e13 sits roughly ten times above the live fee and well below that balance; 1e14 or more risks the balance assertion. The wallet's runtime fee path derives its cap from the node's current fees, so only the fixture needed the change.
