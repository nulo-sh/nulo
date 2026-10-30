# dapp-1: owner asks

Neither ask concerns a surface arc 1 changes; the arc ships without waiting.

## OA-1: the fee question of an app you just disconnected

**Surface.** The fee question window ("the fee went up, accept?") that a dApp send the person already confirmed opens when its fee rose past the approved cap.

**Today, and after arc 1.** A disconnect in Settings closes the app's send, sign and capabilities windows (arc 1), but not this one: its send is already approved. Accept there still sends at the new fee, for an app the person just disconnected; the app never learns the result, since its connection is gone.

**Options.**

- **A:** close it too. The held send is then cancelled, nothing is sent, and its History row reads "Cancelled", as a declined fee does today (`execution/fee-reask.ts:84-108`).
- **B (what ships now):** leave it open. Approving a send stays final; only the person's answer to the fee question decides it.

**Recommendation.** A. The question is a new consent, and the app it serves is gone. The two reviewers split on it; the plan ships B so the arc does not change what an approved send does without your word.

## #1382: a repeated request reads like the one just approved (recorded on the issue)

**Surface.** The execute window (Send or Sign) for a request that repeats one the person approved seconds earlier from the same app.

**Why it is not in the arc.** The lane brief allowed a line saying "this is a new request", with the previous one's time, only as a one-line information add. It is not one: the wallet keeps no fingerprint of a request and no per-app history of approvals, so the line needs a new mechanism (a request fingerprint, a short in-memory record of recent approvals per app, and a read for the window). The question is on the issue.

**What ships now.** Nothing changes in the execute window. Each request still needs its own Confirm.
