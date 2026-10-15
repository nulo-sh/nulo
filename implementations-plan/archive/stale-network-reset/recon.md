# Recon: stale network reset

Read-only recon on `dev` at `d01569a2`, three explorers (one reuse sweep, two subsystem maps), consolidated and spot-checked by the driver. Paths are repo-relative; `S/` is `apps/extension/src/wallet/services/`.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| Detect a stale seeded network row | `S/network/service.ts` `SEED_L1_BY_KIND` (:64), `DEFAULT_SEEDS` (:97), `getNodeStatus` → `NodeStatus.InvalidChain` (:752). Seeds are written only into a profile with **zero** rows (`getOrInitNetworks` :~262, `seedDefaultsForProfile` :~300). No row stores a rollup version or generation (`S/network/spec.ts:35`). | **Build new**: a pure classifier over rows vs the build's seeds, reusing those constants. Search trail: `grep -rniE "stale (chain\|network)\|generation\|network.?reset\|reseed\|reconcile.*seed"` over `apps/extension/src`, `packages/*/src`: only UI race fences and backup re-seed hit. |
| Purge one chain's state, keep the row | `purgeChain(profileId, chainId, networkId)` (:898), public but SW-internal (not in `rpcMethods` :187-204). Subscribers: account (`S/account/service.ts:196`, deletes account + imported-key rows), token + seeder, fpc, auth-registry, incoming-transfer, operation-journal (keyed by networkId); then `pxeServiceClient.clearChainState` last; emits `onChainPurged` (no UI consumer). Transactions purge via `onAccountDeleted`. | **Adapt**: wrap in a reset that takes `deleteNetwork`'s reservation bracket (`deletingNetworks`, `reservations`, :541-566) without deleting the row or the active-network guard. |
| Re-create accounts | `createAccountInternal` (`S/account/service.ts:287-345`, needs an open session via `getProfileSecret`), `ensureDefaultAccount` (:248), imported path `commitImportedAccount`; `NuloAccount.new` / `fromSigningKey` (`packages/aztec-runtime/src/account/nulo-account.ts:67-105`). Rows keyed `accountRowId(profileId, chainId, address)` (`S/account/spec.ts:27`). Next index = max same-type + 1; names not preserved. | **Adapt**: re-create by captured `(type, index, name, visible)` list; imported from the stored sealed key. |
| Integrity check | `S/account-integrity/coordinator.ts` `verifyProfile` (:129-188): all rows, all chains, Nulo_v1 only, stops at first mismatch, one record per profile (`types.ts:36-53`, key `nulo:core:account-integrity-blocked@<profileId>`), throws `AccountAddressInconsistencyError`, session withheld. Operation-time twin: `S/account/service.ts:629-660` `raiseRuntimeMismatch`. Imported rows fail per account (`ImportedAccountUnusableError`). | **Adapt**: narrow the block from profile to chain for chains the classifier marks resettable; keep the profile block for everything else. |
| Full-screen barrier UI | `apps/extension/src/components/composite/BarrierOverlay.vue` (fixed, z 10000, slots icon/title/sub/detail/default), used by `MigrationBarrier.vue` and `AccountIntegrityBarrier.vue` (mounted `popup/app.vue:~466`, yield on `popup-auth`/`popup-register`, read storage raw, allowlisted in `utils/storage-facade-ban.test.ts`). `ConfirmPopup.vue` via `cacheStore.confirm` (`confirm_color: "red"`). | **Reuse** the overlay pattern; **build new** the reset screen component (layout A). |
| Copy and glossary rules | `utils/copy-dash-ban.test.ts`, `utils/glossary.ts` + tests | **Reuse as-is**; no new dotted term planned. |
| Storage-seeding test fixtures | `tests/e2e/helpers/rpc-stub.ts` `nodeInfoResult(l1ChainId, rollupVersion)` + `interceptRpc` redirect (`tests/e2e/import-dead-rpc.test.ts`, `tests/e2e/network/backup-import-stalled-network.test.ts`); `page.evaluate` storage writes (`tests/e2e/fixtures/extension.ts:277`, `helpers/activity-seeds.ts`); `stopBackground` (`tests/e2e/fixtures/browser`); send-chaos harness (`pr-extension-network-e2e.yml` `network-e2e-chaos`). | **Adapt**: a stale-network seeding helper. Absent: any sandbox restart or rollup-version knob (searched `tests/e2e/global-setup.ts`, `sandbox-ownership.ts`, `fixtures/aztec.ts` for `rollup\|restart`). |

## What a user sees today (Testnet rollup bumped by an update)

1. SW start: migrations are a no-op (`realMigrations = []`, `BASELINE_VERSION = 1`), nothing compares rows to seeds.
2. Unlock: the integrity check derives from the row's `l1ChainId` (unchanged by a rollup bump), so it passes. **A rollup bump alone does not move addresses**: the KDF is `poseidon2([master, l1ChainId, type, index])`; the composite chainId is storage scoping only.
3. The active network stays the stale row; `setActiveNetwork` never probes. `getNodeStatus` returns `InvalidChain`, shown only as the header dot (`components/Header.vue:269`, same red as Inactive).
4. Balances: PXE `withStaleAnchorRetry` then `PxeStaleAnchorError`, treated as transient and retried silently.
5. Send: `assertLiveChainIdentity` throws "Chain identity mismatch … Refusing to sign/prove against a drifted endpoint".
6. dApps asking for the new chainId get the network-unavailable window (`servesChain` matches no row).
7. Manual fix: deleting Testnet is refused while active, can stall behind PXE work (#277), and never re-seeds Testnet (seeds only into a profile with zero rows).

If the update ALSO changes address derivation (rc.1 → rc.3 does, via `CONTRACT_ADDRESS_V2` → `V3`), step 2 fails: whole profile locked, barrier with no exit except the lock screen's "Forgot your password? Delete this profile".

## Constraints the design must respect

- **Session**: a block withholds the session, so `getProfileSecret` throws "Profile locked" (`S/profile/session-manager.ts:249-255`). A reset that needs the master must run inside an open session.
- **Imported accounts**: address is a pure function of the signing key and the frozen artifact (`nulo-account.ts:82-85`); a network reset keeps it, a derivation change moves it; the sealed key (DEK, AAD `(chainId, address)`) survives in `imported-keys-repository.ts` until `clearChainState` deletes it.
- **Locks**: `getProfileSecret` takes the facade lock; `purgeChain` holds the network lock (no watchdog, up to the 30 min prove envelope). Take the secret first, then the network lock.
- **Freeze rules** (`CLAUDE.md` § Account-address freeze): today "offers no delete CTA", "never ambiguous". `AccountIntegrityBarrier.test.ts:96` pins "no inputs, no links, no buttons". These change by owner decision (recorded in the plan).
- **Backups**: account-state slices are chain-bound (`ACCOUNT_STATE_SKIP_WRONG_NETWORK`); compat epoch 5 = nulo-v6 regime.
- **Local Network** is chainId 0 (`isLocalNetworkTarget`), so a local sandbox reset is invisible to a chainId comparison.

## Collisions

- Two mechanisms for one cause (profile block and per-chain reset) must not both fire.
- `onChainPurged` and the token seeder's same-named method are different things.
- A rewritten row must not keep the old `id` if journals keyed by `networkId` survive the purge; the purge clears them, so keeping the id is safe only after the purge completes.
- Fee-method selections keyed `(profileId, networkId, accountAddress)` have no purge subscriber found: check for orphans.

## Open issues touched

- #324 (Testnet reset to rc.3) is the first consumer; #277 (reset/delete stalls while the node is unreachable) shares the purge path.
