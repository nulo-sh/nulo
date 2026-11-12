# send-build-1: owner asks

Every visible change in this lane is inside the owner's picks on pages 129, 131 and 133, quoted in `plan.md` § UI impact. The entries below are the parts the picks do not settle. Each ships in the form named under "What ships now", so none blocks an arc (the lane brief: "the arc ships without it"); an answer changes it before or after the arc lands. Focus, Tab order, keyboard and ARIA calls are made under the owner's 2026-10-19 accessibility delegation and are recorded in `plan.md`'s decision ledger, not here.

## OA-1: the review's edit control (arc a2): answered (a)

- **Surface**: the review sheet, under or beside Send now.
- **From**: P133-05's note, "I don't love that "EDIT" minimal button, I'd rather remove it, and let the user press the "X" if they want to edit? … Maybe it can be below the "SEND" button, an "edit" with the same format as "use a passkey I already have" link."
- **Options**: (a) no edit control: the sheet's X closes it back to the form with every value kept (2 Tab stops: Send now, close). (b) an "edit" text link under Send now, set like onboarding's "Use a Nulo passkey I already have" link (3 Tab stops).
- **Answer**: (a). The owner in chat, 2026-11-11 at about 14:55 UTC: "(a) on p133-05 then".
- **Shipped in a2**: no edit control; the X (and Escape) closes the sheet back to the form, which keeps every value; two Tab stops, Send now and the close; nothing under Send now.

## OA-2: S1, the amount's refusal and the token caveat (arc a1): answered (a)

- **Surface**: the form.
- **Options**: (a) the refusal takes the line under the amount field, where the dollar conversion sits; the caveat "Nulo can't check this token's contract. What a send publishes depends on its code." sits under the token row. (b) S2's places: the refusal in the balance row's left slot (that row is gone in B, so it would need a row of its own) and the caveat above the fee (the fee is now pinned in the footer, so it would sit at the form's end).
- **Recommendation**: (a): the refusal sits under what it refuses and the caveat beside the token it is about.
- **Answer**: (a), page 137, P137-02, 2026-11-12 14:40:46 UTC. As shipped; no change.

## OA-3: the token row's band (arc a1): answered (a), with a note

- **Surface**: the token row.
- **Why ask**: two signed picks meet. P133-01 approved the prototype's row with "the band stays 54 px"; that row had a 26 px letter tile with the name on one line. Send's asset row draws the token's picture at 36 px with the symbol over the name (P129-01 = A, M1, landed in #1785). Centred with 14 px above and below, that band is 64 px.
- **Options**: (a) the signed 36 px picture, symbol over name, 64 px, 14 px from each rule. (b) the prototype's one line (picture, symbol, name, chevron) with the picture at 20 px, about 48 px. (c) a 26 px picture on one line, 54 px (a size the picture has nowhere else).
- **Recommendation**: (a): the centring rule holds and the picture keeps its signed size.
- **Answer**: (a), page 137, P137-03, 2026-11-12 14:43:46 UTC, with the note: ""A" but the hover state looks pretty awful because it does not change it's color till the top and bottom of the component? it looks like a very slim highlighted thing, which looks really bad."
- **Shipped in round a1b**: the 64 px band as signed; the row's hover, focus-visible and press tints fill the whole band between the two rules and the row's full width, in both themes (`plan.md` D23).

## OA-4: what Change opens (arc a1): answered (b)

- **Surface**: the fee sheet.
- **Why ask**: FP1's pick names the line and Change, not the sheet's content. The prototype's sheet listed three radios with definitions and balances, then priority, then Done.
- **Options**: (a) today's fee card, whole, in a sheet titled "Fee": the method menu (three presses to a new payer: Change, the menu, the row), the cost, priority, the card's notices. (b) the prototype's sheet: the payers as radios with each glossary definition and balance, priority, Done (two presses to a new payer, a new view of the card's rules).
- **Recommendation**: (a) now; (b) as its own change if wanted.
- **Answer**: (b), page 137, P137-04, 2026-11-12 14:44:03 UTC: "The prototype's sheet: the payers as radios with definitions and balances, priority, Done."
- **Shipped in round a1b**: the payers as native radios with their glossary definitions and balances, then priority, then Done; Escape and the X return to the form with the pick kept (`plan.md` D24). What the prototype's sheet never drew is OA-17.

