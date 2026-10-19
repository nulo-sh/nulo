# Phase 5: the network suite behind the egress guard (#620)

All runs on this host at retry 0 through `agent.sh`, load1 under 150 at each start. Hosts come from a temporary, uncommitted log of `guard.attempts()` at each launch's close (reverted before the PR).

## Run 1: full proverless selection, Chrome (stopped after 5 files)

- 12 launches over 5 files. Declared or browser-own: `api.coingecko.com`, `android.clients.google.com`, `accounts.google.com`, `clients2.google.com`, `update.googleapis.com`, `www.google.com`, the canary.
- **Undeclared: `content-autofill.googleapis.com`** (about 500 attempts), in `same-token-concurrent-sends`, `selfpay-phase`, `snack-placement` and `type-roles-windows`: Chrome's autofill server, asked about the playground page's form fields. Each such launch failed its close, so the run could no longer be the inventory record; stopped by its process group (clean teardown, no orphan).
- Fix at the source, as README § Egress guard says to try first: `--disable-features=AutofillServerCommunication` in `fixtures/browser/chrome.ts` (Puppeteer 25.8.0 merges every `--disable-features` flag with its own defaults, `ChromeLauncher.js` `getFeatures`). `type-roles-windows` then green, 5/5, no undeclared host.
- Plan deviation: Phase 5 lists price hosts, CRS hosts and "anything else: stop, a plan change". A browser's own host is neither a wallet nor a spec host; the README's standing procedure (a flag first, `ownHosts` second) covers it, and the flag adds no state, lifecycle or contract. Recorded in the ledger (D12).

## CRS probe (I3)

- `frozen-account-canary` prover-ON, nothing listening on `127.0.0.1:59834`: red, and its close named `crs.aztec-cdn.foundation:443` and `crs.aztec-labs.com:443` (bb.js 6.0.0-rc.6 `dest/browser/crs/net_crs.js`: primary, then fallback). I3 demonstrated.
- Fix as Phase 5 pre-described: `CRS_HOSTS` beside `DECLARED_REFUSALS`, sent direct by every guarded launch; the stand-in now drops only when the Testnet node itself is direct.

## The five canary files prover-ON in WASM, Chrome

- 4 of 5 green: `frozen-account-canary`, `tx-sendTx-default` (its awaiting card read `browser`), `transfers`, `delete-after-prove`. No undeclared host; no CRS host at the guard; 59834 never listened.
- `passkey-execution-canary` red at the post-restart ceremony (`waitForHash(#/popup/general)`, line 150), twice. Guard off (temporary control): green. Instrumented: the anchor popup's virtual authenticator holds 1 credential before `stopBackgroundIfAlive`, and after it Chrome answers "The Virtual Authenticator Environment has not been enabled for this session".
- Cause: Chromium's `WebAuthnHandler::Disable()` (`content/browser/devtools/protocol/webauthn_handler.cc`) disables the frame's virtual authenticator environment unconditionally, and runs whenever any DevTools session detaches. The stand-in's interception (`chrome-rpc-intercept.ts`) auto-attaches a session to every target, the anchor popup included, and `stopBackground`'s release detaches them all. On Chrome the credential is page-scoped, so the test keeps that popup open across the kill and loses its credential.
- Panel (D14): Codex said allow `service_worker` and `background_page`, then `{ exclude: true }`. Opus said take Chrome's default filter and exclude `page`, because Chromium types an offscreen document `background_page` only until DevTools gains an offscreen type. Both said it is a local fix, not a plan change. The allow-list went in first (41fd3df5): the passkey canary went green and the anchor's credential survived the restart (1 before, 1 after).
- The allow-list leaked, which `NULO_E2E_INTERCEPT_LOG=1` showed: in that green run the guard took 24 refused attempts at `lb.drpc.live`, the Testnet node, and the interception made no redirect from the offscreen document. The declared refusal hid it. A new offscreen document attaches as `other` (empty URL, held), and a loaded one as `background_page` (an existing target after a re-arm).
- The fix is Chrome's default filter with pages excluded (d22f9021). The unit test (`scripts/e2e/chrome-rpc-intercept.test.ts`) applies Target.pdl's first-match rule. It is red under each of three mutations: no page exclusion, the allow-list, and no filter.

## The five canary files prover-ON in WASM, Chrome, on d22f9021

- Result: 5 files and 8 tests green, in 596 s. Every awaiting card read `browser`. Nothing listened on 59834. No undeclared host.
- Hosts: `api.coingecko.com` 13, Google's own hosts, and the canary. `lb.drpc.live` never reached the guard.
- Interception: 56 redirects from `other` targets (the offscreen documents) and 25 from the service worker. It attached 9 service workers, 6 `other` targets and 3 `background_page` targets, and no page.

## Full proverless selection, Chrome, on f5c27522 (two calls, each under 2 h)

