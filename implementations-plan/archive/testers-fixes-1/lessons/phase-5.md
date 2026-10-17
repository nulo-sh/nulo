# Phase 5: content is selectable (#580)

Inventory: one Sonnet explorer over every `.vue` under `apps/extension/src` and `packages/design/src` (click targets without control semantics, rows, role-bearing value spans, labels and form widgets, existing `user-select`, single-line `overflow: hidden` boxes). Verdicts by D1's rule; "global" means the base.css rule (tag, ARIA role or `.material-symbols-outlined`) already covers it.

## Verdicts

| Site | Kind | Verdict |
|---|---|---|
| `Navigation.vue` `.wrapper` (bottom nav links, label + icon ligature) | nav | control: `none` |
| `ActionButtonsView.vue` `.button` (SEND, RECEIVE: `Flex` with `@click`) | button | control: `none` |
| `SendTypesCard.vue` `.toggle_pair` (PRIVATE/PUBLIC) | toggle | control: `none` |
| `DropdownItem.vue` `.wrapper`, `DropdownTrigger.vue` `.wrapper`, `DropdownRoot.vue` `.trigger` | menu item, menu trigger | control: `none` |
| `LogsToolbar.vue` `.filter_button`, `.filter_content_item`; `LogsViewer.vue` `.scroll_btn` | toolbar items | control: `none` |
| `GrantedCapabilitiesList.vue` `.grant_header` | accordion header | control: `none` |
| `SettingItem.vue` `.interactive` (link, external and click modes) | row | control: `none`; inert rows (no handler) stay text |
| `SettingField.vue` `.wrapper` (profile field rows, always clickable) | row | control: `none` |
| `settings-row.module.css` `.row` (`ContactRow`, connected-apps rows; both `RowTarget` rows) | row | control: `none`; the sender chip inside is covered |
| `record-card.module.css` `.card` (`AuthwitCard`, the notes cards) | row | control: `none` |
| `TokenCard.vue` `.link` | row | control: `none` |
| `TransactionCardLayout.vue` `.interactive` (every activity card that opens) | row | control: `none` |
| `AccountSelectRow.vue` `.row`, `DetailsTable.vue` `.row`, `ImportContactsPopup.vue` `.contact` | toggling rows | control: `none`; the rename input stays editable (an editable element's `auto` is `contain`) |
| developer `index.vue` `.logs_row`, `.state_link` | rows | control: `none` |
| `ScopeAddress.vue` `.addr`, `ScopeClassId.vue` `.id` inside `role="button"` | value | text: `user-select: text` |
| `BalanceView.vue` `.arrival_chip` | chip | `none`: no click, but it keeps its text at opacity 0 once its animation ends, so a drag across the hero would copy text no screen shows |
| `Badge.vue` | status badge | text (deviation: D1 listed it as a chip; it has no handler, so by the rule it informs) |
| `AuthMethodTabs` (button, `role="tab"`), `Checkbox.vue` and `LegalConsent.vue` (`role="checkbox"`, label inside), `RecipientField` (`role="option"`), `SelectTokenCard` (`role="button"`), `TxFeeRow`, `IncomingTrustPopup` contract toggle, `AmountCard` unit pair, `FeePriorityRow`, `FeeMethodSelector` trigger, `AuthProfilePill`, `StaleNetworkTakeover` chip, `TokenList` add-token button | controls | global |
| `Popup.vue`, `StaleNetworkConfirm.vue` `.close_area`; `PopupCard.vue` `.handle_zone`; `JsonViewer` and `EditFpcPopup`/connected-apps icon clicks | backdrop, handle, svg icons | no text: no rule needed |
| `Input.vue` `.base`, `AmountCard.vue` `.wrapper` (click focuses the field) | field | text |
| `AddressDisplay`, `TxHashRow`, `TxDebugPanel`, `tx/[id]` and `received/[id]` copy spans and address cards, `ReceivePopup` address, `TokenMetadataPopup` contract, About's version lines | copy on click | text (D1) |
| Standalone action links: `detail-page.module.css` `.hero_link` ("View on …", "Copy hash"; `IncomingTrustPopup` `.contract_link` composes it), `register.vue` `.link` (Terms, Privacy) | link as a control | control: `none` (Codex r1: an action label, not prose) |
| Inline links (`TokensView` view all, `RecentActivityView` archive link, `LegalConsent` inline links) | link in text | text: doubtful, the owner's default |
| `ScopeAddress`, `ScopeClassId`, token page hero: a click copies | copy on click, selectable | a click whose drag selected text inside skips the copy (`selectedWithin`); Enter and Space still copy (Codex r1) |
| `Tooltip.vue` bubble | tooltip | unchanged: its `mousedown.prevent` already keeps selection out |
| `BalanceView.vue` `.hero_ruler` | hidden measure | unchanged: `visibility: hidden` text joins no selection |

## Other lanes' files (recorded, not edited)

- `Header.vue`: every control is a native `<button>`: global. Its `account_label` and `network_label` ellipsis boxes sit inside buttons, so no drag reaches them. The address copy row is a `<button>` too, so its address takes no selection, unlike the copy-on-click values D1 keeps as text; the drag test leaves it unpinned, for its lane to decide.
- `SubPageHeaderBase.vue` `.title`: an ellipsis box on selectable text; see the sweep below.
- `popup/windows/execute/index.vue:680`: an svg icon with a click, no text. `OperationCard.vue:568`, `FeeSettingsCard.vue:990`: `overflow: hidden` containers; see the sweep.
- `send.vue`, `SettingsPageShell.vue`, `SubPageHeader.vue`: nothing to change.

## Sweep

A scratch spec over 22 popup routes, the token metadata popup, the receive sheet and every onboarding step, Chrome 152 and Firefox 153, dark and light: per page it lists text with a pointer cursor that still selects, every selectable ellipsis box that a drag past its edge can scroll, and the text a select-all copies. A hostile token (an RTL override and a 100-character name) was seeded into the token list.

- Pointer over selectable text, first pass: "View history" (`RecentActivityView` `.archive_link`) and, by the same reading, `TokensView` `.view_all`. Both are standalone action links, as `.hero_link` is: `user-select: none` (`77a1a3e0`).
- Shifting box, first pass: Manage Tokens' row description (`SettingItem` `.description`, the token name in an inert row). `SettingItem`'s `.title` and `.description` now clip instead of hiding (`77a1a3e0`); screenshots before and after match apart from the per-run header address. No shifting box on either browser after it.
- What still flags is D1's copy-on-click text: About's version lines, the transaction page's from/to cards, hash link, nonce and contract, the metadata popup's contract address, the receive address. Their click copies at the end of a drag, as it did before the change (a press and release on one element always clicked); the selection is what is new. Only the scope rows and the token hero skip that copy (`selectedWithin`); the rest is a follow-up issue.
- Hostile name: the metadata popup wraps it, so nothing clips, and a selection copies the stored name whole on both browsers.
- No page failed on Chrome; on Firefox the scratch spec's own `page.reload()` stranded the page (FIREFOX.md's known process swap), and the rerun through `reloadExtensionPage` passed.

## The drag test

- The first run selected nothing on either dist. Cause: `textEdge` pressed on the first glyph's exact middle, and Chrome 152 starts no selection from a press between a glyph's middle and about half a pixel right of it, even for a 40 px drag along the line: only a caret follows the pointer. 0.1 px left of the middle, or 3 px right, selects. A drag made of one single move also leaves a bare caret. The press now sits a quarter in from the character's outer edge.
- Firefox 153.0.4 keeps the text a drag ends on even inside a `user-select: none` control (`SETTINGS`, `ACCOUNT 1`), while a control the drag crosses is excluded; Chrome keeps neither. Nothing selectable lies past the nav or above the header, so those two drags end on a control and ban only the controls they cross. Recorded in `tests/e2e/FIREFOX.md`.
- Red (`37214bb3` rules, no scroll memory), Chrome and Firefox: the restore fails (left at 609, back at 0) and the nav drag selects `SEND`, `RECEIVE` and every tab's ligature and label. Green, both browsers: 8/8.
- Home's empty state "Tap to import your first token." copies without "Tap": that word is the add-token `<button>`, so the control rule takes it, as D1 intends for a control.

