---
name: e2e-testing
description: Write, run, and deflake the Nulo extension's Puppeteer e2e suites (smoke + network). Use when the user says "e2e", "smoke", "network suite", "puppeteer", "flaky test", "stopBackground", "kill the service worker", "e2e:agent", or wants to test an extension UI or dApp flow end to end.
---

# E2E testing — Vitest + Puppeteer on the Nulo extension

This skill owns the Puppeteer layer under `apps/extension/tests/e2e/`: how to run it, how to write a
test that stays green, how to kill the service worker for real, how to tell a flake from a break, and
the ledger of every flake this repo has root-caused. Boundaries:

- Live debugging of a running extension (DevTools MCP, the Logger page) → `chrome-extension-debug`.
- The generic parallel-agent isolation pattern (ports, process groups, data dirs) → `run-isolation`;
  this skill describes THIS repo's instance of it.
- The in-process tier below e2e (real service graph over dumb fakes) →
  `apps/extension/tests/COMPOSITION-TESTS.md`. Escalate to e2e the moment an assertion needs
  simulation, proving, real derivation, or Barretenberg.
- Layout, per-file purposes, and the helper table → `apps/extension/tests/e2e/README.md`.

Every rule below names the code that carries it. If a name here does not resolve on the tree, the
tree wins — fix the skill in the same PR.

## 0. Two browsers

Every suite runs on Chrome (default) and on Firefox (`NULO_E2E_BROWSER=firefox`). The reference for Firefox — the geckodriver + BiDi hybrid, each behaviour that differs and where it is absorbed, the debugging order — is [`apps/extension/tests/e2e/FIREFOX.md`](../../../apps/extension/tests/e2e/FIREFOX.md). What this skill needs you to hold:

- **A browser difference goes on `BrowserDriver`** (`fixtures/browser/index.ts`), with a Chrome implementation next to the Firefox one. `scripts/e2e/browser-seam.test.ts` rejects a scheme literal, a direct `browser.close()` / `newPage()` / `waitForTarget()`, and any `isFirefox`/`BROWSER` branch under `fixtures/**` or `helpers/**`. A test file may use `isFirefox` to skip itself whole (`describe.skipIf(isFirefox)(CHROME_ONLY.<reason>, …)`), to keep a test headless Chrome cannot set up off Chrome (`describe.skipIf(!isFirefox)(FIREFOX_ONLY.<reason>, …)`), or to state a real difference in an expectation.
- **Open, navigate, reload, focus, size and click through the helpers**: `newPage`, `gotoExtensionPage`, `reloadExtensionPage`, `bringToFront`, `setViewport`/`viewportOf`, `clickByTestId`/`clickSelector`, `pickFileByTestId`. Each hides a Firefox failure mode that does not look like its cause (a page in a window the wallet opened, a stranded context, a command Firefox refuses on an extension page, a missing user gesture, an unfocused window).
- **A Chrome-only file is a capability statement, not a quarantine.** The set is two files: `backup-restore-sw-restart` kills the background under an open extension page (Firefox leaves an event page running while one is open), and `import-dead-rpc` redirects over CDP Fetch. The two execution canaries run on both browsers — the passkey one moves its post-kill ceremony to a fresh popup where the driver's `credentialOutlivesPage` says the credential survives the anchor page. Adding a Chrome-only file is the owner's call.
- **`bun run typecheck` checks the e2e tree** (`apps/extension/tsconfig.e2e.json`): it loads Node's types and no Bun types, so a `Bun` global is an error, as it would be at run time. A call form chrome-types leaves out goes in `tests/e2e/chrome-api.d.ts`, never under a `@ts-` directive. Types prove no timing: a spec still has to run.
- **Red on Firefox only?** Read `document.visibilityState` and `document.hasFocus()` in the page before touching a fixture.
- **Extension-page errors reach `pageErrors` and `consoleErrors` on Firefox through the driver's relay** (`fixtures/browser/firefox-page-errors.ts`, FIREFOX.md), proved on Firefox 153.0.4 and 158.0 by `page-error-capture.test.ts`. It calls two Firefox internals and fails the launch when either is gone. **A Firefox bump whose arming check or capture test fails is a hold on the bump**, never a `skipIf`, a soft-fail or a removed assertion. An error Firefox now records is a real failure: read its stack URL and text, never filter it.
- **Never navigate away from an extension page while it loads a route.** Firefox rejects the departing document's in-flight import (or the CSS preload before it) and the relay records it; Chrome recorded nothing for a cut import. So `waitForLockScreen` observes the popup's own redirect and never reloads (FIREFOX.md).
- **The toolbar panel is drivable on Firefox only** (`fixtures/browser/firefox-action-popup.ts`): `openActionPopup` opens the real panel, `evaluateInActionPopup` reads and clicks in it, and `armPanelDeath` makes it die as a Mac's does when anything else takes focus, recording any WebAuthn call or file picker opened in it. Each panel call is privileged and focuses a browser window, which refuses a passkey prompt starting in another window at that moment: while a passkey window is up, read the outcome from a control page opened beforehand (`toolbar-panel.test.ts`). A passkey-window step that succeeds reopens the panel by itself on the window it started from (`armPopupReturn`), so a spec reads that panel rather than opening one; to count panels without moving focus, ask another extension page for `chrome.extension.getViews({ type: "popup" })`, which lists a preloading document too: the panel is open once that document has focus.

## 1. Run it

### The three configs

| Suite | Config | Includes | Global setup | Timeouts (test/hook) | Retry |
|---|---|---|---|---|---|
| smoke | `vitest.e2e.config.ts` | `tests/e2e/*.test.ts` | `global-setup-smoke.ts` (no sandbox) | 60s / 90s | `NULO_E2E_RETRY` ?? 2 (three attempts) |
| network | `vitest.e2e.network.config.ts` | `tests/e2e/network/**` | `global-setup.ts` (anvil + aztec node + playground) | 30s / 300s | `NULO_E2E_RETRY` ?? 2 (three attempts) |
| all | `vitest.e2e.all.config.ts` | both | `global-setup.ts` | 30s / 300s | `NULO_E2E_RETRY` ?? 2 |

All three spread `e2eIsolation` from `vite.shared.ts` (`pool: "forks"`, `isolate: true`,
`fileParallelism: false` — one Chrome per file, files sequential) and read their retry through
`e2eRetry(2)`, which refuses a malformed `NULO_E2E_RETRY` at config load. All three take
`reporters: e2eReporters()`: an explicit reporters array suppresses vitest's automatic
`github-actions` annotator, so that function re-adds it and appends `RetryErrorReporter` (prints the
first-attempt errors of a test that passed on retry, and on Actions appends `N passed on retry`, by
name, to the job summary, 0 included). Never inline a reporters array in a config.
The network and `all` configs also spread `networkRunner()`, whose reporters pass `{ stall: { stallMs: STALL_MS } }`, adding
`StallWatchdog` (`tests/e2e/stall-watchdog.ts`): after 10 min with no reporter event it writes
`.e2e-state/stalled` naming the running tests, fails and cancels the run, and 30 s later kills this
vitest's fork workers (children whose argv is vitest's fork entry, never by name). Every run prints its
longest silence; `STALL_MS` (`tests/e2e/run-limits.ts`) is twice the longest a green run showed, so
a test that waits silently for longer needs a progress line. The same two configs cap each fork's V8
heap at `FORK_HEAP_MIB` (2048 MiB, `execArgv`); `network-setup.ts` fails a fork whose limit does not
match.

Commands (root `package.json`):

```bash
cd apps/extension && bun run test:e2e [files]            # smoke — no sandbox
bun run e2e:agent [files] [--shard=N/M]                  # network — owns a sandbox per run
NULO_E2E_PROVERLESS=1 bun run e2e:agent [files]          # network, proverless build (CI's shard pool)
bun run test:e2e:all                                     # smoke + network on one sandbox
bun run e2e:reap                                         # stop a dead run's sandbox, forks, browsers by marker
```

`test:e2e:network` at the root runs the config bare: no port pack, no armed build, `global-setup.ts`
falls back to `8545/8080/8880/40400/5174`. Use it only against a sandbox you already own: a bare run
adopts any listener that answers its probe on those ports (an anvil answering as chain 31337 is
trusted to run with `--slots-in-an-epoch 1`), which an `e2e:agent` run never does.

### Hazards that mass-fail a run