- Call 1, from 18:20 to 20:12 UTC: 82 files green, then stopped at the cap. 135 launches. Hosts: Google's own hosts, `api.coingecko.com` 196, the canary, and the control spec's `egress-probe.test` and `169.254.0.1`. No undeclared host, and `lb.drpc.live` never reached the guard. The interception made 135 `other` attachments, one per launch, which is each launch's new offscreen document. It attached no page.
- Call 2, the remaining 48 files, took 1238 s: 42 green, 5 skipped (Firefox-only or opt-in), and 1 red, `cold-wake-discovery` at line 56 (`backgroundAlive` true right after `stopBackground`).
- Measurements for that red:
  - Guarded: red 3/3, and 2/2 more under timing instrumentation.
  - Unguarded control: green 3/3.
  - Instrumented, both ways: the worker restarts 50 to 350 ms after every kill with nothing of ours attached, guard or not. Unguarded, the check passes only because it runs inside that window, at about +60 ms. Under the guard, the re-arm (6 to 440 ms) returns after the restart.
  - The waker is the offscreen document. It outlives the kill, and its logger and service clients reconnect.
  - With the offscreen document closed from a scratch page before the kill, the worker stayed dead for 1.6 s (2/2). The click then started a held, genuinely cold successor.
- The spec's premise, that the click is the first wake event, was therefore false on every browser run on Chrome; unguarded runs passed on timing. Fix (8eb9518b): `BrowserDriver.closePxeHost`. Chrome closes the offscreen document; Firefox's frame ends with its background page. The spec closes the document before the kill. Guarded: 4/4 green, 9 s each. A test fix in the spec and the driver: no wallet change, no wait added, no retry.

## Full proverless selection, Firefox, on be8ae1c5 (origin/dev merged; two calls, each under 2 h)

- Call 1, from 21:11 to 23:06 UTC: 79 files done (skips included), 0 red, then stopped at the cap. 123 launches. Hosts: Mozilla's own (`firefox.settings.services.mozilla.com`, `firefox-settings-attachments.cdn.mozilla.net`, `content-signature-2.cdn.mozilla.net`), `api.coingecko.com` 186, the canary, and the control spec's probe and link-local hosts. No undeclared host, and `lb.drpc.live` never reached the guard.
- Call 2, the remaining 51 files: 50 green and 1 skipped, in 1964 s, `cold-wake-discovery` included (`closePxeHost` is a no-op there). 52 launches with the same hosts, no undeclared host.

## The five canary files prover-ON in WASM, Firefox, on be8ae1c5

- 5 files and 8 tests green, in 1174 s. The awaiting card read `browser`, and nothing listened on 59834.
- Hosts: Mozilla's own, `api.coingecko.com` 15, and the canary. No undeclared host, and no CRS host at the guard (the PAC sends them `DIRECT`).

## Full smoke, both browsers, on be8ae1c5 (armed builds, retry 0)

- Chrome: 57 files green and 6 skipped (Firefox-only), in 1635 s. 157 launches. Hosts: Google's own, `api.coingecko.com` 145, the canary, and the control spec's hosts. No undeclared host.
- `lb.drpc.live` reached the guard once each in `type-roles`, `contacts-import`, `sw-resilience` and `passkey-retry`. Each of those kills the background or swaps the interception, which are the release windows the declared refusal names.
- The interception attached 208 service workers, 137 `other` targets and 40 `background_page` targets, and no page. It recorded no failure.
- Firefox: 60 files green and 3 skipped, in 2345 s. 162 launches. Hosts: Mozilla's own, `api.coingecko.com` 146, the canary, and the control spec's hosts; `lb.drpc.live` 2. No undeclared host.

## Review loop and OA-3

- Codex, three rounds in session `01a14fe3`: conditional approve each time. Round 1 had 2 findings and round 2 had 2 (one fixed, one disposed as a known limit). In round 3 the cold-wake fix drew no new material finding; one Low on the status-function ban was fixed and mutation-checked. Round 3 was the cap. The plan's Audit verdicts have each finding. The Opus diff review ran alongside round 1.
- OA-3: #789 shipped #616's option A and replaced "focusing the search panel stops the follow" with "the search panel open at the end holds the view while lines arrive". That test went 10/10 green on Firefox at retry 0, on 58a5f88b with the armed build, so no race issue was filed.

## The PR's first CI run: `backup-import-stalled-network` red on Chrome (shard 5/5)

- The Retry's row read "Skipped: couldn't reach the network" where the spec asserts the deadline. Locally the spec had passed once per browser in the inventory. Reproduced at retry 0: red 1 of 3 guarded, then 2 of 4; unguarded green 4/4 and 3/3. No such failure appeared in the last 30 failed CI network runs.
- An instrumented stub showed the cause. It keeps each blackholed call's connection open, and Chrome sends at most six requests at once to one host over HTTP/1.1. Before the Retry, the red runs held six (four `aztec_getBlockNumber` and one `aztec_getL1ContractAddresses`), so the Retry's identity probe was redirected but never sent. Green runs held three, unguarded ones three or four.
- Under the guard, Home on Testnet, in the spec's second popup, issued up to four concurrent block-number reads where unguarded runs issued one or two. The cause of the extra reads was not isolated. Production's Testnet is HTTP/2, which has no such cap.
- Fix (23fc1028): `StubServer.dropUnanswered()` resets every connection holding an unanswered call, and the spec calls it right before its Retry, so every new call still hangs. Guarded: 6/6 on Chrome, 2/2 on Firefox.
