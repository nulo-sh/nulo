# verified-contracts-build-1: owner asks

Each ask names the surface, the options, a recommendation and **what ships now**: what the arc's PR carries without waiting. No PR lands before the owner approves its captures, so a draft here reaches nobody until then. A1 to A3 are page 139's open slots: their answers arrive in the answers file and are quoted here, marked answered, when applied. Pages 143 and 144 answered A2, A3, A7 and A9 to A16; arc 2 builds them, and A4, A5 and A6 still ship as built, with the drafts arc 2 added named under each.

## A1. P139-02: a call Nulo cannot read (slot S1), answered

- **Answered on page 140, signed 2026-11-12 16:56 UTC: P140-01 = c with the owner's wording, P140-02 = c1** (the answers file's entry "P139-02 slot = P140-01 c, with the owner's wording (16:51 UTC)").
- **The owner's note, verbatim:** "I'd do "c" but I wouldn't do the "can only check transfers and mints" it gets too verbose. I'd say: "Nulo can't parse calls from steps 3, 5 and ..."."
- **The page 139 note it answers, verbatim:** "The thing here is that when it's only one call, of couse I'd go for "b" but try to showcase this with a 10-call transaciton with 5 it can't read. So we can check how noisy it gets."
- **What ships now:** one tertiary line after the steps, no icon, no orange, naming both kinds of call Nulo cannot read as a transfer or a mint (undecodable, and decoded without the wallet's reading) by step number: "Nulo can't parse calls from steps 3, 5, 7, 8 and 10." / "Nulo can't parse the call from step 3." / "Nulo can't parse this call." (a request of one call). It waits for every decode. Today's orange notice and reason per call go, today's "Nulo can only check transfers and mints…" sentence goes, and today's closing advice goes from a send (c1); the standalone authorization card keeps its advice (K1). An unreadable authorization has one short line of its own (A13).
- **Still open with the owner:** whether the two kinds share this one line or keep two short lines of the same shape. One line ships until an answer lands.
- **A case to weigh:** a call on a Nulo verified token whose arguments Nulo cannot read shows the solid seal on its chip, and only the count line names its step.

## A2. P139-05: the fee row's green tick (slot S2), answered for arc 2

- **Answered on page 140: P140-03 = b** (the seal on the app-paid fee row standing for the payer contract's level), scoped to arc 2 behind the fee-row matrix page.
- **The owner's note, verbatim:** "Actually, now that you mention it, there is a world in which the applications publish (through aztecscan + we verify) their fee paying contracts, and hence, they can have the check. So I guess "b" is kinda right? Though the double-liner of "You pay..." + "Your Private Fee Juice must cover"... I'd remove the last one. I feel we should kinda work on a matrix here: \n- how does it look when the app sets a private fee juice, or public fee juice.\n- how does it look when it sets an fpc that we can't verify, when it's verified on atecscan, when it's verified on Nulo, etc.\n- how does it look when... whatever other matrix you can think of."
- **The page 139 note it answers, verbatim:** "To be honest: do we need this glyph in particular? I think it's not needed? Or maybe we should use the resette as Nulo verified? But it's a bit weird. Of course if we are showcasing the fee it's nulo verified. I think this green check is confusing. We should work to improve this."
- **What ships now (arc 1):** today's fee row, unchanged. The payer contract's level is one call of the chips' resolver, `readContract(reader, chainId, payer)`, so arc 2 is a rendering change.
- **Built in arc 2, on page 143's picks:** P143-01 = b2, "The solid seal leads the app-paid row when the paying contract is Nulo verified (today: the pinned PrivateFPC and Nulo's sponsor, named by an app; an app's own fee contract once Nulo's apps list names it). Nothing for an Aztecscan-only payer: on this row it reads exactly like an unverified one (the step chips still tell them apart). No seal where no contract pays (a claim to the account, the account itself, the fee card's own picks). The PrivateFPC row's second line ("Your Private Fee Juice must cover this fee.") is removed. Today's green square-check goes from every row it leads (A, B, D, F, H); the failed row keeps no glyph." P143-02 = b3, "no seal in the card anywhere." P143-04 = n1, "The fee row does not name the paying contract; Settings → Glossary's one line for the seal names the referent". P143-05 = s1, "The PrivateFPC row reads "You pay about ~X from Private Fee Juice" and nothing more". The seal reads the payer's level through `readContract`; Nulo's sponsor is now a pinned Nulo verified contract beside the PrivateFPC, so the seal leads its row when an app names it.

## A3. P139-07: a level not yet known (slot S3), answered as the base

- **Answered on page 140: P140-04 = read**; arc 1 builds no mark until the level is known, as a real pending state.
- **The owner's note, verbatim:** "I don't quite understand this in it's completeness... Because... Also once the chip loads, we could change the addresses for the names of the contracts, right? Maybe we should implement this PoCs on an artifact so I can decide checking out how they'd look "live"?"
- **The page 139 note it answers, verbatim:** "Should we do a skeleton loading on the names / verification of the contracts until they load? Should we try that out? It'd be weird to laod the approval pop-up and all of a sudden a jitter because we checked it. ORRRR I am missunderstanding this ask."
- **What ships now:** a pending chip shows its short address, no seal and no level words; its accessible name is the address alone; its press has no level header and says "Nulo is still checking this contract." (draft, A14) above the address row. In this build the only source is the local list, so a chip is pending only until the worker's first answer. A skeleton, held chips or a name kept in the press is a rendering change on this state.
- **Built in arc 2, on P143-03 = d:** "A pending chip (its level not yet known) shows a placeholder bar in place of its label and one in place of its mark (the prototype's d: a 64 x 10 px `Skeleton` for the label and a 15 x 10 px one for the mark), its accessible name staying the short address, until its level lands, when it appears final (name and seal, or the short address and no mark), or until a cap ends the wait, when every still-waiting chip shows its short address and no mark; a level that lands after the cap then moves the chip as (a) does. The cap is 1,000 ms as drawn". Each chip holds from its own first paint, so an authorization's chips arriving with the estimate hold the same way; a chip waiting on the person's contacts is held too, so a name never replaces an address under the person's eyes.

## A4. The legend's three entries (Settings → Glossary, a new Contracts section), drafts

- **Nulo verified (draft, rewritten for P143-04 = n1):** "Nulo knows which contract this is, or which one pays the fee; that isn't a promise that it's safe." (98 characters). n1 asks the line to name the referent ("Nulo verified the contract that pays this fee" or the lane's wording within the glossary rules: one sentence, 100 characters at most); the seal now stands on a chip and on the fee row, so the line names both. Round three's line it replaces: "Nulo knows which contract this is and names it, which isn't a promise that it's safe."
- **Aztecscan verified:** "Its code is verified on Aztecscan, but Nulo hasn't checked who runs it." (signed in P135-03)
- **Unverified (draft):** "Shown with no mark: Nulo has nothing that vouches for this contract." (67). Round three's line ("…neither Nulo nor Aztecscan has verified its code.") is not true while Nulo does not ask Aztecscan.
- **Where:** "Approval window · Connect window".
- **What ships now:** these three, with the solid seal beside Nulo verified and the outline seal beside Aztecscan verified. Unanswered: ships as built.

## A5. Press lines beyond the signed ones

- **Nulo verified, a token:** "Nulo knows this contract. Knowing it isn't a promise that it's safe." then "Nulo names it from its token list." (both as drawn in `vc3-s1-nulo-01`).
- **Nulo verified, the PrivateFPC:** the first of those lines only (round two's "Aztec's standard fee contract, at its fixed address." was never drawn in a press).
- **Unverified:** "Unverified", "Unknown contract", then "Nulo hasn't checked this contract." alone (**P140-05 = a**, signed 16:56 UTC: in arc 1 Nulo never asks Aztecscan, so the second line, in each of its three forms, arrives with the Aztecscan reader), then the address row. When the decoded contract's own code names it, one more line says who chose the name and what Nulo checked, as round three drew it: "The name Crowdfunding came from an app. Nulo hasn't checked it." (P135-06 default 2 as P139-04 = W1 rewrote it; the chip keeps the short address).
- **The app (execute and connect windows):** "Nulo doesn't know this site. Each contract shows its own level." above W1's line (as drawn in `vc3-s1-app-01`, the frame P139-04 was signed on).
- **Arc 2's changes:** the decoded name's line now reads "The name Crowdfunding comes from the contract's code. Nulo hasn't checked it." (P144-04 = b). Nulo's sponsor, named by an app, has the PrivateFPC's press: "Nulo knows this contract. Knowing it isn't a promise that it's safe." alone. A chip that reads by a contact's or an account's name (P144-02, P144-03) is titled by that name, keeps "Nulo hasn't checked this contract." and the decoded name's line when there is one, and no line about the person's own name.
- **What ships now:** as listed. Unanswered: ships as built.

## A6. The PrivateFPC's chip label

- **Options:** "Private Fee Juice" (the wallet's name for that payer in the fee card today, `fee-helpers.ts`, `FeeRaisedCard.vue`); "PrivateFPC" (round two's frames).
- **What ships now:** "Private Fee Juice": no new word. Recommendation: the same. Unanswered: ships as built.
- **Draft added in arc 2:** Nulo's sponsor, named by an app, reads "Sponsored" on its chip and as its press title, the fee card's own word for it (`fee-helpers.ts`, `fee-line-words.ts`): again no new word.
- **A case to weigh (Opus review):** with the recipient a chip (P144-03), a dApp transfer to the PrivateFPC reads "… to Private Fee Juice" on a chip with the solid seal: the person's own balance name, sealed, as the destination. Tokens sent there are lost, and a dApp could already send them to any address; the reading is new. Ships as built; the capture `chip-pfpc-recipient-400` shows it. Options: as built; a pinned fee contract in a "to" position reads as unverified.

## A7. Tokens the list does not name

- **What changes:** following P135-06's "a short address on an unverified chip", a token the person holds that the list does not name shows its short address in the chip, without today's grey initials and without its symbol in the step sentence ("Transfer (public) 20 [0x1e6f12..7a8b]"); the "Leaves your account" total keeps the symbol. A flagged token keeps its red badge in the chip and never shows the seal.
- **What ships now:** as described. Ask: confirm, or keep the person's own token symbol on an unverified chip.
- **Answered on page 144, signed 2026-11-13 11:40 UTC: P144-02 = b**, no note: "A contact's name on the chip, no mark, when you saved the contract as a contact (your own label); a held token the list does not name still reads by its address." So A7 stays as built; the step sentence's total keeps the symbol.

## A8. Protocol contracts and N2's effect lines

- **What a person sees:** the Fee Juice contract (a claim's target) and other protocol contracts read unverified: no list names them. Round one's N2 effect lines ("Adds Fee Juice you bridged…", "Pays this transaction's network fee…") are not in this build's sign-offs, so those calls keep today's shared unchecked line.
- **What ships now:** as described. Follow-ups named in the plan's Outcome: protocol contracts as a Nulo verified rung, N2.

## A9. A contract saved as a contact

- **Today:** a step's target that the person saved as a contact reads by the contact's name. **With the chip:** an unverified contract reads by its short address (P135-06), so that name goes.
- **What ships now:** the short address. Ask: keep the contact's name on an unverified chip instead.
- **Answered on page 144: P144-02 = b**, no note: "A contact's name on the chip, no mark, when you saved the contract as a contact (your own label); a held token the list does not name still reads by its address." **Built in arc 2:** an unverified, unflagged chip reads by the contact's name (and, with P144-03, an own account's name), no mark; its press stays the unverified press with the address row. A flagged token keeps its short address and red badge.

## A10. A seal-like emoji in an app's self-declared name

- **What can happen:** an app named "Playground ✅" shows that emoji inside its unverified chip, as today's caption shows it under the address. The chip frame may make it read closer to a verified chip. Exploitability unknown.
- **Options:** keep today's sanitizer; strip pictographic characters from the app chip's label (changes how some names read).
- **What ships now:** today's sanitizer.
- **Answered on page 144: P144-06 = b**, no note: "Pictographic characters stripped from the app chip's label (letters in every script stay); the press still quotes the name as declared. A few honest names lose their emoji in the chip." **Built in arc 2:** the label strips Extended_Pictographic characters, their modifiers, flags, keycap sequences, ZWJ and variation selectors before the 64-character cap; a name of emoji only falls back to the host, as an empty name does (no caption either). Unit tests on wire-shaped names.
- **Draft extension (Opus review):** the check marks ✓ (U+2713), 🗸 (U+1F5F8) and 🗹 (U+1F5F9) are not pictographic, so the pick's set kept them beside an unverified chip ("Playground ✓"); the build strips them too, as seal-like. Options: as built; the pick's set alone.

## A11. Which addresses in an authorization line become chips

- **What the drawn model A showed:** in `vc3-s1-app-01` the authorization's caller and recipient (a contract the fixture knew) were chips too.
- **The build:** only contract positions become chips: a step's target and an authorization's consumer (the token). The caller, "from" and "to" stay as today (an account name or a short address), because Nulo cannot tell another person's account from an unknown contract.
- **What ships now:** the build's rule. Ask: chip the caller and "to" as drawn, accepting that an account may read as "Unknown contract".
- **Answered on page 144: P144-03 = b**, no note: "The caller and "to" as chips too, as drawn: one look for every address, at the price of an account you pay reading as "Unknown contract" with an unverified press." **Built in arc 2:** a step's "from" and "to" and an authorization line's caller, "from" and "to" are chips, one Tab stop each, by the resolver's level and the person's own names. "Already authorized by" keeps its address: it is not one of the positions the page named.

## A12. A flagged token's press

- **The build:** header "Unverified", title "Nulo flagged this token as a scam" (the existing banner's words, `FlaggedTokenBanner.vue`), then the address row; no seal ever.
- **What ships now:** as described. Alternative: the plain unverified press ("Unknown contract").
- **Answered on page 144: P144-09 = a**: "Nulo flagged this token as a scam" as the press title, as built. Nothing to build.

## A13. An unreadable authorization's line, draft

- **Surface:** the approval window, under an authorization whose arguments Nulo cannot decode (an authorization has no step number, so the count line cannot name it).
- **The answers file's mapping:** "an unreadable authorization (no rail number) keeps one short line of its own under it".
- **What ships now (draft, in the count line's shape):** "Nulo can't parse this authorization." in tertiary, no icon, no orange, replacing today's orange "Can't read the arguments" and its reason; the press of its consumer chip still says what Nulo knows of the contract.
- **Options:** this line; today's orange notice and reason kept.
- **Answered on page 144: P144-07 = a**: "Nulo can't parse this authorization." as built. Nothing to build.

## A14. A pending chip's press, draft

- **What ships now (draft):** "Nulo is still checking this contract." above the short address and the explorer link; no level header. Shown only until the worker's first answer.
- **Options:** this line; the address row alone (the plan's first fallback).
- **Read on page 144: P144-08 = read.** The owner's note, verbatim: "I'd need screenshot of (a)". (a) ships; arc 2's PR carries `a14-press-pending-a` light and dark at 400 px, a chip whose level never lands, pressed after the 1,000 ms cap released it. With the held chips, the line now shows only after the cap.

## A15. The raised-fee window carries the chips

- **Surface:** the window that raises a pending transaction's fee. It renders the same operation card as the approval window, so it now shows the contract chips, their presses (linking the explorer the person picked) and the count line, in place of today's addresses, orange notices and advice.
- **What ships now:** the same card in both windows (capture `fee-window-contract-chip`).
- **Options:** this; today's rail kept in that window alone (a second rendering path for one window).
- **Answered on page 144: P144-05 = a.** The owner's note, verbatim: "Why do you keep showcasing me this old way of sending a fee that increased? I understood we had changed how it looks? Or am I crazy?" The owner is right: page 144's frames were cut before #1803 landed the new raised-fee row. Arc 2 branches from dev, which carries #1803, and its captures show that row with the chips. Nothing to build.

## A16. "The name X came from an app." when the name is the wallet's own

- **Surface:** an unverified contract's press, when its decode names the contract. The line is the signed frame's (P139-04 = W1, round three's "The name Crowdfunding came from an app. Nulo hasn't checked it.").
- **The case it misreads:** the decode takes the name from whatever artifact the wallet holds for the contract's class. For an unlisted token the wallet registered with its own Token artifact, or a protocol contract such as Fee Juice, the name ("Token", "FeeJuice") did not come from an app. The decode carries no provenance, so the build cannot tell these apart. The line never raises a level.
- **What ships now:** the signed words for every decoded name.
- **Options:** the signed words; "The name X comes from the contract's code. Nulo hasn't checked it." (true in every case); the line only for names an app registered (needs provenance the decode does not carry, a data change).
- **The reviews:** Opus found the case; Codex agreed the signed words ship until you answer, and recommends the neutral wording.
- **Answered on page 144: P144-04 = b**, no note: "The name X comes from the contract's code. Nulo hasn't checked it." **Built in arc 2** for every decoded name; no other word changes.

## Page 143 (signed 2026-11-12 20:00 UTC, no notes): arc 2's, recorded

The answers file: "The owner's picks on round five's page (the fee-row matrix and the live loading options). All five are arc 2's; arc 1 keeps the fee row as today and the pending chip as (a), as its plan says."

- **P143-01 = b2**: "the seal on the app-paid fee row, Nulo verified only".
- **P143-02 = b3**: "the row only".
- **P143-03 = d**: "the chips held" (a placeholder per pending chip until its level lands or a 1,000 ms cap ends the wait; arc 2 amends the plan for the timer's lifecycle and audits it before building).
- **P143-04 = n1**: "the seal alone".
- **P143-05 = s1**: "nothing about the balance".

Arc 1 changes nothing for them: the fee row is as before the arc, and the pending chip is the real state (a) that d renders over (A3, A14). Arc 2 builds all five (A2, A3, A4).

## Page 144 (signed 2026-11-13 11:40 UTC): arc 1 approved, recorded

**P144-01 = Approve**, no note: #1805 landed as built. P144-02 = b (A7, A9), P144-03 = b (A11), P144-04 = b (A16), P144-05 = a with a note (A15), P144-06 = b (A10), P144-07 = a (A13), P144-08 = read (A14), P144-09 = a (A12), each quoted under its ask. Unanswered: A4, A5 and A6 ship as built. A8 is an owner decision named in the plan's Outcome, not filed.
