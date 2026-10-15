# aztec-rc3 recon

Base: `origin/dev` at `d3dc4415`. Three Sonnet explorers (pin surface, address regime, chain cascade with seeds and publish) plus the planner's own probes of the live Testnet node, npm and the rc.3 tarballs (`npm pack` into a scratch directory, read only). Absence claims carry their search.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| Pin sweep and one-generation proof | `scripts/aztec-hold-residue-check.ts` (`WORKSPACE_LINE` line 23, `HELD_ROOTS = []`, `SINGLE_GENERATION_ROOTS` = presto, private-fee-juice, aztec-standards) | adapt: one literal; it also checks the workspace manifests, so it must learn the second scope's line (see below) |
| Lockfile disposition | `scripts/lockfile-exception-diff.ts` (scope regex only) | reuse as is |
| Age-gate bypass | `bunfig.toml` (no exclude today) + SECURITY.md § Dependency policy runbook | reuse as is |
| Toolchain pins | `.github/actions/setup-aztec/installer-pins.sha256` lines 9-12, `cli/` + `lock.sh`, `scripts/ci-cd/setup-aztec-pins.test.ts` | adapt: two hashes, a regenerated CLI lock |
| Licence overrides | `packages/third-party-notices/src/policy.ts` lines 81-207 (`reviewedVersion` per Aztec package) | adapt: re-review at the new tags |
| PXE heal patch | `patches/@aztec-labs%2Fpxe@6.0.0-rc.1.patch` + `register-account-heal.test.ts:122-131` | reuse: rename only (rc.3 `dest/pxe.js` is byte-identical to rc.1) |
| Noir patches | two `patches/@aztec-foundation%2Fnoir-*@6.0.0-rc.1.patch`; markers in `layout-identity.test.ts:37`, `resolve-asset/src/index.test.ts:81` | reuse: rename to `@6.0.0-rc.6` (the hunk context is unchanged) |
| Regime append | `address-freeze.ts` (`REGIMES`, `V6_REGIME`), `frozen-artifact.ts`, `instantiation-descriptor.ts`, `artifacts/PROVENANCE.md`, `address-freeze.test.ts`, `artifact-freeze.test.ts` | adapt: the V5→V6 shape, mirrored |
| Address KAT generator | `reference/nulo-v6/` (own `package.json`, `bunfig.toml`, `bun.lock`, `derive-vectors.ts`) | adapt: copy to `reference/nulo-v7/` |
| Backup compat epoch | `backup-migration-registry.ts:77` `CURRENT_COMPAT_EPOCH = 5` | adapt: 6 |
| Chain identity | `apps/extension/src/utils/chain-ids.ts:25` | adapt: one constant |
| Per-chain purge | `NetworkService.purgeChain` (`network/service.ts:898`), tests `network/service.test.ts:582-648,1205` | reuse as is; no new code |
| Storage baseline | `migrations/index.ts:22` `BASELINE_VERSION = 1`, `realMigrations = []` | reuse: stays (no shape change) |
| Drift detectors | `fpc/protocol-fpcs.test.ts` (PrivateFPC, SponsoredFPC, artifact digest), `token/default-tokens.test.ts` | adapt: conscious re-pins after review |
| Seed preflights | `apps/extension/scripts/seed-preflight.ts`, `seed-preflight-metadata.ts`, `seed-preflight-node.ts` (silent client) | reuse: also proves the SponsoredFPC instance |
| SDK publish | `scripts/publish/` (`stage.ts` writes exact peers from the workspace pins), `approved-digests.json`, `publish-packages.yml` | reuse; version + digest rehearsal |
| Single source for versions | the four package-name readers (setup-aztec `action.yml:25`, `docker-ci-like.sh:95`, `global-setup.ts:74`, `vite.shared.ts:31`) | reuse: no edit |

No `build new` row. Searched for a startup reconcile of a stale seeded network (`getOrInitNetworks`, `seedDefaultsForProfile`, `rg 'reconcile' network/`): none exists; seeding runs only for a profile with no network rows.

