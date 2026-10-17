# icons-d2-1: recon

Read at dev `493ff497` on 2026-10-16 by three Sonnet explorers (call sites; font, notices and build; tests and screenshots), checked by hand where the plan leans on a claim. Paths are repo-relative; `E/` is `apps/extension/src/`, `D/` is `packages/design/src/`.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| Glyph component, `<Icon name size color>` | `D/core/Icon.vue` (24-unit viewBox, `role="img"`, `fill--<color>` class, `hoverColor`, `rotate`, `loading`; `fill` and `scale` props have no caller) | adapt: same tag and props, new geometry source and paint model |
| Glyph data | `D/internal/icons.json` (104 fill-only paths, Azguard header, 51 never used) | build new (`D/core/glyphs.ts`): #602 B retires the file; the glyphs are original |
| A stroke-glyph renderer in-house | `E/components/stale-network/StaleIcon.vue` (`PATHS: Record<IconName, { d: string[]; width }>`, stroke `currentColor`, `aria-hidden`) | precedent for the data shape; the component retires into the set (plan D6: its paths share endpoints with Lucide icons) |
| Colour classes | `D/utilities.css` `.color--*` and `.fill--*`, both generated from `textColors` (`D/token-contract.ts:172`) by `D/internal/render-css.ts:46-47` | reuse `.color--*`; `.fill--*` has no user but `Icon.vue` once it paints by `color` (decision D3) |
| Status colour map | `E/components/composite/activity/status-icon-fill.ts` (`STATUS_ICON_FILL`) | reuse as is |
| Icon-name tables in TS | `E/utils/journal-state.ts:48-67` (`ICONS`, comment demands keys of icons.json, no test), `E/popup/windows/capabilities/permission-rows.ts` (Material names), `E/components/composite/send/publish-facts.ts:118` (`publishGlyph` → lock/globe), `E/utils/presto-ui-state.ts:253-255` (Settings row icons) | adapt: type each as `GlyphName` |
| Two-theme screenshots | `shotSend(page, name, testid)` in `apps/extension/tests/e2e/fixtures/send-page.ts:224-247` (no-op unless `NULO_E2E_SHOT_DIR` is set; flips `<html theme>`) | reuse in a capture spec that is copied in for the run and never committed |
| Glyph sheet for review | none (no Icon story; searched `*.stories.ts` for `Icon`, `MaterialIcon`) | build new: `D/core/Icon.stories.ts`, every glyph at 24 and 12 px |
| Name guard | none: `Icon` renders an empty svg for an unknown name (`journal-state.ts:48-58` records two names that shipped blank) | build new (decision D4) |

## Inventory (what the lane replaces)

