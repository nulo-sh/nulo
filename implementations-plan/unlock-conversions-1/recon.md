# Recon: unlock-conversions-1

Base: `origin/dev` at 0bfd2c088. One Explore sweep (sonnet) plus the planner's own reads. Paths are under `apps/extension/src/` unless stated.

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| The unlock hook and its failure shell | `sealOnRowKeysReady` and `runSealing` (`wallet/services/seal-on-unlock.ts:11-31`): subscribe to `onRowKeysReady`, run the handler unawaited, catch and `warn` | reuse-as-is |
| The two existing conversions | `retireEndpoints(network, retired)` (`network/retired-endpoints.ts:17-33`, async: it hashes each URL) and `retireDefaultName(network, rows)` (`network/seeds.ts:107-112`); both return the converted copy or `undefined` | reuse-as-is; the list wraps them |
| The pass that applies them | `NetworkService.retireDefaults` (`network/service.ts:292-313`): under the network lock, skips the network a reset journal holds, folds both per row, one `storage.set`, the node evictions and one `onNetworkUpdated` per changed row | adapt: the fold moves to the runner, the write stays |
| An ordered registry with a guard | `realMigrations` and `registry.test.ts` (`wallet/storage/migrations/`): versioned, journaled, contiguous ids, an unregistered-file scan, a run-twice harness | adapt the style only (the run-twice check); the engine itself does not fit |
| The engine's "recording" | none: the engine logs no line per migration; it keeps durable `nulo:schema:*` keys and returns a `MigrationResult` (`packages/wallet-core/src/migration/migrator.ts:55-71`) | build new: one debug line per conversion per pass, no stored state |
| A static source ban | `utils/storage-facade-ban.test.ts` (line scan, `RegExp[]` allowlist, self-tests) and `wallet/services/legal/call-sites.test.ts` (exact sorted file list, a multi-line ordering regex); both read files through `sourceFiles` and `TEST_FILE` (`apps/extension/scripts/type-roles/source-scan.ts`); neither parses TypeScript | reuse `sourceFiles`; model the guard on both |
| Sealed-root marks | `STORES` (`wallet/storage/stores.ts:183-222`), `networks: sealedCodec(...)` carries `sealed: true` | reuse-as-is for the sealed-root test |
| Log levels | `logDebug` / `logWarn` (`packages/extension-messaging/src/core/base-service.ts:225-235`); policy in `.claude/skills/logging-policy/SKILL.md` | reuse-as-is |

Search trail for the absences: `rg "sealOnRowKeysReady\(|onRowKeysReady|replayRowKeysReady|runSealing\("` over `src` (tests excluded); `rg "(handlers|steps|pipeline|entries): \w+\[\]|satisfies readonly"`; `packages/wallet-core/src/migration/*` read in full for a log call (none).

## The unlock hook today

- `onRowKeysReady` fires once per profile per worker, when the profile's row keys are first derived (`profile/service.ts:247-252`, `:363`); a second unlock, a lock or a switch in the same worker announces nothing. `replayRowKeysReady` fires it again for every held profile once at boot (`wallet/runtime.ts:704-708`). So a failed conversion is retried by the next worker, not the next unlock.
- Subscribers (non-test): `sealOnRowKeysReady` in account, auth-registry, contact, dapp-session, fpc, incoming-transfer, network, operation-journal, token, token-balance and transaction services; `onRowKeysReady.add` in `ui-preference/service.ts:84`, `operation-journal/send-check.ts:85` and `wallet/runtime.ts:694` (the journal reaper).
- Row-value changes at the hook other than the two network ones: `TransactionService.adoptOwnerless` (`transaction/service.ts:200-213`) gives an ownerless legacy row a profile after checking accounts across profiles, then re-arms it; `AccountService` sweeps orphan imported keys (deletes). Neither is a pure function over one root's rows. The account and ui-preference legacy-key folds run inside `sealLegacy`.

## Tests that pin today's behaviour

- `network/service.test.ts:2872-2941` ("a retired default"): the unlock seals first, then moves the endpoint and the name, each row announced once, Mainnet's node kept, another profile's rows untouched; a journal-held network untouched. It reaches `retireDefaults` with a synthetic retired list.
- `network/seeds.test.ts:49-106` (`RETIRED_DEFAULT_ENDPOINTS` against the v0.31.0 recording; `retireDefaultName`'s table) and `network/retired-endpoints.test.ts:23-52`.
- `tests/e2e/update-replay.test.ts`: the recorded mainnet row reads the seed's name after the update (`nameAfterUpdate`, `:~228`, `:395`); endpoint retirement is proven at the unit layer only.
- No test pins the warn texts at `network/service.ts:274,277`.

## Collisions and related records

- #1050 (open): an unlock-time pass for sealed-root **shape** changes the codec cannot read. This lane converts values the codec reads, so it neither closes nor blocks #1050; the list is the place such a pass would join.
- rpc-fallback-1 arc 5 (not built): the relay append, recommended form OA-5 D (append once to a row whose primary is still the seeded default; a deleted relay stays deleted), planned with its once-memory in `SeedOffers` (`nulo:core:network-seeded@<profileId>`, a plaintext root, `network/seed-offers.ts:10`).
- Known limits in the area: #1630 (an endpoint left on the retired default), #1698 (a popup open before the rename), #1053 and #1060 (plaintext rows before an unlock). None changes here.
- `scripts/complexity-baseline/manifest.json` holds no entry for `network/service.ts` or `seal-on-unlock.ts`; `bun run baseline:storage` prints "stored shapes unchanged" when nothing moved. No chaos-model citation names `network/service.ts`.
