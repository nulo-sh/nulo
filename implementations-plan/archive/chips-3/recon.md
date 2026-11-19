# chips-3 recon

Base: `origin/dev` at 0bfd2c088. One Explore pass (sonnet) plus the planner's own reads. Paths are under `apps/extension/` unless they name a package.

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| The row layout every activity card composes | `src/components/composite/activity/TransactionCardLayout.vue`; four consumers only: `TransactionCard.vue` (settled), `TransactionIncomingCard.vue`, `TransactionAwaitingCard.vue`, `TransactionTerminalCard.vue` | adapt: the icon box gains the glyph pair and the corner badge |
| The status badge's ring and offset | `.badge` in the layout (`top/right: -6px`, 2 px `--app-bg` ring, content-box) | reuse: the corner badge is `.badge` moved to the bottom |
| Glyphs `private`, `public`, `forward`, `send`, `receive`, `swap` | `packages/design/src/core/glyphs.ts:33,34,53,86,91,209` | reuse as-is; no new glyph |
| A transfer's two sides | `TRANSFER_TYPES` in `src/utils/tx-enrichment.ts:113-126` (number and name keys → kind, direction label) | adapt: each entry also names its from and to side |
| A receipt's sides | `LABELS` in `src/utils/received-display.ts:39-49`, keyed by `ReceivedType` | adapt: a sibling map names each type's sides |
| Journal transfer fields | `transferCardFields`, `journalCardTransferTypeLabel` in `src/utils/journal-state.ts:465-518`; the record holds `transferType`, `recipientAddress`, `accountAddress` (`src/wallet/services/operation-journal/spec.ts:66-106`) | adapt: one more field, the row's direction |
| Visually hidden text | `.visually_hidden` in `src/popup/components/modules/send/fee-shared.module.css:20-30` | copy the rule into `activity-card.module.css`: a composite cannot import from `popup/` |
| Real-browser row geometry | `tests/e2e/rows.test.ts` (`readRows`, `readTwoChipRow`, `readReceiptChip`, `shotSend`) | adapt: the chip measurements become the icon box's |
| The prototype | `worktree-shots-p117b` (C2) and `worktree-shots-p117d` (sizes): props `iconPair`, `pairWay`, `cornerGlyph`, `pairSize`, `cornerSize`, and `directionGlyphs`, which parses the label | rewrite: types, not label parsing; one prop; constant sizes |

No existing two-glyph icon box (searched `iconPair|icon_pair|glyph pair|activity-icon` over `src/` and `packages/design/src`).

## The direction today

- Settled: `formatTransferType(transfer.type)` → "Private → Private", "Private → Public", "Public → Public", "Public → Private" (`TransactionCard.vue:107-110`), shown as `activity-direction-chip` and bound as `data-tx-transfer-type`.
- Receipt: `receivedLabel(type)` → "Received privately", "Public → Public", "Private → Public", "Mint (public)", shown as `tx-incoming-kind-chip`, green, wrapping under the title where the line has no room (`wrapTrailing`).
- Awaiting and terminal: the same label from the journal record's `transferType`, in an untested chip with no testid; dApp ops carry only the app chip.
- A dApp transfer's two chips sit at 10 px / 600 / 0.08 em through `.chips` and `.app_slot` and three type-role `OVERRIDES` (`scripts/type-roles/exceptions.ts:35-38,230-257`); the app chip shrinks to a 19 px floor and drops under the direction chip.
- The row's link is named by the title alone (`RowTarget :labelledby`); no aria string is built for a row.

## Who reads the chips

- Unit: `TransactionCard.test.ts:150-177,229,236`, `TransactionIncomingCard.test.ts:104-111,164`, `TransactionAwaitingCard.test.ts:125,136`, `TransactionTerminalCard.test.ts:129-159`, `RecentActivityView.test.ts:908-1025`, `journal-state.test.ts`, `received-display.test.ts`, `tx-enrichment.test.ts`, `a11y-css.test.ts:150-153` (`.title_sep` secondary), `incoming-row-parity.test.ts`.
- Smoke e2e: `rows.test.ts:616-985,1047-1110`; `fixtures/type-roles.ts:600-609` (`activity-title-sep`, `tx-incoming-kind-sep` narrow-width entries).
- Network e2e, by text: `network/incoming-public-transfers.test.ts:39-52`, `network/store-captures.test.ts:158`, `fixtures/auth.ts:360` read `tx-incoming-kind-chip`'s text; `fixtures/transfers.ts:187,197` read `data-tx-transfer-type`.

## A token symbol beside an amount (the owner's question)

| Row | Title | Beside the amount | Title names the amount's token? |
|---|---|---|---|
| Home/History settled transfer | the symbol (`TransactionCard.vue:102-105`) | the symbol | yes |
| Settled transfer, blank symbol | "Transfer (private)" etc. | nothing (blank → null) | n/a |
| Settled mint of a listed token | "Mint (public)" / "Mint (private)" | the symbol | **no** |
| Settled dApp call (no transfer) | the function name | no amount | n/a |
| Receipt | the symbol, or "Token" with no amount | the symbol | yes |
| In flight / failed transfer | the symbol, or "Transfer" with no symbol | the symbol | yes |
| In flight / failed dApp op | the function name | no amount | n/a |
| Token page activity | the same cards (`RecentActivityView`) | as above | as above |
| Token page split lines | glyph only (`BalanceView.vue:336-356`) | no symbol | n/a |
| Send picker (`TokenCard`) | the symbol | no symbol | n/a |
| Arrival chip | none | "+5 AAA" (`useArrivals.ts:124-127`) | the symbol is the only name |
| Toasts | "Received 5 AAA", "Sending 10 TST to 0x…" | in the sentence | the symbol is the only name |

- A row shows only its primary call's first transfer (`utils/tx-amount.ts:63-79`), so no activity row mixes two tokens' amounts.
- No activity row shows a fee; fees read "~X FJ" in the send and execute flows only.
- An activity row for a dApp op shows no amount, so no symbol.
