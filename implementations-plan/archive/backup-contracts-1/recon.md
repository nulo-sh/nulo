# Recon: backup-contracts-1

Read at `8ae2c06a4` (origin/dev, 2026-11-23). Two read-only explorers on Sonnet (a reuse sweep over ten capabilities, a mapper of the installed Aztec 6.0.0 packages), the lead's own reads, and the measurements below. Paths are repo-relative; `stdlib`, `pxe` mean the installed `@aztec-labs/*` 6.0.0 packages.

## Reuse map

| Capability needed | Existing code | Verdict |
|---|---|---|
| Artifacts the wallet ships, keyed by class id | `packages/aztec-runtime/src/pxe/artifact-catalog.ts:34-47` (12 keys: protocol and standard contracts, noir-contracts `Token`/`NFT`/`FPC`/`SponsoredFPC`, the aztec-standards Token as `wonderlandToken`, the private FPC); `known-artifacts.ts:24-41` builds `Map<classId, artifact>` | reuse as-is |
| Resolve an artifact by class id, verified | `ArtifactRegistry.resolve` (`pxe/artifact-registry.ts:96-107`): `known` (catalog, keyed by computed id) then `pxe-local` (recomputed, `verifyArtifactClassId`); exposed as `PxeService.getContractArtifact` (`pxe/service.ts:350-355`) | reuse as-is |
| Write the wallet's own copy over a supplied one | `PxeService.registerContract` (`pxe/service.ts:422-458`): `own ?? artifact` at `:453`, address derived before any write | reuse as-is |
| Bind a file artifact to its instance's class | `assertWireArtifactClassId` (`pxe/artifact-class-id.ts:91-98`): schema parse, recompute, fixed mismatch text; called per contract at `account-state/service.ts:495` | reuse; call once per class |
| Dedupe by class id | `ContractResolver.resolveArtifacts` (`execution/contract-resolver.ts:245-270`) fetches each class once; `note/service.ts:190-200` | pattern to follow |
| Strip debug info, class id unchanged | `apps/extension/scripts/strip-artifact-debug-info.ts` (`withoutDebugInfo`, nargo form: `debug_symbols: ""`, `file_map: {}`), applied by the build to the shipped token, private FPC and noir Token | adapt to the loaded form (`debugSymbols`, `fileMap`) |
| Pinned class ids | aztec-standards Token `packages/token-list/src/class-ids.ts:9-11`; account `FROZEN_ACCOUNT_CLASS_ID` (`account/frozen-artifact.ts:22`); none for the FPCs | reuse for step 2 |
| Slice normalizer, caps | `account-state/normalize.ts` (`ACCOUNT_STATE_CAPS`, `normalizeAccountStateSlice`, `registrableNetworkIds`) | adapt (format 2) |
| Per-network restore and retry | `composables/importChainSync.ts:66-130` (normalizes in the popup, then `restore([item])` per network); `full-backup-restore.ts:721-790` (`planRestoreAgain`, restore again) | adapt (payload) |
| Network-id remap | `utils/full-backup-helpers.ts:562-584` `remapNetworkIdByChain` skips a non-array slice | adapt (format 2 items) |
| Fetch code from outside | none. `artifact-registry.ts:20-27`: "The HTTP artifact registry was removed"; `artifact-catalog.ts`: "never fetched at runtime" | build new only if step 3 ships |
| Aztecscan data path | none: explorer links only (`wallet/constants/explorers.ts`); the `scan` level has no producer (`utils/contract-level.ts:15`, "`scan` has no source yet") | nothing exists |

Search trails for the absences: `fetch(`, `XMLHttpRequest`, `https://` under `apps/extension/src` and `packages/*/src` (hits: CoinGecko `price/service.ts:35`, the token list `token-list/service.ts:114,250`, node RPC `utils/fetch.ts:95`, manifest and bb shims); `aztecscan` (links, glossary, chip copy only); `getContractClassLogs`, `getPublicFunction`, `ContractClassPublished` (no hits outside tests).

## Facts the plan rests on

