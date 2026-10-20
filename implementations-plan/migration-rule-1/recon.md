# migration-rule-1: recon

Base: `origin/dev` at `60fde7e7`. Three Sonnet explorers (stored-shape inventory; "reinstall" sites and the 0.31.0 diff; the e2e update harness), consolidated and spot-checked by the lead. Paths are relative to `apps/extension/src` unless they start with `apps/`, `packages/`, `scripts/`, `.claude/` or a root file name. `S` = `wallet/services`.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| Row codec at the storage boundary | `EntityStorage(root, area, parse?, opts)` and `ValueStorage(key, area, parse?)` (`packages/wallet-core/src/storage/`); reads keep a failing row and return `undefined` (Entity) or throw (Value) | reuse as is |
| Per-store zod schemas | 18 roots' `*Schema` in `S/*/spec.ts` and repos; raw per-profile repos decode through `decodeRow(Schema)` (`wallet/utils/raw-row.ts`) | reuse; the registry points at them |
| Write→read corpus | `S/storage-codecs.test.ts` (`full`, `minimal`, `drifted` rows for 12 stores) | adapt: its rows become the goldens' first source |
| Source walker | `apps/extension/scripts/type-roles/source-scan.ts` (`sourceFiles`, `PACKAGE_SRC_ROOTS`, throws on an empty root); `source-code.ts` `codeLines` (comments and strings blanked, offsets kept) | reuse as is |
| Closed-world key scan | `utils/profile-ui-keys.scan.test.ts` (scan + registry + fixture self-test), `utils/storage-facade-ban.test.ts`, `wallet/storage/migrations/registry.test.ts` (unregistered-file scan) | reuse the pattern |
| Generator as the only writer + base ratchet | `scripts/complexity-baseline/{generate,check,scan}.ts` and `scripts/ci-cd/complexity-baseline.test.ts` (`ratchetBase`, `readBaseManifest`: PR `base.sha`, shallow fetch, `origin/dev` locally) | adapt: extract the two base readers into one module both tests use |
| Append-only record with an independent test | `packages/aztec-runtime/src/account/address-freeze.ts` + test (hardcodes every entry) | reuse the pattern for frozen stamps |
| Migration run over seeded rows | `registry.test.ts` `memStore` + `runTwice`; the real `Migrator`; `defineRowMapMigration`; `footprint-coverage.test.ts` `SCHEMA_SAMPLES` | reuse as is |
| JSON Schema from zod | none in the repo (searched `toJSONSchema`, `json-schema`, `jsonSchema`); zod 4.4.3 ships `z.toJSONSchema` | build new: one canonical emitter |
| Two builds over one profile | `launchExtension({ userDataDir })` relaunch (`tests/e2e/fixtures/extension.ts:69-136`), `launchBrowser({ extensionPath, userDataDir })` (`fixtures/browser/index.ts:9-24`); no test swaps builds (searched `onInstalled|previousVersion|runtime\.reload|in-place|SHASUMS|gh release download`, `0\.31`) | build new: a harness on `launchBrowser` |
| Release asset fetch + checksum | `.github/workflows/source-rebuild.yml:68-87` and `release.yml:772-777` (exactly one `SHASUMS256.txt` line names the zip) | reuse the pattern |
| Populating a wallet | `fixtures/{extension,accounts,address-book,tokens,networks}.ts`, `helpers/{account-io,stale-network,activity-seeds}.ts`, `connectPlayground` (network suite only) | reuse where the 0.31.0 testids still match |
| Barrier detection | testids `migration-blocked`, `migration-updating`, `migration-degraded`, `account-integrity-blocked`, `stale-network-takeover`; keys `nulo:schema:blocked`, `nulo:core:account-integrity-blocked@*`, `nulo:core:stale-networks@*` | reuse as is |

## Stored-shape inventory (`chrome.storage.local`)

Wire encodings: **json** = a `JSON.stringify` string (EntityStorage, ValueStorage, the raw repos); **structured** = an object or a bare string written as is. The migration engine reads and writes json only (`packages/wallet-core/src/migration/staging.ts:27,56,71`).

