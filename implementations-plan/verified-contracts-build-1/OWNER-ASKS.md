# verified-contracts-build-1: owner asks

Each ask names the surface, the options, a recommendation and **what ships now**: what the arc's PR carries without waiting. No PR lands before the owner approves its captures, so a draft here reaches nobody until then. A1 to A3 are page 139's open slots: their answers arrive in the answers file and are quoted here, marked answered, when applied.

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

## A3. P139-07: a level not yet known (slot S3), answered as the base

- **Answered on page 140: P140-04 = read**; arc 1 builds no mark until the level is known, as a real pending state.
- **The owner's note, verbatim:** "I don't quite understand this in it's completeness... Because... Also once the chip loads, we could change the addresses for the names of the contracts, right? Maybe we should implement this PoCs on an artifact so I can decide checking out how they'd look "live"?"
- **The page 139 note it answers, verbatim:** "Should we do a skeleton loading on the names / verification of the contracts until they load? Should we try that out? It'd be weird to laod the approval pop-up and all of a sudden a jitter because we checked it. ORRRR I am missunderstanding this ask."
- **What ships now:** a pending chip shows its short address, no seal and no level words; its accessible name is the address alone; its press has no level header and says "Nulo is still checking this contract." (draft, A14) above the address row. In this build the only source is the local list, so a chip is pending only until the worker's first answer. A skeleton, held chips or a name kept in the press is a rendering change on this state.

## A4. The legend's three entries (Settings → Glossary, a new Contracts section), drafts

- **Nulo verified:** "Nulo knows which contract this is and names it, which isn't a promise that it's safe." (round three's line, 85 characters)
- **Aztecscan verified:** "Its code is verified on Aztecscan, but Nulo hasn't checked who runs it." (signed in P135-03)
- **Unverified (draft):** "Shown with no mark: Nulo has nothing that vouches for this contract." (67). Round three's line ("…neither Nulo nor Aztecscan has verified its code.") is not true while Nulo does not ask Aztecscan.
- **Where:** "Approval window · Connect window".
- **What ships now:** these three, with the solid seal beside Nulo verified and the outline seal beside Aztecscan verified.

## A5. Press lines beyond the signed ones

- **Nulo verified, a token:** "Nulo knows this contract. Knowing it isn't a promise that it's safe." then "Nulo names it from its token list." (both as drawn in `vc3-s1-nulo-01`).
- **Nulo verified, the PrivateFPC:** the first of those lines only (round two's "Aztec's standard fee contract, at its fixed address." was never drawn in a press).
- **Unverified:** "Unverified", "Unknown contract", then "Nulo hasn't checked this contract." alone (**P140-05 = a**, signed 16:56 UTC: in arc 1 Nulo never asks Aztecscan, so the second line, in each of its three forms, arrives with the Aztecscan reader), then the address row. When the decoded contract's own code names it, one more line says who chose the name and what Nulo checked, as round three drew it: "The name Crowdfunding came from an app. Nulo hasn't checked it." (P135-06 default 2 as P139-04 = W1 rewrote it; the chip keeps the short address).
- **The app (execute and connect windows):** "Nulo doesn't know this site. Each contract shows its own level." above W1's line (as drawn in `vc3-s1-app-01`, the frame P139-04 was signed on).
- **What ships now:** as listed.

## A6. The PrivateFPC's chip label

- **Options:** "Private Fee Juice" (the wallet's name for that payer in the fee card today, `fee-helpers.ts`, `FeeRaisedCard.vue`); "PrivateFPC" (round two's frames).
- **What ships now:** "Private Fee Juice": no new word. Recommendation: the same.

## A7. Tokens the list does not name

- **What changes:** following P135-06's "a short address on an unverified chip", a token the person holds that the list does not name shows its short address in the chip, without today's grey initials and without its symbol in the step sentence ("Transfer (public) 20 [0x1e6f12..7a8b]"); the "Leaves your account" total keeps the symbol. A flagged token keeps its red badge in the chip and never shows the seal.
- **What ships now:** as described. Ask: confirm, or keep the person's own token symbol on an unverified chip.

## A8. Protocol contracts and N2's effect lines

- **What a person sees:** the Fee Juice contract (a claim's target) and other protocol contracts read unverified: no list names them. Round one's N2 effect lines ("Adds Fee Juice you bridged…", "Pays this transaction's network fee…") are not in this build's sign-offs, so those calls keep today's shared unchecked line.
- **What ships now:** as described. Follow-ups named in the plan's Outcome: protocol contracts as a Nulo verified rung, N2.

## A9. A contract saved as a contact

- **Today:** a step's target that the person saved as a contact reads by the contact's name. **With the chip:** an unverified contract reads by its short address (P135-06), so that name goes.
- **What ships now:** the short address. Ask: keep the contact's name on an unverified chip instead.

## A10. A seal-like emoji in an app's self-declared name

- **What can happen:** an app named "Playground ✅" shows that emoji inside its unverified chip, as today's caption shows it under the address. The chip frame may make it read closer to a verified chip. Exploitability unknown.
- **Options:** keep today's sanitizer; strip pictographic characters from the app chip's label (changes how some names read).
- **What ships now:** today's sanitizer.

## A11. Which addresses in an authorization line become chips

- **What the drawn model A showed:** in `vc3-s1-app-01` the authorization's caller and recipient (a contract the fixture knew) were chips too.
- **The build:** only contract positions become chips: a step's target and an authorization's consumer (the token). The caller, "from" and "to" stay as today (an account name or a short address), because Nulo cannot tell another person's account from an unknown contract.
- **What ships now:** the build's rule. Ask: chip the caller and "to" as drawn, accepting that an account may read as "Unknown contract".

## A12. A flagged token's press

- **The build:** header "Unverified", title "Nulo flagged this token as a scam" (the existing banner's words, `FlaggedTokenBanner.vue`), then the address row; no seal ever.
- **What ships now:** as described. Alternative: the plain unverified press ("Unknown contract").

## A13. An unreadable authorization's line, draft

- **Surface:** the approval window, under an authorization whose arguments Nulo cannot decode (an authorization has no step number, so the count line cannot name it).
- **The answers file's mapping:** "an unreadable authorization (no rail number) keeps one short line of its own under it".
- **What ships now (draft, in the count line's shape):** "Nulo can't parse this authorization." in tertiary, no icon, no orange, replacing today's orange "Can't read the arguments" and its reason; the press of its consumer chip still says what Nulo knows of the contract.
- **Options:** this line; today's orange notice and reason kept.

## A14. A pending chip's press, draft

- **What ships now (draft):** "Nulo is still checking this contract." above the short address and the explorer link; no level header. Shown only until the worker's first answer.
- **Options:** this line; the address row alone (the plan's first fallback).