- **The slice today.** `AccountStateService.backupNetworkState` (`account-state/service.ts:218-262`) writes `{address, instance, artifact}` for every registered contract but the PXE-provided ones, fetching the artifact per instance by `currentContractClassId`. The profile's account contracts and both sponsors stay in it (#221's decision; `service.ts:546-552`).
- **Wire form.** The SW service boundary runs `jsonSanitize` (`extension-messaging/src/core/base-service.ts:122`; `wallet-core/src/utils/serialization.ts:57`): Buffers become base64. The file's slice is that JSON; the import measures `JSON.stringify(raw).length` against `maxSliceCodeUnits` = 41,943,040 (`normalize.ts:31,101-106`).
- **Versioning.** The slice is `{kind: "non-storage", optional: true}` (`backup/backup-migration-registry.ts:225`) and passes migrations verbatim. `aztec-version` is stamped (`useFullBackupExport.ts:240`) and read nowhere on import (searched `aztec-version`, `aztecVersion` in `apps/` and `packages/`). `compat-epoch` accepts a set (`SUPPORTED_COMPAT_EPOCHS`, `backup-migration-registry.ts:81-89`).
- **An older build meeting an object slice.** `remapNetworkIdByChain` skips it (`full-backup-helpers.ts:572`); `normalizeAccountStateSlice` returns one bounded violation, "malformed account-state slice (not an array)" (`normalize.ts:92-94`); every other slice restores.
- **Restoring tokens registers nothing.** `TokenService.restore` writes rows only (`token/service.ts:1045-1100`); the later best-effort refresh registers a token's contract only when its class resolves from the catalog or the PXE store (`token/service.ts:763-840`, `:989`).
- **dApp registrations.** `aztec_registerContract` carries `{instance, artifact?}`; a missing artifact resolves from the catalog or the store, else `ContractNotRegisteredError` (`execution/registration-executor.ts:172-221`). A grant (`canRegister` and the address) is required (`method-scope-checkers.ts:77`).
- **What a class id commits to** (`stdlib/dest/contract/contract_class_id.js:26-30`, `artifact_hash.js:36-115`): the contract name and `outputs` (structs, globals), every private and utility function's selector (name and parameter types), return type and bytecode, each private function's verification key, and the public dispatch bytecode. **Not committed**: parameter names and visibility in `functions[]` (perhaps indirectly through `outputs`' `*_abi` structs, unverified), `isStatic`/`isInitializer`/`isOnlySelf`, `nonDispatchPublicFunctions` (the public functions' ABI), `storageLayout`, `errorTypes`, `debugSymbols`, `fileMap`, `aztecVersion`.
- **`artifactHash` short-cut.** `getContractClassFromArtifact` uses an object's own `artifactHash` key when present (`stdlib/dest/contract/contract_class.js:10`). `ContractArtifactSchema.parseAsync` drops that key (probe below), and the restore parses through the schema before hashing.
- **What the node serves.** `getContractClass(id)` returns `{id, privateFunctionsRoot, version, artifactHash, packedBytecode}`, no private or utility bytecode, no verification keys, no ABI (`stdlib/dest/interfaces/aztec-node.js:351-364`); no broadcast-function event or node method exists in 6.0.0. A restore cannot rebuild an artifact from the node.
- **PXE storage is already per class.** `contract_artifacts` keyed by class id, instances keyed by address; `addContractArtifact` returns early on a known class (`pxe` `contract_store.js`).
- **Class ids move with the toolchain.** The account regimes list four ids across recompiles (`account/address-freeze.ts:77-129`); a newer aztec-standards gives the token a new id.

## Aztecscan (step 3)

