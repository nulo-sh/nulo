# quality-services-1: recon

Base `origin/dev` at `93b9a2dfb`. Two Sonnet explorers plus the planner's own reads. Paths are under `apps/extension/src/` unless they name a package. The issues cite commit `51ea220`; line numbers below are at the base.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| Subscribe to unlock, run a best-effort task, warn on failure | none shared: 12 hand-written shells (table below). `NetworkService.registerChainPurgeSubscriber` (`wallet/services/network/service.ts:1247`) is a method on its owner, not a free helper. Searched `sealLegacy`, `onRowKeysReady`, `rowKeysReady` under `wallet/services` | build new: `wallet/services/seal-on-unlock.ts` |
| Event source | `ProfileService.onRowKeysReady: EventHandler<string>` (`profile/service.ts:286`); `EventHandler.invoke` runs callbacks synchronously and drops a returned promise (`packages/wallet-core/src/utils/event-handler.ts:16`) | reuse as is |
| Warn through the service logger | `Service.logWarn(...data)` (`packages/extension-messaging/src/core/base-service.ts:233`); incoming-transfer already passes `warn: (...data) => this.logWarn(...data)` | reuse as is |
| Deletion-fenced create | none shared. `restore-fence.ts` holds the restore-only capture and assert; `purge-rows.ts` holds purge order. Searched `profileDeletedError`, `assertCurrent`, `isCurrent(` | build new: `wallet/services/create-fence.ts` |
| Deletion state and error | `ProfileDeletionState` (`profile/profile-deletion-state.ts:25`, `assertCurrent` `:73`, `isCurrent` `:80`), `profileDeletedError` (`:21`), `ExecutionFence` (`:18`) | reuse as is |
| Prepared sealed write | `PreparedWrite` (`wallet/storage/sealed-entity-storage.ts:62`) | reuse as is |
| Account-scope key | `accountScopeKey`, `AccountScope` (`wallet/services/account/spec.ts:56-61`) | adapt: add the matcher beside it |
| Set then remove | private `commitWithRemovals` (`sealed-entity-storage.ts:470`) | adapt: lift to module level |
| Options object for optional seams | `TokenListServiceOptions` (`token-list/service.ts:50-56`, defaults by `??` at `:106-109`, built at `runtime.ts:558`) | reuse the pattern |
| Owned writer of a registry slot | `initTransactionService` (`utils/core.ts:206-213`) | adapt: the same for network and account |

## #1436, sealing shells at the base

All subscribe as `<profiles>.onRowKeysReady.add((profileId) => void this.<handler>(profileId))`; every message ends `; the next worker retries`.

| Service | Subscribe | Handler and body | Message noun |
|---|---|---|---|
| account | `:214` | `onRowKeysReady` `:220`: seal (tuple locks, companions), then the orphan-key sweep | "converting or sweeping the profile's accounts failed" (pinned, `account/service.test.ts:597`) |
| auth-registry | `:153` | `sealLegacyRows` `:157`: authwits, then statuses, one boundary | "...plaintext authorizations failed" |
| contact | `:66` | `:71`, `this.lock` | contacts |
| dapp-session | `:123` | `:128`: sessions, then `registrations.sealLegacy`, one boundary | dApp sessions |
| fpc | `:82` | `:87`, `this.lock` | fee payers |
| incoming-transfer | `:405` | `:347`, `withServiceLock`, skip while a deleter runs | incoming rows |
| network | `:257` | `:264`, `this.lock` | networks |
| operation-journal | `:175`, `this.profileService?.` (nullable) | `:180`, `transitionLock` | journal |
| token-balance | `:164` | `:196`, `repo.sealLegacy` with an invalidated-id skip | balances |
| token | `:194` | `:236`: sweep-epoch guard, then the seeder marker | tokens |
| transaction | `:160` | `onRowKeysReady` `:180`: capture epoch, seal, adopt, arm | "sealing or arming the profile's transactions failed" |
| ui-preference | `:83` | `:86`: one boundary per store, in sequence | "sealing a plaintext preference failed" |

`operation-journal/send-check.ts:85` and `wallet/runtime.ts:696` subscribe but do not seal. Private calls through casts: `auth-registry/service.test.ts:474`, `token/service.test.ts:1493`, both success paths.

## #1441, fenced creates at the base

| Site | Between the steps |
|---|---|
| `network/service.ts:403-409` `seedOneNetworkLocked` | nothing; returns |
| `network/service.ts:585-592` `addNetwork` | nothing; emit after the re-check |
| `contact/service.ts:130-141` `addContact` | `assertStillLive(runFence)` between assert and commit; emit after |
| `dapp-session/service.ts:249-257` | nothing; emit after |
| `fpc/service.ts:250-268` `writeFencedRow` | epoch and session check before and after `prepare`; `await isNetworkLive` between `prepare` and the second check; no emit (the caller emits after decorating) |

