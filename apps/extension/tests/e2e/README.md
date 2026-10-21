# E2E test suite

Three vitest configs live next to this README:

| Config | Suite | Boots a sandbox? |
|---|---|---|
| `vitest.e2e.config.ts` | Smoke (`tests/e2e/*.test.ts`) | No |
| `vitest.e2e.network.config.ts` | Network (`tests/e2e/network/**`) | Yes — anvil + aztec + playground |
| `vitest.e2e.all.config.ts` | Smoke + network | Yes |

The smoke suite drives the extension UI without an Aztec node and runs from any worktree. The network suite expects a per-run anvil + aztec sandbox + playground; this README focuses on it.

## Running locally

The agent wrapper handles port allocation, the wallet build, and the test invocation in one shot:

```bash
bun run e2e:agent                                    # full network suite
bun run e2e:agent --reporter=verbose                 # extra args go to vitest
bun run e2e:agent tests/e2e/network/transfers.test.ts # filter to one file
bun run e2e:agent --shard=5/5                        # shard 5 of the whole suite (CI's pool: see "CI sharding")
```

Both suites run on Chrome by default and on Firefox with `NULO_E2E_BROWSER=firefox` (`bun run test:e2e` for smoke, `bun run e2e:agent …` for network). One run drives one browser: the agent builds `dist/<browser>`, greps that bundle and loads that extension. Firefox needs `geckodriver` (on `PATH` or at `$GECKODRIVER`) and `bun x puppeteer browsers install firefox`. How it is driven, what behaves differently and the rule for absorbing a difference: [`FIREFOX.md`](./FIREFOX.md).

Internally `scripts/e2e/agent.sh`:

1. Calls `scripts/e2e/resolve-ports.ts` to draw five TCP ports (anvil, aztec, aztec admin, aztec p2p, playground), claim them in the host registry `~/.agents/ports.md` under a run id, and persist them with the run id and a run marker to `.e2e-state/ports.json`. The claim is released when the run ends.
2. Builds the extension for the run's browser with `VITE_LOCAL_NETWORK_RPC_URL=http://localhost:<aztec port>` so the wallet's "Local Network" preset talks to this run's sandbox.
3. Greps the bundle for the URL — fails fast if the vite env didn't propagate.
4. Runs the network suite with `ANVIL_URL` / `ANVIL_PORT` / `AZTEC_NODE_URL` / `AZTEC_PORT` / `AZTEC_ADMIN_PORT` / `AZTEC_P2P_PORT` / `PLAYGROUND_URL` / `PLAYGROUND_PORT` in env.

`global-setup.ts` reads those env vars, spawns anvil + aztec + playground (each with the assigned port and its own launch marker) and writes an ownership lockfile at `.e2e-state/owned.json`. Its `setup` is a short coordinator whose ORDER is the contract — build guard → under the worktree's reconcile lock, `reconcilePriorLock` (refuse a live owner, reuse a healthy pack on a bare run, or reap a stale one by marker) and the provisional lock → the dead-run sweep → `markBootStarted()` (the exit-86 window opens here, AFTER the build/env checks that must never be retried) → on an agent run, a bind test of the claimed pack → `ensureAnvil` → `ensureAztecNode` → `ensureDevServer` (playground) → `finishBoot` (provide URLs, deploy, `markBootReady()`). On a bare run each stage probes first and adopts an already-running service; an agent run adopts nothing. A stage detects a permissive failure and returns `"skip"` (the strict-mode `E2E_REQUIRE_SETUP=1` throws stay inside it), and the coordinator owns the exit (`provideWithoutSandbox` + `return`), so a lost or doubled `provide` is visible in one place. Process handles and the `weStarted*` flags stay module-level, shared with `teardown` and the signal hooks.

### Presto: local vs CI

**Locally** (`bun run e2e:agent`), the wallet's `PrestoProver` (from `@alejoamiras/presto`) probes `https://127.0.0.1:59834/health` — HTTPS only, exactly like production:

- **Presto** (the desktop app) running with its Encrypted Connection set up → native bb proving.
- Nothing, or Presto without HTTPS → silent fallback to in-browser WASM (still works, just slower). The activity card says which (`Proving with Presto ✦` / `Proving in browser…`).

There is no `VITE_NULO_PRESTO_REQUIRED` enforcement locally. This matches production behavior — end users without Presto installed get WASM proving without any error.

**In CI** (`pr-extension-network-e2e.yml`), the prover-ON lanes:

1. Install the headless **`presto-server`** binary (Linux x86_64 release from `alejoamiras/presto`; tarball and extracted binary both SHA-256 pinned, single-member archive).
2. Start it on the runner's `127.0.0.1:59833` (plain HTTP — the headless server has no TLS).
3. Build the wallet with `VITE_NULO_PRESTO_REQUIRED=1` → `chain-runtime.ts` constructs `ProductionPxeFactory` in required-mode: plaintext HTTP derived from the mode, eager preflight, `onPhase` throw on every fallback-class phase.
4. Any test where the wallet would have fallen back to WASM fails loudly with `[presto-required] SDK emitted phase="fallback"` (or the more precise `denied` / `secure-connection-unavailable` / `version-mismatch`).

The terminology gap matters: **Presto** is the desktop app a user installs; **presto-server** is the headless binary CI uses. Same HTTP contract, different surface.

**Caveat for local devs running e2e while Presto is running**: the wallet proves through whatever answers `https://127.0.0.1:59834` — usually the desktop app, which will show its Allow/Deny prompt for the unpacked extension's origin at the first prove (development builds share one extension id via the manifest `key`, so the approval sticks across worktrees). If a test must not touch the native prover, quit the desktop app before `bun run e2e:agent`.

### Proverless mode

