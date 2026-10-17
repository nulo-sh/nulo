# Owner asks: execution-integrity-1

Two asks. Neither blocks the arc: each has a "what ships now" line, and the arc builds that. An answer that lands before the PR opens ships with it; a later one is its own change.

## OA-1. #669: the lock prompt and the profile picker while a send goes out

**Surface:** the lock confirmation ("N transactions are still running. Locking cancels them.") and the account and profile pickers.

**Today:** the lock prompt counts approved sends that have not gone out yet (pending, simulating, proving), from any origin. A send already going out (`submitting`) is not counted, and locking does not stop it. The pickers block while a popup send of the viewed account is in flight, `submitting` included; an app's send never blocks them. After this arc, a profile switch or a lock during a send no longer loses its record or reports it as failed.

| Option | What a person sees |
|---|---|
| **A. As is** | No change. A lock or switch during the few seconds a send goes out is allowed, and the send is recorded under its profile. |
| **B. Count it in the lock prompt** | The prompt also counts sends going out, with words that do not say locking cancels them (new copy, for example "1 transaction is being sent. It will finish after you lock."). |
| **C. B, and block the pickers** | B, and the pickers also block while any send of the profile is going out, an app's included. |

**Recommendation: A.** With the arc's fix nothing is lost when a lock or switch lands mid-send, and the window is seconds. B adds copy for a state that is now harmless.

**What ships now: A.**

## OA-2. #664: a pending marker in the authorizations list

**Surface:** Settings → Developer → Account state → Authwits, each row, and the Revoke popup.

**Today:** a row looks the same whether its grant is still pending (not yet proven) or confirmed. After this arc, a revoke of a grant that is not in a block yet waits for it, and the list drops the rows the revoke proved gone.

| Option | What a person sees |
|---|---|
| **A. As is** | No marker. A revoke right after a grant takes a few seconds longer. |
| **B. A "Pending" chip** | The row shows a "Pending" chip until its grant is proven; Revoke stays enabled (the revoke waits for the grant). |
| **C. B, and Revoke disabled on pending rows** | As B, and the row's Revoke is disabled until the chip clears, which can take minutes on Testnet. |

**Recommendation: B.** It tells the person why a revoke may wait, without taking the revoke away.

**What ships now: A.**

**Words the arc ships on Developer surfaces only** (the failure tooltip of the Revoke popup, and the journal page in developer or debug mode). Amend any of them in your answer:
- "Authwit #N's grant is not in a block yet. Revoke it again later."
- "Authwit #N is still authorized after the revoke"
- "The token changed after this send was approved" (a refused transfer; a person without developer or debug mode sees today's "Send failed. Nothing was sent. You can try again.")
