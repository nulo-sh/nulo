# send-build-1: owner asks

Every visible change in this lane is inside the owner's picks on pages 129, 131 and 133, quoted in `plan.md` § UI impact. The entries below are the parts the picks do not settle. Each ships in the form named under "What ships now", so none blocks an arc (the lane brief: "the arc ships without it"); an answer changes it before or after the arc lands. Focus, Tab order, keyboard and ARIA calls are made under the owner's 2026-10-19 accessibility delegation and are recorded in `plan.md`'s decision ledger, not here.

## OA-1: the review's edit control (arc a2)

- **Surface**: the review sheet, under or beside Send now.
- **From**: P133-05's note, "I don't love that "EDIT" minimal button, I'd rather remove it, and let the user press the "X" if they want to edit? … Maybe it can be below the "SEND" button, an "edit" with the same format as "use a passkey I already have" link."
- **Options**: (a) no edit control: the sheet's X closes it back to the form with every value kept (2 Tab stops: Send now, close). (b) an "edit" text link under Send now, set like onboarding's "Use a Nulo passkey I already have" link (3 Tab stops).
- **Recommendation**: (a), the note's first words.
- **What ships now**: (a), unless `send-build-1-answers.md` says otherwise when a2 is built.

## OA-2: S1, the amount's refusal and the token caveat (arc a1)

- **Surface**: the form.
- **Options**: (a) the refusal takes the line under the amount field, where the dollar conversion sits; the caveat "Nulo can't check this token's contract. What a send publishes depends on its code." sits under the token row. (b) S2's places: the refusal in the balance row's left slot (that row is gone in B, so it would need a row of its own) and the caveat above the fee (the fee is now pinned in the footer, so it would sit at the form's end).
- **Recommendation**: (a): the refusal sits under what it refuses and the caveat beside the token it is about.
- **What ships now**: (a), with pictures in a1's PR.

## OA-3: the token row's band (arc a1)

- **Surface**: the token row.
- **Why ask**: two signed picks meet. P133-01 approved the prototype's row with "the band stays 54 px"; that row had a 26 px letter tile with the name on one line. Send's asset row draws the token's picture at 36 px with the symbol over the name (P129-01 = A, M1, landed in #1785). Centred with 14 px above and below, that band is 64 px.
- **Options**: (a) the signed 36 px picture, symbol over name, 64 px, 14 px from each rule. (b) the prototype's one line (picture, symbol, name, chevron) with the picture at 20 px, about 48 px. (c) a 26 px picture on one line, 54 px (a size the picture has nowhere else).
- **Recommendation**: (a): the centring rule holds and the picture keeps its signed size.
- **What ships now**: (a).

## OA-4: what Change opens (arc a1)

- **Surface**: the fee sheet.
- **Why ask**: FP1's pick names the line and Change, not the sheet's content. The prototype's sheet listed three radios with definitions and balances, then priority, then Done.
- **Options**: (a) today's fee card, whole, in a sheet titled "Fee": the method menu (three presses to a new payer: Change, the menu, the row), the cost, priority, the card's notices. (b) the prototype's sheet: the payers as radios with each glossary definition and balance, priority, Done (two presses to a new payer, a new view of the card's rules).
- **Recommendation**: (a) now; (b) as its own change if wanted.
- **What ships now**: (a).

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

## OA-8: every send through the review (arc a1)

- **Surface**: the button and the review.
- **Why ask**: today a send without a warning goes out from the form's button. The prototype's notes call "every send passes the review" unsigned; the picks' words name the pinned button "Review" (P129-06, "the fee line and Review pinned") and "Review send" (P133-08, "pinned over Review send"), and the strip that opened the review for other sends leaves the form.
- **What ships now**: every send opens the review; Send now there sends.

## OA-9: the fee line's figures (arc a1)

- **Surface**: the fee line, and the review's fee row in a2.
- **What ships now**: the order as built, dollars first, with the wallet's own figures: "≈ $0.027 (0.00214 FJ)" (three-decimal dollars, as every fee screen prints them); "<$0.001 (0.0000412 FJ)" with no "≈" below a tenth of a cent; "~0.00214 FJ" when no price is known. Other screens keep "~0.00214 FJ ($0.027)".

## OA-11: the address at 240 px (arc a1)

- **Surface**: the person block in the side panel.
- **What ships now**: each 33-character half wraps where it must, so the address reads as four lines at 240 px, its bold start first and its bold end last.

## OA-12: the warning when no payer can fix it (arc a1)

- **Surface**: the warning on the form (a private send paid from public Fee Juice).
- **Why ask**: the prototype's fix is "Pay it from private Fee Juice", else "Use Sponsored"; it always had a sponsor. With neither private Fee Juice nor Nulo's sponsor able to pay, there is nothing to switch to.
- **Options**: (a) the warning without a fix. (b) today's review remedy, the bridge link "Get private Fee Juice".
- **What ships now**: (a).

## OA-13: the publish line when Nulo cannot speak for the payer (arc a1)

- **Surface**: the publish line.
- **Why ask**: the prototype never had a hand-added sponsor or an unresolved payer; its "Nobody watching the chain can see who sent it, who got it or how much." would claim the sender is hidden.
- **What ships now**: an unresolved payer shows no line until the card resolves it; a hand-added sponsor shows "Nulo can't tell what this FPC publishes about you.", followed by "Anyone can see {name}'s address and the amount." when the arrival is public.

## OA-14: the rows on the person step (arc a1)

- **Surface**: Recent and Your accounts.
- **What ships now**: each row draws the wallet's own avatar, as the recipient suggestions do today, where the prototype drew a 32 px square of initials; the rest as built (name, "Last: 10 USDC, privately", age; the account's short address).

## OA-15: Home's re-ask review (arc a2)

- **Surface**: the review Home opens when a send's fee went up ("Fee went up. Review"), which mounts the same sheet as Send's review.
- **What ships now**: it follows RV4a with its re-ask fee states; its address carries no check line (the send was already made).

