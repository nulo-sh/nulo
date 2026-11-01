# token-id-1 recon

Base: `origin/dev` at `f738cba62`. Every line #1457 cites at `51ea220b1` holds at the base (`journal-state.ts:402`, `activity-rows.ts:98`, `id-allocators.ts:17-21`, `token/service.ts:507`). One Sonnet explorer swept six capabilities; the driver read the allocator, both token call sites, the registry and the consumers itself. Paths are under `apps/extension/src/` unless they name another root.

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| A persisted counter or high-water mark | none (searched `highWater`, `high-water`, `monotonic`, `nextId`, `next-id`, `ValueStorage` over `apps/extension/src` and `packages/*/src`; the hits are in-memory counters) | build new: one value key |
| The allocator | `nextNumericId` = above the highest canonical safe-integer key, with the hostile-key clamp and walk-down (`wallet/services/id-allocators.ts:17-60`) | adapt: an optional floor |
| A plaintext single-value store | `value(key)` in `STORES` and `valueStorage(name, area)` (`wallet/storage/stores.ts:88,264`); used by config, prices, the token list | reuse-as-is |
| Registering a key family | `STORED_SHAPES` entry via `described(...)` (`wallet/storage/stored-shapes.ts:106`), `full` and `minimal` goldens in `stored-shapes/goldens.json`, `bun run baseline:storage -- --additive "<why>"` and the pin it prints into `stored-shapes/pins.ts`, a `PLAINTEXT` reason in `wallet/storage/root-census.test.ts:15`, a writer case in `wallet/storage/stored-shapes.writers.test.ts`, and a `FAMILY_GROUPS` entry in `tests/e2e/helpers/profile-chaos/checkers.ts` (pinned by `scripts/e2e/profile-chaos-model.test.ts`). Precedent: `de500244a` (the `prestoOpened` flag) | reuse-as-is |
| Lock discipline for a new write | every token-row write is issued right after a synchronous `ownsLock()` and tracked in `pendingWrites` (`token/service.ts:472-476,604-628`) | reuse-as-is |
| Backup of tokens | the full backup restores tokens through `TokenService.restore` (`composables/full-backup-restore.ts:649`), whose `restoreRow` allocates a fresh id per row (`token/service.ts:1050`); balances are relinked old → new id (`full-backup-restore.ts:474`). The journal, incoming rows, pins and fee picks are not in a backup | reuse-as-is |
| Test harness | `token/service.test.ts:70` `makeHarness` (real `FakeBrowserApi` storage, stubbed metadata fetch, fake journal); `holdRead` and the watchdog `release` (`:879-930`); restore cases (`:325-372`); `journal-state.test.ts:261` (a record whose token id names no token); `id-allocators.test.ts` | reuse-as-is |

## Persisted token-id references that outlive a token row

| Reference | Cleared on one token's delete | Acts on a successor holding the same id |
|---|---|---|
| Journal `tokenId` (`operation-journal/spec.ts:71`) | no (only profile and chain purges) | yes: the terminal card's title, amount and symbol (`utils/journal-state.ts:402,442`, `RecentActivityView.vue:386,395`), the token page's rows (`utils/activity-rows.ts:98`, `RecentActivityView.vue:322`), and the awaiting-row cleanup (`RecentActivityView.vue:584`, which removes a placeholder; the explorer's "builds a resend" did not hold) |
| Token balances' `token` | yes, by full identity (`token-balance/service.ts:544-550`) | no |
| Incoming records, outbox, arrivals | yes, by contract (`incoming-transfer/service.ts:1410`) | no |
| Pinned tokens, fee picks | keyed by chain and contract | no |
| Transactions | carry no token id; matched by contract (`activity-rows.ts:92`) | no |
| A profile deletion's tombstone `tokenIds` (`profile-deletion/coordinator.ts:106`) | kept until the deletion finishes, by design | no: its balance purge is scoped to the deleted profile (`coordinator.ts:131`) |

## Other allocators

- Token balances: `nextNumericId` (`token-balance/balance-repository.ts:70`); a balance id is referenced only by in-memory task content (`task/spec.ts:57`), and balance rows are deleted by full identity. Authwit: `max+1` (`auth-registry/service.ts:258,766`); tasks and sync runs hold its id in memory, and no persisted lookup by id reaches a successor (Codex R1). Contacts, networks, FPCs: random ids. Accounts: deterministic ids. None has #1457's path.

## Prior records that bound the plan

- #693 (closed `known-limit`, 2026-10-17): a refused Send's card names the token its id holds now; reopen "when the journal row comes to carry the token contract … or a user reports". #1457 is the owner's decision to fix the cause (P94-04).
- #262 (closed `known-limit`): the lockless chain sweep can delete a row whose id was freed and reused; its path needs a reused id.
- Searched closed limits `token id`; none else covers the allocator.
