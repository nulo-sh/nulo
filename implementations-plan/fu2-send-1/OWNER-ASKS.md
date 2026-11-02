# fu2-send-1 owner asks

Arc 1 (P93-01, P93-55, P93-26) depends on none of these and ships now. Each ask below names the arc that waits for it.

## OA-1. Holdings: how many decimals the split lines show (P93-57, arc 2)

Surface: the private and public lines under a token's total. One row component draws them on Holdings, Home's token list and Send's token picker; the pick names Holdings, so the change reaches the other two as well: please confirm. The signed pick: "The split lines use the total's decimals." Today the total is cut at 10 characters and each side at 6, so "999.999" sits over "999.99".

Both readings below show "999.999" on both lines for the lab's case. They differ when the two sides hold different amounts. Example: 0.0005 private and 999.9985 public, total 999.999.

- **A. Each side formatted as the total is** (the same 10-character cut the token page already uses for its sides). Shows `999.999` over `🛡 0.0005  🌐 999.9985`. No side is cut to fewer decimals than the total shows; a side can show more.
- **B. Each side cut to at most the total's count of decimals** (no zeros added). Shows `999.999` over `🛡 <0.001  🌐 999.998`. No side shows more decimals than the total; a side is cut where A would show its digits.

Under both, each line is cut, never rounded up, so the shown sides need not add up to the shown total exactly (123.456789 and 987.654321 under 1,111.1111 under A).

Recommendation: A. It hides fewer digits, matches the token page, and B's deeper cut is what made the lab's line read less than the total.

What ships now: nothing on Holdings; arc 2 builds the answer.

## OA-2. The Sending toast when something else happens (P93-08, arc 3)

Surface: the toast at the foot of any screen while a send from Send runs. The signed pick: "A toast stays until the send is done: “Sending 10 TST to 0x0c2b…4b5c”." The wallet shows one toast at a time, so three cases need a rule:

1. Another message replaces it (a "Copied" confirmation, a received transfer, a failed fee check, "Transaction submitted" for an earlier send). **A**: "Sending …" comes back once that message closes, if the send still runs. **B**: it stays gone until the next send.
2. The person closes it with its ×. **A**: it stays closed for that send while the wallet stays unlocked on that profile; after a lock and unlock, a send still running shows again, as when the popup opens mid-send. **B**: it comes back on the next screen they open.
3. Two sends run at once (the second queued behind the first). **A**: the toast names the newest send; when the newest ends while the older still runs, it switches to the older. **B**: it names the newest only, and goes when that one ends.

Recommendation: 1A, 2A, 3A: the toast follows "stays until the send is done" without reopening after the person dismissed it.

What ships now: nothing; arc 3 waits for this and OA-3.

## OA-3. Which sends History marks Pending, and a send whose amount cannot be read (P93-08, P93-09, arc 3)

Surface: History's new pending rows, and the Sending toast. The signed picks name "sends in progress" (History) and the toast's copy "Sending 10 TST to 0x0c2b…4b5c".

1. Home lists two kinds of work in progress under its Get started card: sends made on Send, and a dApp's operations approved in its window. **A**: History's pending rows list both, as Home does (the toast stays for Send's sends only, since a dApp operation has no amount and recipient to name). **B**: History lists only sends made on Send.
2. A send whose token was removed while it ran has no amount or symbol the wallet can show (Home's row shows none). **A**: the toast reads "Sending to 0x0c2b…4b5c". **B**: no toast for that send (it still shows on Home and in History).

Recommendation: 1A (History matches Home, so nothing is in one list and missing from the other), 2A.

What ships now: nothing; arc 3 waits for this and OA-2.
