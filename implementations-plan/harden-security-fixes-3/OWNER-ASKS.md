# Owner asks: harden-security-fixes-3

Seven asks. Each ask names the surface, what it does today, the options, the recommendation and what ships now. Arc 3 builds an option only on its pick; "what ships now" is the state without a pick. Pictures of both states come with arc 3's PR, before merge.

The owner answered OA-1 to OA-6 on decision page 65 (P65-01 to P65-06, 2026-10-19); each pick is quoted under its ask. OA-7 came out of OA-4's design pass and is open.

## OA-1: an app's `claim` call titled "Claim Fee Juice" on another contract (Phase 4)

- **Surface.** Home's recent-activity card while an app's transaction is in flight, and the transaction page of an app request whose record names no contract. The approval window already titles the call by its contract (since #805), and so does the settled History row.
- **Today.** An app call named `claim` or `claim_and_end_setup` reads "Claim Fee Juice" on those two surfaces, whatever contract it calls.
- **Option A (recommended).** "Claim Fee Juice" only on the Fee Juice contract; any other `claim` reads "Claim".

  | | Another contract | Fee Juice contract |
  |---|---|---|
  | Today | Claim Fee Juice | Claim Fee Juice |
  | A | Claim | Claim Fee Juice, where the surface knows the contract; "Claim" on the in-flight card, which names none |

- **Option B.** Keep today's titles.
- **What ships now.** B.
- **Tests with A.** `callTitle("claim", undefined, false)` is "Claim"; with the Fee Juice address it is "Claim Fee Juice" (control).
- **Pick (P65-01): B.** "Keep today's titles." Not built.

## OA-2: refused app requests in Activity (Phase 5)

- **Surface.** Activity, per profile and account (every network together), and its storage.
- **Today.** Every app request the wallet refuses before sending it (outside the app's permissions, malformed, or blocked by the Terms) stays in Activity for good. Only completed transactions are capped, at 50 per account.
- **Option A (recommended).** Refused requests get their own cap of 50 per account: past it, the oldest refused request leaves Activity. Completed transactions keep their own cap, so refused requests never push them out. A failed send that reached the network stays, as today.
- **Option B.** Keep every refused request.
- **What ships now.** B.
- **Tests with A.** 60 refused rows keep the newest 50; 60 refused rows next to 10 completed ones keep all 10 completed (control); a failed row with a transaction hash is never removed (control).
- **Pick (P65-02): A.** "Refused requests get their own cap of 50 per account; the oldest leaves past it." Built in arc 3.

## OA-3: the "Labels from the contract" notice (Phase 6, after #854)

- **Surface.** The approval window's call cards.
- **Today.** The notice ("Labels from the contract. These names come from the contract, not from Nulo. Check the addresses and amount before approving.") sits above a call on a token the wallet lists when the call uses a transfer or mint name or selector but its arguments do not fit one. Every other call to a contract whose code Nulo does not ship shows the argument names that contract's published description gives, with no notice.
- **Option A.** The same notice above every call whose argument names come from a contract Nulo does not ship. Most app calls target such contracts, so it would show on most cards.
- **Option B (recommended).** Keep today's rule: the notice stays on listed-token calls that use a transfer or mint name or selector, where it reads as a warning; on most cards it would stop being read.
- **What ships now.** B.
- **Tests with A.** A decoded call on an unshipped class shows the notice; the same call on a shipped class does not (control).
- **Pick (P65-03): B.** "Keep today's rule: only on listed-token calls that look like a transfer or mint." Not built.

## OA-4: a lock the wallet could not finish (Phase 7)

- **Surface.** Every lock control (the header's lock button, Settings → Lock, the network takeover's lock) and the lock screen after it.
- **Today.** The popup shows the lock screen at once and does not wait for the wallet to confirm that the lock was saved. If the wallet reports that it could not save it, nothing tells the person.
- **Option A (recommended).** The lock screen stays, and when the wallet reports the lock was not saved, an error message appears: "Couldn't finish locking. Try again." with a **Try again** action that sends the lock again. The wallet never shows itself unlocked because of this.
- **Option B.** Keep today's behaviour.
- **What ships now.** B.
- **Tests with A.** A lock the wallet reports as not saved shows the message, and Try again sends the lock request again; a lock that succeeds shows nothing (control).
- **Pick (P65-04): A**, with the note: "Feels like the user wouldn't understand what are the second effects of this? Shouldn't we try to lock it ourselves again? Should the profile look locked then? Should the user unlock + lock? What's the path for solving this? This is not graceful failing." A design pass replaced the message (HS3-D10): the wallet now tries the save again itself (arc 3), the profile already looks locked, and what remains when both attempts fail is OA-7. Try again is not built: it would repeat the save that just failed twice.

## OA-5: incoming transfers of a token the person blocked (Phase 8, after test-infra-1 arc 4)

- **Surface.** A token whose first receive the person answered with **Block** ("Hiding receives from X"): its Holdings balance and the wallet's storage.
- **Today.** The wallet keeps looking for that token's incoming transfers, private and public, and stores each one, hidden, for good. Deleting the token stops both and removes them.
- **Option A (recommended).** After Block, the wallet stops looking for that token's incoming transfers, private and public (a scan already running when Block lands stores nothing more), and deletes the hidden ones it stored. Its Holdings balance then changes only when something else re-reads it, such as a send of that token, so it can show less than the chain holds. Removing and re-adding the token resumes the scan and re-reads the transfers still available to it, as today.
- **Option B.** Keep today's behaviour.
- **What ships now.** B.
- **Tests with A.** A blocked token's private and public scans read nothing and store no record; an allowed token's scans do (control); a scan in flight when Block lands stores nothing; Block deletes the token's hidden records and keeps its trust state.
- **Pick (P65-05): A.** "Block stops the search for that token's transfers and deletes the hidden ones." Built in arc 3 (HS3-D11).

## OA-6: when an app transaction's authorizations appear on the Authorizations page (Phase 2)

- **Surface.** Settings → Authorizations, for the public authorizations an app transaction grants.
- **Today.** A transaction's authorizations are listed once the wallet has sent it and recorded it in History.
- **Option A (recommended).** They are listed just before the wallet sends the transaction. If the network refuses it, they leave the list at once. If the wallet stops in the moment between listing and sending, they stay listed as Pending, and Revoke answers that the grant is not in a block yet, as it already does for a sent transaction the network later drops. In exchange, an authorization of a transaction the wallet saw the network accept is listed whatever happens to the wallet after that.
- **Option B.** Keep today's order.
- **What ships now.** B.
- **Tests with A.** Phase 2's list in plan.md.
- **Pick (P65-06): B.** "Keep today's order: list them after History records the send." Note: "Seems very fickiny to do it before, and also... the chances of a user looking for that authorization are really really low. Also: it's not confirmed, so it wouldn't be real. I think confirm => then adding it's the correct order." Not built.

## OA-7: a lock the wallet could not save after two attempts (Phase 7, from OA-4's design pass)

- **Surface.** What follows any lock control when the wallet cannot save the lock: the popup, an open Nulo tab, and apps connected to the wallet.
- **Today, with arc 3.** The lock screen shows at once and the wallet is locked in memory, as before. A saved lock survives a restart of the wallet; the wallet now makes two attempts to save it, one right after the other. If both fail, nothing tells the person.
- **Option A (recommended).** After the second failed attempt, the wallet restarts itself to clear the saved session, as a browser restart does. Nothing to read, nothing to do. Expected, and proven by A's own tests before it ships: the popup closes, an open Nulo tab reloads onto the lock screen, and connected apps reconnect as they do after an update. Chrome documents that an extension reload clears the session store; Firefox documents it for a browser restart and for disabling the extension, not for a reload, so A's e2e settles Firefox first.
- **Option B.** The lock screen shows one line: "Restart your browser to finish locking." No button.
- **Option C.** Keep today's behaviour.
- **What ships now.** C.
- **Pictures** (Chrome, light and dark; `screenshots/`). Today and A: `oa7-lock-today-light-chrome.png`, `oa7-lock-today-dark-chrome.png` (with A this is the screen the next popup opens on). B: `oa7-lock-b-light-chrome.png`, `oa7-lock-b-dark-chrome.png`, a mockup of the line over today's screen.
- **Tests with A.** The restart runs only when both attempts fail on a lock the person asked for, and never after a lock that saved (control). Before A is built, an e2e on Chrome and Firefox proves an extension restart empties the session store the lock lives in; then the same e2e proves the popup reopens on the lock screen, an open Nulo tab shows it, and a connected app reconnects. Building A is a recovery policy, so it is its own approved plan change.
- **Tests with B.** A lock whose save fails shows the line; a lock that saves shows nothing (control).