Not instances: token's `persistToken` (`:513-532`) and `finishAdd` (`:559-567`, the issue comment's variant) delete only under an owned ticket; account re-reads under the tuple lock; network's seed-offer write (`:340-352`) restores the prior record. The same-turn emit rule is stated at `account/service.ts:841-842`. Inline fence types: network `:305-306, :343-344, :391-392, :419-420, :752-753`; fpc `:43, :179`. Compensation tests: `network/service.test.ts:136-171`, `contact/service.test.ts:533`, `dapp-session/service.test.ts:205`, `fpc/service-create.test.ts:458, :505`.

## #1447 at the base

- The matchers are character-identical apart from parameter names: `auth-registry/service.ts:666-678` (row, raw, and a status predicate identical to row on `{ profileId, chainId, account }`), `token-balance/service.ts:609-623` (row, raw). The tuple rule is in both method docs; the old-shape rule only at `token-balance:614-615`; the plain-arrow rule (`auth-registry:667`) is about the `withLock` call.
- `{ k, r }` built at `sealed-entity-storage.ts:209, :421, :461`; read once at `:578`. Set-then-remove at `:79-82` (`commitSealedTogether`: not async, sets even an empty batch, removal by `.then`), `:115-116` and `:470-473` (await, skip an empty set). Callers of `commitSealedTogether`: `ui-preference/service.ts:250`, `incoming-transfer/repository.ts:181`. Byte and order pins: `storage/sealed-entity-storage.test.ts:68-75, :141, :368-388, :426`.

## #1437 at the base

- Registry Proxy `utils/core.ts:141-151` (unchecked `set`); `initAppServiceContext(): AppServices` `:131`, callers `popup/index.ts:33`, `onboarding/index.ts:30` discard it.
- Writers: `composables/useProfileBootstrap.ts:155-157` (network replace), `:198-200` (account replace), `popup/app.vue:274-278` (the `replaceAccountClient` dep), `popup/pages/auth.vue:234` and `popup/pages/profile/new-profile-helpers.ts:64` (`??=`). Nothing aliases the registry. No account or network client is `.connect()`ed; they open on first request.
- Test writes through the real trap: 6, all `utils/core.test.ts:38-40, :58-60` (the issue said 7). Mock-object writes: `auth.test.ts:794`, `new-profile-helpers.test.ts:133, :413`. Pins: `new-profile-helpers.test.ts:411-424`, `auth.test.ts:790-805`, `network-switch.test.ts:46, :263, :328`.

## #1467 at the base

- `TokenService(logger, browserApi, pxeClientFactory = DEFAULT, seederOverrides?)` `token/service.ts:171-176`; `TokenBalanceService(logger, browserApi, ticker = new ClockTickerAdapter(...), projectionGate?)` `token-balance/service.ts:110-115` (both read in `init`); `IncomingTransferService(logger, browserApi, pollIntervalMs = DEFAULT, publicReader?, incomingPollGate?)` `incoming-transfer/service.ts:320-326`; `JournalReaper(journal, alarms, logger, now?, bootCutoff?)` `operation-journal/reaper.ts:115`.
- Placeholders: `runtime.ts:575, :577, :587-593` (comment `:591`), `:694`. E2E stamps `:569-572, :579-582`.
- Test constructions (the issue said about 40): JournalReaper 23 (21 in `reaper.test.ts`, `execution/service.composition.test.ts:1431`, `operation-journal/sealed-journal.composition.test.ts:44`), TokenBalanceService 12, TokenService 6, IncomingTransferService 4. `token/service.composition.test.ts:240` reads `ConstructorParameters<typeof TokenService>[3]`; `runtime.post-start.pins.test.ts:10` mocks `JournalReaper`. No subclass or factory.

## Collisions

- Open PR #1572 edits `popup/app.vue` (sends in progress) away from `:274-278`. Branch `w3-storage-1-a1` edits `network/service.ts` (network delete) and `transaction/service.ts` (commit), away from the sealing and create sites. Lane quality-execution-1 (#1442) edits `auth-registry/service.ts`'s ExecutionService import. Textual merges expected; whichever lands second merges `dev` and reruns its gate.
- Closed known limits read: #1053, #1056, #1057, #1059, #1060, #1062 (sealing), #843, #262 (purges). None is reopened by a refactor.
- Duplication at the base (`bun run audit:dup`): 1544 clones, 21191 lines (3.37 % lines, 3.05 % tokens); production 184 clones / 8768 lines, of which TypeScript 69 / 754.