## OA-5: fee states the prototype never drew (arc a1)

- **Surface**: the fee line.
- **What ships now**, each in today's words: estimating, a placeholder bar where the figure goes; slow, "Taking longer than usual." and Try again; failed, "Couldn't estimate fee." and Try again; queued, the figure then "Queued behind your previous send" or "Goes out after your earlier send, for at most {cap}." on the second line; a hand-added sponsor, "—" and its name, then "Nulo can't tell what this FPC charges you."; and whatever the fee card would say in the form today (no Fee Juice, a sponsor that cannot pay, a cost above the balance, fee data that did not load) on the second line in the card's own words.

## OA-6: the off button for causes the prototype had no word for (arc a1)

- **Surface**: the button.
- **What ships now**: the Terms not accepted, a token with no transfer kind, a stale or moved USD quote, and the fee card still reading show "Review send", disabled, beside today's banner, badge or notice. The prototype's words cover an empty amount ("Enter an amount"), a refused amount ("Fix the amount"), a fee that cannot be paid ("Fix the fee") and an estimate in flight ("Estimating fee").

## OA-7: FX2's sentences that are not a one-word swap (arc a1)

- **Surface**: the fee card (Send, the approval window, the authorization popups) and today's review sheet (until a2 replaces its body).
- **What ships now**:
  - "A private send pays its fee from private gas, so the fee contract is the payer instead of you. Bridge some to cover this send." → "A private send pays its fee from private Fee Juice, which keeps your address hidden. Bridge some to cover this send." (the glossary's definition of Private Fee Juice).
  - "Nulo can't tell what this fee contract charges you." → "Nulo can't tell what this FPC charges you." (FPC is the glossary's term).
  - "This fee contract was added by hand. Nulo cannot tell what it publishes about you." → "This FPC was added by hand. Nulo cannot tell what it publishes about you."
  - The review's "paid by the fee contract" → "paid from your private Fee Juice".
  - One-word swaps, no ask: "Get private gas" → "Get private Fee Juice"; "Couldn't check your private gas." → "Couldn't check your private Fee Juice."; "Private FPC pays it instead." → "Private Fee Juice pays it instead."

## OA-8: every send through the review (arc a1): answered (a)

- **Surface**: the button and the review.
- **Why ask**: today a send without a warning goes out from the form's button. The prototype's notes call "every send passes the review" unsigned; the picks' words name the pinned button "Review" (P129-06, "the fee line and Review pinned") and "Review send" (P133-08, "pinned over Review send"), and the strip that opened the review for other sends leaves the form.
- **What ships now**: every send opens the review; Send now there sends.
- **Answer**: (a), page 137, P137-05, 2026-11-12 14:44:23 UTC. As shipped; no change.

## OA-9: the fee line's figures (arc a1)

- **Surface**: the fee line, and the review's fee row in a2.
- **What ships now**: the order as built, dollars first, with the wallet's own figures: "≈ $0.027 (0.00214 FJ)" (three-decimal dollars, as every fee screen prints them); "<$0.001 (0.0000412 FJ)" with no "≈" below a tenth of a cent; "~0.00214 FJ" when no price is known. Other screens keep "~0.00214 FJ ($0.027)".

## OA-11: the address at 240 px (arc a1)

- **Surface**: the person block in the side panel.
- **What ships now**: each 33-character half wraps where it must, so the address reads as four lines at 240 px, its bold start first and its bold end last.

## OA-12: the warning when no payer can fix it (arc a1): answered (b)

- **Surface**: the warning on the form (a private send paid from public Fee Juice).
- **Why ask**: the prototype's fix is "Pay it from private Fee Juice", else "Use Sponsored"; it always had a sponsor. With neither private Fee Juice nor Nulo's sponsor able to pay, there is nothing to switch to.
- **Options**: (a) the warning without a fix. (b) today's review remedy, the bridge link "Get private Fee Juice".
- **Answer**: (b), page 137, P137-06, 2026-11-12 14:44:37 UTC: "Today's review remedy, the bridge link Get private Fee Juice, as the warning's fix." Read with P137-01's second note (14:42:35 UTC): "We shouldn't rely on the "use sponsored" since that's only for Testnet. On mainnet, they should get private fee juice."
- **Shipped in round a1b**: the fix is "Pay it from private Fee Juice" when the account's private Fee Juice covers the fee, otherwise the link "Get private Fee Juice" to the bridge, on every network; the sponsor is never the fix and stays reachable through Change (`plan.md` D22).

## OA-13: the publish line when Nulo cannot speak for the payer (arc a1)

- **Surface**: the publish line.
- **Why ask**: the prototype never had a hand-added sponsor or an unresolved payer; its "Nobody watching the chain can see who sent it, who got it or how much." would claim the sender is hidden.
- **What ships now**: an unresolved payer shows no line until the card resolves it; a hand-added sponsor shows "Nulo can't tell what this FPC publishes about you.", followed by "Anyone can see {name}'s address and the amount." when the arrival is public.

## OA-14: the rows on the person step (arc a1): answered (a)

- **Surface**: Recent and Your accounts.
- **What ships now**: each row draws the wallet's own avatar, as the recipient suggestions do today, where the prototype drew a 32 px square of initials; the rest as built (name, "Last: 10 USDC, privately", age; the account's short address).
- **Answer**: (a), page 137, P137-07, 2026-11-12 14:44:47 UTC. As shipped; no change.

## OA-15: Home's re-ask review (arc a2)

- **Surface**: the review Home opens when a send's fee went up ("Fee went up. Review"), which mounts the same sheet as Send's review.
- **What ships now**: it follows RV4a with its re-ask fee states; its address carries no check line (the send was already made). Its fee row is today's sentence on the row's grid, "Fee is now ~0.88 FJ ($0.013), above the ~0.8 FJ ($0.012) you accepted.", with today's payer words under it ("paid by your address", "paid from your private Fee Juice" or "paid by the sponsor"); the label "Fee" sits left of a sentence that starts with "Fee". It has no name line: the record keeps the address, not a name.

## OA-16: the review's details the picks do not name (arc a2): answered (page 138)

- **Surface**: the review sheet, Send's and Home's re-ask.
- **Why ask**: RV4a's pick names the four parts and their order; the prototype it was drawn from differs from what ships in five details, each kept to today's wallet or to the form's own words.
- **What ships now**, against the prototype:
  - The title stays "Review", as today; the prototype titled the sheet "Check and send".
  - The amount stays today's hero, the token amount alone; the prototype set "≈ $43.20" beside it.
  - The fee row reads the form's line word for word (P133-07 = RS2), "≈ $0.027 (0.00214 FJ), private Fee Juice" on one line with the line's notes under it; the prototype set the method on a second line under the cost ("private Fee Juice under it", P131-10).
  - The warning, when the fee names your account, is the form's warning box with no link; today's review offered "Get private Fee Juice" (the bridge) under its row, and the form's warning keeps its own fix, Pay it from private Fee Juice.
  - A hand-added sponsor shows the form's sentence, "Nulo can't tell what this FPC publishes about you.", under the strip; today's review said "This FPC was added by hand. Nulo cannot tell what it publishes about you."
- **Options for each**: keep what ships, or take the prototype's form (or today's link).
- **Answers** (page 138, 2026-11-12, as the answers file records them):
  - P138-02 = a (15:37 UTC): "The sheet's title stays "Review". Nothing changes."
  - P138-03 = b (15:37 UTC): "b, on the page, no note." Shipped: "≈ $43.20" after the token amount when a price is known (`plan.md` D26).
  - P138-04 = read (15:38 UTC), the owner's note: "I need "b" with a picture too. can't remember." Shipped: (a), the form's line on one line with its notes under it; the prototype's two-line row (the cost, the method under it) captured at the same state, light and dark, for the owner to pick from.
  - P138-05 = a (15:38 UTC): "The review's warning box, when the fee names your account, carries no link. Nothing changes."
  - P138-06 = a (15:39 UTC): "a, the form's sentence, "Nulo can't tell what this FPC publishes about you.", in the review as on the form." The owner's note: "fee paying contract? Or FPC with glossary? We are assuming the user knows what an FPC is." Answered in chat, about 16:04 UTC: ""Your P138-06 question needs one answer from you. " => dot the FPC then. your rec." Shipped: "FPC" in both sponsor sentences dotted with the glossary's `fpc` entry, on the form and the review (D27).

