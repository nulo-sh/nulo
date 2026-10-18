# consent-display-1: owner asks

Arc 1 (discovery admits secure origins only) depends on none of these: none concerns discovery. Each ask names what ships now; an arc builds that and waits for nothing, except arc 2, which waited for OA-1's answer so it built the chosen option once. Answered: OA-1 = A (P42-08); OA-2 = A (P42-09); OA-3, OA-4 and OA-5 as planned (P42-10).

## OA-1: a dApp token add whose preview failed, and the message when the details changed (the execute window)

**Surface.** The execute window for a dApp's `registerToken`, and the error line of a failed token-import row (arc 2 builds both). When the wallet cannot read the token's name, symbol and decimals, the card shows "Couldn't resolve token metadata. Verify the contract address before approving." and Confirm stays enabled. After arc 2, an add whose card showed details stores exactly those details or nothing; under C, an add whose card showed this warning still stores whatever the commit reads.

| Option | What it looks like |
|---|---|
| A. Confirm is disabled while the details are unread | The warning stays; Confirm is greyed out; Reject is the only way out. The dApp can ask again. The wallet also refuses such an approval on its side. |
| B. Confirm stays; the commit refuses | The person presses Confirm; the window closes; no token appears; the dApp receives an error. |
| C. Keep | As today. |

**Recommendation: A.** The card then never approves details nobody saw, and the person learns it before pressing anything. B fails after the click, with no wallet message.

**What ships now: C.** Unchanged. **Answered: A** (P42-08), shipped in arc 2.

**The message, either way.** When a token's details change between the window and the commit, the add fails and its import row shows the error, as a failed read does today. Draft: "Token details changed after you approved them." It holds no token text. **What ships now:** the draft, shown in arc 2's PR for sign-off.

## OA-2: the words of the label mark (the execute window's call rows)

**Surface.** A registered token's call whose parameter names do not fit the standard transfer or mint roles. Today it shows the contract's own names with no mark. Arc 3 adds a mark above those rows, in the look of the existing "Can't read the arguments" notice (orange warning glyph, orange title, grey sentence).

| Option | What it looks like |
|---|---|
| A. The drafted words | **Labels from the contract** / These names come from the contract, not from Nulo. Check the addresses and amount before approving. |
| B. Raw fields instead of labels | The rows show the raw 32-byte fields behind "Can't read the arguments", as for a contract the wallet cannot decode. |
| C. Other words | The owner's text in the same place. |

**Recommendation: A.** The names stay readable, and the mark says where they come from. B hides values the person could read.

**What ships now: A,** in arc 3, with light and dark screenshots in its PR for sign-off.

## OA-3: the caveat in the Send review sheet

**Surface.** The Send review sheet (the rows behind the privacy strip). P38-07 B adds one caveat line under the strip on the Send page, for a token whose class is outside the validated set. The sheet repeats the strip's facts row by row and has no caveat.

| Option | What it looks like |
|---|---|
| A. Strip only | The caveat shows under the strip on Send; the sheet is unchanged. |
| B. Both | The same sentence also shows at the top of the sheet's rows. |

**Recommendation: A** until a person reports missing it in the sheet: the caveat sits beside the Confirm button already.

**What ships now: A.**

## OA-4: which token classes count as validated (Send's caveat)

**Surface.** The caveat line under Send's privacy strip (P38-07 B). It shows for a token whose class is outside the validated set.

| Option | What it looks like |
|---|---|
| A. The bundled set | The class the token list carries (the aztec-standards Token). Every listed token has no caveat; a token of any other class, the aztec Token included, has it. |
| B. Also the aztec Token | As A, but a token of the aztec Token class (compiled into the wallet for reading calls, used by no listed token, its sends not tested) has no caveat either. |

**Recommendation: A.** The wallet tests the sends of the bundled class only.

**What ships now: A.**

## OA-5: a restored token before its refresh succeeds (Send, Activity, the transaction page)

**Surface.** After a full-backup restore the wallet re-reads each restored token from the chain. Arc 3 stores a restored token with no contract class until that read succeeds, so the class always comes from the chain, never from the file.

| Option | What it looks like |
|---|---|
| A. No class until the chain says | Until the read succeeds: Send shows the caveat under the strip for that token, and its past mints show no amount on Activity's card and the transaction page, as a token added before classes were recorded does today. After it succeeds, both read as normal. |
| B. Keep the file's class | No change while the read is pending or failed; the caveat then follows the class the file claims. |

**Recommendation: A.** The caveat stays tied to what the chain says, and the read usually succeeds within seconds of the restore.

**What ships now: A,** in arc 3, named in its PR for sign-off.

**Also, found in arc 3's review (P42-10 signed A on the two effects above).** Until the read succeeds, a restored token's past app transfers and mints also read as plain calls on Activity and the transaction page: "Transfer Private To Private" or "Mint To Public" with the generic icon, in place of "Transfer (private)" or "Mint (public)" with the send or mint icon. The wallet's own sends keep their titles, since they record what they moved. And the read is tried once, inside the import's 45 s budget it shares with the account sync: when it fails or is late (a restore offline, a slow node), nothing reads it again, so the token stays without a class, its caveat and plain titles included, until it is deleted and added again. Shipped with A, shown in arc 3's PR for sign-off. Reading it again later (on the next unlock, say) would add a background step: a plan change, not in this arc.


## OA-6: the failed-preview warning's second sentence (the execute window)

**Surface.** The execute window for a dApp's `registerToken` whose details the wallet could not read. Under OA-1 = A (P42-08) the card keeps its warning, "Couldn't resolve token metadata" over "Verify the contract address before approving.", and Confirm is greyed. The second sentence now asks for a check that cannot lead to approving.

| Option | What it looks like |
|---|---|
| A. Keep | As signed: the warning unchanged, Confirm greyed, Reject the only exit. |
| B. Point at Reject | "Couldn't resolve token metadata" over "Reject this request and ask the app to add the token again." |

**Recommendation: B.** The sentence then names the one action the window allows.

**What ships now: A.** OA-1 A reads "The warning stays", so arc 2 leaves the copy as it is.

## OA-7: "About" in the app-set fee sentence (the execute window)

**Surface.** The execute window's app-set fee row. P38-03 A replaces "Fee up to X" with "About X". After the plan, P47-02 C rewrote the row as one sentence: "Fee could be up to {amount}; payment method set by {app}." Both picks hold, so arc 3 applies P38-03 A's word to P47-02's sentence.

| Option | What it looks like |
|---|---|
| A. "About" in the one sentence | "About ~0.016 FJ (<$0.001); payment method set by Swap." While the estimate runs: "About ▭; payment method set by Swap." The priority clause after it is unchanged. |
| B. Keep P47-02 C as merged | "Fee could be up to ~0.016 FJ (<$0.001); payment method set by Swap." |

**Recommendation: A.** The figure caps nothing: paid from the person's balance the fee may rise 10 % without asking, and paid by the app's fee contract by any amount, which "up to" denies. "About ~X" is how Send's queued readout already reads.

**What ships now: A,** in arc 3, with light and dark pictures in its PR for sign-off.
