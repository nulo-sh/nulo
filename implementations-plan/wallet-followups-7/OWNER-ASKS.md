# Owner asks: wallet-followups-7

## OA-1: the New token popup's duplicate message for a different-case address

- **Surface**: Holdings → Add token (`NewTokenPopup.vue`), the inline field check under the contract address.
- **Today**: the check compares the typed text with each listed token exactly. A listed token typed in lower case shows "Already exist" and the button stays off; the same address with any upper-case digit passes the check.
- **What ships now (arc-1, no ask needed)**: the check is unchanged. A different-case duplicate passes it, the wallet finds the existing token (one spelling in storage), writes no second row, and the popup closes with its existing "Token added" toast, as any re-add of a known token does today.
- **Options**:
  1. Keep it as shipped: the person sees "Token added" and still has one row.
  2. Compare by address, not by spelling: a different-case duplicate shows the existing "Already exist" message and the button stays off, exactly as the lower-case spelling does now. No new copy; one comparison changes.
- **Recommendation**: option 2. It is the message the person already gets for the same token, and it stops a submit that can only return the row they have.

## OA-2: a token address typed in upper case is shown and copied in lower case

- **Surface**: the token's page (Copy token address, `tokens/[id].vue`) and the in-flight import row's short-address title, for a token whose address the person typed with upper-case digits.
- **Today**: the wallet keeps the typed spelling, so it shows and copies what was typed.
- **What ships now (arc-1)**: the wallet stores one spelling per address, the lower-case one every dApp call and every other screen already uses, so the token shows and copies in lower case. Hex addresses are case-insensitive; the value is the same.
- **Options**:
  1. Accept: one spelling everywhere.
  2. Keep the typed spelling for display: needs a second stored field for the same address, which the lane's one-spelling rule forbids; a separate decision.
- **Recommendation**: option 1.

## OA-3: a dApp that keeps calling while the person reads an approval

- **Surface**: none in the wallet; a connected app's own screen.
- **Today**: a confirmed session's calls queue without limit behind a call that waits on the person (a send's approval window holds the session's queue until the person answers).
- **What ships now (arc-1)**: at most 32 of a session's calls wait or run at once; the 33rd is answered with the standard "too many pending" error (-32005), which the wallet already sends to an app whose emoji check is unanswered. The deepest pipeline in this repository's own tests is 5 calls.
- **Who would notice**: an app that polls the wallet every few seconds while the person spends minutes on one approval (32 polls at one per 5 s is about 2.5 minutes). Its polls past the 32nd fail until the approval is answered; whether the person sees anything depends on that app.
- **Options**:
  1. Keep 32 on every session.
  2. A larger number for confirmed sessions: fewer refused polls, a weaker memory bound (each waiting call can carry up to 16 MiB).
  3. A byte budget instead of a count (a plan change): polls of a few bytes would never be refused; needs the message size carried from the decrypt to the dispatch.
- **Recommendation**: option 1 now; revisit with option 3 on a report from a real app.
