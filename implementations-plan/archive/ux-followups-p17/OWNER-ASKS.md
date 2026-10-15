# Owner asks: ux-followups-p17

Decision page 17 signed every behaviour this lane ships. The asks below are where the lane brief and the signed text differ (OA-1), wording the page did not cover (OA-2), and a check the build host cannot run (OA-3). Each has the planner's recommendation and a "what ships now" line; the arc ships the "now" form without waiting.

## OA-1. #363: the lane brief's list against the signed text

**Surface:** the detail pages (the empty line, the hero meta "·", the Details box's aux values such as a fee's dollar figure and the block links), the tx page's gas breakdown, the dApp windows' identity strip ("·" and NULO), the capabilities window's column heads and Simulate / Transact labels, the "No matches" line, and the empty-state sub-lines on Home and Settings.

P17-06's signed text moves "the rules the issue names plus the activity card's amount symbol", and #363 names all of these. The lane brief lists only the rules on Home, Holdings and History; its screenshots showed those two screens. The arc ships the brief's list (eight rules, which also reach every counted section label: nine Settings lists, the tx page's Calls, the import-contacts popup). A grep finds about a dozen more outline text rules no one named (Home's incoming-sync stalled line, placeholders, the glossary's "where" line, developer pages); recon.md lists every one.

| Option | What a person sees |
|---|---|
| **A. The brief's list only** | The named lines above stay at 1.6:1 (light) / 2.1:1 (dark). Two greys meet on some screens: the tx page's Calls count turns secondary while its meta stays outline. |
| **B. Every rule #363 names** | The lines above move to `--nulo-secondary` too (5.3:1 / 6.4:1 on the page, 5.8:1 / 6.0:1 on a surface). |
| **C. B, plus every other outline text rule** | B, plus the unnamed lines. |

In every option, borders, icons and the capabilities "no" dash keep `--nulo-outline`; text glyphs such as "·" and "|" move with their text.

**Recommendation: C.** The same failure, a colour already in the palette, and one grey for all meta text.

**What ships now: A.** The PR closes #363 only once this has an answer the arc carries; otherwise it says "Part of #363" and #363 stays open.

## OA-2. #192, #230: the rest of each banner with one item

**Surface:** Home's restore reminder; Settings → Security → Export → Full backup, the unopened-accounts banner.

P17-10 fixed one pronoun in each body. Two other parts still read as plural with one item:

| Part | Today, with one item | Option B |
|---|---|---|
| Home title | "Some networks weren't restored" | "A network wasn't restored" |
| Export title | "Some imported accounts are not in this backup" | "An imported account is not in this backup" |
| Export second sentence | "Import their keys again after the restore." | "Import its key again after the restore." |

Option A keeps all three as they are. Both titles are the owner's signed words from decision page 1.

**Recommendation: B for the export's second sentence only** (it now follows "so it will not be restored", and "their keys" after "it" reads wrong); keep both titles, which read as headings.

**What ships now: A** (all three as they are).

## OA-3. #448: a screen-reader check before the issue closes

**Surface:** the snack region, heard through a screen reader during a contacts import.

The arc proves "read once" by the markup only: from the first count change the line's title is marked `aria-live="off"`, which the ARIA spec says silences changes under it. No screen reader runs on the build host, so no one has heard it. The open reads exactly as today, so an AT that ignores the mark reads the line as often as today, and no other snack can change.

| Option | What happens |
|---|---|
| **A. Close #448 on the markup** | The PR closes #448; the close-out files a closed `known-limit` issue that reopens on a report of the line being re-read. |
| **B. Check first** | Before the next release, someone runs one import with VoiceOver on the Mac, in Chrome and in Firefox; #448 closes on that check. |

**Recommendation: B**, as one step of the next pre-release smoke on the Mac.

**What ships now: A.**

## For information, no choice: #413's Tab order

P17-05's decision says "Tab then goes on to the amount". On Send the next Tab stop after the recipient card is the token card (Select Asset), then the amount; the arc keeps that order and its e2e pins it.
