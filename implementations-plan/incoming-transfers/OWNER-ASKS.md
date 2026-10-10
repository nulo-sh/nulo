# incoming-transfers — owner asks

Six asks. None blocks Arc 1, which changes nothing a person sees. Each ask says what ships if it is
not answered. Page 4 (P4-01 to P4-05) and charter C12 are already on the owner's pages and are not
repeated here; these asks cover only what those records do not say.

## OA-1. #140: a received private transfer that a chain reorganisation dropped

**Surface.** Activity (Home's recent activity and History) and the received page, for a private
(note) receipt.

**Situation.** The chain can drop recent blocks it has not yet proven. The wallet's private-state
engine then forgets the notes those blocks carried, but the wallet keeps their "Received" rows, so the
feed can show money the wallet no longer holds. Public receipts already leave the feed in this case.
If the same transaction lands again in a later block, the note comes back with the same identity.

**Options.**

- **A. Remove the row** (recommended). The row leaves the feed once the wallet's private-state engine
  has synced past the row's block and no longer holds the note, including when the block was dropped
  while the wallet was closed. On a chain that stops producing blocks that can take until the next
  block. An open received page for it shows the page's existing "not
  found" state, as a removed public receipt already does. If the transaction lands again in a later
  block and the wallet sees the note before it is spent, the row comes back in the feed with its new
  block (reopen the page to see it); a note spent before the wallet sees it again does not bring the
  row back, because the wallet records only notes it sees unspent (today's rule for every private
  receipt). A row whose note moved to a new block while it stayed in the feed shows the new block in
  place (P4-05). Same rule as public receipts today otherwise.
- **B. Keep the row as today.** The row stays, even though the wallet no longer holds the note. #140
  closes as not planned.
- **C. Keep the row and mark it** (for example "Reversed"). Needs new copy and its own design pass;
  nothing is built in this lane.

**Recommendation.** A: it matches public receipts and shows only what the wallet holds. It never
touches a row the wallet has already seen on a final block, nor one whose note the wallet spent, and it
makes no extra network request.

**What ships now.** Nothing of #140. Rows behave as today and the issue stays open.

## OA-2. #142: explorer links on the From and To address cards

**Surface.** The From and To cards on the sent transaction page (`tx`) and the received page. Today a
tap on a card copies the address.

**Situation.** P4-02 approves "the same link the Tx hash row has" on block, contract and account rows.
The addresses sit in two cards, not in rows, and the whole card is the copy target, so the approved
words do not say where the link goes.

**Options.**

- **A. A small external-link icon in each card's corner** (recommended). A tap on the card still
  copies; a tap on the icon opens the explorer. With explorer None, or on a network with no explorer,
  the icon does not show.
- **B. A "View on <explorer>" line under the two cards**, one per address.
- **C. No link on the cards.** Accounts link only where an address is a row value (the journal page's
  "To").

**Recommendation.** A: the copy gesture people already use stays as it is, and the link costs no
extra row.

**What ships now.** C: cards unchanged; the journal "To" value becomes a link.

## OA-3. #142: a contract link with no contract row

**Surface.** The sent transaction page and the received page.

**Situation.** P4-02 approves links on "contract rows", but no detail page shows the token contract
(the sent page shows it only inside a "token is missing" warning). Adding a link means adding a row.

**Options.**

- **A. Add a "Token contract" row** to the Details box of both pages: the trimmed address, a link when
  an explorer URL exists, copy otherwise.
- **B. No contract link on detail pages** (recommended). The contract link ships only on the
  first-receive trust prompt (P4-01).

**Recommendation.** B: the trust prompt is where a person decides about a contract; a new row on two
pages is a layout change nobody asked for.

**What ships now.** B.

## OA-4. #141: the "Show fee" row after a failure, and on reopening

**Surface.** The received page's "Network fee" row for a public receipt, under P4-03 ("reads 'Show
fee' and fetches only when tapped").

**Situation.** P4-03 does not say what the row shows after a failed lookup, or when the person opens
the same receipt again in the same session after the fee was already fetched (that second showing
needs no request).

**Options.**

- **4a, after a failure.** **A.** Show "Show fee" again so the person can retry (recommended).
  **B.** Show a dash, as today's automatic fetch does on failure.
- **4b, on reopening.** **A.** Show the fee already fetched this session at once; no request is made
  (recommended). **B.** Show "Show fee" on every open.
**Recommendation.** 4a A, 4b A.

**What ships now.** 4a B (dash), 4b B ("Show fee" every open).

Not asked: after a re-mine (P4-05) the fee row returns to "Show fee", because the old fee belonged to
the old block and P4-03 with C12-fetch A forbids fetching again without a tap.

## OA-5. #138: newest public receipts first when a token's history is first scanned

**Surface.** Activity, in the minutes after a token is added (or an account is added) on a token with
a long public history.

**Situation.** Today the wallet reads a token's public history from its first block forward, so on a
busy token the oldest receipts appear first and a receipt that arrived a minute ago appears last,
possibly many minutes later. The fix reads the newest blocks first and then walks back through older
history in steps. The feed is sorted by block either way, so each row lands in its usual place; what
changes is which rows appear first.

**Options.**

- **A. Newest first** (recommended): the most recent receipts usually appear on the first scan (a
  very busy stretch of blocks can take a few more); older rows fill in below, newest to oldest, over the
  next minutes.
- **B. As today**: history appears oldest first; recent receipts wait until it catches up. #138 closes
  as not planned.

**Recommendation.** A: the receipt a person is waiting for is the newest one.

**What ships now.** B (today's order); Phase 2.3 waits on this answer.

## OA-6. #142: what a linked detail row looks like

**Surface.** The Block row on the sent transaction page and the received page, and the "To" row on the
journal page.

**Situation.** P4-02 approves "the same "View on <explorer>" link the Tx hash row has". On the sent
page the Tx hash row in Details shows the shortened hash itself as the link (copy when no explorer is
set); the words "View on <explorer>" appear only in the line under the amount at the top of the page.
So the record can be read two ways.

**Options.**

- **A. The value is the link** (recommended), exactly as the Tx hash row in Details: the shortened
  block hash or address opens the explorer; with explorer None the row stays as it is today.
- **B. A "View on <explorer>" text** at the right of the row, beside or instead of the value.

**Recommendation.** A: it is what the Tx hash row does today, so all Details rows behave the same.

**What ships now.** Nothing on these rows: they stay as they are until this is answered, and #142
stays open.

## Answers

None yet.