- Endpoints, at chicmoz `94d6d84` (2026-10-26, the code the live v6 API ran on 2026-11-11 per the earlier research lane): `GET /l2/contract-classes/{id}/versions/{v}?includeArtifactJson=true`, `GET /l2/artifacts/{artifactHash}` (`services/explorer-api/src/svcs/http-server/routes/paths_and_validation.ts:57-71`). Reads need the one shared key in the path; on 2026-11-11 CORS answered only the explorer's own origins, so an extension could read it only from its background with a host permission; the explorer logs each request URL; its terms promise nothing on availability.
- On 2026-11-11 no v6 class on Mainnet or Testnet had an uploaded artifact (live counts, earlier lane).
- Upstream head `2707070a5` (2026-11-20) now checks uploads against the full class id and function list (`packages/contract-verification/src/artifact/verify-payload.ts:78-83`; commits #35, #44, 2026-11-18). Whether the live API runs it, and today's counts, were not checked: that needs the key, which this lane does not use.
- The docs site (`docs.aztecscan.xyz`) is a Swagger shell; its content did not load without a browser.

## Measurements

Method: a scratch script outside the repo loads each artifact with `loadContractArtifact`, applies the build's strip where the build applies it, serializes with the wallet's `jsonStringify` (the file's wire form), builds instances of the real shape (1,172 code units each), and measures `JSON.stringify(slice).length` (the import's measure). "Format 2" is `{format, classes, items}` with each class once. Run with `bun` on 2026-11-23 at `8ae2c06a4`.

One artifact, code units: aztec-standards Token as shipped (stripped) 1,835,882; Schnorr account (vendored, not stripped) 1,420,088; sponsored FPC 907,329; private FPC as shipped 616,857. Unbundled stand-ins, stripped / with debug info: Escrow 140,437 / 1,196,093; NFT (aztec-standards) 877,658 / 2,687,233; Vault 937,132 / 2,841,627; MultiToken 1,715,789 / 3,899,351.

| Slice | Today | Format 2 | Format 2, shipped classes left out |
|---|---|---|---|
| 1 token | 1,837,155 | 1,837,247 | 1,296 |
| 8 tokens | 14,696,827 | 1,845,661 | 9,710 |
| 23 tokens | **42,253,280** (over the cap) | 1,863,704 | 27,753 |
| 24 tokens | 44,090,377 | 1,864,907 | 28,956 |
| 32 tokens | 58,787,153 | 1,874,531 | 38,580 |
| Mix: 8 tokens, 2 accounts, private FPC, 4 app classes (one with 5 instances); apps stripped / with debug | 22,400,000 / 33,575,912 | 7,567,286 / 14,520,574 | 3,694,249 / 10,647,537 |
| Typical: 2 networks × (3 accounts, 2 sponsors, 6 tokens, 2 app classes); apps stripped / with debug | 35,786,391 / 41,706,693 (99% of the cap) | 5,889,635 / 8,849,786 | 1,109,199 / 4,069,350 |
| Heavy: 3 networks × (5 accounts, 2 sponsors, 20 tokens, 5 app contracts); apps stripped / with debug | 147,578,224 / 171,605,056 | 8,567,680 / 15,520,968 | 3,787,244 / 10,740,532 |

Correction (2026-11-24): the right-hand column also leaves the account class (1.42M) out of the file, which step 2 keeps; with it, mix 5.11M, typical 2.53M, heavy 5.21M (stripped).

Per-network class tables (OA-3 C: the array shape, each network carrying the classes it uses), stripped / with debug: typical 11,748,047 / 17,668,349; heavy 25,471,699 / 46,331,563; one-network rows equal format 2.

The 1-token figure matches the "about 1.8 million" the earlier lane measured on the local network. A typical two-network profile is at the cap today. After format 2 with stored artifacts stripped, the cap needs about 22 distinct MultiToken-sized app classes, 40 Vault-sized or 265 Escrow-sized beside the 4.78M of shipped classes (first counted from an empty file as 24, 44, 298; with debug info kept: 10, 14, 35, same basis).

Probe: `ContractArtifactSchema.parseAsync({...artifact, artifactHash: "0x01"})` returns no `artifactHash` key (2026-11-23).

## Collisions

- `harden-security-fixes-4` (PR #1924 open, arc 2 next on the task service) touches no backup code; its plan folder is not edited here.
- The `aztecscan-verify-1` research (2026-11-11) is the source of the Aztecscan facts above; the "Aztecscan verified" level stays unbuilt and is not this lane's.
- #191 and #221 (closed) settled what the slice holds; this plan keeps both decisions.
