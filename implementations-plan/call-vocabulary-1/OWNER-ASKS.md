# call-vocabulary-1: owner asks

All four are answered by the orchestrator (2026-10-17, ship-now form each); the owner sees them on a decision page with the arc's screenshots. They were non-blocking: the arc ships in the form "what ships now" says. OA-1(a), OA-2 and OA-4 propose changes outside the visible budget the lane's records grant (plan § UI impact); their "ships now" is today's form. OA-1(b) ships the window's words, which P40-02 grants, and asks whether a mint label fits better. OA-3 is a consequence the records cover (the approval window's own wording while it reads a call) and offers two ways to avoid it.

## OA-1. Two titles the picks leave open in Activity and on the detail page

- **(a) A transfer the wallet read** (its own send, or a dApp's transfer on a token you added): A, keep "Transfer"; B, the approval window's label, "Transfer (private)", "Transfer (public)", "Transfer to public" or "Transfer to private". On the detail page the header reads TRANSFER (A) or TRANSFER (PRIVATE) (B). Your own send's row shows the token symbol either way.
- **(b) A mint to a commitment** (`mint_to_commitment` on a token you added; the window has no label for it and prints "Mint To Commitment"): A, "Mint To Commitment", the window's words, with today's faucet glyph and "Mint amount"; B, "Mint (private)", since it is a private mint.
- **Recommendation**: (a) B, for the reason P40-02 gives for mints: one set of words. (b) A, the window's words.
- **What ships now**: (a) A, "Transfer"; (b) A, "Mint To Commitment" (it read "Mint" before).
- **Answered**: by the orchestrator, 2026-10-17 (D-orch: "ship-now form; the owner sees it on a decision page with the arc's screenshots"). The arc builds the form above.

## OA-2. The window's other cards that name a call

- **Surface**: the execute window's authorization card (`createAuthWit`, which signs: its Function line), and its simulation and utility cards (`simulateTx`, `profileTx`, `executeUtility`, `simulate_utility`, which sign nothing: their Payload and Function lines).
- **Options**: A, keep naming a call by the wallet's label on any contract; B, the grant card's rule (P36-01): a movement label only on a call the wallet read as one, else the call's own name.
- **What each looks like**: a dApp's `transfer_in_public` on a contract you never added reads "Transfer (public)" (A) or "Transfer In Public" (B).
- **Recommendation**: B, one rule for every card; the authorization card first, since it signs.
- **What ships now**: A, unchanged. (The `simulate_transaction` card, which nothing can open today, takes B with the grant card's rows.)
- **Answered**: by the orchestrator, 2026-10-17 (D-orch: "ship-now form; the owner sees it on a decision page with the arc's screenshots"). The arc builds the form above.

## OA-3. The first moment after Home or History opens

- **Behaviour**: rows paint before the token list arrives (one request). Until it does, a mint on a token you added, or a dApp's transfer on one, shows its own name and the generic call glyph, then switches to "Mint (private)" and the faucet, or "Transfer" and the send arrow. The approval window does the same while it reads a call. The PR measures how long the first form shows.
- **Options**: A, accept the switch; B, hold the transaction rows until the token list has loaded (they appear a moment later, once, in their final form); C, show the label first and fall back to the plain name if the token is not on your list (the switch then happens only for a call the wallet cannot read, which briefly shows the wallet's label).
- **Recommendation**: A if the measured switch is under one frame or two; else B.
- **What ships now**: A.
- **Answered**: by the orchestrator, 2026-10-17 (D-orch: "ship-now form; the owner sees it on a decision page with the arc's screenshots"). The arc builds the form above.

## OA-4. Rows still in flight

- **Surface**: Home's in-flight row and the page of a call that failed or ended early (the journal), for a dApp's call.
- **Today and after this arc**: they name the call with the wallet's label from its name alone ("Transfer (private)" for any contract's `transfer_in_private`, "Claim Fee Juice" for any `claim`), because the journal keeps no contract. Once it settles the row reads as plan § UI impact says, so a call can change words when it lands.
- **Options**: A, leave them; B, record what the settled reading needs on the journal entry (the primary call's contract, class and number of arguments) so in-flight rows read as settled ones (new stored fields).
- **Recommendation**: B after OA-1 is decided, since (a) decides what a read transfer says.
- **What ships now**: A.
- **Answered**: by the orchestrator, 2026-10-17 (D-orch: "ship-now form; the owner sees it on a decision page with the arc's screenshots"). The arc builds the form above.
