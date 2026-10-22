# account-purge-pins-1 recon

Base: `origin/dev` at `c49430a6d`. One Explore agent (sonnet) plus direct reads; every line below was checked against the tree.

## The pins (`apps/extension/src/wallet/services/account/service.test.ts:878-956`)

- `makeHarness` (`:882-901`) seeds a legacy plaintext imported account at `rowKey` and its key row at `keyRowKey`, both natural ids of `("p1", 1, "0xaa")`, after `services.start()`. The profile fake holds real row keys (`ROW_KEY_FAKE`, `:26`).
- `parkRowRead(api)` (`:905-924`) parks the first read of exactly `rowKey` after it returns and resolves `parked`.
- Two `test.each` cases (`:928-941`) and one reconcile case (`:943-955`): park the rename, start the purge, one zero timer (`:936`, `:950`), release, then filter storage for `rowKey`/`keyRowKey` only (`:940`, `:954`). The rename's result is never read.

## The product path

- The rename (`patchAccountField`, `account/service.ts:568-588`) holds `tupleLocks.withLock(rowId)` across its read and its write. Its write is `storage.set` → `SealedEntityStorage.prepare` (`storage/sealed-entity-storage.ts:178-198`): the keyed root seals the row under `nulo:core:accounts@["account","p1",1,"<hmac>"]` and removes the plaintext twin in the same commit. So after any rename, the plaintext key is gone, whatever the purge did.
- Lock sites and the awaits before each: `clearChainState` `:245` after `ensureInitialized` and `liveRows` (`:237-238`); `purgeForProfile` `:956` after `:941-943`; `reconcileImportedAccounts` `:1281` (the keyless check) and `:1291` (the delete) after `:1277-1278`, with the purge subscribers awaited between them (`:1285-1287`).
- `purgeForProfile` ends with a raw pass under `restoreLock` (`:964-990`) that deletes every row at this profile's keys by storage id, sealed included.
- `purgeId` (`sealed-entity-storage.ts:406-409`) removes both forms while the owner's keys are held; `delete` does the same through `prepareDelete` (`:240-250`).

## The lock

- `KeyedLock.withLock` → `Lock.withLock` → `enter()`, which pushes the caller onto the queue inside the `Promise` executor, before any await (`packages/wallet-core/src/utils/keyed-lock.ts:45-47`, `lock.ts:64-67`, `:91-92`). `waiting(key)` is that queue's length (`keyed-lock.ts:50-52`, `lock.ts:44-46`).

## Reuse (the sweep's verdicts)

- **Lock-request observer:** absent. No test wraps a `withLock`; tests drain a lock by calling it (`transaction/service.dropped.test.ts:146`) or poll (`profile/session-manager.test.ts:1152-1158`, `until`). Private locks are read through `as unknown as { … }` casts (`session-manager.test.ts:1188`, `network/service.test.ts:2058`).
- **Root-prefix listing:** inline only, in other describes of the file (`:85`, `:308`, `:348`, `:377`, `:506`, `:565`), each a different shape (count, some, filter). No shared helper.
- **`parkRowRead`:** this file only. account-read-flake-1 (#1089) hoists it to module scope as `parkRowRead(api, rowKey)` (its arc 1 commit `016e5e407`, not yet on `dev`).
- `deferred` is already imported from `@nulo/wallet-core/utils` (`:10`), which also exports `KeyedLock`.
- Unit config: no `testTimeout`, no `retry` (`apps/extension/vitest.config.ts`, `vitest.base.mts`): 5000 ms and 0.

## Issues

- #1091 (open, `bug`): this lane. No closed `known-limit` issue matches "rename purge lock"; the only match for "purge pins sealed" is #1091 itself.
