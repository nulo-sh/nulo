---
plan: chain-endpoints
tier: mid
status: approved by the orchestrator (D-orch-1 to D-orch-3); arc 1 in build; arc 2 waits on decision page 12 and reservations R2, R3, R5
issues: "#171 (arc 1); #200, #101, #116, #79 (arc 2, waits on page 12); #77, #197 (no arc, blocked:external)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 3 explorers (sonnet); dual audit (Codex gpt-6.1-sol high + one Opus Plan agent); one Codex resume round; one final fresh Codex pass, plus one confirmation resume after it rejected
base: origin/dev at 9574a9d
trunk: dev
post_implementation_hardening: not scheduled
---

# chain-endpoints: a smoke suite with no outside connections; node URLs, the extension CSP, the price hero

Chain and endpoint configuration, in two arcs and a close-out. The lane map's arc 2 ships as three PRs (2a, 2b, 2c), one per hold, so no reservation waits on another (D10).

- **Arc 1 (#171, decision-free, ships first).** Every smoke browser sends each HTTP, HTTPS and WebSocket request for a host outside the machine to a small guard on loopback. The guard refuses it and records the host. Each launch proves its own routing with a canary that would be reached only on a direct path. A launch that tried an undeclared host fails when it closes. No shipped byte changes.
- **Arc 2a (#200, #101 item 14, #79; waits on page 12).** A node URL with a space, a non-breaking space or a control character inside it is refused with its own line (P12-04). `connect-src` allows plain HTTP only to `localhost` and `127.0.0.1`, and the form refuses `[::1]` (P12-02). The default token list stays built in, so #79 closes by comment (P12-05).
- **Arc 2b (#101 item 15; waits on page 12 and R3).** The logs and JSON viewers move their styles into a shadow root, and `style-src` drops `'unsafe-inline'` (P12-03).
- **Arc 2c (#116; waits on page 12 and R2).** A funded wallet whose price fetch failed shows "—" and "Prices unavailable" on Home (P12-01).
- **No arc.** #77 waits on unleashed's mainnet bridge; #197 waits on the upstream JSON-RPC client.

Recon: [recon.md](recon.md). Questions for the owner: [OWNER-ASKS.md](OWNER-ASKS.md). Consults: [lessons/phase-0.md](lessons/phase-0.md).

## Scope

**In:** #171, #200, #101 (both items), #116, #79. The lane map groups #101, #116, #200 and #79 as one arc 2; this plan ships it as three PRs (D10).

**Out, with reason:**
- #77 (`blocked:external`): the get-gas link can only change once unleashed has a mainnet bridge.
- #197 (`blocked:external`): no arc in this lane. Recon found an in-repo half that is not blocked: a `GasFees` shape check inside `predictedWorstMinFees` (`packages/aztec-runtime/src/fee-juice.ts:18`) covers every caller. It belongs to the lane that owns `fee-juice.ts` (fees-and-sponsors). The close-out comments this on #197.
- Artifact-run smoke (release and nightly smoke of the production zip): it keeps its documented live dRPC leg (`apps/extension/tests/e2e/README.md:59`) and its price-host block. The guard is off there (D4, Ask A1).
- The network e2e suite: the smoke setup alone arms the guard; the network runner belongs to e2e-harness-gaps. The close-out samples two network files and files an issue if they reach an outside host (Ask A5).
- A fetched default token list (#79): P12-05 keeps the list in the build for v1.0.0.
- Channels other than HTTP, HTTPS and WebSocket (UDP, WebRTC). The wallet uses none (recon); arc 1 bounds its guarantee to the three it routes, plus DNS on Chrome.

**Claims that did not hold or hold narrower:**
- #171: "a smoke build seeds" does not hold. With the token-seed pair armed and empty, the seeder returns before any call (`apps/extension/src/wallet/services/token/seeder.ts:400-401`). The RPC traffic comes from the node-status read at popup start (background) and the Home gas read (offscreen PXE). Every cited line holds. The issue also misses that Chrome itself reaches Google hosts during every run (`lessons/phase-0.md`, Chrome proxy probe).
- #101: the viewers are not in shadow roots today (`grep attachShadow|adoptedStyleSheets` finds nothing in our code), so P12-03 creates one per viewer. No "Presto banner hash" exists yet; the banner writes a fixed `<style>` into its own shadow root (`@alejoamiras/presto-banners@1.1.0` `dist/element.js:145`). The refine message with `[::1]` never reaches a person: a refused URL reads "Something went wrong." (`endpoint-error-text.ts:12`).
- #200: the schema has no `.trim()`; zod 4's `.url()` trims and writes the trimmed value back, but the service passes the raw parameter on, so a trailing NBSP is stored percent-encoded. Line cites are off by about two (`spec.ts:145-159`).
- #116: cites are stale (`BalanceView.vue:117-120,346-352`). A failed fetch cannot be told apart from an empty answer today: `PriceService.doRefresh` swallows the failure (`price/service.ts:315,368-375`).
- #77: `FeeSettingsCard.vue:940` is a comment; the link is at `:952`.
- #197: cites are off (`fee-juice.ts:19,31,34,38`); the in-repo half above is not external.

## Owner dependencies

- **Arc 1:** none. It changes nothing a person sees in a shipped build.
- **Arcs 2a-2c:** decision page 12, records P12-01 to P12-05, plus OWNER-ASKS.md OA-1 to OA-7 for details the page leaves open. Each OA has a "what ships now" line; the arc builds that and waits for nothing else.
- **Reservations:**
  - R5 (`manifest.config.ts`): arcs 2a and 2b both edit it, and home-onboarding-chrome arc 2 (#156) comes after #101. Arc 2a carries no other hold, so it can land first. #156 waits for 2b too, until the orchestrator disposes of R5 in writing (Ask A3); 2b's banner-hash test catches a Presto banner change from either side but releases nothing.
  - R3 (`LogsViewer.vue`): arc 2b starts after forms-and-contacts arc 1 (#212) merges.
  - R2 (`usePrices.ts`, `BalanceView.vue`): arc 2c starts after send-queue-activity arc 3 (#103) merges. The lane map's R2 rule text says "send-queue arc 2 (#103)", but its own arc table and the lane brief put #103 in arc 3; this plan follows arc 3.

## Outcome & Quality Bar

**For whom.**
- Arc 1: a maintainer or agent reading a smoke check. It must report on the wallet, not on dRPC's, CoinGecko's or Google's uptime. CI traffic must not reach third parties.
- Arc 2: a person on Home when prices cannot load; a person typing a node URL; every person whose extension pages run under the CSP.

**What excellent looks like.**
1. A smoke run on either browser opens no HTTP, HTTPS or WebSocket connection to a host outside the machine. A change that makes the wallet or a spec try a new outside host fails the run, and the failure names the host and the file.
2. Every launch proves its own routing with a canary that would be reached only on a direct path, so no proof passes vacuously. Arc 1's diff touches nothing that feeds a build.
3. Arc 2 ships each approved proposal word for word. Each refused input class has its own test. No CSP violation is recorded across smoke and network on both browsers, the viewers' pixels match before and after, and their search, selection and scrolling behave as before.
4. A stored node URL that the new rules refuse still lists in Settings, the popup still starts, and the person can edit or delete the URL. One exception, pre-existing for every unreachable custom node: a custom network that has no account yet stops popup start at its account's live identity check (D11); the close-out files it as an issue.

**Good enough.** The browser hosts on one reviewed list of exact names are refused without failing a launch. Artifact runs stay as they are.

## Assumptions

### Facts (verified against the tree at 9574a9d, or by a probe logged in `lessons/phase-0.md`)

- F1. The PR smoke build arms the token-seed pair with no key, so the seed list is empty (`.github/workflows/_extension-smoke-e2e.yml:116-122`; `apps/extension/src/e2e/config.ts:79-99`).
- F2. The background reads the active network's node info on every popup start, without awaiting it (`apps/extension/src/composables/useProfileBootstrap.ts:79`; `network/service.ts:737-751`). The default active network is Testnet at `lb.drpc.live` (`network/service.ts:97-106`; `apps/extension/src/wallet/constants/network-endpoints.ts:2`). The node client retries a failed request through the SDK's `retry` and `makeBackoff` (`packages/aztec-runtime/src/utils/fetch.ts:4-15`).
- F3. Home's gas card creates the offscreen PXE runtime, which calls the node (`GasBalanceCard.vue:128`; `packages/aztec-runtime/src/pxe/chain-runtime.ts:179,195`).
- F4. The price service fetches `api.coingecko.com` on profile create and unlock, every 3 min, and on popup mount when the cache is incomplete; the id set always includes Fee Juice (`price/service.ts:31,147-161,179-213`; `price-map.ts:36-39`).
- F5. Every smoke and network launch goes through `launchExtension` → `launchBrowser` → `driver.launch` (`tests/e2e/fixtures/extension.ts:79-115`; `fixtures/browser/index.ts:212`). Its CSP latch starts as checked when the recorder is not armed, and `checkCspViolations` consumes it early (`extension.ts:98-108`).
- F6. Only artifact runs block a host today: Chrome `--host-resolver-rules=MAP api.coingecko.com 127.0.0.1:1` (`chrome.ts:53`), Firefox a PAC to a dead port (`firefox.ts:229-247`).
- F7. `interceptRpc` intercepts inside the browser: CDP `Fetch` with browser-level auto-attach on Chrome (`chrome-rpc-intercept.ts:22-103`), a parent-process `http-on-modify-request` observer on Firefox (`firefox-rpc-intercept.ts:25-45`).
- F8. `bun run test` includes `apps/extension/scripts/**/*.test.ts` and `packages/wallet-core/src/**/*.test.ts` (`apps/extension/vitest.config.ts:34-42`). `vitest.e2e.all.config.ts:17-19` runs every smoke file too, under the network global setup.
- F9. The extension CSP is one string for both browsers, pinned at source by `src/manifest.test.ts:123-130`; no test reads a built manifest's CSP.
- F10. `NetworkEndpointSchema` and `NetworkSchema` (with `RpcUrlSchema`) are the network client's result schemas (`network/client.ts:37-46`; `spec.ts:161-174,231-239`). Params use `RpcUrlSchema` directly. The storage row codec is lax (`spec.ts:52-75`). Backups carry no network rows: the `network` slice is retired and refused, and a restore reseeds the built-in networks (`backup-migration-registry.test.ts:105`; `composables/full-backup-restore.ts:263`).
- F11. `setActiveNetwork` writes the active pointer, then calls `nodeFactory.createNode` (`network/service.ts:609-622`); the adapter throws for a refused URL before dialing (`packages/aztec-runtime/src/adapters/aztec-node-factory-adapter.ts:65-68`); popup start awaits `setActiveNetwork` (`useProfileBootstrap.ts:76`).
- F12. A refused URL in the network forms reads "Something went wrong." (`endpoint-error-text.ts:12`; `EditEndpointPopup.test.ts:116`), and errors map by `ERR_*` constants (`endpoint-error-text.ts:7-10`).
- F13. Both viewers mount CodeMirror into a plain `<div>`, so `style-mod` writes a `<style>` into `document.head` (`LogsViewer.vue:222`; `JsonViewer.vue:68`; `style-mod.js:94-101`). `LogsViewer` listens on `document` for `selectionchange` and `focusin` and reads `e.target.closest(".cm-panel.cm-search")` (`LogsViewer.vue:238-245`). The Presto banner writes `<style>…</style>` into its shadow root (`presto-banners/dist/element.js:145`); the package does not export its stylesheet.
- F14. `PriceService.doRefresh` returns the usable cache without emitting when a fetch fails (`price/service.ts:315,368-375`); `usePrices` calls the same `resnapshot` at mount and on every reconnect (`usePrices.ts:44-49`).
- F15. `rows.test.ts:403-447` already opens the logs window (`#/windows/logger`) under the CSP recorder. `JsonViewer` also renders inside `DataViewerPopup` (`PopupManager.vue`).
- F16. Chrome probe (Puppeteer's Chrome, this host with internet): with `--proxy-server` and `--proxy-bypass-list=localhost;127.0.0.1;[::1]`, remote HTTPS and plain HTTP reach the guard and fail; `127.0.0.1` and `localhost` go direct; with the guard stopped, a `no-cors` fetch of `https://example.com/` fails (no direct fallback). Chrome's own traffic reached the guard within 15 s: `clients2.google.com`, `update.googleapis.com`, `accounts.google.com`, `www.google.com`, `android.clients.google.com`, also with extra `--disable-*` flags.
- F18. Chrome canary probe: with the proxy flags and the resolver rules of § Architecture, a fetch of `http://` and `https://egress-canary.test:<p>/` reaches the guard (`GET` absolute-form, `CONNECT`) and the canary counts zero; with the guard stopped the canary still counts zero; with the proxy flags removed it counts a connection. `127.0.0.1`, `localhost` and `[::1]` go direct; `ws://` and `wss://` reach the guard as `CONNECT` (both browsers); a plain-`http://` fetch through the guard settles with its 403 as the response. Without the two IP excludes the guard records nothing, because `MAP *` captures the proxy's own address. With the proxy flags alone, Chrome sends link-local literals (`169.254.x.x`) direct, whatever the bypass list says; with `<-loopback>` first in the bypass list they reach the guard and are recorded, and loopback still goes direct.
- F19. Firefox canary probe (Puppeteer's Firefox, prefs of § Architecture): routed, guard stopped and prefs removed behave as F18 does; loopback goes direct; a `data:text/javascript,` PAC works as well as `application/x-ns-proxy-autoconfig`. Firefox's own traffic reached the guard about 45 times in a few seconds, all under `mozilla.com` and `mozilla.net`, retried after each 403.
- F17. Chrome probe: under `style-src 'self' 'sha256-…'`, a constructed sheet adopted into a shadow root applies with no violation; a hashed shadow `<style>` applies; an unhashed shadow `<style>` and a `<style>` in `document.head` are blocked.

### Inferences (unverified; audits attack these)

- I1. The probes (F18, F19) ran a plain page, not the wallet's extension contexts, and drove Firefox without geckodriver. The background, offscreen and popup contexts route the same way. The per-launch canary, fired from an extension page, proves it on every launch; the control spec proves the background.
- I2. In-browser interception runs before the proxy, so `send-fee-privacy` still counts its hits. Phase 1.2's runs prove it.
- I3. Refusing dRPC on the armed source build keeps the whole suite green at retry 0. The node client still retries (F2), and an earlier attempt failed three reset specs on artifact runs (`chrome.ts:49-52`). Phase 1.2 measures it over three runs per browser.
- I4. Firefox's own traffic stays under Mozilla's or Google's domains, or can be turned off by a pref. Phase 1.2 lists it from three runs.
- I5. No smoke spec proves a transaction, so the CRS hosts never appear. Phase 1.2 lists what appears.
- I6. On Firefox, a constructed sheet adopted into a shadow root passes `style-src 'self'`, and a CSP hash allows a shadow-root `<style>` (F17 is Chrome only). Phase 2b.1 probes it first.
- I7. The production build creates no `<style>` and no style attribute from a string, outside the viewers and the banner. Phase 2b.5 scans the built JS.

### Asks (each with the working assumption the plan proceeds on)

- A1. Should artifact runs also run behind the guard? **Working assumption: no.** `tests/e2e/README.md:59` keeps one live run of the shipped token list before a release, and #171 names the smoke build. A hermetic artifact run would be its own issue.
- A2. Should the smoke setup refuse a dist that is not the armed smoke build? **Working assumption: yes** (D8). It is developer tooling, no shipped surface.
- A3. Does #156 (R5) wait for arc 2b's `style-src` edit, or only for arc 2a? **Working assumption:** it waits for both, until the orchestrator disposes of R5 in writing (§ Delivery).
- A4. Who closes #79. **Working assumption:** the arc-2a session, by comment, once page 12 records P12-05 as approved.
- A5. Network-suite egress. **Working assumption:** the close-out samples two network files with the guard armed locally (uncommitted) and files an issue if one records an outside host. A sample is not a proof for the whole suite.

## Architecture & Implementation

### Arc 1: the egress guard (#171)

**The guard** (`apps/extension/tests/e2e/fixtures/egress-guard.ts`, new). Built on `node:net`, not `node:http`, so the unit test on Bun and the e2e run on Node take the same code path. One guard per launch, inside the test worker, bound to `127.0.0.1` on an OS-assigned port.

```ts
export interface EgressAttempt { host: string; port: number; count: number }
export interface EgressGuard {
  port: number
  attempts(): readonly EgressAttempt[]  // one entry per canonical host:port, never a path
  overflowed(): boolean                 // more than 256 distinct host:port pairs
  stop(): Promise<void>                 // idempotent; ends owned sockets within 2 s
}
export function startEgressGuard(): Promise<EgressGuard>
export const DECLARED_REFUSALS: ReadonlyMap<string, string>  // wallet host → why the smoke build tries it
export const BROWSER_OWN_HOSTS: ReadonlyMap<string, string>   // exact host → which browser, and why
export function undeclared(attempts: readonly EgressAttempt[]): string[]
export function guardArmed(provided: boolean | undefined): boolean // the control spec's skip rule
export function ownGuardedLaunch<T>(deps: GuardedLaunchDeps<T>): Promise<GuardedLaunch<T>>
```

`ownGuardedLaunch` is the ownership scope `launchExtension` runs inside: it starts the guard and the canary, launches and settles the browser, and returns a `close` that runs `closeAfterEgressCheck`. Every resource it started is stopped on every path: launch rejection, settle failure, CSP failure, and a browser close that rejects. Its dependencies are injected, so a unit test drives each path with fakes.

Per connection:
- Read until `\r\n\r\n`, at most 8 KiB, within 5 s.
- Parse the request line: `CONNECT <authority> HTTP/1.x` (HTTPS, WSS) or `<METHOD> http://<authority>/… HTTP/1.x` (plain HTTP, WS).
- Canonicalise the host with `new URL("http://" + authority)` (lowercase; IPv6 keeps brackets). Count it under its `host:port` entry; a provider key in a path or query is never stored. Firefox retries its own refused requests about ten times a second (F19), so the record keeps a count per pair, not one entry per attempt.
- Answer `HTTP/1.1 403 Forbidden`, `Connection: close`, `Content-Length: 0`, then `socket.end()`. Never destroy a socket with unread request bytes: a TCP reset is what makes a browser fail over.
- A request line that does not parse, an oversized head, or a timeout: answer `400` the same way and record host `<malformed>`, which no declaration accepts.
- A connection that sent part of a head and then reaches EOF, or is still unfinished when `stop()` runs, is recorded as `<malformed>` too. A connection that sent no byte at all (a browser's speculative preconnect to its proxy) records nothing.
- The module imports no client (`net.connect`, `http.request`, `fetch`). It never opens an outbound socket; its unit test proves no connection reaches a target it names.

**The canary.** Each launch also starts a loopback listener (`node:net`, `127.0.0.1`, OS port) that only counts connections. Its URL is `https://egress-canary.test:<canaryPort>/` (RFC 2606 `.test`). It is HTTPS because extension pages fire it, and arc 2a's `connect-src` allows plain HTTP only to loopback; the listener counts the TCP connection, so a TLS handshake that never completes still counts. Each browser maps that name to `127.0.0.1` for a direct path only (Chrome's resolver rule, Firefox's `network.dns.localDomains`), and neither proxy rule lists it as direct. Routed correctly, a request for it reaches the guard, which records `egress-canary.test`, and the canary counts zero. With the proxy routing missing or failing over to direct, the name still resolves and the canary counts a connection (F18, F19). So the canary is the success control that makes the guard's record meaningful.

**Routing, per driver.** `LaunchOptions` gains `egress?: { guardPort: number }`; browser differences stay on the driver, as `FIREFOX.md` requires.
- Chrome (`chrome.ts`):
  - `--proxy-server=http://127.0.0.1:<guardPort>`
  - `--proxy-bypass-list=<-loopback>;localhost;127.0.0.1;[::1]`: `<-loopback>` removes Chrome's implicit bypasses, which include link-local addresses, and the three entries after it put loopback back on the direct path (F18)
  - `--host-resolver-rules=MAP egress-canary.test 127.0.0.1, MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1, EXCLUDE ::1`: Chrome resolves no outside name, and the canary name resolves only for a direct path. The two IP excludes are required: `MAP *` also captures IP literals, the guard's own `127.0.0.1` included, and `[::1]` only matches unbracketed (F18).
- Firefox (`firefox.ts`):
  - prefs, exported as `egressGuardPrefs(guardPort)` and merged into the launch prefs only on guarded launches (never into `FIREFOX_LAUNCH_PREFS`, which holds what users run with): `network.proxy.type: 2`; `network.proxy.autoconfig_url`, a `data:` PAC that answers `DIRECT` for `localhost`, `127.0.0.1`, `::1` and `[::1]` and `PROXY 127.0.0.1:<guardPort>` for every other host, with no `DIRECT` after it; `network.proxy.failover_direct: false`; `network.dns.localDomains: "egress-canary.test"`. The probe proved this exact set (F19); the artifact run keeps its W3C `proxy` capability.
- A driver throws when asked for both the guard and the artifact-run block. Artifact runs keep their block exactly as today.

**Browser traffic.** Each browser reaches its vendor's hosts on every run, whatever the flags (F16, F19). These hosts are refused like any other. `BROWSER_OWN_HOSTS` lists them by exact name, each with the browser and the reason (for example `update.googleapis.com`, Chrome's component updater; `firefox.settings.services.mozilla.com`, Firefox's remote settings). It is seeded from the probes and finalised from phase 1.2's runs. A host on the list is refused without failing the launch. Any other host fails it, with a message that names the host and the browser and says how to add a browser host. The list is exact, never a domain suffix, so a wallet dependency that calls a new host under a vendor's domain fails the run. Flags and prefs that stop a browser request at its source are preferred over a list entry.

**Arming.** `global-setup-smoke.ts` provides `egressGuard: process.env.NULO_E2E_ARTIFACT_RUN !== "1"`. The network global setup provides nothing, so `inject("egressGuard")` is `undefined` there and network launches are unchanged. `launchExtension` starts the guard and the canary before `launchBrowser` when the key is `true`.

**The checks.** A new pure helper, `closeAfterEgressCheck(closeBrowser, guard, canary, label)`, runs on every guarded launch, independent of the CSP latch:
1. Close the browser (in `finally`, whatever else throws).
2. Stop the guard and the canary, which ends their sockets within the 2 s deadline and classifies any unfinished request.
3. Snapshot the attempts and the canary count.
4. Throw `egress guard: <label> …` when the canary counted a connection, the record overflowed, or `undeclared(attempts)` is not empty.

`launchExtension`'s `close` runs the CSP check (unchanged) and then this helper, so a throwing or consumed CSP check cannot skip it. Today `launchBrowser` runs before the `try` at `extension.ts:88-90`; with the guard, the launch moves inside `ownGuardedLaunch`, so a launch that rejects still stops the guard and the canary. Every launch also runs the canary once after `settleLaunchedExtension`: the scratch page (an extension page, under the extension's CSP) fires `fetch(canaryUrl)` without awaiting, and the fixture polls for up to 5 s until the guard records `egress-canary.test`. The canary must count zero.

**Declared refusals** (`DECLARED_REFUSALS`, seeded before phase 1.2's runs, final after them; one reason per host, nothing else accepted):
- `lb.drpc.live`: the default Testnet network's node, read by the background at popup start and by the offscreen PXE on Home.
- `api.coingecko.com`: the price fetch.
- `egress-canary.test`: the per-launch canary.
- `egress-probe.test`: the control spec's background probe.
- Any navigation host a spec opens by a click (for example the legal permalink on `nulo.sh`), if phase 1.2 finds one.

**What the smoke build does instead, per host** (the #171 inventory):

| Host | Today | With arc 1 |
|---|---|---|
| `lb.drpc.live` (background, offscreen) | reached live | refused at the guard: Testnet reads as inactive and the gas card shows its existing "—"; no smoke spec asserts either |
| `api.coingecko.com` (background) | reached live | refused at the guard; specs that need a quote already seed one into storage, so the live refresh can no longer race them |
| Google hosts (Chrome), Mozilla hosts (Firefox) | reached live | refused at the guard; not a failure when the exact host is on `BROWSER_OWN_HOSTS` |
| `localhost:8080`, `127.0.0.1:59833/59834` | on the host | unchanged, direct (loopback) |
| CRS hosts (bb.js) | not reached (no proving) | refused if ever tried; a new appearance fails the run |
| link targets (`nulo.sh`, `presto.build`, unleashed, aztecscan) | only on a click | refused; declared only if a spec clicks one |
| `passkey.nulo.sh` | unknown | refused if tried; declared only if phase 1.2 sees a browser fetch it |

**Control spec** (`tests/e2e/egress-guard.test.ts`, new, smoke, both browsers). It runs only when `guardArmed(inject("egressGuard"))`; artifact runs and `test:e2e:all` skip it. It probes from two places, so every case passes under today's CSP and under arc 2a's narrower one without a test exception in the shipped policy:
- **The background**, the wallet's own context, under the extension CSP, so HTTPS and loopback only. Firefox's background evaluation cannot await (`csp-violations.ts:44-47`), so each fetch starts without awaiting and writes its outcome (`resolved` or `rejected`) under a per-probe `chrome.storage.session` key; the spec polls that key from a scratch page, as `readCspViolations` reads its list, and fails on a probe still pending after 10 s.
- **An ordinary page** the spec serves from its own loopback server (`listen(0)`) and opens in a tab. No extension CSP applies, so it carries the plain-HTTP, WebSocket, IPv6 and link-local cases, and `page.evaluate` can await them on both drivers.

Cases:
- Background, refused: `https://egress-probe.test/` settles `rejected`; the guard records `egress-probe.test:443`.
- Background, success control: the spec's loopback server as `http://127.0.0.1:<p>/` and `http://localhost:<p>/` settles `resolved`, and the server records both. Loopback goes direct.
- Page, routed: `http://`, `ws://` and `wss://egress-canary.test:<canaryPort>/` each settle (the sockets fail; the `http` fetch may settle with the guard's 403 as its response, since a plain-HTTP proxy answers in the origin's place); the guard records each (absolute-form `GET` for `http`, `CONNECT` for `ws` and `wss` on both browsers); the canary counts zero.
- Page, success control: `http://[::1]:<p>/` on the spec's server (when the host has IPv6 loopback) resolves, and the server records it.
- Page, link-local: `https://169.254.0.1/` fails and the guard records it, so no implicit bypass reaches the network.
- Fail closed: stop the guard. The background's `https://egress-canary.test:<canaryPort>/` settles `rejected`; the page's `http://` and `wss://` canary requests fail; the canary counts zero, so neither browser fell back to a direct path.

**Plain-build refusal** (`global-setup-smoke.ts`). Outside artifact runs, setup reads the dist's JS for `NULO_E2E_TOKEN_SEEDS_BUILD_STAMP`. Without it, setup throws with the armed build line from `FIREFOX.md:5`. An unarmed dist seeds the shipped Testnet tokens against a refused host and skips the migration and CSP checks.

### Arc 2a: node URLs, plain HTTP, the token list (waits on page 12)

**#200, hidden characters (P12-04).**
- `packages/wallet-core/src/utils/rpc-url.ts`: add `hasHiddenUrlCharacter(raw: string): boolean`. It is true when `raw.trim()` contains a character of the refused set. The set that ships now is `\p{White_Space}` and `\p{Cc}` (OA-1). Edges are what `String.prototype.trim` strips (OA-2); U+0085 is not trimmed, so it is refused anywhere.
- `apps/extension/src/wallet/services/network/spec.ts`: export `ERR_RPC_URL_HIDDEN_CHARACTERS = "RPC URL can't contain spaces or hidden characters."`. Refine `RpcUrlSchema` with it before the transport refine, so its message wins.
- `network/service.ts`: `addNetwork`, `addEndpoint` and `updateEndpoint` store the trimmed URL the schema returns, not the raw parameter. A trailing NBSP is then no longer stored as `%C2%A0`.
- `endpoint-error-text.ts`: map `ERR_RPC_URL_HIDDEN_CHARACTERS` to the approved line. `NewNetworkPopup.vue`'s catch shows it as the field's inline warning (OA-3).

**#101 item 14, plain HTTP only to this computer (P12-02).**
- `rpc-url.ts`: `rpcTransportVerdict` refuses `[::1]` for plain HTTP. The node factory shares the rule, so a saved `[::1]` endpoint stops dialing.
- `spec.ts`: the refine message drops "/ http://[::1]". Every result slot of the network client takes a result schema whose endpoints use `NetworkEndpointRowSchema` (`spec.ts:52-56`, `rpcUrl: z.string()`); every other constraint of `NetworkSchema` stays, `l1ChainId` included. Params keep `RpcUrlSchema`. The account-state restore filter keeps `NetworkSchema`: it only ever sees the seeded built-in networks (F10).
- `network/service.ts`: a refused URL must fail exactly where an unreachable one fails. `createNode` does not dial, so an unreachable URL passes it and fails later inside a caller that already handles a dead node; a refused URL throws at `createNode`. That differs only where `createNode` sits outside such a caller:
  - `setActiveNetwork` (`service.ts:615`): before `createNode`, ask the shared verdict (`isAllowedRpcUrl`, the check the factory itself runs, exported from `packages/aztec-runtime/src/adapters/index.ts` for this). For a refused URL, skip `createNode`, delete the chain's cached node (it may point at the endpoint's previous URL) and log a fixed category at `debug`; then continue through the existing `onActiveNetworkChanged` emission (token seeding listens to it, `token/service.ts:157`) and return the network. Any other `createNode` error still propagates. The status read then reports inactive. Without this, one stored `[::1]` endpoint makes popup start throw (F11), and the person cannot open Settings to switch it.
  - `activateSeededLocked` (`:370`): seeded URLs only, never `[::1]`; unchanged.
  - `getNode` (`:781`), `getNodeForUrl` (`:823`) and `_probeChainIdentity` (`:1006`): their callers already handle a node that cannot be reached, and the refusal reaches them as an error in the same place; unchanged.
  - A custom network with no account yet: popup start creates one through `resolveVerifiedL1ChainId`'s live probe (`useProfileBootstrap.ts:106` → `account/service.ts:307` → `network/service.ts:446`), which rejects for a refused URL as it does today for an unreachable one, and popup start stops there. That dead end is pre-existing for every unreachable custom node; the probe is a security check and stays. The close-out files it as an issue (dedupe first).
- `manifest.config.ts`: `connect-src 'self' blob: https: http://localhost:* http://127.0.0.1:*`, comment rewritten to state why.
- `src/manifest.test.ts`: the pinned string. `tests/e2e/security.test.ts`: the built manifest's `content_security_policy.extension_pages` equals the source config, on both browsers.
- `apps/extension/store/remote-code.md`: re-point its line cites if they move.

**#79 (P12-05).** No code. On approval, comment the decision on #79 and close it.

### Arc 2b: no inline styles (#101 item 15, P12-03; waits on page 12 and R3)

- `LogsViewer.vue`, `JsonViewer.vue`: the host `<div>` attaches an open shadow root, and `new EditorView({ root: shadowRoot, parent: <element inside it> })`. `style-mod` then adopts its sheets on the shadow root instead of writing `<style>` into the document (F17).
- The rules that style the editor move into a constructed sheet adopted into the same shadow root: each component's own editor rules, plus the `packages/design/src/base.css` rules that reach editor descendants today (the reset and the scrollbar rules). The sheet comes from a `?inline` CSS import. Custom properties and `@font-face` still reach the shadow tree.
- `LogsViewer.vue`'s `document` listeners read the event's `composedPath()` instead of `e.target`, because a shadow root retargets `e.target` to the host. Its selection check reads `shadowRoot.getSelection` where the browser has it and `document.getSelection()` where it does not, the same fallback CodeMirror uses (`@codemirror/view` `dist/index.js:433-444`).
- Component tests stub `CSSStyleSheet.prototype.replaceSync` and `adoptedStyleSheets`, which jsdom lacks.
- `manifest.config.ts`: `style-src 'self' 'sha256-<hash of the Presto banner's stylesheet>'`.
- `src/manifest.test.ts` (jsdom): register the banner element, clear the banner's dismissal storage, render it with the onboarding's own attributes (`variant="card" state="offline" fonts="none"`; with no handled state it paints nothing), read its shadow `<style>` text, hash it, and assert the manifest carries that hash. The stylesheet is one module constant for every variant and theme (probe in `lessons/phase-0.md`). A banner bump that changes it fails here, not in a person's onboarding.
- `bun run dev` (crxjs HMR): Vite's dev client injects CSS as `<style>` tags. Phase 2b.6 checks the dev popup; if the manifest CSP applies there, serve mode keeps `'unsafe-inline'` through crxjs's manifest function (`manifest.chrome.config.ts:13`, branching on `env.command === "serve"`), and `security.test.ts` asserts no built manifest carries it.
- `tests/e2e/viewers-csp.test.ts` (new, smoke): opens the logs window (reusing `rows.test.ts:403-447`'s path), the JSON window and `DataViewerPopup` with fixture content. Fixture content enters only through storage the viewers already read; if a source hook would be needed, stop and consult the panel. It asserts that the editor's styles apply (computed style), that no CSP violation is recorded, and the interactions in phase 2b.

### Arc 2c: the hero when prices could not load (#116, P12-01; waits on page 12 and R2)

- `price/service.ts`, `price/spec.ts`, `price/client.ts`: `refreshIfStale()` returns `{ quotes, lastRefreshFailed }`. `lastRefreshFailed` is `consecutiveFailures > 0`: this worker's most recent fetch attempt failed. It does not depend on the cache: a failed fetch with usable cached quotes still reports `true`, and the hero then shows those quotes.
- `usePrices.ts`: exposes `unavailable`, fenced by a sequence number. Every `resnapshot` call takes the next number when it is sent; every `onQuotesUpdated` event takes the next number when it arrives. An answer or event is applied to `unavailable` only if its number is above the last one applied. Only the first request's answer (sent synchronously at setup, at popup open) may set `unavailable`, and only when `lastRefreshFailed` is true. An applied event, or an applied later answer with `lastRefreshFailed: false`, clears it. A rejected call leaves it as it is (OA-7). After `dispose`, nothing is applied. The quotes themselves keep today's last-writer behaviour.
- `BalanceView.vue`: a new state when fiat display is on, no token is selected, the wallet holds a positive price-mapped balance (the predicate `awaitingQuotes` uses, `BalanceView.vue:207-217`), none of those assets has a usable quote, and `unavailable` is true. The hero shows "—" (`aria-hidden`, as `FeeCostReadout.vue` does) with the caption "Prices unavailable" (`data-testid="balance-prices-unavailable"`). An empty wallet still reads `$0.00`; partial pricing keeps "priced assets only".
- `tests/e2e/network/hero-prices-unavailable.test.ts` (new): page 12's shot fixture. It arms `interceptRpc(browser, extId, "https://api.coingecko.com", { kind: "refuse" })` before the profile opens, imports `exportFundedBackup`'s file with `importFullBackup`, opens Home and asserts the caption, on both browsers.

### File-level change map

| Phase | Production / harness files | Tests |
|---|---|---|
| 1.1 | `apps/extension/tests/e2e/fixtures/egress-guard.ts` (new) | `apps/extension/scripts/e2e/egress-guard.test.ts` (new) |
| 1.2 | `fixtures/browser/index.ts` (`LaunchOptions`), `fixtures/browser/chrome.ts`, `fixtures/browser/firefox.ts`, `fixtures/egress-guard.ts` (`ownGuardedLaunch`, `closeAfterEgressCheck`), `fixtures/extension.ts` (launches through `ownGuardedLaunch` when armed), `tests/e2e/global-setup-smoke.ts` | `scripts/e2e/egress-guard.test.ts` (`ownGuardedLaunch`), `scripts/e2e/firefox-driver.test.ts` (PAC and prefs), `scripts/e2e/chrome-driver.test.ts` (new: the proxy and resolver arguments), the whole smoke suite |
| 1.3 | `fixtures/egress-guard.ts` (final `DECLARED_REFUSALS` and `BROWSER_OWN_HOSTS`), `global-setup-smoke.ts` (plain-build refusal), `tests/e2e/README.md`, `tests/e2e/FIREFOX.md`, `.claude/skills/e2e-testing/SKILL.md` | `tests/e2e/egress-guard.test.ts` (new) |
| 2a.1 | `packages/wallet-core/src/utils/rpc-url.ts`, `apps/extension/src/wallet/services/network/spec.ts`, `network/service.ts`, `popup/components/popups/endpoint-error-text.ts`, `NewNetworkPopup.vue` | `rpc-url.test.ts`, `network/spec.test.ts`, `network/service.test.ts`, `endpoint-error-text.test.ts`, `NewNetworkPopup.test.ts` |
| 2a.2 | `rpc-url.ts`, `network/spec.ts`, `network/service.ts`, `packages/aztec-runtime/src/adapters/index.ts` (export `isAllowedRpcUrl`), `apps/extension/manifest/manifest.config.ts`, `apps/extension/store/remote-code.md` | `rpc-url.test.ts`, `network/spec.test.ts`, `network/client.test.ts`, `network/service.test.ts`, `src/manifest.test.ts`, `tests/e2e/security.test.ts`, `tests/e2e/endpoints.test.ts`, `tests/e2e/network/endpoint-refused-recovery.test.ts` (new) |
| 2a.3 | — (#79 by comment) | — |
| 2b | `components/JsonViewer/LogsViewer.vue`, `JsonViewer.vue`, their CSS, `manifest.config.ts` (and its serve-mode branch, if 2b.6 needs it) | `LogsViewer.test.ts`, `JsonViewer.test.ts` (stubs), `src/manifest.test.ts` (banner hash), `tests/e2e/security.test.ts`, `tests/e2e/viewers-csp.test.ts` (new) |
| 2c | `wallet/services/price/{service,spec,client}.ts`, `composables/usePrices.ts`, `popup/components/modules/general/BalanceView.vue` | `price/service.test.ts`, `usePrices.test.ts`, `BalanceView.test.ts`, `tests/e2e/network/hero-prices-unavailable.test.ts` (new); `utils/copy-dash-ban.test.ts` only if it flags the hero's empty-value dash |

### Trade-offs and alternatives not taken

- **A recording refusal proxy (chosen) vs resolver and PAC denial plus an in-browser recorder.** Resolver or dead-proxy denial records nothing, so attribution would need a second mechanism per browser: CDP `Network` auto-attach on every extension target, and a Firefox chrome-script observer filtered by load principal. The proxy denies and records in one module on both browsers. Its cost is that it cannot tell browser traffic from the wallet's; the exact-host browser list absorbs that, with a documented blind spot (§ Security).
- **An exact-host browser list (chosen) vs a vendor-domain rule.** A domain rule never fails on a rare browser request, but it also passes any wallet dependency that calls a new host under `googleapis.com` or `mozilla.net`. The exact list can turn a required check red when a browser fires a host the six inventory runs never saw; the failure names the host, and the fix is one reviewed line. Detection wins over that flake risk.
- **A build seam for the smoke build** (Outline B: a double opt-in flag that points Testnet at a loopback stub and stubs the price fetch) would make the record empty. It costs a stamp, a negative release grep, `agent.sh` and workflow edits, and it moves the smoke build further from the shipped one. Kept only as fallback F2 behind phase 1.2's stop rule.
- **Generalising `interceptRpc` to refuse everything.** Chrome's CDP arming runs after launch, so the background's first requests escape. Firefox has one interception slot, which specs already use.
- **OS-level denial** (`iptables`, `unshare -n`). The repo's actions take no `sudo`, a runner rule would cut the setup steps, and this host restricts user namespaces. Phase 1.3 tries `unshare -rn` once as an extra local proof and logs the outcome.
- **A stub node instead of refusal for dRPC.** An HTTPS stub needs a trusted certificate or a build-time URL change. Refusal is what a person with no network sees, which is the case smoke should prove.
- **Arc 2b: shadow roots vs a nonce.** CodeMirror's `cspNonce` needs a per-load nonce, which a static extension CSP cannot carry.

### Competing outline (sent to both audits)

**Outline B: build seam first, guard second.** Add `VITE_NULO_E2E_HERMETIC` + `_CONFIRM` (double opt-in). In an armed build, the Testnet seed points at `http://127.0.0.1:<stub>` and `PriceService` gets a fixture `fetchFn`. The smoke workflow and `agent.sh` set the pair; `_build-extension.yml` refuses it in release builds; a stamp proves it propagated. A Chrome `--host-resolver-rules` deny-all and a Firefox PAC to a dead port back it up, with no recorder; the record must be empty. Arc 2 splits into three PRs, one per reservation.

**Verdict (both audits agree).** A's recording proxy is the right core: B proves its stubs rather than the wallet's offline behaviour, and its backstop records nothing, so it cannot name a new host. B's split of arc 2 by reservation is better than A's first draft and is adopted (D10).

## UI impact

- **Arc 1:** none. No file that feeds a build changes; the release build is byte-identical.
- **Arc 2c, Home hero (P12-01):** "For a funded wallet whose first price fetch failed, the hero shows "—" with the caption "Prices unavailable" instead of $0.00; token rows keep their balances without dollar figures (TokenCard already hides a missing one). An empty wallet still shows its true $0.00. The PR attaches the result in both themes."
- **Arc 2a, Settings → Networks RPC URL field (P12-04):** "The field refuses a URL with a space, a non-breaking space or a control character anywhere in it, with its own line: "RPC URL can't contain spaces or hidden characters.""
- **Arc 2a, extension-page CSP and the network form message (P12-02):** "connect-src allows plain HTTP only to localhost and 127.0.0.1. A saved http://[::1] node URL stops working (switch it to localhost); the form refuses [::1] and its message drops "/ http://[::1]"."
- **Arc 2b, logs and JSON viewers (P12-03, veto list):** "The logs and JSON viewers' inline styles move into their shadow root's stylesheet, before/after shots prove identical pixels, and style-src drops unsafe-inline."
- **Arc 2a, #79 (P12-05):** no screen.
- Anything beyond these words is in OWNER-ASKS.md (OA-1 to OA-7) with what ships now.

## Security & Adversarial Considerations

**Arc 1.**
- *Before:* every PR smoke run sends the CI runner's address and timing to dRPC, CoinGecko and Google, and a required gate depends on dRPC and CoinGecko being up. A slow or hostile price or node service can turn smoke red, or race a spec's seeded quote.
- *After:* no HTTP, HTTPS or WebSocket connection leaves the machine, and Chrome resolves no outside name. A failing or hostile outside service cannot change a smoke result. A new wallet host fails the run.
- *Blind spot:* a wallet request to a host that is on `BROWSER_OWN_HOSTS` is refused but does not fail the run. Smoke still denies it; review of a change that adds a list entry is what catches it. On Chrome, a request that the resolver rules deny before routing (none is known after `<-loopback>`) would be denied without a record.
- *The smoke build must never ship:* arc 1 adds no build flag and touches no build input, so nothing of it can reach a release. The guard lives only under `tests/e2e/fixtures`.
- *The guard itself:* binds `127.0.0.1` on an ephemeral port and never forwards (unit-tested). It stores host and port only, so a provider key in a URL path is never written; a hostname can still carry meaning, which is why the record stays in the test worker. A local process that connects gets a 403 or 400; the record grows by distinct `host:port` only, and more than 256 pairs fails the launch rather than growing memory. It answers before it closes, so no reset can trigger a browser's fail-over. If it dies, both browsers fail closed, which the control spec proves.
- *Least privilege and supply chain:* no new dependency (`node:net` only), no workflow change, no new permission.

**Arc 2.**
- *An extension page* (XSS or a hostile dependency). Before: `connect-src … http:` lets it send data over plain HTTP to any host; `'unsafe-inline'` lets injected markup restyle the page (overlays, hidden fields). After: plain HTTP only to loopback; styles only from the extension, the viewers' adopted sheets, or the one hashed banner sheet. `https:` still admits any HTTPS host, because the network form accepts any HTTPS node; an allowlist is not proposed.
- *A node operator or a person who pastes a URL from one.* Before: a URL with a hidden character inside validates and is stored, so the URL the person reads can differ from the one dialed. After: refused at the input boundary with its own line.
- *Stored rows the new rules refuse:* they still list, the popup still starts, and the person can fix them. The node factory refuses to dial `[::1]`; the refusal becomes an inactive status, logged as a fixed category at `debug`. A hidden-character row dials its percent-encoded form, which is harmless. Backups carry no network rows, so no backup can bring one in.
- *A price service* that fails or answers nothing usable. Before: a funded wallet reads `$0.00`, which can push a person to act. After: "—" and "Prices unavailable". The signal comes from the background's own fetch, not from any page.
- *#79:* a fetched list would be a remote-code and supply-chain surface (signing, pinning, store declarations); P12-05 keeps it built in.
- *Crypto:* the CSP hash is SHA-256 from `node:crypto` in a test. No new runtime crypto.

## Phases

Shared gate commands (run from the worktree root unless stated):
- **Fast:** `bun run lint && bun run typecheck:all && bun run test`.
- **Armed smoke build (Chrome):** `cd apps/extension && VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run build:chrome`. Firefox: the same with `build:firefox`.
- **Whole smoke:** `cd apps/extension && NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- --retry=0`. Firefox: prefix `NULO_E2E_BROWSER=firefox`.
- **One network file:** `NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/<file>.test.ts --retry=0`. Firefox: prefix `NULO_E2E_BROWSER=firefox`. `e2e:agent` rebuilds the dist, so rebuild the armed smoke dist before the next smoke run. Run one `e2e:agent` at a time on the host until #169 merges (G1).
- **Pass rule for e2e:** exit 0, and every file reports as run; a file skipped here must also skip on the base.

### Arc 1: smoke without live hosts (#171) — decision-free

Warning: rebase onto `dev` after e2e-harness-gaps arc 1a (#169) merges. Both arcs edit `fixtures/browser/firefox.ts` and the e2e docs. If #169 has not merged when arc 1 starts, build on `dev` and rebase before the PR opens.

#### Phase 1.1: the guard

1. Write `fixtures/egress-guard.ts`: `startEgressGuard`, `undeclared`, `guardArmed`, `ownGuardedLaunch`, `DECLARED_REFUSALS` seeded with `lb.drpc.live`, `api.coingecko.com`, `egress-canary.test` and `egress-probe.test`, and `BROWSER_OWN_HOSTS` seeded with the hosts the probes saw (`lessons/phase-0.md`).
2. Write `scripts/e2e/egress-guard.test.ts` with these cases:
   - A `CONNECT` names a loopback target server the test starts. The client reads a full `403` status line, never a reset. The record holds the host and port. The target sees zero connections.
   - Success control for that case: a direct connection to the same target is counted, so the counter works.
   - An absolute-form `GET http://example.test/secret/path?key=1` gets `403`; the record holds `example.test` and 80, and no path.
   - A `CONNECT [::1]:443` is recorded as host `[::1]`.
   - A request line that does not parse, and a head over 8 KiB, each get `400` and record `<malformed>`.
   - 2,000 attempts to one host leave one entry with count 2,000 and `overflowed()` false; the 257th distinct host sets it.
   - `stop()` with an idle socket still open resolves within its deadline.
   - A client sends a request line, withholds the header terminator, and `stop()` runs: the record holds `<malformed>`. Its success control: a complete `CONNECT` to a declared host, then `stop()`, leaves only that host.
   - A connection that sends no byte before `stop()` records nothing.
   - `undeclared` passes `update.googleapis.com` (listed) and `lb.drpc.live` (declared), and returns `firebaseinstallations.googleapis.com` and `evil-update.googleapis.com` (same domains, neither listed).
   - `guardArmed` is true only for `true`.

Validation gate: Fast. Pass: exit 0, and every case above runs. Layers: lint, typecheck, unit.

#### Phase 1.2: routing, the checks, and the inventory

1. Add `egress` to `LaunchOptions`. Wire Chrome's three arguments and Firefox's `egressGuardPrefs`.
2. Make each driver throw when the guard and the artifact-run block are both requested.
3. Pin the arguments: extend `scripts/e2e/firefox-driver.test.ts` (`egressGuardPrefs`: the four prefs, the PAC's loopback list, no `DIRECT` fallback; `FIREFOX_LAUNCH_PREFS` unchanged) and add `scripts/e2e/chrome-driver.test.ts` (proxy; the bypass list starting with `<-loopback>`; resolver rules with both IP excludes).
4. Provide `egressGuard` from `global-setup-smoke.ts`.
5. Write `ownGuardedLaunch` and `closeAfterEgressCheck`. Move `launchExtension`'s launch, settle and close into `ownGuardedLaunch` when the guard is armed; the CSP check runs inside `close`, before the egress check.
6. In `ownGuardedLaunch`, run the per-launch canary after the settle.
7. Add unit tests for `ownGuardedLaunch` with fakes:
   - the launch rejects: the guard and the canary are stopped, and the launch error is rethrown;
   - the settle throws: the browser closes, and both are stopped;
   - an undeclared host fails `close`, and the browser still closes;
   - a throwing CSP check still runs the egress check;
   - an early `checkCspViolations` call does not skip it;
   - the browser close rejects: both are still stopped, and the close error is reported;
   - a canary hit fails the launch.
9. Build the armed smoke dist. Run the whole smoke suite three times on Chrome, then three times on Firefox.
10. Sort each failure into one of two kinds: an egress-check failure (it names hosts) or a behaviour failure.
11. Write the inventory to `lessons/phase-1.md`: host, file, browser, and runs seen. Add both browsers' run durations against one base run.
12. Stop rule: when a behaviour failure traces to a refused host, stop. Record the evidence in `lessons/phase-1.md`. Consult the panel.
13. The fallback to discuss is F2: a double opt-in build seam that points the Testnet seed at a loopback stub answering HTTP 400, which the node client does not retry. Build nothing of F2 without a recorded decision.
14. Outcome (2026-10-10): the rule fired on ten node-bound tests; the panel's answer, a harness-only redirect of the Testnet node to a loopback 400 stub and a seeded sponsor for the fee picker, is D23 to D25. The six whole-smoke runs are judged on that build.

Validation gate: Fast; the six whole-smoke runs. Pass: Fast exits 0. Every smoke failure is an egress-check failure that names a host; no behaviour failure; no canary hit. The six runs' hosts are each either declared or listed by the end of phase 1.3. Layers: lint, typecheck, unit, smoke e2e (both browsers).

#### Phase 1.3: declare, prove, document

1. Finalise `DECLARED_REFUSALS` and `BROWSER_OWN_HOSTS` from the inventory, one line of reason per entry.
2. For each browser host, first try a flag or pref that stops it at its source; list it only when none does.
3. Write `tests/e2e/egress-guard.test.ts` with the cases in § Architecture.
4. Add the plain-build refusal to `global-setup-smoke.ts`.
5. Update `tests/e2e/README.md`: the guard, the canary, the declared list, and how to add a host.
6. Update `tests/e2e/FIREFOX.md`: the guarded prefs and why they are prefs. After step 9 has run artifact mode on Firefox, replace the "not yet observed" line at `:63` with what it observed.
7. Update the `e2e-testing` skill: smoke refuses every outside host.
8. Negative proof, on each browser: locally drop the proxy settings only (Chrome's `--proxy-server` and `--proxy-bypass-list`; Firefox's `network.proxy.type` and `network.proxy.autoconfig_url`), keeping the canary mapping, and run `tests/e2e/egress-guard.test.ts`. The per-launch canary must count a connection from the extension page, so the launch fails. Restore the settings; the spec must pass. Log both runs.
9. Artifact-mode check, on each browser: make a plain build. Run `NULO_E2E_ARTIFACT_RUN=1 bun run test:e2e -- tests/e2e/egress-guard.test.ts tests/e2e/fiat-display.test.ts --retry=0`. The control spec must report skipped and `fiat-display` must pass. Rebuild the armed dist afterwards.
10. Try `unshare -rn sh -c 'ip link set lo up && <whole smoke, Chrome>'` once. Log the outcome, whether it ran or the host refused user namespaces.

Validation gate:
- Fast; `bun run test:all`; `bun run test:ci-gating`.
- The armed smoke builds, then whole smoke on Chrome and on Firefox.
- On each browser: `tests/e2e/network/networks.test.ts` and `tests/e2e/network/default-token-seeding.test.ts`. The driver changes must leave the network path alone.
- `git diff --stat origin/dev -- apps/extension/src packages apps/extension/manifest apps/extension/public apps/extension/package.json apps/extension/vite.config.ts apps/extension/vite.shared.ts apps/extension/vite.chrome.config.mts apps/extension/vite.firefox.config.mts apps/extension/scripts/check-rp-id.ts bun.lock` prints nothing.

Pass: every command exits 0. Both smoke suites are green at retry 0, with no undeclared host and no canary hit. Steps 8 and 9 behave as written. Layers: lint, typecheck, unit, CI gating, smoke e2e (both browsers, armed and artifact mode), network e2e (two files, both browsers).

### Arc 2a: node URLs, plain HTTP, the token list (#200, #101 item 14, #79) — waits on page 12

Every phase of arcs 2a, 2b and 2c **waits on page 12**. Build none of it before the orchestrator releases the arc. A record answered "Change (with a note)" or struck replaces its phase's text with the note, through the orchestrator. Start each arc from a `dev` that holds arc 1.

#### Phase 2a.1: refuse hidden characters inside a node URL (#200, P12-04) — waits on page 12

1. Add `hasHiddenUrlCharacter` to `rpc-url.ts` with the set and edge rule that ship now (OA-1, OA-2).
2. Add `ERR_RPC_URL_HIDDEN_CHARACTERS` and its refine to `RpcUrlSchema`, before the transport refine.
3. Make `addNetwork`, `addEndpoint` and `updateEndpoint` store the trimmed URL the schema returns.
4. Map the constant in `endpointErrorText` and in `NewNetworkPopup.vue`'s catch (OA-3).
5. Tests in `rpc-url.test.ts`, one per refused class:
   - an ASCII space in the path;
   - an NBSP in the query;
   - U+0001;
   - DEL;
   - U+0085, at the end of the string (not trimmed);
   - a tab inside the path, which `URL` would silently strip;
   - U+2028;
   - U+3000.
6. Success controls in `rpc-url.test.ts`:
   - `https://rpc.example/p%20q` (already encoded) is accepted;
   - `http://localhost:8080` is accepted;
   - a URL with a leading and a trailing space is accepted.
7. `spec.test.ts`: an inside NBSP gets the new message; `http://example.com` gets the transport message.
8. `service.test.ts`: on each of the three paths, a URL with a trailing NBSP is stored trimmed, without `%C2%A0`.
9. `endpoint-error-text.test.ts` and `NewNetworkPopup.test.ts`: the approved line shows.

Validation gate: Fast; the armed smoke builds; `tests/e2e/endpoints.test.ts` and `tests/e2e/settings-crud.test.ts` on both browsers. Pass: exit 0; every refused class has its test. Layers: lint, typecheck, unit, component, smoke e2e.

#### Phase 2a.2: plain HTTP only to this computer (#101 item 14, P12-02) — waits on page 12

Warning: this phase edits `manifest.config.ts`. Home-onboarding-chrome arc 2 (#156) waits for this arc and for arc 2b (R5).

1. Refuse `[::1]` in `rpcTransportVerdict`. Update `rpc-url.test.ts`: `[::1]` refused; `localhost` and `127.0.0.1` allowed.
2. Drop "/ http://[::1]" from the refine message.
3. Give every network-client result slot a schema whose endpoints use `NetworkEndpointRowSchema`. Keep every other `NetworkSchema` constraint.
4. In `setActiveNetwork`, check the shared verdict before `createNode`: for a refused URL, skip it, delete the chain's cached node, log a fixed category at `debug`, then emit `onActiveNetworkChanged` and return as today.
5. Unit tests:
   - `client.test.ts`: a stored network with an `http://[::1]:8080` endpoint passes the result check on `getOrInitNetworks`, `setActiveNetwork` and `deleteEndpoint`.
   - `service.test.ts`, with a factory that refuses `[::1]`: `setActiveNetwork` on that network resolves, emits `onActiveNetworkChanged`, its status reads inactive, and `getNode` for that chain no longer returns the node cached for the previous URL.
   - `service.test.ts`, the success control for the boundary: a factory that throws an unexpected error for an allowed URL makes `setActiveNetwork` reject with that error.
   - `service.test.ts`, the recovery a person makes: add a `localhost` endpoint (the fake factory answers its identity probe), make it primary, then delete the `[::1]` one. Each step succeeds.
6. Smoke test in `tests/e2e/endpoints.test.ts`: rewrite the active Testnet network's primary endpoint URL to `http://[::1]:8080` in storage, then open a new popup. Assert the popup reaches Home and Settings → Networks lists the endpoint. (Smoke has no node, so it does not edit.)
7. Network test `tests/e2e/network/endpoint-refused-recovery.test.ts` (new): switch to the Local Network, rewrite its primary endpoint to the `[::1]` form of the run's sandbox URL (`aztecConfig.nodeUrl`) in storage, and open a new popup. Assert the popup starts. In Settings, edit that endpoint to `aztecConfig.nodeUrl`; assert the save succeeds (its identity probe reaches the run's own sandbox) and the network's status reads active.
8. Set `connect-src 'self' blob: https: http://localhost:* http://127.0.0.1:*` and rewrite its comment. Update the pin in `src/manifest.test.ts`.
9. In `tests/e2e/security.test.ts`, assert the built manifest's `extension_pages` CSP equals the source config.
10. Re-point `store/remote-code.md` cites if lines moved. `scripts/store-listing.test.ts` must pass.

Validation gate:
- Fast; the armed smoke builds; whole smoke on both browsers.
- Network files on both browsers: `networks.test.ts`, `default-token-seeding.test.ts`, `fiat-send.test.ts`, `endpoint-refused-recovery.test.ts`. The first three dial the loopback sandbox RPC from the background and the PXE under the new `connect-src`.

Pass: exit 0. The CSP recorder records no violation. `security.test.ts` passes on both browsers. Layers: lint, typecheck, unit, smoke e2e, network e2e.

#### Phase 2a.3: the default token list stays built in (#79, P12-05) — waits on page 12

1. If page 12 records P12-05 as approved, run `gh issue close 79 --comment "<the page's decision text>"`.
2. If it is changed, leave #79 open. A fetched list is its own blueprint, outside this plan.

Validation gate: `gh issue view 79 --json state` reads `CLOSED` (approved) or `OPEN` (changed). Layers: none (no code).

#### Arc 2a gate (before its Codex loop)

Fast; `bun run test:all`; the armed smoke builds; whole smoke on both browsers; the network files of 2a.2 on both browsers. Pass: every command exits 0 at retry 0.

### Arc 2b: no inline styles in extension pages (#101 item 15, P12-03) — waits on page 12 and R3

Warning: start only after forms-and-contacts arc 1 (#212) merges, and only if P12-03 was not struck.

#### Phase 2b: viewers in shadow roots, `style-src` without `'unsafe-inline'`

1. Probe both browsers in a scratch built extension (F17 covers only an ordinary Chrome page) that drops `'unsafe-inline'` and mounts one viewer in a shadow root:
   - with the CSP recorder on, open the viewer and the Presto onboarding step;
   - positive control: the adopted sheets and the banner's hashed `<style>` apply (computed style);
   - negative control: an unhashed `<style>` injected into an extension page is blocked, and the recorder records it.
   If any check fails, stop and consult the panel (I6).
2. Write a scratch script (outside the repo, under the lane's cache directory) that loads two PNGs into a Puppeteer page's canvas and prints the count of differing pixels.
3. Capture "before" shots from the base build: the logs window, the JSON window and `DataViewerPopup`, in both themes. Before each shot, fix the window size, wait for `document.fonts.ready`, and leave no focus or caret.
4. Mount both viewers in shadow roots, move their editor rules and the `base.css` rules that reach the editor into the adopted sheet, and switch `LogsViewer`'s listeners to `composedPath()`.
5. Set `style-src 'self' 'sha256-…'`. Add the banner-hash test to `src/manifest.test.ts` and the jsdom stubs to the component tests.
6. Run `bun run dev` and open the popup's logs viewer on Chrome. If styles are missing, keep `'unsafe-inline'` for serve mode only, and assert in `security.test.ts` that no built manifest carries it.
7. Scan both browsers' built JS and HTML for `style=` inside a string literal or attribute, `createElement("style")`, `"<style"` and `setAttribute("style"`. Inspect each hit; fix any the browser would parse from a string (I7).
8. Write `tests/e2e/viewers-csp.test.ts` with these cases:
   - the editor's styles apply (computed style differs from the browser default);
   - focusing the logs search panel stops auto-scroll;
   - selecting log text stops auto-scroll;
   - with no selection and the search panel unfocused, a new log line still auto-scrolls (the success control for the two cases above);
   - on Firefox, selecting and copying a JSON line copies its text;
   - the JSON viewer renders inline and in full screen.
9. Capture "after" shots with the same fixture and settings. Compare each pair with the script; any differing pixel blocks the phase.

Validation gate: Fast; `bun run test:all`; the armed smoke builds; whole smoke on both browsers; network `networks.test.ts` and `default-token-seeding.test.ts` on both browsers. Pass: exit 0; the CSP recorder records zero violations in every context the suites exercise (it cannot hear a violation raised while a document parses, `tests/e2e/README.md:67`, which is why step 7 scans the built HTML and the step-8 cases check that styles apply); the script reports zero differing pixels for all twelve pairs (three surfaces, two themes, two browsers). Layers: lint, typecheck, unit, component, smoke e2e, network e2e.

### Arc 2c: the Home hero when prices could not load (#116, P12-01) — waits on page 12 and R2

Warning: start only after send-queue-activity arc 3 (#103) merges.

#### Phase 2c: the hero state

1. Return `{ quotes, lastRefreshFailed }` from `refreshIfStale` in the service, spec and client.
2. Expose `unavailable` from `usePrices` with the rules in § Architecture: sequence-fenced, set only by the first request's answer, cleared by an applied event or a later clean answer, untouched by a rejection, frozen after `dispose`.
3. Add the hero state and caption to `BalanceView.vue`.
4. `price/service.test.ts` cases:
   - a failed fetch with an empty cache returns `lastRefreshFailed: true`;
   - a failed fetch with a usable cache returns `true` and the cached quotes;
   - a following refresh skipped by the backoff still returns `true`;
   - a later successful fetch returns `false`.
5. `usePrices.test.ts` cases:
   - the open answer sets `unavailable`;
   - an event that arrives before that answer wins;
   - a clean reconnect answer that arrives before the open request's failed answer wins;
   - a failed reconnect answer never sets it;
   - a rejection leaves it unset;
   - an answer that arrives after `dispose` changes nothing.
6. `BalanceView.test.ts` cases, with wire-shaped balances:
   - funded, failed, nothing priced: "—" and "Prices unavailable";
   - funded, failed, a usable cached quote: the amount;
   - funded, failed, partly priced: today's "priced assets only";
   - empty, failed: `$0.00`, no caption;
   - funded, priced: the amount;
   - loading: the skeleton.
7. Replace the pin at `BalanceView.test.ts:546-558`. A rejection keeps today's rendering (OA-7).
8. Write `tests/e2e/network/hero-prices-unavailable.test.ts` as § Architecture says.
9. Capture the hero in both themes for the PR.

Validation gate: Fast; `bun run test:all`; the armed smoke builds; `tests/e2e/fiat-display.test.ts` on both browsers; network `hero-prices-unavailable.test.ts` and `fiat-send.test.ts` on both browsers. Pass: exit 0. Layers: lint, typecheck, unit, component, smoke e2e, network e2e.

## Decision ledger

| # | Decision | Chosen because | Rejected |
|---|---|---|---|
| D1 | A loopback guard on `node:net` that refuses and records, routed per driver | One module denies and records on both browsers; armed before the background boots; same code on Bun and Node | Resolver/PAC deny plus per-browser recorders; a build seam; generalised `interceptRpc`; OS-level denial (§ Trade-offs) |
| D2 | Refusal, not a stub, for dRPC and CoinGecko (dRPC revised by D23) | It is the wallet's real offline case; smoke asserts neither value | A loopback stub node (needs a cert or a build change) |
| D3 | No build flag in arc 1 | The smoke build stays the shipped code plus the existing arming; no release-guard surface | Outline B; kept as fallback F2 behind the phase 1.2 stop rule |
| D4 | Artifact runs unchanged | README keeps one live run of the shipped list before a release; #171 names the smoke build | Guard on artifact runs (Ask A1) |
| D5 | Armed by `project.provide` from the smoke setup; the control spec skips unless the key is `true` | Network launches, `test:e2e:all` and artifact runs stay as they are | An environment variable read in the fixtures |
| D6 | `ownGuardedLaunch` owns the guard, the canary and the browser from start to stop; `closeAfterEgressCheck` runs independent of the CSP latch: browser closed, then both listeners stopped (an unfinished request becomes `<malformed>`), then the snapshot | Neither a disarmed nor a consumed CSP latch can skip it; a launch that rejects still stops both; names the file; a vitest global teardown error only logs | One check inside the CSP latch (first draft); cleanup in the existing catch, which a launch rejection never reaches (round-2 draft); one check in global teardown |
| D7 | A per-launch HTTPS canary on `egress-canary.test`, mapped to loopback for a direct path only; plain-HTTP and WebSocket controls from an ordinary page | It turns "refused" into "routed": a missing or failed-over route reaches the canary | A `.invalid` probe (first draft): it fails whether or not the browser went direct |
| D8 | Setup refuses an unarmed dist outside artifact runs | An unarmed dist seeds against a refused host and skips two checks silently | Accept and degrade, as today |
| D9 | Arc 1 builds after #169 | Both edit `firefox.ts` and the e2e docs | Parallel build and a later conflict |
| D10 | Arc 2 ships as 2a, 2b, 2c, one per hold | One PR would hold #101's manifest change (R5, before #156) behind R3 and R2 | One PR with a split rule (first draft) |
| D11 | Results relax only the endpoint URL; a refused URL fails where an unreachable one fails, so only `setActiveNetwork` changes (check the shared verdict first, evict the cached node, emit as today) | One stored `[::1]` row otherwise breaks the result check and popup start (F10, F11); every other `createNode` path already fails like a dead node | Strict results; the whole lax row codec for results (drops `l1ChainId` checks); a storage migration (pre-production rule); making the custom-network account probe tolerant (it is a security check, and its dead end is pre-existing: an issue at close-out) |
| D12 | The hidden-character predicate beside `rpcTransportVerdict`; the message mapped through an `ERR_*` constant | Shared by schema and popups; matches `endpointErrorText`'s idiom | Parsing the message text in each popup |
| D13 | Edges trimmed as `String.prototype.trim` does; the service stores the trimmed value | The page's title says "inside"; it fixes the stored `%C2%A0` | Refuse edges too (OA-2 option B) |
| D14 | `lastRefreshFailed` is the failure counter; `usePrices` sets `unavailable` only from the open answer, sequence-fenced against later answers and events | The smallest signal; the open answer is the page's case; the fence stops a late failed answer from undoing a newer clean one | A new failure event; an event-only fence (round-2 draft: a late failed answer could win over a clean reconnect answer); "funded" as any positive balance (would count unpriceable tokens) |
| D15 | Viewers in shadow roots; the banner hash read from the rendered element in jsdom | The veto line's mechanism; the package exports no stylesheet; a banner bump fails a test | A nonce (impossible with a static CSP); keeping `'unsafe-inline'` |
| D16 | #79 closes by comment | P12-05 builds nothing | A code change |
| D17 | One `gh stack`, never more than one unmerged arc layer: the next arc is added only after the one below it merges (the close-out sits on the last arc) | The orchestrator merges in order (G2); an unmerged upper branch would sit between a released arc and `dev` | One PR for all arcs; out-of-order layers on one stack (round-2 draft); one stack per arc (no shared base to rebase) |
| D18 | Browser traffic is matched by an exact, reviewed host list; flags and prefs first | Browsers reach vendor hosts whatever the flags (F16, F19); an exact list keeps a new wallet host under a vendor's domain detectable | A vendor-domain rule (round-2 draft: hollows out detection); attribution through CDP and a Firefox observer (a second mechanism per browser) |
| D-orch-1 | No stack: arc 1 opens its own PR against `dev` (`gh pr create --base dev`) with the Delivery table's title; later arcs branch from `dev` after it lands | The orchestrator's call (2026-10-10); it merges lanes in order, so a stack adds a sync step and no safety | One `gh stack` for the lane (D17, superseded for arc 1) |
| D-orch-2 | Arc 1 only: arcs 2a, 2b and 2c wait on decision page 12 (P12-01 to P12-05, and OA-1 to OA-7 as P12-06 to P12-12) and nothing of them is built. Arc 1 changes no file that feeds a build, the PR body states the check that proves the release build is byte-identical, and it adds no user-facing words | The orchestrator's call (2026-10-10) | Planning arc 2 work into arc 1 |
| D-orch-3 | The last panel blocker first: before phase 1.2's gate counts as passed, the first Codex round and the Opus review are each asked, explicitly and first, whether D7's split holds on the merged tree with the host-registry runner (the canary can never pass vacuously; a direct path is caught on both browsers), and whether F18 and F19 still hold (Chrome's `<-loopback>` bypass list with the two IP excludes; Firefox's per-host retry bursts; the exact browser-host list turns smoke red on a new host until it is listed). Answers go under Audit verdicts | The orchestrator's call (2026-10-10): the final Codex pass rejected on exactly this seam | Treating the confirmation round as enough |
| D19 | The browser's own hosts live on each driver (`BrowserDriver.ownHosts`: `CHROME_OWN_HOSTS`, `FIREFOX_OWN_HOSTS`), not in `egress-guard.ts`; a host listed for one browser fails on the other | `scripts/e2e/browser-seam.test.ts` forbids a browser test in `fixtures/**`, and FIREFOX.md puts every browser difference on the driver; stricter than one shared list | `BROWSER_OWN_HOSTS` in the guard module (the plan's text) |
| D20 | The guard, the canary and the control spec's site draw their ports as the harness does (`reservePort(registeredPorts())`), bind, then claim them in `~/.agents/ports.md` until `stop()`; a claim conflict redraws | The orchestrator's rule: the guard's listener claims its port through the registry, never a hardcoded one; binding first leaves no window for another run | `listen(0)` with no row (invisible to other tools); claim-then-bind (a window between the two) |
| D21 | A failure names the test file only | Vitest keeps the last test's name through a later hook, and a file-scoped fixture outlives the test that first asked for it (Opus round 1) | File plus current test name (first draft) |
| D22 | The plain-build refusal checks the token-seed stamp only; it does not require the runner's `NULO_E2E_MIGRATION_FIXTURE` / `NULO_E2E_CSP_REPORT` | The guard needs only the seed arming; the runner flags are the developer's choice, documented in FIREFOX.md and the skill, and changing them is outside #171 | Requiring both runner flags (Codex round 1, finding 4) |
| D23 | The Testnet node (`TESTNET_RPC_URL`'s origin) is answered inside the browser by a per-launch loopback stub with HTTP 400 and a JSON-RPC error body, armed once the launch settles; a request before that reaches the guard and is refused, so `lb.drpc.live` stays declared. CoinGecko stays refused | The node client retries a refusal for about 6 s per call, so ten smoke tests failed on refusal alone (`lessons/phase-1.md`); a JSON 400 is terminal (`NoRetryError`). Ordinary guarded smoke meets terminal RPC errors; the specs about being offline (`send-fee-privacy`, `contacts-import`, `import-errors-scroll`, `import-dead-rpc`) arm their own refusal, which replaces the redirect while they run (D24). Harness only, so D-orch-2 holds | Refusal (D2 as written); F2, a build seam (needs D-orch-2 relaxed); a method-aware fake node (discovery reaches PXE registration) |
| D24 | One interception per browser and origin: a spec's `interceptRpc` on an origin the launch holds suspends the launch's until the spec's `stop()`, which re-arms it; Firefox keeps one observer per origin and gains `redirect` | Two CDP `Fetch` sessions on one origin would both pause its requests, in an order the harness does not control; Firefox's single slot refused any second arm, a different origin included | Letting the spec's and the launch's interceptions coexist |
| D25 | The fee-method-picker case seeds the two protocol FPC rows discovery writes and asserts that Enter saved the pick | It needs a pickable row, not a node: with both rows stored `getFpcs` never discovers, and Nulo's sponsor is eligible without a gas balance. The pick can land on the row already showing, so the saved pick is what tells Enter from a no-op | Moving the pick to the network suite, which turns that step's Firefox coverage on `main` from required to advisory |
| D26 | A background kill (`stopBackground`) suspends the launch's held interceptions for the kill and re-arms them after; a spec's own stays armed | A DevTools session attached to Chrome's stopping service worker keeps its host for the successor, which then never starts clean: with the stand-in held, `sw-resilience` failed the same two tests on all three Chrome runs, and passed with the interception released for the kill (`lessons/phase-1.md`) | Detaching only the worker's session (no seam reaches it from the driver); leaving the stand-in out of kill specs (each spec would have to know) |

## Audit verdicts

### Round 1, Codex (gpt-6.1-sol, high, read-only), 2026-10-10

Verdict: **reject (with blocking findings: vacuous fail-closed proof, teardown gaps, artifact-control incompatibility, saved-endpoint bootstrap failure)**. All fourteen findings accepted; the planner verified findings 1, 2, 6 and 10 against the tree.

| # | Finding | Disposition |
|---|---|---|
| 1 | Medium. F10 and OA-5 misdescribe backup import: backups carry no network rows | Accepted: F10 rewritten; OA-5 now covers saved endpoints only |
| 2 | Low. F14 was false: `rows.test.ts:403` opens the logs window | Accepted: F15; 2b reuses that path |
| 3 | High. The `.invalid` fail-closed probe passes vacuously | Accepted: the loopback canary (D7) and the guard-stopped case; the unit test gains a direct-connection success control |
| 4 | High. The egress check inherits the CSP latch's skips; no cleanup on launch failure | Accepted: `closeAfterEgressCheck` (D6), with four unit cases |
| 5 | High. The control spec breaks artifact smoke | Accepted: `guardArmed` skip rule (D5); phase 1.3 step 9 runs artifact mode on both browsers |
| 6 | High. Tolerant results do not stop popup start from throwing on a saved `[::1]` endpoint | Accepted: the service catches the refusal; cold-boot, edit and delete tests (2a.2) |
| 7 | Medium. Firefox's background evaluation cannot await | Accepted: every probe fires and polls a record the test owns |
| 8 | Medium. "Nothing leaves the machine" exceeds the proof | Accepted: guarantee bounded to HTTP, HTTPS, WebSocket, plus Chrome DNS denial; the loopback control covers `127.0.0.1` and `localhost` |
| 9 | Medium. A hostile local process can attack the recorder | Accepted: `node:net` parsing with caps, canonical hosts, fixed answers, bounded records, `stop()` deadline; one test per case |
| 10 | Medium. Shadow roots retarget events and drop global rules | Accepted: `composedPath()`, the `base.css` rules moved, interaction cases in `viewers-csp.test.ts` |
| 11 | Medium. The CSP gate needs positive and negative controls | Accepted: the 2b.1 probe (negative) and the computed-style case (positive) |
| 12 | Medium. Price-state semantics conflict with the tests | Accepted: semantics defined (failure counter, cache-independent); failure-with-cache, backoff and recovery cases; event ordering in `usePrices` |
| 13 | Medium. Network gates lacked retry 0 | Accepted: `--retry=0` on every network command; A5 says a sample is not a proof |
| 14 | Medium. The split rule ignored R3; the loop seed could archive early | Accepted: D10 three layers; the seeds close out only after every arc is delivered |

### Round 1, Opus Plan agent (same family, read-only), 2026-10-10

Verdict: **conditional approve (with conditions: close Firefox's direct fail-over and replace the fail-closed proof (C1); keep the egress check out of the CSP latch (H2); skip the control spec only where no guard is armed (H3); keep `bun run dev` working under 2.3 (H4); re-cut the arc-2 split around R3 and R5 (H5); move the hero's edge states to OWNER-ASKS.md (M-A1))**. All conditions met; every finding accepted except where noted.

| # | Finding | Disposition |
|---|---|---|
| C1 | Critical. Firefox can fail over to direct; the `.invalid` proof cannot fail | Accepted: `network.proxy.failover_direct: false`, pinned; the canary (D7) |
| H1 | High. A reset from the guard triggers fail-over | Accepted: read the head, answer, then `end()` |
| H2 | High. The CSP latch can skip the egress check | Accepted: D6 |
| H3 | High. The control spec breaks the release smoke and `test:e2e:all` | Accepted: D5 |
| M | Medium. One launch proves routing for all | Accepted: the per-launch canary |
| H4 | High. 2b breaks `bun run dev` | Accepted as a measured step (2b.6): the lessons record that Chrome's dev popup may not run under the manifest CSP, so the phase checks before it adds a serve-mode branch |
| M | Medium. CSP inventory gaps (`DataViewerPopup`; the scan's patterns) | Accepted: shots and spec cover `DataViewerPopup`; the scan has four patterns |
| M | Medium. Fixture content could need a source hook | Accepted: storage only, or stop and consult |
| L | Low. Overclaim; stop the guard after the browser closes | Accepted: bounded claim; D6 order |
| F | Medium/Low. Citations (`rows.test`, retries in `fetch.ts`, `chrome-rpc-intercept.ts` lines, constant path, `doRefresh`, "strict for params") | Accepted: F2, F5, F7, F10, F14, F15 corrected; recon.md corrected |
| I4 | Unsafe; require three retry-0 runs per browser | Accepted: phase 1.2 step 9 (I3) |
| I5 | Firefox's sometimes-firing hosts | Accepted: three runs per browser; a pref first, else an exact `BROWSER_OWN_HOSTS` entry (D18), never a `DECLARED_REFUSALS` entry. The audit expected Chrome to stay quiet; the Chrome probe (F16) shows it does not, so D18 covers both browsers |
| I7 | jsdom lacks constructable stylesheets | Accepted: stubs in component tests |
| — | Bun's `node:http` may not emit `connect` | Accepted: the guard is built on `node:net` |
| — | Firefox's `data:` PAC never observed | Accepted: the per-launch canary observes it on every launch |
| — | Background evaluation cannot await | Accepted: fire and poll |
| M-A1 | The hero's edge states are owner calls | Accepted: OA-7, with today's rendering shipping now |
| L | OA-5 should cover hidden-character backup rows | Moot: backups carry no network rows (Codex 1); OA-5 covers saved rows |
| H5 | Split arc 2 around R3 and R5 | Accepted: D10 |
| D11 | Reuse the row schemas; change every result slot | Accepted in part: endpoints reuse `NetworkEndpointRowSchema`; the network keeps its other constraints (Codex 6) |
| Banner | `STYLES` is not exported | Accepted: hash the rendered `<style>` in jsdom (D15) |
| Gates | 1.2 could not pass with an empty map; the diff stat missed build inputs; 2b had no pixel command | Accepted: map seeded first; diff stat widened; the scratch comparison script |
| Plain language | Six steps could be read two ways | Accepted: steps 1.2, 1.3, 2a.2, 2b, 2c rewritten |

### Round 2, Codex (resumed session, gpt-6.1-sol, high, read-only), 2026-10-10

Verdict: **reject (with blocking findings: Chrome direct bypasses, incomplete fail-closed proof, launch cleanup gaps)**. Codex marked round-1 findings 1, 2, 5, 7, 9, 10 and 13 closed. The planner verified findings 1, 3, 4 and 5 against the tree and probed finding 1 (`lessons/phase-0.md`); all nine accepted, two in part.

| # | Finding | Disposition |
|---|---|---|
| 1 | High. Chrome's implicit bypass sends link-local IP literals direct | Accepted with a correction. The probe confirms the bypass with the proxy flags alone; the plan's `MAP * ~NOTFOUND` already denied it, unrecorded (Codex's "DNS denial cannot block IP literals" does not hold on Chrome). Adopted `<-loopback>;localhost;127.0.0.1;[::1]`, which the probe shows records link-local at the guard and keeps loopback direct; the control spec gains a link-local case |
| 2 | High. The stopped-guard proof never shows the request settled; "remove the routing" would also drop the canary mapping | Accepted: every probe writes its outcome to `chrome.storage.session` and a pending probe fails; HTTP and CONNECT separately; the negative proof drops only the proxy settings |
| 3 | High. `launchBrowser` runs before the `try`, so a launch rejection skips cleanup | Accepted (`extension.ts:88-90`): `ownGuardedLaunch` with injected dependencies, unit-tested on launch rejection, settle failure and close rejection (D6) |
| 4 | High. Other `createNode` paths; the custom-network account probe | Accepted in part: a refused URL now fails where an unreachable one fails, so only `setActiveNetwork` changes, and it evicts the cached node. The custom-network-without-account dead end is pre-existing for any unreachable custom node and guards a security check; the close-out files it as an issue (D11) |
| 5 | Medium. The smoke recovery test needs a node; deleting the primary or last endpoint is refused | Accepted (`service.ts:702-705`): smoke asserts start and listing only; the edit runs in a new network test against the run's own sandbox; a service test covers add, make primary, delete |
| 6 | Medium. A vendor-domain rule hollows out detection | Accepted: exact `BROWSER_OWN_HOSTS` with reasons, flags and prefs first; an unlisted host fails naming itself (D18) |
| 7 | Medium. A late failed open answer can undo a newer clean reconnect answer | Accepted: sequence fence over answers and events, frozen after `dispose`, with both cases tested (D14) |
| 8 | Medium. Chrome's CSP controls ran on an ordinary page, not the extension | Accepted: 2b.1 probes both built extensions with positive and negative controls; the jsdom hash test clears dismissal storage and sets `fonts="none"`; the serve-mode branch named (`manifest.chrome.config.ts:13`) |
| 9 | Medium. Out-of-order layers on one stack; R5 released by a drift test | Accepted: one unmerged arc at a time (D17); R5 holds until 2b merges or the orchestrator disposes of it |

### Final fresh pass, Codex (new session, gpt-6.1-sol, high, read-only), 2026-10-10

Verdict: **reject (with blocking findings: arc 2a's CSP blocks the egress canary and HTTP controls)**. It found no defect in the earlier rounds' fixes and listed as fine: arc 1 outside build inputs, the sequence fence, the result relaxation, exact browser hosts, artifact exclusion, holds and sequencing, D17 and the titles. The planner verified all seven findings against the tree; all accepted.

| # | Finding | Disposition |
|---|---|---|
| 1 | High. Arc 2a's `connect-src` (`http://` only to loopback) blocks the `http://` canary fired from extension pages and the background `http://` and `[::1]` probes | Accepted: the per-launch canary and every background probe use HTTPS or loopback; plain HTTP, WebSocket, IPv6 and link-local run from an ordinary loopback-served page, which no extension CSP governs (D7) |
| 2 | Medium. The snapshot runs before `stop()`, so an unfinished request is never classified | Accepted: stop first, then snapshot; a partial head at EOF or stop is `<malformed>`; a zero-byte preconnect records nothing; two unit cases with a success control (D6) |
| 3 | Medium. D11's catch could swallow unrelated errors and skip the `onActiveNetworkChanged` emission | Accepted: check the shared verdict before `createNode` instead of catching; emit as today; test the emission and that an unexpected factory error still propagates |
| 4 | Medium. OA-5 promised recovery that D11 excludes | Accepted: OA-5 and quality-bar item 4 state the custom-network-without-account exception and its close-out issue |
| 5 | Medium. The WebSocket guarantee had no browser-level control | Accepted: `ws://` and `wss://` canary cases on both drivers, from the ordinary page |
| 6 | Medium. Shadow-root selection needs a browser fallback | Accepted: CodeMirror's own `getSelection` fallback; a no-selection auto-scroll success control |
| 7 | Low. "No CSP violation anywhere" exceeds what the recorder hears | Accepted: the gate reads "zero recorded violations in exercised contexts"; the inline-style scan covers built HTML |

### Confirmation round, Codex (the final pass's session resumed), 2026-10-10

Verdict: **approve**. All seven final-pass findings closed. One Low: `isAllowedRpcUrl` is not exported from `packages/aztec-runtime/src/adapters/index.ts`, the package's only entry. Accepted: the export is added to arc 2a's change map.

### Arc 1, round 1, Codex (gpt-6.1-sol, high, read-only; session `01a1247c-c5d4-79d3-93e0-3e6407ac8be5`), 2026-10-10

Verdict: **reject (cleanup gaps and a control test that can pass without proving every protocol)**.

D-orch-3, asked first:
- **Q1, does D7's split hold on the merged tree with #267's runner? Yes** (high confidence, static). A rejected fetch alone cannot pass: the launch needs the canary recorded at the guard and zero direct connections (`fixtures/egress-guard.ts`, `ownGuardedLaunch`), and `fireCanary` keeps the extension page open until the record lands. Both drivers keep the canary's loopback mapping while routing its name through the proxy, so a direct path counts at the canary and fails the launch or its close. The canary is HTTPS and every background probe is HTTPS or loopback, inside arc 2a's `connect-src`; plain HTTP, WebSocket, IPv6 and link-local run only from the spec's loopback page. Runtime confidence moderate until the controls ran (they since passed on both browsers, below).
- **Q2, do the probed facts hold? Yes** (high). Chrome carries `<-loopback>` and both unbracketed IP excludes exactly as probed; repeats increment one `host:port` entry and only distinct pairs consume the cap; browser hosts match exact names, scoped to the running driver; Firefox gets the probed prefs and a PAC with no direct fallback, and guarded capabilities carry no competing W3C `proxy`. Whether geckodriver keeps those prefs was left to the runtime check.

| # | Finding | Disposition |
|---|---|---|
| 1 | Medium. A close failure in the control spec skips the site's teardown | Accepted: `site.stop()` in a `finally` |
| 2 | Medium. HTTP, WS and WSS share one counter, so one protocol's retries could satisfy all three | Accepted: one request per protocol, each needing its own increase after the count settles |
| 3 | Medium. A failed port claim waits forever on a peer accepted during the claim | Accepted: connections accepted before the claim are destroyed on failure |
| 4 | Medium. The token-seed stamp does not prove the runner flags | Rejected (D22); the comment that claimed it did was corrected |
| 5 | Low. Comments: claim lifetime, shutdown order, two narrating introductions | Accepted |

### Arc 1, round 1, Opus (general-purpose, read-only), 2026-10-10

Verdict: **approve**. D-orch-3: **Q1 yes** (no vacuous pass: broken routing fails as "never reached", a direct path counts at the canary on both browsers, and the close re-checks it; residuals: on Firefox nothing but the canary walls a launch whose prefs failed, and the background is proven by the control spec, not per launch, as I1 accepts). **Q2 yes** (flags pinned in `chrome-driver.test.ts`, the PAC executed in `firefox-driver.test.ts`, per-pair counting unit-tested, exact names per driver). Deviations D19 and D20 approved; it notes every smoke launch now takes the registry lock four times.

| # | Finding | Disposition |
|---|---|---|
| 1 | Low. The launch's canary check matched the host on any port | Accepted: host and port |
| 2 | Low. The failure label could name the wrong test | Accepted (D21) |
| 3 | Low. A backslash in a target parses as `/`, so a hostile local client could make the record name a declared host | Accepted: refused in both forms, with a unit case |
| 4 | Low. No test hits the close-time canary branch | Accepted: one unit case |
| 5 | Low. `listenClaimed` returned `net.Server`, forcing casts in the spec | Accepted: generic |
| 6 | Low. The setup's missing-dist message pointed at a plain build | Accepted: it names the armed build |
| 7 | Low. Two comments (claim lifetime; why the Firefox routing is prefs) | Accepted |

### Arc 1, stop rule, panel consult, 2026-10-10

Evidence in `lessons/phase-1.md`: 10 smoke tests in 6 files pass only while the live Testnet node answers.

- **Codex** (same session): **hold now (option 4); F2 (option 1) if the orchestrator authorises it.** A 400 stub proves handling of a terminal RPC error, not of an offline connection, so either stub revises D2; F2 gives both browsers one ordinary loopback transport before the first node request and keeps its release risk testable (double opt-in, stamps, negative release grep, release-output comparison), while option 2 adds unproven Firefox redirect semantics (Firefox's own `WebRequest.sys.mjs` adds synthetic CORS headers around `redirectTo`, which a raw observer lacks) and competing interceptors. Moving the fee-picker case to the network suite keeps dev PR coverage (both network filters match `apps/extension/**`) but loses Firefox's required gate on `main` and the release's artifact smoke, so it needs an explicit decision. Reset and deletion slowness offline is product work, tracked separately.
- **Opus** (Plan agent, read-only): **option 2, conditional; option 1 (needs a decision) if a Firefox probe fails.** Smoke should prove the wallet, not dRPC's uptime, and the specs that are about being offline (`send-fee-privacy`, `contacts-import`, `import-errors-scroll`, `import-dead-rpc`) keep arming their own refusal, so D2 would read "Testnet is a loopback stub answering HTTP 400 with a JSON-RPC body; refusal is proven by the specs that arm it". An in-browser rewrite needs neither a trusted certificate nor a build-time URL, so D-orch-2 holds. Required work: a Firefox `redirect` mode; one interception owner per origin on both drivers (a spec's arm overrides the launch's and its `stop()` restores it; Firefox's one slot becomes a map); a JSON 400 stub (a non-JSON 400 is retried, `fetch.ts:57-60`); arming after settle, so `lb.drpc.live` stays declared for the requests before it. The fee-picker case is acceptable only split: its node-free steps (Tab stop, ring, Enter/Space open, Escape closes and restores focus) stay in smoke and only the pick moves to a network file on a local node, which narrows that step's Firefox gate on `main` from required to advisory and must be written into the ledger and the PR body. Firefox's CORS on a redirected extension POST is its guess, decided by a probe: a 400 with readable JSON, a POST and no OPTIONS at the stub, no `lb.drpc.live` recorded after arming, no CSP violation.
- **Probe** (local, reverted; `lessons/phase-1.md`): Opus's conditions hold on both browsers. With the guard on and the node redirected to a 400 stub, the six node-bound files plus Firefox's `passkey-toolbar-panel` pass 31/32 on Firefox and 26/27 on Chrome, only the fee-method-picker case failing; the stub saw POSTs with their bodies and no `OPTIONS`, and the guard recorded no `lb.drpc.live` attempt over 35 launches.
- **Codex, after the probe** (same session): **option 2, with a test-only FPC storage fixture for the picker.** The probe settles feasibility; option 2 keeps D-orch-2 and avoids F2's flag, stamp and release checks. Its conditions: a spec's explicit refusal takes precedence over the launch's redirect and keeps counting hits (Firefox's one slot must stop conflicting); D2's revision is recorded precisely; the offline reset delay stays a product defect, not something a stub hides. For the picker: seed both canonical protocol FPC rows (`fpc/service.ts:136-142` returns them without discovery), keep the blanket 400 and every keyboard assertion, and assert that Enter saved the pick. A method-aware stub is rejected: discovery reaches PXE registration.
- **Decision**: option 2 with the FPC fixture (D23 to D25). The panel converged, no build input changes (D-orch-2 holds) and no gate narrows, so no orchestrator call is needed. The fixture passed `send-keyboard` 5/5 on both browsers behind the guard and the stub; with Enter replaced by Escape the saved-pick assertion fails, while the old `data-fee-method` check alone passed that no-op.

### Arc 1, round 2, Codex (gpt-6.1-sol, high, read-only; session `01a124f5-534e-7222-bbe8-93d69f51f545`), 2026-10-10

Verdict: **reject** (the stand-in could go quiet unreported). Run on the alejo-icloud account: the call omitted `env -u CODEX_ACCOUNT`.

| # | Finding | Disposition |
|---|---|---|
| 1 | Medium. While a spec holds the origin the launch reports none of its failures, and a spec that never stops leaves the stand-in suspended with the close passing | Accepted: the launch keeps the spec's failures, and its `failures()` reports a spec interception still unstopped |
| 2 | Medium. A spec's `stop()` can run twice; on Firefox a stale handle removes whichever observer holds the origin | Accepted: the stop runs once, a re-arm happens only when nothing is armed, and each Firefox observer carries its arm's token |
| 3 | Low. The `< 900 ms` assertion in `node-stub.test.ts` depends on timing | Accepted: removed; one request after an awaited rejection already proves no retry |
| 4 | Low. A comment in `firefox.ts` narrates `capabilities` and names its test caller | Accepted: removed |

### Arc 1, round 2, Opus (general-purpose, read-only), 2026-10-10

Verdict: **reject**. No path reaches an outside host; two ways the stand-in can stop answering with nothing failing.

| # | Finding | Disposition |
|---|---|---|
| 1 | Medium. A node request the interception never sees (an unattached target, a swap gap) reaches the guard, matches the declared host and passes; the README claimed the close catches it | Fallback accepted: the README and the declared reason now say what the close catches and that such a request is refused unflagged. Failing on any guard hit after arming was rejected: a request already in flight when the interception arms would race the snapshot and make launches flaky, and the egress guarantee holds either way |
| 2 | Medium. A spec interception never stopped leaves the stand-in off, unreported | Accepted (Codex 1) |
| 3 | Low. A repeated `stop()` re-arms twice; a stale Firefox handle deletes the current owner | Accepted (Codex 2) |
| 4 | Low. Every launch now holds an interception for life, so a reply that fails because its target died (a killed background, a closed offscreen document) fails the launch | Accepted: a reply error on a gone target counts as gone, as an arm or resume error already did; a request whose target died was never sent |
| 5 | Low. The saved-pick check passes for any non-sponsor row | Accepted: the focused row must be the seeded sponsor, and the saved record must name type `fpc` and its id |
| 6 | Low. Equal fake counts hide which arm a hit came from; three branches untested | Accepted: each arm counts differently; cases for a failed spec arm, a second spec, and unreadable node failures |
| 7 | Low. An egress failure hides the node's failures | Accepted: both are reported |
| 8 | Low. `CHROME_ONLY.hangingRequest`'s reason is false now that Firefox redirects | Accepted in part: the reason is reworded in the code, `CLAUDE.md`, `CI.md`, `FIREFOX.md` and the skill; running the spec on Firefox moves CI pins outside this arc and is #272 |
| 9 | Low. An uncommitted inventory hook in `egress-guard.ts` | Already local only; never committed |
| 10 | Gate. No whole-smoke run on the stub build yet | Accepted: the six runs are the phase 1.2 gate, run next |

### Arc 1, round 3, Codex (resumed session), 2026-10-10

Verdict: **reject**, on two races the sequential fixes left open. It confirmed every round-2 fix, ran the Firefox observer scripts in memory to check the token, and accepted the fallback for Opus 1: a blanket check after arming would misread a request in flight before it, and the revised docs state the narrower guarantee. Round 3 is the loop's last; each fix below is proved by a test that fails on the round-2 code.

| # | Finding | Disposition |
|---|---|---|
| 1 | Medium. A re-arm that completes after the launch let go leaves a redirect armed that nothing owns or reports | Accepted: a re-arm that lands once the origin is no longer held, or already re-armed, is stopped at once. A spec's own interception armed after the launch let go stays the spec's to stop |
| 2 | Medium. The override slot is taken only after awaits, so two specs' interceptions on one origin can both arm | Accepted: the slot is reserved before the first await and held through draining, arming, stopping and the re-arm; a second request in that window throws |
| 3 | Low. The picker check accepts any FPC id, not the seeded sponsor's | Accepted: the focused row's id must be the sponsor's seeded id, and the saved pick must name it |

### Arc 1, round 3, Opus check of the race fix (general-purpose, read-only), 2026-10-10

Verdict: **approve**. Both races are closed, and the listed interleavings leave nothing unowned, double-armed or stuck reserved. The two new tests fail on the round-2 code.

| # | Finding | Disposition |
|---|---|---|
| 1 | Low. A count or failures read that rejects (Firefox reads them through a privileged script) skips the stop of the launch's interception, leaving it armed with no owner | Accepted: the read and the stop are a `try`/`finally` |
| 2 | Low. Only admission is pinned; clearing the reservation before the re-arm would pass every test | Accepted: a test asks for a second interception while the first's stop is re-arming |
| 3 | Info. A failed stop of a re-arm nothing holds replaces the spec's original arm error | Accepted: it becomes a failure instead |
| 4 | Info. A read during a spec's stop says "never stopped" | Accepted: it says "not stopped before this read" |

### Arc 1, Opus check of the background-kill fix (general-purpose, read-only), 2026-10-10

Verdict: **approve**. All 16 kill sites go through the exported `stopBackground`; a reload in `migration.test.ts` is followed at once by the close. Requests the successor makes before the re-arm reach the guard, which refuses a declared host: retry latency, no failure.

| # | Finding | Disposition |
|---|---|---|
| 1 | Medium, latent. Chrome's re-arm refuses when no service worker runs yet, and `stopBackground` can return before a successor starts: the launch would fail at close with the node unheld for the rest of the file | Accepted: the re-arm after a kill tells the driver the background may be down; Chrome's auto-attach then holds a later successor until it is armed |
| 2 | Low. A kill while a spec's stop is still re-arming skips that origin, so the re-arm lands during the kill | Rejected: no file uses both `interceptRpc` and `stopBackground`, and a spec awaits its stop before anything else |
| 3 | Info. The refusal and the unstopped-read messages name only a spec, while a kill now takes the origin too | Accepted: both are worded for either holder |
| 4 | Info. Three comments still describe only a spec's suspension, and the kill hazard is Chrome's | Accepted |

## Delivery

One `gh stack`, base `dev`, one PR per arc, each opened only after its arc gate passes and its Codex loop converges.

**Arc 1 ships without a stack (D-orch-1):** its PR is `gh pr create --base dev` from `worktree-chain-endpoints`; the `gh stack` lines below apply to no layer until the orchestrator says otherwise, and arcs 2a-2c branch from `dev` once arc 1 has merged.

| Layer | Branch | Phases | Waits on | PR title (≤ 93 chars) | Closes | code_review |
|---|---|---|---|---|---|---|
| 1 | `worktree-chain-endpoints` (adopted) | 1.1-1.3 | — | `test(e2e): run smoke behind a loopback guard that refuses and records every outside host` | #171 | off |
| 2 | `chain-endpoints-arc-2a` | 2a.1-2a.3 | page 12 | `fix(network): refuse hidden url characters, allow plain http only to localhost` | #200; #79 by comment (2a.3) | off |
| 3 | `chain-endpoints-arc-2b` | 2b | page 12, R3 | `fix(csp): move the viewers' styles into shadow roots, drop unsafe-inline` | #101 (with layer 2's item 14) | off |
| 4 | `chain-endpoints-arc-2c` | 2c | page 12, R2 | `feat(home): show prices unavailable on a funded wallet when the price fetch fails` | #116 | off |
| 5 | `chain-endpoints-close-out` | close-out | every arc delivered | `docs(plans): close chain-endpoints` | — | off |

- Start: `gh stack init --adopt worktree-chain-endpoints --base dev`. Layer 1 carries this plan's commit. It may be submitted and merged before page 12 is signed.
- At most one arc layer is unmerged at a time. A later arc starts only when the orchestrator releases it and the arc below it has merged: `gh stack sync`, then `gh stack add <branch>`. The table's order is the default; if the holds clear out of order (say R2 before R3), the orchestrator may release 2c before 2b, and it still waits for the layer below it to merge.
- R5 holds until arc 2b merges, or until the orchestrator disposes of it in writing: #156 waits for both 2a (`connect-src`) and 2b (`style-src`). 2b's banner-hash test catches a drift; it does not release the reservation.
- Layer 2's PR says `Refs #101`; layer 3's PR says `Closes #101` once item 14 is merged. If P12-03 is struck, layer 3 is dropped and #101 stays open with a comment naming item 15.
- Open each PR without labels. Then add `e2e:extension-smoke` or `e2e:extension-network` only when the path filter would skip a suite the arc needs; a label at creation cancels the run.
- PR body: what changed and why, the validation runs with outcomes, the `Closes` lines. Arc 2 PRs also quote page 12's sign-off for each surface and attach the shots: the hero in both themes (2c); the viewers before and after (2b).

### Issue to arc (for each issue's Pickup section)

| Issue | Arc | Closed by |
|---|---|---|
| #171 | 1 | layer 1's PR |
| #200 | 2a | layer 2's PR, after page 12 (P12-04) |
| #101 | 2a (item 14), 2b (item 15) | layer 3's PR when both items have shipped; stays open with a comment if P12-03 is struck |
| #116 | 2c | layer 4's PR, after page 12 (P12-01) and R2 |
| #79 | 2a (phase 2a.3) | closed by comment once P12-05 is approved; no PR closes it |
| #77 | no arc | stays open: `blocked:external`, waits on unleashed's mainnet bridge |
| #197 | no arc | stays open: `blocked:external` upstream; the close-out comments that the in-repo `GasFees` check belongs to the lane that owns `fee-juice.ts` |

## Post-implementation

This section is self-contained: the implementing session follows it from here.

### Per arc, at each arc boundary (before `gh stack add` opens the next layer)

1. Run the arc gate and paste its result.
2. Codex audit: `env -u CODEX_ACCOUNT ~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`. On a quota or 401 error, retry once with `CODEX_ACCOUNT=alejo-icloud`; if that fails too, log the failed consult and continue on your own judgment within scope. The prompt carries:
   - the arc's diff;
   - this plan and its decision ledger;
   - the arc map ("this is arc N of 1, 2a, 2b, 2c; later arcs build X on it"), so seams kept for a later arc are not flagged;
   - the adversarial ask: what could go wrong, what would an attacker target, what are we trusting that we should not;
   - the two rules below, verbatim.
3. Triage each finding. Verify Codex's factual claims against the repo first; it can misread code. Apply the accepted fixes, commit, and log the round (consult and verdict) in `lessons/phase-N.md`.
4. Resume the same Codex session (`resume-codex.sh "" <followup> <codex-dir> high`) with the fix diff and ask for a re-review under the same rules. Repeat until a round yields no new material findings. Rejected nitpicks do not count. Still material after three rounds: stop and surface it to the orchestrator.

### After every arc is looped

5. Final cross-arc pass: a fresh Codex session over the net diff from the plan baseline, asking for seams between arcs, duplication across arcs and drift from this plan, with the two rules. Same loop, same three-round stop.

**The no-over-engineering rule** (verbatim in every post-implementation Codex prompt): *"Report bugs and small, targeted improvements only. Do not propose speculative abstractions, extra configuration surface, new layers, or rewrites — the smallest change that fixes each real problem. If code works and is clear, leave it alone."*

**The comment-quality rule** (verbatim in every post-implementation Codex prompt): *"Audit the comments for value per character. Flag any comment that narrates what the code visibly does, restates its line, references implementation plans / phases / reviews, or spends a paragraph where a sentence works — and flag places where a non-obvious invariant or constraint deserves a comment it doesn't have. Comments are permanent context every future reader, human or LLM, pays to re-read: they must be few, dense, and exact."*

### Delivery

6. Per the Delivery section. Never open a PR, not even a draft, before its arc's loop converges. `gh stack submit --auto`, then `gh pr edit` each body. Then `gh pr checks --watch`. Commits are signed; afterwards `git log --format='%h %G?' -3` shows no `N` (on a hang, rerun as `env -u SSH_AUTH_SOCK git <cmd>`). Before every push: `bun run test` and `bun run lint:actions`.

### Close-out (the stack's docs-only top layer, after every arc PR exists)

7. Before the close-out commit, merge `origin/dev` into the branch. Read what changed in `implementations-plan/index.md` and `lessons.md`; never a union merge.
8. Write an `## Outcome` block directly after the front matter: date; status; what shipped with PR numbers; what was dropped or did not hold, one disposition line each; an `Open items:` line (#77 and #197 at least, plus any issue left open, such as #101 if P12-03 was struck); and a line retiring the `/goal` and `/loop` seeds below.
9. Promote the generalizable gotchas into `implementations-plan/lessons.md`, one line each, linking the archived detail. Keep it under 8 KiB, deduplicate, retire what a new entry supersedes, and date tool-specific lines.
10. Comment on #197: its in-repo half (a `GasFees` shape check in `predictedWorstMinFees`) is not external and belongs to the lane that owns `fee-juice.ts`.
11. Sample the network suite's egress (Ask A5): arm the guard locally, uncommitted, and run `networks.test.ts` and `default-token-seeding.test.ts` on each browser. If either records an outside host, dedupe (`gh issue list --state all --search "network e2e live host"`), then open an issue.
12. File every open item in its home:

| Situation | Home |
|---|---|
| Work inside the implementation you are on | this `plan.md` and the PR |
| Actionable work that outlives the plan | a GitHub issue with a domain label and a `Record` link to the archived plan |
| Needs a product call, or waits on something outside the repo | an issue labelled `owner-decision` or `blocked:external` |
| A suspected exploitable weakness | a private draft security advisory; the plan records only "tracked privately: GHSA-…" |
| Rejected, superseded or already done | a disposition line in the Outcome block |
| Knowledge that prevents a repeat | `implementations-plan/lessons.md` |
| A legal or store blank with a release deadline | `BEFORE-LAUNCH.md` |
| Accepted code work that blocks launch | the `v1.0.0` milestone, pointed at once from `BEFORE-LAUNCH.md` |

   Dedupe first (`gh issue list --state all --search "<words>"`). An issue body has `## What happens`, `## Where`, `## Impact`, `## Possible fix`, `## Record`.
13. Delete `STATUS.md`. Keep `OWNER-ASKS.md` with its answers (it archives with the plan). `git mv implementations-plan/chain-endpoints implementations-plan/archive/chain-endpoints` in its own commit. Repair the relative links the extra level breaks (`git grep -n 'chain-endpoints'`). Move the index line to `implementations-plan/archive/index.md`. Run `bun run check:plans`.
14. Report and wait. Merging is the orchestrator's call; the merge of the close-out completes the plan.

### Teardown after the merge

15. Once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/chain-endpoints/plan.md` succeeds, run `agent-worktree done chain-endpoints --merged --trunk dev`, without asking. This session was started inside the worktree, so there is nothing to exit. The helper refuses rather than forces: relay a refusal and stop. A `/loop` session checks this on every firing. A `/goal` session arms one background wait after its wrap-up report: `until git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/chain-endpoints/plan.md; do sleep 300; done`.

## Seeds

Recommended: `/goal`. Use exactly one per session; they do not compose. Both are drafts until the orchestrator approves the plan. Arcs 2a, 2b and 2c start only when the orchestrator releases them after page 12 and their reservations.

```
/goal Every phase of the arcs the orchestrator released is marked ✓ in implementations-plan/chain-endpoints/plan.md, each backed by its validation gate reported passing in the transcript; for each phase the transcript prints LESSONS_FILE=implementations-plan/chain-endpoints/lessons/phase-N.md; /code-review was NOT run (code_review is off); the Codex fix loop (env -u CODEX_ACCOUNT run-codex.sh … high read-only gpt-6.1-sol) converged for each released arc at its boundary, each convergence a resumed Codex pass reporting no new material findings, quoted in the transcript; each released arc's PR exists on GitHub, created only after its loop converged (gh stack view in the transcript); only once every arc (1, 2a, 2b, 2c, or the ones the orchestrator dropped in writing) is delivered: the final cross-arc pass converged and the close-out layer archived the plan (git show --stat of the archive-move commit); bun run test and bun run lint both exit 0 in the transcript.
```

```
/loop 15m Drive implementations-plan/chain-endpoints forward. Never idle. Each firing: (1) read plan.md, STATUS.md, OWNER-ASKS.md and lessons/ from the top stack layer; if the plan path is gone, check `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/chain-endpoints/plan.md`: success means merged, so run `agent-worktree done chain-endpoints --merged --trunk dev`, report, clear this loop and stop; failure means delivered, so babysit CI only. (2) Waiting on CI is fine; confirm it progresses. (3) No task in hand: take the next pending step of a released arc; arcs 2a-2c need the signed page 12 and their reservations, and an open OWNER-ASKS item leaves its part as "what ships now" says. Run lint and the touched tests after each edit; commit; gh stack push. (4) A decision you would bring to a person: consult Codex (env -u CODEX_ACCOUNT run-codex.sh … high read-only gpt-6.1-sol) and act on the stronger argument; log it in lessons/. Anything a person would see goes to OWNER-ASKS.md, never decided. Never merge, never push to main, never expand scope. (5) Same step failed five times: stop and reassess with Codex. (6) Phase green per its gate: mark ✓, log lessons, print LESSONS_FILE=…; at an arc boundary run the Codex loop first, then report and wait for the orchestrator to release the next arc. (7) Close out only when every arc is delivered (or dropped in writing by the orchestrator): final cross-arc pass, then the close-out per Post-implementation, then report and stop. Released arcs delivered while others still wait: report and stop.
```
