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