`NULO_E2E_PROVERLESS=1 bun run e2e:agent <file>` builds the wallet with `proverEnabled:false` (skips BB-SNARK generation; kernel simulation + on-chain submission stay real — the local node accepts the fake proof). Much faster than real proving, and Presto-independent (it's forced off). The agent arms the double-opt-in flags + asserts the proverless build stamp. Most CI shards run this way.

The proverless build also sets `VITE_NULO_E2E_WALLET_CLOCKS=1` (`src/e2e/wallet-clocks.ts`, read only through `src/e2e/config.ts`): the incoming scanner ticks and a mined row's finality is re-read every 10 s instead of every 30 s and 60 s. `agent.sh` asserts its stamp in that build and its absence in the prover-ON one, which passes `0` and keeps the users' cadence; `_build-extension.yml` refuses the stamp in a release bundle. `INCOMING_SCAN_INTERVAL_MS` (`fixtures/auth.ts`) is the e2e tick, so the install-run assertions that compare against it only tighten on a prover-ON build.

The **default-token seeding** spec (`network/default-token-seeding.test.ts`) needs a seed entry for the sandbox, which mints a fresh token address every run — so no build-time list can name it. `VITE_NULO_E2E_TOKEN_SEEDS` + `VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM` (double opt-in, fail-closed; set by `agent.sh`) swap `TokenSeederDeps.getSeeds()` for a `chrome.storage.session` reader on key `nulo:e2e:token-seeds`, written via `seedSandboxDefaultToken` in `fixtures/token-seeds.ts`. The reader **replaces** the signed list's seeds when its key is present and accepts exactly one `chainId: 0` entry with canonical hex fields, pinning `expectedSymbol` to `"TST"`, `expectedDecimals` to 18 and the placeholder label `displayName` to `"TestToken"` itself — the label is rendered before the chain answers, so storage must not be able to supply it. Any other value, an empty array included, seeds nothing; an absent key lets the list apply. The spec also traces, from inside the popup, that the `token-seed-row` placeholder shows before the `tokens-card` and that `tokens-empty-import-link` never appears in between. Both literals are in the `_build-extension.yml` negative grep, and `agent.sh` + `_extension-smoke-e2e.yml` grep for them positively — an unused export can tree-shake away even in an armed build, which would make the release guard a false negative.

**The signed token list.** Defaults and price ids come from the list `TokenListService` keeps. The same double opt-in arms a second reader, `nulo:e2e:token-list` in `chrome.storage.session` (`{ url, publicKey }`, `http://localhost` only), which replaces `tokens.nulo.sh` and the pinned keys; with no key the armed build fetches nothing. The worker fetches when the Terms are accepted, at boot with them accepted, and on its daily alarm, and a launch's seeded acceptance is a storage write that no listener hears, so no smoke launch holds a list by default, in either run kind, and no profile shows defaults. Three ways to give one a list, all in `fixtures/token-list.ts`:

- **Held** — `launchExtension({ tokenList: "held" })`, or the `listedExtension` / `listedExtensionPerTest` fixtures: before any profile exists, the launch stores a signed envelope and restarts the worker, which loads it at start. A source run signs a fixed two-token Testnet list (`E2E_LIST_TOKENS`), which also flags one Testnet pair no spec holds unless it seeds it (`E2E_LIST_FLAGGED`), with a per-process key and writes the reader's key plus an empty seed list, so the list prices its tokens and seeds nothing, whatever the owner lists. An artifact run stores the published `infra/token-list/public/v1/list.json`, the only list a release build's pinned keys accept, so there its Testnet entries also seed and end `failed` against the stand-in about 75 s later. A spec that prices a row takes the held list's priced token (`readActivityScope(page, { priced: true })`, then `seedUsdQuoteAndReload(page, scope.token.priceId)`) and skips through `skipUnlessListPrices` when the list prices none, which is valid; every other spec names fixture tokens.
- **Served** — `serveTokenList()`, a loopback host on a registry port with the Worker's `_headers`; `token-list.test.ts` points the reader at it, accepts the Terms through onboarding (`createProfileAcceptingTerms`), and brings the refresh forward with the alarm (`requestListRefresh`).
- **Live** — `shipped-token-list.test.ts`, artifact runs only: its launch sends the Testnet node and `tokens.nulo.sh` direct, accepts the Terms through onboarding, verifies the stored list against the release's pinned keys, and requires every bundled-class Testnet entry to land as a stored token with its contract, symbol and decimals.

A spec that measures anything below Home's token list first waits for `tokens-list` to carry `data-settled="true"` with nothing in it loading (`waitForSettledTokens` in `rows.test.ts`).

The **STUB** tests (`cancel-mid-prove`, `concurrent-sendtx-{approve,confirm}`, `lock-cancels-dapp-send`, `auto-lock-defers-while-proving`, `profile-switch-sweeps-transfer`, `failed-send-check`, `in-flight-send-guard`, `inflight-call-background-death`, `same-token-concurrent-sends`, `tx-sendTx-noFrom`) hold the tx at `proving` via a `ProofGate` barrier (`holdProofGate`/`releaseProofGate` in `fixtures/proof-gate.ts`, backed by `chrome.storage.session` key `nulo:e2e:proof-gate`) so the sub-second proverless prove still gives a deterministic window. Real BB proving is guarded by the prover-ON `network-e2e-canary` CI job (`transfers`, `tx-sendTx-default`, `frozen-account-canary`, `passkey-execution-canary`, `delete-after-prove`); see [CI.md § Proverless network e2e](../../../../CI.md). Full design: [`implementations-plan/archive/e2e-proverless-stub/`](../../../../implementations-plan/archive/e2e-proverless-stub/plan.md).

### Sealed roots

The wallet stores contacts, dApp sessions, the operation journal and the transaction history sealed per row, so a raw `chrome.storage.local` read sees envelopes, not records. Contacts and dApp sessions are read through their services' RPCs (`callService`): the active profile's rows, as the wallet reads them. The journal and transaction readers (`fixtures/journal.ts`, `fixtures/journal-page.ts`, `fixtures/send-burst.ts` and the network specs) need more than the active profile while unlocked, so `VITE_NULO_E2E_SEALED_READ=1` (set by `agent.sh` only) builds in `src/e2e/sealed-read.ts`: the background answers `nulo:e2e:sealed-read` from an extension page, for a sealed root, with every row its held keys open, its storage key and its owner, while locked too (`fixtures/sealed-rows.ts`). A row of a profile the background has not unlocked since it started is absent, so a spec that reads after a worker restart unlocks first. A spec that changes a row writes plaintext at the row's natural key and removes the sealed row when it sits at another key (a transaction's), since the dual read prefers the sealed copy. Smoke builds and release artifacts do not carry the seam, and `_build-extension.yml` greps release bundles for its key; the update replay reads history through RPC for that reason.

### CSP violations

Every launch answers for the Content-Security-Policy violations recorded while it ran. `VITE_NULO_E2E_CSP_REPORT=1` (set by `agent.sh` and by the source build in `_extension-smoke-e2e.yml`) builds in `src/e2e/csp-report.ts`: the background and every document listen for `securitypolicyviolation`, the documents forward theirs over `runtime.sendMessage`, and the background alone appends them to `chrome.storage.session` key `nulo:e2e:csp-violations`, which it creates as an empty list when it loads. With `NULO_E2E_CSP_REPORT=1` at run time, `launchExtension`'s `close` flushes the background, reads the list from a scratch page, closes the browser, and then fails the launch on a missing list (a build without the recorder) or on any entry, printing each one's context, directive, blocked origin and source line. A test that reloads the extension calls `ctx.checkCspViolations()` first, since the reload discards the record; `close` then only closes. A close that throws inside a test's `finally` replaces the test's own error: when a red run names only the CSP check, rerun with `NULO_E2E_CSP_REPORT` unset to see what the test itself reported. A local smoke run needs both flags. An artifact run sets neither: a release build refuses the flag, and `_build-extension.yml` greps release bundles for the key.

