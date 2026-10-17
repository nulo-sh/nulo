# sheet-1 recon

Base: `dev` at `1b93cbfa`. Three read-only Explore agents (Sonnet): the popup inventory, the setting's retirement map, the reuse sweep. The planner re-read every load-bearing line cited below. All paths are under `apps/extension/` unless they name a package.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| The sheet (scrim, trap, Escape, stack order) | `src/components/Popup/Popup.vue` | adapt: the light scrim rule, the in-place transition |
| The card (accent edge, handle, height) | `src/components/Popup/PopupCard.vue` | adapt: content height, no handle, the ledge |
| Content height with scroll inside | the card is already `overflow: auto`, `flex: 0 1 auto` when the setting is off; `Popup.vue:148-153` `.close_area { flex: 1; min-height: 40px }` caps it | reuse-as-is: remove only the `flex: 10` branch |
| Dark scrim | `--scrim-popup: rgba(10, 9, 8, 0.8)`, `packages/design/src/base.css:82`, dark block only; light inherits it (`base.css:78` comment) | reuse-as-is for dark |
| Light scrim, the page background at 70% | `--app-bg` is `#f5f5f7` in light (`base.css:120`); `color-mix(in srgb, var(--app-bg) 72%, transparent)` is already a backdrop in `src/components/passkey/PasskeyCeremonyDialog.vue:123` | adapt: a `:global([theme="light"])` rule on the scrim |
| Theme-scoped module rules | `:global([theme="light"])` in 9 SFCs, e.g. `ConfirmPopup.vue:167`, `pages/general.vue:108`, `packages/design/src/ui/Banner.vue:157` | reuse the pattern |
| The ledge colour | mockup `--hardx`: dark `rgba(248,241,231,.3)` = `--nulo-accent` (`#f8f1e7`, `base.css:54`) at 30%; light `#c9c5bd` = `--nulo-outline` light (`base.css:134`) | reuse the tokens through `color-mix` |
| The 1 px line above the card | mockup `box-shadow: 0 -1px 0 0 var(--outline)`; repo spelling `--nulo-outline` | reuse the token |
| A hard 0-blur offset shadow | none: every `box-shadow` in `apps` and `packages/design` is blurred or a 0-offset ring (searched `box-shadow\|drop-shadow`, 12 sites) | build new: one declaration on the card |
| Shadow or elevation tokens | none in `token-contract.ts` | not needed |
| "No rise" transition | `.slide-*` (translate 40 px + opacity) and `.slideopacity-*` (opacity only), `base.css:266-291`; only `Popup.vue:104,107` uses either (searched `"slide"`, `slide-enter`, `slide-leave` over `apps`, `packages`) | reuse `slideopacity`; `.slide-*` becomes dead |
| `disableAnimations` | `popup/app.vue:113-115` sets `noanimations` on the root; `base.css:357` `.noanimations * { transition: none !important }` | reuse-as-is |
| Snack placement over a sheet | `src/composables/snackInset.ts:57-71` registers `Popup`'s full-viewport wrapper and measures footers live; never the card | reuse-as-is |
| A sheet primitive in `@nulo/design` | `Popup.vue` imports `managers` (`refreshSession`), `vSnackSheet`, `focus-trap`, teleports to `#popup`; no modal or sheet in `apps/landing` or `apps/playground` (searched `modal\|sheet\|<Popup\|dialog` in their `src`) | do not move (D1) |
| Type roles | `Popup.vue` and `PopupCard.vue` set no font property | nothing to do |
| Complexity baseline | no `biome-ignore lint/complexity` and no manifest entry for any touched file | nothing to do |
| Screenshots | `shotSend` (`tests/e2e/fixtures/send-page.ts:221-245`), opt-in by `NULO_E2E_SHOT_DIR`, shoots both themes | reuse-as-is |

## Popup inventory (the owner's page 30 question: which popups use full height?)

The card height today: `flex: 10` when the Full-height setting is on (default `true`, `src/wallet/config/config.ts:17`), and **forced on whenever `window.innerHeight > 600`** (`src/composables/fullscreenPopupSetting.ts:28-29`), so the side panel always fills. With `flex: 10` the card takes its content plus 10/11 of the free space; `.close_area` keeps the rest (40 px floor). The flex only adds empty space below the content: no descendant gets a definite height from it.

| Sheet | Card | Props | Class |
|---|---|---|---|
| `AccountsPopup`, `ChangeAuthwitsRegistryPopup`, `ConfirmPopup`, `DataViewerPopup`, `EditProfilePopup`, `ForgotPasswordPopup`, `IncomingTrustPopup`, `NewSenderPopup`, `ReceivePopup`, `RevokeAuthwitsPopup`, `SelectProfilePopup`, `SelectTokenPopup`, `TokenMetadataPopup` (all `src/popup/components/popups/`) | `PopupCard` | `displaceIdx` | content height; a long list grows and the card scrolls |
| `FormPopup` (`src/components/composite/FormPopup.vue:28`) and its 11 consumers (Edit/New Account, Contact, Endpoint, Fpc, Network; New Token) | `PopupCard` | `displaceIdx` | content height |
| `SendReviewSheet` (`src/popup/components/modules/send/SendReviewSheet.vue:113`) | `PopupCard` | `fit` | content height already; the handle expanded it for one open |
| `ImportContactsPopup` | `PopupCard` | `displaceIdx` | inner scroll: `.wrapper`, `.section_wrapper`, `.contacts_section` are `flex: 1; min-height: 0`, the last `overflow: auto` (lines 315-334). The card's slot Flex never grew, so the chain resolves to content until the card meets the frame cap; then the list scrolls inside and the header and buttons stay. Same mechanism as today. |
| `StaleNetworkConfirm` (`src/components/stale-network/StaleNetworkConfirm.vue:46`) | its own centred `.card` (outline border), a mirrored lower `.close_area` | `Popup` only | never read the setting |

