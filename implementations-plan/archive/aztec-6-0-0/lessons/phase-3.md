# Phase 3: the chain and the drift pins

## The chain (M6)

- `node_getNodeInfo` on the seeded endpoint, read into a shell variable and never printed: `nodeVersion 6.0.0`, `rollupVersion 679261766`, `l1ChainId 11155111`. `(11155111 ^ 679261766) >>> 0 = 685146337`.
- The keyless `https://aztec-testnet.drpc.org` that `publish-token-list.yml`'s live check pins answers the same identity (block 1325, ENR `enr:-My4QPYl…`), so it needs no repoint.
- Moved: `TESTNET_ROLLUP_VERSION`, its live-verified note and the id comment (`X/utils/chain-ids.ts`); the formula fixtures `chain-ids.test.ts`, `session-established.test.ts` (field and short-hex forms, `0x287cb646`), `aztec-node-factory-adapter.probe.test.ts`, `infra/token-list/test/live-check.test.ts` (wire shape and summary line).
- History, never edited: `stored-shapes/{snapshot,goldens}.json`, `stored-shapes/backups/passkey.json`, `tests/e2e/fixtures/update/v0.31.0.storage.json`, the older-backup fixture in `useFullBackupImport.test.ts`, `CHANGELOG.md`. `infra/token-list/list.source.json` is P0's (#1103).

## SponsoredFPC

`bun run scripts/seed-preflight.ts 0x2d8fff82…69d3 0x23339131…3335` from `apps/extension` (origin printed only):

```
=== Testnet (https://lb.drpc.live) ===
nodeInfo: nodeVersion=6.0.0 l1ChainId=11155111 rollupVersion=679261766 (pinned 6.0.0, 11155111, 679261766) OK
instance address: 0x2d8fff82a3b0c15d0a89169e7d8d043e079ab94d52031f1de1e4972ebad169d3
originalContractClassId: 0x233391319da4f9877f724afd66d93a2d0dbb4a288f41e99093dbb30f41ee3335
deployer: 0x0000000000000000000000000000000000000000000000000000000000000000
currentContractClassId: 0x233391319da4f9877f724afd66d93a2d0dbb4a288f41e99093dbb30f41ee3335 OK
```

`deriveSponsoredFpc()` gives the same address; `CANONICAL_SPONSORED_FPC` and `tests/e2e/helpers/fpc-seeds.ts` moved.

## PrivateFPC

- `@alejoamiras/private-fee-juice@6.0.0`'s `canonical-deployment.json`: `aztecVersion 6.0.0`, salt `0x…01`, `expectedAddress 0x0516ebb4…6915`; `derivePrivateFpc()` gives the same address. The installed package equals its `npm pack` tarball; lock integrity equals npm's.
- Artifact against rc.3's (`target/private_contract-PrivateFPC.json`): the same eight functions with the same `custom_attributes` (`abi_private`, `abi_utility`, `abi_public`, `abi_only_self`), `is_unconstrained` and parameters; no initializer; `outputs` equal. Bytecode moved in every function but `public_dispatch`; `offchain_receive` and `sync_state` gain compiled error strings. Noir unchanged.
- `REVIEWED_PRIVATE_FPC_ARTIFACT` `eb15143e…` → `e527c5dd…`, recomputed in Python from the key-sorted artifact without `file_map` (the method reproduces the rc.3 digest). `CANONICAL_PRIVATE_FPC`, `PRIVATE_FPC_ADDRESS` and `fpc-seeds.ts` moved. unleashed must name this address before any release (OWNER-ASKS, owner actions).

## Token class and AuthRegistry

- `getBundledTokenClassId()` and `getContractClassFromArtifact(TokenContractArtifact)` both give `0x2ff09399…ea9f`; the `storageLayout` slots stay `symbol 3`, `decimals 5`. `packages/token-list/src/class-ids.ts` moved. `descriptors-real-artifact.test.ts` (nine kinds) and `token-transfer-vocabulary.real.test.ts` (selectors) pass unedited, so `OperationCard.wire.test.ts`'s selector note now names 6.0.0.
- `STANDARD_AUTH_REGISTRY_ADDRESS` at `@aztec-labs/standard-contracts@6.0.0`: `0x120bf1fe…5e83`. `known-contracts.test.ts` and `dapp-interaction/service.test.ts` moved.

## The scope guard (I1) and the couplings

- `ensureContractSynced(` callers: the same five call sites in both `dest/` trees (`#executePrivate`, `executeUtility`, `getPrivateEvents` in `pxe.js`; the private and utility oracles; the debug utils). New at 6.0.0: the public `simulateAndProveTx`, which reaches `#simulateTx` and `#executePrivate` and so syncs. Nothing in Nulo or in the upstream wallet libraries it runs (`aztec.js`, `wallet-sdk`, `wallets`, `accounts`, `entrypoints`, `stdlib`) calls it, so the guard's six `PxeService` methods still cover every path; a future `PxeService` method over it needs the guard (`UPDATE.md`).
- The node's stale-anchor wording (`possibly a reorg has occurred` in `server.js` and `node_world_state_queries.js`) is unchanged against `@aztec-labs/aztec-node@6.0.0-rc.3`'s tarball.
- `PXE_DATA_SCHEMA_VERSION` stays 16; the typed couplings typecheck.

## The gate

- `test:all`: exit 1, `@nulo/token-list-host` only; every other package passes, `@nulo/extension` included (the nine P1 reds are gone).
  - `test/tree.test.ts` (5 cases): `list.source.json` and `public/v1/list.json` list classes the wallet no longer bundles ("token list payload refused at source.tokens[0].classId"). The plan's allowed red until P0's envelope is on `dev`.
  - `test/live-check.test.ts`, "prints no node text, follows no redirect, and exits 1 on a row it could not check": the spawned script reads the real `list.source.json`, which the bundled class now refuses, so it stops before its table. Same cause; P0's #1103 rewrites the case to bring its own source (`--source=`).
- Lint, `typecheck:all`: exit 0. `rg` of `3409706519`, `3415328944` and the moved addresses leaves only the history above and P0's `list.source.json`.
