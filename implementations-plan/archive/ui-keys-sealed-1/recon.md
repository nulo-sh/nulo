# ui-keys-sealed-1: recon

Read against `origin/dev` at `5c35ca93` (encryption-at-rest-1 A3 merged), plus the in-flight branches `encryption-at-rest-1-a4` (A4) and `worktree-ui-cosmetics-1` (#1027) read with `git show`, never by entering their worktrees. Two Sonnet explorers (the reuse sweep and the stored-shape guard), the parent's own reads. Paths are relative to `apps/extension/` unless they start at the repo root.

## Reuse map

| Capability | Exists | Verdict |
|---|---|---|
| A sealed per-profile root, one row per profile at the profile's id | A4 `src/wallet/storage/stores.ts` `PROFILE_ROW_LAYOUT`, used by `tokenSeeded` and `dappRegistrations`, with a `z.unknown()` row codec and the service's own decoder as `read` (`sealedDescribed` in `stored-shapes.ts`) | reuse as is for the three per-profile keys |
| A sealed root whose owner is the row's `profileId` | `SealedEntityStorage` default `ownerOf` (`src/wallet/storage/sealed-entity-storage.ts`) | reuse as is for the device-wide pointer row |
| Row keys, the unlock signal, the deletion state | `ProfileService.rowKeys`, `onRowKeysReady`, `getDeletionState` (`src/wallet/services/profile/service.ts`) | reuse as is |
| A service that serves a sealed per-profile root over RPC | `ContactService` / `ContactServiceClient` (`src/wallet/services/contact/`): `sealedEntityStorage(...)`, one `Lock`, `sealLegacy` on `onRowKeysReady`, a write fence | adapt: the skeleton of a new `UiPreferenceService` |
| The fee picks' one writer | `ProfileService.saveFeePick` (`service.ts:1152-1170`), under `runExclusive`, `parseFeePickUpdate` / `applyFeePickUpdate` (`src/utils/fee-picks.ts`) | adapt: moves to the new service, same parser and merger |
| The pin map's sanitizer | `sanitizePinMap` in `src/composables/usePinnedTokens.ts:46` (imports `vue`) | adapt: move the pure part to `src/utils/`, so the worker and the registry import no composable |
| Converting a legacy row at unlock | `SealedEntityStorage.sealLegacy` / A4 `prepareLegacyRow`, `commitLegacyTogether` | **does not fit**: they read only JSON strings (`rawStringEntries` skips non-strings; `decode` logs `not-a-string — KEEPING`). The four keys are `structured` (a raw object; the pointer a bare string). Build new: a service-local conversion, below |
| Profile deletion and same-id adoption of the per-profile keys | `profileUiKeys(id)` (`src/utils/profile-ui-keys.ts`), removed by the deletion coordinator (`profile-deletion/coordinator.ts:141`) and `dropUiKeysBeforeAdoption` (`profile/service.ts:1585`); `purgeSealedRowsOf` (`storage/sealed-roots.ts`) removes every sealed row whose envelope names the profile | reuse as is: same key names, both forms removed by key |
| e2e reads of sealed data | `callService` (`tests/e2e/fixtures/session.ts:41`), A4 `tests/e2e/helpers/identity-rows.ts` | reuse: one helper reads the pointer, pins and picks through the service |
| The update replay | `tests/e2e/update-replay.test.ts`, `fixtures/update/{verify,stored-rows,in-place}.ts`, recording `fixtures/update/v0.31.0.storage.json` | adapt: the recording holds the pointer but no pin or fee-pick row |
| The stored-shape baseline generator | `scripts/storage-baseline/generate.ts` (`bun run baseline:storage`), `stored-shapes/baseline.ts` `propose` | reuse as is: its unfrozen path rewrites stamp 0; no new flag |

## The four keys today

- `nulo:ui:activeAccount`: one device-wide value key, a bare address string. Read once, by `setupActiveAccountRun` (`src/stores/app.store.ts:478`) during bootstrap, after unlock. Written by `app.store.ts:402,426,499`, `popup/components/popups/NewAccountPopup.vue:87`, `popup/pages/profile/new-profile-helpers.ts:73`, `popup/pages/settings/accounts/import.vue:138` and the execute window (`popup/windows/execute/index.vue:554`, through `scope-follow.ts` with `unless`). Not in `PROFILE_UI_KEY_PREFIXES`, so no deletion removes it. A stored address that is not one of the profile's accounts reads as nothing: the bootstrap takes `accounts[0]` and overwrites the key.
- `nulo:ui:pinnedTokens@<profile>`: read and written only by `usePinnedTokens` (popup), through the facade, per-key queue, `unless`; `chrome.storage.onChanged` (`:248`) refreshes other pages. Consumers: `TokensView.vue`, `SelectTokenPopup.vue`, `holdings.vue`, `tokens/[id].vue`.
- `nulo:ui:feePaymentMethods@<profile>`, `nulo:ui:sendFeePaymentMethods@<profile>`: read in the popup by `useFeeSelection.ts:68,127`; written only by `ProfileService.saveFeePick`, called from `FeeSettingsCard.vue:160` and `settings/fpcs/index.vue:92`.
- v0.31.0 stores the same four keys in the same forms (`git show v0.31.0:apps/extension/src/utils/profile-ui-keys.ts`).
- **Pre-unlock reads: none.** The lock screen (`popup/pages/auth.vue`), the profile picker and onboarding read only `nulo:ui:lastActiveProfile`. Home renders after `setupActiveAccount` resolves (`useProfileBootstrap.ts:167-182`, then `isLogined`); pins load on mount, after the first paint, today as after.
- **Backups: none.** No slice in `services/backup/backup-migration-registry.ts:203-225` names a `nulo:ui:` key; `stored-shapes/backups/passkey.json` holds no `nulo:ui` string.

## The stored-shape guard

- Registry `src/wallet/storage/stored-shapes.ts`: the four entries `uiActiveAccount`, `uiPinnedTokens`, `uiFeePicks`, `uiSendFeePicks` are `structured`. Eight goldens, all stamp 0 (`stored-shapes/goldens.json:1525-1658`).
- Rules (`stored-shapes/snapshot.test.ts`): R1 the last stamp equals the registry; R2 each later stamp is justified; R3 goldens decode to the stamp's `expected`; R4 `PINNED_STAMPS` is non-empty and pins every stamp (`:102-114`); R5 the two pinned backups open and read. The goldens block requires a `.full` and a `.minimal` golden per shape.
- Pins on `dev`: stamps 0-2. A4 appends one; #1027 appends one (`uiGetStartedPrestoOpened`). They conflict with each other in `pins.ts`, `snapshot.json` and `goldens.json`; whichever lands second re-stamps.
- The generator: with `PINNED_STAMPS` empty, `propose` takes the unfrozen path, refuses any golden with `stamp !== 0`, and rewrites `snapshot.json` as one stamp 0; `-- --freeze` prints the pin. It fills only missing MACs and seals, never edits a golden's `stamp`, never deletes a golden. So a re-cut hand-edits `goldens.json` (delete the eight, add the new ones, set every `stamp` to 0) and `pins.ts`; `snapshot.json` stays generator-only.
- `baseline.test.ts:188` names `uiPinnedTokens` in a fixture loop; `stored-shapes.writers.test.ts:145-157,339-419` holds the four entries to `saveFeePick` and `usePinnedTokens.pin`; A4's `root-census.test.ts` lists the four as plaintext under known limit #1062.
- `stored-shapes.scan.test.ts` claims a literal by a value key exactly or by a root name, alone or followed by `@` (`:125-130`). No list of retired keys exists (searched `legacy|retired` over `wallet/storage`, `packages/wallet-core/src/migration`). A sealed root that keeps the name `nulo:ui:pinnedTokens` keeps claiming its old rows; a root named `nulo:ui:activeAccount` claims the bare old key's literal.
- `realMigrations` is empty and `BASELINE_VERSION` is 1 (`migrations/index.ts:22,29`); a re-cut leaves every device's `nulo:schema:version` at 1.
- The pre-production rule the lane brief quotes ("a shape change simply redefines the launch baseline") is no longer in `CLAUDE.md`: #938 (`246c8851`) replaced it with the production rule.

## The update replay

- The recording (`fixtures/update/v0.31.0.storage.json`, 33 keys) holds `nulo:ui:activeAccount` and `nulo:ui:lastActiveProfile` and no pin or fee-pick row.
- `fixtures/update/verify.ts:28-52` `HELD` names `uiActiveAccount`; the replay reds on a key the candidate does not read (`unreadRows`) and on a key lost in the update, with a `REKEYED` exception for keyed sealed roots.
- The live scenario needs a sandbox on the release's Aztec line; once `dev` moves off it, only the replay runs (`tests/e2e/README.md:120-185`).

## e2e that read the four keys raw

- Smoke: `accounts.test.ts:70`, `import-paths.test.ts:113-116`, `passkey-paths.test.ts:35`, `passkey-backup.test.ts:349-353`, `toolbar-panel.test.ts:231`, `backup-roundtrip.test.ts:181`, `fixtures/accounts.ts`, `fixtures/extension.ts:1029`, `fixtures/networks.ts:37,87`, `helpers/import-drivers.ts:361,376,517`.
- Network: `account-switch-isolation:171`, `execute-scope-account:42`, `incoming-arrival:103`, `incoming-transfers:140`, `profile-reimport-matrix:92`, `pin-to-home` (`fixtures/tokens.ts` `readPinState`, `clearPinnedTokens`), `fee-methods:251-266`, `tx-sendTx-sponsoredFpc` (`feePicksKey`, `savedFeePick`).
- Line numbers are `dev`'s; A4 edits several of these files.

## Open work and known limits in the area

- Open: #1051 (this lane), #1050 (unlock-time migration pass; stays open, the owner's call), #522 (A4 closes it).
- Closed known limits read: #1062 (this lane's), #338 (a pin write straddling a deletion and a same-id restore: unchanged by this lane), #1053 (planted plaintext rows are read, then sealed), #1060 (a profile not unlocked since the update stays plaintext), #1056 (counts, owners, sizes and write times show).
- Collisions: A4 and #1027 each append a stamp; this lane's re-cut folds both, so it branches after both land.