## Page 138: the review's publish block (P138-01)

- **Asked**: page 138 showed the review with the strip; page 137 showed today's sheet with "This send publishes" over three rows. The owner in chat, 2026-11-12 at about 15:20 UTC: "In general, on p137 and p138 im seeing two types of warnings for the user on the review of the send. The "this send publishes" and the one-strip preview. I like better the "This send publishes" though I know I previously said I liked the strip. What's going to be the reality?"
- **Answer**: on the orchestrator's proposal (keep RV4a's order, put the three rows back in the strip's slot), the owner: "Agreed." and, on recording it: "Can't you do it yourself if you already know I don't want the strip anymore?"
- **Shipped in round a1b**: `plan.md` D25; the `send-review-row-*` testids are back.

## Page 137: the owner's change to #1795 (P137-01)

- **Asked**: "Land #1795" with its captures (page 137, signed 2026-11-12 14:44:49 UTC at head 8a97ab094).
- **Answer**: change, 2026-11-12 14:42:35 UTC: "- I don't like "check it's start and it's end" => we should just say to review carefully. - We shouldn't rely on the "use sponsored" since that's only for Testnet. On mainnet, they should get private fee juice."
- **Shipped in round a1b**: the check line reads "You have not paid this address before. Review it carefully before you send." (`plan.md` D21); the warning's fix never relies on the sponsor (D22, with OA-12 above).