- **No popup needs the frame's height.** `DataViewerPopup`'s `JsonViewer` sets `height: 100%` (`JsonViewer.vue:125-135`) on an auto-height chain, so it was content height before too. The one editor with a definite height (`LogsViewer.vue:297`, `100vh`) lives in the logger window, not a sheet.
- **The full-screen views are routed windows, not sheets**: `popup/windows/{execute,fee,json,logger,capabilities,discover,network-unavailable,verify}` and the stale-network takeover.
- `large` has no caller (searched `<PopupCard[^>]*\blarge\b` over `apps`, `packages`).
- Overlays that are not `Popup` and stay unchanged: `LegalAcceptanceSheet.vue` (its own content-height sheet on `--scrim-sheet`), `DappCancelledOverlay.vue` (dApp windows, reads `--scrim-popup`), `PasskeyCeremonyDialog`, the barriers, `NotificationManager`, `Dropdown`, `Popover`, `Tooltip`.

## The setting's retirement map

| Site | Change |
|---|---|
| `src/wallet/config/config.ts:17` | delete the key; `Config`, `ConfigKey`, `ConfigProp` follow |
| `src/wallet/services/config/spec.ts:19` | delete from `RESTORABLE_CONFIG_KEYS` |
| `src/composables/fullscreenPopupSetting.ts` and `.test.ts` | delete |
| `src/types/auto-imports.d.ts:427,1150`, `src/types/.eslintrc-auto-import.json:634` | regenerated by the extension build |
| `src/popup/pages/settings/display.vue:35,50` | delete the ref and the row; the row loop is generic |
| `src/utils/settings-search.ts:270-277` | delete `display-full-height`; `SettingsRowId` follows |
| `src/utils/settings-search.test.ts:22-28,37-39,60-63,85` | re-point (the "full", "eight", same-field order and `settingsResultTo` cases) |
| `src/popup/components/modules/settings/SettingsSearch.test.ts:36-58,131-146` | re-point the "full" queries |
| `tests/e2e/settings-routes.test.ts:66-110` | re-target (D6) |
| `src/components/Popup/PopupCard.test.ts`, `src/components/composite/FormPopup.test.ts:27-29,47`, `src/popup/components/modules/send/SendReviewSheet.test.ts:32-33,101` | drop the setting stub, the module mock, `large`, `fit` |

- **A stored value is dropped.** Config is one object under `nulo:config` (`src/wallet/config/store.ts:11,17`). `apply` reads only schema keys (`store.ts:99-112`) and the load writes the whole object back (`store.ts:95`), so a stale `showPopupFullscreen` is ignored, then gone after the first boot. No test loads a key outside the schema.
- **An old backup still imports.** `configSliceToStored` keeps any key (`services/backup/backup-migration-registry.ts:167-187`, pinned by its test at `:73-81`); `ConfigService.restore` skips a key outside `RESTORABLE_CONFIG_KEYS` with a `logWarn` and goes on (`services/config/service.ts:69-70`, pinned by `service.test.ts:30-54` with `totallyUnknownKey`).
- No e2e reads the handle or toggles the setting; the only e2e is the settings search one. The storage baseline needs no change (`storage/migrations/index.ts`: `BASELINE_VERSION = 1`, no real migrations).
- Settings search after the removal: `display-side-panel` is the only row that "full", "screen", "popup", "panel", "side" or "dock" find (computed with `searchSettings` over the registry minus the retired row), and no query finds it beside another row. Its synonym `fullscreen` stays: not part of the picks.

## E2E that touch the sheet's geometry

- `tests/e2e/fixtures/popup-leave.ts:15-35` and `send-page.ts:228-233` match `/leave/` and `/enter/` on `#popup > *` and `[class*='dark_bg'i]`: `slideopacity-*` keeps both.
- `tests/e2e/fixtures/address-book.ts:32` names `slide-enter-from slide-enter-active` in a comment.
- `tests/e2e/snackbar.test.ts:380-420` presses Receive's address and expects the success snack to open under the still pointer: it depends on where the address sits in the card.
- `tests/e2e/popup-stack.test.ts` hit-tests a lower popup under a top one; the top `Popup` wrapper covers the frame whatever the card height.
- `tests/e2e/network/snack-placement.test.ts:469-545` measures the snack against footers, live.

## Open work and collisions

- `gh issue list --state closed --label known-limit --search "popup sheet"` and `"scrim OR full-height OR fullscreen"`: no sheet limit.
- #590 is the lane's issue; its icon part ships in icons-d2-1's last PR (arc 1 merged as #641).
- #520 dedupes `display.vue`'s `updateSetting`; this lane deletes two lines there.
- Leads running now: type-scale-1 (type roles; this lane adds none), icons-d2-1 arc 2 (`glyphs.ts` only), testers-fixes-3 (activity cards), onboarding-3 (Home checklist, banner).
