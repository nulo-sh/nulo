# Recon: small-ui-fixes-1

Read at `origin/dev` 7697c376, 2026-10-16. One Sonnet explorer (reuse sweep over four capabilities) plus the planner's own reads. Paths are relative to `apps/extension/src` unless they start at the repo root.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| File-name segment from a user-typed profile name | `popup/pages/settings/security/export/account.vue:177` inline `replace(/[^\p{L}\p{N}_-]+/gu, "_") \|\| "profile"`; `utils/string.ts:34` `sanitizeString` drops (not replaces) and keeps `.` and space, so it allows `..` | **adapt**: move account.vue's rule into `utils/files.ts`, call it from the three builders |
| Download sink | `utils/files.ts:29` `downloadFile` passes `filename` straight to `chrome.downloads.download` | reuse-as-is |
| Restart-safe config read in a long-lived component | `composables/useConfigRead.ts` (re-reads on every reconnect, `updatedSince` keeps newer updates); 7 consumers, all `read()` in `onMounted`, `dispose()` after `config.disconnect()` | **reuse-as-is** in `Header.vue` |
| Display flags carried into a store | none: `popup/app.vue:108-124` `settingHandlers` covers `theme`, `disableAnimations`, `sidePanel`, `defaultExplorer` only; `stores/app.store.ts` holds no `showNode` (searched `showNode\|indicateFailures\|showPopupFullscreen` in `stores/*`, `popup/app.vue`) | not used: Header already owns a config client |
| Close a window on lock, including locked before subscribe | `wallet/services/profile/client.ts:66` `subscribeActiveProfile` (snapshot on subscribe, live events, a snapshot again on every reconnect; tested in `wallet/services/profile/client-subscribe.test.ts`); used by `popup/windows/logger/index.vue:34` | **reuse-as-is** in `popup/windows/json/index.vue` |
| Write a confirm request | `popup/pages/settings/security/export/full.vue:449` assigns a whole object to `cacheStore.confirm`; `composables/useLockWallet.ts:58` re-reads the slot per access; no `requestConfirm`/`useConfirm` exists (searched `requestConfirm\|useConfirm` over `src/`) | **adapt**: whole-object assignment in `useDuplicateConfirm` |
| Opt-in screenshots in an e2e run | `tests/e2e/fixtures/send-page.ts:223` `shotSend(page, name, focus)`: writes both themes when `NULO_E2E_SHOT_DIR` is set, no-op otherwise | **reuse-as-is** |

## What the code does today

- **#577.** `components/Header.vue:39,138-139,204` keeps a `showNode` ref (read once with raw `getValue`, updated on `onUpdate`) that the template never reads; the chip (`:279-290`) always renders `network_label`. `popup/pages/settings/display.vue:53-57` writes `showNode` (default `true`, `wallet/config/config.ts:16`). The Display toggle has no testid (`:230` names only `animations-toggle`).
- **#565.** Five download call sites: `LogsViewer.vue:138-140` (no user value), `account.vue:190` (sanitized), `full.vue:429-433` (first space only), `useContactImportExport.ts:124-134` (raw name), the sink. Name pins: `account.test.ts:124`, `useContactImportExport.test.ts:365` (`p_contacts.json`), prefix regexes in `full.test.ts:226,332,522` and `full-passkey.pins.test.ts:457,557`. `useContactImportExport.test.ts:50` and `useContactImportExport.pins.test.ts:39` mock `@/utils` with explicit factories (no `importOriginal`); `utils/index.ts` re-exports `./files`.
- **#566.** `popup/windows/json/index.vue:27-37` reads the payload, then adds a live `onActiveProfileChanged` handler. The window runs inside `popup/app.vue` (route `windows-json`, no `<route>` block). On a live lock `popup/locked-state.ts` `land` routes to `/popup/auth` unconditionally. On a reconnect boot `popup/lock-landing.ts` `decideLockLanding` returns `settle` for a route without `isAuthRequired`, so nothing moves. `DappInteractionService` keeps interactions across a lock (`wallet-sdk/profile-switch-teardown.ts:123-125` does nothing on lock), so `getInteractionPayload` still answers after one.
- **#567.** `composables/useProfileImportFlow.ts:100` captures `cacheStore.confirm` once; `ConfirmPopup.vue:45` replaces it with `{}` on close (pinned by `ConfirmPopup.test.ts:84`). Callers of the duplicate path: `onboarding/pages/import.vue:97` and `popup/pages/import.vue:136` (seed, passkey, and the full-backup restore through `useFullBackupImport.ts:322` `confirmDuplicate`). `popup/pages/restore-again.vue:23` imports only `cappedBackupPick` and `useImportErrorState`, not the duplicate path.

## Collisions

| Lead | Overlap | Effect |
|---|---|---|
| harden-quality-fixes-1 (PR opening today) | `Header.vue`, `Header.test.ts` (deletes `showNode` and the task pipeline), `useContactImportExport.test.ts:12` (import line only) | arc 1 branches from `dev` after that PR merges; it re-adds the `showNode` read on its new base |
| harden-security-fixes-2 arc 1 | `full.vue:347-353` (backup authenticator) | a different hunk from `:429`; merge `dev` before delivery |
| home-onboarding-2 arc 2 | `SubPageHeader*`, onboarding `presto` page | none: #567's change is in the composable, not the import pages |
| execute-popup-readability, send-fees-ux | `popup/windows/execute/**`, `FeeSettingsCard.vue`, Send | none |

Open issues read: #543 (confirm helper, owner A on page 21, no arc; #567 says it closes #567 if it lands first), #558 (the dead Header paths). Closed `known-limit` searches (`file name`, `filename`, `network name`, `header chip`, `json window`, `lock window`, `confirm dialog`, `duplicate`): nothing in these areas.
