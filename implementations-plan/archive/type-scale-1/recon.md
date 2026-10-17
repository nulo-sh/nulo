# type-scale-1 recon

Base: origin/dev at 493ff497. Two Explore agents (sonnet) plus the planner's own reads; counts are `grep` counts.

## Reuse map

| Capability needed | Existing code | Verdict |
|---|---|---|
| Role records and their CSS | `packages/design/src/token-contract.ts` `typeRoles` (28); `bun run gen:tokens` writes `tokens.ts` (`typeRoles`, `typeRoleNames`, `siteSizedTypeRoles`, `TypeRole`) and `utilities.css` (one `.type--<role>` rule each); `tokens.drift.test.ts`, `utilities.drift.test.ts` pin them byte for byte | reuse as is |
| The signed values pinned | `packages/design/src/type-roles.contract.test.ts`: `BOARD_A` (34 rows of the 2026-10-08 board, `role: TypeRole \| null`), `ANSWERED` (owner departures by row), "34 rows", "every role carries a row except input", "six roles leave the size to the element" | adapt: rows keep their board values, retired rows point at the successor, the new values go in `ANSWERED` |
| Static guard | `apps/extension/src/utils/type-role-ban.test.ts` (920 lines), `type-role-ban.reviewed.json` (`{}`, empty), `scripts/type-roles/exceptions.ts` (CARVE_OUTS, OVERRIDES, both stale-checked) | adapt (role names in `IDENTIFIER_ROLES`, `passedToData`, self-test snippets) |
| Unknown role names caught | static guard: only a static `<Text variant="x">` is refused (`:405`, "not a role"); `composedRole` (`:177`) and `elementCarrier` (`:377`) drop an unknown `type--x` silently; `namedRoles` (`:372`) drops unknown literals of a bound `:variant`. E2E sweep: an element whose one `type--` class names no role fails (`fixtures/type-roles.ts:362-366`), on visited surfaces only. `Text.vue` validator warns at run time (dev only; no test fails on a Vue warning) | adapt: the static guard refuses an unknown `type--` name |
| Identifier sites | `scripts/type-roles/identifier-sites.ts` lists sites (records no role); `identifier-sites.expected.json` is hand-reviewed (129 sites: `data` 88, `data-lead` 9, `input-data` 6, `meta` 11, `none` 15); `inventory.test.ts` pins it (`Role` union `:16`, `ROLES` `:47`) and prints paste-ready `"role": "TODO"` rows; `fixtures/type-roles.ts` `SiteEntry.role` union | adapt (the role field of 88 entries; no generator writes the file) |
| Computed-value sweep | `tests/e2e/fixtures/type-roles.ts` derives every check from `typeRoles`; `type-roles.test.ts` sweeps Home, Receive, Holdings, Activity, tx detail, token page, Accounts, unlock, Send, Settings hub, Display, a network, Manage accounts, Reset, Contacts, New contact, onboarding create, the passkey dialog; `network/type-roles-windows.test.ts` the capabilities and execute windows | reuse; one probe case names `label` (`type-roles.test.ts:84-90`) |
| Layout guards | `cutFigures` (figure roles never clipped or ellipsized, `type-roles.test.ts:208`); Firefox toolbar panel: Home and Settings, no role-bearing text clipped without an ellipsis (`:552-598`); Home hero fit (`:373`); `rows.test.ts:520` (History never scrolls sideways); `network/type-roles-windows.test.ts:162` (`payloadPastCard`); `account-import-export.test.ts:66-80` | reuse as the layout gate |
| Storybook | `apps/extension/src/design/TypeRoles.stories.ts` iterates `typeRoleNames`; no `Text` story exists | reuse (follows the contract) |
| Screenshots | `NULO_E2E_SHOT_DIR` + `shotSend` (`tests/e2e/fixtures/send-page.ts:222`), both themes per call, used by several specs; store captures (`STORE_CAPTURES=1`, Chrome, dark, owner-signed bytes) | reuse `shotSend` for the PR's before/after; never rewrite the store set |
| Contrast | `theme-contrast.test.ts` uses a flat 4.5 with no large-text tier | unaffected |
| Landing, playground | no `type--` class and no `variant=` of these roles outside `apps/extension` | unaffected |

## Census (production code)

| Role | `<Text variant>` | composes | static class | bound / prop vocabulary |
|---|---|---|---|---|
| `name-tag` | 0 | 2 (`Header.vue:301`, `IdentityStrip.vue:70`) | 0 | 0 |
| `tag` | 2 | 20 | 0 | 0 |
| `label` | 68 (32 in `OperationCard.vue`; `packages/design` `Input.vue:306`) | 42 (`Banner.vue:138`, `ToastManagerBase.vue:274` among them) | 1 (`RecentActivityView.vue:857`) | 0 |
| `data` | 42 | 29 | 2 (`TokenList.vue:113`, `SendReviewSheet.vue:169`) | `AddressDisplay.vue:107` (`lead ? 'data-lead' : 'data'`); `SettingItem.vue` `titleVariant` / `descriptionVariant` (`:21,:28` validators, `:146,:150`), passed as `"data"` by `FpcRow.vue:34`, `EditFpcPopup.vue:229` and five `descriptionVariant="data"` callers |
| `meta` (edit) | 8 | 33 | 2 | 0 |
| `nav` (edit) | 0 | 1 (`Navigation.vue:93`) | 0 | 0 |

