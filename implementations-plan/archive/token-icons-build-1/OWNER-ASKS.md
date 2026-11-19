# Owner asks: token-icons-build-1

Each ask names what ships now; no arc waits for an answer. Arc 1 touches no surface: no released build reads the list's pictures, and only the owner's publish serves them.

## A1. The look of Nulo's letter mark (GBPC, and `cWETH` under A2)

- **Surface**: wherever GBPC (Testnet) or `cWETH` (Mainnet) shows, from arc 2 on: token rows, Send, the token page, Activity, the approval line.
- **Why it is asked**: L3 says "Nulo draws GBPC's under M1 too"; how it looks is not on page 129.
- **Options**:
  - (a) a disc in Nulo's accent `#a8480c` with a white geometric letter ("G", "W"). It reads as Nulo-made and never as the grey circle of a token not on the list. **Recommended.**
  - (b) the same with a near-black disc. Quieter, but close to the dark theme's surfaces.
  - (c) a currency sign for GBPC ("£") in place of the letter. Reads as a currency, though no issuer stands behind it.
- **Answered**: (b), on decision page 132 (P132-04): "The same letter on a near-black disc: quieter, and close to the dark theme's surfaces." #1780 moved GBPC's disc from arc 1's accent `#a8480c` to `#0a0908`, before the list's first publish.

## A2. `cWETH` has no issuer logo

- **Surface**: Mainnet's `cWETH` wherever it shows, from arc 2 on.
- **Why it is asked**: M1 covers issuers' logos; wrapped ether has no issuer, and the ETH diamond belongs to no issuer of `cWETH`.
- **Options**: (a) Nulo's letter mark "W", as GBPC's (L3's rule for a token with no published logo). **Recommended.** (b) Ethereum's diamond, a third party's mark on a token it did not issue.
- **Answered**: (b), on decision page 132 (P132-05): "Ethereum's diamond: a third party's mark on a token it did not issue." #1780 replaced arc 1's "W" with the Ethereum Foundation's diamond, recorded in `infra/token-list/README.md` § Pictures.

## A3. Home's other rows beside the token cards (arc 2)

- **Surface**: Home's holdings list, which renders three kinds of row beside the token cards: a default token still being set up (`TokenSeedRow`, on a fresh profile or after a network reset), a token import in progress (`TokenImportRow`), and the loading skeleton rows.
- **Why it is asked**: the UI impact lines and the A sign-off name the token rows; these three are not token rows, and no plan line covers them.
- **Options**:
  - (a) the same 32 px slot before their text: the list's picture on a seed row (it comes from the list), grey initials on an import row, a 32 px round skeleton on a loading row. Every row's text starts at one edge, and a seed row keeps its picture when it becomes a card. **Recommended.**
  - (b) leave them as they are.
- **What ships now**: (b), and the rows are unchanged while the cards carry no mark (A4). Once a card's mark ships, those rows' text sits a mark and gap left of a card's symbol on Home, and a default token's row moves right by that much when its setup ends and it becomes a card. Holdings and Send's picker show only token cards.
- **Answer**: pending.

## A4. The token rows' mark meets the row's dollar figure (arc 2)

- **Surface**: the token rows on Home, Holdings and Send's picker (`TokenCard`).
- **Why it is asked**: two picks meet on the row. P46-08 B gave the priced figure "a 190 px cap on the token row", and the smoke suite holds it there: $123,456,789,012,345.68 at a $1 quote stays on two lines. A's 32 px mark and its 12 px gap take 44 px of the 312 px row, and at that balance the balance column needs 101.4 px. That leaves the figure 166.6 px. After its break at "≈", "$123,456,789,012,345.68" needs 179.4 px, so the figure takes a third line (measured in Chrome). A mark and gap fit only within 31.2 px, and every other way to make room changes what a person sees. The rows' mark also narrows realistic rows: with 12,345.67 on each side of the split, "≈ $24,691.34" no longer fits its 89 px and wraps under its "≈" (measured with the mark; without it the column is 133 px, room for the figure on one line).
- **Options**:
  - (a) A as planned: the 32 px mark with a 12 px gap. A figure takes a third line from about $10 trillion (today from about $1 quadrillion), and the guard is restated at the new width. A row with a wide split wraps its figure onto two lines, as the wrap rule allows. **Recommended**: the frames the owner picked, with a third line only at balances no holder has.
  - (b) a 20 px row mark with an 8 px gap (28 px). Both measured figures keep today's lines (182.6 px for the long one, 3.2 px to spare). The rows' mark is smaller than A's frames and Send's 36 px mark.
  - (c) compact the figure past $1 trillion as the balance already reads ("≈ $123.45T"). The owner sets the threshold and the precision. A wide-split row still wraps as in (a).
- **What ships now**: the rows as today, with no mark. Arc 2 ships the channel, the mark, Send's asset row and the token page header, and the rows' mark lands with the owner's answer. A3 applies once a rows' mark ships.
- **Answer**: pending.

## A5. A dApp's transfer row: the mark beside the app chip (arc 3)

- **Surface**: the settled Activity row of a transfer a dApp started (Home's recent activity, a token's page, History), whose title is the token's symbol with the dApp's app chip beside it.
- **Why it is asked**: AC1 puts a 16 px mark and a 6 px gap before the title, and on this row only the title shares its line with the app chip, which gives way to the title down to its 20 px floor (P34-08 D, chips-3 D5). The prototype's frames show no dApp transfer. Measured in Chrome at the popup's width: "Shielded Payroll Portal" beside a 1,250 USDC transfer reads 85.8 px with the mark, where the smoke suite holds it at its 96 px cap today. A 16-letter symbol keeps the chip at its floor and still fits beside a four-digit figure.
- **Options**:
  - (a) the mark there too, as on every other row titled by a token: the app chip shows 22 px less of the dApp's name wherever it is cut, and the guard is restated to the chip between its floor and its cap. **Recommended**: the dApp's transfer is where a look-alike token most needs its picture.
  - (b) no mark on a dApp's transfer: the row reads as today.
- **What ships now**: (b). Every other row titled by a token, in every phase, carries the mark; a dApp's transfer does not, until the owner picks.
- **Answer**: pending.

## A6. The fee-raised window's copy of the approval line (arc 3)

- **Surface**: the window that asks again when a dApp's transaction needs a higher fee. It shows the approval window's summary, the transfer line included, and reads no token list.
- **Why it is asked**: AL1 gives the approval window's line the token's picture, and that window reads the list. The fee-raised window shows the same line, but it reads no price while its session is checked or locked and, once signed in, reads the cache once, from its fee card. Without the list it could only draw initials, which would say a listed token has no picture, and no badge, which would say a flagged token is not flagged.
- **Options**:
  - (a) the mark there too: the window reads the list from the cache once signed in, a second read beside its fee card's, so the line looks the same in both windows. **Recommended**: a person approving a raised fee sees the token as they first approved it.
  - (b) no mark there: the line reads as today.
- **What ships now**: (b). A summary given no list reader draws no mark.
- **Answer**: pending.
