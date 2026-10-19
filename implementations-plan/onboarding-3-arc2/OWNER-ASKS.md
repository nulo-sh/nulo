# Owner asks: onboarding-3, arc 2

These asks come from the owner's second build test of #743 (2026-10-19). Each one is a visible choice that no signed rule settles. Each has a "what ships now" line, and the arc builds that line. The pictures show Chrome at the popup's real size, 360×600, in light and dark. A picture captioned **mockup** is the real Home, changed in the browser through its live styles. Nothing in a mockup is built. The numbering continues after [arc 1's asks](../archive/onboarding-3/OWNER-ASKS.md) (OA-1 to OA-16).

Already shipped in this round, signed: **P50-01 = B** (#769). A profile created beside another shows only what it lacks. A password profile shows the phrase row alone, and a passkey profile shows no card. That covers the owner's first case: passkeys imported first, then a password profile created.

## OA-17. The padding inside the Get started rows

**Surface:** Home, the Get started card.

**Today:** each row's text sits 21 px inside a bordered box. The section label, the Hide link, the Holdings rows and their balances all sit on the page's 24 px edges.

| Option | Looks like | Light | Dark |
|---|---|---|---|
| O0. Today | the bordered box; the text 21 px inside it | _pending_ | _pending_ |
| O1. No box, hairlines | no border and no inner padding; a hairline between the rows across the content width; the text on the page's edges, as the Holdings rows are | _pending_ | _pending_ |
| O2. A full-width band | a line above and below the rows from one side of the popup to the other; no side borders; the text on the page's edges | _pending_ | _pending_ |
| O3. A tinted band | O2 with a light tint behind the rows and no lines | _pending_ | _pending_ |
| O4. The Holdings rhythm | no box and no hairlines; the rows as tight as the Holdings rows; the text on the page's edges | _pending_ | _pending_ |

Two seeds were dropped. Moving the box outward leaves it 3 px from the popup's edge, and no other screen has a gap like that. A leading ring per row looks like a checkbox that never gets a check, because a row leaves when its step is done.

**Recommendation: O1** (both reviewers, moderate confidence). It puts the row text on the same edges as the label, Hide and the Holdings rows. The hairlines keep the rows apart without a box. The change stays inside the card, so the Settings lists that share these rows are untouched. **What ships now: O0, today's form.**

## OA-18. "Get Fee Juice" after the account held Fee Juice

**Surface:** Home, the Get started card, for the install's first created profile only. A later or imported profile never shows the row.

**Cases:** the account's Fee Juice is spent back to zero; or the person selects another account, or another network, where the account holds none; or a Testnet reset starts a new chain, where the account holds none.

**Today:** the row follows the selected account on the selected network. It leaves while that account holds Fee Juice, and it comes back when the account holds none.

| Option | What the card shows in those cases | Pictures |
|---|---|---|
| A. Today | the row comes back | _pending_ |
| B. Once held, done | the row leaves for good the first time the profile's account holds Fee Juice, as "How Aztec works" leaves once opened | _pending_ |

B stores one more per-profile flag, so it is a decision about persisted state. The flag is per profile, but Fee Juice is per account and per network. So under B, a second account that holds none never shows the row either.

**Recommendation: A** (both reviewers, moderate confidence). The owner's words are in the present tense ("check if it has fee juice"), and the row then states a true fact about the account on screen. Hide already dismisses it for good. B is per profile while Fee Juice is per account and per network, and it stores one more flag. **What ships now: A.**

## OA-19. The card after a Testnet reset

**Surface:** Home, after the reset takeover finishes.

**The owner's words:** "Has recently "resetted" their Testnet state (we should not show anything probably)."

**Today:** a reset keeps every reminder flag, because it changes no backup and no step the person has done. The phrase or backup row stays while it is open. "How Aztec works" and "Make proofs faster" stay as they were before the reset. "Get Fee Juice" comes back, because the new chain holds none (OA-18).

| Option | After a reset | Pictures |
|---|---|---|
| A. Today | the card as before the reset, with "Get Fee Juice" back | _pending_ |
| B. As OA-18 B | the card as before the reset; "Get Fee Juice" does not come back | _pending_ |
| C. Only the backup row | the reset removes "How Aztec works", "Get Fee Juice" and "Make proofs faster"; the phrase or backup row stays while it is open (unlike Hide, which also removes a passkey wallet's backup row) | _pending_ |
| D. No card | the reset removes the card, the phrase row included | not recommended: an unsaved phrase is still the only backup |

C and D store a per-profile mark written by the reset.

**Recommendation: A** (both reviewers, moderate confidence). A reset changes no backup and no step the person has done. The one row that comes back, "Get Fee Juice", is true: the new chain holds none. **What ships now: A.**

## OA-20. An imported wallet that holds nothing

**Surface:** Home, for a profile imported from a phrase, a passkey or a full backup.

**The owner's words:** "imports account with no gas, no balance, no nothing."

**Today:** an imported profile shows no card, whatever it holds. That is the owner's OA-16 rule (#768): "if I imported: means I already have it backed up. Feels like when we import, we shouldn't show any of those things (getting started)." When the person tries to send, the Send fee card says the account has no Fee Juice, and it links to the bridge.

| Option | Looks like | Pictures |
|---|---|---|
| A. Today | no card | _pending_ |
| B. Fee Juice alone | a one-row card, "Get Fee Juice", while the imported account holds none; no Hide | _pending_ |

**Recommendation: A** (both reviewers, moderate confidence). It is the signed OA-16 rule. B would add a row with no Hide, which today only the backup reminder has. **What ships now: A.**