- **Both global setups `pkill` every Chrome loaded from THIS dist path**, at setup and at teardown.
  Parallel worktrees are safe. On ONE worktree, smoke beside network is safe only when smoke
  loads a copy of the armed build through `EXTENSION_PATH`, and two `e2e:agent` runs never are
  (each rebuilds `dist/<browser>` and owns the worktree's `.e2e-state/`). Tell a reviewer running
  locally not to invoke any e2e config.
- **Heavy suites run alone on the host.** A concurrent `audit:vue`, a proving run, or a second
  suite starves the sandbox and the browsers; the signature is timeouts across unrelated files.
  Rerun before triage. Shard for wall-clock (`--shard=N/M` across agents), never overlap.
- **One browser's whole network suite can outlast an agent's command limit** (about 2 hours on a
  loaded host; Claude Code stops a background command at 7,200 s, leaving the lock and the run
  dir): shard it, or `bun run e2e:reap` and run the files it did not reach
  (`implementations-plan/archive/e2e-stores-1/lessons/phase-3.md`).
- **Offscreen sender shapes (Chrome, verified by probe)**: SW→offscreen `sender = { id, url: <getURL(manifest.background.service_worker)> }` (no `origin`, no `tab`); offscreen→SW `sender = { id, url: <getURL("src/offscreen/index.html")>, origin }`. A Chrome offscreen document has NO `chrome.runtime.getManifest` (fetch `manifest.json` by URL instead). When a sender predicate changes on either listener, probe the real shapes with a 30-second puppeteer script (pattern: `apps/extension/.playwright-mcp/sender-probe.mjs`) BEFORE the smoke run — the suite only shows the symptom (PXE timeouts, a profile reset stuck on its tombstone) three retries later. `MessageType` on the wire is numeric (`Event=1`, `Request=2`, `Response=3`).
- **Sharding smoke on one host**: both `global-setup-smoke.ts` hooks kill every Chrome loading exactly `EXTENSION_PATH` (`chromePattern` in `sandbox-ownership.ts`: the path as a literal, ending at the argument's end, so `dist/chrome` never matches `dist/chrome-2`) — two `test:e2e --shard` halves need two dist dirs (`dist/chrome` + a copy at `dist/chrome-2`), each half pointed at its own via `EXTENSION_PATH`, and the armed-build env + `NULO_E2E_MIGRATION_FIXTURE=1` on both. One dist shared by two halves still kills the other half mid-run with `ConnectionClosedError` at `openPopup`.
- **Smoke builds nothing.** It loads `dist/<browser>`, or `EXTENSION_PATH`, which wins, and an
  `e2e:agent` run leaves a network build in that directory: before a smoke red or green that must
  mean the current source, `bun run build:<browser>` and run under `env -u EXTENSION_PATH`
  (`implementations-plan/archive/accessibility-1/plan.md`, § Implementation phases).
- **`bun run dev` rewrites `dist/chrome` to load from the dev server** (`localhost:8088`), so a
  later `test:e2e` loads a wallet whose service worker cannot boot and times out in every file.
  Rebuild armed (§ Build-armed tests) before the next run
  (`implementations-plan/archive/isolated-linker-store/plan.md#dev-server-dist`).
- **Reap at session end**, not at the next run: `bun run e2e:reap`. Orphans hold their LMDB store
  open; the run dir, where the node's `TMPDIR` puts every store, is on real disk
  (`~/.cache/nulo-e2e`, `lockfile.ts` `E2E_DATA_ROOT`), so RAM is not pinned, but ports and CPU
  are. It stops only processes whose own environment names this worktree's markers and a dead
  owner; a sandbox a live run holds or reused is left alone.

### The agent runner — `apps/extension/scripts/e2e/agent.sh`

1. Asks vitest which files the arguments select (`scripts/e2e/proverless-guard.sh`: `vitest list
   --filesOnly --json` with the run's config and arguments, so flags, their values and name filters
   select exactly as the run does, before `--shard` narrows it) and scans them for
   `@requires-proverless`; any hit without `NULO_E2E_PROVERLESS=1` exits 2 with the remedy, as does
   an unarmed watch run; any vitest, `jq` or `grep` error exits 2 on its own FATAL line. Prover-ON is the default; the proverless build is a double opt-in
   (`VITE_NULO_E2E_PROVERLESS=1` + `_CONFIRM=1`) and mutually exclusive with
   `VITE_NULO_PRESTO_REQUIRED`.
2. Claims a fresh port pack (`resolve-ports.ts`: bind-and-release in a static window below the
   kernel's ephemeral floor, skipping every port the host registry `~/.agents/ports.md` lists) in
   that registry under a run id, one `nulo-e2e-<service>` row per port with `agent.sh`'s pid as
   owner, and writes it with the run id and a run marker to `.e2e-state/ports.json`. The rows go
   when the run ends (an `EXIT` trap, which signals nothing, plus an explicit release before the
   final `exec`); a SIGKILLed run's rows are dropped by the next claim on the host once their owner
   is dead. The registry lock is shared with `alejoamiras/unleashed`'s writers (`open(..., "wx")`,
   which break a lock older than 15 s); this client never breaks it and fails closed after 30 s.
3. Builds the wallet armed: `VITE_LOCAL_NETWORK_RPC_URL` (this sandbox),
   `VITE_NULO_E2E_PRICE_MAP=1`, `VITE_NULO_E2E_MIGRATION_FIXTURE=1`,
   `VITE_NULO_E2E_TOKEN_SEEDS=1` + `_CONFIRM=1`, `VITE_NULO_E2E_CSP_REPORT=1`,
   `VITE_NULO_E2E_SEALED_READ=1`, plus the proverless pair and `VITE_NULO_E2E_WALLET_CLOCKS=1`
   (incoming tick and finality re-read every 10 s) when asked; the prover-ON build passes
   `VITE_NULO_E2E_WALLET_CLOCKS=0`. Then asserts the bundle before spending a sandbox (exit 2 on a
   miss): the sandbox URL literal, the migration-fixture stamp, the token-seed stamp and key, the
   CSP recorder's key, the sealed reader's message, the presto stamp when armed, the proverless and wallet-clocks stamps when
   armed (and the wallet-clocks stamp's absence otherwise), the fee multiplier when set. The price
   map has no stamp check.
4. Runs vitest with `E2E_REQUIRE_SETUP=1` (a sandbox or deploy failure is `FATAL`, never a silent
   `describe.skipIf` — the suite once showed `61 skipped, exit 0` for weeks) and the runtime
   declarations the tests read (`NULO_E2E_MIGRATION_FIXTURE=1`, `NULO_E2E_CSP_REPORT=1`, the `*_URL`s).
5. `classify-exit.ts` maps the run through `.e2e-state/{boot-started,boot-ready,tests-started}`:
   boot started, never ready, no test ran → exit 86 (CI retries the agent once on 86 only); anything
   else passes through. A test that ran cannot masquerade as infra.

Reuse never happens under `e2e:agent` (fresh ports every run, and a run id forbids it);
`reconcilePriorLock` in `global-setup.ts` refuses a lock whose `owner` still lives (another run in
this worktree) and otherwise reaps the previous pack by marker, throwing before the boot window if
any service is not stopped. A normal run's teardown kills what it spawned and clears its lock, so
reuse fires only when a prior pack SURVIVED (a `kill -9` of the vitest group after deploy) and the
next bare `vitest run --config vitest.e2e.network.config.ts` carries the same ports: pids alive,
endpoints healthy, and the node's `l1ContractAddresses` equal to the lock's (a stranger on a reused
port fails identity). The reuse rewrites the lock's `owner` to the adopting run.

### Build-armed tests

Several fixtures are compiled INTO the bundle by `VITE_NULO_E2E_*` flags and tree-shaken out
otherwise: the proverless `ProofGate`, the restore and incoming-poll gates, the migration fixture,
the token-seed reader, the price map, the sealed-root reader. Against an unarmed dist nothing raises by itself — the hook is
gone, optional chaining no-ops, and an unguarded test polls into a multi-minute timeout
that looks exactly like a product bug (a guarded one fails fast in its `beforeAll` stamp check). A
runtime env var can never arm a build-time flag.

- The signature is the SAME deterministic set of failures run after run (load flake scatters).
- Diagnose before theorising: `grep -rl NULO_E2E_PROVERLESS_BUILD_STAMP apps/extension/dist/chrome`
  (or the stamp of the feature in question). A later plain `bun run build` — including the one at
  the end of `bun run audit:vue` — silently disarms the dist.
- Smoke needs its fixtures armed AND the migration one declared: build with
  `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1
  VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run build:chrome` (the seed pair
  keeps the fresh wallet off the live seed RPC — `_extension-smoke-e2e.yml` says why), run with
  `NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1`.
  `migration.test.ts` skips without the declaration; `backup-migration.test.ts` throws with the
  remedy.
- Journal, transaction, balance, authwit and incoming rows are sealed: read them through
  `fixtures/sealed-rows.ts` (armed by `VITE_NULO_E2E_SEALED_READ=1`, network builds only), never
  `chrome.storage.local`, and find a keyed root's row (transactions, authwit flags, the incoming
  roots) by its `naturalId`, never its storage key. An unarmed build throws with the remedy on the
  first read. A spec that reads after `stopBackground` unlocks first: the successor holds no keys
  until then (`tests/e2e/README.md` § Sealed roots).
- Every e2e launch, smoke or network, refuses every outside host but the ones it sends direct
  (both setups provide `egressGuard: true`; only an artifact smoke provides `liveLeg`). Each launch
  routes HTTP, HTTPS and WebSocket to a loopback guard that answers 403 and records the host, proves
  the route with a canary only a direct path reaches, and sends bb.js's CRS hosts (`CRS_HOSTS`)
  direct (`fixtures/egress-guard.ts`; README § Egress guard). `close` fails on any host no list
  declares, a canary connection, a direct host seen at the guard, a failure of the stand-in's
  interception, or a seeded node's request that reached the guard while its stand-in held its
  origin, before the close began. A red naming a wallet or spec host means a new outside call: declare it in
  `DECLARED_REFUSALS` with why; a browser's own host goes, by exact name, in its driver's
  `ownHosts`. A held node request means a target the interception does not cover dialed the node:
  on Chrome rerun with `NULO_E2E_INTERCEPT_LOG=1` and find it; never declare the host or loosen the check.
  The smoke setup refuses an unarmed dist outside artifact runs; artifact runs are guarded too.
  Each seeded remote node (Mainnet, the default, and Testnet) is answered by its own loopback
  stand-in with a terminal 400 (`fixtures/node-stub.ts`); a new profile starts on Mainnet, so a spec
  that needs the list's tokens, prices, the sponsor or Testnet's own accounts (the stale-network seeds
  move them) switches to Testnet first, and one that stages the active node intercepts
  `DEFAULT_NODE_ORIGIN`. The Testnet stand-in is armed in every launch but
  the artifact-only live spec's (`shipped-token-list.test.ts`: its
  `launchExtension({ live: true })` sends the node's and the token list's hosts direct, and throws
  unless setup provides `liveLeg`); a smoke spec that needs a value only a node gives seeds it
  (`helpers/fpc-seeds.ts`) and, where the wallet writes beside the seed, holds the node itself from
  before the profile exists (`send-keyboard.test.ts`'s fee picker; ledger row 53). One that proves
  the offline case arms its own `interceptRpc` refusal, which replaces the stand-in; the held check
  is off while it does, as it is during a `stopBackground`.
- A file that depends on the PROVERLESS build carries the `@requires-proverless` marker (the only
  marker `agent.sh` scans) AND a `beforeAll` that greps the loaded bundle for the stamp
  (`account-switch-isolation.test.ts` is the idiom) — the belt for direct vitest invocations. Other
  armed features need their own guard (`backup-migration.test.ts` throws with the remedy;
  `default-token-seeding.test.ts` has none and simply times out unarmed).
- A file that REORGS the shared sandbox (`stale-anchor-recovery.test.ts`) skips unless
  `NULO_E2E_REORG=1`: after an `anvil_reorg` prune the local network does not mine again, so in a
  pooled run every later file that lands a transaction dies at the token-ready fixture's 5-min hook
  (five files red in a row at ~309 s behind it, in one observed run). Run it alone, armed, never in the pool.

### Env vars the suite reads

| Var | Meaning |
|---|---|
| `HEADLESS=0` | windowed Chrome; default is headless (`launchExtension`) |
| `NULO_E2E_RETRY` | vitest `retry` for every e2e config (default 2); the reusable workflows' `retry` input sets it; `--retry=N` on the CLI wins |
| `E2E_REQUIRE_SETUP=1` | sandbox/deploy failures are fatal (set by `agent.sh`) |
| `NULO_E2E_PROVERLESS=1` | `agent.sh` arms the proverless build pair |
| `NULO_E2E_MIGRATION_FIXTURE=1` | runtime declaration that the dist carries the migration fixture |
| `NULO_E2E_CSP_REPORT=1` | runtime declaration that the dist carries the CSP violation recorder: every launch's `close` fails on a missing record or any entry (README § CSP violations) |
| `NULO_E2E_SHOT_DIR` | capture mode: `shotSend` writes light and dark PNGs there; CI never sets it. The shot page must be shown: Chrome's `newPage` opens a tab, which hides the tab before it, and a hidden page draws no frame, so `shotSend` refuses it; bring the page to front where the spec acts on it. A wallet whose token arrives untrusted (a backup import) opens the first-receive sheet over Home's middle, so a frame of Home's card comes from a fixture that imports its token through the UI (`tokenReadyExtension`). The approval window decodes its calls after `waitForExecuteContent` returns, so a shot of its summary first waits until no `execute-op-summary-args-pending` shows, or it pictures "Reading arguments…" (`network/tx-sendTx-multicall.test.ts`) |
| `NULO_E2E_ARTIFACT_RUN=1` | smoke against a built artifact (release/nightly): guarded with the node stand-in like a source run, skips the encrypted `backup-roundtrip` spec and the armed-dist check, and provides `liveLeg`, which runs `shipped-token-list.test.ts`, the one launch that reaches the live Testnet node; set for BOTH artifact paths, never keyed on bare `EXTENSION_PATH` |
| `EXTENSION_PATH` | smoke: load this unpacked dir instead of `dist/chrome` |
| `NULO_E2E_DATA_ROOT` | sandbox run-dir root (default `~/.cache/nulo-e2e`); short enough that `<run dir>/tmp` plus the node's 28-byte socket names fits `sun_path`, which setup checks |
| `NULO_E2E_STAGE_LOG=1` (+`_OUT`) | append per-import stage-trajectory records (`helpers/import-stage-timing.ts`) |
| `NULO_E2E_OPENPOPUP_LOG=1` | log `openPopup`'s fast-path/fallback timing |
| `NULO_E2E_CHAOS=1` (+`_SEED`, `_RUNS`, `_ACTIONS`) | arms the chaos files; the seed is random when unset and always logged. `profile-chaos` also takes a run count (consecutive seeds, one launch each) and a replay list (README § Chaos runs); with `NULO_E2E_UPDATE_FROM` and `_TO` set, the smoke file starts each seed from that release updated in place (README § Start states) |
| `NULO_E2E_CONSOLE_PROBE=1`, `NULO_E2E_PROBE=1` | enable the two `_probe-*` files (skipped by default; probes, not gates) |
| `ANVIL_URL`, `AZTEC_NODE_URL`, `PLAYGROUND_URL`, `*_PORT` | the port pack (`agent.sh` exports them from `ports.json`) |
| `VITE_NULO_FEE_MULTIPLIER` | build-time fee envelope widening; CI sets `10` to absorb devnet base-fee drift. It is Normal's multiplier and scales Fast and Urgent with it (CI prices 10, 15, 25), so the speeds keep their order |

### Retry policy is a per-class decision

- PR gates run `retry: 0` (`pr-extension-network-e2e.yml` hands it to its lane call, which passes it to every job; smoke's config keeps 2).
  A masked flake in a required gate is worse than a visible one.
- Nightly omits the input, so the config default (2) plus the exit-86 boot retry applies: absorb,
  then ship. The exception is `send-chaos`, which pins its own retry 0: a retry replays the burst
  against balances the first attempt moved.
- Per-test `retry: 0` is mandatory for DESTRUCTIVE scenarios (a password change, a MAC tamper, a
  profile delete mid-file): a retry re-enters against mutated state and buries the real failure
  (`imported-account-lifecycle`, `frozen-account-canary`, `transfers` say why at the top).
- The profile chaos files pin retry 0 too: a seed's steps change the profiles they run on, and a
  red seed is triaged from its replay record (README § Chaos runs), never re-run until green.
  A violation that is an instance of a filed issue goes in `KNOWN_FINDINGS` (`checkers.ts`) with
  that issue's number, so the seed stays red and names it; an expected line that is no finding
  goes in `ALLOWED_ERRORS` with the code line that writes it. Neither ever hides a new error text.
- Never add a per-test `retry: 1|2` to hide a flake; root-cause it (§4) or file it in the ledger.
  Smoke's config-level 2 exists because the smoke gate is required on every PR; it is not licence
  for per-test overrides, and a local repro always runs at 0.

### CI topology

- **Smoke** — `pr-extension-smoke-e2e.yml` → `_extension-smoke-e2e.yml`. Runs when the diff trips the `smoke-surface`
  paths filter, when the PR targets `main`, on the `e2e:extension-smoke` label, or on dispatch; 3 vitest shards
  (`--shard=N/3`), each a 30-minute job with its own in-job armed build; nightly/release run an artifact
  (`artifact_name` / `extension_path`) whole, in one 45-minute job.
  Required check `extension-smoke-e2e-status` on both branches.
- **Network** — `pr-extension-network-e2e.yml` → `_extension-network-e2e-lane.yml` → `_extension-network-e2e.yml`.
  Filter `extension-network`, label `e2e:extension-network`. The lane file is the partition every caller runs (both
  PR lanes, the nightly, release's opt-in run); a file moves between the pool and a dedicated job there alone. Lanes: 5 vitest shards (`--shard=N/5`, split by the timings record, proverless, retry 0,
  the 12 dedicated files excluded); three heavy lanes (`fee-methods` + `selfpay-phase`,
  `concurrent-sendtx-confirm` + `same-token-concurrent-sends`, and `snack-placement` + `failed-send-check`,
  proverless); the **canary** lane prover-ON with the SHA-256-pinned
  `presto-server` and `VITE_NULO_PRESTO_REQUIRED=1` (`transfers`, `tx-sendTx-default`,
  `frozen-account-canary`, `passkey-execution-canary`, `delete-after-prove`) — a canary run with zero `Proving succeeded` lines fails; the
  `disable_presto` dispatch input (or the `NULO_E2E_DISABLE_PRESTO` variable) is the
  rollback to WASM. The **chaos** lane replays two fixed `send-chaos` seeds (one matrix leg each, proverless,
  retry 0; the nightly hands its own seed and runs `chaos / sends` instead); a red seed is fixed or proven a flake by replaying it (a re-run of the leg does), never given
  a test retry or rotated away (rotation: CI.md).
  Exit 86 retries the agent once. After every run the built bundle is grepped for
  `(PROBE|nulo:probe:|VITE_E2E_PROBE)` and any hit fails the workflow (`_extension-network-e2e.yml` skips the
  grep only when its `probe` input is `"1"`, a caller-set investigation mode, not a dispatch option):
  string constants shipped in `dist/` must not contain `PROBE`.
  `scripts/ci-cd/behavior-gating.test.ts` pins the filters and the exclude list against the lanes.
- **Shard timings** — both suites' `--shard` splits by `apps/extension/tests/e2e/shard-timings.json`
  (README § CI sharding). Refresh it with `bun scripts/ci-cd/e2e-timings.ts` from the repo root: it needs a `gh` login,
  reads each PR lane's latest green runs (one per branch) in about a minute, and prints each run's shard
  spread. Do it when a lane's shards end more than 2 minutes apart, after adding or removing a file over a
  minute long, or after an Aztec, browser or harness change; commit the record alone after reading its
  diff. A run it drops says why (a file line beyond vitest's count, a file in two shards). Never edit the
  record by hand; a new file needs no entry.
- **Nightly** (`nightly.yml`, scheduled daily) mirrors the lanes on both browsers with config-default
  retries, plus the seeded `send-chaos` run on each, and publishes a prerelease only when every one is
  green; it builds `dev` only, so it is never a branch soak. **Soak** (`extension-network-e2e-soak.yml`)
  is the branch-level flake check: the named network files (`test_files`), N iterations at retry 0 on
  Chrome, and every named test must pass, so an opt-in or browser-gated file cannot soak green. The
  whole suite on a branch is a dispatch of the two PR network workflows (CI.md § the soak).
- A red required gate is a flake → rerun once, or breakage → fix. Never advisory, never
  `continue-on-error`, never removed from the required set (CLAUDE.md § Quality gates).

## 2. Write a test

### Runtime budget

An added scenario pays the [e2e runtime budget](../../../CLAUDE.md#quality-gates--local-and-ci) in
CLAUDE.md: the distinct failure mode it proves, why a cheaper layer cannot prove it, and its estimated
then measured runtime, with each browser's suite wall-clock before and after in the PR body.

- **Suite wall-clock** is the CI suite job envelope: GitHub's job timestamps over the `Run / …` jobs
  that ran and passed in a run whose first attempt succeeded (a skipped job carries no real times).
  The PR e2e workflows run on pull requests, not on `dev`: "after" is the PR's run, "before" the
  latest such run of the same workflow on another PR (`gh run list --workflow <file> --status success`):

  ```bash
  gh run view <id> --attempt 1 --json conclusion,jobs --jq 'if .conclusion != "success" then "attempt 1: \(.conclusion)" else [.jobs[] | select((.name | startswith("Run / ")) and .conclusion == "success")] | if length == 0 then "suite skipped" else ((map(.completedAt | fromdateiso8601) | max) - (map(.startedAt | fromdateiso8601) | min)) / 60 | floor end end'
  ```

  It prints whole minutes (`21` for run 38364426588, Chrome network) and includes setup and
  teardown, so it is not vitest's test time. Report a cancelled, timed-out or rerun attempt apart,
  never folded in: a later attempt's envelope spans the gap between attempts.
- **Scenario runtime** is the per-file duration vitest's reporter prints for the file.
- **What a launch costs** (one host, medians of five, 2026-10): a fresh launch + `registerProfile` +
  close is 5.0 s on Chrome (the worker's liveness 2.0 of it) and 9.2 s on Firefox (the driver 3.2).
  A stored onboarded profile per worker saves 0.7 s / 1.1 s per registered launch on smoke and
  shares one account across files on network: not built
  (`implementations-plan/archive/e2e-fixed-cost-1/plan.md`, D1). A network fork's aztec.js import is
  4-6 s inlined against 2 s native; native loading is known limit #997.
- **Two onboarding levers, measured and not built** (2026-10). Switching to Local on the
  registration popup, instead of closing it and opening another, saves 0.75 s (Chrome) / 0.77 s
  (Firefox) a call on CI over about 105 calls a run. Three P/F pairs cannot show that on a shard
  whose file time moves 150-200 s between runs, and a local probe on a loaded host had put
  Firefox's saving at 2.0 s. A profile injected into storage (the production `ProfileService`'s
  rows rendered in the fork, then the UI unlock) saved nothing more: an unlock runs the creation's
  PBKDF2 work, and the fork's import of the renderer costs 18-27 s
  (`implementations-plan/archive/warm-stack-1/plan.md`, known limit #1006).
- **Measuring on CI beside other lanes:** every agent's `gh` draws on the account's one
  5000-an-hour REST limit, and `gh api rate_limit` showed this token's bucket almost unused while
  every call was refused with 403. So a dispatcher polls one `gh run list` per workflow every 45 s
  or slower. Another lane's dispatcher may not see
  a run you just started: check again a minute after dispatching, and on a clash cancel yours and
  wait.
- **A cost guard** (a latency ratio between builds, timed by a probe spec on builds chosen by
  `EXTENSION_PATH`) runs its variants interleaved in one pass, a fresh browser per sample, each
  sample started under a load ceiling well below the run gate's, with the load logged. A loaded
  host's spread hides a per-item cost: a forced layout per followed line read +1.8% on Firefox at
  load1 142-150 and +42.7% under 90 (ledger row 63).

### Selectors

Only `data-testid` (rows: `data-<entity>-id` / `data-<entity>-name`). Never text, role, aria-label,
placeholder, class, or structure. `waitForToast` is the one sanctioned text assertion. If an element
has no testid, add one BEFORE the test. This is convention plus review — no lint rule or scanner
enforces it, so a reviewer has to. One exception, the logs and JSON viewers: CodeMirror builds their
editor's DOM inside the host's shadow root, so a spec reaches the host by its testid (`logs-editor`,
`json-editor`) and below it only CodeMirror's documented `cm-` classes (`.cm-content`,
`.cm-scroller`, `.cm-panel.cm-search`), never a generated theme class or a position.

### Start from the right fixture (`fixtures/extension.ts`)

Each fixture builds its own starting state; they are siblings, not a chain, with one exception:
`dappConnectedExtension` takes `registeredExtension`'s browser and mutates it (the file's registered
and connected states share one Chrome). Pick by the state you need and the scope you can afford:

| Fixture | Starting state | Scope |
|---|---|---|
| `extension` | fresh install, liveness reached, first-run tab closed | file |
| `freshExtensionPerTest` | same, relaunched per test | test |
| `registeredExtension` / `…PerTest` | one password profile on `#/popup/general` | file / test |
| `dappConnectedExtension` / `…PerTest` | playground handshake done | file / test |
| `dappConnectedExtensionWithAccountsCap`, `…WithTransactionCap`, `…WithFirstTwoAccountsCap`, `…WithFirstTwoAccountsContractsCap` | handshake plus the named capability grant | test |
| `localNetworkExtension` | profile switched to the sandbox network | file |
| `tokenReadyExtension`, `feeJuiceReadyExtension`, `feeJuiceImportedExtension` | funded token / fee-juice states on the sandbox | file |

**Every launch starts from a Terms-acceptance state.** `launchExtension({ legal })` seeds
`nulo:legal:accepted` from `@nulo/legal` (never a literal): a fresh profile defaults to `current`, so
a spec that is not about the gate never meets it, and a reused `userDataDir` defaults to `keep`, so a
relaunch boots over whatever the previous launch left. `missing`, `stale` (one version behind, which
drives the real "terms have changed" sheet) and `corrupt` are the other states.
`openOnboarding(ctx, { legal: "missing" })` is a real fresh install for the gate's own specs;
`reloadWithLegalState(page, seed)` (`helpers/legal-drivers.ts`) flips an unlocked popup, which is
what an update shipping newer Terms looks like. The service keeps no cache, so a storage write is
seen by the very next admission check.

A file-scoped browser is shared by the file's tests, so a test that mutates the profile takes a
`PerTest` fixture. Shared browsers leak worker memory between files, which is why the unit is the
file and never the run. Design files order-independent.

### Never bypass the helpers

`clickByTestId` / `clickSelector` (not `page.click` / `handle.click` — raw CDP element clicks hang in
`Runtime.callFunctionOn`), `typeIntoInput` / `replaceInputValue` (not `handle.type`),
`patchPagePolling` (auto-applied by every page opener: `raf` polling is throttled on unfocused tabs,
so waits use `polling: 200`), `withTimeoutMessage` (turns a bare `TimeoutError` into a diagnostic
without swallowing frame-detach or CDP-disconnect errors), `closeStuckPopup` (a `<Transition>` stuck
mid-leave under headless rAF throttling — only after asserting the real post-mutation signal, never
as a substitute for closing through the UI), `pollUntil` (`fixtures/poll.ts`, not a hand-rolled
`Date.now()` deadline loop: a probe's throw fails at once, a spent budget throws `PollTimeoutError` with
the last value, and work that moves the state on runs in `between`). `waitForPopup` matches a NEW
`#/windows/<kind>` target by URL because every interaction URL carries a unique `requestId`;
`callExpectingNoPopup` diffs targets by identity because plain popup pages change URL under a lock
redirect.

`clickByTestId` calls `el.click()` in the page (`fixtures/dom.ts`), which an SVG element
does not have, so an icon-only `<Icon>` target throws inside the wait and times out: press it with
`pointerClick`.

**`waitForFunction` with page-function arguments needs a non-empty options object.** `patchPagePolling`
finds the options argument by looking for a `timeout` or `polling` key. A bare `{}` has neither, so the
wrapper splices its own options in at index 1 and your `{}` becomes the page function's FIRST argument
— `waitForFunction((sel) => !document.querySelector(sel), {}, SEL)` then queries `{}`, matches nothing,
and an absence-wait passes vacuously while a presence-wait times out. Always write `{ timeout: N }`.

**A patched page's `waitForSelector` resolves `null`.** For a CSS selector `patchPagePolling` waits
through `waitForFunction` and returns `null`, never the `ElementHandle` Puppeteer's type promises, so
`(await page.waitForSelector(sel))!.evaluate(…)` compiles and throws `Cannot read properties of null`
on both browsers. Wait, then read with `page.$eval(sel, …)` or `page.evaluate`.

**A Send fee trigger can show a method that is not in effect.** With a saved pick, the card previews
that pick's row while balances load (`send-fee-method-trigger[data-fee-method]`), and a preview pays
nothing. To assert the method in effect, wait on something only the effective method produces
(`send-publish-strip[data-you]`, `send-submit[data-action]`, the `send-fee-privacy-notice` tag, an
enabled submit — `waitForFee` / `waitForTag` in `fixtures/send-page.ts`), and scope by
`fee-settings-card[data-origin]` — across an origin flip the trigger attribute alone cannot tell the new
origin's method from the last one's.

**A send names what it expects of the page.** `sendTransfer` takes `expect: "send" | "review"` and
`submitSend` throws when the page disagrees — a gated send that the button would fire directly, or a
one-tap send that opens the sheet, is a product bug the helper must not paper over by clicking
whatever appears. Every read of the page goes through `readSendView` + `assertPublishInvariant`
(tag ⇔ `data-action="review"` ⇔ `data-you="exposed"`), so a test asserting one surface has
asserted the other two. The sheet's CTA arms after a delay: wait on `send-review-submit[data-ready]`
(`waitForReviewReady`), never on a sleep. Closing the sheet goes through `waitForReviewClosed`, which
finishes a stuck leave transition for that popup only (`settleClosedPopup`) — `closeStuckPopup` would
clear the whole `#popup` layer, including a popup that must stay open beneath. `settleClosedPopup`'s
`true` means only that the popup was still in the DOM once its leave began
(`fixtures/popup-leave.ts:25-31`), which is the normal state straight after a close, not a stuck
transition.

**Focus after a close is waited for, never read.** focus-trap hands focus back to the opener on a
0 ms timer after the release (`delayReturnFocus`), and CDP round-trips on this pipe are shorter than
that: a `document.activeElement` read straight after the close saw `BODY` on one run in three while
an in-page sampler showed the opener focused 26 ms later. `waitForFocus(page, testid)`
(`helpers/pointer-probes.ts`) polls for the landing and names where focus is when it does not land.
Escape is a real close for every registry popup (only the top one answers; a menu open inside a popup
closes first — prove the popup survived that first press by containment, not by visibility, since
a closed popup lingers in its leave transition: check `focusInPopupOf` after every Tab, because a
walk that only misses one outside control can pass after focus has escaped). Read each press for
`defaultPrevented` too (`pressEscape` in `helpers/pointer-probes.ts`): the suite drives the
wallet in a tab, where an unhandled Escape does nothing, but Chrome's toolbar popup closes the whole
wallet on one. When a test asserts where focus returns, open the popup with `pointerClick`:
`clickByTestId` fires `el.click()`, which never focuses
the opener, so there is nothing to return to and the landing assertion proves nothing.

**The one sanctioned real click: `pointerClick(page, testid)`** (`helpers/legal-drivers.ts`). The
helpers above dispatch the click in-page, which reaches an element even when an overlay covers it, so
they cannot prove that nothing does. A lock-out proof (the Terms sheet must never cover an export
page) hit-tests the control's centre with `elementFromPoint`, fails naming what covers it, and only
then clicks through `page.mouse`, which is `Input.dispatchMouseEvent` and not the hanging
element-handle path. It reads the centre only once the control holds still: the same box on three
reads 50 ms apart and no `*-enter-from` class above it, since a throttled frame can hold a popup still
in its start state. A CSS-module transition class (`$style.enter_from`, drawn as
`_enter_from_<hash>`) escapes that match, so the snack card counts as settled only at opacity 1 with
no running animation (`readSnackOverSheet`; `settledCard` in `network/snack-placement.test.ts`).
After 5 s a still control is pressed anyway — best effort, as a frame that never
comes and one that comes late look alike. A card moves 15px when a sheet opens over it or closes
above it, and a centre read mid-move was pressed after a 16px control had settled past it (ledger row 34). Holding still is not
being ready — content that arrives later can still move a control — so wait for the popup's own
done-loading signal first when it has one. Use it for the control whose reachability IS the
assertion; drive the rest of the flow with the ordinary helpers.

**A double-click is `doubleClick(page, x, y, gapMs)`** (`fixtures/browser`), never two
`pointerClick`s or two `mouse.down`/`up` pairs: Firefox counts presses only inside one action chain,
so those reach its page as two clicks of `detail` 1 (FIREFOX.md). Record what each press hit with a
window capture listener and assert it, as `contacts.test.ts`'s Confirm case does: a second press that
missed its target proves nothing. A bubble listener on the window reads whether a click was stopped,
but a control that stops its own click (`RowAction`'s `@click.stop`) hides it there too.

### What to assert

- **Post-action state, not the route.** A hash change proves nothing; assert the rendered address,
  the persisted row, the updated balance.
- **Positive counts poll; a zero count is instant only AFTER completion evidence.** Vue lists that
  refresh by array replacement swap children inside a sub-frame window; `page.$$` right after a
  resolved `waitForSelector` can read 0. An absence read before the action's own completion signal
  proves nothing either — wait for that signal (or observe for a bounded window), then read zero;
  pair it with a MutationObserver if a flash matters.
- **State attributes, not visibility.** `offsetParent` and bounding rects are paint artefacts; a
  leaving `<Transition>` is visible while `isOpen` is already false. Gate on `data-dropdown-open`
  (open a menu through `openDropdown`, which clicks only a closed one), `data-toggle-active`,
  `data-restore-stage`, `data-boot-outcome`; add one if it is missing.
- **Freshness-gated balances.** An imported backup already carries the expected value. Capture
  `captureBalanceBaseline` first and require `updatedAt` newer AND the exact raw value AND the
  token-scoped render (`waitForFreshBalanceRow`, `waitForTokenCardAmount`); body-text scans
  false-match `$1,000.00` and `11,000`.
- **Approvable ≠ rendered.** The execute confirm button also gates on fee estimation. Use
  `waitForExecuteApprovable`, which reads the live `disabled` AND `pointer-events`; `Button` binds
  the HTML attribute only when it renders a real `<button>`, and the CSS class is the universal
  signal. Cold callers pass 120s (`frozen-account-canary`, `cancel-mid-prove`).
- **A wait is only as honest as its signal.** `waitForFunction` resolves on the first truthy poll —
  it is a ceiling, not a dwell. A settled check tracks continuity (`resetProfile`'s
  `__nuloResetNavTrace`: navigate, require the destination selector AND the hash to hold across a
  short dwell, allow exactly one re-navigation, fail on a second).
- **A wait over a page that can navigate accepts every later state**, routing away included: a
  predicate that only recognised the import page starved for its whole budget once a clean import
  routed away between two polls (`implementations-plan/archive/e2e-deflake/plan.md#stage-waits`).
- **Until the router commits, the hash names the new page while the old one is still drawn.** For
  tens of ms after a hash change the leaving page answers selectors, and the arriving page draws its
  rows only after its own reads, so a node both pages draw (a terminal card on Home and History) can
  be the leaving page's. Gate on the tab's `nav-<tab>` `aria-current="page"`, which the router sets in
  the render that swaps the page while no transition wraps `RouterView`, and read in that same wait
  (`readTerminalCard`, `fixtures/journal-page.ts`); a page with no tab waits for the leaving nodes to
  disconnect (`openSurface`, `rows.test.ts`). Rows 35 and 37 hold the rest: read once, and wait for
  what only the loaded page draws.
- **Lock state comes from storage.** `ensureUnlocked` reads `nulo:core:session`, presses the
  product's `boot-retry` once if the shell reports an unreachable boot, never types on a stale
  marker, and proves the unlock by a newer well-formed record. Password profiles only.
- **Storage reads: key and shape.** `ValueStorage` persists `JSON.stringify(value)` — a raw
  `chrome.storage.local.get` returns a string; config lives at `nulo:config`. Verify both before
  concluding "absent".
- **Imported-account rows by badge, never by name.** An imported account carries its source
  profile's name and collides with the target's own default-named row (`helpers/account-io.ts`);
  prefer a stable id or badge for any row whose display name is not unique by construction.
- **Helpers state their starting route** or navigate there (`importToken`, `switchAccountByAddress`
  need `#/popup/general`).
- **Drive a popup to its own closing action.** `popupStore.open()` on a key that is already open
  updates the payload and order reactively but leaves the open flag true, so a popup whose DOM was
  force-cleared while the store still says open will not remount on the next open of that key.
- **A failure ends in its way out.** Showing the error proves half of it: assert the control that
  tries again is offered and enabled, what the person chose is still chosen, and a second try
  finishes. The full-backup restore said "Try again" over a disabled Import while its unit test pinned
  that `failed` state and every e2e stopped at the message
  (`implementations-plan/archive/firefox-passkey-unlock/plan.md#failure-way-out`);
  `passkey-retry.test.ts` now refuses each passkey step once and finishes it on the second try.
- **Prove the disruption happened**, not only the downstream state — a test whose kill never killed
  passed for months for reasons unrelated to its subject (ledger rows 16–19). Red-team a pin by removing
  what it guards: if it still passes, another gate was holding it.
- **A field's input handling is proven by real input.** A browser runs a microtask checkpoint
  between two listeners of an event it dispatches, and a scripted event (jsdom's, or `dispatchEvent`
  inside `page.evaluate`) runs none, so Vue can re-render between `v-model` and a sibling `@input`
  only under `page.keyboard`: every component test passed while each real keystroke misread its
  prior text (`implementations-plan/archive/amount-honesty/plan.md#real-keystrokes`).
- **A held key is a second `keyboard.down` with `repeat: true`.** Enter in a field clicks the form's
  default button, and no `submit` fires once that button's handler disables it, so count the
  button's activations, never `submit` events (`implementations-plan/archive/keyboard-guards/plan.md#held-keys`).

- **Focus and the accessibility tree.** Chrome starts the first Tab after a click at the clicked
  spot: reach a control with `tabTo` and assert the next stop, never a walk from the page top. Read
  a ring with `focusRing`, which waits for the control's transitions (a shot taken sooner shows the
  ring mid-fade); on Firefox call `prepareKeys` first, since an unfocused page matches no
  `:focus-visible`. A click ends keyboard modality, so a script focus after it draws no ring
  whatever the CSS: prove a no-ring rule after a keyed activation
  (`implementations-plan/archive/home-onboarding-2/lessons/phase-4.md`). Prove `aria-hidden` or a live region from CDP's `Accessibility.getFullAXTree`
  with `DOM.resolveNode` (Chrome): `page.accessibility.snapshot()` gives no ignored flag and no
  element (`implementations-plan/archive/accessibility-1/lessons/`).

### Product couplings the harness respects

- **A change to when a window's Confirm enables reaches every e2e that presses it**, refusals
  included (`authwit-lifecycle`, `scope-refusal`): run those before the PR
  (`implementations-plan/archive/harden-security-fixes-2/lessons/phase-6.md`).
- **Worker readiness is the heartbeat**, not the target: `browser.waitForTarget(service_worker)`
  means Chrome registered the script; `launchExtension` waits for `nulo:liveness` in
  `chrome.storage.session` (30s). After a restart, gate with `waitForWorkerLiveness(page, afterTs)`
  on a heartbeat STRICTLY NEWER than `afterTs` (the dead worker's value survives in storage; a
  truthy check lies), and take `afterTs` from `readLivenessBaseline(page)` AFTER `stopBackground`
  returned: the old instance is gone by then, so anything newer came from a replacement. The
  heartbeat ticks every 10s, so a baseline read BEFORE the kill can be beaten by the old worker's
  final tick and pass before any replacement boots. A post-stop read may already be the
  replacement's first write, which costs one more tick — fine for a recovery gate, wrong for the
  one test that TIMES the first heartbeat (`sw-resilience`), which keeps its pre-kill baseline on
  purpose, as does `cold-wake-discovery`, which may not touch an extension page between the kill and
  its click. `readLivenessBaseline` throws unless the read is a finite positive value: a failed
  read turned into 0 would let any retained timestamp satisfy the gate. Read from an extension page
  (`chrome.storage` is undefined on the playground).
- **An extension restart is not a worker restart.** `runtime.reload()` closes every extension page
  and starts `chrome.storage.session` empty, on both browsers. A spec that drives one calls
  `allowSelfRestart` first (with developer mode off Chrome leaves an unpacked extension disabled
  after a reload, and every extension URL fails with `ERR_BLOCKED_BY_CLIENT`) and waits with
  `waitForExtensionRestart`, which needs an open extension page to close and, as `stopBackground`
  does, lets the launch's interceptions go across the restart. Chrome can then list the
  dead worker's target beside its successor's, and an attach to the dead one never answers:
  `backgroundOrigin` reads every listed worker, while `evaluateInBackground` takes the first
  (`extension-restart.test.ts`, FIREFOX.md's restart row).
- **An in-place update is an extension restart too.** The swap (`updateInPlace`) ends the release
  build's targets, and with the launch's interception held, a node request reached the guard as it
  ended an offscreen document still booting its PXE: the arrival suite's moved-Testnet case, which
  swaps right after `registerProfile`, failed its close in 5 of 25 Chrome runs. The swap runs under
  `withInterceptionsReleased`, as `waitForExtensionRestart` does: 0 of 15 after.
- **Read `chrome.storage` from an extension page**, never through a session on the worker target:
  that attachment is exactly what parks the worker's DevTools host across a restart (§3), and a page
  outlives the worker. `openPopup`, or the blank popup inside `launchExtension`.
- **`consoleErrors` is structurally blind to app `console.*`.** The console sniffer, first script in
  every extension page, reroutes the sniffed `console.*` methods to the worker's LoggerService, so
  `page.on("console")` sees only browser-emitted entries and the sniffer's saved originals
  (`console._log`). `pageerror` is reliable for uncaught throws and rejections on both browsers; on
  Firefox the driver relays them and native console errors (FIREFOX.md). `readSwLogTrail`
  (`fixtures/journal.ts`, `nulo:logs`, 2s flush debounce, bounded) reads the worker's log ring — but
  that flush is gated on `developerMode`, which e2e profiles do not enable, so it returns an empty
  trail unless the test turned Developer Mode on first (the toggles on `#/popup/settings/developer`,
  see the playground subsection); empty means not retained. An error the app
  catches and merely logs reaches neither fixture array, so an empty array is no proof of no errors
  (`implementations-plan/archive/e2e-deflake/plan.md#console-errors`). Assert on DOM, storage, or
  stage evidence instead. Both arrays restart empty at each `openPopup` and `openOnboarding`, so an
  assertion covers a window only if neither runs between the window and the assertion, and its
  teardown only once `waitForPopupClosed` has returned: a window answers the dApp before it closes.
  `waitForPopup` records the window it hands back from then on; an error the window raised earlier
  can be in neither array (Firefox's launch prints the add-on's latest exceptions at its close).
- **`chrome.runtime.reload()` disables an unpacked `--load-extension` build** (every later
  `chrome-extension://` goto is `ERR_BLOCKED_BY_CLIENT`). Never use it for harness state reset; when
  the product calls it (the migration barrier's Retry), check the CSP record first
  (`ctx.checkCspViolations()`), click, wait for the pre-reload write, then close at once and
  relaunch over the same `userDataDir` (`migration.test.ts` `retryAndReopen`). Firefox reloads the
  add-on in place instead, and its boot takes the retry token: a slow close kills that run midway.
- **The first-run onboarding tab.** `onInstalled` (`reason === "install"`) opens it before
  `launchExtension` can seed `nulo:onboarding:completed`, on EVERY launch: Chrome's `--load-extension`
  and Firefox's temporary add-on report `install` on each start, a reused `userDataDir` included. The
  fixture closes it by the id the worker stores in `nulo:onboarding:tab-id` BEFORE flipping the flag.
  Over a completed onboarding the page replaces itself with a popup window on `src/popup/index.html`
  and drops the id, often before the first read; there the fixture closes that window, found as a page
  target (Chrome's `windows.getAll` hides its tab URL without the `tabs` permission). A fresh profile
  requires the id, a reused one the id or the window, within 5s; the launch fails otherwise. Only a
  swap inside the running browser reports `update` (e2e README § In-place update). Onboarding specs
  open their own tab via `openOnboarding`.
- **Passkeys: the virtual authenticator is per FrameTreeNode**, not per browser context, and PRF
  state is not serialisable over CDP. Register, lock/unlock, the phrase reveal and the full backup are
  drivable in the SAME popup (`fixtures/passkey.ts` `setupPasskeyVirtualAuth`); cross-popup and cross-authenticator flows
  are not (`apps/extension/tests/e2e/PRF-NON-PORTABLE.md`). Keep the anchor popup open; across an
  in-place update, which closes every extension page, park that tab on `about:blank` and bring it back
  (`update-replay.test.ts`, the release-made passkey case). Firefox's
  authenticator is session-scoped (`credentialOutlivesPage`), and only there does the toolbar panel
  hand a passkey step to the passkey window (`toolbar-panel.test.ts`). A step that must stay
  in the page says so: `watchPasskeySurface` / `readPasskeySurface` record whether the card mounted and
  whether any window opened, as `passkey-paths.test.ts` asserts on both browsers. To refuse a step as
  a dismissed prompt does, use `refusePasskeyStep` (`fixtures/passkey.ts`): Firefox's authenticator
  turns verification off and back on, but Chrome's refuses every later step in 1–2 ms once a
  verification has failed, and CDP's `isBadUV` / `isBadUP` response bits fail nothing, so on Chrome
  the page answers that one request with Chrome's `NotAllowedError`. Both authenticators answer in
  milliseconds, so to read the page while a step waits on its passkey, hold the request with
  `holdNextPasskeyRequest` and release it once read (`passkey-retry.test.ts`). A page opened
  mid-test takes focus, and Chrome then fails a passkey prompt from the page it left as not
  confirmed: `bringToFront` the page that asks first (`raceMethodChangeElsewhere` in
  `helpers/profile-chaos/unlock-method.ts`).
- **A popup page opened while a session is open lands on Home once its bootstrap ends**, over any
  route set before that: wait for `#/popup/general`, then route it (`secondWindow`, `raceMethodChangeElsewhere`).
- **A mid-restore kill is two deliberately gated scenarios**, each enforcing its own contract: a
  kill at `service-restore` must roll back, a kill at `account-state` must recover. The
  `restore-gate` rendezvous anchors the kill at the named phase; a torn refusal is the failure
  (`network/backup-restore-sw-restart.test.ts`).
- **A popup that outlives a worker restart locks itself on reconnect — when the restart is a
  lock.** The port client reconnects synchronously inside its own disconnect callback, so the
  shell's connected flag flips false → true in one tick; `app.vue` watches it with `flush: "sync"`
  so every reconnect starts a boot run (a batched watcher saw no change and never did). That run
  resolves `locked` when the replacement worker restored no session — a strict-mode profile
  (bearerless record dropped at boot) or a retired or unreadable one; a lenient session restores
  and the run stays `active`. Under an
  auth-required popup route with a profile selected, `locked` enters the locked state through the
  same routine the lock event runs (`popup/lock-landing.ts` decides; `popup/reconcile-locked-boot.ts`
  reports `event-superseded` instead of acting when any event landed during the lookup — the boot
  path never bumps the event sequence). Approval windows (`#/windows/*`) carry no
  `isAuthRequired` meta, so there the run only settles; they gate their content on `isLogined`
  themselves. An explicit Lock over such a worker always announces itself: `lockActiveProfile`
  emits when `close()` had no in-memory session to emit over. A test that keeps a popup open across
  `stopBackground` waits for `#/popup/auth` to arrive on its own and never clicks Lock (the
  reconnect cleanup hides the control); `sw-resilience`'s open-popup test and the passkey canary's
  stage 4 on Chrome are the pins (ledger row 29). On Firefox, which will not end its event page under
  an open popup, the passkey canary closes the popup before the kill — its session-scoped credential
  survives that (`credentialOutlivesPage`) — and the fresh popup boots straight into the lock screen.
- **The playground sends every tx `NO_WAIT`**: `waitForPgResult` proves the node accepted the
  submission (a real proof on the canary lane), not mining. A test that needs the block waits on the
  node (`waitForTxMined` in `fixtures/aztec.ts`), as both canaries do; the wallet-UI `transfers` flow
  waits through prove → mine in the popup itself.
- **Home's Get started card mounts late.** It waits for the profile's flags, the Presto flag and
  both balance reads (the hero's 12 s cap, or the gas read's 20 s timeout against a node that does
  not answer), then lands above the token list and moves everything under it; with the middle
  scrolled, scroll anchoring moves `scrollTop` instead. A spec that measures or scrolls Home's
  middle calls `waitForHomeReminders(page)` (`fixtures/tokens.ts`) first, which waits on
  `home-scroller[data-reminders-settled="true"]`. Its rows also push the activity list below the
  fold, so a Tab walk there scrolls, and that scroll's event arrives a frame later: a spec that
  counts scroll events lets two frames pass before it arms (`rows.test.ts`'s `armNavigationProbe`).
  A password wallet's unsaved phrase is a step of the card, funded or not; only after Hide does a
  funded wallet show the urgent banner above the balance instead, until its phrase is revealed. A
  spec that frames Home without either reveals the phrase and taps Hide through the UI
  (`clearGetStarted`, `fixtures/profiles.ts`).
- **A storage seed over a row the wallet is still writing is lost.** Adding a token trusts it, then
  `setArrivalFloor` rewrites the trust row from the state it read, so a seed written between the two
  writes is overwritten. Wait for the service's last write before seeding: `seedPendingTrust`
  (`helpers/activity-seeds.ts`) waits for `trusted` plus `arrivalFloor` or `arrivalFloorPending`.

### Driving the wallet through the playground (dApp-shaped tests)

From `implementations-plan/archive/self-pay-setup-fix/`; `network/selfpay-phase.test.ts` is
the pattern.

- **`pg-status` reads `connected` once keys are exchanged**, before the emoji check is answered.
  Prove a check unanswered by its page still open on its grid (either answer closes it).
- **A first connection needs a wallet with no saved row for the playground.** On the file-scoped
  `localNetworkExtension` a later test's Connect is answered as a reconnection and opens no connect
  window: take `registeredExtensionPerTest`, then `switchToLocalNetwork`
  (`implementations-plan/archive/connect-split-1/lessons/phase-3.md`).
- **The playground keeps every input across requests.** A button reads whatever an earlier request
  left in its inputs, so a grant after `consumeAuthwit` asks under that request's owner and opens no
  window. Each request sets, or clears with `""`, every input an earlier request in its test
  changed (`requests` in `network/type-roles-windows.test.ts`).
- **The dApp never sees the wallet's real error.** A failed `simulateTx` / `sendTx` reaches the feed
  as `"The wallet could not process the request."` (the scrubbed envelope, by design). The reason
  is in the worker's log trail, retained only with Developer Mode on: toggle
  `settings-toggle-developerMode` + `settings-toggle-debugMode` on `#/popup/settings/developer`
  (reach it with `navigateByHash`, not `page.goto`), then `readSwLogTrail(popup, { match })`,
  polling for an entry with `timestamp >= <the cell's start>` past the 2s flush debounce
  (`swTrail` in the spec).
- **Wait for the popup AND the feed, not the popup alone.** When the wallet rejects before opening
  the execute popup, a bare `waitForPopup` is a blind 60s timeout. Race `waitForPgResult(method,
  seq)` against `waitForPopup` (`sendThroughPopup` in the spec) and fail with the feed row's message.
- **`opts.additionalScopes` admits SESSION accounts only** (`scope-enforcement.ts`). The canonical
  PrivateFPC harness passes `additionalScopes: [fpc]` to an EmbeddedWallet; through a dApp session
  that is refused before the popup. Drop it — the FPC mint reads no note the scope would unlock.
- **`executeUtility` returns raw return fields** (`UtilityExecutionResult { result: Fr[] }`). Decode
  in the playground (`decodeFromAbi(call.returnTypes, out.result)`) so the feed carries a string the
  test can `BigInt`.
- **A simulation's kernel output is not feed-readable** (`publicInputs.toJSON()` is a byte buffer).
  `apps/playground/src/lib/simulation-summary.ts` projects it: fee payer, private frames
  (contract / selector / argsHash), public call requests per phase (setup = non-revertible, app =
  revertible, teardown). Bind a simulate oracle to its call with
  `FunctionSelector.fromNameAndParameters` + `computeVarArgsHash(encodeArguments(fn, args))`; the
  loaded artifact exposes public functions only via `public_dispatch`, so an internal public
  function's selector comes from `FunctionSelector.fromSignature("name(u128)")`.
- **"Deployed" from the wallet's side**: the script cannot compute an extension account's
  initialization nullifier (no signing key, no instance). Read it from the summary — a never-sent
  account is simulated init-wrapped (root frame = the multicall entrypoint, the account nested); a
  deployed one runs its own entrypoint at the root.
- **Private balances and the PrivateFPC credit are notes only the extension's PXE holds** — read
  them through `executeUtility` with `scopes: [account]`, never script-side. Public balances (Fee
  Juice, `balance_of_public`) read script-side.
- **Never-sent × PrivateFPC credit cannot exist**: `PrivateFPC.mint` must be sent AS the claimer,
  which deploys it. The never-sent private shape is the fuel method (`FeeJuice.claim +
  mint_and_pay_fee`); credit (`pay_fee`) is deployed-only. The FPC debits MAX gas cost, so assert the
  credit DECREASED, never that it equals the receipt fee.

### Harness behaviours that look like product bugs

- **The extension pages' CSP refuses `page.addStyleTag`** (`style-src-elem`; the CSP record then
  fails the launch), and so a `<style>` element a spec appends itself: its rule never applies, so a
  scratch control built on it stays green. Test CSS goes through CSSOM: `new CSSStyleSheet()`,
  `replaceSync`, then `document.adoptedStyleSheets`. A `style` attribute copied in the page fails it too
  (`style-src-attr`): `cloneNode` of an element Vue styled records one, so a probe that lifts markup
  builds it from the element's other attributes. To stop a theme flip's transitions before a quick shot, `finish()` each of
  `document.getAnimations()`; a looping one throws and is left alone. A popup's `document.body` can
  still be null when `waitForPopup` resolves: observe `document.documentElement`.
- **A mouse drag can select nothing.** Chrome 152 starts no selection from a press between a
  glyph's middle and about half a pixel right of it, and a drag of one single move leaves a bare
  caret: press a quarter in from a character's outer edge and move in steps
  (`navigation.test.ts`'s `textEdge` and `dragSelect`). Firefox 153 and 158 keep the text a drag
  ends on even inside a `user-select: none` control, so a selection test bans only the controls a
  drag crosses (`FIREFOX.md`).
- **Chrome's created windows keep the launch size.** The launch passes `--window-size=400,600`
  (`fixtures/browser/chrome.ts:40`); under it `windows.create` honours `left` and `top` but not
  `width` or `height` (popups 400×600, normal windows 500×600), while `windows.update` honours
  sizes. A spec that measures a created window launches with `fixedWindowSize: false`
  (`network/window-placement.test.ts:46`). Headless Chrome also moves focus only when it creates a
  window: `windows.update({ focused: true })` and the seam's `bringToFront` fire no
  `onFocusChanged`. Firefox honours sizes and focus.
- **An approval window's page can have no viewport.** `waitForPopup` wraps approval windows with
  `target.asPage()` (`fixtures/popups.ts:62`). On that path the page is created by
  `CdpTarget.asPage`'s fallback with a `null` viewport (puppeteer-core 25.8.0, `cdp/Target.js:54-70`;
  a target whose page already exists returns that page instead), so it renders at the window's
  native size; `browser.newPage()` pages get the 800×600 default.
- **A vertical scroller reads as a sideways one.** `overflow-y: auto` makes `overflow-x` compute to
  `auto`, so every page scroller looks like a sideways scroller to a style check. Compare its
  `scrollWidth` with its `clientWidth` instead (`fixtures/type-roles.ts`'s `readInsideView`; the
  240 px gate excused boxes past the view this way until #1023).
- **Under mobile emulation, `innerWidth` grows to the content** (Puppeteer 25.8): a width check
  compares `scrollWidth` with the width the spec set
  (`implementations-plan/archive/landing-store-buttons/plan.md#mobile-emulation-width`).
- **`protocolTimeout` is set in two places**, Chrome's launch (`fixtures/browser/chrome.ts:59`) and
  Firefox's `puppeteer.connect` (`fixtures/browser/bidi-attach.ts:30`), both 300 s. Change them
  together: Firefox once ran on Puppeteer's 180 s default and cut `sendTransfer`'s 300 s wait short.
- **One `waitForFunction` is one protocol call**, so `protocolTimeout` caps it whatever its own
  `timeout`: a 600 s wait failed with a protocol error, not its own message. Poll in short reads and
  log what started the wait (`implementations-plan/archive/wallet-safety-fixes/plan.md#protocol-timeout`).
- **`inject(key)` returns `undefined` for a key no global setup provided; it never throws**
  (vitest 4.1.10). The smoke setup provides no `playgroundUrl`, so a module-level value built from
  it broke every smoke file at import. Read an injected value when it is used, and fall back with
  `??`.
- **A resting pointer hovers what opens under it.** On Chrome a card that appears under a still
  pointer matches `:hover` and gets `pointerover`, `pointerenter`, `mouseover` and `mouseenter`,
  with no `pointermove` or `mousemove` (Firefox unprobed). A hover assertion moves the pointer onto
  its target first.
- **A page a failed test left open keeps its subscriptions.** On a file-scoped browser it can take
  the next test's events first (an arrivals coordinator claimed the next test's receipt). Close
  every page a test opens when the test ends, pass or fail:
  `onTestFinished(() => page.close().catch(() => undefined))`
  (`network/incoming-arrival.test.ts:92`).
- **A hash change right after the popup opens can lose to its start-up navigation**, which lands
  later and takes the page back to Home. Wait for `#/popup/general` first; a deep hash straight
  after a reload can still bounce, so reach a Settings page through the nav.
- **`navigateByHash` returns when the hash changes**, but the router swaps the page later, after
  its guards, so a read straight after it can see the old page's rows. Wait for the new page's own
  rows, never for the hash (`implementations-plan/archive/layout-polish/plan.md#hash-navigation`).
- **A fresh popup document boots through the lock screen**, then advances once it finds the
  session, so `#/popup/general` shows before that redirect: settle on Home's account selector.
- **A page that goes back on its own success undoes a hash written before it lands**: Change
  password calls `router.back()` after its toast, and a hash written on the toast left the previous
  page drawn under the new hash. Wait for the route to leave first.
- **`navigateByHash` to the route the page is already on keeps that page, state and all**: Import
  account left on a preview never shows its file picker again. Leave for another page and wait for it
  first (`implementations-plan/archive/consent-display-2/lessons/phase-0.md`).
- **Home's `activity-feed-root` renders only for an account with activity or a token**, so a wait
  for it on a fresh, unfunded account fails; History's root always renders
  (`implementations-plan/archive/approval-scope-follow/plan.md#empty-feed`).
- **`page.waitForSelector` with a plain CSS selector resolves to `null`, never a handle.**
  `patchPagePolling` swaps it for a `waitForFunction` poll (`fixtures/dom.ts`),
  so a probe that reads a box from its result reads nothing: take the element with `page.$`
  after the wait.
- **The e2e price seed covers `usd-coin` only**, while the wallet also asks for `aztec`
  (`allCoingeckoIds`), so wherever CoinGecko answers, `refreshIfStale` or the 3-minute alarm
  replaces the $1 seed mid-test and every fiat figure moves. Wait for a priced figure, never
  for an exact one carried across a remount
  (`implementations-plan/archive/hygiene/plan.md#price-settle`).
- **A smoke launch holds no token list unless it asks for one.** The worker fetches on Terms
  acceptance, and a launch's seeded acceptance is a storage write no listener hears, so a plain
  launch prices nothing and shows no defaults. A spec that needs a priced token or the defaults
  launches with `tokenList: "held"` or the `listedExtension` fixtures (`fixtures/token-list.ts`;
  the e2e README's "The signed token list").
- **A quiet local network mints no L2 block.** Since Aztec 5.0 a block is minted only for a
  pending transaction (still so on 6.0.0-rc.1), so a helper that waits for N more blocks, or makes
  one with `.simulate()`, hangs. Gate the wait on a real signal with a time cap and drive blocks
  with a real `.send()` (`implementations-plan/archive/aztec-5.0-upgrade/plan.md#quiet-blocks`).

## 3. Kill or restart the background

There is ONE helper: `stopBackground(ext)` from `fixtures/browser` — a driver method, since the two
browsers end their background in unrelated ways. Import it; never copy it, never call
`worker.close()` or `Runtime.terminateExecution` in a test.

**Firefox** ends its event page through the privileged `chromeScript` channel and resolves once that
page's `performance.timeOrigin` is gone. Two things differ from Chrome and shape every spec: no
successor starts until the add-on's next event (the spec's next step — opening the popup, a dApp
click — is the wake; a dApp with a call pending is such an event too — the SDK heartbeats only while
a call is in flight — and in the two kills of `inflight-call-background-death` that open nothing,
with every alarm cleared, the successor is up within the budget: suggestive, one end-of-budget
sample per kill), and the termination is a polite suspension, so **with an extension page open
Firefox leaves the background running and still reports success** — close every popup first; the
helper rejects by name when the page outlives the call. A dApp page's content script does not hold
it. `storage.session` survives the kill on both browsers.

**Chrome**, in six lines. Chrome parks a stopped worker's DevTools host while any CDP session is attached and
hands that host — same target id — to the worker's next start, which under MV3 is milliseconds away.
Puppeteer's `worker.close()` is attach → `Target.closeTarget` → detach, so under load the stop lands
before the detach, the restarted worker inherits the old target, and `targetdestroyed` never fires
(three lost stops in sixteen under two cores). The helper sends `Target.closeTarget` from an
UNATTACHED browser-level session and races three outcomes: `targetdestroyed` by object identity, a
`performance.timeOrigin` strictly newer than the pre-stop reading on whichever worker target is live
(only a new instance can produce it; Puppeteer's own transient auto-attach can still park a host), and
a 15s deadline. Every probe races its own 2s budget, attach included, and releases its session without
awaiting. `Runtime.terminateExecution` aborts running scripts and leaves the worker alive with its
memory, session record and heartbeat intact — a test built on it exercises nothing.

After the call, the OLD instance is gone. Whether a new one is running depends on the test: a page
holding a port reconnects and wakes it at once; BEFORE the kill `cold-wake-discovery` clears the
alarms, opens the dApp page (a content script injects without messaging), closes the popup, then
closes Chrome's offscreen document from a scratch page (`closePxeHost`; left open, its clients
reconnected and woke a successor 50 to 350 ms after the kill, as measured) and closes the scratch
page, so the click is provably the first wake event; it asserts `backgroundAlive(ext)` is false
before clicking. Then
gate on the strictly-newer heartbeat from an extension page (§2), and expect the popup's boot path
(`popup/boot-session.ts`, `auth-guard.ts`): under strict security a restart drops the session, so
`ensureUnlocked` with a budget sized to the bootstrap (120s on the prover-ON canary) is the
recovery, not a route wait.

A dApp page connected across the kill does not hang: once the successor attaches its listener, the
wrapper answers the page's next `ping` / `secure-message` for the forgotten session with
`session-disconnected` (`wallet-sdk/stale-session.ts`), the pending call settles as `Wallet
disconnected` and `pg-status` reads disconnected. A spec that kills under a connected dApp therefore
reconnects **from the same page** — `unlockAfterBackgroundDeath(popup)` then `reconnectPlayground`
(`fixtures/send.ts`) — never by reloading it, and clears the alarms before the kill
(`chrome.alarms.clearAll()` in the last extension page) so the dApp's own traffic is the only wake
left. `network/inflight-call-background-death.test.ts` is the model: in flight, idle against a cold
background (heartbeat-dependent, seconds budget), idle against an attached one (rejected under the
5 s heartbeat interval, so only the `secure-message` branch can have answered).

A stage that can outlast the browser's idle reaper (a prover-ON canary) calls
`stopBackgroundIfAlive(ext)` (`fixtures/browser`): an absent background is already the restart, so
it returns false with a warning and the stage proceeds to recovery; a present one gets the real
kill. `stopBackground` called with no worker alive throws on Chrome (its own 15s `waitForTarget`)
— nothing in it wakes one.

Stage gates are `chrome.storage.session` rendezvous compiled in by the proverless build, each with
its own protocol: `proof-gate.ts` is presence-only and parks a tx right before `pxe.proveTx`;
`restore-gate.ts` names the phase (`service-restore` / `account-state`) and the worker ACKS by
writing `held` on the same record; `incoming-poll-gate.ts` matches a hold on `{profileId,
networkId, accountAddress, contract, txHash}` and publishes `discovery-held` / `released` /
`committed` on a separate status key. "Armed" is not "reached": wait for the ack
(`waitForRestoreGateHeld`, `waitForIncomingPollPhase`) before killing or asserting. `token-seeds.ts`
is a separately armed reader that must be written before the trigger. A gate's safety timeout
(15–20s) RELEASES with a loud log rather than failing the test, and the journal's `proving` stage is
written before the proof gate is entered and stays through real proving, so it does not prove a
park: a test that depends on the hold needs evidence that excludes a timed-out release (the ack, a
stage that can only exist while held, or an in-flight count that stays put across the window).
Always release in `finally`.

Arm an incoming-poll hold before the note it names can be committed: a tick that commits it between
its block and the arm leaves nothing to park, or a later scan parks after the record exists
(`expected { kind: 'note', … } to be null` at the while-held read), and the network build's 10 s tick
makes that window real. `deliverWhileLocked` delivers and arms while the wallet is locked, which
runs no incoming scheduler, so the unlock's own scan is the first that can find the note. A lock
resets a popup page's arrivals scope, so a case about a page that seeds on its mount opens a fresh
page after the unlock.

## 4. Diagnose a red run

### Flake or breakage

- A red gate is one of two things. Rerun once on a genuine flake fingerprint; fix breakage. Never
  neutralise the signal.
- **Discriminators**: the failure MOVES between reruns (different victims) and the captured page is a
  healthy wallet parked on the wrong route → flake; the SAME test fails three identical solo runs at
  retry 0 → real. All three retries red is NOT proof of breakage: retries run back to back
  inside the same starved window. Use the diff — no change near the failing subsystem plus a known
  fingerprint plus a busy queue → rerun first.
- Count fixture SHARING, not failures: twenty-two "identical" reds that share one fixture's setup
  call are one bug (`implementations-plan/archive/e2e-network-recovery/plan.md#shared-fixture`).

### Reproduce like CI

```bash
# From the repo root; e2e:agent resolves file paths from apps/extension.
taskset -c 0,1 bun run --cwd apps/extension test:e2e --retry=0 tests/e2e/<file>.test.ts   # smoke, ×N rounds
NULO_E2E_RETRY=0 NULO_E2E_PROVERLESS=1 taskset -c 0,1 bun run e2e:agent tests/e2e/network/<file>.test.ts
NULO_E2E_RETRY=0 taskset -c 0,1 bun run e2e:agent tests/e2e/network/frozen-account-canary.test.ts   # prover-ON
```

A release-shaped smoke, as the nightly's and release's `smoke-against-artifact` run it: build with
no `VITE_*` variable set and no `.env*` file (`_build-extension.yml` refuses the e2e and key flags),
copy `dist/<browser>` out to a path no other run uses as its `EXTENSION_PATH` (the smoke
teardown kills every Chrome loading exactly that path), then run with `NULO_E2E_ARTIFACT_RUN=1 EXTENSION_PATH=<copy>`
and without `NULO_E2E_MIGRATION_FIXTURE` or `NULO_E2E_CSP_REPORT`. It runs guarded like a source run;
`shipped-token-list.test.ts` is its one launch that reaches the live Testnet node, so a dRPC outage
reds that spec, by name, and nothing else.

The PR lanes check out the PR's head SHA (`github.event.pull_request.head.sha`), not the merge ref:
reproduce a red PR lane at that SHA. A branch whose last trunk merge fell between a UI change and its
e2e fix stays red there while its merge ref passes; merge the trunk again. A shard runs larger files
first when vitest has no results cache, so an edit that grows a file moves it in the shard's order.

Two cores is the amplifier: races that live in a 100ms window on a workstation widen to seconds. Run
the loop alone on the host, freeze the tree between rounds, and validate the fix under the SAME
amplifier (three rounds green is the bar this repo has used; `implementations-plan/archive/e2e-flake-fixes/`
shows a 3/16 → 0/16 before/after). A fix is not "raise the constant": a bigger deadline hides the
worker that refused to die.

### Evidence channels

- `pageerror` (uncaught throws, unhandled rejections; on Firefox through the driver's relay) and
  `readSwLogTrail` (poll past the 2s debounce; empty means not retained, not nothing happened).
- Do not rely on console output from a passing test reaching you. Probe by writing uniquely-keyed
  records to `chrome.storage` from inside the extension and dumping them to a real-disk JSONL with
  `appendFileSync`; test the dump path with one no-op probe first. Probe files are
  `_probe-*.test.ts`, env-gated, skipped by default; product-side probe strings must never ship (the
  CI `PROBE` grep).
- An inline sampler between the wait and the assertion HEALS the race it hunts. Run the sampler in a
  detached promise at the original assertion timing and await it afterwards.
- A route trajectory must POLL `location.hash` (vue-router uses `pushState`; `hashchange` never
  fires). A stage trajectory uses a pre-armed MutationObserver on the marker plus ONE final read
  bounded by its own small race — a 200ms poll adds ~1,500 evaluations and perturbs what it measures;
  an unbounded final read can hang the 300s `protocolTimeout` on a wedged renderer.
- Attribute a navigation race by wrapping `$router.push/replace` with stack capture in a throwaway
  probe and matching the chunk file + byte offset against the built bundle
  (`implementations-plan/archive/mac-identity-binding/plan.md#navigation-race`: four correct fixes
  where symptom-guessing produced wrong ones).
- `.e2e-state/exec-approvable-timings.log` (every `waitForExecuteApprovable`), `NULO_E2E_STAGE_LOG`
  records, `RetryErrorReporter` output, and `.e2e-state/` uploaded by CI on failure.
- Probe first, hypothesise second. Prototype a disruptive primitive (kill, disconnect, reload) in a
  twenty-line probe before hardening any wait on it — two arcs hardened waits on a kill that never
  killed.

### CI log forensics

- `gh run view --log` echoes the step's SOURCE script with near-identical timestamps before runtime
  output; grepping for `exit 86` or `retrying` matches the source and fabricates an event (such a
  misread has confirmed a boot retry that never happened). Use
  `gh api repos/{owner}/{repo}/actions/jobs/<id>/logs`, match on timestamps advancing, count real
  invocation markers, and mine at attempt level for reruns that cleared a first-attempt red.
- `[aztec-node] Address already in use (os error 98)` at boot is cosmetic (the wrapper's inner anvil
  loses a bind the setup already holds). The fatal boot signature is
  `deploy_aztec_l1_contracts … required arguments were not provided: --batch` — a `~/.aztec/current`
  drift; the setup resolves the toolchain from the pinned `@aztec-labs/aztec.js` and exports
  `FORGE_BIN`/`ANVIL_BIN` into the node's env.
- A PR with ABSENT (not red) Actions is a CONFLICTING PR: GitHub builds no merge ref. Check
  `gh pr view --json mergeable,mergeStateStatus` before debugging CI.
- Every visible check green but `mergeStateStatus: BLOCKED`: capture `/commits/<sha>/check-runs`
  and repeated `mergeStateStatus` reads over two minutes BEFORE any remedy — an empty commit destroys
  the evidence (the duplicate-aggregator residue is still open, ledger row 28).

### Certifying a deflake

A qualifying green run: all required checks green, `run_attempt == 1` on every job, zero retry
markers in RUNTIME logs, no exit-86 annotation, the workload jobs ran BY NAME (a paths-filter skip is
not a pass). Certification triggers are empty commits so N consecutive greens describe ONE tree; any
change to what is certified resets the count.

A change to a process- or timing-sensitive test helper is certified locally before CI sees it: the
file ten times as is, then twenty times with vitest, its workers, the spawned processes and three
busy loops pinned to one CPU (`taskset -c <n>`, which also leaves the host's other agents alone) —
ledger row 35 showed only there, and its second double read only once the first was fixed. A static
read of the diff, by any reviewer, does not see a fact read twice across time; the batches
do. Never edit the file or its module while a batch runs: a mutation check that overlapped one
batch put the mutant's failure into the batch's tally.

## 5. Flake ledger

Every named fingerprint with a root cause. Full stories live in the linked records; `(open)` rows carry
the sanctioned response.

| # | Fingerprint | Mechanism | Fix | Status |
|---|---|---|---|---|
| 1 | `stopBackground: the service-worker target was still alive 15s after close()` (`stopServiceWorker: …` before the helper moved onto the driver; also `Target.detachFromTarget: No session with given id`) | attached `worker.close()` races Chrome's parked DevTools host; restarted worker keeps the target id | unattached `Target.closeTarget` + `performance.timeOrigin` witness (`fixtures/browser/chrome.ts`) | fixed, `e2e-flake-fixes` |
| 2 | `Expected no popup but 1 new popup target(s) appeared: …#/popup/auth` (`wallet-locked-mid-session`) | URL-keyed popup diff; an existing page re-routed to `#/popup/auth` under the lock redirect; the unowned first-run tab fed it | identity-keyed diff in `callExpectingNoPopup`; `launchExtension` closes the first-run tab before the flag flip | fixed, `e2e-flake-fixes` |
| 3 | `ensureUnlocked: lock state never settled within 30s (hash: #/popup/auth, …)` after a restart on the prover-ON canary | slow bootstrap under load, AND a first post-restart RPC rejection with no retry path (`isSessionChecked` stuck) | `resolveBootSession` + `lookupActiveProfileWithBackoff` (60s), `data-boot-outcome` + `boot-retry`; harness presses retry once, `decisionBudgetMs: 120_000` on the canary | fixed |
| 4 | `waitForExecuteApprovable: not approvable after 10000ms: {…feeMethod:null…}` on `tx-sendTx-multicall-chunked` (case 33) while case 32 passes. The same symptom on the Firefox network lane, in `tx-sendTx-multicall` and `authwit-consume-smoke`, each green on rerun, has no established cause and is not given this row's (issue #185; `implementations-plan/archive/code-followups-1/plan.md`) | cold-shard fee estimation on the heaviest (7-call) simulation under the default 10s budget | none yet | **open** — rerun once; a second red on a quiet queue → run the file locally before touching the budget or estimation |
| 5 | canary prove-duration variance: `transfers` blows its 600s prove wait, or the canary's grant returns `status:"error"` on code-identical pushes | shared-runner prover-ON duration variance | `pg-error-text` dump on mismatch; sanctioned rerun | **open** — owner decision if it recurs (budget vs runner size). **Rule out row 31 first**: the same two symptoms appear when the proofs never ran at all |
| 6 | `TimeoutError: 10000ms exceeded` in `clickByTestId("execute-confirm-btn")` | "ops rendered" ≠ approvable (fee estimation settle) | `waitForExecuteApprovable`; 120s for cold callers | fixed, `e2e-deflake` |
| 7 | `TimeoutError: 5000ms exceeded` at `resetProfile`'s first selector | one-shot hash-equality wait raced vue-router; a competing `router.push` reverted the hash | settle-stable navigation with a monotonic dwell and one bounded re-navigation | fixed, `e2e-deflake` |
| 8 | `TimeoutError: 120000ms exceeded` in the old `waitForBalance` | freshness-blind body-text balance scan | `waitForFreshBalanceRow`; `waitForBalance` retired | fixed, `e2e-deflake` |
| 9 | `TimeoutError: 30000ms exceeded` waiting for the post-reset route (`opfs-storage`) | route wait raced the awaited purge cascade; tombstone absence is ambiguous | `captureSoleProfileId` + `waitForProfilePurged` first, route second | fixed, `e2e-deflake` |
| 10 | `TimeoutError: 90000ms exceeded` after a full-backup import (`backup-roundtrip`) | route gated on `isLogined`, which waited on an RPC-bound sync | bounded 45s account-state preflight + registration budget | fixed |
| 11 | `theme-dark-btn` click timeout in `appearance` | one-shot `offsetParent` sample raced the dropdown's leave transition | `data-dropdown-open` / `data-toggle-active` gates | fixed, `e2e-deflake` |
| 12 | `connectPlayground:awaitVerifyPopup — Timed out after waiting 30000ms` | approval popups' `:disabled` omitted `!requestId`; a click after mount but before `loadInteractionPayload` hit a silent early return | `!requestId` / `!session` in every `:disabled` gate | fixed, `e2e-network-recovery` |
| 13 | `waitForPgResult` 30s timeout on the SECOND RPC of every `dappConnectedExtension` test | `handleSetActive` read a route-param computed after an `await`; the helper's own navigation made it `undefined`, so the popup's network watcher bailed | snapshot the reactive value before the `await` | fixed, `e2e-network-recovery` |
| 14 | every fixture times out at 30s polling `nulo:liveness`; `__dirname` in `dist/chrome/assets/noirc_abi_wasm-*.js` | dual-bundle package lost its `module` field and the worker got the Node CJS build | conditional `exports` map in the patch | fixed, `e2e-network-recovery` |
| 15 | `61 skipped`, exit 0 | deploy failure provided `aztecTestConfig: undefined`; every `describe.skipIf` skipped | `E2E_REQUIRE_SETUP=1` fail-loud | fixed, `e2e-network-recovery` |
| 16 | `sw-resilience` "strict mode ON → lock on respawn" skipped as "intrinsically flaky" | the kill never killed (`Runtime.terminateExecution`) | real kill; the test passed for the first time | fixed, `e2e-deflake` |
| 17 | `sw-resilience` "strict OFF → silent restore" premise never held | config toggle sent via `chrome.runtime.sendMessage` to a port-only service; silently dropped | drive the real Settings toggle and assert the flag | fixed, `e2e-deflake` |
| 18 | stale post-restart heartbeat satisfied a truthy liveness gate | the dead worker's value survives in `chrome.storage.session` | strictly-newer gate against a pre-kill snapshot | fixed, `e2e-deflake` |
| 19 | `backup-restore-sw-restart` / `frozen-account-canary` restart stage vacuous | same fake kill | `restore-gate` rendezvous rewrite (`e2e-deflake`); canaries consolidated onto the shared helper (`e2e-skill-refresh`) | fixed |
| 20 | `"Client disconnected"` from `deleteProfile` ~800ms after a real mid-restore kill | messaging client flipped to connected on a doomed port; the gap-issued call was rejected client-side | rollback gated on the worker's liveness advancing | fixed, `e2e-deflake` |
| 21 | `pxe op rejected: profile <id> is deleted (generation superseded)` after delete + same-id re-import | offscreen lifecycle map conflated the erased incarnation with its successor | fall-through for `deleted(different-gen)`; `profile-reimport-matrix` pins it | fixed upstream |
| 22 | `importFullBackup` 300s lapse (`backup-restore-sw-restart` designed retry) | one undifferentiated wait spanning restore + activation | labelled stage trajectory on lapse; no stage warranted an early-fail window (30 imports measured) | closed, `import-stage-deadlines` |
| 23 | `consoleErrors` empty on a visibly logged app error | console sniffer (§2) | permanent by design; use `pageerror` + `readSwLogTrail` | closed |
| 24 | deterministic 5 migration reds at ~90s locally, green in CI | unarmed dist (`VITE_NULO_E2E_*` flags) | markers + stamp preflight + `agent.sh` assertions | fixed |
| 25 | `foundryup` HTTP 502 in CI setup | unpinned, unconsumed toolchain step | step deleted; bundled toolchain asserted in `setup-aztec` | fixed, `e2e-deflake` |
| 26 | random early-stage timeouts in unrelated tooling after many local runs | sandbox datadir on tmpfs pinned RAM via deleted-but-open LMDB files | datadir on real disk + `e2e:reap` | fixed |
| 27 | `authwit-lifecycle` revoke pin passed before revoke existed | `handleSendTx` ignored a session-authorised `opts.from` (sent as account A) | `resolveNetworkAndAccount(requestedFrom)` | fixed, `network-e2e-required` |
| 28 | every check green, `mergeStateStatus: BLOCKED` on a labelled PR | duplicate concurrency-cancelled runs leave FAILURE aggregators; the believed "latest-per-name" mechanism was refuted by measurement | `pr-quick.yml` dropped `labeled` triggers; blocks remain unexplained | **open** — capture evidence before remedying |
| 29 | `passkey-execution-canary`: `waitForHash(#/popup/auth)` 15s timeout after the header lock, first seen on the first REAL restart the stage ever ran | the replacement worker holds no in-memory session, so `SessionManager.close()` clears the persisted record without emitting `onActiveProfileChanged`; the event-driven redirect never fires; the reconnect boot's `locked` result routed only when no profile was selected, so the open popup kept its page (`implementations-plan/archive/e2e-skill-refresh/plan.md#locked-reconnect`) | product: `lockActiveProfile` emits when `close()` did not; the connected-flag watcher is `flush: "sync"` (a synchronous reconnect never fired the batched one, so no boot run ever ran for an open popup); a locked reconnect boot under an auth-required route locks the shell, fenced against the event path; harness: post-stop liveness baselines, the canary asserts the automatic landing (`restart-lock-truth`) | fixed |
| 30 | `import-dead-rpc` STATEFUL: `stub saw: [aztec_getNodeInfo]`, `expected -1 to be greater than 0`, the test finishing in ~13s (REFUSED's time) instead of ~36s (on a nightly) | CDP `Fetch` interception armed from Puppeteer's `targetcreated` raced the target's first request: Puppeteer resumes a new target (`Runtime.runIfWaitingForDebugger`) in the same tick it emits the event; the offscreen document is created at the account-state leg and its first request is the PXE boot call, which escaped to the real (refused) seed port and fast-failed the registration leg | `helpers/rpc-intercept.ts` runs its own browser-level `Target.setAutoAttach` with `waitForDebuggerOnStart` and resumes each target only after `Fetch.enable` — Chrome holds a target until every waiting client resumes (per-session navigation throttle). Rule: anything that must be armed on a target before its first request cannot hang off `targetcreated`; hold the target. `NULO_E2E_INTERCEPT_LOG=1` prints `attached … (held)` per target | fixed |
| 31 | prover-ON canary: `frozen-account-canary` grant returns `status:"error"` ("The wallet could not process the request.") and/or `transfers` never reaches "Transaction submitted"; the job notice reads `N /prove requests, M successful proofs` with M < N; `presto-server.log` has `Failed to fetch release metadata … status=403 Forbidden` then `Cannot verify bb v<x>: no digest available from GitHub API` | Presto downloads `bb` lazily on the first `/prove` and refuses an unverified binary; the digest lookup is an ANONYMOUS GitHub API call (60/hour per source address, shared between runners). `presto-server` 1.1.1 — the build pinned at the time — sends no `Authorization` header, so the `GITHUB_TOKEN` the start step passes was inert; every `/prove` fails until a lookup gets through, and each failed proof is a failed test (`VITE_NULO_PRESTO_REQUIRED=1`, no fallback) | pin moved to `presto-server` 1.1.2, the first release that sends the token, so the lookup is authenticated (1,000/hour per repository). If the fingerprint returns, check the pin did not fall below 1.1.2 and that the start step still passes `GITHUB_TOKEN`; a re-run clears a one-off. Diagnose in seconds: the assert step now prints the server's WARN/ERROR lines when requests outnumber proofs; the full log is in the `network-e2e-logs-canary` failure artifact | **fixed** — `presto-server` 1.1.2 pinned |
| 32 | a dApp call hangs after `stopBackground`: `sendTx` / `getChainInfo did not settle within 30000 ms (background alive now: true)`, `pg-status` still connected — the successor is up, the page's session is not | SDK sessions live in the background's memory; the successor's `handlePing` / `handleEncryptedMessage` drop a session they do not know in silence and the dApp waits out its own 300 s ceiling. Not a flake: the product had no reply for a forgotten session | the content wrapper answers an unknown session's `ping` / `secure-message` with the SDK's `session-disconnected` (`wallet-sdk/stale-session.ts`); `network/inflight-call-background-death.test.ts` pins the rejection on both browsers (§3) | fixed, `firefox-arc-closeout` |
| 33 | a green canary job that proved nothing: a Firefox canary job listing fewer files than Chrome's, or a canary under `describe.skip` (or deleted) while the job stays green | the lane lists were hand-mirrored, and the job's verdict was its exit code plus a file count — each canary file also carries a setup-contract test that passes on its own, so a skipped or missing canary leaves the file "passed" | `scripts/ci-cd/behavior-gating.test.ts` "canary lanes": every `*-canary.test.ts` on disk runs under a `canary*` label with `proverless` not true, is out of the pool, the pool equals the union of the dedicated lists, every aggregator `needs` is read — over all four lanes; and `Assert canary results` on every `canary*` label reads vitest's json report (`NULO_E2E_RESULTS_FILE`, added by `e2eReporters()`) against `scripts/ci-cd/canary-expectations.json`: every listed file present, nothing skipped, the named title passed (`scripts/ci-cd/assert-canary-results.ts`, fixtures from real runs) | **closed** — the pins and the step ship together (`firefox-arc-closeout`) |
| 34 | `TimeoutError: Waiting failed: 5000ms exceeded` waiting for what a `pointerClick` should have opened, the pressed control sitting in a popup that had just appeared (`popup-escape-layered`, one Chrome network shard) | popups then entered sliding 40px over 300ms (`.slide-enter-from`; a sheet now fades in where it rests, but a card still moves when the stack changes); `pointerClick` read the centre mid-slide and pressed a round trip later, after the control had settled past it — a 16px control misses on any move over 8px, and the hit test passes at read time, so nothing fails until the menu never opens. A banner the node read adds above the control was the first suspect; a sampler showed the control held still through it | `pointerClick` reads the centre only once three reads 50 ms apart give the same box and no ancestor still carries `*-enter-from` (`waitUntilStill`; after 5 s a still control is pressed where it stands). Under `emulateCPUThrottling(6)`, pressing at once: old helper 4/8 missed, new 0/8 (`implementations-plan/archive/popup-escape-closes/plan.md#still-control`) | fixed, `popup-escape-closes` |
| 35 | `webdriver-ownership.test.ts` (the unit suite, not e2e): `expected [] to deeply equal [ <pid> ]` (a fresh child missing from its owner's scan) or `expected true to be false` (release took a mid-exec child for gone), on a loaded runner only; then `process <pid> never showed its marker` in 7 ms | Bun's `spawn` returns while the child is still inside execve, and until the kernel has set up the new image `/proc/<pid>/environ` reads EMPTY (1 990 of 2 000 immediate reads on Bun 1.4.2, 0 on Node 24); the unit suite runs on Bun. A child that execs again (`sh -c "… exec sleep"`) reads empty again, so a second read of a fact a wait already saw can land inside that exec | one sighting is the proof: assert on what the wait saw, never re-scan (`spawnMarked`, the setsid case); teardown (`fixtures/browser/ownership.ts`) deletes a profile only after two empty scans a poll apart and signals a process on whichever poll first finds it. Reproduced only with the file pinned to one CPU beside three busy loops: 2 of 10 runs failed before, 0 of 20 after, 0 of 30 unpinned (`implementations-plan/archive/popup-escape-closes/plan.md#spawn-environ`) | fixed, `popup-escape-closes` |
| 36 | `waitForTarget: no matching target after 10000ms` after the contact row's Ctrl-click in `rows.test.ts`, Firefox on CI only (4 of 6 attempts), with vue-router `pagehide` warnings from the unclosed tabs at teardown | the tab opens, but Firefox's BiDi announces a tab only through its first browsing context, once it has seen that context's document, and sends nothing when the context is discarded first; a link's tab is replaced 9–25 ms after it opens and the replacement is filtered, so `targets()` never lists it. Read in Firefox's source and timed in a probe; the CI trigger is inferred, since no local run lost the race (48 probed clicks, pinned to one busy CPU included) | `waitForNewTab` on the driver: Chrome diffs `targets()`, Firefox diffs the classic handle list and closes by handle from chrome scope (FIREFOX.md). `onboarding-tab.test.ts`'s `tabs.create` wait has the same dependency, no failure seen (`implementations-plan/archive/ux-feedback/plan.md#firefox-new-tab`) | fixed, `ux-feedback` |
| 37 | `Waiting failed: 15000ms exceeded` for `select-token-row[data-symbol="ALT"]` after the click on `send-token-trigger` (`send-picker.test.ts:35`), Firefox only (a `dev` nightly, two `ux-feedback` PRs, one local gate); its retries then fail on the rows (`['ALT', 'ALT', 'TST']`) and, at four rows, on the search box | the Send page draws its token trigger before its tokens load, and until then a click opens the import popup, not the picker; the test clicked it once it was visible. A probe reproduced it: a click the moment the trigger was drawn opened the import popup 32 of 32 times, on both browsers, with and without the stack; the token was drawn as little as 3 ms before the test's own clicks, and one of ten on `dev`'s Firefox came before it. No sighting recorded which popup opened. Once an attempt has imported ALT, the file-scoped `tokenReadyExtension` keeps it, so each retry adds another | the test opens Send through `openSend`, which waits for `send-from-type`, drawn only once the token has loaded. Rule: wait for what only the loaded page draws, never for a control both states draw (`implementations-plan/archive/ux-feedback/plan.md#loaded-page-wait`). Retries reuse a file-scoped ALT fixture, so a retried body never deploys or imports a second ALT (`implementations-plan/archive/e2e-reliability-fixes/plan.md#file-scoped-fixture`) | fixed, `ux-feedback` |
| 38 | `frame got detached` in the launch fixture's liveness wait (`fixtures/extension.ts`), then every in-test retry failing with the test-scoped fixture `undefined` (a PR's Chrome smoke, `onboarding-tab`) | Chrome's scratch page was the popup: on a fresh wallet it redirects to the onboarding tab and calls `window.close()` once the worker answers its first lookup, before the fixture seeds `nulo:onboarding:completed`, and Chrome honours the call. That is the supported hypothesis, not the established cause: a browser disconnect takes the same path. vitest 4.1.10 then keeps a test-scoped fixture marked initialized after its setup threw (`@vitest/runner` `chunk-artifact.js:350-357`), so every retry skips the setup | both drivers open the setup page (`src/setup/index.html#/install`) as the scratch page, which nothing about onboarding state closes. A probe forcing the redirect before the seed lost the popup scratch page 10 of 10 on Chrome, and kept the setup page 10 of 10 on both browsers (`implementations-plan/archive/e2e-reliability-fixes/plan.md#scratch-page`). The runner defect is not worked around: check any vitest bump with a fixture-retry repro | trigger fixed, `e2e-reliability-fixes`; runner defect open upstream (vitest-dev/vitest#11237, fix vitest-dev/vitest#11238) |
| 39 | `network/backup-restore-integrity`'s import parks on the Continue-gated errors screen with every network "ran out of time", then `importFullBackup`'s 300 s wait for the success route lapses; `backup-migration-roundtrip` imports the same kind of export | the export writes account-state for every network whose node answered, so the funded wallet's backup also carries items for the Testnet and Alpha seeds (9 and 7 contracts in the probe's exports); the import registers them over public RPC (dRPC) on a fixed 30 s budget (`importChainSync.ts:34`), and one stalled call marks every network skipped | both tests keep only the funded chain's account-state items before re-sealing (`keepChainAccountState` in `helpers/backup-export.ts`, which throws unless a kept item lists the funded token's contract). A probe refusing every public origin read 0 hits on the filtered import on both browsers, and a hit within 2 s on a negative control carrying the sandbox item relabelled with a public chain (`implementations-plan/archive/e2e-reliability-fixes/plan.md#account-state-filter`). Whether an import should wait on public networks at all is an open product question | fixed, `e2e-reliability-fixes` |
| 40 | `expected 'nothing' to be 'tx-card'` at the icon press in `rows.test.ts`'s Home first-activity-row test, Chrome smoke (1 of 164 at a load average near 475); the file passes alone | Home's token card settles after the activity row shows: until its balances land it is its 32px header (the ghost rows wait 300 ms), and settled empty it is 139px, which pushes the row down 107px. The back helper returned once `tx-card` was visible, `centreOf` read the icon's centre and a later evaluate hit-tested that point, so balances landing in between put the point on the card's empty state, whose text has no testid ancestor. A probe that held `getTokenBalances` across the measurement reproduced it on both browsers | `backToHome` also waits for `tokens-empty-import-link`, which only the settled empty card draws, so every position read after it sees the settled layout. Rule: before measuring on Home, wait for what only its settled token card draws, not for the row alone (`implementations-plan/archive/e2e-reliability-fixes/plan.md#settled-card`) | fixed, `e2e-reliability-fixes`; the empty-card wait widened in row 44 |
| 41 | `BiDi socket ws://127.0.0.1:10080/session/… failed to open` (`fixtures/browser/bidi-attach.ts`) while Firefox logged `WebDriver BiDi listening on ws://127.0.0.1:10080` (Firefox smoke, `onboarding-tab.test.ts`, 1 of 164) | `reservePort` drew uniformly from its static window, [10000, the ephemeral floor − 512), which holds one Fetch bad port, 10080, so about 1 draw in 22k landed on it. Node's WebSocket (undici) refuses a bad port before opening any TCP connection: a raw listener on 10080 saw none, on 10079 and 10081 one each. Browsers (Chrome's `ERR_UNSAFE_PORT`) and undici's fetch refuse bad ports too, so a node, anvil or playground port drawn there fails the same way | `reservePort` skips every port on Fetch's bad-port list, which it keeps as a named set equal to the Fetch standard's table; a unit test drives every draw onto 10080 and fails if any bind tries it, which stays red when another process holds 10080 (`implementations-plan/archive/e2e-reliability-fixes/plan.md#bad-ports`) | fixed, `e2e-reliability-fixes` |
| 42 | `network/transfers.test.ts` step 2, `Waiting failed: 300000ms exceeded` in `waitForToast` after "✓ Initial balance", Firefox prover-ON run locally (the canary leg); the popup shows "Send failed · Simulation failed, transaction not sent" at +60 s | the popup's `ExecutionServiceClient` keeps the 60 s default RPC timeout (`DEFAULT_RPC_TIMEOUT_MS`, `packages/extension-messaging/src/background/client.ts`), and `executeTransfer` answers only after proving and sending. Without Presto, Firefox proves in the browser, 86 to 94 s for this transfer on the build host, so the popup rejects with `RpcTimeoutError` while the transfer goes on to succeed (its journal row reaches `succeeded`); ux-feedback's batch 1 read the same wait as WASM proving past 300 s. CI's Firefox canary proves through `presto-server`, so it stays green there, until `NULO_E2E_DISABLE_PRESTO=1` | fixed by the failed-send check: the popup's execution client gives `executeTransfer` a 60-minute deadline (`apps/extension/src/wallet/services/execution/client.ts`), and `network/transfers` then passed on Firefox without Presto (`implementations-plan/archive/failed-send-check/plan.md`). Reproduced on the base commit before the fix branch (`implementations-plan/archive/e2e-reliability-fixes/plan.md#rpc-60s`) | fixed |
| 43 | `expected [ '$1,046.00', '$1,052.00' ] to deeply equal [ '$0.00', '$1,052.00' ]` at the last assertion of `expectCalmArrival` in `network/incoming-arrival`, on its second call (Chrome under emulated reduced motion), one Chrome network shard on CI (shard 2/5) | read in the code and reproduced with the price replies held: `setAnimationsDisabled` returns to Home through `waitForHomeTotal`, which waits only for the hero's skeleton (`balance-hero-loading`) to go. The remounted hero then values a holding with no quote yet at $0.00 (`usePrices` starts empty and fetches its quotes after mount), so `heroBefore` read "$0.00" and the sampler's first value was the priced $1,046.00, before the receipt's $1,052.00. The first call, after "Disable animations", has the same exposure. The shard passed on re-run with no code change, which fits this settle race | `expectCalmArrival` reads the hero only once it shows a priced figure, a dollar amount other than $0.00, on both calls. With the price replies held across the read, the old check failed and the new one passed on both browsers (`implementations-plan/archive/hygiene/plan.md#price-settle`). Rule: on Home, a fiat figure is settled only once the quotes have landed, not when the skeleton goes | fixed, `hygiene` |
| 44 | `Waiting failed: 15000ms exceeded` in `rows.test.ts`'s `backToHome` on every attempt, both artifact smokes (two nightly runs); the first Tab walk lists no `tokens-empty-import-link`, the retries' walks two `tokens-card` | row 40's wait assumed an empty token card, which only the source build draws: its smoke arms the seed list empty (§1, build-armed tests), while an artifact runs the shipped list, whose default tokens draw rows where the empty state would be. An empty shipped list hides the failure until a seed ships; then a red `smoke-against-artifact` also stops `release.yml`'s `attach-assets` | the wait takes the empty state, or token rows none of which is still loading (a default token's placeholder in a non-terminal status, a balance's first sync, an import row), and also runs when the test first opens Home, where the defaults land. Against a release build's artifacts the old wait failed and the new one passed 4 of 4 on each browser, its first wait 5.4 s on Chrome and 8.1 s on Firefox. Rule: a smoke test's wait must also hold for the artifact smokes, which run the shipped default tokens. With the four V6 testnet seeds the wait reads `tokens-list[data-settled="true"]` (both snapshots answered) with no row loading, ghost rows included, gives the first wait 150 s for the seeder's retries, and scrolls the row into view before the hit-test, since three seeded rows push it under the bottom nav | fixed; tightened for the V6 seeds |
| 45 | `TimeoutError: Waiting failed: 2000ms exceeded` at `selectFeeMethod`'s commit wait (`fixtures/helpers.ts`), `network/fee-methods` "transfer with private Fee Juice", the Firefox heavy job at retry 0 (twice, 5.6 s and 5.9 s into the test); the file passed on rerun | the Send card draws Private Fee Juice disabled and no sponsor row until its first FPC and balance read lands, a forced read on every Send mount, while the amount input the test waits on enables on the token balance alone. The helper clicked the row in-page as soon as it was drawn; a disabled row drops the click and the menu closes on it, so the trigger kept showing another method. Read in the code; the chaos run's 2 s miss, which `send-burst` answered with a click retry, fits the same drop | `selectFeeMethod` clicks through `clickByTestId`, which waits for the row to be enabled; every wait takes `mountTimeoutMs` and names what it saw on a timeout; the spec passes 30 s and the retry is gone. Rule: as row 37, wait for what only the loaded card draws, an enabled row | fixed |
| 46 | `TimeoutError: Waiting failed: 1000ms exceeded` in `waitForToastGone` at `passkey-retry.test.ts`'s closing check that the "not confirmed" toast is absent, local smoke with three or four browsers running at once (once on Chrome, once on Firefox); the file passed alone every time (8 of 8, 2 of 2) | the check's 1 s budget also covers its first poll's protocol round trip, which a loaded host can exceed while the toast is already gone. The error toast stays until closed, so a real return would fail at any budget | none: rerun the file alone. CI's smoke runs files one at a time and has not shown it | open |
| 47 | `expected null to be 'queued'` in `same-token-concurrent-sends.test.ts` (heavy concurrent-confirm job, run 37790178426, the one rerun in 100 network-lane runs), then a cascade | on a popup reopen the executing-task snapshot lands before the journal's, so for 3 to 14 ms Home draws one stage-less awaiting card with no cancel control; the old helper waited for any card and read the first | `waitForAwaitingCard(page, stage)` returns only when exactly one `tx-awaiting-card` sits at `stage` with its cancel control, and names every card on a timeout; `RecentActivityView.test.ts` "hydration order" pins the orphan card. A live probe saw the stage-less card first on 12 of 12 reopens (`implementations-plan/archive/code-followups-1/plan.md`, `lessons/phase-2.md`) | fixed, `code-followups-1` |
| 48 | `Test timed out in 120000ms` in `network/price-fixture.test.ts` on a loaded host | the `feeJuiceImportedExtension` fixture's L1 bridge runs inside the test's budget: 105.8 s on Chrome, 88.6 s on Firefox | `{ timeout: 300_000 }`, the budget `fee-methods.test.ts` already gives the same fixture (`implementations-plan/archive/code-followups-1/plan.md`, `lessons/phase-4.md`) | fixed, `code-followups-1` |
| 49 | `TimeoutError: Waiting failed: 5000ms exceeded` in `navigation.test.ts`'s `clickBelowBar`, the wait for the compact title bar's opacity to reach 1 after the scroll (the History and Settings titles case), at retry 0 on Chrome: hosted smoke and local runs (#269) | the page's own defect, not the harness's: the Settings and History hero `IntersectionObserver` callbacks read the first of the entries queued since the last delivery; after a fast Tab walk and scroll two arrive together, `[true, false]`, and the page keeps "hero visible" while the hero sits 300 to 1100 px above the scrollport, so the bar stays hidden (4 of 12 diagnostic iterations, `implementations-plan/archive/e2e-followups/lessons/phase-0.md`) | the pages read the newest entry (`entries.at(-1)`): a delivery batches every change since the last, oldest first. Both pages' unit tests deliver `[true, false]` and `[false, true]`, red on the old read; the diagnostic loop then stuck 0 of 36 iterations, with twelve two-entry deliveries among them. The test, its wait and its budget did not change. Rule: an observer callback's newest entry is the current state | fixed, `e2e-followups` |
| 50 | `TimeoutError: Waiting failed: 2000ms exceeded` waiting for `tokens-menu-import` in `importToken` (`fixtures/helpers.ts`), `network/import-handshake-note-matrix` on Firefox at retry 0, after `switchToLocalNetwork` (#274) | the helper clicked the tokens trigger with `querySelector(...)?.click()`, which does nothing while Home is still mounting (6 of 6 in a probe: a hash change to Home, then the click), then waited 2 s for the item. `DropdownRoot` toggles on every click, so a blind second click closes an open menu | `openDropdown` (`fixtures/helpers.ts`): `prepareClick`, one page-side read-and-click of the last visible trigger that clicks only a closed menu, then a wait on `data-dropdown-open`, each stage naming the page's state on a timeout; `importToken`, `refreshBalances` and `setTheme` open through it. `navigation.test.ts` releases the navigation to Home on the opener's own first look: red with the old click, green with the opener on both browsers. Rule: wait for a trigger before clicking it, and gate a toggle on its own state, never on a second click | fixed, `e2e-followups` |
| 51 | `TypeError: error loading dynamically imported module: …/assets/auth-*.js` or `Error: Unable to preload CSS for …/assets/auth-*.css` in `ctx2.pageErrors` (`network/account-balance-orphans`, Firefox, retry 0) | `waitForLockScreen` reloaded the popup when the session record cleared before the hash reached `/popup/auth`; the reload departs a document still loading the auth route, and Firefox rejects its in-flight import (or the CSS preload before it) from that document, which the relay records. Reproduced exactly at 1 reload in 8; Chrome recorded nothing for a cut import | the helper observes the popup's own redirect within its 15 s and never reloads | fixed, `e2e-followups-3` |
| 52 | `JavaScript error: undefined, line 0: Error: Invalid window ID: N` on Firefox's stderr after an approval window answers (`cap-request-reject`, `connect-*`, `snack-placement`, `sim-from-selfpay`) | product: `closeCurrentWindow` removes its window with no handler, 0-2 ms after `WindowManager._settle` (handled) removed it; the loser rejects. It carries no window, so no array records it | none in the harness: the product fix is #312 | **open** — a stderr line alone is this known diagnostic; a recorded entry or a failed assertion beside it still fails |
| 53 | `the focused row send-fee-method-sponsored: expected '<8 hex>' to be 'e2e-protocol-fpc-1'` in `send-keyboard.test.ts`'s fee-picker test, the artifact smokes only (nightly 38130969762, Chrome; the same test passed on Firefox there) | an artifact run holds no node stand-in, so the live Testnet node lets the wallet's protocol-FPC discovery, started by Home's gas read once the profile exists, store a second Nulo sponsor beside the seeded one; the menu lists the two by id byte order and a random id before `e2e-` takes the first ArrowDown. Reproduced locally at retry 0 on two cores: 18 of 21 on the release build and 16 of 21 on the armed build in artifact mode, once on Firefox, 0 of 21 guarded | the spec redirects the Testnet origin to a 400 stub (`startNodeStub` + `interceptRpc`) on a fresh launch before `registerProfile`, and asserts no FPC row before the seed and exactly the two seeded rows after the picks (`fpcRowIds`); afterwards 63 of 63 Chrome runs and both Firefox runs green across both builds and both modes. Rule: a smoke spec that seeds what a node gives holds the node itself from before the profile exists (`implementations-plan/archive/e2e-followups-4/`) | fixed, `e2e-followups-4` |
| 54 | `waitForTarget: no matching target after 60000ms` in `grantCapBundle`'s capabilities wait (`network/send-chaos`, Firefox, one CI attempt; its retry passed), with Firefox printing `creator-*.js, line 5: InternalError: too much recursion` three times 0.3 s after the wait was armed | two findings. Firefox sends no `domContentLoaded` or `load` for an add-on page, and Puppeteer took a page's URL only from those or a history change, so an extension window read `about:blank` in `targets()` until its router wrote history, and for good when its modules failed to load: a forced throw at module evaluation reproduced the miss with the window open in BiDi and in the classic list. The recursion did not recur in 10 replays of the seed and 119 cold windows, so its document and cause are unknown, and the miss is that window only if the recursion was in it; an unannounced (row 36) or watch-closed window are still open readings | the shim hands Puppeteer the committed URL as a `historyUpdated` (FIREFOX.md), which also retired `waitForOpenedUrl`; `waitForTarget`'s failure lists Firefox's window handles beside BiDi's and Puppeteer's view and the watch's closes, switching no window, and the launch's close prints the relay's latest exceptions with their context and first frame; an error without a saved stack names the location it reports. Mapping `line 5` needs the failing build's chunk at the same hash | open, #322 |
| 55 | `waitForLockScreen`'s route step `Waiting failed: 15000ms exceeded` after a password change (`security.test.ts`, change password succeeds, Chrome, one CI attempt; 1 run in 10 on two cores locally), the session record already gone | the bootstrap's final `getActiveProfile` re-read and the lock queue back to back on the profile mutex, and the background posts the lock event before the read's stale "active": the popup seals, sets `isLogined` true again, and the guard bounces the lock's `/popup/auth` push (`duplicated`). The mutex orders calls, not the popup's receipt of answers and events | the seal supersedes every activation in flight (`supersedeProfileActivations` in `markLocked`), so no answer read before the lock sets `isLogined`; 150 of 150 locks landed on the fix, where 6 of 50 were lost on base | fixed, `e2e-followups-5` |
| 56 | `Waiting failed: 60000ms exceeded` waiting for `send-amount-input` to be enabled in `fillSendForm` (or its 120 s submit wait), `network/snack-placement`'s drained cases after `balanceDrainedBehindTheWallet`, both browsers under load (#349) | a wallet tx first seen mined below Finalized refreshes the account's balances twice: when mined and when the worker reads its block final, one read a minute after the mined commit (10 s on today's proverless build). The drain took about 60 s from the grant's mined commit to the spend, so the final read's refresh stored the drained 0 1-4 s after the spend, before Send read the balance; the idle queue before the spend could not see a refresh not yet enqueued. Base, two cores: 4 of 7 drained runs red on Chrome, the late write in 6 of 7 | before the mint the drain requires the grant, the account's only tx row, still awaiting finality, drives its block final (`finalizeThrough`), waits for it to read Finalized without `awaitingFinality`, then for a balance write newer than that commit and the idle queue (about +55 s per drained case). A widened copy that forces the final read after the spend was red on base 3 of 3 drained cases per browser and green on the fix 3 of 3; on the fix the amplifier passed 15 of 15 drained runs per browser. Rule: a barrier on the balance queue proves nothing about a refresh a tx row still owes; settle each wallet tx through its final read | fixed, `e2e-followups-7` |
| 57 | `TargetCloseError: Protocol error (script.callFunction): Target closed` (or `input.performActions`) from `bidi-attach.ts`'s `ws.onclose`, then `Test timed out in 90000ms` and `Cannot read properties of undefined (reading 'newPage')` on its retries (`legal-acceptance.test.ts` S10, Firefox smoke, CI only, 6 of 6 attempts; passes locally alone, in CI's file order, on 4 CPUs and on CI's Node 22.23.3) | the BiDi socket, then Node's built-in WebSocket, closed with code 1006, `wasClean` false and no `error` event 0.15 to 0.35 s after the test reached About. Firefox's RemoteAgent logged the connection closed without having received the client's next command; no close frame went either way, and Firefox and the classic session stayed up (teardown read the page-error relay over it). The retries' fresh connections in the same vitest worker died right after the upgrade. A change in the traffic exposed it (the popup's Register screen opening on Passkey, so the fixtures press Password first): reverting that, or opening the socket with `ws`, each passed every shard. Which end tears the connection down is not proven | `bidi-attach.ts` opens the socket with `ws` and the options of Puppeteer's own BiDi transport (`perMessageDeflate: false`, `allowSynchronousEvents: false`, a 256 MiB `maxPayload`); `ws` is a declared devDependency of `apps/extension` | fixed, `onboarding-3` |
| 58 | `AssertionError: expected 1 to be +0` at the gap check of `network/balance-row-reconciliation.test.ts` (Firefox network shard 1/5, run 39131018947, retry 0, #774) | the spec removed every `nulo:core:token-balances@*` row with a raw `chrome.storage.local.remove` from Home while the worker was live and unlocked. `applyProjectedOk` reads the row, runs its fences with no await, then writes `{...current}` back, so a projection that read before the remove wrote the row back before the re-read. A probe recorded projections 0.6-1.35 s after `tokenReadyExtension` returned on both browsers, and one at the incoming poll's 30 s tick (10 s on today's proverless build); with the worker stopped and the wallet locked, no balance write for 35 s. The interleaving itself cannot be parked: no await separates the get from the set | the gap is made after `stopBackground` and `waitForLockScreen` (strict mode boots the successor locked, with no token map, so nothing projects or creates a row until the unlock), and the repair must be stamped after it (`baselineUpdatedAt: gapMadeAt`; a baseline of 0 let a row written before the gap pass). A control with the unlock's reconcile removed reds at `waitForFreshBalanceRow`. Rule: seed a storage gap where no writer runs, never under a live worker (`implementations-plan/archive/e2e-flakes-2/`). Known limit #946 | fixed, `e2e-flakes-2` |
| 59 | `Error: legal-about-group's first character is off screen or covered` at `textEdge` (`navigation.test.ts`'s drag-select test, Firefox smoke, 3 of 3 attempts in run 39166471199; at the note, `:264`, once in run 39168239864; #816) | the test copies the header's address, which opens the `Address is copied` snack for 2 s plus a 150 ms leave. The enter and leave slide the card 20 px below its resting place (y 546-588), over y 588-608, where About's Legal title (593) and note (590.5) sit after the test's scrolls. Firefox reached them about 2 s after the copy, during the leave, and `elementFromPoint` returned the card (a probe read `snackbar-title`). The sub-page header was not it: it spans y 64-120 | `waitForToast` right after the click proves the snack opened, and `waitForToastGone(page, "Address is copied")` before About's first scroll, which counts a leaving card as present. Controls: a 4 s held leave reds the unfixed spec with the same message and passes the fixed one. Rule: a hit test under a snack the spec opened waits for that snack to leave, never a rescroll or a poll inside the hit test | fixed, `e2e-flakes-2` |
| 60 | `egress guard: <file>: the stand-in node's interception reported: a spec's interception: service_worker:…/service-worker-loader.js: reply to /aztec-testnet/<key> failed: ProtocolError: Protocol error (Fetch.continueRequest): Invalid InterceptionId.` at a launch's close, the spec green (`rows.test.ts`'s placeholder-row height test, Chrome smoke shard 2/3, every attempt on one tree, #857) | a spec's own `interceptRpc` stays armed through `stopBackground`, and its session stays attached to the stopping worker. A node request paused when `Target.closeTarget` landed was cancelled before the reply, and Chrome answers a reply under an id it no longer holds `Invalid InterceptionId.`, which `failUnlessGone` did not count as gone. A probe on Chrome 152 gave that exact string (a reply in the next tick succeeded); a caller's abort and an unknown id get the same, a second reply `Invalid state for continueInterceptedRequest`. Firefox's observer decides inside `http-on-modify-request` and reported nothing | `failUnlessGone` logs `Invalid InterceptionId` as gone; `scripts/e2e/chrome-rpc-intercept.test.ts` feeds the probed answers through Puppeteer's `ProtocolError` and pins each reply's method, id and target, since a wrong-id reply now reads as gone. Rule: classify a CDP answer by what a probe shows it proves, never by widening the regex blind | fixed, `egress-flake-1` |
| 61 | `Error: failed to find element matching selector "[data-testid="tx-terminal-card"]"` at `readTerminalCard` (`network/tx-sendTx-reject.test.ts`, Chrome network shard 4/5 of #896's run 39340471498; the send record already read `failed`, `user_rejected`) | the spec moves a fresh popup from Home to History by hash. The CI failure is consistent with a race a probe reproduced: the router loads History's chunk while Home stays drawn, so the fixture's wait met Home's card (6-33 ms); then History drew no card until its journal read returned (16-30 ms), and the fixture's separate `$eval` landed there. The probe threw the message on a cold first swap (1 of 20) and on every card removed between the wait and the read. An atomic read alone would have passed on Home's card | one `waitForFunction` that returns the card only once `nav-<tab>` is `aria-current="page"`; the caller names the tab (`fixtures/journal-page.ts`) | fixed, `terminal-card-flake-1` |
| 62 | `"restoreError": "Skipped: couldn't reach the network"` where `StringContaining "Skipped: ran out of time reaching the network"` was expected, after the Retry (`network/backup-import-stalled-network.test.ts`, Firefox network shard 5/5 of run 39348656493, #911) | the stub holds every Testnet call but the identity probe, and a browser opens six connections per host over HTTP/1.1. `dropUnanswered` reset the held calls' sockets, but a browser re-sends at once a request whose connection closes before any reply (both browsers on a reused connection, Firefox also on some new ones), so six copies refilled the pool and the Retry's probe timed out three times. Forced: red 2 of 3 on Firefox; a probe holding six calls on reused connections starved the next call 3/3 on each browser | `refuseUnanswered()` answers the held calls with the node stand-in's 400 (`refuseNodeCall`), which neither the transport nor the node client re-sends: 10/10 Firefox, 5/5 Chrome, forced green on both. Rule: end a held call with a terminal 4xx and a JSON-RPC body, never a reset (`implementations-plan/archive/stalled-retry-flake-1/`). Known limits #917, #918 | fixed, `stalled-retry-flake-1` |
| 63 | `viewers-csp` on Firefox smoke under load (#849): "a selection at the end holds the view" or the search case moves 36-72 px (`expectHeld`), or the follow case reds `scrolledAway` with no button shown | three causes. P1, product: the viewer's own follow scroll, landing after a selection or search-field stop, read as the reader scrolling back down and resumed the follow; Chrome masks it, since its `selectionchange` from CodeMirror's next selection rewrite re-stops the follow before that scroll lands, and Firefox's comes after CodeMirror's measure. T1: the follow latch read the gap in a capture listener, before CodeMirror's own listener landed a follow still due. T2: the hold's baseline was read before the drag, while the viewer still followed as it must | T1, the latch listens after the viewer, and the button's observer no longer stops it mid-dispatch; T2, the line is read two frames after the test's `selectionchange` sees the selection; P1, the follow leaves a reference no scroll exceeds until its own scroll event resets it, reading no geometry (a geometric pin forced a layout per followed line, +42.7% on Firefox's 500-line burst). Rule: a check reads the state where the component judges it, after its listeners | fixed, `viewer-flake-1` |
| 64 | `viewers-csp`'s search case: `expected 18 to be less than 10` (18-83) at its `gapToEnd` read after the refocus (#922; natural on Firefox in 1 of 8 runs) | the case scrolled back to the end itself and read the gap after refocusing the search field. A wallet line between that scroll and its event was held (F3's focus had stopped the follow), and the event then resumed the follow in the end band without scrolling, 18 px off the end. A wallet line after the refocus was held below the view. Both, forced, red 8/8 per browser on a correct viewer | the case holds one line, resumes the follow with the viewer's own scroll-to-end button (`clickByTestId`), reads the gap while it follows, then refocuses the field and measures the hold from two frames later. Rule: reach a precondition through the component's own control, and read it while the component's rule makes it certain | fixed, `viewer-followups-1` |
| 65 | `TimeoutError: Waiting failed: 15000ms exceeded` in `reopen`'s `waitForHash(page, "#/popup/general")` (`fixtures/burst-account.ts`), then `transfer 10000000000000000000 left the queue without an accept` in the Urgent re-ask case, the row at `proving` (`network/same-token-concurrent-sends.test.ts`, Firefox heavy concurrent-confirm shard, run 40609217178, retry 0; its rerun passed; #1300) | not reproduced. Ten shard runs at retry 0 on four CPUs of a loaded host, with a route trajectory and a 100 ms stall sampler in every reopened popup and B's queued cap read at the press, were all green: no reopen took over 1.6 s to Home, no visible gap passed 200 ms, and B's queued cap was the seed's every time (`implementations-plan/archive/e2e-followups-1/lessons/phase-3.md`) | both failures now name what they saw: a `waitForHash` timeout the hash the page was at, the Urgent case the cap its review showed at the press beside the seed's | **open**: rerun once; on a second first-attempt failure of either, reopen #1300 with the new message. Another route or an overlay at the reopen is H3, a stall with a stack is H1, a reviewed cap that is not the seed's is H2b, the seed's cap with a built fee inside it is H2a (that plan's D7) |
| 66 | `TimeoutError: Waiting failed: 15000ms exceeded` at `token-list.test.ts`'s wait for the flagged `SCAM` row in the Send picker (Firefox smoke, 2 of 5 local runs at retry 0) | the spec seeded a token row with transfer functions and no balance functions, and the projector fills a side with no `balanceOf` function with "0" without asking any node, so the Testnet refusal could not hold the seeded balance: a background sync mid-test wrote a read zero, and the picker, which folds empty rows behind "N empty", hid the row | the seed names `balanceOfPublicFn` and `balanceOfPrivateFn`, so a refresh asks the refused node and keeps the seed; 4 of 4 Firefox runs of the file passed after, then both browsers' smoke gate. Rule: a seeded token row whose balance a spec relies on names both balance functions | fixed |
| 67 | `TimeoutError: Waiting failed: 15000ms exceeded` at `send-picker-add.test.ts`'s wait for the flagged add row (`select-token-add-token-flagged`), both `smoke-against-artifact` jobs, Chrome and Firefox (nightly of 2026-10-29) | deterministic, not a flake: an artifact run holds the published token list, which flags no pair, and the add row's flag has one source, the verified list, so the fixture pair the source run's list flags is never flagged there. Row 44's class: a smoke assertion that holds only for the source run's data | the flag-on-paste check runs in source runs only, in `token-list.test.ts`'s source-run `describe`; the Send picker spec keeps its flow in both modes (#1352). Before, red on both browsers against a release build at retry 0; after, green in both modes on both browsers. Rule: a smoke spec that needs the held list to flag a pair runs in that `describe` (`tests/e2e/README.md`, held list) | fixed, `nightly-smoke-1` |

## 6. Editing the harness

### `global-setup.ts` is a coordinator over stage functions

`reconcilePriorLock`, `ensureAnvil`, `ensureAztecNode` + `spawnAztecNode`, `ensureDevServer`,
`finishBoot`, `provideWithoutSandbox`. Rules from its audits, each guarding a real failure:

- **Probe first, gate second** (bare runs; an agent run skips the probe). Every `ensure*` starts
  with its health probe; binary and pin gates sit inside the "not already running" branch, or a
  healthy pre-existing node with an unusable pin throws under `E2E_REQUIRE_SETUP=1`.
- **`markBootStarted()` stays between `writeProvisionalLock()` and the first spawn.** Its position
  is the exit-86 contract.
- **Ownership order after a spawn: handle → `weStarted* = true` → `recordSpawnedPid()`**, before
  listeners and the readiness wait; `ensureDevServer` takes `setHandle`/`setStarted` callbacks for
  this reason. Never reset a `weStarted*` flag on a kill path; teardown's data-dir removal keys off it.
- **The reuse path owns nothing**: no provisional lock, `weOwnLock` false, `clearLock()` only under
  `if (priorLock)` after a reap; `markBootReady()` without `markBootStarted()`.
- **Skip exits share provides, not cleanup**: cleanup in the stage, `provideWithoutSandbox` +
  `return` in the coordinator.
- **Log pipes are per child**; anvil is stderr-only with `address already in use` in its needle set.
- **The default export's RETURN VALUE is the teardown.** A named `teardown` export beside a default is
  silently ignored by vitest (both setups leaked for the suite's whole life).
- **No INT/TERM trap in `agent.sh`**: bash defers those until the foreground child exits, so a
  trap protects nothing and clobbers the classified exit code. Its one trap is on `EXIT`, re-exits
  with the status it was given and only releases the run's registry rows. `process.on("exit")` in
  the setup signals a service's group only while its leader is unreaped, else each process still
  carrying the service's marker, SIGTERM only, and never clears the lock (a survivor must stay findable).
- **Ownership is the marker, never a pid.** Each service is spawned with `NULO_E2E_LAUNCH=<uuid>` and
  `NULO_E2E_OWNER=<pid>:<start time>` of the vitest process; an agent run's every process also
  inherits `NULO_E2E_RUN`, `NULO_E2E_RUN_OWNER` (`agent.sh`'s pid) and `NULO_E2E_WORKTREE`. Chrome
  overwrites its environ with its process title (browser and children), so it never shows a marker:
  Chromes are swept by extension path, at every setup and in `e2e:reap`.
  Teardown stops the group, then every process carrying the marker; an orphan sweep signals a
  process only when the owner in its own environ is dead, and nothing while the lock's `owner`
  lives (a reuse rewrites it). A zombie has exited, so `readStartTime` gives it no start time and
  every identity check (`identityIsDead`, `ownerLives`, a recorded pid) calls a zombie owner dead. `/proc` unreadable, or a claimed process turned unreadable (a
  zombie counts as gone), is `unknown`: the lock and the run dir stay, and the lock's pid and start
  time keep every later sweep `unknown` too while that process lives. A lock naming no owner is
  never signalled. The node's run dir is stamped with its marker and deleted only directly under
  `E2E_DATA_ROOT`. Setup and `e2e:reap` read, reap or adopt, and rewrite `owned.json` under
  `.e2e-state/reconcile.lock`, so two of them never act on one dead owner.
- **An agent run adopts nothing.** With `NULO_E2E_RUN_ID` set, setup bind-tests the claimed pack
  right after `markBootStarted()` and skips every adopt probe. Every readiness wait fails once the
  child it spawned exits, a pending probe included, and on Linux accepts only a listener held by a
  process carrying the service's marker; under `E2E_REQUIRE_SETUP=1` a playground that never comes
  up fails the boot. All of these are boot failures (exit 86, one CI retry on fresh ports).
- **Proof for a change here**: the full network suite on CI, the reuse drill (bare vitest on a
  pinned pack, `kill -9` the vitest group after deploy so the pack survives, run again →
  `reusing prior sandbox (identity check passed)`), the reap drill (`e2e:agent` after →
  `prior lock is for different ports — reaping orphans`), the fail-loud negative (empty `HOME` on
  free ports → the anvil FATAL before any spawn).

### Adding a build-armed feature

Static import behind an `if (import.meta.env.VITE_NULO_E2E_X)` guard so DCE removes it — a dynamic
`import()` emits a chunk that SHIPS from a dead branch; double opt-in (`_CONFIRM`) for anything that
changes execution semantics; a `*_BUILD_STAMP` string; the `agent.sh` bundle assertion; the CI
negative grep; on every file that needs it, a `beforeAll` stamp check — plus the
`@requires-proverless` marker if the feature rides the proverless build (no other marker is
scanned; a new build flag needs its own runner guard). The trust boundary in prod is the absent
listener, not `chrome.storage` access.

### Changing a shared driver

A helper under `tests/e2e/helpers/` (the import and backup drivers above all) runs in files far
from the change, network matrices included. Before the PR, run every file that imports it
(`rg -l '<helper>' apps/extension/tests/e2e`) on the suite it belongs to: a form that opened on a
new default tab broke the plain-backup driver in the network matrix's passkey row, which no local
run had covered and CI failed (`implementations-plan/archive/passkey-unlock-1/lessons/phase-A3.md`).

### Adding a stage gate

Presence-only `chrome.storage.session` key (present = hold), `remove()` on release AND on a loud
safety timeout, placed so it is not a new cancel checkpoint (the proof gate sits after the
coordinator's pre-prove `checkCancelled` and before the post-prove one).

## 7. References

- `apps/extension/tests/e2e/README.md` — layout, per-file purposes, helper table, what each
  worktree owns.
- `CI.md` § e2e, `.github/workflows/{pr-extension-smoke-e2e,_extension-smoke-e2e,pr-extension-network-e2e,_extension-network-e2e,nightly,
  extension-network-e2e-soak}.yml`.
- Records (`implementations-plan/archive/<name>/plan.md`): `e2e-flake-fixes` (the parked-host
  mechanism), `e2e-deflake` (its flake ledger at
  `implementations-plan/archive/e2e-deflake/plan.md#flake-ledger`, the kill primitive measured, the
  crash-truth suite), `import-stage-deadlines`,
  `mac-identity-binding` (post-unlock races), `e2e-network-recovery` (probe-first),
  `network-e2e-required`, `parallel-e2e-isolation`, `e2e-proverless-stub`, `migration-lifecycle`,
  `e2e-skill-refresh` (this skill's layout). The PRF note is `apps/extension/tests/e2e/PRF-NON-PORTABLE.md`.
- A move to Playwright is a walked dead end: the best fit for the cumulative-load timeouts it was to
  cure is popup discovery latency against fixed waits, which no automation library changes, and at the
  time of the spike Playwright could not open a CDP session on a service-worker target, which the
  passkey fixtures need (`implementations-plan/archive/playwright-migration/plan.md#why`).
