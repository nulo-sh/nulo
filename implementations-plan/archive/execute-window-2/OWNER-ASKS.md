# execute-window-2: owner asks

## OA-1. The words of the refused-request form (execute window), P42-15 C

**Surface**: the execute window of a dApp send that Nulo refuses while it estimates the fee or previews the authorizations. Two checks refuse there: a transaction that asks the account to change its public authorizations from inside another contract, and a call whose selector runs another function than the name it gives. The pick's mockup drew the first; its words were a draft for sign-off.

**What ships now** (the arc builds this and does not wait):
- In the fee card's place, an orange warning line `Nulo won't send this`, then one grey sentence.
- Authorization registry: `This transaction asks your account to change its public authorizations from inside another contract. Apps are never allowed to, so it can't be sent. Reject tells the app.` (the mockup's words).
- Call name: `A call in this transaction does not run the function it names. Nulo never sends such a call, so it can't be sent. Reject tells the app.` (new; the mockup drew only the registry case).
- No toast. One full-width Reject. History after Reject or closing the window: `Not allowed` with the existing line (`Apps cannot change your public authorizations. Nothing was sent.` or `The app asked for more than you allowed. Nothing was sent.`); in developer mode, the refusal's message and no raw block, as for every refusal before a send starts.
- The dApp reads the scope refusal (code 4100), as the pick says. For the registry case this tells the dApp something about the account: the refusal comes from a simulation over its private notes, so a contract built for it learns one yes/no fact when the window ends (Reject, closing it, or the wallet locking while it is open). Today it learns that only if the person presses Confirm.

**Options**: A (ships now): the words and the answers above. B: your own words for either sentence, in the note. C: the dApp reads a plain rejection (code 4001) while History still reads `Not allowed`.

**Recommendation**: A. The first sentence is the mockup's; the second follows its shape; the fact the dApp learns concerns its own transaction. C if you would rather the dApp learn nothing when the window ends.

**Pictures**: the PR carries before and after shots, light and dark, of the call-name case (the one a test dApp can produce) and the registry words as a labelled mockup over the same window.

## OA-2. #777: an unreadable discovered authorization at rest (execute window)

**Surface**: the summary's Authorizations line of an `aztec_sendTx` whose calls all read but whose discovered authorization Nulo cannot read (its consumer's interface is unknown, or the decode failed). Today it reads `Lets <caller> call <selector> on <consumer>` with no warning; the orange `Can't read the arguments`, its reason and the closing advice appear only under Show all details.

**What ships now**: A, today's line. This lane changes nothing here: every at-rest flag changes how the summary reads.

**Options** (pictures: `screenshots/777-a`, `777-b`, `777-c`, each `-light` and `-dark`, added by the arc):
- A (today): the line alone.
- B: under the line, the orange `Can't read the arguments` and its one-line reason, as an unreadable call's row shows them.
- C: B, plus the closing advice `Check what the app says this does before approving.` under the last unreadable authorization when no call is unreadable (it then reads at rest, as it does for a call).

**Recommendation**: C. A person who approves at rest sees the same warning for an authorization as for a call, and the advice once.
