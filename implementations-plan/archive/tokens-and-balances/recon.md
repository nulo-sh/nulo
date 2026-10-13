# tokens-and-balances — recon

Base: `origin/dev` at `fd47407`. Two Explore agents (sonnet): one batched reuse sweep (seven
capabilities) and one subsystem map of the token service's write paths; plus the driver's own read of
the pin store, the balance views, the Holdings search and the New token popup. Paths are relative to
`apps/extension/src` unless they start with `packages/` or `implementations-plan/`.

## Reuse map

| Capability needed | Existing code | Verdict |
|---|---|---|
| Fence a profile's per-profile UI keys against a reused id | `utils/profile-ui-keys.ts` (`profileUiKeys`, the one registry of `nulo:ui:*@<id>` keys); `wallet/services/profile-deletion/coordinator.ts:135` removes them once, inside the purge | adapt: call `profileUiKeys` where a profile id is adopted (Phase 1.3) |
| Know when a profile id is adopted | `profile/service.ts:1422` `persistNewProfileHoldingLock` (create at `:610`, `:750`; import at `:2108`, `:2155`) and `:1432` `writeMarkerThenRowHoldingLock` (restore at `:2341`, `:2499`); both run under the facade lock | reuse-as-is as the two adoption points |
| Popup-side deletion knowledge | `ProfileDeletionState` (`profile/profile-deletion-state.ts`) and `captureRunFence`/`assertRunFence` (`profile/service.ts:535-550`, on the client) | not usable for #93: the epoch lives in the service worker, and a popup can only ask over RPC, which leaves a gap before its write |
| Storage-facade write guard | `utils/storage.ts:78` `storageLocalSet(items, { unless })`, read after the migration barrier | reuse-as-is (no change needed; the pin store already passes `unless`) |
| Lock ownership after a watchdog release | `packages/wallet-core/src/utils/lock.ts:86-93` `withLock((isCurrent) => …)`; `isCurrent()` is `ticket === currentTicket` and stays false once released; `token/service.ts:370` already names it `ownsLock`; precedent at `token/service.ts:457-461` and `incoming-transfer/service.ts:304-308,712` | reuse-as-is |
| Delete only a row that is still this flow's own | `account/service.ts:376-383` `unwrite()` (compare, then delete) | adapt the compare-then-delete shape for token rows (Phase 1.2) |
| List reducers keyed by id | `composables/useTokenBalanceSnapshot.ts:88-92` `onBalanceUpdated` (already shared by both views); `composables/useEntityCrud.ts` (full upsert/dedupe, used by `pages/holdings.vue`); `popup/pages/send-balance-events.ts` (no dedupe) | adapt: give the snapshot composable the add and delete reducers too (Phase 1.1) |
| Class-id pin for a token | `token/default-tokens.ts:39-52` `expectedClassId` (seeds only); checked in `token/service.ts:592-598` against `currentContractClassId`; `packages/aztec-runtime/src/pxe/artifact-class-id.ts:90-100` (original vs current) | reuse when OA-1 is answered (Arc 3); no stored pin exists on user-added rows (`token/spec.ts:12-56`) |
| Mint amount reading | `utils/tx-amount.ts:10,32-55` (`STANDARD_MINTS`, `args.length === 2`); `utils/token-transfer-vocabulary.ts:69-77,103-104` (`MINT_SIGNATURES`, static mint selectors) | Arc 3 input; nothing built now |
| Prefill the New token popup | `stores/cache.store.ts:21` `preselectedTokenAddressToAdd`, read by `NewTokenPopup.vue:273-276`; no writer exists today | reuse-as-is (Arc 2) |
| Contract-address check without bb.js | `utils/aztec-address.ts` `isValidAztecAddress` | reuse-as-is (Arc 2) |
| Generic error line | `popup/components/popups/endpoint-error-text.ts:11` (`"Something went wrong."`) | Arc 2 reuses the pattern, not the string (P8-02's copy adds "Try again.") |
| Test harnesses | `token/service.test.ts` (`makeHarness`, `recordWrites`, the watchdog test at `:498`); `BalanceView.test.ts` and `useTokenBalanceSnapshot.test.ts`; `profile/service*.test.ts`; `tests/helpers/chrome-storage-mock.ts`; `usePinnedTokens.test.ts:11-60` (inline `memoryStorage`) | reuse-as-is |

No `build new` row: every phase extends an existing module.

## Findings per issue

### #93 — pin key outlives its profile (claim holds, sharpened)

- `composables/usePinnedTokens.ts:213-223`: `pin` and `unpin` pass `unless: () => !ctx.live()`, and
  `live()` compares only the popup's own store scope (`:171-174`). A page that has not yet seen the
  deletion still sees its old profile, so its write lands after the purge's remove.
- `:226-242`: the `onTokenDeleted` cleanup writes with no `unless` at all. Profile deletion does not
  fire it (`token/service.ts:757-764` purges silently), but a token deleted just before its profile
  is deleted, or a network deletion (`token/service.ts:186-216` emits per token), can start one.
- The purge removes the key once (`coordinator.ts:135`); nothing removes it later.
- Profile ids are random 8-hex (`profile/repository.ts:113`), but two paths adopt an earlier id:
  a backup restore keeps a generated-shaped id that is free and not reserved
  (`profile/service.ts:2329-2332`), and a passkey import uses the credential's `userHandle` as the id
  (`:2136-2155`). So a resurrected key is shown to the next incarnation of that id.
- Pins are never backed up (`profile-ui-keys.ts:11`), so no restore path writes this key itself.

### #94 — compensating deletes ignore lock ownership (claim holds; a third point found)

- `token/service.ts:417-420` (fence moved during the set) and `:426-429` (network gone after the set)
  delete `token.id` with no ownership check; `:457-461` (the emit fence) already checks `ownsLock()`.
- The token lock is `new Lock()` (`:96`) with the 5-minute watchdog (`lock.ts:5`). The live metadata
  fetch runs inside the lock (`:379`), so a slow simulation behind a running proof can outlast it.
- Ids are max+1 over the store's keys (`wallet/services/id-allocators.ts:16`), and a restore ignores
  the backup's id (`token/service.ts:796`). After a purge removes a row, the next allocation can reuse
  its id.
- The network sweep `clearChainState` is lockless (`:186-216`, deadlock avoidance) and snapshots
  before it deletes, so a row written after its snapshot is removed only by the add itself: delete #2
  is the "snapshot-postdating" case.
- **Beyond the issue:** the set at `:414` has the same flaw. The id is allocated at `:389`; the
  `await isNetworkLive` at `:411` can span a release; a successor (an add, a restore) then allocates
  the same free id and writes it; the released add's set overwrites that row. The plan fixes this
  point too (D2); the panel was asked whether it belongs here.

### #105 — mint figure rests on name and arity (claim holds; not decision-free)

- `utils/tx-amount.ts:38-42` reads `args[1]` of a `mint_to_public|mint_to_private|mint_to_commitment`
  call with two arguments, in the decimals of the listed token at that contract. "Listed" is any row
  in the profile's token list: seeded, user-added or dApp-registered.
- `tx-request-builder.ts:192-198` records the dApp's `method` and `args`; it computes the call's
  selector from the artifact (`:194`) but does not store it.
- Only seeds carry a class pin (`default-tokens.ts:42`); a user-added row stores no class id.
- Every pin that has an effect hides a figure in the case it exists for (an upgraded or non-standard
  contract). The lane brief's C9 rule makes that an owner question: OA-1. The lane map's
  "decision-free" grouping does not hold for #105.

### #206 — BalanceView pushes duplicate rows (claim holds)

- `popup/components/modules/general/BalanceView.vue:234-238` pushes every in-scope add; TokensView
  (`TokensView.vue:223-229`) returns when the id is already listed.
- A duplicate is the row as created (`updatedAt: 0`, zero balance). `onBalanceUpdated`
  (`useTokenBalanceSnapshot.ts:88-92`) updates only the first copy, so the copy keeps
  `isTotalUnsettled` true (`BalanceView.vue:186`) until the 12-second cap (`:195`). A zero row adds
  nothing to the aggregate (`utils/token-aggregate.ts:20-21`); a malformed duplicate repeats a row
  that already makes the total partial. So the fix changes how long the skeleton is held, never the
  figure (Inference I3).
- `pages/send-balance-events.ts:24-27` also appends without a dedupe; Send reads the first match by
  token id, so a copy changes nothing there. Not in scope.

### #134 and #136 (Arc 2, after page 8)

- `popup/components/modules/holdings/TokenList.vue:41,81,103`: the search filters with
  `matchesQuery` and shows `ListStatusMessage` on no match. TokenList is presentational; the page
  (`pages/holdings.vue`) owns the stores.
- `NewTokenPopup.vue:256` sets `error.value = errorMessageFromUnknown(err)`; the template shows it
  under Submit (`:331`). The store refusals are `ChainStoreWedgedError` and
  `PxeStoreVersionMismatch` (`packages/aztec-runtime/src/pxe/opfs-store.ts:54-60,190-221`); their class
  flags do not survive the offscreen → background → popup hops, so the popup sees message text only.
- P8-02 says it "reuses the generic string (endpoint-error-text.ts:11)", but that string is
  `"Something went wrong."`, while the proposal's copy is `"Something went wrong. Try again."`. The plan
  builds the proposal's words.
- Open PR #255 (forms-and-contacts) adds `depth` to `NewTokenPopup.vue`'s `FormPopup`: a trivial
  rebase for Arc 2.

### #80, #104, #106 (no arc)

- #80: `default-tokens.ts` holds testnet seeds only; waits on a V6 mainnet (`blocked:external`).
- #104: `tx-amount.ts` reads only the standard mint shapes; showing more is visible and waits on a
  real dApp report (hold H8).
- #106: an unlisted token's decimals need a contract lookup (`batched-view-simulation.ts`); visible,
  privacy-relevant, waits on C12-fetch and its own plan (hold H8).

## Collisions

- **`seeder.ts`, `default-tokens.ts` (backup-import-export arc 3, #98).** Arc 1 touches neither file.
  #98 adds a seeder method and two `TokenService` methods near `backup`/`restore`
  (`token/service.ts:775+`); Arc 1 edits `persistToken` (`:370-461`). No shared lines.
- **`profile/service.ts`.** Arc 1 adds one call in each of two private helpers
  (`:1422-1425`, `:1432-1440`). backup-import-export arc 3 (#192, restore bookkeeping) and
  account-session-life arcs 2-4 are held; a line-level conflict near the restore marker is possible
  and trivial.
- **R2 (`usePrices.ts`, `BalanceView.vue`).** Arc 1 does not touch `usePrices.ts`; it replaces two
  handlers in `BalanceView.vue` (`:231-242`) with the composable's.
- **Runner.** e2e-harness-gaps arc 1a (#169) owns the smoke and network runner; gate G1 allows one
  network e2e run on the host at a time until it merges.
