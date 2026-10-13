# Owner asks: dapp-dispatch-hold

P2-09 approved the hold itself: on a check that is shown, the wallet holds the app's calls until They match; They don't match ends the session as today; closing the window answers nothing, so the calls wait. It also brings "its screens and the app-side wait back for sign-off before merge". Arc 1 adds no words and changes no layout. What a person can notice is timing, listed below with the shots the implementer captures (plan.md § Phases, Phase 4).

Each ask has a recommendation and a **what ships now** line: what arc 1 builds while the ask is open. No ask blocks the build; arc 1's merge waits for the decision page's signature (DH-0).

## DH-0. Sign-off on the unchanged screens and the app-side wait (P2-09's "before merge")

**Surfaces:** the emoji check (new connection, inside the connect window after Allow, and the standalone reconnect window), the approval windows a waiting call opens, the playground while its calls wait, Home with a held send's queued row, and History, which lists it once it ends.

| | Today | With the hold |
|---|---|---|
| Emoji check | Same screen. The app's calls run while it is open | Same screen, same words. The app's calls wait for They match |
| Playground | `connected`, then each call's result settles at once | `connected`, then each call reads `pending` until They match |
| Home / History | A held send's queued row in Home's Recent activity, claimed within moments; History lists a send once it ends | The same queued row in Home's Recent activity, waiting until They match; History lists it once it ends, as today |
| Approval windows (connect capabilities, execute, sign) a waiting call opens | Open beside the check while it is still on screen | Open only after They match; never after They don't match |

**What ships now:** the hold with every screen as it is. Arc 1's PR opens when its gates pass; it merges after this page is signed.

## DH-1. Should the check say the app is waiting?

**Surface:** the emoji check, while the app has calls waiting.

| Option | What the person sees |
|---|---|
| **A. Nothing new** | Today's check. |
| **B. One line under the grid** | For example "The app is waiting for your answer." (copy to approve), shown whether or not a call is waiting. |

**Recommendation: A.** The check already asks for an answer; a line that shows even when no call waits would claim more than the wallet knows, and one that tracks waiting calls adds a live state to a security screen.

**What ships now:** A.

## DH-2. A lock while the check is open

**Surface:** the app's connection, when the wallet locks (by the person or by auto-lock) while a check has not been answered.

| Option | What happens |
|---|---|
| **A. End the unconfirmed session** | The check goes to the unlock screen, as today. The app gets the standard disconnect; its waiting calls fail on the app's side; a waiting send's row reads "Stopped when the wallet locked". After unlock the app can reconnect, and the check shows again. A session already confirmed keeps today's behaviour: it survives the lock. A trusted reconnect that is still connecting at that instant (a few storage reads) ends too; its app can reconnect. |
| **B. Keep it and show the check again after unlock** | The session survives the lock and the calls keep waiting. After unlock the wallet reopens the check. Needs a return route for the check page through the lock, which no window has today. |

**Recommendation: A.** After a lock the check can no longer be answered from its window (the lock sends it to the unlock screen and then to Home), so under B the calls wait for nothing until a new mechanism brings the check back. An approval window open at a lock already rejects its request, so under A no call waits on a screen the lock took away.

**What ships now:** A.

## DH-3. What a waiting send's row says when its session ends first

**Surface:** History and the journal detail of a send that was waiting for They match when the session ended.

| Cause | Row (existing copy, no new words) |
|---|---|
| They don't match, the app disconnects, the tab closes, Settings → Connected apps → Disconnect session, the app's row is deleted, a profile switch with no lock | "Refused before sending" / "The wallet refused this request before anything was signed. Nothing was sent." |
| A lock, or a profile switch through the popup (it locks first) | "Stopped when the wallet locked" / "The wallet locked while this was in progress." |
| The service worker restarts, or the send waits longer than about an hour and a half | "Stopped before broadcast" (today's reaper copy) |

Each line is true for these causes: a waiting send was never dispatched, so nothing was signed or sent. As for every queued row that fails before its approval today, the row's title reads "Transaction", not the call's name.

**Recommendation:** keep the existing copy. A dedicated line ("Stopped before you confirmed the check", for example) is new words for a rare path.

**What ships now:** the existing copy, as above.

## DH-4. Should the playground show the wait?

**Surface:** `apps/playground`, the generic test dApp.

**Recommendation: no change.** A pending call already reads `pending` in its result row. The playground stays generic and never special-cases the wallet (CLAUDE.md § The wallet repo), and a stock wallet-sdk app has no signal that the wallet is holding a call.

**What ships now:** no change.

## DH-5. The message an app gets past 32 waiting calls

**Surface:** the app (not a screen). While a check is unanswered, a session may keep 32 calls waiting; the 33rd is answered at once with `-32005` (`TOO_MANY_PENDING`), the code #201 ratified for "too many pending requests". That error's message is a stable public contract and reads "Too many pending transactions; retry after the in-flight ones settle." For a waiting read it says "transactions".

| Option | What the app receives |
|---|---|
| **A. Today's message** | `-32005`, `TOO_MANY_PENDING`, "Too many pending transactions; retry after the in-flight ones settle." |
| **B. A message for this cause** | The same code, with a message such as "Too many requests are waiting for the person to confirm the connection." (copy to approve). A new message is a contract addition (C11: a schema-patch release and a README `## Changes` line). |

**Recommendation: A.** The code and `walletErrorCode` are what apps branch on; an honest app does not reach 32 waiting calls.

**What ships now:** A.

## DH-6. A closed check cannot be reopened

**Surface:** the wallet, after the person closes an unanswered check. P2-09 decided the calls wait. Nothing on screen says an app is waiting, and no screen brings the check back.

The ways out, all existing controls: Settings → Connected apps → Disconnect session (the waiting send's row reads "Refused before sending"), closing the app's tab, or the app disconnecting. A lock is one too if DH-2 is answered A.

**Recommendation:** ship as decided; if the owner wants a way back to the check, it is an issue for a later plan (a new surface, new words).

**What ships now:** no new surface.