What it hears, probed on both browsers by raising a violation in each context: the background at startup and in a successor after `stopBackground`, the popup, the onboarding page, the setup page, and the offscreen document (on Firefox, the background page's frame). What it does not: a violation raised while a document parses, before its entry module runs (the built pages load only their own scripts and stylesheets then, and Chrome lets an extension's own resources past its page CSP anyway); one in a dedicated worker a library starts (bb.js, the sqlite OPFS proxy); one a document reports as `close` reads; and a write that failed in a background that then stopped, since its successor confirms the flush without knowing. Those fail only through the functional assertions.

### Egress guard

An e2e run, smoke or network, opens no HTTP, HTTPS or WebSocket connection to a host outside the machine but the ones its launch sends direct: bb.js's CRS hosts on every guarded launch, and the live pair on the live spec's one launch. `global-setup-smoke.ts` and `global-setup.ts` arm the guard on every run (the network sandbox, playground and Presto are loopback). Outside an artifact run (`NULO_E2E_ARTIFACT_RUN=1`) the smoke setup refuses a dist without `NULO_E2E_TOKEN_SEEDS_BUILD_STAMP`, naming the armed build command. Only an artifact run provides `liveLeg`, which lets the live spec's one launch (`launchExtension({ live: true })`) send the Testnet node's host, `LIVE_NODE_HOST`, and the token list's, `LIVE_LIST_HOST`, direct: Chrome bypasses the proxy for those exact names and resolves them, Firefox's PAC answers them `DIRECT`. That launch holds no stand-in, and a guard record for either host fails its close. The exception covers each host on every scheme and port, and it is URL routing for HTTP(S) and WebSocket, not a network boundary. Every guarded launch sends bb.js's CRS hosts, `CRS_HOSTS` (`crs.aztec-cdn.foundation`, then `crs.aztec-labs.com`), direct the same way: an in-browser proof downloads its points there and a fresh profile holds none, so a refusal would fail the proof; a guard record for either fails the close, and the launch keeps its stand-in. The network setup provides no `liveLeg`, so no other host goes direct. On a guarded run each `launchExtension` owns, through `ownGuardedLaunch` in `fixtures/egress-guard.ts`, two loopback listeners whose ports are claimed in `~/.agents/ports.md` (`nulo-e2e-egress-*`) for the launch's life:

