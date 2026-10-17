# Owner asks: testers-fixes-3

The two signed picks (P34-08 D, P34-09 A) ship in full. One case the drawing did not show is an ask. It has a "what ships now" line: the arc builds that form, and an answer that lands before the PR opens ships with it. The PR attaches a screenshot of each form in both themes.

## OA-1. #583: the two-chip row at amounts the drawing did not show

**Surface:** an activity row (Home, History, a token page) for a transfer a dApp asked for: the token symbol, the direction chip ("Public → Public"), the app chip, and the amount on the right.

**What D does:** page 34 drew "Shielded Payroll Portal" at 2.5 USDC, with the app chip at "SHI…". In the real row at 360 px the app chip gets the room the line has left. The amount column is as wide as its widest line, usually the dollar figure, which gets wider as the amount grows, so the app chip gets narrower. Measured examples, Chrome:

| Amount (USDC at $1) | The app chip under D |
|---|---|
| 2.5 | about 33 px: one letter and "…" ("S…", not "SHI…") |
| 25 | 26 px: "…" alone (one letter needs 0.2 px more) |
| 250 | 19 px: "…" alone |
| 1,250 | no room, not even for "…": the line would cover the amount |

A short name is cut the same way in this row: "NEMI" needs 38 px and gets 33 px at 2.5 USDC. P31-01 kept "NEMI" whole; D's "smaller in this row only" overrides that here. These are Chrome's figures. Firefox gives the chip a little more room ("SHI…" and "NEMI" whole at 2.5 USDC, a letter up to about $1,000). A name starting with a narrow letter (I, J, L) can keep it a little longer. The type-scale lane can change all of these figures.

**Why it is an ask:** from about $1,000 of any priced token (the point moves with the width of the dollar figure and the type sizes) something other than the app chip must give, or the row covers its amount. The drawing did not show which part gives.

| Option | What the row shows at 1,250 USDC |
|---|---|
| **A. The direction chip breaks, as on a send row (what ships now)** | `USDC · PUBLIC →` over `PUBLIC`, and beside it, centred, the app chip at its narrowest: `[…]`. 62 px. Below about $1,000 the row is D exactly as signed, with "…" alone from about $25. |
| **B. The app chip drops under the direction chip (the row #633 shipped)** | `USDC · PUBLIC → PUBLIC`, and `[SHIELDED PAY…]` under the direction chip, 68 px. B can start where the chip has no room left (about $1,000) or where it can no longer show one letter (about $25). |
| **C. The app chip disappears** | `USDC · PUBLIC → PUBLIC`, 62 px. The app's name stays on the details page. Same two starting points as B. |
| **D. The app chip keeps one letter** | `USDC · PUBLIC →` over `PUBLIC`, and beside it `[S…]`. The direction chip breaks from about $25. |

**Recommendation:** A. Below about $1,000 it is D as signed: one line, the symbol whole, the direction chip whole, the app chip smaller, 62 px. Above that it reuses the rule a send row follows at a large amount; the combination with a "…" chip is still new, which is why this is an ask. Its cost: from about $25 the app chip shows "…" without a name, and the name is on the details page. If the app's name in the row matters more than one line, choose B from about $25. B and D are small changes to what ships now (B adds one line of style, and a wider minimum to start at about $25; D only the wider minimum). C needs a rule that measures the row's room, which is more code.
