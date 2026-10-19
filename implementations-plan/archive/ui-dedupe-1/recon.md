# ui-dedupe-1 recon

Base: `dev` at `0fe841be`. Two Explore agents (sonnet) plus the driver's own reads. Every line number is at that base.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| Generation fence for supersedable runs | `apps/extension/src/composables/runFence.ts` (`begin`, `invalidate`, non-bumping `snapshot`; 9+ users) | reuse-as-is |
| Explicit import selection + one decrypt path | `BackupSelection` `kind` union and `openSelection` in `apps/extension/src/utils/full-backup-helpers.ts:42-131`, landed by #623 (`e021210a`) | already shipped; no work |
| A flow composable that owns a backup flow's state refs | `useFullBackupImport.ts:773-866` (state refs + run functions, `dispose()`), `useRestoreAgain.ts` | adapt the shape for export |
| Per-row restore loop | `apps/extension/src/wallet/services/restore-rows.ts:22-35`; callers: account (`:969`, `:1136`), auth-registry `:704`, contact `:264`, token `:978`, token-balance `:697`, transaction `:607` | reuse-as-is |
| Config write with the shared failure toast | none. Searched `\.setValue(`, `updateSetting\|applySetting`, `"Failed to update setting"` over `apps/extension/src` and `packages/`; the only config composable is the read side `useConfigRead.ts` | build new |
| CTA box from `@nulo/design` | `packages/design/src/ui/Button.vue` (`cta_outline` variant; one default slot that is a direct child of the root element, `:138`). No global CTA class: `utilities.css` holds only `type--*`, `lh--*`, `color--*`, `ta--*`, `gap--*`, `justify-*` (generated from `token-contract.ts`) | reuse Button as-is |
| Keyed-list mirror, token balances | `useTokenBalanceSnapshot.ts` (fetch, fence, dirty refetch, reconnect via `connectsSeen`; the apply handlers are returned, and each parent subscribes them) | adapt: it becomes the family's mirror |
| Keyed-list mirror, generic | `useEntityCrud.ts` (accept filter, replace-on-add, insert unseen on update, unfiltered delete; no reconnect) | reference only (its six settings consumers stay) |
| Keyed-list mirror, journal | none. Searched `mirror`, `upsert`, `byId`, `Map<string`, `connectsSeen`, `onOperation(Added\|Updated\|Deleted)` | build new |
| Row pricing | `safeFiatOf` in `utils/token-amount.ts:58`; 4 lambda copies (BalanceView `:115`, TokensView `:85`, SelectTokenPopup `:50`, holdings `:74`); no `fiatOfRow` | adapt (`usePrices` gains it) |
| PXE store injection | `packages/aztec-runtime/src/pxe/chain-runtime.ts:183-195`, then `createPXE(node, config, { simulator, store })` (`:232`, `:268`) | keep |
| Zero-`pxe/*`-IndexedDB check in a browser | `apps/extension/tests/e2e/network/opfs-storage.test.ts:100-103` | reuse as the standing guard |
| Pixel-identity proof | none committed. #225 used a scratch spec over two builds, captures at 360×600, sha256 per browser and theme, a control pair (`implementations-plan/archive/forms-and-contacts/lessons/phase-2.md`) | reuse the method |

## #541: what is left

- **Import half: already done** by #623. The union and `openSelection`, with a stale result for a superseded run, are on dev. `runDecryptBackup` (`useFullBackupImport.ts:576`) and `runDecrypt` (`useRestoreAgain.ts:167`) are thin publishers over that one path; only the first also publishes `parsedBackupName`.
- **Export fence: already uniform.** `full.vue` and `account.vue` use `RunFence.snapshot()`, and `discardRun` invalidates.
- **Export: still page-held.** `full.vue:60-525` holds the payload strings (`payloadPretty`, `payloadCompact`, `encryptedB64`), `isBusy`/`isDownloading`, the fence, the run's clients (`activeRunClients`), five stage helpers, three handlers, the scrub (`discardRun`, `:473-484`) and a 12-field reset on profile switch (`:506-525`). It has 17 `isCurrent()` checks.
- **Tests:** `full.test.ts` (574 lines) and `full-passkey.pins.test.ts` (580 lines) mount the page with `vi.mock` by module path and assert on the DOM only. One `w.vm.$.isUnmounted` read, in teardown. They settle with `flushPromises`, so moving code into a composable that imports the same modules keeps every mock.
- **E2E that drive the export:** smoke `backup-roundtrip`, `security-backup`, `passkey-backup`, `own-window`, `passkey-toolbar-panel`; network `backup-restore-integrity`, `restore-again` and others.

## #518

- `ConfigService.restore` (`wallet/services/config/service.ts:62-85`) has the same `try → write → catch → { ...row, restoreError }` shape as `restoreRows`.
- Filtering first changes one thing: every skip warning logs before the first write. No test pins the interleaving. `config/service.test.ts` uses a no-op logger and a store whose `set` never throws.
- The skip warning (`:66`) puts the backup-supplied key into a finished string at `warn` level. The redactor cannot see into a finished string (logging-policy skill).

## #519

- The PXE line is `@aztec-labs/pxe@6.0.0-rc.3`. Its `dest/entrypoints/client/lazy/utils.js` calls `openBrowserStore('pxe_data', …)` only when no store is injected, and that store is SQLite-OPFS. `dataDirectory` is never read for storage. `kv-store`'s `./deprecated/indexeddb` is imported nowhere in `apps/` or `packages/`.
- The legacy layer in `packages/aztec-runtime/src/pxe/service.ts`:
  - `BlockedDeletePolicy`, `LEGACY_SWEEP`, `VERIFIED_ERASE`, `isLegacyPxeDb` (`:67-85`)
  - the IndexedDB arm of `sweepOrphanStores` (`:266`, `:303`, `:307`) and `sweepLegacyIndexedDbs` (`:310-313`)
  - `clearChainState`'s delete (`:751`) and `eraseProfile`'s loop (`:823-826`)
  - `deleteDb` (`:902-919`)
