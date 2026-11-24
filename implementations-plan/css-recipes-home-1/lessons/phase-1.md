# Arc 1: lessons

## Phase 1

- Built-CSS comparison: chunk files are named `[name]-[hash].css`, and several routes share a name (six `_id_`, three `import`). Pairing by name alone drops files. The comparison pairs same-named files one to one by shared normalised rules and asserts every file pairs once: 13 of 128 files (121 names) differ, the same in both browsers. The 13th, the networks detail chunk, moves EndpointOrderList's hidden rule earlier with its declarations unchanged; that span carries no other class.

## Phase 2: how each state is reached

The plan put the review's failed and slow lines in the smoke run (step 3). Smoke cannot open the review: `feeAllowsSend` needs a landed estimate, or the queue mode a queued answer gives, and the smoke node answers neither. Both lines are reached in the network run (step 4) instead, by the flow the queue mode exists for.

Smoke (armed smoke build; the launch answers the Testnet node with its stand-in, HTTP 400 on every call; the price host refused, prices seeded):

- Home, Activity, a token's page, Holdings, a received detail: seeded rows; four token rows put "View all" on Home.
- Send's person step (`send-destination-more-live`); the form and its fee sheet with the failed estimate: Nulo's sponsor seeded, so the card names a payer and the estimate fails at once on the stand-in's 400.
- Fiat requote: an expired quote cannot reach the notice, since with no live quote the amount card leaves fiat mode (`AmountCard.vue`, `canUseFiatInput`). Only a moved quote reaches it. The phase types an amount, then writes the stored USD quote 5 % higher with a fresh timestamp; the price host stays refused, and the next refused fetch re-broadcasts the stored quotes, so the 1 % drift limit raises "The price moved since you started typing."
- Execute window, `fee-zero-resolved` fixture: the window's own fee card answers from the fixture's estimate for any payer, so it shows the sponsored sentence (Nulo's sponsor), the unvouched one (a hand-added sponsor) and the open method menu.
- Network detail's endpoint list; the contacts import with an address change; the authwits page and both authwit popups, their estimate failed.
- `FeeMethodSelector`'s trigger "Checking" renders on no screen: `FeeSettingsCard` passes `pending` as `onSend && snapshotPending` and mounts the selector only off Send. Its menu rows' "Checking" is reached on the network run.

Network (proverless `e2e:agent` run; the extension's node origin redirected to a loopback proxy that forwards every call and, when armed, holds or refuses the calls a method list names):

- The verify window after a connect.
- Both authwit popups' menu rows "Checking": the worker restarted (its gas cache dies with it), then the gas read's public calls (`aztec_simulatePublicCalls`, `aztec_getPublicStorageAt`) held from before the unlock, and the run waits until one is held. A card joins the read in flight and commits degraded at its 20 s bound (`INIT_FETCH_TIMEOUT_MS`), so its rows check for at most 20 s; the card does not wait out the store's retries. Each variant therefore waits the read out, closes the popup and opens it again: the new card checks again within a second, and the next variant's wait (13 to 15 s, against a 6 s capture) shows its read ran a full 20 s.
- Send's fee sheet with every node call held: Send forces its read, which the balance store bounds at 20 s (`INIT_FETCH_TIMEOUT_MS`), so the payers check in one window per read. Each variant mounts Send afresh and opens the sheet on a new read.
- The fee window's raised card (`tx-sendTx-default`'s approval ceiling).
- The NO_FROM preview failure: two sponsored NO_FROM windows, the first parked on the proof gate; every node call is refused from the gate's release, so the second's preview fails on its first read: "Try again" shows, the refusal surface does not. Refusing `aztec_getPublicDataWitness` alone did not fail it within 60 s.
- A queued send's review: A held unmined, B queued behind it with its review open; the minimum-fee reads (`aztec_getPredictedMinFees`, `aztec_getCurrentMinFees`) held from the release, so B's estimate stalls in its fee options and the review shows its slow line, then refused (its failed line); a retry runs slow again for the form's line and the fee sheet's. Holding `aztec_simulatePublicCalls` held only the gas read: the estimate landed 8.9 s after the release. On Chrome, once B queues, the run picks another payer and then the sponsor again, so the sheet behind the review never shows a stale "verifying" row (the second-to-last item below); the Firefox pair ran before that step and matched without it.
- Home's awaiting card: C queued behind an unmined B.

A recording diagnostic found the methods: the preview's calls under a failing node were `aztec_getChainTips`, `aztec_getPublicDataWitness` and `aztec_getNodeInfo`; the queued estimate's run after the release starts with `aztec_getNodeInfo` and `aztec_getPredictedMinFees`.

Network captures, and the fiat one, mask run-varying text (digits to 0, `0x` strings and a shortened address's tail to f, emoji to one emoji) before both the dump and the screenshot, again after each variant re-establishes its state; computed styles do not read text. Each variant checks its state before the dump, after the screenshot and after the hover pass, and its testids after the focus walk, so a state that moved mid-capture fails the run instead of standing in the frames. Each smoke capture waits for 500 ms with no DOM mutation before its dump.

## Phase 2: what the proof runs taught

- The wallet's own fetches carry `redirect: "error"` (`privateFetchInit`). Chrome's CDP interception rewrites a request's URL in place; Firefox's `channel.redirectTo` is a real redirect, so a redirected price fetch fails there and a loopback stub never sees it. A state that needs a moved price uses the service's own path instead: every refused fetch re-broadcasts the stored quotes (`recordFailure`), and the price alarm fetches every 3 minutes, behind a backoff after each refusal.
- A scripted `click()` on a menu trigger inside a popup leaves focus where it was; the menu moves focus into its teleported panel, the popup's trap pulls it back, and, on some runs, `Popover` closes on that `focusin`. A pointer press focuses the trigger first, as a person's does, and opens it every time.
- `Popover` closes on a document `scroll`. At 320 px the hover pass and the scroll restore scroll the document, so an open menu closes mid-variant. A menu state is checked right after its screenshot, not after the passes, and the menu opens only after a scroll to the top has settled.
- Firefox moves focus from the page's last Tab stop to the browser's own UI: `document.hasFocus()` turns false and the active element no longer matches `:focus`. The walk ends there, where Chrome cycles back to the first stop; each walk starts on the tab brought to the front.
- After a reload, `#/popup/general` is in the URL before the app has booted, and the boot's own route overrides a navigation made meanwhile. Wait for Home itself (`home-page`).
- On Firefox the successor background answers its first gas read about 12 s after the unlock, later than on Chrome. A check that a read is held waits for one.
- The first Firefox comparison split on content, not style: Get started's "Get Fee Juice" turned Done in one run only (Home marks it once it reads a positive Fee Juice balance, which the execute fixture's gas can supply), and a scroll hint rendered after its measurement in one run's first variant. The seed sets the flag, and each smoke capture waits for 500 ms without a DOM mutation before its dump.
- `DropdownItem` drops `data-dropdown-item` from a disabled row, and a checking row is disabled: a check that finds rows by that attribute sees only the answered ones. Find menu rows by testid.
- The contacts seed closed its page as the import popup closed; on one Firefox run the last contact was never written. Wait for the book to show every contact first.
- Chrome frames differed in pixels where computed styles did not: the blinking caret of a focused field (a 1 px column), the previous screen's success toast caught at a different point of its 2 s life, and a few edge pixels Chrome draws in one of two ways (the last item). Each capture now waits out a passing success toast before its dump and hides the caret for the screenshot only, after the styles are read.
- The extension's CSP refuses an inline `<style>`, and the CSP recorder fails the run on it: anything a capture adds to the page's styles goes through a constructed sheet (`document.adoptedStyleSheets`).
- The volatile mask must cover a shortened address's tail (`0x1234..abcd`): the tail keeps its letters otherwise, and each run deploys at new addresses.
- The fee window's "Available" balance and Home's gas row load after their page (on Firefox Home's about 12 s after the unlock). A capture of either waits until no skeleton remains, and checks that around its dump.
- On Send, `isEstimating` stays true while an estimate is queued, so the paying sponsor's row reads "verifying" whenever a transaction change armed its re-check, which depends on how the inputs raced the first estimate. The payer is not part of the transaction, so picking another payer and then the sponsor disarms it in every run.
- Chrome draws a few 1 px row edges in one of two ways, at the same locations with the same delta (x=19 or 23; green and blue only, by 1 to 25 levels): the same build shows both. A differing pixel passes only when a same-build pair (either visit order) differs at that location by that delta.
