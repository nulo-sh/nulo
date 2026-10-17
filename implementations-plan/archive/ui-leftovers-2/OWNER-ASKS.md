# ui-leftovers-2: owner asks

Three gaps found while planning page 39's picks. The arc ships each in its "ships now" form and does not wait.

**Settled (orchestrator, 2026-10-17 20:5xZ, D-orch "the planner's recommendation; the owner sees the result on a decision page with the arc's screenshots"):** all three ship their A forms. OA-1: Holdings keeps today's line while its list loads. OA-3: no cap; the 60 s wait is filed as a closed known-limit issue at close-out. OA-2: the message reads "the skeleton's line as the drawing has it", which describes option B, while the same message settles every ask on its A form, the recommendation. The arc ships A (the line holds the figure's height). The conflicting phrase goes back to the orchestrator in the arc report. The switch to B is one CSS rule.

## OA-1 (#676): Holdings while its list loads

**Surface.** Holdings with fiat display on, from the moment the page opens until the balance list's first answer. That lasts one read from the wallet's worker. In that time the summary has no rows yet, so today it reads "$0.00" with "0 tokens". After this arc the order is: "$0.00" and "0 tokens", then the skeleton with the real count while the first price answer is out, then the figure. Page 39's pick covers the second step only: it was asked for a funded wallet. An account change on the page also empties the list for one read, and once prices have answered it goes from "$0.00" and "0 tokens" straight to the figure; before that it goes through the skeleton again.

**Options.**
- **A. Keep today's "$0.00" and "0 tokens" until the list answers (ships now).**
- **B. The skeleton from the start, with no count** until the list answers; then the count joins it.
- **C. The skeleton from the start, with "0 tokens"** until the list answers.

**Recommendation.** B: one placeholder from open to figure, and never a made-up $0.00 or a count that is about to change. It is one more condition in the same check (the list's loading flag); the arc's tests extend to it.

**Ships now.** A. The PR reports how many frames show it, measured in the real build.

## OA-2 (#676): the summary line's height under the skeleton

**Surface.** Holdings' summary while the skeleton shows. The drawing `p39-holdings-b` draws the line at the skeleton's 26 px, 9 px shorter than the line with a figure. So, as drawn, the search field and the list would move down 9 px when the figure lands, up to 10 s after the page opens. Home's hero holds its line's height under its skeleton "so the section does not move when the number lands", and the pick says "as Home's hero".

**Options.**
- **A. Hold the line's height, as Home's hero (ships now).** The skeleton is 96 × 26 px, centred in the figure's line. The search field and the list sit 9 px lower than drawn, where they stay when the figure lands. One case still moves, as it does today: a long figure whose meta line ("· priced assets only") wraps once the figure lands.
- **B. As drawn.** The line is the skeleton's height, and the page below it moves 9 px when the figure lands.

**Recommendation.** A: as on Home, the page below stays put when the price lands (but for the wrap case above).

**Ships now.** A.

## OA-3 (#676): how long the skeleton may stay

**Surface.** Holdings' skeleton when the first price answer is slow. Home's hero gives up its skeleton after 12 s and then says what it knows. Holdings' skeleton stays until the first answer. Usually that is within about 10 s, because the price request gives up then. The whole request can take up to 60 s, the wallet's limit for any request: a worker that restarts while Holdings is open is one way to get there (traced in the code, not reproduced).

**Options.**
- **A. The skeleton stays until the first answer (ships now).** No new timer.
- **B. Give up after 12 s, as Home does.** After 12 s the total shows the dash and "Prices unavailable". This needs a timer that restarts on an account change, and a dash before any answer has come.

**Recommendation.** A: the long case is rare and unreproduced, and B adds a timer for it.

**Ships now.** A.
