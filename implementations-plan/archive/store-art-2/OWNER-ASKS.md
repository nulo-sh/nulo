# Owner asks: store-art-2

The new set of store pictures is the lane's purpose and its one visible change: the lane brief records it as "the store listing's pictures; owner sign-off on the page or the PR". The orchestrator puts the old and new pairs on a decision page, and the PR stays a draft until the owner signs them. Two frames raised an ask (plan D4 (b)): the spec meets its own stated frame, and the frame still reads less well than before. Both ship as produced until answered. Picking B or C on either means a spec change, a new capture run and new pairs before the signature.

## OA-1. Screenshot 3 ("Apps have to ask."): the cut row under the footer

**Surface:** store screenshot 3 and its capture `approve.png`, the playground's permission window. The spec redraws it at the popup's 360×600; the real window opens at 400×800 (`apps/extension/src/wallet/services/dapp-interaction/service.ts:596-597`).

**What happens:** the last visible grant under "Without asking, it can" now reads "Let this app list all your accounts" (#759, your P41-01), with a description line, "It always knows the account you connect with". The window's fixed Reject and Connect footer cuts that line in half. In the signed set the row was "See Account 1's address", one line, whole. Only the list scrolls (`cap-scroll-area`, `apps/extension/src/popup/windows/capabilities/index.vue:376`); the account-and-network strip above it and the footer stay. Measured on the capture: "localhost" sits 19 px below the top of the list.

**Options:**
- **A.** Ship the frame as produced: the window as it first opens at the popup's size, the cut line included.
- **B.** The spec scrolls the list until the whole last card shows, about 20 px. The top of "localhost" goes under the strip.
- **C.** The spec scrolls the list by the least amount that clears the description line from the footer, as Send's fit does (text bottom plus 4 px), about 11 px. "localhost" stays 8 px clear of the strip; the card's bottom edge stays under the footer, so the list still reads as going on.

**Recommendation:** C. The description reads whole, the host name stays whole, and it reuses the rule Send's frame already uses. One small spec change and one new capture run.

**What ships now:** A. The draft PR carries the frame as produced.

## OA-2. Screenshot 1 ("Nothing to see. Everything to own."): the top row under the hero's fade

**Surface:** store screenshot 1 and its capture `home.png`.

**What happens:** Home keeps its hero fixed and scrolls the middle under it. Holdings, the USD Coin row and two activity rows do not all fit between the hero and the nav, so something is always partly hidden. The spec scrolls the middle 58 px, the least that shows the activity row the nav cuts whole. That puts the Holdings label under the hero and the USD Coin row's first line ("USDC", "1,250") inside the hero's 12 px shadow fade, its glyph tops dimmed by about a third. The row stays readable, with its 250 private and 1,000 public split. In the signed set Home had no fixed hero, and every row showed clear.

**Options:**
- **A.** Ship the frame as produced: every row whole, the top one under the fade, which is how Home looks once scrolled.
- **B.** No scroll: the Holdings label and the USD Coin row show clear, and the bottom nav hides about 58 of the second activity row's 82 px, leaving its title line.

**Recommendation:** A. The fade is the fixed hero's own look and the text reads; B trades it for a row mostly hidden behind the nav, the look the spec's fit exists to avoid.

**What ships now:** A.

## Also on the pairs (no ask)

- Screenshot 3's account card reads "SANDBOX" (the built-in name of the local chain) under a strip that reads "Testnet", and the app shows as "localhost / nulo-playground". Both were in the signed set.
- The display face's flagged "1" now shows in "ACCOUNT 1" on the four popup frames (the type scale).
