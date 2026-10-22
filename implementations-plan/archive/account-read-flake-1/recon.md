# account-read-flake-1 recon

Base: `origin/dev` at `6ec79be30`. One Explore agent (sonnet) plus direct reads; every line below was checked against the tree.

## The case (`apps/extension/src/wallet/services/account/service.test.ts:595-652`)

- Seeds a legacy plaintext row at `nulo:core:accounts@${accountRowId("p1", 1, "0xaa")}` after `services.start()` (`:619-620`).
- Wraps `api.storage.local.get` inline (`:626-638`): the first read whose key `includes(rowId)` parks after it returns and stores its resolver in `parked`. No signal says the park was reached.
- Starts `changeAccountName`, waits one `setTimeout(0)` (`:641`), starts `changeAccountVisibility`, waits one more (`:643`), calls `parked?.()` (`:644`), awaits both (`:645`), restores `get` (`:647`) and checks the row reads `name: "B"`, `visible: false` (`:648-650`).

## The product path it bounds

- `patchAccountField` runs the whole read-modify-write under `tupleLocks.withLock(accountRowId(...))` (`account/service.ts:568-588`); `tupleLocks` is a private `KeyedLock({ maxHoldMs: null })` (`:553`).
- The `accounts` root is keyed: `ACCOUNT_LAYOUT.keyed.physicalId` replaces only the address segment with `keyedSegment` (`storage/stores.ts:163-172`). `accountRowId` is `JSON.stringify(["account", p, c, a])` (`account/spec.ts:30-35`), so the sealed key never contains the natural id.
- `SealedEntityStorage.get` (`storage/sealed-entity-storage.ts:150-156`): `requireOwner` (sync), `physicalId` → one `crypto.subtle.sign("HMAC")` (`:449-455`, `packages/wallet-crypto/src/row-seal.ts:85-88`), the sealed read (absent), then the legacy read. The wrapper parks the legacy read: the second `area.get`, after the sign.
- `set` after the edit: `physicalId` (a second sign), `sealRow` (AES-GCM), `legacyAt` (an `area.get` of the legacy key), then `area.set` and `area.remove`.
- `FakeBrowserApi` storage resolves on microtasks only (`packages/wallet-core/src/testing/fake-browser-api.ts:44-71`). The sign is the only step off the main thread before the park.
- `ROW_KEY_FAKE` (`storage/sealed-entity-storage.testing.ts:27-34`) holds real WebCrypto keys, so the sign is the runtime's.

## The lock

- `KeyedLock.withLock` → `Lock.withLock` → `enter()`, which pushes the caller onto the queue inside the `Promise` executor, before any await (`packages/wallet-core/src/utils/keyed-lock.ts:45-47`, `lock.ts:64-67`, `:91-92`). A second editor of a held row is queued synchronously when it is called.
- `KeyedLock.waiting(key)` returns the number queued behind the holder, 0 for an unknown key (`keyed-lock.ts:50-52`, `lock.ts:44-46`). Production reads it (`wallet-sdk/background.ts:756`); tests read it (`wallet-sdk/session-holders.test.ts:32`, `keyed-lock.test.ts:10-14`).

## Reuse

- **`parkRowRead`** (`service.test.ts:904-924`) is the same wrapper with a reached signal (`parked`), scoped to the purge `describe` and closed over its `rowKey`. Three cases use it (`:927-955`). The serialize case is a second copy without the signal.
- `deferred` (`@nulo/wallet-core/utils`) is already imported (`:10`).
- The file already reaches private members through casts (`emit` `:79`, `:705`; `decodeAccountExport` `:701`).

## Other zero-timer waits in the file (checked, none in scope)

| Line | Waits for | Crosses WebCrypto before that point? | Can a correct product go red? |
|---|---|---|---|
| `:96`, `:108` | `createAccount` to capture its fence and park | no: `ensureInitialized`, `assertChainUsable` and the tuple lock resolve on microtasks here (`service.ts:278-280`); `createAccountInternal` captures before its first await (`:345-349`) | no |
| `:727`, `:780` | `importAccount` to capture its fence | no: `ensureInitialized`, `assertChainUsable`, `capture` (`service.ts:729-733`) | no |
| `:830` | the compensation to queue before the rename resumes | either order removes both rows | no |
| `:936`, `:950` | the purge or reconcile to queue on the row lock | no in this harness (a legacy plaintext row: `getAll` decodes without crypto) | no: either order deletes the row. But these pins check only the plaintext keys (`:940`, `:954`), so they miss a row written back sealed: plan D6 |

## Issues

- `gh issue list --state all --search "changeAccountName timer"`: #1089 only (open, `flake`).
- `gh issue list --state closed --label known-limit --search "account serialize"`: none.
