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
bun run e2e:agent --shard=5/5                        # reproduce one CI shard (see "CI sharding")
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

The **default-token seeding** spec (`network/default-token-seeding.test.ts`) needs a seed entry for the sandbox, which mints a fresh token address every run — so no build-time list can name it. `VITE_NULO_E2E_TOKEN_SEEDS` + `VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM` (double opt-in, fail-closed; set by `agent.sh`) swap `TokenSeederDeps.getSeeds()` for a `chrome.storage.session` reader on key `nulo:e2e:token-seeds`, written via `seedSandboxDefaultToken` in `fixtures/token-seeds.ts`. The reader **replaces** the shipped seed list and accepts exactly one `chainId: 0` entry with canonical hex fields, pinning `expectedSymbol` to `"TST"`, `expectedDecimals` to 18 and the placeholder label `displayName` to `"TestToken"` itself — the label is rendered before the chain answers, so storage must not be able to supply it. The spec also traces, from inside the popup, that the `token-seed-row` placeholder shows before the `tokens-card` and that `tokens-empty-import-link` never appears in between. Replacement is deliberate: every profile registration triggers a seed pass, so with a shipped Testnet seed an augmenting list would have each e2e profile calling the public dRPC endpoint. `_extension-smoke-e2e.yml` arms the same pair with **no** key (empty list) on its source build for that reason. Artifact-mode smoke runs the shipped list as built: its browser blackholes only the price host (`NULO_E2E_ARTIFACT_RUN` in `fixtures/browser/`), so each of its profiles seeds the shipped Testnet tokens through dRPC. That is accepted: it is the one run of the shipped list against the live chain before a release. A spec that measures anything below Home's token list first waits for `tokens-list` to carry `data-settled="true"` with nothing in it loading (`waitForSettledTokens` in `rows.test.ts`). Both literals are in the `_build-extension.yml` negative grep, and `agent.sh` + `_extension-smoke-e2e.yml` grep for them positively — an unused export can tree-shake away even in an armed build, which would make the release guard a false negative.

The **STUB** tests (`cancel-mid-prove`, `concurrent-sendtx-{approve,confirm}`, `lock-cancels-dapp-send`, `auto-lock-defers-while-proving`, `profile-switch-sweeps-transfer`, `failed-send-check`, `in-flight-send-guard`, `inflight-call-background-death`, `same-token-concurrent-sends`) hold the tx at `proving` via a `ProofGate` barrier (`holdProofGate`/`releaseProofGate` in `fixtures/proof-gate.ts`, backed by `chrome.storage.session` key `nulo:e2e:proof-gate`) so the sub-second proverless prove still gives a deterministic window. Real BB proving is guarded by the prover-ON `network-e2e-canary` CI job (`transfers`, `tx-sendTx-default`, `frozen-account-canary`, `passkey-execution-canary`, `delete-after-prove`); see [CI.md § Proverless network e2e](../../../../CI.md). Full design: [`implementations-plan/archive/e2e-proverless-stub/`](../../../../implementations-plan/archive/e2e-proverless-stub/plan.md).

### CSP violations

Every launch answers for the Content-Security-Policy violations recorded while it ran. `VITE_NULO_E2E_CSP_REPORT=1` (set by `agent.sh` and by the source build in `_extension-smoke-e2e.yml`) builds in `src/e2e/csp-report.ts`: the background and every document listen for `securitypolicyviolation`, the documents forward theirs over `runtime.sendMessage`, and the background alone appends them to `chrome.storage.session` key `nulo:e2e:csp-violations`, which it creates as an empty list when it loads. With `NULO_E2E_CSP_REPORT=1` at run time, `launchExtension`'s `close` flushes the background, reads the list from a scratch page, closes the browser, and then fails the launch on a missing list (a build without the recorder) or on any entry, printing each one's context, directive, blocked origin and source line. A test that reloads the extension calls `ctx.checkCspViolations()` first, since the reload discards the record; `close` then only closes. A close that throws inside a test's `finally` replaces the test's own error: when a red run names only the CSP check, rerun with `NULO_E2E_CSP_REPORT` unset to see what the test itself reported. A local smoke run needs both flags. An artifact run sets neither: a release build refuses the flag, and `_build-extension.yml` greps release bundles for the key.

