# Owner asks: token-icons-build-2

Each ask names what ships now; no PR waits for an answer. Page 134's picks are the visible budget (`plan.md` § Sign-offs).

## B1. A stopped default's mark beside its dimmed symbol

- **Surface**: Home, a default token whose setup failed ("Couldn't set up", RETRY) or was refused ("Couldn't verify"). The row shows its symbol at 55 % opacity today.
- **Why it is asked**: A3 (a) gives a seed row "the list's picture"; it does not say whether a stopped row's picture dims with its symbol. An import row that fails dims as a whole today (`opacity: 0.7`), so its mark dims with it.
- **Options**:
  - (a) the picture as published, at full strength, beside the dimmed symbol. **Recommended**: M1's "as published, unaltered", and the reason line under the symbol already says the row stopped.
  - (b) the picture dimmed with the symbol, as a failed import row's is.
- **What ships now**: (a).
- **Answer**: pending.

## B2. A default token's import row: its picture or initials

- **Surface**: Home, a default token in the moment its setup journals its import (`TokenImportRow` in the default's slot), between its seed row and its card. Also a listed token added again after it was deleted.
- **Why it is asked**: A3 (a) says "grey initials on an import row" and "a seed row keeps its picture when it becomes a card". A default passes through an import row on its way from seed row to card, and that row knows the list's entry, so the two lines meet there.
- **Options**:
  - (a) grey initials on every import row, as A3 says: a default's slot shows the list's picture, then its initials while it imports, then the picture again.
  - (b) the list's picture on an import row whose chain and contract the list names, initials on any other: one picture from seed row to card. **Recommended**: the slot keeps one face, which is what "keeps its picture" asks for.
- **What ships now**: (a).
- **Answer**: pending.

## B3. An import row whose symbol is not known yet

- **Surface**: Home, a token being added from its contract address, before the wallet has read its symbol (the row shows the shortened contract, or "Token").
- **Why it is asked**: A3 (a) gives an import row grey initials, and such a row has no symbol to take them from.
- **Options**:
  - (a) a dash on the grey disc, as the mark already draws for a token whose symbol has no letter or digit; the initials replace it once the symbol is read. **Recommended**: the initials of an address would read as a name.
  - (b) an empty grey disc.
- **What ships now**: (a).
- **Answer**: pending.

## B4. An import row whose title is too long for the row

- **Surface**: Home, a token being added whose contract names itself with one long, unbreakable symbol (up to 32 characters), during its import or on its failed row until dismissed.
- **Why it is asked**: the import row's title is never cut, as a send or receive row's symbol is not (#625, a closed known limit). A3 (a)'s 32 px mark and 12 px gap take 44 px from the title, so a long title now meets the spinner or the failed × sooner. Measured on Chrome with "ABCDEFGHIJKLMNOPQRSTUVWXYZ012345": 28 characters stay 16.9 px clear of the ×; 32 run 16.1 px over it and 2.1 px past the row's edge. Nothing scrolls sideways; glyph widths vary, so the threshold moves with the symbol.
- **Options**:
  - (a) uncut, as before: a title too long for the row runs under the spinner or ×.
  - (b) cut with an ellipsis where it meets the spinner or ×, as a token row cuts its symbol. **Recommended**: the row's status stays readable, and the whole symbol is on the token's page once it lands.
- **What ships now**: (a).
- **Answer**: pending.

## B5. An unpriced token's name at the narrowest width

- **Surface**: Home, Holdings and Send's picker at 240 px, a token row with no price, whose second line is the token's name (a sandbox or custom token).
- **Why it is asked**: the name keeps the row's existing single-line ellipsis (contract-supplied text is clipped). A3 (a)'s 32 px mark and 12 px gap take 44 px from the text column, so at 240 px a name as short as "TestToken" now ends in an ellipsis where it showed whole; the narrow-width check accepts that by a reviewed exemption.
- **Options**:
  - (a) the existing ellipsis: the symbol stays whole above it, and the token page's Show metadata names it whole.
  - (b) the name wraps onto a second line at narrow widths.
  - (c) the mark shrinks at narrow widths.
- **What ships now**: (a).
- **Answer**: pending.
