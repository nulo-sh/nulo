# Recon: testers-fixes-2

Base: `origin/dev` at 493ff497. Two Sonnet explorers (a reuse sweep and a test-layer map), then the planner's own reads and one layout measurement. Paths are repo-relative; `ext` is `apps/extension/src`.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| One-line end ellipsis | No global class; every site writes the trio `overflow: hidden; text-overflow: ellipsis; white-space: nowrap` in its module (`TransactionAwaitingCard.vue` `.subtitle`, `TokenCard.vue` `.symbol` with `max-width: 160px`). | Adapt: the same trio in `TransactionCardLayout.vue` `.title` and a new `.app_chip` in `activity-card.module.css`. No global utility (the generated `utilities.css` holds roles only). |
| The row's chips | `activity-card.module.css` `.chip` (nowrap, `flex-shrink: 0`), composed by the terminal and awaiting cards, which put `transferTypeLabel \|\| originLabel` in one span. `TransactionCard.vue` (settled) keeps its own `.chip` copy without nowrap or `flex-shrink: 0`, and renders both chips when a dApp started a transfer (`:172-173`). | Adapt: `.app_chip` composes `.chip`; the settled card's origin chip uses it; its direction chip keeps its own rule (the send rows' look). |
| Scroll shadow after scrolling | None. Precedents: `CollapsingHeroLayout.vue:46-81` (a passive scroll listener, `scrollTop < 40`), `activity.vue` and `settings/index.vue` (an IntersectionObserver fading `tab-hero.module.css .page_title_bar_visible`, `opacity 0.18s`). Reduced motion: the global `.noanimations * { transition: none !important }` (`packages/design/src/base.css`) plus per-module `@media (prefers-reduced-motion: reduce)` (`TransactionCardLayout.vue`). | Build new in `general.vue`: a template `@scroll.passive` handler and a class; the 0.18 s fade of the tab title bar. |
| Fixed top over a scrolling middle | No page has it. Recipe: `window-shell.module.css` `.scroll_area { flex: 1; min-height: 0; overflow: auto }`, `CollapsingHeroLayout.vue` `.wrapper`. The nav is `position: absolute; bottom: 0` (`Navigation.vue`); every scroller pads its content by `--nav-clearance`. | Adapt the recipe in `general.vue`; keep the clearance padding. |
| Label-left, value-right row in a mono role | `tx/[id].vue:291-294` (`justify="between"`, no gap; `.detail_value` = `type--value`, already `text-align: right` with `word-break: break-word`, so a long host fills the line against the label); `detail-page.module.css` `.detail_value_mono` (`type--data`); `journal/[id].vue:298-300` renders its App row mono with no alignment or wrap rule. | Adapt in `tx/[id].vue` only (OA-2 asks about the journal page). |
| Focusable scroll container | None; no `tabindex` on any scroller. Firefox makes an overflowing scroller a Tab stop (`tests/e2e/FIREFOX.md:56`); Chrome makes one focusable only when nothing inside it is. | No change: the middle keeps today's browser rules (D6). |
| CSS pinned by a unit test | `ext/popup/pages/detail-page.styles.test.ts` reads `<style module>` as text and asserts whole rules; jsdom applies no module CSS (`vitest.config.ts` `css.include`). | Reuse for the App row. |
| Overflow and row geometry in a browser | `tests/e2e/rows.test.ts:520` walks from a row to `body` for a clipping ancestor with `scrollWidth > clientWidth` (History only); `:654` seeds a two-chip dApp row ("Shielded Payroll Portal") on Home, a token page and History and checks escapes, intrusions and gaps. `shotSend` (`tests/e2e/fixtures/send-page.ts:224`) captures both themes under `NULO_E2E_SHOT_DIR`. | Reuse the walk and the capture. |
| Seeds | `tests/e2e/helpers/activity-seeds.ts`: `seedTransaction` (method fixed to `"transfer"`, `dapp` free length), `seedJournalRecord` (transfer kind only). | Adapt: an optional `method` on the transaction seed; a `dapp_execute` journal seed with `title` and `subtitle`. |

Absence trails: `text-overflow|\.truncate|one_line|ellipsis|line-clamp` over `ext` and `packages/design`; `scroll-?shadow|scrolled|sticky|scroll-timeline|animation-timeline|IntersectionObserver|scrollTop|@scroll` over the same; `tabindex|role="region"` over `*.vue`; `useScrollRestore|scrollBehavior` over `ext` (none: Home's offset is lost on every navigation today).

## Facts the plan rests on

- The overflow source is the chip: in the terminal and awaiting cards it is nowrap and never shrinks (`activity-card.module.css:12-13`); the title row has nothing that shrinks below it. `.left_content` and `.text` already have `min-width: 0` (`TransactionCardLayout.vue:186,218`).
- Home's one scroller is `general.vue`'s `.wrapper` (`:69-72`, `overflow: auto`) and holds the hero (`BalanceView`, which renders `GasBalanceCard` and Send/Receive) and `.content`. `BalanceView` is also the token page's hero (`tokens/[id].vue`), so the layout change belongs to `general.vue`.
- Home shows no activity empty state: the block is hidden when there are no rows (`RecentActivityView.vue:840`). The holdings empty state is a dashed card in flow (`TokensView.vue:418`, `list-empty.module.css`). Neither is centred vertically today.
- Titles: `getTxTitle` (`ext/utils/tx-enrichment.ts:117`) returns "Transfer" for any method starting `transfer` and humanizes the rest; a journal `dapp_execute` card shows `humanizeMethodName(op.title)` and `op.subtitle` (`ext/utils/journal-state.ts:445-460`). A dApp name on the session path keeps at most 64 code points plus an ellipsis (`ext/wallet/services/wallet-sdk/background.ts:1201`); it is the name the dApp chose, not a verified origin. A token symbol keeps up to 32 (`ext/utils/tx-amount.ts:15`).
- The type-role sweep fails role text clipped without an ellipsis and any cut figure (`tests/e2e/type-roles.test.ts:217,585`); an ellipsized title or chip passes, and no amount is cut.
- `TransactionAwaitingCard.test.ts:126-128` pins today's contract that a dApp chip uses the merged `transfer_chip` class; A' replaces that contract.

## Measurement (2026-10-16)

Chrome headless shell 152, the design system's `base.css` and fonts, a 360 px body, the row's real CSS rebuilt in a scratch page (outside the repo). A 60-character function title with the tester's 43-character host, today: the chip is 285 px wide, the list scrolls 89 px sideways, and the title wraps into a 174 px row. With A' (title one line, chip capped): one 52 px line, title cut at 145 px, chip 96 px.

The undrawn two-chip row (a dApp-started transfer: symbol, direction chip, app chip, amount column):

| Rule set | "Shielded Payroll Portal", amount 2.5 | 43-character host, amount 123,456,789.1 |
|---|---|---|
| Today | chips break inside themselves, 73 px row, symbol whole | same, 73 px |
| A' with no wrap (the mockup's rule on every title) | symbol cut to 24 px ("U…") | symbol cut to 0 px |
| A' with the title line allowed to wrap (the first draft, rejected) | symbol and direction chip whole on line 1, app chip on line 2, 69 px | symbol cut to 10 px, app chip on line 2, 69 px |

Both A' rule sets above apply the cut to every title, and so change send rows: a settled send with a nine-digit amount (seeded by `rows.test.ts:664`) shows "USD…" where today its chip breaks and the symbol stays whole.

The chosen rule set (v7): the title is cut only in a row that names an app and shows no direction chip; the direction chip keeps today's rule; a two-chip row groups its chips so the app chip can drop below the direction chip.

| Row | Today | v7 |
|---|---|---|
| dApp call, 60-character title, 43-character host | 174 px, list 89 px too wide | 52 px, title cut at 145 px, chip 96 px |
| dApp call "Transfer", "NEMI" | 52 px | 52 px, nothing cut |
| send 12.5 USDC; send 123,456,789.1 USDC | 62 px; 62 px, chip broken in two | identical |
| two chips, "Shielded Payroll Portal", 2.5 USDC | 73 px, chips broken inside | 68 px, symbol and direction whole, app chip 96 px on line 2 |
| two chips, 43-character host, 123,456,789.1 | 73 px | 81 px, symbol whole, direction chip broken as today, app chip 96 px |

Nothing scrolls sideways under v7.

**Hero figures.** `GasBalanceCard`'s two `1fr` columns at 280 px: "FJ" drops to a second line from 9,999,999,999.99 FJ (today's behaviour, unchanged), and the grid overflows only at 9,999,999,999,999.99 FJ in both columns, above the token's whole supply. No hero overflow path exists.

