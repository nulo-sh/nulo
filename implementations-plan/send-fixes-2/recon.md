# send-fixes-2: recon

Checked at `0dc22a9c5`. No Explore agents: the lane brief names the four anchors, each read in full. Before captures and measurements come from a scratch kit (smoke spec on the armed Chrome build; network spec through `agent.sh` over the local sandbox), never committed.

## F1. The recipient rows

- `apps/extension/src/popup/components/modules/send/SendPersonStep.vue`: both lists (`send-recent`, `send-own-account`) render `.person` buttons as the only children of `.list`; `.person` draws `border-bottom: 1px solid var(--nulo-border)` on every row.
- `RecipientField.vue`'s suggestions draw no per-row border; not involved.
- Measured (smoke, Chrome, two accounts): bottom borders `1px`, `1px`.

## F2. The warning glyph

- `apps/extension/src/components/composite/send/publish-mark.module.css` `.warning_box`: `display: flex; align-items: baseline`, composed by `PublishLine.vue` (`send-fee-warning`) and used by `SendReviewSheet.vue` (`send-review-warning`). The SVG has no text baseline, so its bottom edge sits on the paragraph's first baseline.
- `FeeSettingsCard.vue`: `fee-juice-unconfirmed` and `fee-juice-shortfall` are `Flex align="start"` with the text nudged `paddingTop: 1px`; `send-fee-nudge` is `align="center"` beside a title and a caption. The info rows (`fee-init-degraded`, `fee-sponsor-short`) carry the same nudge with the `info` glyph.
- Inter at 12 px: line box 15 px (measured), ascent 0.96875 em, x-height 0.546 em. The `warning` glyph's triangle has its centroid at 14.27 / 24 of the box.
- Measured before (network, Chrome, the form's warning): glyph box top 2 px above the first line box; glyph centre 2.5 px above the line centre; triangle centroid 2.02 px above the x-height centre.

## F3. The in-flight row's fiat

- `components/composite/activity/TransactionAwaitingCard.vue` has no `amountFiat` prop; `TransactionCardLayout.vue` draws `activity-fiat` only when one is given.
- `popup/components/modules/activity/TransactionCard.vue` builds a `PriceServiceClient` and `usePrices` per row; `usePrices` starts with `quotes = {}` and adopts the first answer asynchronously, so a row's first render carries no fiat.
- `ActivityRowCard.vue` already receives `fiatLabel`, `iconFor` and `isFlagged` (for the incoming card) and does not pass them to `TransactionCard`.
- `RecentActivityView.vue` holds one `usePrices` (`incomingPrices`) and feeds the in-flight cards their amount from `journalCardAmount`. `activity.vue` reads the in-flight cards' marks through `useTokenFlags` (no quotes) and its `TransactionsList` owns another `usePrices`, mounted with `v-if="visibleRows.length"`.
- `send-row-lifecycle.test.ts` pins the in-flight, failed and settled rows as one shape with an unpriced token and says "fiat comes only at settlement".
- Measured before (smoke, Chrome, a priced 12.5 USDC send seeded in flight, then settled): proving `["12.5"]`, sent `["12.5", "≈ $12.50"]`; the row's height holds at 52 px (the icon box sets it), the amount moves up to make room.

## F4. The radio rings

- `components/composite/send/SideChoice.vue` `.choice:focus-within` and `popup/components/modules/send/FeeMethodRadios.vue` `.option:focus-within` draw `outline: 2px solid var(--nulo-accent)`; the dark theme's accent is `#f8f1e7`.
- Each radio covers its row at `opacity: 0`, so its own outline is not painted.
- Measured before (smoke, Chrome), after a mouse pick: `send-from-private-choice` and `send-to-private-choice` `solid 2px 1px`; the sponsored fee payer `solid 2px -2px`.
- `FeeMethodRadios` renders only on Send (`onSend`); the Fee window, the execute window and the authwit popups get `FeeMethodSelector`. `SideChoice` is Send-only. `FeePriorityRow` (`&:focus-visible`) and `OnboardingPhraseCheck` (`.radio:focus-visible + .chip`) already ring on keyboard focus.
- `send-keyboard.test.ts` asserts the keyboard ring on `send-to-private-choice` and `send-fee-payer-sponsored-choice`; nothing asserts its absence after a mouse pick.

## Issues and limits

- Filed: #1825 (F1), #1828 (F2), #1826 (F3), #1827 (F4). No duplicates (`gh issue list --state all` on each topic). Closed known limit #1593 (a non-decimal journal amount shows on the ended card, not in flight) is adjacent to F3 and unchanged by it.
