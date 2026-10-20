# Owner asks: refused-send-1

Three asks. The arc ships what each "What ships now" says and opens its PR as a draft; the orchestrator takes it out of draft once OA-1 is answered.

Not asked, because a signed record answers it: the row and page look (P76-03 C, the pictures `112-row-refused` and `112-page-refused`), the row's words "Refused by the network", and the page's first sentence.

## OA-1. #112: the refused page's second sentence

**Surface:** the transaction page of a send the network refused.

**How the wallet decides (the gap, in plain words).** Nulo's default Testnet connection goes through a relay (dRPC) that can pass one send to several network nodes. One node can take the send while another refuses it, and the refusal is what the wallet hears. So the wallet turns a row red only when two things hold:
- the node refused it because its spend is already recorded, or because it expired (OA-2);
- a check, which starts about 5 seconds later, finds the send neither waiting nor included on the node it reaches.

Each check reaches one node. While the wallet is open and unlocked it keeps checking for 30 minutes: every 5 seconds for 2 minutes, then every 15 seconds. If a check finds the send included, the row turns to "Sent".

The gap: a check can reach a node that is behind, which reports nothing. The row then reads red until a check reaches an up-to-date node. We expect that to be the next check, but we have not measured how often the relay's nodes are behind. A person who sends again inside the gap can pay twice. The Send screen's message at the failure stays "Send not confirmed. Checking whether it reached the network. Don't send it again yet.", because the red comes only after the first check.

**Options:**
- **A. "Check the details before sending it again."** (page 10). The page reads: "The network refused this transaction, so it won't go through. Check the details before sending it again."
- **B. Hold the person back during the first checks.** The page reads: "The network refused this transaction, so it won't go through. Wait two minutes before sending it again: if it went through after all, this row turns to Sent."
- **C. Turn red later.** Keep A's words, but turn the row red only under the wallet's usual rule for a lost send: one minute and three empty checks. The gap shrinks; every refusal reads "Not confirmed yet" for that minute first.

**Recommendation:** A. The gap usually needs a relay retry and a node behind at the same moment, and later checks correct it. Two rarer paths need no relay retry: the network undoes a recent block that held a conflicting send, or a node's clock runs ahead and calls the send expired. B is the safer wording if you want nobody to re-send in the first two minutes.

**What ships now:** A, as approved on page 10.

## OA-2. #112: which refusals end the row at once

**Surface:** Home's and History's row and the transaction page, for a send the network refused.

**What ships now:** only two refusals end the row at once: the spend is already recorded ("Existing nullifier") and the send expired. Every other refusal keeps today's "Not confirmed yet" check (30 minutes, then "Unconfirmed", then "Won't go through" about a day later). The most common of those is probably "not enough Fee Juice". The others are a fee below the network's current price, a node that is behind, and a node that could not check the proof.

**Why:** through the relay, a node that is behind can refuse a send another node accepts. For example, a person claims Fee Juice and sends at once; a lagging node still sees no Fee Juice and refuses, while an up-to-date node takes the send and includes it. Calling that row refused could make the person pay twice. For the two that ship, a copy another node holds cannot be included either, except when the network undoes a recent block or a node's clock runs ahead. So the expected wrong red is a send that was already included, and the checks look for exactly that.

**Option:** also end "not enough Fee Juice" (or every refusal) at once. It is faster to read, and wrong in the relay case above.

**Recommendation:** keep what ships now.

## OA-3. #112: a wrong red the 30 minutes do not correct

**Surface:** Home's and History's row and the transaction page, for a refused send.

**What can happen:** the checks stop 30 minutes after the refusal and run only while the wallet is open and unlocked. If the red was wrong (the send went through on another node) and no check reached an up-to-date node in those 30 minutes, the row keeps reading "Refused by the network" for good. Typical case: the person closes the wallet seconds after the refusal and comes back later. It needs a wrong red first (OA-1's gap); how often that happens is not measured.

**Options:**
- **A. As built.** The checks end at 30 minutes, as the wallet already does for a send it marked dropped.
- **B. Check again at the send's expiry.** The wallet reuses its existing expiry check: about a day after the send it reads the final chain. If the send is not there, the row turns to "Won't go through" ("This transaction expired before the network included it. No fee was paid, and you can send it again."). If it is there and the node the wallet reaches confirms it, the row turns to "Sent". So a refused row changes its words once more, a day later. It is one more chance to correct a wrong red, not a guarantee: if the node reached is behind, the wallet asks again only the next time it starts.

**Recommendation:** B. It corrects most wrong reds that A would keep, and its "Won't go through" wording tells the person it is now safe to send again. It reuses a check the wallet already runs for unconfirmed sends.

**What ships now:** A.
