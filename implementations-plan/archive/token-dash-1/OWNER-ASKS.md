# token-dash-1 owner asks

## OA-1: the same rule on a registered token's other surfaces

- **Surface:** the surfaces that show a token after it is added: Home's token rows and the import row shown while the add runs, the Send token picker, Settings → Tokens, the token details popup and page, Activity rows. Each renders the stored name and symbol through its own code, not through the approval card's (recon § The read path).
- **Why it comes up:** P70-09 B gives the Register token card the empty-value dash. A token whose contract returns an empty or blank symbol can still be added, and those surfaces then show the symbol blank; Home's token row shows its name as "unknown".
- **Options:**
  - A. Card only (what P70-09 B names): the other surfaces stay as they are.
  - B. The same dash wherever the stored name or symbol shows, in a later lane with its own pictures.
- **Recommendation:** A. Activity and Send rows put the symbol after the amount, so a dash there ("1.5 —") would read as an unknown amount, the meaning the dash already has on Home and in Send.
- **What ships now:** A. Only the Register token card changes.
- **Blocks arc 1:** no. Filed as #932 (`owner-decision`).