- **The guard**, which the browser sends every request for an outside host to: Chrome through `--proxy-server`, `--proxy-bypass-list=<-loopback>;localhost;127.0.0.1;[::1]` (without `<-loopback>`, Chrome sends link-local addresses direct) and resolver rules that resolve no outside name; Firefox through a `data:` PAC with no `DIRECT` after the proxy and `network.proxy.failover_direct: false`. It answers `403`, records the host and port (never a path, so a provider key in a URL is never stored), and keeps one count per `host:port`: Firefox retries each refusal in bursts.
- **The canary**, which only a direct path reaches: `egress-canary.test` resolves to loopback for a direct connection only. Once the launch settles, an extension page requests it over HTTPS (HTTPS because the extension's `connect-src` allows plain HTTP only to `localhost` and `127.0.0.1`); the guard must record it and the canary must count nothing, or the launch fails before any test runs.
- **The stand-in node** (`fixtures/node-stub.ts`), armed in every launch but the live spec's once the canary has proven the routing: the browser's interception (`holdRpcInterception`) sends every request for the Testnet node's origin to a third loopback listener, which answers HTTP 400 with a JSON-RPC error. The node client stops at a 4xx with a readable body; refused, it retries each call for about six seconds, and smoke's resets, profile deletions, settings pages and passkey imports ran out their waits on it. A spec that arms its own `interceptRpc` on that origin, to prove the offline case (`send-fee-privacy`, `contacts-import`), replaces the stand-in until its `stop()`. `stopBackground` also lets go of it for the kill and re-arms it after, as `waitForExtensionRestart` does for an extension restart: on Chrome, a DevTools session attached to the stopping service worker keeps its host for the successor, which then never starts clean (`sw-resilience`'s lock and liveness waits time out). Chrome's interception attaches every target but a page, because detaching a page's DevTools session clears its WebAuthn virtual authenticators, which a passkey spec's anchor popup keeps across that kill.

`close` reads the stand-in's interception failures, runs the CSP check, closes the browser, stops the listeners and then fails the launch, naming the file, on a canary connection, on any host that no list declares, on an arm or reply the stand-in's interception failed or a spec's interception left unstopped, or on a node request that reached the guard while the stand-in held its origin. From the stand-in's arm until `close` begins, the guard counts each request for the node's host that arrives while the launch's interception holds the origin: no armed interception paused it, so a target the interception does not cover dialed the node, and the spec ran against a refused node instead of the stand-in. Before the arm, during a `stopBackground` or an extension restart, and while a spec's own interception has the origin, a node request is refused and passes. The count follows the harness's record of the hold, not the browser's: a request issued just before an arm took effect can still be counted, and a missed one that lands just after a release or the close began goes uncounted. Neither edge has a tolerance. `tests/e2e/egress-guard.test.ts`, in both the smoke and the network selection and failing on a run whose setup did not arm the guard, proves the routing on each browser: from the background (HTTPS refused, loopback direct, the Testnet node answered by the stand-in's 400) and from an ordinary page the spec serves on loopback (plain HTTP and WebSocket refused, IPv6 loopback direct, link-local refused), then stops the guard and shows that neither falls back to a direct path. Its second launch proves the held count: a page's node request fails that launch's close on Chrome, whose interception attaches no page, and gets the stand-in's 400 on Firefox, whose observer sees every channel.

What an e2e build does instead of each outside host:

| Host | Tried by | With the guard |
|---|---|---|
| `lb.drpc.live` | the background's node-status read at popup start; the offscreen PXE on Home | answered by the stand-in node's 400 once the launch settles; refused at the guard before that, during a kill or under a spec's own interception, and a close failure at any other time before the close begins; direct in the live spec's launch; a spec that needs a node-read value seeds it (the fee picker's sponsors: `helpers/fpc-seeds.ts`) |
| `api.coingecko.com` | the price fetch | refused; a spec that needs a quote seeds one into storage |
| the browser's own hosts | Chrome's updater and sign-in services, Firefox's remote settings | refused; listed per driver, so not a failure |
| `crs.aztec-cdn.foundation`, `crs.aztec-labs.com` | bb.js's CRS download for a proof in the browser (a prover-ON network run without Presto) | direct on every guarded launch |
| loopback (`localhost`, `127.0.0.1`, `[::1]`) | the Presto probe, a spec's own server, the network sandbox and playground | direct |

**When a launch fails with "egress guard"**, the message names each host no list declares, or what else failed:

- A host the wallet or a spec now tries: add it to `DECLARED_REFUSALS` in `fixtures/egress-guard.ts` with one line of why, in the change that adds the call.
- A host the browser reaches on its own: first look for a flag or pref that stops it at its source; failing that, add the exact name to that driver's `ownHosts` (`CHROME_OWN_HOSTS` in `fixtures/browser/chrome.ts`, `FIREFOX_OWN_HOSTS` in `fixtures/browser/firefox.ts`) with why. Never a domain suffix: a wallet dependency that calls a new host under a vendor's domain must stay red.
- `sent lb.drpc.live:443 to the guard N time(s) while the launch's stand-in held its origin`: a target the interception does not cover dialed the node. On Chrome, rerun the file with `NULO_E2E_INTERCEPT_LOG=1`, which logs the targets each arm attached and each request it redirected: a caller missing from every arm's attach lines is the miss. Firefox's observer has no target to miss; there, read the file's `stopBackground` and `interceptRpc` calls. Never declare the host or loosen the check. A small count in a file that kills the background or swaps the interception can also be a request issued just before an arm took effect; nothing records which, so it stays unresolved, never a pass.
- `the canary request went direct` or `never reached the guard`: the browser's routing changed (a flag, a pref, a browser bump); the launch proved nothing, so fix the routing, never the check.

Not covered: UDP and WebRTC, which the wallet does not use. The stand-in answers every node call with an error, so no smoke spec but the live one sees a node that answers: a value only a node gives is seeded, or proven in the network suite. A host on a driver's `ownHosts` that the wallet starts calling is refused but does not fail the run; reviewing a new list entry is what catches that.

### Store captures (opt-in)

`tests/e2e/network/store-captures.test.ts` is skipped unless `STORE_CAPTURES=1`, and always on
Firefox. It stages a wallet on the sandbox through the UI (a "Testnet"-named network, USD Coin and
Fee Juice, a contact, two receipts and a private send) and writes the popup captures
`scripts/store-art.ts` frames for the store listings into `store/captures/`: `home`, `send`,
`history`, `security` and `approve`, at 360×600 and 2× (720×1200 PNGs). Proverless is enough, since
no frame shows a proof:

```bash
STORE_CAPTURES=1 NULO_E2E_PROVERLESS=1 bun run e2e:agent tests/e2e/network/store-captures.test.ts
cd apps/extension && bun scripts/store-art.ts
```

### In-place update (opt-in)

`tests/e2e/network/update-in-place.test.ts` and `tests/e2e/update-replay.test.ts` are skipped
unless `NULO_E2E_UPDATE_FROM` names a release tag, with `NULO_E2E_UPDATE_TO` the candidate. They
install the release's zip at one fixed path in the run's own `.e2e-state/update-<pid>/`, swap the
candidate into that path and reinstall it in the running browser, as a store update does: Chrome
through CDP `Extensions.loadUnpacked`, Firefox through the driver's temporary install. A probe the
staged candidate imports first must record `onInstalled` reporting `update` from the release's
version. The zip is downloaded once with `gh release download` into `.e2e-state/releases/` (or
`NULO_E2E_RELEASE_CACHE`) and refused unless its SHA-256 equals the digest
`fixtures/update/release.ts` pins for the tag; the release's own `SHASUMS256.txt` must agree. The
candidate names the commit it was built from: a candidate from another commit, or a checkout with
uncommitted changes a build reads, is refused, so commit before you build it.

- The live scenario populates the release through its own UI: a password profile with a second and
  an imported account and two contacts on Testnet, then a network on the run's sandbox with a
  token, a public and a private receipt, a connected playground and one send from the wallet. It
  requires every key family `HELD` names before it updates. After the update it checks that no key
  was lost, no barrier shows, every key is registered and read by its read code, the profile
  unlocks, the UI reads it all, the imported key opens and the playground's stored session still
  answers. `NULO_E2E_UPDATE_RECORD=1` on Chrome also writes the release's storage to
  `fixtures/update/<tag>.storage.json`, the replay's recording.
- The replay writes that recording into the release, offline, and updates it. While the
  candidate's Testnet seed equals the recorded one the update opens with no takeover; once it
  differs, the takeover's reset must carry every account to the new chain. Its second case moves
  the recorded Testnet rows off the seed, so the reset over release rows runs before that happens.
  The recording's dApp session expires 7 days after it was made, and the replay refuses it from
  then on: record again from a checkout on the release's Aztec line.
- The live scenario needs a sandbox on the release's Aztec line, so once `dev` moves off it only
  the replay runs.

```bash
bash apps/extension/scripts/e2e/build-update-candidate.sh chrome   # writes .e2e-state/update-candidate/chrome
NULO_E2E_RETRY=0 NULO_E2E_UPDATE_FROM=v0.31.0 NULO_E2E_UPDATE_TO=$PWD/apps/extension/.e2e-state/update-candidate/chrome \
  NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/update-in-place.test.ts
cd apps/extension && NULO_E2E_ARTIFACT_RUN=1 NULO_E2E_UPDATE_FROM=v0.31.0 \
  NULO_E2E_UPDATE_TO=$PWD/.e2e-state/update-candidate/chrome bun run test:e2e -- tests/e2e/update-replay.test.ts --retry=0
```

On Firefox, set `NULO_E2E_BROWSER=firefox` and pass the firefox candidate. The candidate script
builds into `dist/<browser>` before copying it out, so rebuild the armed smoke build before a
source smoke run.

## Running multiple agents in parallel

Open one terminal per worktree and run `bun run e2e:agent` in each. Each run claims its own ports in the host registry and owns its own anvil + aztec + playground:

```bash
# terminal 1 — worktree A
bun run e2e:agent

# terminal 2 — worktree B
bun run e2e:agent
```

What keeps them apart:

- **Ports.** `resolve-ports.ts` skips every port `~/.agents/ports.md` lists and claims its pack there (`nulo-e2e-<service>` rows, owner `agent.sh`'s pid) under the file's lock, which other tools on the host share (`tests/e2e/port-registry.ts` states the contract). `cat ~/.agents/ports.md` shows who holds what. Under a run id, setup bind-tests the pack after `markBootStarted()` and never adopts a listener on it. Every readiness wait fails once the child it spawned exits, even with a probe still pending, and on Linux accepts an answer only from a socket a process carrying the service's marker holds, so a stranger on a claimed port is a boot failure (exit 86), not a sandbox.
- **Processes.** Each service carries a launch marker and its owner in its environment, and every process of an agent run (forks, Firefox, geckodriver) inherits the run's marker, owner and worktree (`tests/e2e/owned-processes.ts`). Chrome inherits them too but overwrites its environ region with its process title, in the browser and every child, so no Chrome ever shows a marker: Chromes are found by the extension path on their command line instead. Teardown stops a service's group, then every process with its marker, a leaderless group's included. An orphan sweep stops a process only when the owner named in its own environment is dead, so a run never signals another's processes, whatever a lock or record on disk says.
- **Data.** The node's run dir sits on real disk under `~/.cache/nulo-e2e`, stamped with its marker, and is deleted only directly under that root.

A run killed with `kill -9` leaves its sandbox and browsers running: `bun run e2e:reap` in that worktree stops them by marker once the run's owner is gone, removes its run dir and drops its registry rows. The next run in the worktree does the same at setup.

### Verified concurrent run

Two worktrees of one branch, started 4 s apart, each running `networks`, `connect-deny` and `sim-methods` on Chrome at retry 0:

| Worktree | Port pack (anvil, aztec, admin, p2p, pg) | Token contract deployed | Result |
|---|---|---|---|
| worktree A | `21158, 31227, 31616, 26260, 13424` | `0x125a8b9b6fdeb6be…` | 8/8 |
| worktree B | `15368, 30475, 20912, 13758, 15914` | `0x05e5d43a988b2340…` | 8/8 |

Both packs were listed in `~/.agents/ports.md` under their run ids for the whole run and released at its end. Killing worktree B's `agent.sh` and vitest with `kill -9` mid-run left worktree A green; `bun run e2e:reap` in B then stopped B's orphaned sandbox and dropped its rows, leaving no process with B's markers.

## Single-worktree fast iteration

If you `bun run vitest run --config vitest.e2e.network.config.ts` directly with stable env vars (e.g. `AZTEC_PORT=8080` etc.), `global-setup.ts` will reuse a still-healthy sandbox from the previous run instead of cold-starting:

- the lockfile must exist
- the recorded ports + baked URL must match the current env
- the recorded PIDs must still be alive
- the candidate sandbox must report the same L1 contract addresses recorded post-deploy (proves we're talking to *our* sandbox, not a stranger that drifted onto the same port)

If any check fails, setup reaps the stale children by marker and cold-starts a fresh stack. A reuse rewrites the lock's owner to the reusing run, so no reap touches the sandbox while that run lives. A bare run also adopts any service already answering on its ports (an anvil on chain 31337 is trusted to run with `--slots-in-an-epoch 1`). `bun run e2e:agent` always allocates fresh ports and never reuses or adopts — the lockfile only serves orphan cleanup there.

## CI sharding (5-way matrix)

CI runs the network suite as a **5-shard GitHub Actions matrix** beside its dedicated jobs, all in one reusable lane (`.github/workflows/_extension-network-e2e-lane.yml`) that both PR lanes, the nightly and release's opt-in run call. Each shard:

- Is its own ubuntu-latest VM — own anvil, own aztec node, own playground vite, own Chrome
- Gets about a fifth of the shard pool's recorded time: `--shard=N/M` takes the files the timings record assigns that shard (see **Shard timings** below). The pool is every network test file but the twelve with a dedicated job (`fee-methods`, `selfpay-phase`, `concurrent-sendtx-confirm`, `same-token-concurrent-sends`, `snack-placement`, `failed-send-check`, `transfers`, `tx-sendTx-default`, `frozen-account-canary`, `passkey-execution-canary`, `delete-after-prove`, `send-chaos`): some of them skip themselves unless an env flag arms them (the `_probe-*` file and `store-captures` among them). `scripts/ci-cd/behavior-gating.test.ts` pins the pool's exclusions to the dedicated jobs' files
- Runs in parallel with the other 4 shards

**Wall time**: ~10–20 min per shard (vs ~35–45 min unsharded). CPU minutes: ~25% more than serial (each shard pays the ~30s anvil+aztec boot cost), but the wall-time win is dramatic.

**Why N=5**: N=4 once put `tx-sendTx-multicall` and `multi-account-from` on one shard under WASM proving and blew its timeout. Shards now split by recorded time, so the count only trades wall-clock against runner minutes, on both browsers at once: one matrix serves both.

**Dedicated heavy jobs**: a few files run OUTSIDE the shard pool on their own runner (`test_files` on a dedicated job, mirrored in the pool's `exclude_files` — `scripts/ci-cd/behavior-gating.test.ts` pins the two lists equal): `fee-methods` + `selfpay-phase` (`Run / heavy / fee-methods + selfpay-phase`), `concurrent-sendtx-confirm` + `same-token-concurrent-sends` (`Run / heavy / concurrent-confirm`), `snack-placement` + `failed-send-check` (`Run / heavy / snack-placement + failed-send-check`: two long files kept out for wall time alone, since folded into the five shards they made the lane end later on both browsers in one measured pair per browser ([#972](https://github.com/nulo-sh/nulo/issues/972))), and the five prover-ON canary files (`Run / canary / real-proving`). `selfpay-phase` is the wallet's setup-phase / account-identity gate: `Token.mint_to_private` (the bridge hub claim's inner call — a private call enqueueing a non-allow-listed public finalisation) simulated and sent as each of two granted accounts, never-sent and deployed, self-paid from public Fee Juice and via the PrivateFPC (fuel, then credit), with the node's tx validation ON, plus a negative control that must draw the node's `Setup function not on allow list`. Its cheap sibling `sim-from-selfpay` (one self-paid simulate as the second granted account) stays in the shard pool. Both run at `retry: "0"`; both are driven through the playground's `Simulation` and `Self-pay phase` sections, whose simulate results are projected by `apps/playground/src/lib/simulation-summary.ts` (fee payer, private frames, public calls per phase) because the raw kernel output is not feed-readable.

**Failing shard logs**: each shard uploads its own artifact (`network-e2e-logs-<N>-of-5`) containing `.e2e-state`, `aztec-*.log`, `anvil-*.log`, `presto-server.log`, `presto-health.json` on failure.

**Reproducing a CI shard locally**: `--shard=N/5` on `e2e:agent` splits the whole suite:

```bash
bun run e2e:agent --shard=5/5                                  # shard 5 of the whole suite, not of CI's pool
```

It runs the files CI's shard 5 ran only with the same browser (`NULO_E2E_BROWSER`) and the pool's exclusions (an `--exclude` for each file of the lane's `exclude_files`): without them the file set differs, and so does the split. To chase a shard-specific failure (e.g. "register-token only fails on shard 1"), run the files that shard's log lists. Each invocation still starts its own anvil + aztec + playground; running multiple shards in parallel needs multiple worktrees (see "Running multiple agents in parallel" above).

**Slow-prove tests**: `tx-sendTx-default` and `multi-account-from` run on CI even though the WASM kernel-prove tail can exceed puppeteer's 300s `protocolTimeout` on slow runners: those tests and the `tx-sendTx-{feePayer,sponsoredFpc}` siblings assert that the wallet's journal reached real work via `waitForDappExecuteWorked()` (`fixtures/journal.ts`). `tx-sendTx-multicall` and `tx-sendTx-noFrom` run proverless and wait for the outcome itself: the dApp's sendTx result, a `succeeded` record and a mined receipt. See `implementations-plan/archive/journal-stage-restructure/`.

**Smoke shards**: both PR smoke lanes (`pr-extension-smoke-e2e*.yml`) run the smoke suite as a 3-shard matrix, split by the same timings record, because a whole Firefox run neared its 30-minute job limit. `bun run test:e2e --shard=2/3` reproduces one shard; a failing shard's logs upload as `smoke-e2e-logs[-firefox]-<N>-of-3`. The nightly and release smokes of the built zips stay unsharded.

**Shard timings**: on the smoke and network configs, `--shard=i/n` splits by [`shard-timings.json`](shard-timings.json), each file's median time over recent green PR runs, per suite and browser. [`shard-sequencer.ts`](shard-sequencer.ts) places files longest first, each onto the lightest shard, in place of vitest's split by path hash. A new file needs nothing: a file the record lacks lands on the lightest shard, and a deleted one is ignored, so a stale record costs balance, never coverage. `scripts/e2e/shard-sequencer.test.ts` pins that every selected file lands in exactly one shard. Regenerate the record with `bun scripts/ci-cd/e2e-timings.ts` (it needs a `gh` login and reads the four PR lanes' job logs) when a PR run's shards end more than 2 minutes apart, after adding or removing a file over a minute long, or after an Aztec, browser or harness change. Every shard of a run must read the same commit: a manual dispatch checks out the branch, so do not push while one runs.

**Known limitation: cold-shard rotation.** Each shard starts with a fresh anvil + aztec + playground + Chrome + extension. The FIRST capability-popup-driven test in shard 1 (whichever file runs first there) pays a cold-SW penalty — `chrome.windows.create` + bb.js init + PXE warmup can push that test past its budget. Quarantining the offender just exposes the next file as the new "first" victim. The structural fix is a fixture-level warm-up tap or pre-grant-capability fixture, which is not built yet. Single-shard re-runs (or local repro via `--shard=N/5`) usually pass green once the SW is warm; `extension-network-e2e-status` is a required check on `dev` and `main`, so a cold-shard red is re-run, never neutralized.

## Troubleshooting

**`FATAL: built bundle does not contain http://localhost:<port>`** — vite didn't substitute `import.meta.env.VITE_LOCAL_NETWORK_RPC_URL`. Confirm `vite.config.ts` exposes the `VITE_*` env (this is on by default; the build wrapper passes the env via `VITE_LOCAL_NETWORK_RPC_URL=... bun run build:chrome`).

**`Timed out waiting for anvil at …`** — the bundled anvil binary failed to bind. Check `lsof -ti:<anvil port>` for an unrelated process. Re-run `bun run e2e:agent` to allocate a fresh port.

**`prior sandbox identity mismatch — tearing down and starting fresh`** — a previous run's sandbox died and a foreign process took over its port. Setup detects this via the L1-contract-address check and recovers automatically.

**`another run in this worktree holds the sandbox`** — `owned.json` names a live owner: two runs in one worktree. Wait for it to finish.

**`another run in this worktree is reconciling its sandbox`** — `.e2e-state/reconcile.lock` names a live process. Setup, and `e2e:reap`, hold it while they read `owned.json`, reap or adopt what it names and write their own owner into it, so two of them cannot act on the same dead owner. A dead holder's lock is broken on its own, by one waiter only (it holds `reconcile.lock.break-<hash>` while it does); delete the lock and any break file beside it only if no run or reap is in progress.

**`the prior run's sandbox could not be reaped: …`** — a service of the previous run did not stop (`retained`), could not be read (`unknown`), or the lock names no owner (written before markers, or on a host without `/proc`) and records live pids. Those pids may since belong to unrelated processes: stop them only if they are this worktree's sandbox, else delete `.e2e-state/owned.json`. Otherwise run `bun run e2e:reap` once the owner is gone.

**`<what>: answered by a listener this run did not start`** — on Linux, the socket listening on a service's port is not held by a process carrying that service's marker: something bound the port before the service did. A boot failure (exit 86), retried on fresh ports.

**`<service>'s claimed port <n> is already in use`** — something listens on a port this run just claimed. The run fails as a boot failure (exit 86) and CI retries on fresh ports.

**`~/.agents/ports.md.lock stayed held`** — another registry writer holds the lock, or one died holding it. The other writers break a lock older than 15 s; this client never does. If no writer is running, delete the lock.

**`[stall-watchdog] no progress for 600.0 s`** — no file, test, hook or console event for `STALL_MS` (`tests/e2e/run-limits.ts`). `.e2e-state/stalled` names the running tests (only the file when the fork's event loop is blocked); the run is cancelled and fails, its forks are killed 30 s later, and teardown stops the sandbox. A test that legitimately waits that long without logging needs a progress line. Every run's last lines print its longest silence, the figure `STALL_MS` is set from.

**`this fork's V8 heap limit is … MiB, not the 2048 MiB cap`** — the network config's `execArgv` (`--max-old-space-size=FORK_HEAP_MIB`) did not reach the fork, or V8 sized the young generation differently: check a vitest or Node bump.

**Manual cleanup of stale state.** `bun run e2e:reap` in the worktree. It stops processes carrying this worktree's markers whose owner is dead and, while no run of this worktree is live, the Chromes loading this worktree's build (Chrome shows no environment, so its exact `--load-extension` path stands in). Never a process by name, which on a shared host would take down another agent's run.

## Terms-acceptance state

`launchExtension({ legal })` seeds the device-local acceptance record, built by `@nulo/legal`'s own
`applyAcceptance`: `current` (default on a fresh profile), `missing`, `stale`, `corrupt`, or `keep`
(default on a reused `userDataDir`, so a relaunch keeps what the last launch left).
`openOnboarding(ctx, { legal: "missing" })` gives the gate's specs a real fresh install, and
`reloadWithLegalState(page, seed)` flips a running wallet. The scenarios live in
`legal-acceptance.test.ts` (S1–S11) and `network/legal-acceptance-wall.test.ts` (N1).

## Fixture layout

Specs import from two entries: `fixtures/extension.ts` (the launch, the Vitest fixtures, `registerProfile`, `connectPlayground`) and `fixtures/helpers.ts` (the feature helpers). Each re-exports modules that own one concern:

- `fixtures/dom.ts`, a leaf over Puppeteer and `fixtures/browser`: `patchPagePolling`, the clicks, `replaceInputValue`, `waitForHash`, the name-field waits, `withTimeoutMessage`.
- `fixtures/wallet-pages.ts`: `openPopup`, `openOnboarding`, `recordPageErrors`, `waitForServiceReady`, `seedLegalAcceptance`.
- Behind `helpers.ts`: `accounts`, `address-book`, `auth`, `navigation`, `networks`, `profiles`, `session`, `settings`, `tokens` (balance rows included), `transfers` (fee methods included), `widgets` (dropdowns, toasts, popup chains).

The import graph under `tests/e2e/` has no cycle, and `bun run lint` (CI's lint job runs it) keeps it so: its `biome lint --only=suspicious/noImportCycles` step fails on any edge that closes one. A module the hub reaches imports what it calls from the module that owns it, never `extension.ts` or `helpers.ts`, and takes `ExtensionContext` through `import type` (Biome counts `import { type X }` as an edge). The rule lives in that script, not in `biome.json`: on Biome 2.5.13 it needs a whole-project scan, which an override cannot turn on and a root setting would add to every Biome call (about 3 s on each pre-commit). So the pre-commit hook and the editor do not report a cycle; `bun run lint` does.

## Helper conventions (CDP regression workarounds)

A Puppeteer/Chrome interaction layer regressed somewhere between sandbox ABI versions; e2e helpers in `fixtures/dom.ts` and the feature modules behind `fixtures/helpers.ts` work around it. **Do not bypass these helpers** — calling raw `page.click()` / `handle.click()` / `page.waitForFunction()` directly will reintroduce flakes that look like timeouts but are actually CDP / rAF-throttling issues.

| Helper | Use it instead of | Why |
|---|---|---|
| `clickByTestId(page, id)` / `clickSelector(page, sel, { timeout?, pressAriaDisabled? })` | `(await page.waitForSelector(...))!.click()` and `handle.click()` | The CDP element-handle click hangs with `Runtime.callFunctionOn timed out`. Synthetic in-page click via `page.evaluate(() => el.click())` bypasses the broken protocol path. Both run one driver (`fixtures/dom.ts`): it waits for the last visible match that is neither `disabled` nor `aria-disabled`, since an in-page click would pass the `pointer-events: none` that stops a person's. `pressAriaDisabled` is for a control that explains itself when pressed while `aria-disabled` (the contacts import row's target, `pressRow`). |
| `openDropdown(page, triggerTestId)` | `querySelector(trigger)?.click()`, or clicking the trigger again when the menu does not show | A click on a trigger not mounted yet does nothing, and `DropdownRoot` toggles on every click, so a second one closes an open menu. The helper waits for the trigger, clicks it only while its `data-dropdown-open` reads closed, then waits for it to read open, naming the page's state on a timeout. |
| `typeIntoInput` / `replaceInputValue` | `handle.type(text)` | Same CDP path, same hang. The helper sets `value` via the prototype setter and dispatches `input` events. |
| `patchPagePolling(page)` (auto-applied by `launchExtension`, `openPopup`, `openPlayground`, `waitForPopup`) | manually configuring polling on every `page.waitForFunction` call | Default `'raf'` polling is throttled in offscreen / unfocused tabs. Patch defaults to `polling: 200`. `waitForSelector` (CSS-only) is rerouted through the patched `waitForFunction` for the same reason; prefixed selectors (`text/`, `xpath/`, `aria/`, `pierce/`) are left alone. |
| `pointerClick(page, testid, { last? })` (`helpers/legal-drivers.ts`) | `clickByTestId` when the assertion is "nothing covers this control" | An in-page click reaches a covered element. This one hit-tests the control's centre, fails naming whatever sits on top, then clicks through `page.mouse` (`Input.dispatchMouseEvent`, not the hanging element-handle path). `last` picks the last match — the control of the popup on top of a stack. |
| `coveredAt` / `activeTestId` / `waitForFocus` / `tabAround(page, n)` (`helpers/pointer-probes.ts`) | reasoning about z-index or `offsetParent`; reading focus right after a close | What the pointer would hit at a control's centre, where focus is, where it lands (a released trap hands focus back on a timer — wait, never read), and where `n` Tabs take it — the browser facts behind "this popup covers that one" and "the trap holds". |
| `closeStuckPopup(page)` | waiting for the popup to unmount after a confirm/submit | Vue `<Transition>` sticks mid-enter / mid-leave under headless Chrome rAF throttling — `sheet-enter-from + sheet-enter-active` never advances. Helper force-removes the `#popup` teleport children + dim backdrop AFTER asserting the actual post-mutation signal (row appeared, contact deleted, etc.). |
| `settleClosedPopup(page, innerTestId)` (`fixtures/popup-leave.ts`) | `closeStuckPopup` when another popup must stay open beneath | The scoped form: waits for the closed popup's DOM to leave or for its leave to have begun, then finishes only that one by hand. Returns whether it had to. |
| `withTimeoutMessage(wait, message)` | `.catch(() => { throw new Error("...") })` around a wait | A bare catch relabels frame detaches, CDP disconnects and page crashes as "the state never settled", burying a real fault under a plausible-looking flake. This converts `TimeoutError` only, rethrows everything else untouched, and keeps the original as `cause`. Pass a function when the message has to read live page state — prefer that form, so the failure says what WAS observed. |
| `pollUntil(probe, done, { label, timeoutMs, intervalMs, show?, between? })` (`fixtures/poll.ts`) | a hand-rolled `Date.now()` deadline loop | One timeout contract: the probe runs at once and then every `intervalMs`; a probe's throw (a terminal failure) ends the wait at once; a value still refused when the budget is spent throws `PollTimeoutError` naming the label, the budget and the last value. Work that moves the state on (a block, a key, a refresh) goes in `between`, never in the probe, so it never starts past the deadline. A caller whose contract is the last state or best effort catches `PollTimeoutError` itself; phases sharing one deadline pass the remaining budget. |

Feature helpers, exported through `fixtures/helpers.ts` (all `data-testid`-driven; reuse them rather than re-deriving the click sequence):

| Helper | Does |
|---|---|
| `clickNavTab(page, "general" \| "holdings" \| "activity" \| "settings")` / `openHoldings(page)` | Bottom-nav navigation, waits for the route hash. |
| `navigateToTokenDetail(page, symbol?)` | Opens a token page from its Home card (`symbol` picks the card when more than one token is listed). |
| `importToken(page, contract)` + `captureBalanceBaseline` / `waitForFreshBalanceRow` | Imports a token and waits for its projected balance row — pair them for every import so assertions never race the projector. |
| `selectSendToken(page, symbol)` | On the Send page, picks a token in the picker and waits for the trigger to show it. |
| `pinFromTokenPage(page)` / `readPinState(page)` | Token page "⋯" menu: toggle Pin to Home; read the item's `data-pinned`. |
| `deployExtraTokensForAccount(config, account, [{ symbol, amount }])` (`fixtures/aztec.ts`) | Deploys and mints extra sandbox tokens for multi-token scenarios. |
| `readPublicTokenBalance` / `readPublicFeeJuice(wallet, from, …)` (`fixtures/aztec.ts`) | Chain-side balance reads through the script wallet — the postcondition for "executed as account X" (the token moved from X, nobody else's balances moved), since receipts carry no sender. |
| `finalizeThrough(node, block)` (`fixtures/aztec.ts`) | Mines empty L1 blocks on the run's anvil until the node's finalized block reaches `block`: the local anvil mines only on a transaction, so a quiet chain's finalized tip stands still. The wallet's worker then reads a mined row final at its next finality read (the first one interval after the mined commit: 10 s on the proverless build, a minute on the prover-ON one) and refreshes the account's balances again. |
| `grantCapBundle(ctx, page, bundle, pick)` + `approveCapabilities(popup, { accounts })` | Drives the capability popup. On a repeat `accounts` request for a session that already holds accounts, held rows render `data-granted="true"`, pre-selected and locked (a click is ignored); `approveCapabilities` only clicks rows that are not yet selected, so pass the NEW addresses. |
| `requestPgBundle(page, bundle, { tokenAddress })` + `readCapabilitySwitch(popup, rowKey)` / `approveCapabilities(popup, { switches })` / `setConnectedAppAuthorizations(page, host, on)` (`fixtures/playground.ts`, `fixtures/popups.ts`) | The consent switches. A scoped bundle names the contract in `tokenAddress` (without one it carries `"0x0"`, which the wallet refuses). A new card's switch is found by its `data-cap-row` (`authorizations`, `address-book`, `private-events`, `unknown`); an "Already granted" card has none. The Settings helper finds the app by the host its session was made on, then reopens the page to prove the stored state. `readStoredCapability(ctx, origin, type)` (`fixtures/dappSession.ts`) reads what the grant stored. |
| `lockWallet(page)` / `lockThroughConfirmDialog(page)` / `waitForLockScreen(page)` | Lock from the header. `lockWallet` expects no approved send running; with one running the button asks first, and `lockThroughConfirmDialog` confirms that dialog and returns its copy. Both wait for the session record to go, then for `/popup/auth`. |
| `createAndActivateProfile(page, name, password)` | Creates a profile from the lock screen's picker, which activates it; asserts the field opened prefilled `Profile N` before typing `name`; returns its id. |
| `waitForNameField` / `expectNoNameField` / `expectNameFieldPrefill` (`fixtures/dom.ts`) + `readProfileNames` | The Profile-name rule on the four profile-creating pages (root testids `onboarding-create-page`, `onboarding-import-page`, `register-page`, `import-page`, state in `data-name-field`): a first profile has no field and is named "Main"; a later one shows it prefilled `Profile N`. Wait for the state before typing: the field renders only once the profile list is read. `importSeed(…, { profileName })` types a name only when given and fails when given one on a first profile. |
| `readSessionRow` / `waitForSessionRow` / `peekSession` / `setSessionTtlMs(page, ms)` | Session state without navigating (a navigation refreshes the session): the persisted row's `profile`/`since`/`lockedAt`, the profile service's own expiry check, and a millisecond auto-lock TTL through the config service. |
| `readSendRecords` / `waitForSendRecord(page, match)` (`fixtures/journal.ts`) | Every profile's `transfer` and `dapp_execute` journal records with their stage and `enteredProveAt` — the anchor for proof-gate timing. |
| `sendTransfer(page, { …, expect })` + `fillSendForm(page, { amount, destination })` | Drives a whole send. `expect` (`"send"` \| `"review"`) is the caller's claim about the footer: a send the fee card gates (the account's own Fee Juice under a private origin) goes through the review sheet, anything else at once — the other offer throws. Every call site states it. |
| `openSend` / `readSendView` / `waitForFee` / `waitForTag` / `submitSend` / `openReviewFromStrip` / `readReview` / `waitForReviewReady` / `shotSend` (`fixtures/send-page.ts`) | The Send page's publish surface: the strip's cells, the fee-source tag and the footer's action read together — `assertPublishInvariant` refuses a page where they disagree — plus the review sheet's rows, the hit-tested clicks on "Review send" / "Send now" / the strip, and both-theme screenshots under `NULO_E2E_SHOT_DIR`, which refuse a page that is not shown (a hidden page draws no frame, and its capture can hang). |

Anti-throttle Chrome flags live in the Chrome driver (`fixtures/browser/chrome.ts`):

```
--disable-renderer-backgrounding
--disable-backgrounding-occluded-windows
--disable-features=CalculateNativeWinOcclusion
```

`protocolTimeout: 300_000` is set on the browser launch; this is a safety net, not a fix — the helpers above are the actual fix.

## Known failures + triage

The network suite is a required PR gate at retry 0 (`extension-network-e2e-status`); there is no standing list of failing files. Open flake fingerprints, their sanctioned responses, and the history of every root-caused one live in the flake ledger of the `e2e-testing` skill (`.claude/skills/e2e-testing/SKILL.md` § Flake ledger). A red gate is a known fingerprint → rerun once, or breakage → fix; never a neutralised check.

## What's owned per worktree (parallel-safety summary)

| Resource | Per-worktree isolated? | How |
|---|---|---|
| Anvil, aztec, playground | Yes | spawned by setup with a launch marker and owner in their environment, recorded in the lockfile; stopped by group, then by marker |
| Aztec run dir | Yes | `~/.cache/nulo-e2e/nulo-aztec-<pid>-<ts>` on real disk (NOT tmpfs — see `lockfile.ts` `E2E_DATA_ROOT`; override `NULO_E2E_DATA_ROOT`), stamped with the node's marker; the node writes `<dir>/data` |
| Ports | Yes | claimed in `~/.agents/ports.md` under the run id before the build; bind-tested again at boot |
| Forks, Firefox | Yes | inherit the run marker; a dead run's forks are stopped by `e2e:reap` and the next run's setup, its Firefox launches by the next Firefox launch or `e2e:reap` |
| Wallet build artifact | Yes | `dist/chrome/` lives inside the worktree |
| Chrome user-data-dir | Yes | Puppeteer creates a fresh `/tmp` dir per `launch()` |
| Update scenarios' Chrome | Yes | launched over a pipe with no `--load-extension`, so the path sweep below never sees it; a pipe-launched Chrome exits when its run dies. Its profile, the release cache and the candidates live in `.e2e-state/` |
| Chrome orphan cleanup | Yes | `pkill -f "chrome.*--load-extension=$EXTENSION_PATH"`, path-scoped, at every run's setup and teardown, and in `e2e:reap` while no run of the worktree is live (Chrome shows no marker) |
| `.test-config.json` | Yes | per worktree |
| `.e2e-state/` lockfile | Yes | per worktree |
| EmbeddedWallet PXE temp dir | Yes | random `tmpdir()/nulo-e2e-<8hex>` per call |