What it hears, probed on both browsers by raising a violation in each context: the background at startup and in a successor after `stopBackground`, the popup, the onboarding page, the setup page, and the offscreen document (on Firefox, the background page's frame). What it does not: a violation raised while a document parses, before its entry module runs (the built pages load only their own scripts and stylesheets then, and Chrome lets an extension's own resources past its page CSP anyway); one in a dedicated worker a library starts (bb.js, the sqlite OPFS proxy); one a document reports as `close` reads; and a write that failed in a background that then stopped, since its successor confirms the flush without knowing. Those fail only through the functional assertions.

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

Two-worktree proof of isolation:

| Worktree | Port pack (anvil, aztec, admin, p2p, pg) | Token contract deployed |
|---|---|---|
| worktree A   | `49522, 49523, 49524, 49525, 49526` | `0x0693fd819c9dd798…` |
| worktree B   | `49527, 49528, 49529, 49530, 49531` | `0x1c477acbeea157c9…` |

Both ran `bun run e2e:agent tests/e2e/network/meta-getChainInfo.test.ts` simultaneously. Both passed `1/1` in ~40s wall. The distinct token-contract addresses prove the runs deployed against independent PXE state.

## Single-worktree fast iteration

If you `bun run vitest run --config vitest.e2e.network.config.ts` directly with stable env vars (e.g. `AZTEC_PORT=8080` etc.), `global-setup.ts` will reuse a still-healthy sandbox from the previous run instead of cold-starting:

