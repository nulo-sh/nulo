# w3-storage-1 recon

Base `origin/dev` at `2575c86c4`. Two Sonnet Explore agents (a reuse sweep, an error-path mapper) plus the planner's own reading. Paths are under `apps/extension/src/` unless they name a package.

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| Tell a failed storage read from a value that does not decode | Nothing. `ValueStorage.get` (`packages/wallet-core/src/storage/value-storage.ts:29-36`) lets an `area.get` rejection out raw and throws an untyped `SyntaxError` or codec error on decode; no caller inspects the error type. Searched `Undecodable`, `Corrupt`, `DecodeError`, `ReadFailed`, `StorageReadError`, `instanceof SyntaxError` over `packages/` and `apps/`. | build new: one typed error in `ValueStorage` |
| Same for the seeder's sealed marker root | `SealedEntityStorage.get` (`wallet/storage/sealed-entity-storage.ts:168`, `readKey` `:517`, `decode`, `refuse`) already reads an undecodable, MAC-refused or foreign row as `undefined`; only `area.get` rejects. `decodeSeedMarkers` resets a bad shape. | reuse as is: drop the seeder's catch |
| Persist first, then change memory | `config/store.ts:62-65` (`set`); `execution/execution-coordinator.ts:79` | adapt: the poller builds a copy and commits it |
| Fault injection | No shared helper. `vi.spyOn(api.storage.local, "set"\|"get")` (`token/seeder.test.ts:374`, `token/seeder.list.test.ts:62-75` `holdNextMarkerRead`); `config/store.test.ts:117` `failingStorage` (add a read counter) | reuse as is |
| Logger ring merge, renumber, drop the imported entries | `CircularBuffer` (`wallet/logger/utils.ts:9-50`) has `items`, `add`, `resize` (keeps the newest), `clear`; nothing else | adapt inside `LoggerStore`; no buffer API change |

## Facts the plan rests on

- **#1462.** `applyReceipt` and `clearInclusion` (`transaction/service.ts:745-759`) assign fields only (`block` is replaced, never mutated), so a shallow copy is a complete copy. `commit` (`:654-671`) unwatches the key and re-files the object it was given. `waitForTx` (`:351-380`) polls `this.pending.has(key)`, not an object.
- **#1463.** No chain-purge subscriber reads the stale-network state: `account.clearChainState` (`account/service.ts:258`) has no `assertChainUsable`; token, FPC, auth-registry, operation-journal and incoming-transfer purges read none (`isChainQuarantined` callers: `incoming-transfer/service.ts:431` in a reader, `token/service.ts:207` in the seeder's account read).
- **#1464.** `config.load()` runs in the boot's `Promise.all` (`wallet/runtime.ts:489-492`); a rejection vetoes the boot with `retrySafe` still true, and only the alarm shim re-runs `start()` in that lifetime (`wallet/index.ts:103`). A failed `ConfigStore.set` already reaches a toast (`composables/useSettingUpdate.ts:37-40`, `popup/pages/settings/display.vue:66-73`). `TokenListService.start` awaits `loadStored` (`token-list/service.ts:112-117`); a throw there fails the service phase (`packages/wallet-core/src/base/index.ts:69-95`) after `retrySafe` is false (`wallet/runtime.ts:275`), so the start must not throw on a read. The token-list alarm is one-shot (`dispatcher.create({ when })`).
- **Seeder readers on a throwing read:** `markDeletedByUser` runs before the row delete (`token/service.ts:724`), so a delete is refused, not half done; `onChainPurged` (`token/service.ts:300`) makes `purgeChain` reject (`network/service.ts:1218-1240`); a pass catches it in `run()` (`seeder.ts:236-246`), clears `inflight`, `attempting` and the retry reservation, and re-arms at the longest delay; `statusFor` reaches `getSeedStatus`, which the popup swallows (`composables/useSeedStatus.ts:70`, `:96`); `verifiedSeeds` reaches `requestCapabilities` uncaught (`dapp-interaction/service.ts:618`).
- **#1465.** Boot: `wallet/index.ts:78` logs "Runtime configured" (id 1) and the console hijack (`:56-61`) logs before `rehydrate()` resolves (`:116-127`). The alarm shim (`:103-111`) can call `runtime.start()` before then, so `applyRetentionPolicy` can run before the import (narrow). `LogViewerService` forwards each line with its id (`services/log-viewer/service.ts:21`, `:34-35`); `LogsViewer.vue:151` deep-links to the first line with an id; paging asks for `id > last` in buffer order (`:209-211`, `logger/utils.ts:53-66`).

## Collisions and out of scope

- `price/service.ts:316-322` (`readUsable`) and `:461-477` (`mergeMonotonic`) treat a failed read as empty; `mergeMonotonic` then writes the merge. The price cache is refetched on its period alarm, so a dropped quote comes back at the next refresh. Not in this lane; the plan's close-out files it as a closed `known-limit` issue.
- `profile/session-manager.ts:581`, `storage/stored-shapes/baseline.ts:163-168` swallow read errors but write nothing built from them on that path; not touched.
- No open issue collides; #512 (closed known-limit) concerns scam flags and a failed fiat read.