## Live and registry facts (2026-10-14)

- Testnet `node_getNodeInfo` at 16:57Z: `nodeVersion 6.0.0-rc.3`, `rollupVersion 3409706519`, `l1ChainId 11155111`, block 2621. New wallet chainId `(11155111 ^ 3409706519) >>> 0 = 3415328944` (today `2904119610`).
- `@aztec-labs/*` `6.0.0-rc.3`: all 23 locked names published 2026-10-08 12:14-12:21Z. They clear the age gate 2026-10-15 12:21Z.
- `@aztec-foundation/*`: there is no `6.0.0-rc.3`. The rc.3 line depends on `6.0.0-rc.6` of `bb.js`, `noir-acvm_js`, `noir-noirc_abi`, `noir-types`, `l1-artifacts`, `bb-avm-sim*`, `cdb`, `ipc-runtime`, `wsdb*` (all published 2026-10-08 11:39-11:46Z).
- `@aztec-foundation/aztec-standards@6.0.0-rc.3`: 2026-10-13 19:04Z, SLSA provenance, publisher GitHub Actions. No dependencies. Clears 2026-10-20 19:04Z.
- `@alejoamiras/presto@6.0.0-rc.3`: 2026-10-14 16:54Z, SLSA provenance. Depends on `@aztec-labs/{stdlib,bb-prover,foundation}@6.0.0-rc.3`, `@aztec-foundation/{bb.js,noir-acvm_js,noir-noirc_abi}@6.0.0-rc.6`, `presto-core@1.2.1`. Clears 2026-10-21 16:54Z. The issue's "no rc.3 build" no longer holds.
- presto-server: newest GitHub release `presto-v1.2.0-rc.1` (2026-10-02); CI pins `1.1.3` (`_extension-network-e2e.yml:193-198`). Its release notes say a server downloads the `bb` for whatever Aztec version the SDK requests and checks its digest; whether 1.1.3 proves rc.3 is unverified.
- `@alejoamiras/private-fee-juice`: no rc.3 (latest `6.0.0-rc.1`).
- unleashed (`alejoamiras/unleashed`, read through `gh api`): last commit 2026-10-13, no rc.3 generation; its line is rc.1.

## rc.3 tarball facts (read only)

