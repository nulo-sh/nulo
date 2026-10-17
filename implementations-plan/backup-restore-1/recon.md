# backup-restore-1 — recon

Base: `dev` at 2c0df3b9. Two read-only explorers (Sonnet), each claim re-checked by the planner against the tree. Paths are relative to `apps/extension/src/` unless they start with `packages/` or `tests/`.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| Paused-screen copy | `components/stale-network/copy.ts` `paused()`; the takeover's yellow `notice` slot (`StaleNetworkTakeover.vue`, `content.notice`, `dense_notice` density) | reuse: edit `paused().body`, add one notice function, fill `notice` in the `paused` screen |
| Which imported accounts a paused reset holds | `ResetJournal.accounts[].type` (`wallet/services/stale-network/types.ts:46`); `journalView` drops it (`wallet/services/network-reset/service.ts:333-344`) | adapt: `StaleNetworkView.reset` gains `imported: string[]` |
| Whether a reset holds a network (popup) | `getPendingReset()` + `onStaleNetworkChanged`, read-counter pattern in `popup/pages/settings/security/export/full.vue:142-151` | reuse the pattern on the network page |
| Endpoint refusal chokepoint | the four mutators in `wallet/services/network/service.ts` (`addEndpoint` 687, `updateEndpoint` 714, `deleteEndpoint` 758, `setPrimaryEndpoint` 780), each `lock.withLock` → `requireOwnedRow`; `this.staleNetworks.getJournal` already used at 576; `ERR_RESET_PENDING` (`stale-network/types.ts:13`) | adapt: one private guard called inside each lock |
| Inert endpoint rows | `SettingItem` renders a row with no `@click` as inert and undimmed (`components/ui/Settings/SettingItem.vue:70-75`); `disabled` would dim it (`:178-181`) | reuse: drop the click handler while locked |
| Reason line glyph | `warning` glyph (`packages/design/src/core/glyphs.ts:56`), `Text variant="body"` | reuse |
| Delete chain confirm | `requestConfirm` in `popup/pages/settings/networks/[id].vue:124-147` | adapt: append one line |
| Barrier copy | inline `blockedCopy` in `components/MigrationBarrier.vue:21-30`; test pins substrings only | adapt: one sentence, test pins the exact string |
| Key-slice filter | `restoreAccountsAndFilterOwnedSlices` builds the allow-set `importedChainAddress` (`composables/full-backup-restore.ts:383-405`), `accountScopeKey` helper; `restoreAccountsStage` passes the whole key slice (`:546-551`) | adapt: filter the key slice by the same allow-set |
| "No network for chain" | bare `Error` in `NetworkService.getL1ChainIdStored` (`wallet/services/network/service.ts:406-411`) | adapt: a lookup that returns `undefined`, the throwing method wraps it |
| Restore warning copy | `components/composite/import/restore-warning.ts` (functions, exact-string tests), `ImportFullBackupForm.vue` `warningText` prop, `joinNames` | reuse + one function |
| #671 pattern | `useRestoreAgain.ts:233-267` keeps `validateAndMigrateBackup` inside its `try` | reuse the shape |
| Export banners | `Banner variant="warning" direction="vertical"` blocks in `full.vue:638-679`; `material.accounts` / `passkeyKeys.accounts` are the rows the file carries | reuse (arc 3, after #705) |
| Seed chains | `DEFAULT_SEEDS` (`wallet/services/network/seeds.ts:42`); inline `DEFAULT_SEEDS.some((s) => s.chainId === …)` at `network/service.ts:641` | adapt: one exported `isSeedChain`, reused at 641 |
| Real-crypto restore harness | `wallet/services/account/full-backup-keys.test.ts` (`restoreIntoFreshWallet`), boot-over-same-store in `account/service.test.ts:442-520` | reuse for the restart-sweep test |

Absence claims (search trail): no all-chains account read over RPC (`getAccountsRaw` is not in `rpcMethods`, `account/service.ts:101-119`); no popup import of `seeds.ts` (`grep -rn "seeds" src/popup src/components`); no endpoint mutator reads the journal (`grep -n "journal\|refuseDuringReset" network/service.ts`); no `*.composition.test.ts` for the account service (`find src -name "*.composition.test.ts"`).

## Facts the plan rests on

- Account and imported-key rows share the id `["account", profileId, chainId, address]` (`account/spec.ts:28-30`); import writes the key first (`account/service.ts:743-768`).
- The start-up sweep deletes a key row whose account key is physically absent, reading `getKeys` (`account/service.ts:197-211`). No worker restart follows a restore, so a restore's orphan key dies at the next start.
- `AccountService.restore` refuses any row whose chain has no network row, before the L1 cross-check (`:976-979`); `restoreImportedKeys` writes every row it can rewrap, with no account check (`:1121-1165`).
- Seeding runs only for a profile with no network rows (`network/service.ts:255-330`), so a later build never adds a network to an existing profile; a held row meets a network only through `addNetwork` or a reset's rewrite.
- `classifyChains` unions account and network chains; a chain with imported rows only has no derived rows and is `clean` (`stale-network/classify.ts:31-55`).
- Imported accounts bind to the network row's L1 at import (`account/service.ts:709-711`); `buildAccountExport` writes the row's `l1ChainId` (`:669`).
- Paused means journal present and no in-memory flight; `resume()` restarts a paused reset at each unlock (`composables/useStaleNetwork.ts:187-197`).
- The resume replaces the primary endpoint unless it still equals the journal's `probedEndpoint` (`network/service.ts:1027-1041`); `primaryMoved` runs at capture only (`:963`).
- `deleteNetwork` deletes a paused journal (`:574-579`); after the purge the journal holds the only copy of the resealed imported keys.
- Full-backup exports refuse while any journal exists (`account/service.ts:936-940`), so no export of the held keys exists today.

## Collisions

- **ui-dedupe-1, PR #705** rewrites `full.vue` into `composables/useFullBackupExport.ts`: the export banner waits for it (arc 3).
- **onboarding-3** holds onboarding pages: arc 2 edits `onboarding/pages/import.vue` by one binding; merge `dev` before its PR.
- **sheet-1** may restyle the confirm sheet; arc 1 changes only the description text it passes.
- **#690 / PR #702** (barrier scrim) is not fixed here.
- Closed limits read: #472, #473, #474, #475 (reset journal), #427, #468 (imported accounts after a rotation), #614, #700 (backup).
