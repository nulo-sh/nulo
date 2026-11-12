# verified-contracts-build-1: owner asks

Each ask names the surface, the options, a recommendation and **what ships now**: what the arc's PR carries without waiting. No PR lands before the owner approves its captures, so a draft here reaches nobody until then. A1 to A3 are page 139's open slots: their answers arrive in the answers file and are quoted here, marked answered, when applied.

## A1. P139-02: a call Nulo cannot read (slot S1), open

- **The owner's note, verbatim:** "The thing here is that when it's only one call, of couse I'd go for "b" but try to showcase this with a 10-call transaciton with 5 it can't read. So we can check how noisy it gets."
- **Options:** the seal alone, no line; one plain line "Nulo can't read this call." under each unreadable call; one counting line for the window ("Nulo can't read calls 3, 5, 7, 8 and 10.").
- **Recommendation:** whatever the round-4 page settles; the plan carries each option's change.
- **What ships now:** one plain tertiary line under each unreadable call, no icon, no orange; the call's orange notice and the window's closing advice go; an unreadable authorization keeps today's notice and advice.
- **A case to weigh:** a call on a Nulo verified token whose arguments Nulo cannot read shows the solid seal on its chip and only the tertiary line under it, where today it shows the orange notice.

## A2. P139-05: the fee row's green tick (slot S2), open

- **The owner's note, verbatim:** "To be honest: do we need this glyph in particular? I think it's not needed? Or maybe we should use the resette as Nulo verified? But it's a bit weird. Of course if we are showcasing the fee it's nulo verified. I think this green check is confusing. We should work to improve this."
- **Options** (by content; the round-4 page letters them a = no glyph, b = the seal for the payer, c = today): no glyph; the solid seal for a Nulo verified payer (reopens P135-06's "no chip on the fee payer"); today's green tick.
- **What ships now:** today's fee row, unchanged.

## A3. P139-07: a level not yet known (slot S3), open

- **The owner's note, verbatim:** "Should we do a skeleton loading on the names / verification of the contracts until they load? Should we try that out? It'd be weird to laod the approval pop-up and all of a sudden a jitter because we checked it. ORRRR I am missunderstanding this ask."
- **Options:** no mark until known; a skeleton in the seal's place that the seal fills.
- **Context for this build:** the only level source here is local (the signed list the wallet holds, plus the compiled-in PrivateFPC), so a chip waits at most for the worker's first answer; the long wait round 4 measured is Aztecscan's, which this build does not ask.
- **What ships now:** no mark until known: the short address, no seal, no level words, and a press with the address row only.

## A4. The legend's three entries (Settings → Glossary, a new Contracts section), drafts

- **Nulo verified:** "Nulo knows which contract this is and names it, which isn't a promise that it's safe." (round three's line, 85 characters)
- **Aztecscan verified:** "Its code is verified on Aztecscan, but Nulo hasn't checked who runs it." (signed in P135-03)
- **Unverified (draft):** "Shown with no mark: Nulo has nothing that vouches for this contract." (67). Round three's line ("…neither Nulo nor Aztecscan has verified its code.") is not true while Nulo does not ask Aztecscan.
- **Where:** "Approval window · Connect window".
- **What ships now:** these three, with the solid seal beside Nulo verified and the outline seal beside Aztecscan verified.

## A5. Press lines beyond the signed ones

- **Nulo verified, a token:** "Nulo knows this contract. Knowing it isn't a promise that it's safe." then "Nulo names it from its token list." (both as drawn in `vc3-s1-nulo-01`).
- **Nulo verified, the PrivateFPC:** the first of those lines only (round two's "Aztec's standard fee contract, at its fixed address." was never drawn in a press).
- **Unverified:** "Unverified", "Unknown contract", then the address row, with no level line: round three's "Neither Nulo nor Aztecscan has verified this contract." claims an Aztecscan answer this build never asks for. Round four drafts "Nulo hasn't checked this contract." for this case.
- **The app (execute and connect windows):** "Nulo doesn't know this site. Each contract shows its own level." above W1's line (as drawn in `vc3-s1-app-01`, the frame P139-04 was signed on).
- **What ships now:** as listed. Recommendation: add round four's line to the unverified press once its page is signed.

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