- Its tests:
  - `service-idb-delete.test.ts` (about 380 lines; pins every site and tick distances)
  - the IndexedDB arm in `service-sweep.test.ts:120-149`
  - `indexedDB` stubs in `service.test.ts`, `incarnation-fence.test.ts`, `boundary-refactor.pins.test.ts:85`
- E2E: `opfs-storage.test.ts` asserts zero `pxe/*` databases after real PXE use (`:100-103`), then seeds a fake legacy database and checks the purge sweeps it (`:105-153`). `delete-after-prove.test.ts` proves a send and then deletes the profile. It reads `indexedDB.databases()` only for the CRS cache (`keyval-store`).
- Docs that name the layer: `ARCHITECTURE.md:104`, `packages/aztec-runtime/README.md:63`, `pxe/spec.ts:113`, `pxe/client.ts:518`, `chain-coordinates.ts:6,16,29`.
- `chainDataDirPrefix` dies with the layer (its other user is its own test). `chainDataDir` and `PXE_DATA_DIR_ROOT` stay.

## #517

- `SecretCountdownClose.vue` renders a raw `<button>` with local `.cta`/`.cta_outline` (`:53-100`).
- Its drifts from `Button`:
  - a `2px dotted` focus ring against `solid`
  - a filled `:active` state that `cta_outline` lacks
  - `transition: all 0.2s var(--bezier)` against `ease`
  - a dead `.cta:hover { #fff }`
- `Button`'s root also adds `display:flex`, `gap`, `box-sizing`, `min-height:40px` (medium), `white-space:nowrap`, `user-select:none` and `background-clip`.
- The sole consumer is `settings/security/export/seed.vue:187`, the recovery-phrase screen. Its test stubs the component. `SecretCountdownClose.test.ts` has 11 cases and reads the bar as `button > div`.

## #520

- `updateSetting` is byte-identical on `display.vue:79-89`, `privacy.vue:48-58` and `developer/index.vue:88-98` (`diff` is empty).
- `applySetting` is called unawaited.
- Developer's `applySetting` re-enters `updateSetting` for `indicateFailures` and `debugMode`.
- `lock.vue` has no `updateSetting`. Its writes differ (rollback, success toasts).
- The F-21 comment on #520 adds four items the page-37 decision does not name: the setting row markup, the profile-flow failure notice, the explorer links, and the hero observer.

## #548

| Copy | Added | Updated (unseen id) | Deleted | Reconnect | Fence |
|---|---|---|---|---|---|
| `useTokenBalanceSnapshot` (TokensView, BalanceView) | scope, id dedupe, `mapRow` | ignored | unfiltered | refetch when `connectsSeen > 1` | fence + dirty refetch |
| `holdings.vue` (via `useEntityCrud`) | replace, else append | append | unfiltered | refresh on every connect | CRUD's own |
| `SelectTokenPopup.vue` | `show` + scope + dedupe | ignored; known id scope-gated | unfiltered splice | `connectsSinceShow > 1` | `loadGeneration` |
| `send.vue` + `send-balance-events.ts` | account only, no chain, no dedupe | ignored | not subscribed | none | identity refetch seq |
| `activity.vue` journal | terminal only, prepend dedupe | prepend; non-terminal removed | unfiltered | every connect | **none** |
| `RecentActivityView.vue` journal | scope, prepend dedupe | prepend | unfiltered | every connect | `journalFence` |
| `TokensView.vue` journal | kind only, push, **no dedupe** | push | unfiltered | every connect | **none** |
| `app.store.ts` in-flight tracker | upsert | push | unfiltered | every connect | generation + revision settle loop |

- Tests leave several of these unpinned: holdings reconnect, Delete and unseen-id Update; TokensView's journal events; activity's reconnect; the in-flight tracker's Delete and reconnect.
- #152 (closed, page 0) recorded RecentActivityView's flat journal, task and cancel state as final.

## Collisions with running lanes (2026-10-17 17:1xZ)

| Issue | Running lane | Files |
|---|---|---|
| #541, #518 | none | `export/full.vue`, a new composable, `config/service.ts` |
| #519 | none (type-roles-coverage arc 2 edits `network/type-roles-windows.test.ts`, which is not this arc's file) | `packages/aztec-runtime/src/pxe/*`, `opfs-storage.test.ts`, `delete-after-prove.test.ts` |
| #520 | **sheet-1**: removes the Full-height row and its key from `display.vue` | `settings/display.vue`, `privacy.vue`, `developer/index.vue` |
| #517 | **onboarding-3**: redraws Settings, Backup, Recovery Phrase (`seed.vue`, the sole consumer) | `SecretCountdownClose.vue`, `seed.vue` |
| #548 | **ui-leftovers-1** (PR #678: `holdings.vue`, `BalanceView.vue`, `RecentActivityView.test.ts`); **sheet-1** (Select token's sheet) | the eight mirrors above |

Sibling page-37 lanes that are planning now: service-structure-1's #521 edits popup `import.vue`'s activation waiter. This lane's arcs do not edit `import.vue`.

## Closed known limits searched

`backup export run`, `mirror snapshot`, `IndexedDB PXE`: #614 and #455-#457 are restore-side and do not bear on this lane.
