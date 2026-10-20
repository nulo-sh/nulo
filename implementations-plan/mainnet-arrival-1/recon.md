# mainnet-arrival-1: recon

Base `origin/dev` at `2f591ddd`. Two Sonnet explorers (a reuse sweep and a boot/takeover map), each claim re-read by the planner. `X` = `apps/extension/src`, `S` = `X/wallet/services`. `apps/extension/src/wallet/constants/network-endpoints.ts` was never opened.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| Per-profile "seeded" record | `S/token/seeder.ts:747` (`nulo:core:token-seeded@<profileId>`, a `ValueStorage` JSON blob, hostile read at `:759-776`, user tombstone `outcome: "deleted"` at `:319`) | adapt the pattern (key per profile, hostile read, written in the section that adds the row); the token seeder itself is token- and attempt-specific |
| Value store with a codec | `packages/wallet-core/src/storage/value-storage.ts` (`(root, area, parse?)`, JSON string, `get` throws on bad JSON or codec, never deletes) | reuse as-is |
| Seeding a profile | `S/network/service.ts:257-292` (`getOrInitNetworks`, under the network lock and the execution fence; early return at `:266-267`), `:304-333` (`seedDefaultsForProfile`, restore epochs), `seedOneNetworkLocked` `:338-360` (deletion-fenced write with compensation), `activateSeededLocked` `:364-378` | adapt: one pass that adds every missing seed, for both entry points |
| Duplicate and quarantine refusals | `addNetwork` `:522-529` (`ERR_DUPLICATE_CHAIN`, `isChainQuarantined`) | reuse the same two checks |
| Seed identity | `seedForKind` `X/wallet/services/network/seeds.ts:75` (first seed of a kind), `SEED_L1_BY_KIND`, classifier and reset key by kind | reuse: `kind` is the seed's identity |
| Profile purge | `NetworkService.purgeForProfile` `:1156-1177` (removes `activeKey` at `:1175`), called by `S/profile-deletion/coordinator.ts:124-137` | adapt: remove the record beside `activeKey` |
| dApp connect before seeding | `servesChain` `:656-663` (an empty or seeding profile serves every seed chain) | adapt: a never-offered seed chain is served too |
| Test harness | `S/network/service.test.ts:57-96` `harness()`, `withProfiles` `:167-175`, `recordWrites` (`S/storage-write-log`) | reuse as-is |
| Pure classifier | `S/stale-network/classify.ts:49-70` | reuse as-is (invariance test) |
| Test-only build flags | `X/e2e/config.ts` (`VITE_NULO_E2E_*`, double opt-in for anything a user would see, build stamp as live data), `apps/extension/scripts/e2e/agent.sh:105-186`, negative grep in `.github/workflows/_build-extension.yml` ("Assert test-only markers absent") | adapt for the e2e-only extra seed (arc 2) |
| In-place update harness | none on `dev`; migration-rule-1's A3 builds `tests/e2e/fixtures/update/` (`inPlaceUpdate({ from, to, populate, verify })`) | reuse once it lands; never a second one |
| Full-screen surface arbitration | inline in `X/popup/app.vue:186, 552, 557-579` (`takeoverView`, `X/popup/stale-takeover.ts:34`); barriers are Teleports at z 10000 | adapt in arc 2 |
| Takeover components | `X/components/stale-network/StaleNetworkTakeover.vue` (`Content` type `:51-61` and `SCREENS` `:87-153` private to the SFC), `copy.ts` | arc 2, per the owner's pick |
| One-time notice | `nulo:core:network-reset-done@` taken once by `StaleNetworkRepository.takeNotice` (`S/stale-network/repository.ts:123`); `RestoreOutcomeBanner` with `nulo:ui:restoreOutcome@`, registered in `X/utils/profile-ui-keys.ts` | arc 2, per the pick |

Absence trails: no network-level marker or tombstone (searched `token-seeded|SEEDED|tombstone|offered|markDeleted` in `*.ts *.vue *.md *.yml *.sh`); `deleteNetwork` writes no trace (`:562-599`); no `onNetworkAdded` listener outside the client (`grep -rn onNetworkAdded`); no e2e updates an extension in place (`onInstalled|upgrade|previous build` in `tests/e2e`); no e2e checks two full-screen surfaces never stack (`legal` in the stale-network e2e files, `stale-network-takeover|legal-sheet` in `tests/e2e`).

## Facts the plan rests on

- **The bug holds.** `getOrInitNetworks` returns the stored rows whenever the profile has one (`:266-267`); `seedDefaultsForProfile` does the same (`:314-315`). 0.31.0 and `dev` seed Testnet and Local Network only (`git show v0.31.0:…/seeds.ts`).
- **Callers.** `getOrInitNetworks`: the popup and onboarding bootstrap only (`X/composables/useProfileBootstrap.ts:133`), after the session opens. `seedDefaultsForProfile`: the full-backup restore before activation (`X/composables/full-backup-restore.ts:316`).
- **Backups carry no network rows** (the `network` slice is retired, `S/backup/README.md:20`); the restore reseeds from scratch and keeps only the backup's `active-chain-id` when it names a seed chain. So a restored profile is a fresh one.
- **Classification.** `classifyChains` iterates accounts and rows; a row with no accounts on a chain no other row holds is `clean` and yields no entry when its chainId equals its kind's seed (`classify.ts:30-43, 61-68`). A second row on a chain that already has one makes a moved chain `unclassifiable` (`:38`), which blocks the whole profile. The coordinator's verdict reads rows lock-free (`S/network/service.ts:396`) and its stamp digests account rows only (`S/account-integrity/coordinator.ts:229`).
- **Kind, not chainId, is stable.** A Testnet reset rewrites the row's chainId in place by kind (`rewriteForResetLocked`, `:1039-1066`), and the 6.0.0 bump is expected to move Testnet's chainId. A chainId-keyed record would read the moved Testnet seed as new.
- **Mainnet.** `MAINNET_L1_CHAIN_ID = 1` (`X/utils/chain-ids.ts:21`); no Mainnet rollup version or chain id exists. The reset refuses `l1ChainId === 1` (`S/network-reset/service.ts:83, 389, 460-461`). `tests/e2e/helpers/stale-network.ts:17, 260-265` plants a `kind: "mainnet"` row on `E2E_MAINNET_CHAIN_ID = 2070860441`.
- **Unlock drains queued dApp discoveries in the worker** on `onActiveProfileChanged` (`S/wallet-sdk/background.ts:778-788`) and asks `servesLiveChain` (`S/wallet-sdk/discovery-flow.ts:130`) before the popup's bootstrap reaches `getOrInitNetworks`.
- **Aztec line** is `6.0.0-rc.3` (`apps/extension/package.json:51`); the execution canaries are `tests/e2e/network/frozen-account-canary.test.ts` and `passkey-execution-canary.test.ts`.

## Collisions

- **migration-rule-1 (#865)**, plan committed on `worktree-migration-rule-1` (`ef78a901`), not on `dev`: its A1 adds `X/wallet/storage/stored-shapes.ts` and a scan that fails on any `nulo:` literal it does not register; its A3 adds `tests/e2e/fixtures/update/`. This lane's record key crosses A1; its update test needs A3.
- **Files shared with running leads**: none for arc 1 (`S/network/*`, `S/stale-network/classify.test.ts`). Arc 2 touches `X/popup/app.vue`, which onboarding-3, connect-split-1 and firefox-sidebar-1 may also edit; arc 2 rebases on whatever has landed.
