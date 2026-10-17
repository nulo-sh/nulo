# Recon: testers-fixes-3

Base: `origin/dev` at f695dea4. One Sonnet explorer (the test pins, the consumers, the amount and fiat formats, the styles test, the journal seeds, the type-role ban, the screenshots), then the planner's own reads and two layout measurements. `ext` is `apps/extension/src`.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| The two-chip row | `ext/popup/components/modules/activity/TransactionCard.vue` (settled card) is the only card that renders both chips: `.chips` (`display: inline-flex; flex-wrap: wrap; gap: 4px 6px`) holds the direction chip (the card's own `.chip`, which may break inside itself) and the app chip (`.app_chip`, composed from `activity-card.module.css`: nowrap, `flex-shrink: 0`, `max-width: 96px`, ellipsis). The awaiting and terminal cards show one chip only (`transferTypeLabel` or `originLabel`). | Adapt in `TransactionCard.vue` only: the group goes to one line, the app chip gets a slot that takes only the room left. |
| Its consumers | `TransactionsList.vue:65` and `RecentActivityView.vue:911` pass `tx`, `tokens`, `to`; no prop changes the layout. Home, a token page and History reach it. | No change. |
| Label-left, value-right App row | `ext/popup/pages/tx/[id].vue:291-294` (`justify="between" align="start" gap="16"`) with `.app_key` (`composes: detail_key; flex-shrink: 0; padding-top: 2px`) and `.app_value` (`composes: detail_value_mono; min-width: 0; text-align: right; word-break: break-all; line-height: 1.4`) at `:455-468`. Both pages compose `detail_key` from `ext/popup/pages/detail-page.module.css`; the journal page composes its `detail_value_mono` too, while `tx/[id].vue:449-452` keeps a local copy with the same body. | Move the two rules into the shared sheet; both pages compose them. |
| CSS pinned as text | `ext/popup/pages/detail-page.styles.test.ts`: `rules(page)` reads a page's `<style module>`; the shared sheet is read as raw text (the `.detail_link` pin). Nothing pins `.app_key` or `.app_value` today. | Reuse both forms. |
| Row geometry in a browser | `apps/extension/tests/e2e/rows.test.ts`: `readDappRows` (`:734-787`) reads each dApp row's title and app chip (`width`, `cut`, `below` its previous sibling); the dApp scenario (`:790-890`) also measures the tx page's App value (lines, right edge, first-line slack, gap). The rows scenario at `:661` checks `escapes` and `intrudes` (a row's text over its amount column) with a priced "Shielded Payroll Portal" transfer. | Extend the dApp scenario; lift the App-value read into one helper both pages use. |
| Seeds | `tests/e2e/helpers/activity-seeds.ts`: `seedJournalRecord` (`dapp_execute` with `title`, `subtitle`), `seedTransaction` (`transferType`, `dapp`, `method`), `seedUsdQuoteAndReload`. A journal row opens `#/popup/journal/<id>` (`ext/utils/activity-rows.ts:158-159`). | Reuse. |
| Screenshots | `shotSend(page, name, focus)` (`tests/e2e/fixtures/send-page.ts:222-251`) writes both themes under `NULO_E2E_SHOT_DIR` and is a no-op otherwise. | Reuse. |

## Facts

- F1. Only the settled card shows two chips (`TransactionCard.vue:165-176`); the template comment there says why both render.
- F2. The amount is at most 8 characters (`ext/utils/amount.ts:69-140`, `balanceFormatted(…, 8, { compact: true })`): `12345678`, `123.45M`, `>999T`. The fiat line is not compacted (`ext/wallet/services/price/convert.ts:88-93`): `≈ $1,234,567.00` grows with the amount. The column is as wide as its widest line: the fiat line for the amounts measured below, the amount line for one with many decimals (`1.234567` at 14 px against `≈ $1.23` at 11 px). The amounts below are examples at their shown precision, not thresholds.
- F3. `TransactionCard.test.ts:149-154` pins the group: the app chip's parent has class `chips` and text `Private → Public` + host. `rows.test.ts:832` pins the shipped A: the transfer row's app chip `{ cut: true, below: true, width ≈ 96 }`.
- F4. The type-role ban (`ext/utils/type-role-ban.test.ts:66-75`) judges `font-*`, `letter-spacing`, `text-transform` and `font-variant*` only; `min-width`, `flex`, `text-align`, `word-break`, `line-height` and `padding` do not trip it.
- F5. The journal App row (`ext/popup/pages/journal/[id].vue:298-301`) is `justify="between" align="center"` with `detail_value_mono` and no break rule; its value is `sanitizeJournalSubtitle(op.subtitle)` (`ext/utils/journal-state.ts:127-139`, brackets a value with a scheme). No test reads `journal-detail-origin`.
- F6. #583 is closed (by #633); #629 is open. Known limit #625 (a symbol up to 32 characters is never cut) covers the two-chip row's symbol too.

## Measurement (2026-10-17)

Chrome headless shell 152; the design system's `base.css`, `utilities.css` and fonts at f695dea4; a 360 px body; the row's real rules rebuilt in a scratch page outside the repo (Home and History pad the list 24 px each side). Today's type roles; type-scale-1 may move every figure.

The two-chip row, "Shielded Payroll Portal" (or as named), priced USDC:

| Amount (fiat) | A (shipped) | D as drawn (`min-width: 0` on the chip) | D with the slot and its 19 px floor (ships now) |
|---|---|---|---|
| 2.5 ($2.50) | 68 px, app chip 96 on line 2 | 62 px, chip 33 px: one letter and "…" | same as drawn |
| 10 to 25 | 68 px | 62 px, chip 26 px: a bare "…" (a letter needs 0.2 px more) | same as drawn |
| 100 to 250 | 68 px | 62 px, chip 19 px: a bare "…" | same as drawn |
| 1,250 ($1,250.00) | 68 px | chip 10 px, empty; the line runs 5 px into the gap before the amount | 62 px, chip at its 19 px floor ("…"), direction chip on two lines, as a send row breaks it |
| 12,345.67 | 68 px | chip empty; the line covers the amount column by 2 px | 62 px, as above |
| 12,345,678 ($12,345,678.00) | 81 px, direction chip broken | the line covers the amount column by 30 px | 73 px, direction chip on three lines |
| "NEMI", 2.5 | 68 px, "NEMI" whole on line 2 | 62 px, "NEMI" cut to 33 px | same as drawn |
| unpriced token, 2.5 | 68 px | 52 px, chip 37 px | same as drawn |

- One letter and the ellipsis need 27 to 29 px ("S…" 26.6, "W…" 28.6); a bare "…" chip needs 18.8 px; "NEMI" 38.2 px.
- The drawn page-34 mockup showed "SHI…" at about 41 px. The real roles give 33 px at the same amount: one letter.
- The slot column was measured at 19 px (and first at 20 px, where the direction chip already breaks at 100 USDC, 19.4 px left). The floor is the chip's ellipsis alone, rounded up to the next whole pixel; it depends on `type--tag`'s metrics, so it is re-derived if that role changes.
- Nothing scrolls sideways in any column above; D as drawn overlaps the amount column instead.
- Firefox 153 (headless, the same page and slot rule): the same order and no overlap anywhere, with other figures. The rows are 64 px; at 2.5 USDC the chip gets 41 px ("SHI…") and "NEMI" shows whole; a letter or more shows up to about 1,000 USDC; from there the chip is at its floor ("…") and the direction chip breaks, onto three lines only at 123.45M. Thresholds differ by browser, so tests assert the order, not an amount.

The journal App row, `verylongsubdomainwithoutbreaks.example.com` (42 characters): today one line, 10 px past the box's border in the scratch page (#629 measured 23 px in the extension, whose detail scroller reserves a stable scrollbar gutter); with the tx page's rule, two lines flush with the box's inner edge, 16 px after the label.

## Collisions

- type-scale-1 retunes roles and sizes in the activity cards and the details pages. This lane changes no role or size. Its PR may land first: Phase 3 merges `dev` and re-reads the measurement in the e2e log.
- harden-quality-fixes-3 arc 2 edits `tests/e2e/fixtures/**` and the playground; this lane edits neither.

## In the extension (2026-10-17, after the build)

The scratch page underestimated the row's room: the built extension gives the drawn row's chip 41 px in both browsers ("SHI…"), and "NEMI" stays whole at 2.5 USDC. OWNER-ASKS.md OA-1 carries the measured table. At its 19 px floor no engine drew a bare "…": a line's first character is clipped, never ellipsed (CSS UI 3 § text-overflow), so Chrome drew "S…" into the padding and Firefox a hard-cut "SH" (plan D5). The journal App value with the 42-character host ran 29.8 px past the box's inner edge before the change.
