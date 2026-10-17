# Owner asks: testers-fixes-3

The two signed picks (P34-08 D, P34-09 A) ship in full. Figures below are measured in the built extension (armed builds in the e2e suite's Chrome and Firefox, 360 px, 2026-10-17). One case the drawing did not show is an ask. It has a "what ships now" line: the arc builds that form, and an answer that lands before the PR opens ships with it. The PR attaches a screenshot of each form in both themes.

## OA-1. #583: the two-chip row at amounts the drawing did not show

**Surface:** an activity row (Home, History, a token page) for a transfer a dApp asked for: the token symbol, the direction chip ("Public → Public"), the app chip, and the amount on the right.

**What D does:** page 34 drew "Shielded Payroll Portal" at 2.5 USDC, with the app chip at "SHI…". In the real row at 360 px the app chip gets the room the line has left. The amount column is as wide as its widest line, usually the dollar figure, which gets wider as the amount grows, so the app chip gets narrower. Measured in the built extension, the same widths in Chrome and Firefox (rows 62 px in Chrome, 64 px in Firefox):

| Amount (USDC at $1) | The app chip | The direction chip | Row (Chrome / Firefox) |
|---|---|---|---|
| 2.5 | 41 px, "SHI…", as drawn | whole | 62 / 64 px |
| 25 | 34 px, "SH…" | whole | 62 / 64 px |
| 250 | 28 px, "S…" | whole | 62 / 64 px |
| 1,250 and 12,345.67 | 19 px, "…" alone (its narrowest) | two lines | 62 / 64 px |
| 12,345,678 | 19 px, "…" | two lines | 62 / 64 px |
| 123,456,789.12 | 19 px, "…" | three lines | 73 / 74 px |

A short name stays whole at the drawn amount: "NEMI" needs 37 px and gets it at 2.5 USDC; from about $25 it is cut like any other name. A name starting with a narrow letter (I, J, L) keeps it a little longer. The type-scale lane can change all of these figures.

**Why it is an ask:** from about $1,000 of any priced token (the point moves with the width of the dollar figure and the type sizes) something other than the app chip must give, or the row covers its amount. The drawing did not show which part gives.

| Option | What the row shows at 1,250 USDC |
|---|---|
| **A. The direction chip breaks, as on a send row (what ships now)** | `USDC · PUBLIC →` over `PUBLIC`, and beside it, centred, the app chip at its narrowest: `[…]`. 62 px. Below about $1,000 the row is D exactly as signed, with fewer letters as the amount grows. |
| **B. The app chip drops under the direction chip (the row #633 shipped)** | `USDC · PUBLIC → PUBLIC`, and `[SHIELDED PAY…]` under the direction chip, 68 px. B can start where the chip has no room left (about $1,000) or where it can no longer show one letter (about $250). |
| **C. The app chip disappears** | `USDC · PUBLIC → PUBLIC`, 62 px. The app's name stays on the details page. Same two starting points as B. |
| **D. The app chip keeps one letter** | `USDC · PUBLIC →` over `PUBLIC`, and beside it `[S…]`. The direction chip breaks from about $250. |

**Recommendation:** A. Below about $1,000 it is D as signed: one line, the symbol whole, the direction chip whole, the app chip smaller, 62 px. Above that it reuses the rule a send row follows at a large amount; the combination with a "…" chip is still new, which is why this is an ask. Its cost: from about $1,000 the app chip shows "…" without a name, and the name is on the details page. If the app's name in the row matters more than one line, choose B from about $250, where the chip still shows a letter. B and D are small changes to what ships now (B adds one line of style, and a wider minimum to start at about $250; D only the wider minimum, about 29 px, which breaks the direction chip from about $250). C needs a rule that measures the row's room, which is more code.
