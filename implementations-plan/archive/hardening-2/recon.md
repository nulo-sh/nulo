# Recon: hardening-2

Read on `origin/dev` at `f5ca160` (PR #50 and PR #51 included). Three read-only explorers (one reuse sweep, two subsystem maps), each claim then re-checked by hand against the tree and the installed `@aztec-labs/*` 6.0.0-rc.1 sources. Paths are repo-relative; `NM(<pkg>)` is the installed package under `node_modules/.bun/@aztec-labs+<pkg>@6.0.0-rc.1+<hash>/node_modules/@aztec-labs/<pkg>`.

## Reuse map

| Capability needed | Existing code found | Verdict |
|---|---|---|
| Parse a dApp call against `WalletSchema` | `WalletSchema` (`@aztec-labs/aztec.js/wallet`), `parseWithOptionals` / `getSchemaParameters` / `schemaHasMethod` (`@aztec-labs/foundation/schemas`). Upstream's iframe wallet handler is the reference use: `NM(wallet-sdk)/src/iframe/handlers/iframe_connection_handler.ts:301-304`. The Nulo patch: `packages/wallet-sdk-schema-patch/src/{apply,register}.ts` | **reuse-as-is** (upstream helpers); one new wallet-bridge module calls them |
| Arity guards and the guard ladder | `METHOD_REGISTRY[*].argSchema` (`packages/wallet-bridge/src/method-descriptors.ts:79-150`), `assertAuthRelevantArgShape` (`dispatcher.ts:200-251`), `enforceMethodAndScope` (`dispatcher.ts:302-352`) | **adapt**: the ladder gains one awaited step; `assertAuthRelevantArgShape` is subsumed |
| Generic dApp-facing refusal text | `Invalid arguments for wallet method: <name>` (`dispatcher.ts:331`), a plain `Error`; `toWalletResponseError` flattens every unclassified throw to `UNCLASSIFIED_ERROR_MESSAGE` = "The wallet could not process the request." (`apps/extension/src/wallet/services/wallet-sdk/error-envelope.ts`) | **reuse-as-is** |
| Batch popup-leg refusal | `BATCH_REFUSED_METHODS` prescan in `handleBatch` (`dispatcher.ts:515-527`), derived from `refusedInBatch` | **adapt**: runs before the schema parse so its message wins |
| Class-id verification | `verifyArtifactClassId` / `assertArtifactClassId` (`packages/aztec-runtime/src/pxe/artifact-class-id.ts`), `ArtifactRegistry.verifiedClassIds` (`artifact-registry.ts:35-43`, `:141-153`) | **reuse-as-is**; only a comment and a tripwire test change |
| Upstream-source tripwire tests | `crs-cache.sources.test.ts`, `handshake-delivery.sources.test.ts`, `stale-anchor.sources.test.ts` (`packages/aztec-runtime/src/pxe/`), using `resolvePackageRoot` from `@nulo/resolve-asset` | **reuse-as-is** (same pattern) |
| Deletion fences | `ProfileDeletionState` (`profile/profile-deletion-state.ts`), `restore-fence.ts`, `persistToken`'s assert → set → `isCurrent` → compensate (`token/service.ts:340-424`), `profileDeletedError` | **reuse-as-is** (only for the fence alternative of D-18a) |
| Balance-row deletion fence | `invalidatedBalanceIds` + `invalidateAndDelete` (`token-balance/service.ts:85-97`), the sync fence ladder in `applyProjectedOk` (`balance-job-queue.ts:342-390`) | **reuse-as-is** (already closes the writer; a scenario test proves it) |
| Race harness for "write lands after purge" | `recordWrites(area, prefix, afterSet?)` (`apps/extension/src/wallet/services/storage-write-log.ts`), the parked-projector pattern in `balance-job-queue.test.ts:396` | **reuse-as-is** |
| Journal validation | `isValidRef` / `isValidBackup` (`packages/wallet-core/src/migration/migrator.ts:67-95`), `guardCommit`'s footprint predicate (`:288-298`), `footprintKeysFor` (`:434`) | **adapt**: one footprint-match check before `restore()` |
| Tombstone reservation | `TombstoneRepository` raw-key reservation (`profile/tombstone-repository.ts`), `ProfileDeletionState.release` | **adapt**: `clearIfSame` reports whether the raw key is gone |
| CSP pin and console capture | `apps/extension/src/manifest.test.ts` (imports both manifests; no CSP pin today); `ctx.consoleErrors` / `ctx.pageErrors` in `apps/extension/tests/e2e/fixtures/extension.ts:230-255` (pages opened by the fixture only); `BrowserDriver` in `tests/e2e/fixtures/browser/` | **adapt**: pin the CSP; extend capture to the offscreen document and the background |
| A general `isLive` gate for writers | none — searched `isLive`, `isFenceLive`, `liveness`, `assertLive` under `apps/extension/src/wallet/services`; only `ProfileService.isFenceLive(fence)` (session-scoped) exists | **not built** (see D-18c) |

## Facts by issue

### #16 — dispatcher arg validation

- Nothing on the extension path parses args against `WalletSchema`. Ingress: content script → `validateContentScriptMessage` (envelope only) → `BackgroundConnectionHandler` decrypts → `onWalletMessage` (`background.ts:480`) → `handleWalletMessage` → `dispatcher.dispatch(message.type, message.args, …)` (`background.ts:1301`). The SDK's extension handler does not parse (`NM(wallet-sdk)/src/extension/handlers/background_connection_handler.ts:359-360`).
- The dApp side serializes with `jsonStringify` then encrypts (`NM(wallet-sdk)/src/extension/provider/extension_wallet.ts:252`); the iframe transport does the same (`iframe/provider/iframe_wallet.ts:214`) and upstream's iframe handler then parses those exact bytes with the schema. So stock-SDK traffic passes a full parse by upstream construction.
- `wallet-bridge` already depends on `@aztec-labs/aztec.js`, `foundation`, `stdlib`, `wallet-sdk` (`packages/wallet-bridge/package.json`); `@nulo/wallet-sdk-schema-patch` is a devDependency only. Biome forbids the bridge only `@nulo/aztec-runtime` and `@nulo/extension` (`biome.json:322-340`). The dispatcher comment "does NOT import `WalletSchema`" is a choice, not a constraint.
- `WalletSchema` = 15 upstream methods + `batch` + 4 patched (`registerToken`, `isTokenRegistered`, `grantPublicAuthwit`, `getWalletFeatures`) = 20, exactly the 20 registry rows (`method-descriptors.test.ts:208` pins the equality).
- Each entry is a zod-4 `z.function({ input: z.tuple([...]), output })`. Parsing transforms (`hexSchemaFor(...).transform(fromString)`, `NM(foundation)/src/schemas/utils.ts:59-63`), so a dispatcher parse can only be a pass/fail predicate; the handlers keep reading the wire args.
- Probe run (`bun -e` in `packages/wallet-bridge`, patch registered): extra trailing args → `too_big`; `requestCapabilities(null)` → refused (today accepted, pinned at `dispatcher.test.ts:3122`); `registerSender(addr, null)` → accepted (`optional()` is `nullish().transform`, `utils.ts:39-41`); a `batch` leg naming a patched method → refused (`BatchedMethodSchema` is built from the upstream methods only, `NM(aztec.js)/src/wallet/wallet.ts:625-667`); `grantPublicAuthwit` with a numeric `caller` → refused.
- `requestCapabilities`' `AppCapabilitiesSchema` holds `capabilities: z.array(CapabilitySchema)`, a discriminated union of the six known types (`wallet.ts:502-529`). The connect window renders unknown types as one "unknown" row with its own copy (`apps/extension/src/popup/windows/capabilities/build-items.ts:83-96`, `CapabilityDetailPanel.test.ts:148`). A full parse would refuse such a manifest before the window opens.
- Test surface: 148 `dispatch("…")` calls across `packages/wallet-bridge/src/*.test.ts` and `apps/extension/src/**/*.test.ts`; four files construct a dispatcher (`dispatcher.test.ts`, `dapp-grant.characterization.test.ts`, `account-order.characterization.test.ts`, `background.refusal-log.test.ts`).
- `dispatcher.test.ts:3080-3084` pins that an ungranted `simulateTx` with empty args gets `CapabilityNotGrantedError`, not an argument error.

### #26 — verified-artifact cache

- `ArtifactRegistry` is built once per `PxeService` (`packages/aztec-runtime/src/pxe/service.ts:200`); `getContractArtifact` resolves through it against whichever chain's PXE `withPxeRead` hands over (`service.ts:380-385`).
- `NM(pxe)/src/storage/contract_store/contract_store.ts:137-165`: `addContractArtifact(contract, preimage?)` keys the artifact by `(preimage ?? await getContractClassFromArtifact(contract)).id`. Its in-memory cache makes the first write win per process; after a restart a same-key write overwrites the stored bytes (`:163`).
- Every production caller passes no preimage: `pxe.ts:468` (protocol contracts) and `pxe.ts:925` (`registerContractClass`). Only upstream's own backwards-compatibility tests pass one (`schema_tests.ts:188-204`).
- Nulo writes artifacts only through `pxe.registerContractClass` (`aztec-runtime/src/pxe/service.ts:445-476`, `:616`); the dApp path asserts the class id first (`execution/service.ts:854`, `:998`).
- The class id commits to the private and utility function trees and to `{name, outputs}` only (`NM(stdlib)/src/contract/artifact_hash.ts:45-69`). Two artifacts can share a class id and differ in fields it does not commit to; a recompute accepts both.

### #18 — deferred writers

- `updateToken` (`token/service.ts:526-594`) has no caller: a grep over `apps/` and `packages/` (`.ts`, `.vue`, `.js`, e2e included) finds only its RPC registration (`service.ts:82`, `client.ts:31`, `spec.ts:202`), its tests (`service.test.ts`) and a comment (`balance-identity.ts:7`).
- `updateToken` holds the token `Lock`, whose watchdog force-releases after 5 minutes (`packages/wallet-core/src/utils/lock.ts:5`); a displaced holder keeps running. `purgeForProfile` takes the same lock (`token/service.ts:816-840`). `updateToken` takes no deletion epoch.
- The balance commit runs `isBalanceInvalidated` → `isRowEmittable` → generation, then `repo.set` with no await between (`balance-job-queue.ts:361-378`). `BalanceRepository.set` → `EntityStorage.set` → `storage.set(...)` is dispatched synchronously in that same tick (`balance-repository.ts:45-47`, `packages/wallet-core/src/storage/entity_storage.ts:189-191`).
- The profile-deletion purge reaches balances through `purgeForTokens` (coordinator purge step 3), which deletes every scoped row through `invalidateAndDelete`: fence first, then the awaited delete (`token-balance/service.ts:92-97`, `:530-556`). Queue-level pins exist (`balance-job-queue.test.ts:396`, `:422`); no test drives the deletion purge against an in-flight projection.

### #19 — journal and tombstone

- `resumeIfInterrupted` checks the marker and `1 <= backup.version <= maxVersion` (`migrator.ts:336`), then `restore()` writes every non-reserved `entries` key and removes every footprint key of the journal's own `refs` (`:390-401`). Nothing compares `refs` or `entries` with the registered migration.
- With `BASELINE_VERSION = 1` and `realMigrations = []` (`apps/extension/src/wallet/storage/migrations/index.ts:19`, `:26`), a journal at version 1 passes the range check while no migration 1 exists.
- Hand-built journals in `migrator.test.ts` (`:284-305`) pair refs with a `noop` migration that declares no footprint; they will need matching footprints.
- `deleteProfile` phase 3 and the resume path both run `clearIfSame` then `release` unconditionally (`profile/service.ts:1517-1520`, `:1587-1590`); `clearIfSame` removes only a row that decodes with the same epoch (`tombstone-repository.ts:59-62`).

### #23 — CSP

- Policy today: `script-src 'self' 'wasm-unsafe-eval'; img-src 'self' data: blob:` (`apps/extension/manifest/manifest.config.ts:47-49`); Firefox inherits it (`manifest.firefox.config.ts` spreads the base). No test pins it.
- Pages load only external scripts (`src/{popup,onboarding,offscreen,setup}/index.html`); none has an inline `<style>` or `style=`.
- Connect targets: user RPC URLs limited to `https:` or `http://localhost|127.0.0.1|[::1]` (`network/spec.ts:161`), Presto `127.0.0.1:59833` (http) and `:59834` (https) (`src/presto/config.ts`), `https://api.coingecko.com` (`price/service.ts:31`). No `new Worker`, `SharedWorker` or worker `createObjectURL` in `src`; `utils/files.ts:60` makes a download URL only.
- Fonts: four `@font-face` rules over `./fonts/*.woff2` in `packages/design/src/base.css:12-43`.
- Console capture covers fixture-opened pages only, not the offscreen document or the background (`fixtures/extension.ts:238-252` documents the blind spot).
- The archived record of the first floor attempt names only the `img-src` addition (`implementations-plan/archive/harden-findings-remediation/plan.md:33`); no record says what broke.

## Collision and dedup risks

1. Three hand-written shape layers (`argSchema`, `assertAuthRelevantArgShape`, the scope checkers) already mirror the schema; the plan deletes the one the parse subsumes and keeps the other two as the second line.
2. A pre-dispatch parse in `background.ts` would miss batch legs, which re-enter `dispatch()`; the parse goes inside the dispatcher.
3. `ValidationError` exists but means popup-RPC validation; reusing it for the dApp boundary would blur two meanings. The plan keeps the plain `Error` and existing text.
4. The token seeder's purge epoch and the popup's `scope-epoch` are unrelated to `ProfileDeletionState`.
5. `isValidRef` / `isValidBackup` are private; a second copy in a test would drift.
6. Firefox inherits the base CSP: edit only `manifest.config.ts`.
7. PR #48 (`worktree-security-fixes-1`) edits `dispatcher.ts`, `method-descriptors.ts`, `capability-negotiation.ts`, `README.md` and `dispatcher.test.ts` in `packages/wallet-bridge`; its arc 2 edits `profile/service.ts` and adds `pxe/artifact-class-id.test.ts`.
