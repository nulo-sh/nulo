# Phase 5 — pictures, measurements, full gate

- Pictures: one scratch smoke spec (the page's, its mocks dropped, plus height reads) ran once on an armed build of `9470d4e9`'s sources and once on the head build, so every before and after number comes from the same fixtures. The popup at 360 × 600, the execute window at its real 400 × 800. The window's before and after pictures are `type-roles-windows`' own shots from the red-proof and green runs. The scratch specs lived outside the repo and were copied in only for each run.
- The window's before heights: one network run on the head build measured the shipped rule, then drew the base rule back over it (row direction, 12 px gap, the name's 50 % cap, the value right-aligned). That redraw reproduced the red proof's geometry exactly (`from` 3 lines at a 52 px indent, `to` 2 at 37, `amount` 1 at 294, `_nonce` 3 at 68), so its heights stand for the base's.

## Measurements (Chrome)

| Site | Trigger | Before | After |
|---|---|---|---|
| #698 Authwits row | — | no marker; the two rows identical | "Pending" chip 63 × 18 px, 8 px after the kind, 161 px clear of Revoke |
| #651 network chip | "TESTNET" needs 53.09 px at 11 px | 10 px: text 47 of a 47 px box; chip 81 × 27 | 11 px: text 53 of 53 (Firefox 53.08 of 53.08); chip 77 × 28 |
| #651 lock chip | — | 66 × 26 px | 70 × 28 px, the network chip's height |
| #652 imported account row | always (the marker takes its own line) | 11 px; "imported · " left 1 px of head; row 67 px | 13 px; marker above the address, 69 px of head; row 82 px (+15) |
| #652 plain account row | — | 11 px; row 67 px | 13 px; row 69 px |
| #653 window arguments | a value wider than its box: 66 glyphs are 515 px | value boxes 251, 270, 237 px beside their names; `from` and `_nonce` 3 lines, `to` 2; block 150 px | each value under its name in a 302 px box: 2 lines each, indent 0; block 176 px (+26) |
| #653 Send token line | label + 8 px + balance group wider than the line: 117 + 8 + 199 = 324 > 312 px | "≈" alone above the figure: label 2 lines; line 34 px; card 91 px | "≈ $1,234,567.12" on one line, balance and Max below; line 42 px; card 99 px (+8) |
| #653 Send, nothing typed | the same sum: 109 + 8 + 199 = 316 > 312 px | "1 USDC ≈" above "$1.00": label 2 lines; line 34 px; card 91 px | "1 USDC ≈ $1.00" on one line, balance and Max below; line 42 px; card 99 px |
| #653 token row | a figure wider than its cap: 195 px | 160 px cap: 3 lines ("≈ / $123,456,789,012,345 / .68"); row 87 px | 190 px cap: 2 lines ("≈ / $123,456,789,012,345.68"), as picture B drew it; row 70 px (−17) |

## Review loop

- Round 1, Codex (gpt-6.1-sol, high, over an export of the head and the net diff from `9470d4e9`, since the working tree held base files for the timing run): **changes requested**. Medium, demonstrated: the window check passed a shortened value (the line limit applied only from 64 glyphs) and never measured the value below its name. Low, demonstrated: the account tail was read by `lastElementChild`. Nits: eight comments that restated their helper or overstated geometry ("two even lines"). Scope, ordering, accessible name: no defect. All accepted.
- Round 1, Opus 5.5 (general-purpose, same export): **approve**. Low, plausible: the seeded pending row's chip is swept but its presence is never asserted. Nits: the tail selector (as Codex), stale comments (the seed helper's, `RowTarget`'s labelledby prop, the header's padding arithmetic, AmountCard's "only token mode wraps"). All accepted. Observation for the owner, not a fix: `nowrap` also holds the empty field's rate label ("1 USDC ≈ $1.00") on one line, so a wide balance drops below it before anything is typed; the signed rule covers it, the signed picture shows only the typed state. The PR body shows it.
- Round 2, Codex (resumed, on the fix commit and a refreshed export): **approve**. The loop converged.
- After the round, `origin/dev` merged in with iface-line-1 (#778), which reworked the execute window around the arguments. The window's before pictures were retaken at dev's head with this arc's rule reverted. That run is also the red proof of the strengthened check: every argument fails at least one of its checks. Its after pictures come from the timed run below.

## Wall-clock, the touched e2e files, retry 0

| Suite | Base `9470d4e9` | Head |
|---|---|---|
| Smoke (account-import-export, type-roles, appearance), Chrome | 119.2 s, 20 passed, 2 skipped | 122.6 s, 20 passed, 2 skipped |
| Smoke, Firefox | 197.8 s, 21 passed, 1 skipped | 182.4 s, 21 passed, 1 skipped |
| Network (type-roles-windows, send-amount-exact), Chrome | 321.2 s, 6 passed | 270.5 s, 6 passed |
| Network, Firefox | 328.7 s, 6 passed | 394.5 s, 6 passed |

The Firefox network run was slower in every test, the untouched capabilities window included (20.1 → 23.5 s): load on the shared box, not the added reads, which are one page evaluation per check. Chrome's network run on the head was faster than the base.
