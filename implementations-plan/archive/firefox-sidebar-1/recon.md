# firefox-sidebar-1 recon

Read at `993b3efc` (origin/dev). Paths under `apps/extension/` unless rooted. One Explore agent (Sonnet) plus direct reads; the Phase 0 spike's evidence is in [`plan.md` § Phase 0](plan.md#phase-0-the-spike).

## Reuse map

| Capability a sidebar would need | Existing code | Verdict |
|---|---|---|
| Manifest entry | `manifest/manifest.config.ts:32-34` `side_panel.default_path: "src/popup/index.html"` (no hash); `manifest/manifest.firefox.config.ts:16` strips `sidePanel` and spreads the rest. No `sidebar_action` anywhere (searched `sidebar_action`, `sidebarAction` over `apps`, `packages`). | adapt (add `sidebar_action` beside the strip) |
| Setting and Display row | `wallet/config/config.ts:15` `sidePanel` (restorable, `wallet/services/config/spec.ts:17`); `popup/pages/settings/display.vue:43-47` offers the row only when `chrome.sidePanel` exists, `:85-95` opens the panel then `window.close()`; `popup/app.vue:116-121` `setPanelBehavior({ openPanelOnActionClick })`, replayed at every popup boot (`app.vue:439-455`); nothing in the background reads it. | adapt (Firefox has no "open on action click": `sidebarAction.open()` needs the user input of the handler that calls it, synchronously) |
| Settings search | `utils/settings-search.ts:253-261` `display-side-panel`, visible on `context.sidePanel`; `popup/pages/settings/index.vue:56`. | reuse if the row is shared |
| Which surface a document is | `utils/browser-surface.ts`: `isFirefox()`, `passkeyNeedsOwnWindow() = isFirefox() && getViews({ type: "popup" }).includes(window)`. No sidebar or side-panel predicate (searched `getViews`, `isSidePanel`, `windowType`, `location.search` over `src`). | reuse: a sidebar document is not a `popup` view, so the predicate is already false there (spike: `getViews({ type: "sidebar" })` lists it, `popup` does not) |
| Passkey step in place vs window | Consumers of the predicate: `composables/useProfileCreateFlow.ts:72`, `composables/useProfileImportFlow.ts:204`, `popup/pages/auth.vue:114`, `popup/pages/import.vue:151`, `popup/pages/settings/security/export/full.vue:129`; the window path `wallet/services/passkey/service.ts:56-89`, `popup/windows/passkey/index.vue`, `wallet/utils/toolbar-popup.ts:90-104`. | reuse as-is: the step already runs in place in a sidebar, and the spike shows Firefox allows it there once the sidebar has focus |
| Layout at panel width | `popup/index.scss`: `body` 360 px wide and `min-width` (`--base-width`, `packages/design/src/base.css:68`), `#app { height: 100vh }`. | adapt (spike: the sidebar opens 252 px wide headless and 340 px headful, so the body overflows to `scrollWidth` 360) |
| Driving a document outside a tab (e2e) | `tests/e2e/fixtures/browser/firefox-action-popup.ts` (open the real toolbar panel from privileged scope, evaluate in it through `firefox-frame-script.ts`); `webdriver-classic.ts` `chromeScript`; `firefox.ts` `sessionAuthenticator`, `inPageRealm`; `passkey-toolbar-panel.test.ts`, `action-popup-layout.test.ts`. | adapt: opening and reading reuse it; clicking and typing need chrome-context pointer and key actions (spike) |
| Types | `chrome-types` has no `sidebarAction`; `@types/webextension-polyfill` does (the `browser.*` namespace, unused in `src`); casts as in `browser-surface.ts` are the precedent. | adapt |

## Pins a sidebar would move

- `src/manifest.test.ts:176-242` pins the Firefox manifest's id, data declaration, floor, permissions and hosts, not its full key set.
- `scripts/store-listing.test.ts:37-43` requires a listing heading per permission (a manifest key needs none); `store/listing.md:91-94,250` and `legal/privacy.md:305` describe `sidePanel` as Chrome-only.
- `popup/pages/settings/display.test.ts:91-114`, `utils/settings-search.test.ts:14-27,93-104`, `popup/components/modules/settings/SettingsSearch.test.ts:60-80`, `tests/e2e/settings-routes.test.ts:75-78` (Firefox expects `settings-search-empty` for "panel").

## Open work and known limits

- #596 (open, `enhancement`, `ux`): this lane. #593 (closed, `known-limit`): its reopening condition names "a Firefox sidebar ships".
- `gh issue list --state all --search "sidebar firefox"` and `--state closed --label known-limit --search sidebar`: only #596 and #593.
- No other open lane touches `manifest/manifest.firefox.config.ts` or `tests/e2e/fixtures/browser/` at `993b3efc` (checked against `implementations-plan/index.md`); if one lands first, arc 1 merges `origin/dev`.