- **`<Icon>`**: 176 tags in 88 `.vue` files, about 55 live names (the 104 keys minus 51 dead). Dynamic names come from ternaries (selected/copied/revealed pairs), `journal-state.ts`, `publish-facts.ts`, `TransactionCard.vue:53-72`, `display.vue:184` (moon/sun/settings) and the forwarding props `SettingItem.icon`, `SettingField.icon`, `Input.icon` (`search`), `Button.leftIcon/rightIcon` (stories only), `TransactionCardLayout.icon` + `iconRotate`.
- **`<MaterialIcon>`**: 46 tags in 35 files, about 45 ligatures, plus `SettingItem.materialIcon` (Settings hub `E/popup/pages/settings/index.vue:131-260`, 15 rows and a `delete` slot at :274; `lock.vue:174`; `connected-apps/[id].vue:263`; `developer/account-state/index.vue:16-43`; `proving.vue:83,93`), `Navigation.vue:11-29`, `PermissionRow.vue:39` (10 names from `permission-rows.ts`), `SubPageHeaderBase.leadingIcon` (`tokens/[id].vue:217`), `PasswordVisibilityToggle.vue:23`. `filled` has no caller.
- **Surfaces**: nav; Home (header copy + Lock, balance marks `BalanceView.vue:360,370`, token rows `TokenCard.vue:101,104`, menu `TokensView.vue`, activity cards); Holdings and the token page; Send (`RecipientCard`, `RecipientField`, `SelectTokenCard`, `FeeSettingsCard`, `FeeMethodSelector`, `PublishStrip`, `SendReviewSheet`); Receive; Activity and detail pages; Settings and sub-pages; the windows (`execute/`, `capabilities/` permission rows, `json/`, `logger/`); passkey; onboarding (lock, back link, done page's puzzle); auth/register/declined; toasts; banners. `windows/verify` (the connection check) has no icon of its own. Landing and playground use no icon (searched `<svg|material|icon` in their `src` and `index.html`).
- **Odd sites**: `settings/privacy.vue:141` passes `chevron-down`, not a key, so it renders blank today next to `DropdownTrigger`'s own chevron; `display.vue:202-214` and `privacy.vue:153,163` pass `''` as an invisible spacer for unselected options; `BarrierOverlay.vue:13` passes `color="--red"` to MaterialIcon, which yields the class `color----red` that matches nothing, so the glyph renders in the inherited colour; `senders/index.vue:120` sets an inline `fill: var(--green)`.
- **CSS that paints an icon through `fill`**: `D/ui/Banner.vue:98-119`, `D/ui/Toggle.vue:92`, `D/ui/RowAction.vue:51-57`, `D/ui/Button.vue:281-407`, `D/ui/Input.vue:476`, `LogsToolbar.vue:150-221`, `LogsViewer.vue:326`, `DropdownTrigger.vue:129`, `EditFpcPopup.vue:304`, `connected-apps/[id].vue:385`, `connected-apps/index.vue:218-220`, `networks/index.vue:93`, `AddressCardLink.vue:25-30`, `detail-page.module.css:82-89`, `tokens/[id].vue:329-335`, `Icon.vue`'s own hover rule. No rule targets `stroke` or `path` (searched `stroke:`, `path {`).

## Material and icons.json wiring (what the lane deletes)

- Font: `D/fonts/MaterialSymbolsOutlined.woff2` (343628 bytes); `@font-face` and `.material-symbols-outlined` at `D/base.css:38-66`; `D/base.css.test.ts:10-22` pins the SHA-256 of the whole of `base.css`.
- Notices: `VENDORED` record `packages/third-party-notices/src/policy.ts:321-334`, its text `texts/material-symbols.Apache-2.0.txt`, the line `expected-minimum.txt:53`. `generate.ts:198-201` refuses a record that matches nothing, and `generate.test.ts:467-473` requires the shipped fonts to equal the reviewed font hashes, so file and record go in one commit. The Azguard `DERIVED` record (`policy.ts:337-346`) stays: many other files carry its header.
- Component plumbing: `D/index.ts:19`; `apps/extension/scripts/design-resolver.ts:14` and `design-resolver.test.ts:19-21`; generated `E/types/components.d.ts:60` (written by the extension's Vite build, `vite.config.ts:129`); `D/mount-all.test.ts:6,34`; the carve-out `apps/extension/scripts/type-roles/exceptions.ts:119-124` (`type-role-ban.test.ts:671-677` fails on a carve-out that matches nothing); `Settings.stories.ts:7`; docs `CLAUDE.md` (L1 line), `packages/design/README.md:13`.
- icons.json: `Icon.vue:5`; `ACKNOWLEDGEMENTS.md:27`; the comment `journal-state.ts:48-58`.
- CSP: no `font-src` (falls to `default-src 'self'`, `apps/extension/manifest/manifest.config.ts:47-62`); inline `<svg>` needs no CSP change. No bundle-size test exists (searched `343|bundle.?size|size.?budget|size-limit`).

## Tests the swap touches

- Rewrite: `D/core/Icon.test.ts` (pins `fill--primary`, path counts of `external-link`/`copy`); delete `MaterialIcon.test.ts`.
- Real renders that read a ligature's text: `CapabilityDisclosure.test.ts:73`, `DetailsTable.test.ts:77` (and span-order reads at :36,:44,:120,:144), `PermissionRow.test.ts:30`, `PasswordVisibilityToggle.test.ts:13-27`, `apps/extension/tests/helpers/credential-pins.ts:23-53` (ten consumers).
- About 45 stub tests pin names (`data-name`), listed by the tests explorer: Header, DappIdentityBlock, BarrierOverlay, ProcessingErrorNote, the activity cards, PublishStrip, FeeMethodSelector, SendReviewSheet, RecipientField, SecretRevealCard, Settings, PopupHeader, SubPageHeader, Dropdown, Button, OnboardingBackLink, AuthProfilePill, BalanceView (`["lock","globe"]` and their aria-labels), TokenCard, the FPC and token popups, FpcRow, senders, AccountSelectRow, ImportSecretForm, `permission-rows.test.ts:148,159`, `publish-facts.test.ts:93-96`, `journal-state.test.ts:42,238,277`, and the design `Checkbox`, `Toggle`, `Input`, `SubPageHeaderBase`, `ToastManagerBase`, `Banner`, `FieldWarning` tests.
- e2e: `send-outcome-rows.test.ts:95-101` asserts the computed `fill` of `activity-status-icon` equals the status line's `color` in both themes; `network/cap-window.test.ts:208-211` reads the transition of `cap-disclosure-chevron`. No e2e reads a ligature or `material-symbols` (searched the ligature names, `material`, `svg path`). The type-role sweep checks only the three `--font-*` faces.
- Complexity baseline: no entry in any icon file (searched `icon|material` in `scripts/complexity-baseline/manifest.json`).

## Collisions

- **#613 (settings-search-1, merging tonight)** edits `settings/index.vue`, `display.vue`, `privacy.vue`, `lock.vue`, `developer/index.vue` and their tests: the rows that lose their icons. The arc rebases onto it.
- **type-scale-1** owns `D/token-contract.ts` (`typeRoles`), generated `D/tokens.ts` and `D/utilities.css`, `scripts/type-roles/*` except the one carve-out this lane deletes, and the Text stories. Both lanes touch many of the same SFCs on different lines. Shared files: `D/utilities.css` (generated) when D3 lands; `D/base.css` and its hash pin only if type-scale-1 edits `base.css`.
- **testers-fixes-2** changes Home's layout (`BalanceView` hero, `general.vue`): arc 2's hero arrows rebase onto it. **emoji-match-1** edits `windows/verify`, which has no icon.

## Design source

- Sheet: `~/.cache/nulo-backlog/program-2/shots/vd-gs-d2.png` (22 glyphs, both themes) and `vd-inplace-d2.png` (Home, Send, Settings). Geometry: `~/.cache/nulo-backlog/program-2/proto/build/template.html` `SETS.d2`: 24-unit grid; strokes 2.5 units, square caps, mitre joins, only 0/45/90 degree lines, no curves; stroke width `max(2.5, 1.5 * 24 / size)` so a stroke never renders under 1.5 px; knock-outs painted `var(--knock)`.
- The 20 glyphs other than the two open marks, copied here because the source file is still being edited for decision page 33 (its `private` already differs from the PNG). `S:` is a stroke, `F:` a solid block.

```
home      S: M4.25 4.25h15.5v15.5H4.25z  S: M4.25 19.75L19.75 4.25
holdings  F: M3.5 4.25h17v3.75h-17z  F: M3.5 10.125h12v3.75h-12z  F: M3.5 16h7v3.75h-7z
history   S: M4.25 4.25h15.5v15.5H4.25z  S: M12 7.75V12.5H15.75
settings  S: M3 8H21M3 16H21  F: M12.5 5h6v6h-6z  F: M5.5 13h6v6h-6z
send      S: M6.5 17.5L16.5 7.5  S: M9 6.25H17.75V15
receive   S: M17.5 6.5L7.5 16.5  S: M6.25 9V17.75H15
copy      S: M9.25 9.25h10.5v10.5H9.25z  S: M14.75 9.25V4.25H4.25V14.75H9.25
open      S: M10.5 4.75H4.75V19.25H19.25V13.5  S: M14 4.75H19.25V10  S: M19.25 4.75L11 13
remove    S: M3.75 6.75H20.25  S: M9.25 6.75V3.75H14.75V6.75  S: M6.25 6.75V20.25H17.75V6.75
edit      S: M4.75 19.25V15.25L15.25 4.75L19.25 8.75L8.75 19.25Z
back      S: M19.75 12H5  S: M11 5.75L4.75 12L11 18.25
close     S: M5.5 5.5L18.5 18.5M18.5 5.5L5.5 18.5
confirmed F: M3 3h18v18H3z  knock S(2.5): M7.5 12.25L10.5 15.25L16.5 9
pending   S: M4.25 4.25h15.5v15.5H4.25z  F: M4.25 19.75L19.75 4.25V19.75Z
cancelled S: M4.25 4.25h15.5v15.5H4.25z  S(2.25): M9.25 9.25L14.75 14.75M14.75 9.25L9.25 14.75
warning   F: M12 2.5L22.25 20.5H1.75Z  knock S(2.5): M12 9V13.5  knock F: M10.75 15.75h2.5v2.5h-2.5z
lock      F: M4.5 10.5h15v10h-15z  S: M8.25 10.5V4.5H15.75V10.5
more      F: M3.5 10.25h3.5v3.5h-3.5z  F: M10.25 10.25h3.5v3.5h-3.5z  F: M17 10.25h3.5v3.5h-3.5z
chevron   S: M9 5.5L15.5 12L9 18.5
info      S: M4.25 4.25h15.5v15.5H4.25z  S: M12 10.75V16.5  F: M10.75 6.75h2.5v2.5h-2.5z
```

## Claims that did not hold

- The lane brief names the sheet `vd-icons-sheet-b-{light,dark}.png` and in-situ frames `vd-icons-b-*`; on disk they are `vd-gs-d2.png` and `vd-inplace-d2.png`, each holding both themes. The SVG sources are on disk (`template.html`), so nothing is redrawn from pixels.
- The brief says 2 px strokes; the source draws 2.5 units with a 1.5 px floor.
- "About 35 glyphs": the sheet draws 22, and the app's live names need about 47 after collapsing (the plan's glyph table).
- #602's premise (the notices cover icons.json under Azguard's Apache-2.0 record): the record is `DERIVED`, file-agnostic; `ACKNOWLEDGEMENTS.md:27` is what names icons.json.
- #590 says the sheet "reads like another wallet's"; unverified and out of scope (P30-11 is undecided).
