# holdings-add-1: owner asks

Each ask is built as today until the owner answers. Nothing else in the lane waits on them.

**Answered on page 195 (2026-11-19, 22:14Z):** A1 = option 3, A2 = option 2. Both are built in arc 2 (plan § Arc 2).

**Answered on page 197 (2026-11-19, 23:14Z):** A3 = option 2, built in arc 3 (plan § Arc 3). No ask is open.

## A1. A flagged address on Holdings

**Surface.** Holdings' search with a pasted address that the signed list flags. Holdings already shows "Flagged as a scam" under the Add row. The New token popup does not repeat it: it shows the address field and the Import button only. Built: a flagged address keeps the popup, and so does any address pasted before the wallet has read the list, when no flag can be known.

**What an import does.** It lists the token, and it also marks the token's incoming transfers as trusted, so its arrivals show without the first-receive prompt. This is the same for every add path.

**Options.**
1. **Keep two presses (built).** Add opens the New token popup, as today. The popup stays a second confirmation, but it does not say why.
2. **One press.** Add imports at once, as for any other address. The flag line is in view beside the button when the person presses, and it stays on the added row ("Flagged as a scam" on Home, Holdings and Send).
3. **Two presses, and the popup repeats the flag.** Add opens the popup, and the popup shows "Flagged as a scam" under the address. This adds a line to the popup.

**Recommendation: option 3.** An import also trusts the token's incoming transfers, so a scam token's airdrops would show at once. A confirmation is worth one more press here, but only if it names the reason: today's popup does not, so option 1 confirms nothing. Option 2 is the simplest if the flag line beside the button is enough warning.

## A2. An added token with no balance folds away

**Surface.** Holdings' list after an add. A token whose balance is zero joins the "N empty" fold once its balance lands, so the row the person just added is replaced by "1 empty · show". This happens today too, after the popup closes. A pinned empty row stays in view. The add ends just before the balance lands, so focus goes to the new row, and the row then folds away with it: a keyboard user is left on the page.

**Options.**
1. **Leave it (built).**
2. **A searched address never folds.** While the search holds a whole contract address, its row shows even when empty.

**Recommendation: option 2.** A person who searched one token wants to see that token, and focus then stays on it. This is a small rule in the list, outside this lane until the owner says so. With option 1, focus should follow the row into the fold, a small change of its own.

## A3. The green check beside a flagged address in the New token popup

**Surface.** The New token popup's address field. While an address is valid, the field shows a green check at its right end. With a flagged address, that check now sits beside the new "Flagged as a scam" line under the field (captures `ha-flag-popup-light`, `ha-flag-popup-dark`).

**Options.**
1. **Leave it (built).** The check says the address is well formed, and the line says the list flags it.
2. **Hide the check while the address is flagged.** The line is then the only mark beside the field.

**Recommendation: option 2.** A green check next to a scam warning reads as a mixed signal, and the field's well-formedness adds nothing once the list names the token. This changes no words.
