# network-identity-1: recon

Read at `13d5f8d0` (origin/dev). Two read-only explorers (sonnet) plus the planner's own reads. `S/` = `apps/extension/src/wallet/services`.

## Reuse map

| Capability needed | Existing code | Verdict |
|---|---|---|
| Loopback host test for an RPC URL | None as a function. Loopback is only the `http:` clause of `rpcTransportVerdict` (`packages/wallet-core/src/utils/rpc-url.ts:13-23`: `localhost`, `127.0.0.1` as `URL.hostname` spells them). Searched `isLoopback`, `loopback`, `127\.0\.0\.1`, `localhost`, `.hostname` over `apps/extension/src`, `packages/*/src`: other hits are Presto (`usePrestoHostPermission.ts:26`), the token list and tab lifecycle, none about node endpoints. | adapt: lift the host list out of `rpcTransportVerdict` into one exported predicate both use |
| Where a node's chain id is decided | `isLocalNetworkTarget` (`S/network/service.ts:86-90`), read by `_probeChainIdentity` (`:1165-1176`), `probeIdentityOnce` (`:909-917`) and `probeNodeStatus` (`:795-810`); `getNodeStatus` (`:779-793`) goes through `_getChainId` | adapt: one helper decides the id; all four read it |
| The local L1 constant | `LOCAL_L1_CHAIN_ID` (`apps/extension/src/utils/chain-ids.ts:29`), used by `seeds.ts`; `walletChainId` already lives in `packages/wallet-core/src/utils/chain-id.ts` and is re-exported by `chain-ids.ts` | adapt: move beside `walletChainId`, re-export the same way |
| Stored-L1 trust root | `assertCanonicalStoredL1` (`S/network/service.ts:396-405`) behind `getL1ChainIdStored` / `resolveVerifiedL1ChainId`, the L1 source for account creation, import and the reset | adapt: one more condition |
| Adoption checks | `addNetwork` (`:483-514`, probe with no kind), `addEndpoint` (`:665-691`) and `updateEndpoint` (`:693-736`) through `assertSameChainIdentity` (`:95-106`) | reuse; the new rule sits in the shared id helper |
| Promotion | `setPrimaryEndpoint` (`:760-775`): ownership, membership, write, `nodes.delete`; no probe, no URL check | adapt: one stored-URL check |
| Use-time check | `assertLiveChainIdentity` / `liveChainInfo` (`packages/aztec-runtime/src/utils/chain-identity.ts:48-85`), 11 production call sites under `S/execution/**`, every one handed the stored `Network` row (`getNetwork`, or a `SelectedNetworkChainInfo` slot filled with one) | adapt: one more condition on chain 0 |
| Error prefixes and their popup copy | `spec.ts:124-139`; `popup/components/popups/endpoint-error-text.ts` maps `ENDPOINT_CHAIN_MISMATCH` to "Wrong chain. This network is chain N.", unknown to "Something went wrong."; `NewNetworkPopup.vue:126-141` maps `DUPLICATE_CHAIN`, unknown to the toast "Something went wrong"; `[id].vue:83-93` any promotion failure to "Failed to update primary endpoint" | reuse: no new copy |
| Service test harness | `setupServiceWithStorage` (`S/network/service.test.ts:523`), `nodeInfoForChain` (`:578`, `{l1ChainId: 0, rollupVersion: n}`), `storeRow` (`:1640`), `bothStatuses` (`:1656`), `FakeNodeFactory.setOverrides` (`apps/extension/src/core/testing/fake-node-factory.ts`) | reuse |
| Persisted rollup version (the competing outline) | No field. `Network` (`S/network/spec.ts:31-51`); `networkShape ... satisfies Record<keyof Network, …>` (`:61-73`) makes a new key a compile error until added; rows are written only by `_buildNetwork` (`:1119`), the endpoint mutators and `rewriteForResetLocked` (`:977`) | not built (plan D1) |

## Facts the plan rests on

- **Backups carry no network rows.** `reseedNetworksStage` (`apps/extension/src/composables/full-backup-restore.ts:293-326`) seeds the built-in networks and drops a custom network's rows; `backup/README.md:20` retires the `network` slice. Every stored row is written by `NetworkService`.
- **A non-zero composite pins the rollup version.** Within u32, `rollupVersion = chainId ^ l1ChainId` (`chain-identity.ts:38-42`); the use-time check compares the exact L1 and the composite (`:55-66`), and chain 0 has its own branch (`:60`).
- **Where chain 0 comes from**: the local carve-out (`isLocalNetworkTarget`: a `local` kind hint or the seed's URL), and `walletChainId`, which returns 0 when the two halves are equal.
- **The local sandbox's rollup version** is `uint32(bytes4(keccak256(abi.encode(config, genesisState))))` (`@aztec-foundation/l1-artifacts` `script/deploy/RollupConfiguration.sol:129,168-181`), so it moves with every Aztec version and deploy configuration. The PXE store stamp binds the rollup address and refuses to open on a change (`packages/aztec-runtime/src/pxe/opfs-store.ts:202-229`), and the stale-network classifier never reads a node (`S/stale-network/classify.ts`), by design: closed #471, and the archived stale-network-reset plan's note that a Local sandbox restart stays undetectable.
- **The e2e runner provisions the Local endpoint as `http://localhost:<port>`** (`apps/extension/scripts/e2e/resolve-ports.ts:270`, `agent.sh:108,122`, `_extension-network-e2e.yml:11-17`). `tests/e2e/network/endpoint-refused-recovery.test.ts` rewrites the Local row to `http://[::1]` and repairs it through the UI to `localhost`; `tests/e2e/endpoints.test.ts` adds `http://localhost:1`. `tests/e2e/network/backup-edited-local-network.test.ts` moves the Local endpoint to `127.0.0.1`. No e2e adds a remote endpoint to a chain-0 row or adds a network whose node reports chain 0.
- **`setPrimaryEndpoint` has one popup caller** (`popup/pages/settings/networks/[id].vue:83-93`); `onPrimaryEndpointChanged` has no subscriber outside `S/network/`.
- **The reset's endpoint probe** (`S/network-reset/service.ts:385-400`) maps any throw from `probeIdentityOnce` to "use the seed's node", so a refusal there needs no new handling.

## Docs that state the rules

- `SECURITY.md:279-284` (adoption): says the probe rejects when `l1ChainId` "doesn't match the parent `Network.chainId`" and names `EndpointChainMismatchError`; the code compares the composite and the exact L1 and throws the `ENDPOINT_CHAIN_MISMATCH` prefix (`service.ts:95-106`). `:285-286` names `DuplicateEndpointError`; the code throws the `DUPLICATE_ENDPOINT` prefix.
- `SECURITY.md:321-322`: "bound to a chain via the `chainId` check at adoption + reverification on `setPrimaryEndpoint`"; `setPrimaryEndpoint` probes nothing.
- `chain-identity.ts:44-46`: the comment the plan rewrites to state the rule the code enforces.
- Stale, out of scope (named for the orchestrator only): `opfs-store.ts:89` and `chain-runtime.ts:188` still say the stamp wipes on a redeploy; the code refuses and preserves.

## Collisions

None on these files at 2026-10-17 15:3xZ (lane brief). Open issues touching `S/network/`: #498 (popup start with an unreachable custom node) does not overlap. Closed known limits searched (`chain identity network`): #471, #470, #262; #471 is the design note above.
