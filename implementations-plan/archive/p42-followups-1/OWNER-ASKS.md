# p42-followups-1: owner asks

A1 depends on none. OA-1 is answered and shipped in A2; OA-2 is open as #820, A ships.

## OA-1 (P42-21): when a dApp call in flight first reads as it will settle

**Surface.** Home's in-flight row, the History and Home row of a call that failed or was cancelled, and its journal page, for a dApp's call on a token you added (`transfer_in_public`, say). Your pick: "Record the call's contract, class and argument count on the journal entry so the words never change."

**Why it is open.** The wallet first learns which class a call runs when it builds the call. The row exists earlier: from the moment the dApp's request arrives, while the approval window is open. Before the build there is no class to record, so the settled rule cannot read the call yet.

**Options.**
- **A (ships now): the class from the send's own build, right after you approve.** Until then the row reads the call as its contract spells it, "Transfer In Public". Once the build has recorded a class that matches a token you added, and the call's argument count, it reads "Transfer (public)", the same in flight, failed, cancelled and settled; a call the build gives no class (one sent with no account), or whose class the wallet could not save, keeps its own name, as its settled row does. So the words change at the build, only for a movement call on a token you added. A call the wallet refuses before its build is retitled as today, with the function its selector names, and gets no movement label.
- **B: the class from the approval window's fee estimate.** The window already builds the call to show its fee, so the change moves to the first seconds the window is open. It needs a new link between the window's estimate and the row, and a window that shows no estimate (an app that pays its own fee) still falls back to A.
- **C: look the class up when the request arrives,** so the words never change: a network read on every dApp request before its row shows, with its own failure path.

**Recommendation.** A: the one change is the wallet learning the call, not retracting a word; B and C add a link or a network read for a few seconds of a row you rarely see while the window is open.

**What ships now.** A, in A2 once you answer; A1 ships without it.

**Answered (decision page 52, P52-03):** A, "The class from the send's own build, right after you approve; the words change once, there." Shipped in A2.

## OA-2 (P42-21, after A2): a dApp call whose fee estimate fails, on a token you added

**Surface.** Home's in-flight row and the History and Home row of a dApp call that failed, and its journal page, when the call is a movement (`transfer_in_public`, say) on a token you added and the wallet's fee estimate for the send fails (the call reverts in simulation, for example on a balance too low).

**Why it is open.** OA-1's A reads the class from the send's build. In the wallet, the build that hands the calls back is the one that also simulates the send to price its fee; the class is saved when that step returns. When it fails, the class it resolved is never saved, so the row keeps the call's own name.

**Options.**
- **A (as shipped in A2): the row keeps the call's own name.** "Transfer In Public" while the send simulates and, if the simulation fails, on its failed row and journal page. Once the send's build-and-estimate step returns its calls and the wallet saves them, it reads "Transfer (public)" from then on, in flight, failed or cancelled, including when the approval preview then refuses it; a cancel that lands before that step returns keeps the earlier reading. Before A2 every such row read "Transfer (public)" on any contract.
- **B: save the class the moment the request is built, before the estimate.** A failed estimate's row then reads "Transfer (public)" on a token you added. It needs a hook through the four fee methods' nine build points, which the approval window's own estimates share and must not trigger.

**Recommendation.** A: such a row keeps one name from arrival to failure, the call as its contract spells it, which is true; B adds a hook through the fee code for the rows of sends that never left the wallet.

**What ships now.** A. Tracked as #820.

## Lead decisions stated with pictures (not asks)

- **D5, Holdings with fiat off while its list loads**: no count, as "no count until the list answers" says without a fiat condition; the line keeps its height, as the skeleton keeps it with fiat on.

Observations outside the picks, filed at close-out: Holdings' error state keeps "$0.00" and "0 tokens" beside "Couldn't load holdings" (#825, `owner-decision`); the Send review's re-ask submit clipping at a fee of 10 FJ or $10 (#734's OA-1 note) was already fixed by #814, which makes it read "Send" (#818).
