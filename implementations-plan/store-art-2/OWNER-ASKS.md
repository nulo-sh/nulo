# Owner asks: store-art-2

The new set of store pictures is the lane's purpose and its one visible change: the lane brief records it as "the store listing's pictures; owner sign-off on the page or the PR". The orchestrator puts the old and new pairs on a decision page, and the PR stays a draft until the owner signs them. One frame raised an ask.

## OA-1. Screenshot 3 ("Apps have to ask."): the cut row under the footer

**Surface:** store screenshot 3 and its capture `approve.png`, the playground's permission window as it first opens.

**What happens:** the window's last visible row is now "Let this app list all your accounts" with a description line ("It always knows the account you connect with"). The window's fixed Reject and Connect footer cuts that line in half. In the signed set the row was "See Account 1's address", one line, whole.

**Options:**
- **A.** Ship the frame as produced: the window exactly as it first opens, the cut line included.
- **B.** The capture spec scrolls the window's list by the least amount that shows that row whole, as it already does for Home and Send. Cost: only the list scrolls (`cap-scroll-area`, `apps/extension/src/popup/windows/capabilities/index.vue:376`); the account-and-network strip above it stays. Estimated from the capture, the fit is about 20 to 25 px, which moves the app's identity block up against that strip and cuts the top of "localhost" instead. One spec change and one new capture run.

**Recommendation:** A. B trades a cut description at the bottom for a cut host name at the top, and the host name is what the caption ("Apps have to ask.") is about. The cut line also shows that the list goes on.

**What ships now:** A. The draft PR carries the frame as produced.

## Also on the pairs (no ask)

Home's Holdings label and its menu now pass under the fixed hero: the spec scrolls the middle 58 px (15 px before) to show the cut activity row whole, which is its stated fit. The USD Coin row stays whole below the hero.
