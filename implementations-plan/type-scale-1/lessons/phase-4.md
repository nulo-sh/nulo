# Phase 4: the remaining layout specs, docs, screenshots

## The three smoke specs, first run (retry 0)

`tooltips-glossary.test.ts` and `rows.test.ts` passed on Chrome, as did `send-outcome-rows`. Two failures:

- **`account-import-export.test.ts:87`, both browsers.** Manage accounts' imported row: the address line is 100 px; "imported" 62.4 px, " · " 23.4 px and the tail 31.2 px take 117 px at 13 px, so the line runs past its box and the head has 0 px. The line was already `meta`, so the signed 11 → 13 px edit is the cause; at 11 px the same parts take 99 px.
- **`rows.test.ts:867`, Firefox only.** The tx detail page's App value (`staging-nemi-interface.nemi-e65.workers.dev`, 13 px mono): the first line ends 20.4 px short against a 7.8 px glyph (Chrome 4.8 px). Firefox's `word-break: break-all` will not split a letter from the digits after it ("e65"); a throwaway `line-break: anywhere` gave 4.83 px in both browsers.

Panel (Codex, Opus) on both: ship OA-1's form A on every visible row's address line (OA-7, D13); keep `line-break: anywhere` as a correction (D14). Verdicts quoted in the plan's Audit verdicts.

## With the fixes (r-p4b, retry 0)

| Browser | Specs | Result | Duration |
|---|---|---|---|
| Chrome | rows, account-import-export, tooltips-glossary | 16/16 | 131.3 s |
| Firefox | same | 16/16 | 172.9 s |

- Imported row, both browsers, 11 px: "imported" 52.8 px, " · " 19.8 px, head 1 px, tail 26.4 px, in a 100 px line. The head is under its ellipsis (6.6 px), so an imported row shows none of its address head, as today.
- App value: first-line slack 4.83 px (glyph 7.81 px Chrome, 7.80 px Firefox), two lines, both right edges at 0.

## Wall-clock, before and after (retry 0, no shots, run as a pair: one browser's smoke beside the other's network)

| Suite | Chrome before → after | Firefox before → after |
|---|---|---|
| smoke `type-roles.test.ts` (vitest Duration) | 61.7 → 78.7 s | 121.8 → 118.3 s |
| network `type-roles-windows.test.ts` (file) | 124.9 → 131.1 s | 165.2 → 160.7 s |
| network `send-amount-exact.test.ts` (file) | 35.0 → 38.0 s | 46.5 → 46.0 s |

Before: the merged base with dev's spec files ([phase-1.md](phase-1.md)). After: the final tree (fd5b726a); the smoke file gained one test (12 → 13; Chrome skips the same one in both). The added work is the `laid-out` read on every swept state and that one test; no scenario was added. The two browsers' smoke figures move in opposite directions, so host load is part of each difference.

## Screenshots

Both sets hold the same 15 light/dark pairs per browser: before on the merged base, after on the final tree (fd5b726a), each from throwaway `shotSend` calls never committed. Two things the pairs show:

- The before Home shot caught the page before the token list loaded, so it has no holdings row; Holdings' pair shows the row figures.
- The seeded dollar figure on the token row ($123,456,789,012,345.68, 23 characters) fits one line at 11 px and puts its cents on a third line at 13 px (Home and Holdings, both browsers). The figure's box is capped at 160 px (`TokenCard.vue`): 20 characters at 13 px, 24 at 11 px. A figure of about $1 trillion or more wraps (OA-8). Nothing is cut; the layout gate reads a wrap as fitting.
- Two more wraps, found in the review loop (OA-8): on the execute window an address beside "FROM:" takes three lines, its last two characters alone (the `grant` pair; two lines at 12 px). In token mode, Send's amount card puts "≈" on its own line (the `send-amount-card` pair).
