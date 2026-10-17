# Phase 3: site sizes and the layout reading

## What changed

- Site sizes: the token row's and activity row's dollar figures 11 → 13 px (`TokenCard.vue`, `TransactionCardLayout.vue`); the activity title's separator 13 → 14 px (`activity-card.module.css`). OA-3 B: the four off-row dollar figures keep 11 px.
- Paired size: `AmountCard`'s derived token line follows its meta line to 13 px (`DERIVED_PX`, `.derived_type`, its carve-out text); `send-amount-exact.test.ts` pins `toBe(13)`. Its unit fixture (`AmountCard.test.ts`, "in USD, the derived token line") measured the 8 px floor at 11 px: the room beside the balance went 470 → 395 px so the same two crossings (own row at 0.60, beside at 0.62) hold at 13 px.
- OA-1 B: the identity strip's network cap 96 → 102 px.
- OA-4 C: the publish strip's facts keep 10 px, 600, 0.08 em through a compound rule (`.strip .cell`) and three `OVERRIDES` entries, role `label-section`.

## Readings (built extension, retry 0, Chrome and Firefox agree to 0.1 px)

Text-range widths and box sizes from a throwaway reader at each throwaway shot, never committed.

| Site | Box | Text | Verdict |
|---|---|---|---|
| Identity strip (every approval window) | 38 px tall | network "Local Network" 101.4 px in its 102 px cap (scrollWidth 101 = clientWidth 101); `.identity_sep` 13 px in its 14 px line | fits; OA-1 B as answered: whole, strip 38 px |
| Permission table heads, a contract row open (`DetailsTable`) | function-label track 66 px | "SIMULATE" 60.3 px, "TRANSACT" 63.5 px, 11 px | fits (OA-5 A); `overflowingText` empty with the row open |
| Contract address in the table | 85.8 px | 13 px mono, whole | fits |
| Account-picker row (`AccountSelectRow`) | address line 16 px | 13 px mono, 101.4 px, whole | fits |
| Publish strip (Send, its review) | cells 82-114 px | facts 10 px / 600 / 0.8 px, names 10 px / 700; widest cell 104.7 px of text in 113 px | fits (OA-4 C) |
| Holdings sort (`TokenList .sort`) | 20 px tall | "BY VALUE" 11 px, line 14 px | fits |
| Recipient suggestion address (`RecipientField .description`) | 14 px line, overflow hidden | 13 px mono (content area 17 px); hex has no descenders | fits: the line is 1.08 em |
| Stale takeover `.number` | 14 px wide | one mono digit at 13 px is 7.8 px | fits by arithmetic; no swept state draws a numbered line |
| Long account names in the strip (cap 140 px) | | "Savings for the long run" 171 px (was 169 px at `name-tag`) | cut before and after, 2 px earlier now; "Savings account" 113 px whole (was 114 px) |
| Long network names in the strip | | "Ethereum Sepolia Testnet" 187 px in 102 (was 158 in 96) | cut before and after |
| **Home header, network chip** | chip 79.1 px, label box 45 px; chip 28 px tall beside the 26 px lock chip | "TESTNET" 53 px | **newly cut**: "TEST…" on every popup page (OA-6) |

## Newly cut values: a before/after scan

The layout gate exempts a box that draws an ellipsis, so a value newly cut by one is invisible to it. A throwaway scan logged every visible element whose ellipsis cuts its text, at every `expectLaidOut` (every smoke and network state, the approval windows included), on the new tree and on the base tree (a1b74a65), both browsers.

- Cut on both trees: 66-character addresses in Manage accounts and the FPC rows, a node URL, the scrolling address fields, and in Firefox the theme menu's "system".
- Cut on the new tree only: the header's "Testnet", in all 39 popup states, both browsers.
- No cut in the approval windows on the new tree.

## Wall-clock (with the throwaway shots and readings, so an upper bound)

| Suite | Chrome | Firefox |
|---|---|---|
| smoke `type-roles.test.ts` (vitest Duration) | 76.4 s | 155.2 s |
| network `type-roles-windows.test.ts` (file) | 167.5 s | 189.3 s |
| network `send-amount-exact.test.ts` (file) | 49.4 s | 57.4 s |

All six runs green: every swept state computes to the new contract, `overflowingText` is empty everywhere (the opened contract row included), and the derived line reads 13 px.

## The header (OA-6)

- Panel (Codex, Opus): ship OA-1's form A on the header's two chips; the chip takes the size too, since its own size sets its `1lh` (`header-layout.test.ts` pins that relationship). One grouped compound rule, three `OVERRIDES` entries; the guard matches a grouped selector against `resolveSelector`'s ", "-joined list, and the sweep's scope is a selector list `Element.matches` reads.
- Re-measured with A applied: see the verification run below.
- Verification smoke with A applied (retry 0, the cut scan and the after shots on): green on Chrome (83.1 s) and Firefox (141.9 s). The ellipsis-cut set equals the base tree's in both browsers; "TESTNET" 46.9 px in 47 px, the network chip 27 px beside the 26 px lock chip, as on the base tree.
- Fast layers on the Phase 3 tree: lint 0, typecheck:all 0, test:all 0.