**Keyboard (Chrome 152 headless and Firefox 153, a page shaped like Home today and after).** PageDown with nothing focused scrolls nothing in either. After a click or with focus inside the scrolling content it scrolls it in both. After a click or with focus in the hero it scrolls today and not after, with or without `tabindex`. Tab order: Chrome has no stop on the scroller today or after; Firefox stops on it today (before the hero) and after (after the hero). `tabindex="0"` changes only Chrome, adding a stop. Send and Receive are `Flex` divs with no tabindex (`ActionButtonsView.vue:42,46`): keyboard users cannot reach them today.

- Two network specs read Home's scroller. `network/snack-placement.test.ts:567` walks up from the awaiting row's Cancel to its scroller (it finds the new middle). `network/store-captures.test.ts:276-280` walks up from `balance-amount` and finds none after the change; it is opt-in (`STORE_CAPTURES`, Chrome only, `:393`) and writes the committed store captures.
- `snackInset.ts` counts a listed row by its viewport box, not clipped by its scroller (`:89-118`).
- Smoke refuses an unarmed dist (`tests/e2e/global-setup-smoke.ts:34`): `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:<browser>`, run with `NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1`. Firefox's driver has no media-feature emulation (`tests/e2e/FIREFOX.md:54`); `openPopup` fixes a 360 x 600 viewport (`fixtures/extension.ts:1328`).

## Collisions

- testers-fixes-1 (no PR yet) edits `BalanceView.vue` (the hero's tap-to-copy) and `packages/design/src/base.css` (`user-select`), and adds a router `scrollBehavior` (#582). This lane does not edit `BalanceView.vue` or `base.css`; #582 may need to know that Home's scroller moves (Phase 4).
- type-roles-coverage adds e2e coverage on Home; this lane adds no role.
- harden-security-fixes-2 arc 2 edits only the execute window.