## OA-17: the fee sheet's parts the prototype never drew (round a1b)

- **Surface**: the Fee sheet Change opens.
- **Why ask**: P137-04 = b names the radios, priority and Done. The prototype's sheet also drew a You pay row and tinted no option as a warning; it never drew the card's notices or a hand-added sponsor.
- **What ships now**:
  - You pay, as the prototype's sheet drew it, in today's card's words (`FeeCostReadout`), under priority.
  - The card's notices in today's words and places, between priority and You pay: fee data that did not load, a sponsor that cannot pay, a cost above the balance, no Fee Juice yet with its bridge link.
  - A hand-added sponsor is a radio of its own after Nulo's, with the glossary's FPC definition (not Sponsored's, which promises the fee is paid for you) and "—" for what it spends, as the menu lists it today.
  - The menu's "NAMES YOUR ADDRESS" tag is not drawn; the form's warning says what it said. The "Available" row is not drawn; each radio carries its balance.
- **Options for each**: keep what ships, or drop it from the sheet.

## OA-18: what round a1b's reviews surfaced (round a1b)

- **Surface**: the form's warning and the Fee sheet.
- **Why ask**: each is a behaviour the owner's page-137 words do not settle.
- **What ships now**:
  - "Private Fee Juice covers the fee" compares the private balance with the estimate for the payer in use. The PrivateFPC's own estimate differs, so near the line the warning can offer the bridge to an account that could pay privately, or the fix to one whose private estimate then fails (the fee line then says it could not estimate; nothing falls back to a payer that names the account). An exact answer runs a second estimate for every warned form.
  - Native radios check on an arrow, so arrowing from private Fee Juice to the sponsor passes public Fee Juice: that step is a pick, and the warning shows until the next.
  - With a flagged-token banner or the token caveat in the token's section, the hover and press tint covers the row, not the whole section.
  - The bridge link is unleashed's testnet app on every network, as the fee card's link is today.
- **Options**: keep each; or a second estimate for the fix; or arrows that move without picking (the menu's behaviour) at the cost of native radios; or a tint over the whole section.

## OA-19: what page 138's answers leave open (round a1b)

- **Surface**: the review sheet, Send's and Home's re-ask.
- **Why ask**: each follows from a page-138 answer and is visible, but the answers do not settle it.
- **What ships now**:
  - When the fee names your account, the "Your address" row's sentence (today's words) and the warning box under the rows (RV4a's) both say so, one after the other.
  - Home's re-ask review shows the token amount alone: it has no form, so no price is read for it.
  - In USD mode the dollar figure is the token amount the send carries priced at the quote the form froze, half-up to the cent, so it matches the dollars typed unless the token's decimals round the amount.
  - Each dotted "FPC" is a Tab stop, so a review paid by a hand-added sponsor has four (the close, two terms, Send now).
- **Options**: keep each; or drop the row's sentence while the warning shows; or price Home's re-ask at today's quote; or print the typed dollars in USD mode.