Shared modules fan a role out: `activity-card.module.css` (`.chip` tag, `.title_sep` row-title 13 px), `detail-page.module.css` (label, data, tag, fiat 11), `record-card.module.css` (label, data), `fee-shared.module.css` (label), `capability-shared.module.css` (data). No `apps/landing` or `apps/playground` source names a role (searched `type--`, `<Text`, `variant=`); the landing ships `utilities.css` through `base.css` only.

Site sizes: `fiat` is set at 11 px by six sites (`TokenCard.vue:178`, `TransactionCardLayout.vue:233`, `GasBalanceCard.vue:240`, `detail-page.module.css:2`, `FeeCostReadout.vue:104`, `TxFeeRow.vue:100`) and at 13 px by `BalanceView.vue:509`; no `<Text variant="fiat">` exists. `row-title` is site-sized from 13 to 26; Home's activity separator `.title_sep` (`activity-card.module.css:4`) is 13. `AmountCard.vue` draws the derived token line at `DERIVED_PX = 11` (`:174`, `.derived_type` `calc(11px * …)` `:626`), "its meta line's 11 px", with its carve-out text in `exceptions.ts`.

## Pinned expectations that name a retired role

`type-roles.contract.test.ts` (`BOARD_A` rows for `label` ×3, `name-tag`, `tag`, `data` ×3, `ANSWERED` meta rows at 11); `Text.test.ts:24`; `header-layout.test.ts:31,33`; `Settings.test.ts:248-278,342`; `OperationCard.long-strings.test.ts:127`; `RecentActivityView.test.ts:737`; `type-role-ban.test.ts` (`IDENTIFIER_ROLES :61`, `passedToData :466`, self-test snippets `:702-850`); `inventory.test.ts:16,47` and `fixtures/type-roles.ts:465` (`Role` unions); `identifier-sites.expected.json` (88 `data` roles); `type-roles.test.ts:84-101` (the probe pushed off `label`).

## Layout risk (sites where +1 or +2 px can clip)

- Fixed tracks: `DetailsTable.vue:148` heads "Simulate / Add / Transact" in 54 / 34 / 54 px tracks, not `nowrap`, centred; `:259` `.fn_label` in a 58 px track (capabilities window).
- Fixed boxes: `Header.vue` `.lock_chip` 26 px high; `TokenList.vue:150` `.sort` 20 px high; `StaleNetworkTakeover.vue:406` `.number` 14 px wide (data → meta 13); `IdentityStrip.vue:81` `.identity_sep` 14 px line height under meta 13; `RecipientField.vue:347` description line height 14 px under data → meta 13.
- Ellipsis caps (earlier cut, no clip): `Header.vue` network chip 120 px and account label (face Inter → Space Grotesk, tracking 0.04 → 0.1 em); `IdentityStrip.vue` account 140 px, network 96 px (meta 11 → 13); `record-card.module.css` key column 90-120 px; `BalanceView.vue:442` arrival chip 312 px.
- `nowrap` rows: the activity `.chip` (also capped at 96 px by testers-fixes-2), `PublishStrip.vue:67` cells, `FeeMethodSelector.vue:145`, `CapabilityDisclosure.vue:66`, `ToastManagerBase.vue:273` action.
- The bottom nav has room: four content-sized tabs in about 328 px, 28 px of height for the label line.

## Collisions

- type-roles-coverage (arc 1, PR not open yet): `identifier-sites.expected.json` (two entries), `fixtures/type-roles.ts`, `type-roles.test.ts` (+394 lines), `network/type-roles-windows.test.ts`, `TransactionCard.vue`, `TxDebugPanel.vue`, `tokens/[id].vue`, `FpcRow.vue`. Its arc 2 waits on approval and edits the same expected file.
- settings-search-1 (#613): adds Settings rows using `body`, `caption`, `row-title` only (diff read at `origin/worktree-settings-search-1`); no retired role.
- testers-fixes-2 (planning): Home layout, the activity row's chip cap and title ellipsis (`activity-card.module.css`, `TransactionCard*.vue`), the details App row.
- icons-d2-1 (planning): `@nulo/design` `Icon.vue`, `MaterialIcon.vue`, `icons.json`, `packages/third-party-notices`, and `<Icon>` / `<MaterialIcon>` elements at call sites, which share files with role sites (`Header.vue`, `Navigation.vue`, `TokenList.vue`, Settings rows).
- Store art: `apps/extension/store/` holds the owner-signed set (#364, page 24 SA-1 A); it goes stale again after this lane.

## Search trail for absence claims

- Landing / playground roles: `grep -rn "type--" apps/landing apps/playground`; `grep -E "<Text|variant=" apps/landing apps/playground` (source, HTML, CSS): none.
- A generator for `identifier-sites.expected.json`: no package script writes it; `inventory.test.ts:157-163` prints paste-ready rows with `"role": "TODO"`.
- A `Text` story: `find . -name "*.stories.*" -not -path "*/node_modules/*"` (35 stories): none for `Text`; only `TypeRoles.stories.ts` names roles.
- A retirement rule in the type-roles plan: `grep -niE "retire|new role|remove a role|drop a role"` over `implementations-plan/archive/type-roles/`: none; its ledger 18 says two board rows share a role only when all values are equal.
- A whole-page sideways-scroll sweep: `grep -rnE "scrollWidth|clientWidth|overflow-x|horizontal"` over `apps/extension/{tests,src,scripts}`: only History (`rows.test.ts:520`) and the files named under Layout guards.