- the lockfile must exist
- the recorded ports + baked URL must match the current env
- the recorded PIDs must still be alive
- the candidate sandbox must report the same L1 contract addresses recorded post-deploy (proves we're talking to *our* sandbox, not a stranger that drifted onto the same port)

If any check fails, setup reaps the stale children by marker and cold-starts a fresh stack. A reuse rewrites the lock's owner to the reusing run, so no reap touches the sandbox while that run lives. A bare run also adopts any service already answering on its ports (an anvil on chain 31337 is trusted to run with `--slots-in-an-epoch 1`). `bun run e2e:agent` always allocates fresh ports and never reuses or adopts — the lockfile only serves orphan cleanup there.

## CI sharding (5-way matrix)

CI runs the network suite as a **5-shard GitHub Actions matrix** (`.github/workflows/pr-extension-network-e2e.yml`). Each shard:

- Is its own ubuntu-latest VM — own anvil, own aztec node, own playground vite, own Chrome
- Gets roughly a fifth of the shard pool, assigned deterministically by vitest's `--shard=N/M` (SHA-1 hash of filename). The pool is every network test file but the nine with a dedicated job (`fee-methods`, `selfpay-phase`, `concurrent-sendtx-confirm`, `same-token-concurrent-sends`, `transfers`, `tx-sendTx-default`, `frozen-account-canary`, `passkey-execution-canary`, `delete-after-prove`): 107 of the suite's 116 files today, some of which skip themselves unless an env flag arms them (the `_probe-*` file, `store-captures` and `send-chaos` among them). `scripts/ci-cd/behavior-gating.test.ts` pins the pool's exclusions to the dedicated jobs' files
- Runs in parallel with the other 4 shards

**Wall time**: ~10–15 min (vs ~35–45 min unsharded). CPU minutes: ~25% more than serial (each shard pays the ~30s anvil+aztec boot cost), but the wall-time win is dramatic.

**Why N=5 and not N=4 or N=9**: legacy reasoning from when `tx-sendTx-multicall` and `multi-account-from` were collision-sensitive under WASM proving. N=4 collided them on the same shard, blowing the shard timeout; N=5 separated them. With the accelerator the per-prove time is bounded enough that the collision concern no longer holds — N=5 is preserved for now as the stable shape, but could be tuned in a future PR.

**Dedicated heavy jobs**: a few files run OUTSIDE the shard pool on their own runner (`test_files` on a dedicated job, mirrored in the pool's `exclude_files` — `scripts/ci-cd/behavior-gating.test.ts` pins the two lists equal): `fee-methods` + `selfpay-phase` (`Run / heavy / fee-methods + selfpay-phase`), `concurrent-sendtx-confirm` + `same-token-concurrent-sends` (`Run / heavy / concurrent-confirm`), and the five prover-ON canary files (`Run / canary / real-proving`). `selfpay-phase` is the wallet's setup-phase / account-identity gate: `Token.mint_to_private` (the bridge hub claim's inner call — a private call enqueueing a non-allow-listed public finalisation) simulated and sent as each of two granted accounts, never-sent and deployed, self-paid from public Fee Juice and via the PrivateFPC (fuel, then credit), with the node's tx validation ON, plus a negative control that must draw the node's `Setup function not on allow list`. Its cheap sibling `sim-from-selfpay` (one self-paid simulate as the second granted account) stays in the shard pool. Both run at `retry: "0"`; both are driven through the playground's `Simulation` and `Self-pay phase` sections, whose simulate results are projected by `apps/playground/src/lib/simulation-summary.ts` (fee payer, private frames, public calls per phase) because the raw kernel output is not feed-readable.

**Failing shard logs**: each shard uploads its own artifact (`network-e2e-logs-<N>-of-5`) containing `.e2e-state`, `aztec-*.log`, `anvil-*.log`, `presto-server.log`, `presto-health.json` on failure.

**Reproducing a CI shard locally**: pass `--shard=N/5` to `e2e:agent`:

```bash
bun run e2e:agent --shard=5/5                                  # just the files in shard 5
```

Vitest's deterministic SHA-1-of-filename sharder picks the same files locally as in CI, so this is the fastest way to reproduce a shard-specific failure (e.g. "register-token only fails on shard 1"). Each invocation still starts its own anvil + aztec + playground; running multiple shards in parallel needs multiple worktrees (see "Running multiple agents in parallel" above).

**Slow-prove tests**: `tx-sendTx-default`, `multi-account-from` and `tx-sendTx-multicall` run on CI even though the WASM kernel-prove tail can exceed puppeteer's 300s `protocolTimeout` on slow runners: those tests and the `tx-sendTx-{noFrom,feePayer,sponsoredFpc}` siblings assert on the wallet's journal `proving` stage via `waitForSendTxActiveStage()` instead of waiting on the dApp's full sendTx promise. See `implementations-plan/archive/journal-stage-restructure/`.

**Smoke shards**: both PR smoke lanes (`pr-extension-smoke-e2e*.yml`) run the smoke suite as a 3-shard matrix, split by the same SHA-1 rule, because a whole Firefox run neared its 30-minute job limit. `bun run test:e2e --shard=2/3` reproduces one shard; a failing shard's logs upload as `smoke-e2e-logs[-firefox]-<N>-of-3`. The nightly and release smokes of the built zips stay unsharded.

**Known limitation: cold-shard rotation.** Each shard starts with a fresh anvil + aztec + playground + Chrome + extension. The FIRST capability-popup-driven test in shard 1 (whichever file the SHA-1 sharder puts first) pays a cold-SW penalty — `chrome.windows.create` + bb.js init + PXE warmup can push that test past its budget. Quarantining the offender just exposes the next file as the new "first" victim. The structural fix is a fixture-level warm-up tap or pre-grant-capability fixture, which is not built yet. Single-shard re-runs (or local repro via `--shard=N/5`) usually pass green once the SW is warm; `extension-network-e2e-status` is a required check on `dev` and `main`, so a cold-shard red is re-run, never neutralized.

## Troubleshooting

**`FATAL: built bundle does not contain http://localhost:<port>`** — vite didn't substitute `import.meta.env.VITE_LOCAL_NETWORK_RPC_URL`. Confirm `vite.config.ts` exposes the `VITE_*` env (this is on by default; the build wrapper passes the env via `VITE_LOCAL_NETWORK_RPC_URL=... bun run build:chrome`).

**`Timed out waiting for anvil at …`** — the bundled anvil binary failed to bind. Check `lsof -ti:<anvil port>` for an unrelated process. Re-run `bun run e2e:agent` to allocate a fresh port.

**`prior sandbox identity mismatch — tearing down and starting fresh`** — a previous run's sandbox died and a foreign process took over its port. Setup detects this via the L1-contract-address check and recovers automatically.

**`another run in this worktree holds the sandbox`** — `owned.json` names a live owner: two runs in one worktree. Wait for it to finish.

**`another run in this worktree is reconciling its sandbox`** — `.e2e-state/reconcile.lock` names a live process. Setup, and `e2e:reap`, hold it while they read `owned.json`, reap or adopt what it names and write their own owner into it, so two of them cannot act on the same dead owner. A dead holder's lock is replaced on its own; delete the file only if no run or reap is in progress.

**`the prior run's sandbox could not be reaped: …`** — a service of the previous run did not stop (`retained`), could not be read (`unknown`), or the lock names no owner (written before markers, or on a host without `/proc`) and records live pids. Those pids may since belong to unrelated processes: stop them only if they are this worktree's sandbox, else delete `.e2e-state/owned.json`. Otherwise run `bun run e2e:reap` once the owner is gone.

**`<what>: answered by a listener this run did not start`** — on Linux, the socket listening on a service's port is not held by a process carrying that service's marker: something bound the port before the service did. A boot failure (exit 86), retried on fresh ports.

**`<service>'s claimed port <n> is already in use`** — something listens on a port this run just claimed. The run fails as a boot failure (exit 86) and CI retries on fresh ports.

**`~/.agents/ports.md.lock stayed held`** — another registry writer holds the lock, or one died holding it. The other writers break a lock older than 15 s; this client never does. If no writer is running, delete the lock.

**Manual cleanup of stale state.** `bun run e2e:reap` in the worktree. It stops only processes carrying this worktree's markers whose owner is dead, never a process by name, which on a shared host would take down another agent's run.

## Terms-acceptance state

`launchExtension({ legal })` seeds the device-local acceptance record, built by `@nulo/legal`'s own
`applyAcceptance`: `current` (default on a fresh profile), `missing`, `stale`, `corrupt`, or `keep`
(default on a reused `userDataDir`, so a relaunch keeps what the last launch left).
`openOnboarding(ctx, { legal: "missing" })` gives the gate's specs a real fresh install, and
`reloadWithLegalState(page, seed)` flips a running wallet. The scenarios live in
`legal-acceptance.test.ts` (S1–S11) and `network/legal-acceptance-wall.test.ts` (N1).

## Helper conventions (CDP regression workarounds)

A Puppeteer/Chrome interaction layer regressed somewhere between sandbox ABI versions; e2e helpers in `fixtures/extension.ts` and `fixtures/helpers.ts` work around it. **Do not bypass these helpers** — calling raw `page.click()` / `handle.click()` / `page.waitForFunction()` directly will reintroduce flakes that look like timeouts but are actually CDP / rAF-throttling issues.

| Helper | Use it instead of | Why |
|---|---|---|
| `clickByTestId(page, id)` / `clickSelector(page, sel)` | `(await page.waitForSelector(...))!.click()` and `handle.click()` | The CDP element-handle click hangs with `Runtime.callFunctionOn timed out`. Synthetic in-page click via `page.evaluate(() => el.click())` bypasses the broken protocol path. |
| `typeIntoInput` / `replaceInputValue` | `handle.type(text)` | Same CDP path, same hang. The helper sets `value` via the prototype setter and dispatches `input` events. |
| `patchPagePolling(page)` (auto-applied by `launchExtension`, `openPopup`, `openPlayground`, `waitForPopup`) | manually configuring polling on every `page.waitForFunction` call | Default `'raf'` polling is throttled in offscreen / unfocused tabs. Patch defaults to `polling: 200`. `waitForSelector` (CSS-only) is rerouted through the patched `waitForFunction` for the same reason; prefixed selectors (`text/`, `xpath/`, `aria/`, `pierce/`) are left alone. |
| `pointerClick(page, testid, { last? })` (`helpers/legal-drivers.ts`) | `clickByTestId` when the assertion is "nothing covers this control" | An in-page click reaches a covered element. This one hit-tests the control's centre, fails naming whatever sits on top, then clicks through `page.mouse` (`Input.dispatchMouseEvent`, not the hanging element-handle path). `last` picks the last match — the control of the popup on top of a stack. |
| `coveredAt` / `activeTestId` / `waitForFocus` / `tabAround(page, n)` (`helpers/pointer-probes.ts`) | reasoning about z-index or `offsetParent`; reading focus right after a close | What the pointer would hit at a control's centre, where focus is, where it lands (a released trap hands focus back on a timer — wait, never read), and where `n` Tabs take it — the browser facts behind "this popup covers that one" and "the trap holds". |
| `closeStuckPopup(page)` | waiting for the popup to unmount after a confirm/submit | Vue `<Transition>` sticks mid-enter / mid-leave under headless Chrome rAF throttling — `slide-enter-from + slide-enter-active` never advances. Helper force-removes the `#popup` teleport children + dim backdrop AFTER asserting the actual post-mutation signal (row appeared, contact deleted, etc.). |
| `settleClosedPopup(page, innerTestId)` (`fixtures/popup-leave.ts`) | `closeStuckPopup` when another popup must stay open beneath | The scoped form: waits for the closed popup's DOM to leave or for its leave to have begun, then finishes only that one by hand. Returns whether it had to. |
| `withTimeoutMessage(wait, message)` | `.catch(() => { throw new Error("...") })` around a wait | A bare catch relabels frame detaches, CDP disconnects and page crashes as "the state never settled", burying a real fault under a plausible-looking flake. This converts `TimeoutError` only, rethrows everything else untouched, and keeps the original as `cause`. Pass a function when the message has to read live page state — prefer that form, so the failure says what WAS observed. |

Feature helpers in `fixtures/helpers.ts` (all `data-testid`-driven; reuse them rather than re-deriving the click sequence):

| Helper | Does |
|---|---|
| `clickNavTab(page, "general" \| "holdings" \| "activity" \| "settings")` / `openHoldings(page)` | Bottom-nav navigation, waits for the route hash. |
| `navigateToTokenDetail(page, symbol?)` | Opens a token page from its Home card (`symbol` picks the card when more than one token is listed). |
| `importToken(page, contract)` + `captureBalanceBaseline` / `waitForFreshBalanceRow` | Imports a token and waits for its projected balance row — pair them for every import so assertions never race the projector. |
| `selectSendToken(page, symbol)` | On the Send page, picks a token in the picker and waits for the trigger to show it. |
| `pinFromTokenPage(page)` / `readPinState(page)` | Token page "⋯" menu: toggle Pin to Home; read the item's `data-pinned`. |
| `deployExtraTokensForAccount(config, account, [{ symbol, amount }])` (`fixtures/aztec.ts`) | Deploys and mints extra sandbox tokens for multi-token scenarios. |
| `readPublicTokenBalance` / `readPublicFeeJuice(wallet, from, …)` (`fixtures/aztec.ts`) | Chain-side balance reads through the script wallet — the postcondition for "executed as account X" (the token moved from X, nobody else's balances moved), since receipts carry no sender. |
| `grantCapBundle(ctx, page, bundle, pick)` + `approveCapabilities(popup, { accounts })` | Drives the capability popup. On a repeat `accounts` request for a session that already holds accounts, held rows render `data-granted="true"`, pre-selected and locked (a click is ignored); `approveCapabilities` only clicks rows that are not yet selected, so pass the NEW addresses. |
| `requestPgBundle(page, bundle, { tokenAddress })` + `readCapabilitySwitch(popup, rowKey)` / `approveCapabilities(popup, { switches })` / `setConnectedAppAuthorizations(page, host, on)` (`fixtures/playground.ts`, `fixtures/popups.ts`) | The consent switches. A scoped bundle names the contract in `tokenAddress` (without one it carries `"0x0"`, which the wallet refuses). A new card's switch is found by its `data-cap-row` (`authorizations`, `address-book`, `private-events`, `unknown`); an "Already granted" card has none. The Settings helper finds the app by the host its session was made on, then reopens the page to prove the stored state. `readStoredCapability(ctx, origin, type)` (`fixtures/dappSession.ts`) reads what the grant stored. |
| `lockWallet(page)` / `lockThroughConfirmDialog(page)` / `waitForLockScreen(page)` | Lock from the header. `lockWallet` expects no approved send running; with one running the button asks first, and `lockThroughConfirmDialog` confirms that dialog and returns its copy. Both wait for the session record to go, then for `/popup/auth`. |
| `createAndActivateProfile(page, name, password)` | Creates a profile from the lock screen's picker, which activates it; asserts the field opened prefilled `Profile N` before typing `name`; returns its id. |
| `waitForNameField` / `expectNoNameField` / `expectNameFieldPrefill` (`fixtures/extension.ts`) + `readProfileNames` | The Profile-name rule on the four profile-creating pages (root testids `onboarding-create-page`, `onboarding-import-page`, `register-page`, `import-page`, state in `data-name-field`): a first profile has no field and is named "Main"; a later one shows it prefilled `Profile N`. Wait for the state before typing: the field renders only once the profile list is read. `importSeed(…, { profileName })` types a name only when given and fails when given one on a first profile. |
| `readSessionRow` / `waitForSessionRow` / `peekSession` / `setSessionTtlMs(page, ms)` | Session state without navigating (a navigation refreshes the session): the persisted row's `profile`/`since`/`lockedAt`, the profile service's own expiry check, and a millisecond auto-lock TTL through the config service. |
| `readSendRecords` / `waitForSendRecord(page, match)` (`fixtures/journal.ts`) | Every profile's `transfer` and `dapp_execute` journal records with their stage and `enteredProveAt` — the anchor for proof-gate timing. |
| `sendTransfer(page, { …, expect })` + `fillSendForm(page, { amount, destination })` | Drives a whole send. `expect` (`"send"` \| `"review"`) is the caller's claim about the footer: a send the fee card gates (the account's own Fee Juice under a private origin) goes through the review sheet, anything else at once — the other offer throws. Every call site states it. |
| `openSend` / `readSendView` / `waitForFee` / `waitForTag` / `submitSend` / `openReviewFromStrip` / `readReview` / `waitForReviewReady` / `shotSend` (`fixtures/send-page.ts`) | The Send page's publish surface: the strip's cells, the fee-source tag and the footer's action read together — `assertPublishInvariant` refuses a page where they disagree — plus the review sheet's rows, the hit-tested clicks on "Review send" / "Send now" / the strip, and both-theme screenshots under `NULO_E2E_SHOT_DIR`. |

Anti-throttle Chrome flags live in `launchExtension` (`extension.ts`):

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
| Chrome orphan cleanup | Yes | `pkill -f "chrome.*--load-extension=$EXTENSION_PATH"`, path-scoped, at every run's setup and teardown, and in `e2e:reap` while no live run holds the worktree (Chrome shows no marker) |
| `.test-config.json` | Yes | per worktree |
| `.e2e-state/` lockfile | Yes | per worktree |
| EmbeddedWallet PXE temp dir | Yes | random `tmpdir()/nulo-e2e-<8hex>` per call |
