# mainnet-seed-1: recon

Base `dda72e321` (origin/dev, the 6.0.0 line). Two Sonnet explorers (a reuse sweep and a runtime mapper), the planner's own reads, and three live reads on 2026-10-24. Paths are repo-relative; `X/` is `apps/extension/src/`.

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| A default network | `DEFAULT_SEEDS` (`X/wallet/services/network/seeds.ts:43-62`); `SEED_L1_BY_KIND.mainnet = MAINNET_L1_CHAIN_ID` (`:9-13`); offers by kind (`seed-offers.ts:52-79`), `KINDS_SEEDED_BEFORE_RECORD` never edited (`:21`) | reuse as is: one entry |
| The pair beside the id | `TESTNET_L1_CHAIN_ID` / `TESTNET_ROLLUP_VERSION` and `CHAIN_IDS` (`X/utils/chain-ids.ts:21-32`), pinned by `chain-ids.test.ts` | adapt: add the Mainnet pair |
| Endpoint constant | `X/wallet/constants/network-endpoints.ts`, imported only as `TESTNET_RPC_URL` (17 importers); the file is never opened (provider key) | adapt: append `MAINNET_RPC_URL` by script |
| Explorer | `EXPLORER_BASE_URLS` (`X/wallet/constants/explorers.ts:41-45`), `explorers.test.ts` | adapt: one chain entry |
| Live identity read | `createPreflightNodeClient` (`apps/extension/scripts/seed-preflight-node.ts:14-21`): silent, single attempt, never logs the URL | reuse as is |
| Opt-in live probe | `infra/token-list/test/live.test.ts` (`describe.skipIf(env !== "1")`), its `test:live` script, nightly's advisory `token-list-host-live` job (`.github/workflows/nightly.yml:251-264`) | reuse the pattern; the probe body is new |
| The update arrival scenario | `apps/extension/tests/e2e/default-network-arrival-update.test.ts`, today on the extra-seed candidate | adapt: the real seed |
| Arrival and stale-Mainnet smoke helpers | `seedNetworkArrival` (`tests/e2e/helpers/network-arrival.ts:15-31`), `seedStaleMainnet` (`helpers/stale-network.ts:247-260`), `E2E_MAINNET_CHAIN_ID = 2070860441` (`:39`) | adapt: adopt the seeded row |
| The stand-in node | `holdNodeStub` (`tests/e2e/fixtures/node-stub.ts:50`), held for `TESTNET_RPC_URL` only (`fixtures/extension.ts:188`); `DECLARED_REFUSALS` (`fixtures/egress-guard.ts:84-98`) | adapt (decision D6) |
| Chain labels | `getChainName` / `getChainPosition` know Testnet and Sandbox (`X/components/ui/utils.ts:8-38`) | leave (owner ask OA-3) |

No build-new item but the probe file and its nightly job.

## The e2e arm (every consumer)

`X/e2e/extra-seed.ts` (kind `mainnet`, chainId 1_000_000_001); `X/e2e/config.ts:30,129-148` (flag pair, stamp); `X/wallet/services/network/seeds.ts:1,61`; `X/wallet/runtime.ts:32,548-549`; `X/e2e/config.test.ts:132-183`; `biome.json:403-408,452-457,499-504,545-550`; `apps/extension/scripts/e2e/build-update-candidate.sh:5-21,31-35,51,80,92-108`; `apps/extension/scripts/e2e/agent.sh:108-112,181-183`; `tests/e2e/global-setup-smoke.ts:60`; `tests/e2e/fixtures/update/in-place.ts:14-36`; the arrival scenario; `tests/e2e/README.md:178-198`; `.github/workflows/_build-extension.yml:142`; `.claude/skills/release/SKILL.md:54`. Search: `extra-seed|extraSeed|EXTRA_SEED|1_000_000_001` over the tree minus `node_modules` and `archive/`.

## Runtime of a seeded, unselected Mainnet row

- **No background egress.** Seeding and the arrival read and write storage only; `classify.ts:56-58` is offline; no timer probes rows; schedulers and token seeding need accounts on the chain.
- **User-triggered dials to every row**: a full backup export (`getNodeStatus`, retrying client; `X/wallet/services/account-state/service.ts:239-258`), the contacts export (`probeNodeStatus`, bounded; `:97-128`), a restore's probe of the networks its backup gives work (`X/composables/importChainSync.ts:74-78`). A dApp that asks for Mainnet is now served (`servesChain`).
- **A wrong pin** passes seeding, the arrival and account creation (no live probe for seeded kinds). The header dot reads InvalidChain; the first send, estimate or view refuses (`packages/aztec-runtime/src/utils/chain-identity.ts:49-75`). A later build with a corrected pin classifies the row as a network cause on L1 1: Mainnet blocked, no reset (`X/wallet/services/network-reset/service.ts:83,389,460`).
- **Selecting Mainnet**: accounts derive offline under L1 1; the Sponsored and Private FPCs are registered as on every chain (unfunded there, #117); no token rows (the signed list has none for the chain); explorer links absent until D-explorer lands; every get-gas link opens `FEE_JUICE_BRIDGE_URL`, the Testnet app (`send/fee-helpers.ts:333`, used by `FeeSettingsCard.vue:461`, `SendReviewSheet.vue`, `pages/general.vue:121`; #77).

## Collisions found by the plan, not by the brief

- With the seed, the plain update candidate adds Mainnet, so `tests/e2e/update-replay.test.ts` (and the live `network/update-in-place.test.ts`) meet the arrival after unlock; nothing there answers it today.
- `seedNetworkArrival` and `seedStaleMainnet` plant a second `mainnet` row on 2070860441 beside the seeded one: a state no build writes.
- A guarded e2e launch answers the Mainnet host with a bodiless 403, which the node client retries for seconds per call (`fixtures/node-stub.ts:1-5`); a host no list declares fails the close (`tests/e2e/README.md` § Egress guard).
- `X/wallet/services/network/service.test.ts:1424-1433,1436-1720,1822` push a stand-in `mainnet` seed into `DEFAULT_SEEDS` or pin the two-seed set.
- #893 (draft, launch-prep-1 A2) replaces the README banner, line 8 included.

## Live reads (2026-10-24)

- `https://aztec-mainnet.drpc.org`, keyless, `node_getNodeInfo` and `aztec_getNodeInfo`: nodeVersion 5.2.0, l1ChainId 1, rollupVersion 4248422647 (Alpha), not the pinned pair.
- `aztecscan.xyz`: the Mainnet frontend of the explorer the wallet links on Testnet (one bundle names both; same `/tx-effects/`, `/blocks/`, `/contracts/instances/`, `/address/` routes). Its public API reports `l2NetworkId` MAINNET, l1ChainId 1, current rollup 4248422647, and a history that followed the July move (2934756905 → 4248422647).
- `walletChainId(1, 2070860440)` = 2070860441; the Testnet pair gives 685146337, as pinned.

## Open work read

#80 (this lane); #77 and #117 (`blocked:external`, stay open); #893 (README banner); known limits #808 (reopens "before the first Mainnet build"), #427, #745, #904, #471, #570 read; only #808's condition fires.