- **EntityStorage roots, json, zod codec** (constructed in `S/<x>/service.ts` unless noted): `nulo:core:accounts` (`AccountSchema`), `nulo:core:imported-account-keys`, `nulo:core:auth-registry` (`z.custom` content), `nulo:core:auth-registry-enabled` (`z.boolean()`), `nulo:core:contacts`, `nulo:core:dappSessions` (inline literal `S/dapp-session/service.ts:112`; two `z.custom`; MAC-wrapped), `nulo:core:fpcs`, `nulo:journal` (inline literal `S/operation-journal/service.ts:104`; three `.refine`), `nulo:core:networks` (`NetworkRowSchema`), `nulo:core:tokens`, `nulo:core:token-balances` (`.transform`), `nulo:core:txs` (five `z.custom`), and five `incoming-*` roots in `S/incoming-transfer/repository.ts:37-41` (constants not exported).
- **EntityStorage root, json, no codec:** `nulo:core:profiles` (`S/profile/repository.ts:47`, parse `undefined`; known limit #524).
- **ValueStorage, json, no codec:** `nulo:config` (`wallet/config/store.ts:17`; every prop re-validated by `ConfigSchema.shape[key]`, a bad prop keeps its default), `nulo:core:token-prices` (hand `isValidQuote`), `nulo:core:token-list` (hand `readState`), `nulo:core:token-seeded@<profileId>` (template literal, `S/token/seeder.ts:748`; hand `parseMarkerEntry`).
- **Raw per-profile roots, json, zod via `decodeRow`:** `nulo:core:profile-tombstones`, `nulo:core:restore-pending`, `nulo:core:account-integrity-blocked`, `nulo:core:account-integrity-verified`, `nulo:core:stale-networks`, `nulo:core:network-reset`, `nulo:core:network-reset-done`.
- **Raw, structured, hand guard:** `nulo:core:active-network@<profileId>` (bare string, `S/network/service.ts:1241-1248`), `nulo:legal:accepted` (`packages/legal/src/status.ts:3`, `parseAcceptanceRecord`; the package has no zod), and the UI keys through `utils/storage.ts`: `nulo:ui:activeAccount` (literal at about ten sites), `nulo:ui:lastActiveProfile`, `nulo:ui:loggerWindowId` (built from a prefix in `composables/syncedRef.js:5`), `nulo:onboarding:completed`, and the per-profile families `nulo:ui:{pinnedTokens,feePaymentMethods,sendFeePaymentMethods,restoreOutcome}@<id>` (`utils/profile-ui-keys.ts:8-11`).
- **Engine protocol, structured:** `nulo:schema:{version,running,backup,attempts}` (wallet-core), `nulo:schema:{blocked,degraded,retry-requested}` (`wallet/storage/migrations/index.ts:48-53`), and the read-only legacy marker `nulo:core:storage-version`.
- **Not `storage.local`** (session, `localStorage`, lock, alarm, message, crypto label, file tag, e2e): `nulo:core:session`, `nulo:logs`, `nulo:liveness`, `nulo:incoming:scan-episodes`, `nulo:onboarding:tab-id`, `nulo:legal:dismissed`, `nulo:own-window:*`, `nulo:theme`, `nulo:scope-follow`, `nulo:restoreOutcome@*` (lock), `nulo:journal:gc` and three more alarms, `nulo:open-toolbar-popup`, `nulo:full-backup:v2:`, `nulo:kdf:*` and the other domain separators, `nulo:e2e:*`, `nulo:third-party-notices*`.

`z.toJSONSchema` on zod 4.4.3 (probed in memory): `z.custom`, `z.bigint`, `z.date` throw; `.transform` throws in output mode and emits its input side with `io: "input"`; `.refine` and `.superRefine` are dropped silently; `.default` is optional in input mode; a native TS enum loses its member names; `.brand` is erased.

## The 0.31.0 → HEAD diff (126 commits since `v0.31.0` = `08856c26`)

No root, key, `BASELINE_VERSION` (1), `CURRENT_COMPAT_EPOCH` (5) or `PXE_DATA_SCHEMA_VERSION_PIN` (16) changed. Per #865's list:
1. **#692 re-key** (`b704c0fd`): received-note rows keyed by `uniqueNoteHash` instead of `siloedNullifier`. Old rows parse (zod strips the field) but sit under the old key; an unspent one shows twice. Decided by the owner as #689 A ("no migration; reinstall"). The Testnet reset purges these rows per chain (`S/incoming-transfer/service.ts:441`).
2. **Journal `call`** (`8d9ff149`, #826): `.optional()`; old rows parse.
3. **Token-list `flagged`** (`afcfd710`, `66f34e36`): the snapshot is not stored; the stored envelope is the signed list text. A 0.31.0 envelope below the new compiled floor (`packages/token-list/src/index.ts:56`) is discarded at load and refetched.
4. **"Two reset-journal fields": does not hold.** `imported` and `heldImported` are on `StaleNetworkView.reset` (`S/network-reset/spec.ts`), an RPC view; the stored `ResetJournalSchema` (`S/stale-network/types.ts`) has no commit since `v0.31.0`.
5. **Passkey backup MAC** (`f6bd011a`, #598): a passkey body without `backup-mac` is refused before any passkey prompt at `composables/useFullBackupImport.ts:192` with `INCOMPATIBLE_BACKUP` ("Incompatible backup" / "This backup was created by an incompatible wallet version and cannot be imported. Re-export a backup from a current version of the wallet."), not with "integrity failed" (that copy, `composables/full-backup-restore.ts:224-229`, follows a bad checksum or a MAC the passkey does not reproduce). An encrypted file reaches the same check after its password decrypt, still before any passkey prompt. Rendered by `components/composite/import/ImportFullBackupForm.vue:82-98` (testid `import-full-backup-error`) on `popup/pages/import.vue`, `onboarding/pages/import.vue`, `popup/pages/restore-again.vue`.

Also changed, all tolerant: `showPopupFullscreen` dropped from `ConfigSchema` (ignored on load); `setTrustedVerification` removed with its field kept; backup slice row caps; `NetworkRowSchema` refactor with the same fields.

## "Reinstall" sites (#865's list, verified)

| Site | Today | Reachable on a released install? |
|---|---|---|
| `S/account/service.ts:166-182` `liveRows` | ignores rows under a pre-composite key; comment cites pre-production | composite keys since `a6c2fb5b` (2026-10-08, after `v0.30.2`); a 0.30.2 row was already ignored at the 0.31.0 update |
| `S/network/spec.ts:64-68` required `l1ChainId` | a row without it fails the codec | required since the starting commit; no released row lacks it |
| `S/profile/service.ts:1496-1503` pxe-generation fence | throws "…reinstall the extension (pre-production, no migration)"; pinned in `utils/copy-dash-ban.test.ts:83` | `pxeGeneration` written since the starting commit; unreachable on any released profile |
| `packages/aztec-runtime/src/pxe/opfs-store.ts:21,200` | a moved PXE schema pin refuses the store; "pre-production remediation = profile purge"; `opfs-store.test.ts` pins the pin to upstream | reachable on any Aztec bump that moves upstream's schema on a chain that does not reset |
| `packages/wallet-core/src/migration/migrator.ts:230-241` | legacy `nulo:core:storage-version` → non-retryable `needs-recovery`, reason "…reinstall for a clean dev state" (shown as the barrier's detail) | only on a forked-app install |
| `components/MigrationBarrier.vue:21-33` | terminal copy ends "Reinstall the extension to start clean." (P38-10 B; pinned in its test) | reachable once a real migration fails terminally |
| `packages/wallet-crypto/ATTACK-SURFACE.md:120-125` (#709) | "Accepted while the wallet has no production users" | the known limit's reopening condition is the first production user |

Missed by #865: the self-contradiction in `ARCHITECTURE.md` § 5 (`:108` vs `:119`) and its stale "bad rows are … deleted" (`EntityStorage` keeps them) and `:237` (a migration that no longer exists); `.claude/skills/aztec-update/SKILL.md:170`'s parenthetical; `packages/aztec-runtime/src/account/address-freeze.ts:12-26` and its test (the V5 reuse line); `S/backup/README.md:20` (retired slices). Not reinstall-reliant: `S/dapp-session/mac-storage.ts:13` (every released session row carries a MAC), `popup/pages/settings/security/reset.vue:104-106`.

## Testnet reset path

`classifyChains` (`S/stale-network/classify.ts`) flags a seeded row whose stored `chainId` differs from the build's seed; the takeover then offers `NetworkResetService`, which purges per chain: accounts and imported keys, tokens and balances, FPCs, authwits, incoming-transfer rows, the journal by network, transactions of the chain's accounts, dApp sessions, the chain's PXE store; it keeps the network row (re-keyed), re-creates accounts with names, indexes and visibility, re-seeds default tokens. Never touched: profiles, contacts, config, the token-list envelope, legal acceptance, `nulo:schema:*`. Testnet's identity is unchanged between `v0.31.0` and HEAD (`utils/chain-ids.ts:24-31`), so today a 0.31.0 install gets no takeover; the 6.0.0 bump moves it.

## Update-harness facts

- Chrome derives an unpacked build's id from its path (no manifest `key` outside development, `apps/extension/manifest/manifest.chrome.config.ts:132-148`): both builds must load from one path in turn. Firefox's id is `wallet@nulo.sh`; its `moz-extension` UUID lives in the profile's `prefs.js` and survives a reused profile; a temporary re-install with other bytes over the same id is untested.
- Every SW boot runs the migration gate, the engine, then the integrity coordinator, which re-derives every account unless the stamp's `walletVersion` (`__VERSION__` = `package.json` version, `apps/extension/vite.shared.ts:54`) and account digest match (`S/account-integrity/coordinator.ts:84-125`). Dev is at 0.31.0, the release's version, so a candidate built from dev skips that re-check unless its version differs.
- The release zips are production builds: no e2e stamps; Local Network's RPC is baked as `http://localhost:8080`; the smoke setup's armed-build assert needs `NULO_E2E_ARTIFACT_RUN=1` or a setup of its own. Adding a network or a token, a connected dApp and received history need the node and the playground: the network suite (`bun run e2e:agent`).
- `chrome.runtime.reload()` disables an unpacked build on Chrome; the harness relaunches the browser instead (`tests/e2e/migration.test.ts:138-149`).
- CI: `contents: read` downloads a published release's assets from this public repo; `scripts/ci-cd/behavior-gating.test.ts` pins workflow path filters.

## Collisions

`tx-record-1` A2 adds `Tx.feeChoice` (`.optional().catch(undefined)`) to `S/transaction/spec.ts`: through the registry, it re-stamps the snapshot before the freeze and is additive after it. `harden-security-fixes-3` (PXE scope, tagging) may touch `incoming-*` and dApp-session schemas. The 6.0.0 bump lane may move `PXE_DATA_SCHEMA_VERSION_PIN` and Testnet's identity.
