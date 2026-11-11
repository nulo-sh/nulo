# Owner asks: token-icons-build-1

Each ask names what ships now; no arc waits for an answer. Arc 1 touches no surface: no released build reads the list's pictures, and only the owner's publish serves them.

## A1. The look of Nulo's letter mark (GBPC, and `cWETH` under A2)

- **Surface**: wherever GBPC (Testnet) or `cWETH` (Mainnet) shows, from arc 2 on: token rows, Send, the token page, Activity, the approval line.
- **Why it is asked**: L3 says "Nulo draws GBPC's under M1 too"; how it looks is not on page 129.
- **Options**:
  - (a) a disc in Nulo's accent `#a8480c` with a white geometric letter ("G", "W"). It reads as Nulo-made and never as the grey circle of a token not on the list. **Recommended.**
  - (b) the same with a near-black disc. Quieter, but close to the dark theme's surfaces.
  - (c) a currency sign for GBPC ("£") in place of the letter. Reads as a currency, though no issuer stands behind it.
- **What ships now**: (a), in `list.source.json` (arc 1). Arc 1's PR body shows the five pictures at 16 to 36 px in both themes. No wallet shows them until the owner approves `sign` and merges the publish PR, so that approval is the decision; a later change is a list edit, published with no release.

## A2. `cWETH` has no issuer logo

- **Surface**: Mainnet's `cWETH` wherever it shows, from arc 2 on.
- **Why it is asked**: M1 covers issuers' logos; wrapped ether has no issuer, and the ETH diamond belongs to no issuer of `cWETH`.
- **Options**: (a) Nulo's letter mark "W", as GBPC's (L3's rule for a token with no published logo). **Recommended.** (b) Ethereum's diamond, a third party's mark on a token it did not issue.
- **What ships now**: (a).

## A3. Home's other rows beside the token cards (arc 2)

- **Surface**: Home's holdings list, which renders three kinds of row beside the token cards: a default token still being set up (`TokenSeedRow`, on a fresh profile or after a network reset), a token import in progress (`TokenImportRow`), and the loading skeleton rows.
- **Why it is asked**: the UI impact lines and the A sign-off name the token rows; these three are not token rows, and no plan line covers them.
- **Options**:
  - (a) the same 32 px slot before their text: the list's picture on a seed row (it comes from the list), grey initials on an import row, a 32 px round skeleton on a loading row. Every row's text starts at one edge, and a seed row keeps its picture when it becomes a card. **Recommended.**
  - (b) leave them as they are.
- **What ships now**: (b). On Home, those rows' text sits 44 px left of a card's symbol, and a default token's row moves 44 px right when its setup ends and it becomes a card. Holdings and Send's picker show only token cards, so they are aligned.

## A4. The token rows' mark meets the row's dollar figure (arc 2)

- **Surface**: the token rows on Home, Holdings and Send's picker (`TokenCard`).
- **Why it is asked**: two picks meet on the row. P46-08 B gave the priced figure "a 190 px cap on the token row", and the smoke suite holds it there: $123,456,789,012,345.68 at a $1 quote stays on two lines. A's 32 px mark and its 12 px gap take 44 px of the 312 px row, and at that balance the balance column needs 101.4 px. That leaves the figure 166.6 px. After its break at "≈", "$123,456,789,012,345.68" needs 179.4 px, so the figure takes a third line (measured in Chrome). A mark and gap fit only within 31.2 px, and every other way to make room changes what a person sees. The rows' mark also narrows realistic rows: with 12,345.67 on each side of the split, "≈ $24,691.34" no longer fits its 89 px and wraps under its "≈" (measured; it reads on one line today).
- **Options**:
  - (a) A as planned: the 32 px mark with a 12 px gap. A figure takes a third line from about $10 trillion (today from about $1 quadrillion), and the guard is restated at the new width. A row with a wide split wraps its figure onto two lines, as the wrap rule allows. **Recommended**: the frames the owner picked, with a third line only at balances no holder has.
  - (b) a 20 px row mark with an 8 px gap (28 px). Both measured figures keep today's lines (182.6 px for the long one, 3.2 px to spare). The rows' mark is smaller than A's frames and Send's 36 px mark.
  - (c) compact the figure past $1 trillion as the balance already reads ("≈ $123.45T"). The owner sets the threshold and the precision. A wide-split row still wraps as in (a).
- **What ships now**: the rows as today, with no mark. Arc 2 ships the channel, the mark, Send's asset row and the token page header, and the rows' mark lands with the owner's answer. A3 applies once a rows' mark ships.
