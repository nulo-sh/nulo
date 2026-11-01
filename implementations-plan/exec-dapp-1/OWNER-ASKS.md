# exec-dapp-1: owner asks

## OA-1: the execute window for a send that carries another approved account's authorization

Filed for the owner as #1491 at close-out.

**Surface.** The dApp execute window (`SendTxSummary.vue`, the discovered-authorization line).

**Situation.** A dApp asks account A (approved for it) to authorize a private transfer of A's tokens, then sends that transfer from account B (also approved) with A's authorization attached. Today the send always fails at the fee estimate (#1427). Once arc 1 fixes that, the window reaches its approval, and the wallet's existing discovery adds one line, "Lets B move 1 from A to X", and signs a second, redundant authorization as B. The transaction uses A's; B's signature cannot authorize anything else. The call line above it already reads "1 from A to X" for a recognised token transfer; A's authorization itself renders nowhere. For a token outside the wallet's list, the arc's e2e capture (`screenshots/after-execute.png`) shows the generic forms: the call line reads "Transfer Private To Private on 0x1e25…6fa5", and the added line reads "Lets Second call Transfer Private To Private on 0x1e25…6fa5".

**Options.**
- **A. Keep the line** (what ships now). The window states the movement twice, once as the call and once as an authorization B signs; the redundant signature stays.
- **B. Drop requests made on behalf of another account.** No line and no redundant signature; the call line still shows the transfer from A (for a recognised token; an unrecognised call shows its function only). The same change reaches the NO_FROM path, where the line can show today.
- **C. Keep the line and drop only the redundant signature.** The window reads as in A.

**Recommendation.** B: the wallet signs only as the sender, so a request on behalf of another account is not the wallet's to sign or list, and the call line keeps the movement visible for recognised tokens. C if the owner wants the authorization named for unrecognised calls.

**What ships now.** Arc 1 leaves discovery unchanged (A). The PR body carries the window's before (the estimate error) and after captures. Arc 1 is the same under every answer; B or C is a later change.
