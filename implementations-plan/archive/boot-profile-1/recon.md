# boot-profile-1: recon

Base: `origin/dev` at `51ea220b1`. Two Sonnet explorers plus a direct read of the deletion, restore and dispatch code. Every line both issues cite holds at the base.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| Re-read one tombstone under the facade lock | `TombstoneRepository.get(id)` (`profile/tombstone-repository.ts:58`) | considered, not used: beside a take-once work list nothing else clears an inherited tombstone (plan D1) |
| Tombstone identity | `epoch` + `pxeGeneration` on `TombstoneSchema` (`:15-25`); `clearIfSame(id, epoch)` compares the epoch (`:66-71`) | reuse as is; no shape change |
| Incarnation proof on a row | `Profile.pxeGeneration`, minted fresh at every row creation, a same-id restore included (`profile/spec.ts:66-71`); the torn-import guard compares it (`service.ts:1696-1707`) | reuse the comparison |
| Boot-time tombstone list | `init` reads `validPayloads()` to hydrate epochs (`service.ts:626-628`); the resume reads it again (`:1915`) | adapt: `init` keeps its read as the resume's work list (plan D1) |
| Deletion epoch per profile | `ProfileDeletionState` (`profile/profile-deletion-state.ts`); `beginDeletion` only grows it within a worker lifetime | reuse as is |
| Purge single-flight | `ProfileDeletionCoordinator.runFor` (`profile-deletion/coordinator.ts:111-117`): joins an in-flight purge of the same id; the entry leaves when that purge ends | unchanged |
| Event dispatch | `EventHandler` (`packages/wallet-core/src/utils/event-handler.ts`), the one emitter class; the popup's service clients and the worker's services both use it | change `invoke` only |
| Boot-resume test harness | `service.integration.test.ts`: `makeService`, `makeServiceFromExistingApi` (a worker restart over one `FakeBrowserApi`), `purgingDelegate(api, gate)`, `restoreSecretFor(n)`; closest shape `:2352-2372` | reuse |
| Stale-network composition harness | `network-reset/service.composition.test.ts`: the real reset graph, `settled`, `startReset`, `twoChains`, `seedChain(h, id, chainId, l1, n)` | reuse; one never-opened variant |
| Chaos model | `tests/e2e/helpers/profile-chaos/model.ts`: no action leaves a tombstone pending across a restart | not extended (plan D5) |

## #1430 trace (holds)

- `resumeTombstonedDeletions` loops over one `validPayloads()` read (`service.ts:1915`). Phase 1 deletes any row under the id with no tombstone re-read (`:1919-1928`), then purges (`:1930`) and clears (`:1936`).
- A live `deleteProfile` started before that read owns the same tombstone. It clears it and releases the id at `:1868`. A restore that keeps the backup's id refuses only a stored or reserved id (`:2494-2497`), so it can take the freed id. The resume then reaches the stale entry and erases the restored row, its session and its data.
- The coordinator's single-flight entry leaves when a purge ends (`coordinator.ts:114`), so a later `runFor` for the id starts a new purge.
- Nothing else clears a tombstone that existed at boot: `deleteProfile` and the torn-import reap (through `deleteProfile`) refuse a reserved id (`service.ts:1813`); restore and create skip one (`:2495`, `:1683`).

## #1433 trace (holds)

- `remove` splices the array `invoke` iterates with `for … of` (`event-handler.ts:40-48`): a self-removing subscriber makes the next one be skipped; a subscriber added during dispatch receives the event in flight.
- The popup's `managers.networkReset` is one `NetworkResetServiceClient` (`utils/core.ts:106,121`) with one client-side `EventHandler` (`network-reset/client.ts:19`), invoked from `base-client.ts:253`.
- `settleActiveNetwork` (`useProfileBootstrap.ts:113-117`) and the switch watcher (`app.vue:296-302` → `network-switch.ts:107-111`) can both call `runUnattended` for one never-opened stale network; the worker joins the second call to the running flight (`network-reset/service.ts:264-268`), so one completion event serves both waiters. The first `settle` removes its `onChanged` (`useStaleNetwork.ts:56-60`) and the second waiter is skipped, never reaching `finally` (`:86-90`); `running` (`:169`) stays set and `isLogined` is never set (`useProfileBootstrap.ts:262-272`).
- Other self-removal during dispatch: none found besides `runResetToEnd`; no add-during-dispatch site found. `operation-journal/client.ts` and `profile/client.ts` return unsubscribe functions guarded by `unsubscribed` flags.
- `background/service.ts` `sendEvent` iterates `this.clients` while `dropClient` splices it, but `dropClient` runs from `onDisconnect`, an asynchronous port event, never inside the loop: no path.

## Known limits searched

`gh issue list --state closed --label known-limit` for "tombstone", "deletion" and "event handler": #1199, #843 and #458 border the area; none covers these two paths.