- `@aztec-labs/pxe` `dest/pxe.js`: byte-identical to rc.1. `registerAccount` still returns at the `already registered` branch (lines 359-371), so the heal patch is still needed. The `ensureContractSynced` callers are the same set (`pxe.js:226,817,876`, the two oracles, `debug/pxe_debug_utils.js`). `hooks/` and `logs/` are unchanged, so the scope guard premises hold.
- `oracle_version.js`: rc.1 `ORACLE_VERSION_MAJOR = 31`, rc.3 `32` (minor 2). `utility_execution_oracle.js:104` refuses a contract whose major differs. The changelog's "32 → 33" (FactScope) is not in the published rc.3 PXE. Either way every rc.1-compiled artifact (the vendored SchnorrAccount, the PrivateFPC, the standards Token) is refused on the rc.3 PXE.
- `@aztec-labs/accounts@6.0.0-rc.3` `artifacts/SchnorrAccount.json`: sha256 `9aebda2a…cdc8`, `aztec_version 6.0.0-rc.3`, noir `1.0.0-rc.3+5a7ee9bf…`, constructor params `inputs, signing_pub_key_x, signing_pub_key_y` (the descriptor's two args). The vendored V6 file is `4b4933a1…7f94`.
- `@aztec-labs/constants@6.0.0-rc.3` carries `CONTRACT_ADDRESS_V3` in `dest/constants.gen.js`. The wallet hashes no address itself: `getContractInstanceFromInstantiationParams` and `CompleteAddress` pick up V3, so the account KAT, the PrivateFPC and the SponsoredFPC addresses all move.
- `@aztec-labs/wallet-sdk` `dest/`: identical rc.1 → rc.3 (only the dependency pins move).
- aztec-standards rc.3: `artifacts/target/token_contract-Token.json` (sha256 prefix `d7614e3f`, `aztec_version 6.0.0-rc.3`) and `artifacts/src/artifacts/Token.js` exist, the two paths the repo imports. `dist/target/` is gone; nothing in the repo reads it.
- noir `acvm_js`/`noirc_abi` rc.6 `package.json`: the `"module"` line the patches replace is unchanged.
- Upstream compare `aztec-node v6.0.0-rc.1...v6.0.0-rc.3`: 121 commits, two `!:` — `feat(txe)!: … immutables hash in TXE deployments` (not our surface) and `feat!: bump the contract address domain separator to v3`.
- Our-surface hits for the changelog's symbols: only `packages/aztec-runtime/src/pxe/public-events.ts:327` (`getBlockHashMembershipWitness` with a block-hash reference). rc.3 now throws where the node's archive differs at that height; the wallet already throws on a non-member in the same function, so both land in one failure path. No hit for `OriginBlock`, `advance_offset`, `FactScope`, `check_nullifier_exists`, `getBlockHashMembershipWitnessAtArchive`.

## Pin surface (from the sweep)

- Exact `6.0.0-rc.1` pins: `apps/extension/package.json` (23), `packages/aztec-runtime` (16), `wallet-bridge` (4), `wallet-crypto` (3), `wallet-sdk-schema-patch` (2), `apps/playground` (10), `.github/actions/setup-aztec/cli/package.json` (2). `reference/nulo-v6/package.json` stays (historical generator).
- Root `package.json:55-57` patch keys and the three patch files.
- Version literals that move: `layout-identity.test.ts:20,36`, `packages/resolve-asset/src/index.test.ts:67,69,83,98`, `scripts/aztec-hold-residue-check.ts:23`, `policy.ts` (11 sites; `NOIR_COMMIT` `5a7ee9bf…` equals the rc.3 artifacts' noir commit), `installer-pins.sha256:9-10` (lines 11-12 move only if the rc.3 `versions` manifest names a new noir or Foundry), docs (`UPDATE.md:7,85`, `packages/*/README.md`, `apps/extension/store/SOURCE-BUILD.md:68,74`, `listing.md:224`, `legal/README.md:50`), `scripts/ci-cd/audit-acks.json:4,119` wording, cosmetic fixtures (`vendor-chunks.test.ts`, `bb-fetch-code-shim.test.ts`, `stage.test.ts`).
- Comments to re-check: `OperationCard.wire.test.ts:45` (Token selectors "at 6.0.0-rc.1"), `wallet-sdk-schema-patch/src/apply.ts:27` ("revisit on bump").
- Name-keyed sites carry scopes, not versions: no edit (`bb-fetch-code-shim.ts:7` path must still exist in rc.6 bb.js).

## Chain cascade

- `chain-ids.ts:25` and its comments (`:21-23,32`), `chain-ids.test.ts:7,9`. Formula fixtures that name the old Testnet pair: `aztec-node-factory-adapter.probe.test.ts:18`, `session-established.test.ts:719-722` (hex `0xadb36f9d` becomes `0xcb3bfe17`). V5 literals (`1816023401`, `1821665230`) are "unserved chain" fixtures and stay.
- No startup reconcile exists (above). An installed V6 profile meets the account integrity block first (every stored address mismatches under V3), and a reset or a fresh install seeds the new chainId.

## Regime surface

- `address-freeze.ts` (`REGIMES` from line 69, `V6_REGIME` line 112), `frozen-artifact.ts:20,23`, `PROVENANCE.md` (full rewrite), `address-freeze.test.ts` (`EXPECTED_REGIMES`, the live-module check at 103-108, the binding at 111), `artifact-freeze.test.ts:9,40-51`, `derivation-vectors.test.ts:6-7,65-73`, `account-seed-vectors.test.ts:6`, `account-export.ts:26-44` and its test's checksum (`account-export.test.ts:76`).
- `V6_REGIME` importers: `account-integrity/coordinator.ts:8,161`, `account/service.ts:27,642`, `account-export.ts`. `regimeId: "nulo-v6"` fixtures: `coordinator.test.ts:91,111`, `AccountIntegrityBarrier.test.ts:28`, `runtime-mismatch.test.ts:73`, `profile/service.integration.test.ts:2651,2703,2732,2752`.
- Compat epoch 5 → 6: `backup-migration-registry.ts:66-79`; literals in `useFullBackupImport.test.ts:203,749-753`, `useFullBackupImport.stages.test.ts:206`, `full-backup-keys.test.ts:120`, `contacts-backup.fixture.json:2`, `tests/e2e/helpers/import-drivers.ts:448,519`, `backup-migration-registry.test.ts:226`.
- Name "Nulo V6": `apps/extension/package.json:4` (`displayName`, feeds the manifest name), `store/listing.md:130,166`, `store/templates/{tile,frame}.html`, the captured store PNGs, `address-freeze.ts` comments, `chain-ids.ts` and `explorers.ts:33-34` comments, `BEFORE-LAUNCH.md:37-39,64`. `store-listing.test.ts:58-59` holds the Chrome title to `displayName`.
- Store state: the V6 Chrome submission is staged Unlisted; the AMO listing is live with the experimental flag (`BEFORE-LAUNCH.md` § 2).

## Token list and the dynamic-token-list stack

- Today: `default-tokens.ts` `TESTNET_TOKENS` (4 addresses on the old rollup), `TESTNET_TOKEN_CLASS_ID` (rc.1 standards Token class), `DEFAULT_TOKEN_SEEDS` keyed by `CHAIN_IDS.TESTNET`; `price-map.ts:59-63`; `default-tokens.test.ts` holds every seed's class to the bundled Token class. The seeder refuses a pin mismatch (`token/service.ts:690-695`), so a dead seed shows as a failed or rejected seed row.
- `tests/e2e/shipped-token-list.test.ts` runs only in artifact smoke runs (nightly Chrome and Firefox, `nightly.yml:341,429`) and expects every Testnet seed to become a token.
- #388 (base `dev`, CONFLICTING at the time of reading), #389 (deletes `TESTNET_TOKENS` and `DEFAULT_TOKEN_SEEDS`, seeds from the signed list at `tokens.nulo.sh`), #391 (close-out). Overlap with this lane: `default-tokens.ts`, `default-tokens.test.ts`, `price-map.ts`, `price/service.test.ts`, `shipped-token-list.test.ts`, `apps/extension/package.json`, `bun.lock`, `CLAUDE.md`, the aztec-update skill's step 3. After #389, `packages/token-list/src/class-ids.ts` pins the bundled class and `infra/token-list/list.source.json` keys entries by a literal chainId.

## Published packages

- `@nulo-sh/{wallet-crypto,resolve-asset,wallet-sdk-schema-patch}` are at `0.1.0` on npm; `wallet-crypto@0.1.0` peers `@aztec-labs/{accounts,foundation}@6.0.0-rc.1`. `stage.ts:293-311` writes exact peers from the workspace pins; `stage.test.ts` follows them. `approved-digests.json` lists only `0.1.0`; `publish-packages.yml` is dispatch-only, `npm-publish` environment, trusted publishing with provenance, then `verify-provenance.sh` and `npm audit signatures`.
- unleashed bumps only after these three are published with rc.3 peers (its `scripts/ci-cd/published-packages.test.ts`, per the orchestrator's externals note).

## Open work read

`gh issue list --state open` narrowed by aztec, presto, fee terms: #324 (this lane), #80 (V6 mainnet seed, blocked), #117 (private-origin fee order, blocked), #148 (handshake loss, upstream). No closed `known-limit` issue matches "network reset" or "rc.3".
