# Owner asks: testers-fixes-2

The signed picks (P31-01 A', P29-02 A / P31-02 A, P29-03 A) ship in full. Two cases the mockups did not draw are asks. Each has a "what ships now" line: the arc builds that form, and an answer that lands before the PR opens ships with it. The PR attaches a screenshot of each case in both themes.

## OA-1. #583: a dApp-started transfer row (two chips)

**Surface:** an activity row (Home, History, a token page) for a transfer a dApp asked for. It shows the token symbol, the direction chip ("Public → Public") and the app chip, with the amount on the right. Send and receive rows from the popup have one chip and do not change.

**Today:** at 360 px, with any app name longer than about "NEMI", the two chips break inside themselves ("PUBLIC →" over "PUBLIC") and the row grows to about 73 px. The symbol stays whole.

**Why it is an ask:** A' caps the app chip at 96 px, one line, never smaller; the owner's note keeps send and receive rows as they are. The row cannot stay as today: its app chip breaks only at hyphens or spaces, so an unbreakable name still widens Home. With the amount column, the symbol, the 113 px direction chip and a 96 px app chip do not fit one line, so something must give, and the mockups never drew which.

| Option | What the row shows ("Shielded Payroll Portal", 2.5 USDC) |
|---|---|
| **A. The app chip drops below the direction chip (what ships now)** | Line 1: `USDC · PUBLIC → PUBLIC`; under the direction chip: `[SHIELDED PAYRO…]`; 68 px (today 73). The symbol and the direction chip keep today's rules; with a nine-digit amount the direction chip still breaks inside itself as today (81 px). |
| **B. One line, the symbol cut first** | `U… · PUBLIC → PUBLIC · [SHIELDED PAYRO…]`, 62 px. |
| **C. One line, the direction chip cut first** | `USDC · PUBLIC → PU… · [SHIELDED PAYRO…]`, 62 px. |
| **D. One line, the app chip smaller here** | `USDC · PUBLIC → PUBLIC · [SHIEL…]`: the chip goes below 96 px in this row only. |

**Recommendation:** A. It keeps the token and the direction whole, applies the signed cap, and changes only where the app chip sits. B, C and D each break a signed rule or the send-row note.

## OA-2. #583: the App row on a journal details page

**Surface:** the details page that opens from a row of a dApp operation that never settled (rejected, cancelled, failed): `journal/[id].vue`, its App row.

**Today:** the value is mono but neither right-aligned nor allowed to break, so a long host sits against the "App" label as on the transaction page before the fix. A host with no hyphen cannot break: `verylongsubdomainwithoutbreaks.example.com` runs 23 px past the box's border at 360 px (measured), and a longer one would widen the page.

| Option | What it shows |
|---|---|
| **A. Same as the transaction page** | Label left; value right-aligned in the mono role, breaking at any character; the row grows. |
| **B. As today (what ships now)** | Unchanged. |

**Recommendation:** A. It is the same row on a sibling page; the pick names only the transaction page, so the arc leaves it until you say so.

## N-1. A note on P29-03 A (no ask)

With the hero fixed, the mouse wheel over the hero, or PageDown after a click on it, no longer scrolls Home: only the area below the hero scrolls, as drawn. Inside that area, Tab, PageDown and the wheel work as today in both browsers (measured). On Firefox the scroll area's own Tab stop now comes after the hero instead of before it; Chrome has none, today or after. Send and Receive are not reachable by Tab today; that goes to its own issue at close-out, and this arc does not change it.
