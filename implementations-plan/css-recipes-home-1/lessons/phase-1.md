# Arc 1: lessons

## Phase 1

- Built-CSS comparison: chunk files are named `[name]-[hash].css`, and several routes share a name (six `_id_`, three `import`). Pairing by name alone drops files. The comparison pairs same-named files one to one by shared normalised rules and asserts every file pairs once: 13 of 128 files (121 names) differ, the same in both browsers. The 13th, the networks detail chunk, moves EndpointOrderList's hidden rule earlier with its declarations unchanged; that span carries no other class.

## Phase 2: how each state is reached

The plan put the review's failed and slow lines in the smoke run (step 3). Smoke cannot open the review: `feeAllowsSend` needs a landed estimate, or the queue mode a queued answer gives, and the smoke node answers neither. Both lines are reached in the network run (step 4) instead, by the flow the queue mode exists for.

Smoke (armed smoke build; the launch answers the Testnet node with its stand-in, HTTP 400 on every call; the price host refused, prices seeded):

- Home, Activity, a token's page, Holdings, a received detail: seeded rows; four token rows put "View all" on Home.
- Send's person step (`send-destination-more-live`); the form and its fee sheet with the failed estimate: Nulo's sponsor seeded, so the card names a payer and the estimate fails at once on the stand-in's 400.
- Fiat requote: an expired quote cannot reach the notice, since with no live quote the amount card leaves fiat mode (`AmountCard.vue`, `canUseFiatInput`). Only a moved quote reaches it. For that phase the price host is served by a loopback stub whose every answer is five cents higher; the worker's 3-minute price alarm fetches after the session froze its quote, and the 1 % drift limit raises "The price moved since you started typing."
- Execute window, `fee-zero-resolved` fixture: the window's own fee card answers from the fixture's estimate for any payer, so it shows the sponsored sentence (Nulo's sponsor), the unvouched one (a hand-added sponsor) and the open method menu.
- Network detail's endpoint list; the contacts import with an address change; the authwits page and both authwit popups, their estimate failed.
- `FeeMethodSelector`'s trigger "Checking" renders on no screen: `FeeSettingsCard` passes `pending` as `onSend && snapshotPending` and mounts the selector only off Send. Its menu rows' "Checking" is reached on the network run.

Network (proverless `e2e:agent` run; the extension's node origin redirected to a loopback proxy that forwards every call and, when armed, holds or refuses the calls a method list names):

- The verify window after a connect.
- Both authwit popups' menu rows "Checking": the worker restarted (its gas cache dies with it), then the gas read's public leg (`aztec_simulatePublicCalls`) held from before the unlock, so the home's read stays in flight and each popup's card joins it unread. Off Send the snapshot stays uncommitted while the read retries, so the rows keep checking.
- Send's fee sheet with every node call held: Send forces its read, which the balance store bounds at 20 s (`INIT_FETCH_TIMEOUT_MS`), so the payers check in one window per read. Each variant mounts Send afresh and opens the sheet on a new read.
- The fee window's raised card (`tx-sendTx-default`'s approval ceiling).
- The NO_FROM preview failure: two sponsored NO_FROM windows, the first parked on the proof gate; every node call is refused from the gate's release, so the second's preview fails on its first read: "Try again" shows, the refusal surface does not. Refusing `aztec_getPublicDataWitness` alone did not fail it within 60 s.
- A queued send's review: A held unmined, B queued behind it with its review open; the minimum-fee reads (`aztec_getPredictedMinFees`, `aztec_getCurrentMinFees`) held from the release, so B's estimate stalls in its fee options and the review shows its slow line, then refused (its failed line); a retry runs slow again for the form's line and the fee sheet's. Holding `aztec_simulatePublicCalls` held only the gas read: the estimate landed 8.9 s after the release.
- Home's awaiting card: C queued behind an unmined B.

A recording diagnostic found the methods: the preview's calls under a failing node were `aztec_getChainTips`, `aztec_getPublicDataWitness` and `aztec_getNodeInfo`; the queued estimate's run after the release starts with `aztec_getNodeInfo` and `aztec_getPredictedMinFees`.

Network captures, and the fiat one, mask run-varying text (digits to 0, `0x` strings to f, emoji to one emoji) before both the dump and the screenshot, again after each variant re-establishes its state; computed styles do not read text. Each variant checks its state before the dump and after the hover pass, and its testids after the focus walk, so a state that moved mid-capture fails the run instead of standing in the frames.
