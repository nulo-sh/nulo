# followups-p15 — owner asks

The arc ships without an answer to any ask: each says what ships now. An answer that lands before the PR opens ships with it.

## OA-1. The words for a repeated sponsor address (#316)

- **Surface.** Settings → FPCs → New FPC, the address field.
- **What ships now.** A stored address shows the form's existing "Already exist" beside the address field, and Submit stays disabled.
- **Proposed line.** "Already added".
- **Second question, the edit form.** Edit FPC can still change a sponsor's address to one already stored, which gives the two rows #316 describes. The signed option names the add form only. Ships now: unchanged. Option: the same rule and words on the edit form.
- **Recommendation.** "Already added" on both forms.

## OA-2. The line for a pasted address that is not a token on this network (#339)

- **Surface.** New token popup, the line under Submit, reached in one tap from the Holdings search row.
- **What ships now.** The wallet tells this refusal apart: the node and the wallet hold no contract at the address. The line still reads the approved generic "Something went wrong. Try again."
- **Proposed line.** "There is no token at this address on this network."
- **Recommendation.** The proposed line. It is true for the case it covers: the node answered and has no contract there. A node that cannot be reached still gets the generic line. The line repeats the node's answer, so a lying node gets it too, as it gets every other answer today.

## OA-3. The detail line of a send the waiting-sends cap refused (#340)

- **Surface.** The History card and the journal detail page of an app send that the cap refused after its approval window.
- **Today, and what ships now.** The card reads "Transaction failed"; the detail reads "Stopped before broadcast" / "Your wallet caught this before reaching the network. Often balance, fees, or invalid call." The wallet now files the refusal as its own kind, so one edit moves the row once the words are answered.
- **What the answer ships.** The card and the detail read "Refused before sending", the shared refused row's label, with the answered detail line. The shared line's "before anything was signed" can be false here: the approval window's fee estimate can sign.
- **Proposed line.** "Too many sends were already waiting. Nothing was sent.", the words decision page 15 quotes. A shorter option: "The wallet refused this request. Nothing was sent.", the shared line without its signing claim.
- **Recommendation.** The proposed line: it says why, and it claims only what holds.

## OA-4. The settled send's detail page for a token of unknown decimals (#103)

- **Surface.** The transaction page a settled card opens (`tx/[id]`), its amount block.
- **What ships now.** Unchanged: it shows the figure its record stored, while the settled card now shows none (P15-10).
- **Option.** The same rule as the card: no figure while the wallet's token for that contract has unknown decimals.
- **Recommendation.** The same rule, so the card and its page agree.

## OA-5. An Unconfirmed send whose post-expiry check finds it reverted (#108)

- **Surface.** The History card and the journal detail of a send that read "Unconfirmed".
- **What ships now.** A send found on chain and successful moves to "Sent" (P15-09). A send found on chain but reverted keeps "Unconfirmed", as today.
- **Option.** It moves to "Reverted", the word a reverted send has when the first check finds it.
- **Recommendation.** "Reverted": the record proves it, and it is the word the first check uses.

## I-1. A sixth dead row in the logs filter (#294) — information, no answer needed

- **Surface.** Settings → Developer → Logs, the source filter.
- **What ships.** The five rows the page named, and also "Token List Client". The token-list service, added after the issue, has no popup client. The signed converse check ("every row is a source something logs under") refuses the row, so it goes with the five.
- **Alternative.** Keep the row and exempt it from the check. That contradicts the signed sentence "so a dead row cannot come back".

## OA-6. A log source with no filter row (found beside #294)

- **Surface.** Settings → Developer → Logs, the source filter.
- **Today, and what ships now.** Delete Profile's own client logs under `profile-delete-client`, which has no row, so the filter hides its warning and error lines. Unchanged.
- **Option.** Add the row "Profile Delete Client", after the "Profile Client" row.
- **Recommendation.** Add it. Without an answer, the close-out files it as an `owner-decision` issue.

## I-2. The cap refusal's stored kind (#340) — information

- **What ships.** The signed text says "filed under the shared refused kind". The row shows the shared refused label, but the wallet stores a new kind, `too_many_pending`. The shared kind, `wallet_refused`, picks its words by kind alone, so it could not carry its own line without a new stored field.
- **Alternative.** `wallet_refused` with a new stored reason field. That changes the stored record, which is your call.

