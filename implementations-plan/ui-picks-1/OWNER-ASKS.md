# Owner asks: ui-picks-1

Five questions: four about #870's line, one about #746's sentence. Each ships in its "What ships now" form; the arc does not wait. The pictures in the PR show OA-1, OA-2 and OA-4.

## OA-1: the line's colour

**Surface.** Send, the amount card: the line "More than your balance".

**Options.**
- **A. Red, as every field error** (`--red`, #f03c3c): "Wrong password", "Passwords don't match" and the profile name's error use it. On the light theme it is 3.56:1 against the page, under the 4.5:1 that WCAG AA asks of 12 px text; on dark it is 5.13:1.
- **B. The danger text colour** (`--txt-danger`: #b3261e light, #ff534b dark), 6.0:1 and 6.24:1, which the flagged-token line already uses. The line would then be a darker red than the other field errors on light.

**Recommendation.** A for this line. If light-theme contrast matters, change every field error to B together, as its own change.

**What ships now.** A.

## OA-2: the line beside the decimals hint

**Surface.** Send, the amount card, when a typed amount is cut to the token's decimals and is also over the balance.

**Options.**
- **A. Both lines**: "TST supports 18 decimals", then "More than your balance".
- **B. Both lines, the new one first.**
- **C. The new line alone** while the amount is over the balance.

**Recommendation.** A: both are true, and the hint keeps the place it has today.

**What ships now.** A.

## OA-3: the line in USD mode

**Surface.** Send, the amount card, while the amount is typed in USD.

**Options.**
- **A. The line follows the token amount that sends**, which the card works out from the USD figure 250 ms after the last key. The line appears or goes away when that lands, and for that moment it can sit beside "Not an amount. Type it like 1234.56" (traced in the code, shown in no picture).
- **B. No line while the USD figure is still being worked out**, or while it does not read.

**Recommendation.** A: the line speaks of the amount that would be sent, and the moment is short.

**What ships now.** A.

## OA-4: the line when the balance is zero

**Surface.** Send, the amount card, when the side being sent from holds nothing (the balance fell to zero, or From was switched to an empty side with an amount typed).

**Options.**
- **A. The line shows** under the greyed field; the corner shows no balance, as today.
- **B. No line while the field is greyed.**

**Recommendation.** A: it is the only thing on the page that says why Confirm is off.

**What ships now.** A. A picture shows it.

## OA-5: the Developer Mode sentence when Developer Mode is already on

**Surface.** The restore warning for an imported account held for its network.

**Options.**
- **A. Always**, as the pick reads: "Turn on Developer Mode in Settings to add a network."
- **B. Only while Developer Mode is off**, which needs the restore pages to read the setting.

**Recommendation.** A: the pick's words, and a restore never turns the setting on or off.

**What ships now.** A.
