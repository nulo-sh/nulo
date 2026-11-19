<!-- Research subagent (Explore, sonnet) for the rpc-fallback-1 plan, at dev e5cffd82d plus origin/rpc-proxy-1-a1 (PR #1622). Persisted verbatim by the planner. -->

# Test and CI infrastructure map for rpc-fallback-1

All paths are relative to the worktree root. `apps/extension/` is shortened to `ext/`. I never opened `network-endpoints.ts`. `ext/tests/e2e/fixtures/egress-guard.ts:15` and `ext/src/wallet/services/network/seeds.ts` import from it, and I only read their other lines.

## Findings that shape the design

- **No forwarding proxy exists anywhere.** Every local HTTP server in the repo is either a terminal stub (answers, never forwards) or a CONNECT-refusing guard. Nothing relays JSON-RPC to an upstream node.
- **The wallet's data model already supports multiple endpoints.** `NetworkRow` has `endpoints[]` and `primaryEndpointId` (`ext/src/wallet/services/network/spec.ts:51-53,76-77,121-123`). `endpoint-refused-recovery.test.ts:35-40` already edits `row.endpoints`/`primaryEndpointId` through `rewriteActiveNetwork`. A test can therefore point two endpoints at two loopback proxies without rebuilding the extension.
- **A loopback proxy works unchanged on both browsers.** The manifest CSP allows `connect-src http://localhost:* http://127.0.0.1:*` (`ext/src/manifest.test.ts:132`). Loopback is "direct" in the egress guard's proxy bypass list (README § Egress guard; FIREFOX.md:95). `isLoopbackHost` accepts only `localhost` and `127.0.0.1` (`packages/wallet-core/src/utils/rpc-url.ts:26-31`). A real proxy on `127.0.0.1:<port>` needs no CDP or Firefox observer.
- **Nothing browserless boots the sandbox in CI.** The only sandbox-bound non-browser test is `stale-anchor.real.test.ts`, which is opt-in and never run in CI (§4).

## 1. Composition layer

**`ext/tests/COMPOSITION-TESTS.md`** (76 lines, "Normative", line 3). Under it, a composition test:
- Drives the real `ServiceCollection.start()` plus the real service and its cheap collaborators, in-process, against dumb fakes for the process boundaries only: the PXE-over-RPC client, `chrome.storage` and `AztecNode` (line 7).
- Has no sandbox, offscreen worker, BB proving or browser (line 7).

It may be used only when all three hold (lines 13-17):
1. The behaviour is orchestration across two or more real collaborators.
2. Every crossed boundary is faked with canned, semantics-free values.
3. Correctness needs no proving, simulation, real selector derivation or real chain state.

Escalate to network e2e if any one of these applies (lines 19-31):

| Rule | Limit |
|---|---|
| D1 | The shared `shallow-port.fake.ts` implements `getPXE` plus at most 4 `ShallowPxe` methods. The carve-outs are the cancel spike's inline `proveTx` fake, the fee-race driver, and a `Pick<PxeServiceClient,…>` recorder stub in `register-counts.composition.test.ts`. |
| D2 | No assertion may depend on `simulateTx`/`proveTx`/`profileTx`/`executeUtility` returning internally consistent output. A canned `proveTx` checked only for "was it called" is fine. |
| D3 | No second wallet: no tx-request building, account contracts, node chain-identity validation or address derivation. |
| D4 | Fake state is seeded contract metadata plus a registered-address set only. Modelling node, sync or fee state means stop. |
| D5 | The fake reproduces the client's return shape, never the worker cascade behind it. |
| D6 | Anything touching the Barretenberg WASM (poseidon, selectors, instance addresses) is out. Hardcode fake instances. |

Always-rules (lines 35-43):
- One shared shallow-PXE fake under `src/`.
- Real artifacts.
- At least one assertion on real-collaborator state.
- Test-only fakes outside `*.test.ts` carry a bundle marker, checked by the `_build-extension.yml` "Assert test-only markers absent" step.
- `svc()` casts its stub `as never`, so a missing method on a fake compiles and fails only at run time (line 41).
- A never-happens check runs after every guarded write (line 42).
- Boundaries are injected through constructor ports (line 43).

The taxonomy (lines 45-50) is theatre, second wallet, drift and bb-bound. The closing line is "When in doubt → Extension network e2e" (line 76).

**`ext/src/wallet/services/composition-harness.ts`** (33 lines) exports:
- `svc(name, methods)`, which builds a `ServiceCollection` stub (`:16-18`).
- `profileKeysStub` (`:22`).
- `tokenListStub` (`:31`).

**Composition test files (20):**
- `ext/src/wallet/storage/sealed-storage.composition.test.ts`
- `ext/src/wallet/services/`
  - `account/sealed-accounts`
  - `dapp-interaction/service`
  - `network-reset/service`
  - `incoming-transfer/service`
  - `operation-journal/sealed-journal`
  - `dapp-session/service`
  - `execution/fee-race`
  - `execution/register-counts`
  - `execution/send-order`
  - `execution/service`
  - `token-list/service`
  - `token/service`
  - `transaction/sealed-transactions`
  - `wallet-sdk/connect-profile-binding`
  - `wallet-sdk/session-revocation`
  - `profile/profile-chaos-scenarios`
  - `profile/profile-chaos`
  - `profile/unlock-method`
- `ext/src/popup/components/modules/settings/contacts/useContactImportExport.composition.test.ts`

**Node fakes (what stands in for `AztecNode`):**
- `FakeNodeFactory` is at `ext/src/core/testing/fake-node-factory.ts:26`, re-exported at `ext/src/core/testing/index.ts:10`.
  - It is a POJO `AztecNode` per URL, with `setTemplate`/`setOverrides(rpcUrl, …)` (`:36-46`).
  - `probeChainId` composes `getNodeInfo` into a chain id (`:50-54`).
  - `createSingleAttemptNode` records the URL in `singleAttempt`; `created[]` records every node it built (`:28-30`).
  - Its header warns that a POJO bypasses the JSON-RPC proxy's param validation and error marshalling: "Use integration tests against the production adapter for those paths."
- The only composition test using it is `network-reset/service.composition.test.ts:31,144`.
- `execution/service.composition.test.ts:106` and `ext/tests/helpers/fee-race-in-process.ts:265` use an inline `getNodeInfo: async () => ({ l1ChainId: 5, rollupVersion: 4 })`.
- `answering` has no fake-node hits. In `aztec-node-factory-adapter.test.ts:26`, `answering` is a `fetch` spy. `pxe/service.test.ts:562` has `serviceWithNode("refusing" | "answering")`.
- The production adapter, `packages/aztec-runtime/src/adapters/aztec-node-factory-adapter.ts`, is the only `createAztecNodeClient` call site (header, lines 3-8). It wraps `makeFetchWithTimeout` / `makeSingleAttemptFetch` from `packages/aztec-runtime/src/utils/fetch`.
- `ext/vitest.config.ts` includes `src/**/*.test.ts`, `scripts/**/*.test.ts` and `packages/aztec-runtime/src/**/*.test.ts` under jsdom.
- WASM-bound files are excluded from the jsdom run (the long exclude list from `:50` on) and run in `aztec-runtime`'s own node-environment config (`packages/aztec-runtime/vitest.config.ts`).

## 2. Network e2e suite

**Runner.** Root `package.json:20` defines `"e2e:agent": "bash apps/extension/scripts/e2e/agent.sh"`. `test:e2e:network` (`:18`) is the bare vitest call, and `e2e:reap` is at `:21`.

Sequence in `ext/scripts/e2e/agent.sh`:
1. `proverless-guard.sh` runs before any port claim or build (`:19`).
2. `resolve-ports.ts` writes `.e2e-state/ports.json` (`:57`), and the run id is read from it (`:58`).
3. The extension is built with `VITE_LOCAL_NETWORK_RPC_URL="$AZTEC_NODE_URL"` plus the `VITE_NULO_E2E_*` flags (`:108-139`).
4. The bundle is grepped for the URL and the stamps (`:144-227`).
5. vitest runs with `E2E_REQUIRE_SETUP=1` and `ANVIL_URL/PORT`, `AZTEC_NODE_URL/PORT`, `AZTEC_ADMIN_PORT`, `AZTEC_P2P_PORT`, `PLAYGROUND_URL/PORT` (`:254-265`).
6. `classify-exit.ts` maps an infra-boot failure to exit 86 (`:276`).

**Port claiming.**
- `ext/scripts/e2e/resolve-ports.ts` draws 5 ports (anvil, aztec, aztecAdmin, aztecP2P, playground).
  - They come from a static window below the kernel's ephemeral floor (header comment, lines 1-43; `STATIC_LO` at `:52`).
  - It skips Fetch's bad ports and `registeredPorts()` (`:70`).
  - `claimPorts` is called at `:147`.
- `ext/tests/e2e/port-registry.ts` is the `~/.agents/ports.md` client.
  - It writes `nulo-e2e-*` rows under a lock file created with `open(..., "wx")`.
  - It never breaks a foreign lock and waits more than 15 s.
  - Exports: `claimPorts` (`:247`), `releasePorts` (`:297`), `registeredPorts` (`:92`), `releaseDeadRows` (`:303`), `PortClaimConflict`, `RegistryLocked`.
  - The `NULO_E2E_PORT_REGISTRY` env var overrides the file (`:49`).
- Whole-run release happens in `agent.sh`'s `on_exit` trap (`:45-50`).
- Extra loopback listeners are handled by `listenClaimed(make, service)` at `ext/tests/e2e/fixtures/egress-guard.ts:167`. This is the piece to reuse for proxies.
  - It reserves a port, binds it, then claims it in the registry (3 attempts).
  - It returns `{server, port, release}`.
  - It is used by `node-stub.ts:34`, `egress-guard.ts:273,301`, `token-list.ts:151` and `update/loopback-endpoints.ts:31`.

**Boot in `ext/tests/e2e/global-setup.ts` (932 lines).**
- The aztec toolchain is resolved from the repo's `@aztec-labs/aztec.js` pin under `~/.aztec/versions/<pin>`, not the `current` symlink (`:55-114`). Under `E2E_REQUIRE_SETUP=1` a missing pin is fatal (`:511-518`).
- The ports come from env with defaults 8545/8080/8880/40400/5174 (`:121-127`).
- Anvil is spawned at `:432`, detached, with `launchEnv(MARKERS.anvil)`.
- `ensureAztecNode` is at `:485-529`. `spawnAztecNode` (`:555`) runs `aztec start --local-network --port --admin-port --p2p.p2pPort --l1-rpc-urls $ANVIL_URL --data-directory <run>/data --admin-api-key-hash` with these properties:
  - It is detached.
  - `TMPDIR` is set to `<run>/tmp`.
  - `SEQ_MIN_TX_PER_BLOCK=0`.
  - `FORGE_BIN`/`ANVIL_BIN` are pinned.
  - Health wait is 90 s (`:512-513`).
- `ensureDevServer` (`:653`) starts the playground with `bun run dev` and a 30 s health wait.
- The run dir is on real disk (`E2E_DATA_ROOT`), created by `createRunDir` and recorded in `.e2e-state/owned.json` (`:150-160`).
- Contracts are deployed in `finishBoot`. `provide("aztecTestConfig")` is at `:743`, and `provide("aztecAdminKey")` at `:308` is a per-run admin key whose sha256 is passed to the node.
- Each service gets a UUID marker in its environment, set through `launchEnv` (`owned-processes.ts:84`). `NULO_E2E_RUN`, `NULO_E2E_RUN_OWNER` and `NULO_E2E_WORKTREE` come from `ports.json`.

**Teardown.**
- `ext/tests/e2e/process-group.ts:42-66`, `killProcessGroup`: SIGTERM to `-pgid`, then SIGKILL after a 5 s grace period, with an `isGroupAlive` check.
- `sandbox-ownership.ts` provides `stopService`, `reapPriorRun`, `sweepDeadRuns`, `killChromesLoading` and `stopServiceOnExit` (`global-setup.ts:40-46`).
- The default export returns the teardown (`:196-204`). Teardown stops playground, node, then anvil (`:888-913`).
- `agent.sh` deliberately has no INT/TERM trap (`:23-31`), and an `exec classify-exit` ends it.

**The Local network in the built extension.**
- `ext/src/wallet/services/network/seeds.ts:29-40`: `LOCAL_NETWORK_RPC_URL = import.meta.env.VITE_LOCAL_NETWORK_RPC_URL ?? "http://localhost:8080"`.
- The seed is `{name:"Local Network", chainId:0, kind:"local"}`. `chainId` 0 is built only on a loopback URL.
- The fixture `localNetworkExtension` (`ext/tests/e2e/fixtures/extension.ts:843`, `launchOnLocalNetwork` at `:625-632`) is file-scoped. It launches, calls `registerProfile`, opens the popup, then `switchToLocalNetwork`.
- `AztecTestConfig.nodeUrl` (`fixtures/aztec.ts:49-59`) is the sandbox URL tests can import via `inject("aztecTestConfig")`.
- `ext/tests/e2e/fixtures/mining-hold.ts` already does admin-RPC fault injection on the sandbox. It uses `AZTEC_ADMIN_PORT` and the injected admin key to set `minTxsPerBlock: 2`. This is the sandbox-side lever for "block production held".

**Docs.**
- `ext/tests/e2e/README.md:26-35` covers the runner internals. § CI sharding is at `:373-385` ("~10–20 min per shard").
- `.claude/skills/e2e-testing/SKILL.md`:
  - § CI topology is at `:250-288`.
  - § Runtime budget is at `:292-338`.
  - Its wall-clock command is at `:300-310`.
  - § Selectors is at `:340`: only `data-testid`.
  - § Adding a build-armed feature is at `:1138`.
- The runtime-budget rule itself is `CLAUDE.md:498`: name the failure mode, say why a cheaper layer cannot prove it, and give estimated then measured runtime. The PR body states each browser's suite wall-clock before and after.

## 3. Existing fault injection and local servers

**`ext/tests/e2e/network/endpoint-refused-recovery.test.ts`** (70 lines) uses no CDP, proxy or server. It rewrites the stored network row: `rewriteActiveNetwork` (`:35`, defined at `fixtures/networks.ts:37-49`) sets the primary `rpcUrl` to `http://[::1]:<port>` (which the wallet no longer dials). It then asserts `data-status="inactive"` (`:51`). It repairs the endpoint through the settings UI (`:55-63`) and asserts `active` (`:68`). It uses `openNetworkDetail`, `endpoint-edit-btn` and `edit-endpoint-submit`.

**CDP interception.**
- `fixtures/browser/chrome-rpc-intercept.ts:41` `cdpInterceptRpc(browser, extensionRoot, fromOrigin, mode)`:
  - Auto-attaches every non-page target with `waitForDebuggerOnStart`.
  - Calls `Fetch.enable` on the origin.
  - Replies with `Fetch.failRequest(ConnectionRefused)` or `continueRequest` rewritten to `mode.to`+path+query.
  - Modes: `RpcInterception = {kind:"refuse"} | {kind:"redirect"; to}` (`browser/index.ts:47`).
  - Returns `{hits, failures, stop}` (`:49-56`).
  - Supports `NULO_E2E_INTERCEPT_LOG=1`.
- `firefox-rpc-intercept.ts:21` is an `http-on-modify-request` observer with the same modes (see §6).
- `standing-interception.ts` holds the launch-long interception (`holdRpcInterception`, `index.ts:340`).
- Its unit test is `ext/scripts/e2e/chrome-rpc-intercept.test.ts`, run as a unit test through the `scripts/**` glob.
- **Limit for failover.** Interception keys on one origin and offers only refuse or redirect-to-one-target. It has no delay, stale-tip or 500 mode, and no way to fail the primary while serving the secondary.

**Local servers and proxies (complete grep trail at the end of this section):**

| file:line | What it is |
|---|---|
| `ext/tests/e2e/fixtures/node-stub.ts:25-60` | `startNodeStub()`, a `node:http` server on a `listenClaimed` port. It counts requests and answers every call with HTTP 400 and a JSON-RPC error (`refuseNodeCall`, `:21`). `holdNodeStub`/`holdNodeStubs` (`:62-85`) redirect a seed's origin to it. |
| `ext/tests/e2e/helpers/rpc-stub.ts:71-135` | `startStub(answer)` binds port 0. `planBatchReplies` (`:71-99`) parses batched JSON-RPC (`unparsed`/`blackhole`/`replies`). It blackholes unanswerable batches and records `methods[]`. `refuseUnanswered()` releases held replies. `nodeInfoResult(l1ChainId, rollupVersion)` (`:14`) is a schema-valid `getNodeInfo`. Reusable for faked-node scenarios. |
| `ext/tests/e2e/fixtures/update/loopback-endpoints.ts:13-45` | A stand-in node that answers only `aztec_getNodeInfo`, then flips to refuse. It uses `planBatchReplies`. |
| `ext/tests/e2e/fixtures/egress-guard.ts:259-300` | A `node:net` proxy guard: it answers 403 to CONNECT and absolute-URI requests, and records `host:port`. `startEgressCanary` (`:301`) counts TCP connects. The unit test is `ext/scripts/e2e/egress-guard.test.ts`. The e2e control spec is `ext/tests/e2e/egress-guard.test.ts` (it is in the network include list, `vitest.e2e.network.config.ts:18`). |
| `ext/tests/e2e/fixtures/token-list.ts:151` | `serveTokenList()`, a static host on a registry port. |
| `ext/tests/e2e/security.test.ts:199` | A one-line dApp page server. |
| `ext/tests/e2e/boot-guard.ts:26`, `ext/scripts/e2e/resolve-ports.ts:94,127` | Bind-probe servers for port checks. |
| `scripts/ci-cd/release-integrity.test.ts:1196`, `publish-packages.test.ts:197,217`; `infra/token-list/test/live-check.test.ts:81` | `Bun.serve` / `createServer` stubs for CI-script and infra tests. |

Not found: any relay to an upstream node. `packages/*/src` and `infra/` (apart from the files above) have no server hits; `scripts/` outside `ci-cd` has none.

**Search trail.** I ran `rg`/`grep -rnE "Bun\.serve|createServer\(|http\.createServer|\.listen\(|createProxy|http-proxy|net\.createServer"` over `apps/extension/tests`, `apps/extension/scripts`, `scripts`, `packages/*/src`, `infra` and `playground`. The extra hits were unit-test stubs only: `alarm-dispatcher.test.ts` (a `listen` that is an event API), `anvil-probe.test.ts:10`, `boot-guard.test.ts` and `resolve-ports.test.ts`.

## 4. Browserless integration with the sandbox

- **`packages/aztec-runtime/src/pxe/stale-anchor.real.test.ts`** is the only one.
  - It is node-environment, and builds a real `createPXE` over `createAztecNodeClient(AZTEC_NODE_URL)` (`:102`).
  - It also drives anvil `l1Rpc` (reorg).
  - It is `describe.skipIf(!ARMED)` with `ARMED = ANVIL_URL && AZTEC_NODE_URL && NULO_E2E_REORG === "1"` (`:74-76`).
  - The documented command is `NULO_E2E_REORG=1 ANVIL_URL=… AZTEC_NODE_URL=… bun run --cwd packages/aztec-runtime test src/pxe/stale-anchor.real.test.ts` (header, `:21`).
  - The sandbox must be booted separately: the header says "the sandbox the e2e agent boots (`agent.sh` exports both URLs)".
  - The reorg leaves the sandbox unable to mine again, so it is never pooled (`SKILL.md:205-209`).
- **CI does not run it.** `grep` for `NULO_E2E_REORG`, `stale-anchor` and `AZTEC_NODE_URL` in `.github`, `CI.md` and scripts finds only `_extension-network-e2e.yml:118`, which is an env pass-through. `ARMED` is false in `_unit-tests.yml` (`bun run test:all`, `:25`). Its e2e twin `ext/tests/e2e/network/stale-anchor-recovery.test.ts:50` skips unless `NULO_E2E_REORG=1`.
- **`*.real.test.ts` / `*.integration.test.ts` in `ext/src`** do not need a sandbox. They are node-environment or jsdom tests with real library objects (for example `execution-coordinator.real.test.ts` uses `mockTx` from `@aztec-labs/stdlib/testing`). The files are `token-transfer-vocabulary.real`, `call-surface.real`, `authwit-discoverer.real`, `register-contract-account.real`, `send.integration`, `estimate-hold.integration`, `profile/service.integration`, `fee-freshness.integration` and `batched-view-simulation.integration`. All run in the normal unit lane.
- **Searches:** `rg "AZTEC_NODE_URL|SANDBOX|NULO_REAL|\.real\.test|integration\.test"` over the vitest configs, package.json files, `.github` and CI.md; `find -name '*.real.test.ts' -o -name '*.integration.test.ts'`.
- **No "sandbox without a browser" harness exists.** Booting needs `global-setup.ts` (vitest `globalSetup`, which the extension e2e configs wire in) or a manual boot. `global-setup.ts` reads the extension build path and `dist` (`:50-52`) and calls the browser selector (`:48`). So a browserless integration job would need either its own small global setup that reuses `resolve-ports` + `port-registry` + the spawn code, or a refactor that extracts that spawn code.

## 5. CI

**`pr-quick.yml`** (workflow name "Quality").
- Jobs: `changes` (`:43`, `dorny/paths-filter` with filters `core-foundation`, `aztec-runtime`, `wallet-bridge`, `extension`, `playground`, `landing`, `workflows`, `root-config` at `:68-125`), `commitlint`, `lint-and-typecheck`, `unit-tests`, `build-chrome`, `build-firefox`, `preview-comment`, `build-landing`, `build-storybook`, `launch-legal`, and `status` named `quality-status` (`:400-407`).
- `unit-tests` calls `_unit-tests.yml`, which runs `bun run test:all` (`:25`) and then the CI-gating guard `bun run test:ci-gating`.
- The `extension` filter is `apps/extension/**` plus its dependency libraries (`:91-110`).

**Network e2e lane (Chrome): `pr-extension-network-e2e.yml`** (workflow name "Extension network e2e").
- `changes` runs `dorny/paths-filter` with filter key `extension-network` and reads live labels `e2e:extension-network` / `e2e:network` through `scripts/ci-cd/live-labels.sh`.
- Paths that trip it (lines 55-109):
  - `apps/extension/**` and `apps/playground/**`.
  - `packages/aztec-runtime/src/**`, `wallet-core`, `wallet-crypto`, `extension-messaging`, `wallet-bridge`, `design`, `legal`, `resolve-asset`, `third-party-notices`, `token-list` and `wallet-sdk-schema-patch` (src plus `package.json`).
  - Root build inputs (`package.json`, `bun.lock`, `bunfig.toml`, `tsconfig*.json`, `patches/**`).
  - The exact CI files the lane runs.
- Consequence: any PR touching routing code under `apps/extension/**` or `packages/aztec-runtime/src/**` already trips this lane. An integration job placed in this lane inherits that gating for free.
- `e2e-decide.sh` decides `run`. Job `network-e2e` ("Run") calls `_extension-network-e2e-lane.yml` with `retry: "0"` (`:127-140`). `status` is named `extension-network-e2e-status` (`:143`).
- The aggregator is `scripts/ci-cd/e2e-aggregate.sh`. It is a strict state machine: every non-`changes` need must be `success` when `run=true` and `skipped` when `run=false` (`:36-50`).

**Lane partition: `_extension-network-e2e-lane.yml`** (158 lines).
- `network-e2e`: a 5-way shard matrix. `exclude_files` is the union of the dedicated jobs' files (`:50-58`).
- Dedicated jobs, each a call of the suite workflow with `test_files`:

| Job | Files | Mode |
|---|---|---|
| `network-e2e-heavy` | fee-methods + selfpay-phase | proverless |
| `network-e2e-heavy-concurrent` | concurrent-confirm + same-token | proverless |
| `network-e2e-heavy-long` | snack-placement + failed-send-check | proverless |
| `network-e2e-canary` | five files | prover-ON (real proving) |
| `network-e2e-chaos` | `send-chaos`, two fixed seeds | proverless |
| `network-e2e-chaos-seeded` | `send-chaos`, nightly's seed | proverless |

- The lane's own header (`:7-9`) says a job here that skips hides from its aggregator, so no job takes `if`/`needs` except the chaos pair.

**Suite workflow: `_extension-network-e2e.yml`** (435 lines).
- The job is `network-e2e` with `timeout-minutes: 30` (`:115`). It runs on `ubuntu-latest`.
- Steps: checkout, `setup-bun`, `setup-aztec` (`:161`), validate the browser input, `setup-puppeteer`, `setup-geckodriver` (Firefox only), `setup-presto-server` and Start presto-server (canary only).
- The sandbox is started inside `bun run e2e:agent` (`:259-309`) through `global-setup`. There is no separate CI step for it.
- `run_agent` has three modes: explicit `TEST_FILES`, `--shard`, or everything (`:271-287`). Exit 86 triggers one agent retry (`:289-313`).
- Then: assert canary or soak results, the bundle PROBE grep (`:339`), and log upload on failure.

**Composite actions** (`.github/actions/`): `setup-aztec`, `setup-bun`, `setup-geckodriver`, `setup-presto-server`, `setup-puppeteer`. `setup-aztec` installs the pinned CLI from SHA-256-pinned inputs and caches `~/.aztec/versions/<pin>`.

**Firefox twin.** `pr-extension-network-e2e-firefox.yml` has the same filter re-pointed at its own file (plus `setup-geckodriver`). It calls the same lane with `browser: firefox`. The behavior-gating test pins that (`behavior-gating.test.ts:1176-1243`). The Firefox aggregators are `extension-network-e2e-firefox-status` and `extension-smoke-e2e-firefox-status`.

**Smoke lanes.** `pr-extension-smoke-e2e.yml` (filter `smoke-surface`, 3 shards, `_extension-smoke-e2e.yml`) has no sandbox. Its aggregator is `extension-smoke-e2e-status`.

**Nightly.** `nightly.yml` runs the same lane on both browsers at the default retry 2, with a fresh chaos seed. The gates are listed in CI.md § nightly.

**Soak.** `extension-network-e2e-soak.yml` runs named network files N times at retry 0 on Chrome, and every named test must pass.

**How a lane or job is added and gated** (CI.md § "Adding a new gate", lines 245-251):
1. Make it a step in an existing job, or a `.github/workflows/_<name>.yml` reusable workflow.
2. Add it to the `status` aggregator's `needs:`.
3. Update the "What runs when" table.

`scripts/ci-cd/aggregators.test.ts` and `behavior-gating.test.ts` fail on any need the aggregator never checks. In an e2e lane, `needs` is the whole change, because `e2e-aggregate.sh` holds every need except `changes` to the state machine. The gating tests are run by `bun run test:ci-gating`, which `_unit-tests.yml` calls.

**Pins that constrain a new job (all in `scripts/ci-cd/behavior-gating.test.ts`):**
- Aggregator names (`:116-126`).
- Network job names and `verify-cert-run.sh`'s `EXPECTED_NETWORK_JOBS` list. Per `:300-313`, it must equal `${name} / ${leaf(shard)}` for every suite call in the PR lane. A new dedicated job therefore forces editing `scripts/ci-cd/verify-cert-run.sh`.
- The callers' exact keys (`if/name/needs/uses/with`) for each lane caller (`:1416-1432`).
- Only the lane, the soak and nightly's in-browser leg may call the suite (`:1433`).
- The shard pool's `exclude_files` equals the union of dedicated `test_files` (`:1504-1511`).
- Every file list is one line (`:1558`).
- Lane `.github/**` and `scripts/ci-cd/**` filter entries must equal the CI files the lane runs (`:1079-1175`).
- No bare `!` in filters (`:639`).
- A new `@nulo/*` workspace dependency, including devDependencies (`behavior-gating.test.ts:28`), must be added to the relevant filters (CI.md:236-241).
- `required-checks.sh` / `required-checks.ts` rename the protected checks. A new aggregator name must be added with `--add` and is an owner action; the test `required-checks.test.ts` pins them.
- A job in the lane that skips hides from its aggregator, so a dedicated job must always run when the caller does (`:1443`).

**Wall-clock.** The suite workflow gives each shard 30 minutes (`_extension-network-e2e.yml:115`). CI.md and the README record "~10–20 min" for a shard. SKILL.md:298-306 describes measuring the suite envelope from GitHub job timestamps, and cites 21 minutes for run 38364426588 (Chrome network). Per-file seconds are in `ext/tests/e2e/shard-timings.json`. I found no recorded suite wall-clock beyond those figures.

## 6. Firefox

`ext/tests/e2e/FIREFOX.md` (131 lines). Puppeteer talks WebDriver BiDi, and one browser is driven over two channels on one session: the classic channel and BiDi (`:17-24`). There is no CDP, so no `Fetch` domain (`:74`). Page-scoped BiDi network commands, such as `network.addIntercept` behind `page.setRequestInterception()`, are refused for extension pages from Firefox 157 (`:36-38`). The pinned Firefox is 158.0.

The `interceptRpc` driver method therefore registers one `http-on-modify-request` observer in the parent process (`fixtures/browser/firefox-rpc-intercept.ts:21-86`). It sees every channel, so there is no target to arm and no first-request race. It supports one observer per origin, and a redirect must target loopback. Firefox routes through a `data:` PAC with `DIRECT` for loopback (`:95`).

The interception layer is therefore different per browser and one-origin-only. A real loopback proxy sidesteps both browsers.

## Where such a tool should live (CLAUDE.md layering)

- `CLAUDE.md:28`: "Shared code lives in a package, never in another app... an app importing from another app's `src/` is a layering violation."
- `ext/tests/e2e/` currently imports `@/...` from the extension's own `src/`. That is allowed, but it is the extension's own tree, so a package test can't import it.
- `packages/aztec-runtime` tests can't import from `apps/extension/tests/...`.

Options for a reusable tool, strongest first:
1. **A new workspace package**, for example `packages/<test-node-proxy>` (a test-only, private package like the others).
   - Dependency: `node:http`, `node:net` only. No Aztec imports are needed for a relay-with-faults.
   - Both `ext/tests/e2e/**`, through a devDependency, and `packages/aztec-runtime/**` integration tests can import it.
   - Cost: update the CI filters and `behavior-gating.test.ts` (a new `@nulo/*` dependency of the extension, CI.md:236-241), and add a package `test` script (the workspace `test:all` picks it up).
2. **A shared test subpath of an existing leaf package**, following the `@nulo/wallet-core/testing` export pattern (`packages/wallet-core/package.json:10`, `src/testing/index.ts`). wallet-core is Aztec-free, which suits a pure HTTP relay. Its filters already exist (`core-foundation`).
3. **A directory under the extension's own tree** (`ext/tests/helpers/`, where the in-process drivers already live). This is easiest and keeps the existing `listenClaimed` and `port-registry` imports (both extension-owned). Packages cannot reach it, so the browserless integration test would also have to live under `ext/`.

Port claiming (`listenClaimed`, `port-registry.ts`, `reservePort`) is extension-owned in `ext/tests/e2e/` and `ext/scripts/e2e/`. A package-hosted tool must take injected `reserve`/`claim` callbacks, or accept a port from the caller.

## Reusable pieces for "two fault-injectable proxies in front of one sandbox"

- **Port discipline:** `listenClaimed` (`egress-guard.ts:167`), `reservePort` (`resolve-ports.ts:70`), `claimPorts`/`releasePorts` (`port-registry.ts:247,297`).
- **JSON-RPC parsing and faking:** `planBatchReplies` / `nodeInfoResult` (`rpc-stub.ts:14,71`). They are a ready batch parser for deciding fault per method (the stale-tip answer for `getBlockNumber`, a 500 for everything else).
- **A refusal answer:** `refuseNodeCall` (`node-stub.ts:21`).
- **The socket-teardown idiom** (`closeAllConnections` plus `server.close`, `node-stub.ts:44-49`; the `sockets` set in `rpc-stub.ts:92-110`). A "kill" fault needs this, plus a re-listen on the same port for "bring it back" so the stored endpoint URL stays valid.
- **Sandbox-side hooks:** `mining-hold.ts` for holding block production, and `anvil-probe.ts` / `l1-signer.ts` for L1.
- **Sandbox URL:** `inject("aztecTestConfig").nodeUrl`, `AZTEC_NODE_URL` (env, the primary), or `AZTEC_PORT`.
- **Row editing:** `rewriteActiveNetwork` (`networks.ts:37`) to install `endpoints = [proxyA, proxyB]` and choose `primaryEndpointId`, as `endpoint-refused-recovery.test.ts` does.
- **Hit-counting for "what was dialed":** `ArmedInterception.hits()/failures()` plus the proxy's own per-endpoint counters give "which endpoint served which call".
- **Browserless wiring:** `createAztecNodeClient` plus `makeFetchWithTimeout` (`packages/aztec-runtime/src/utils/fetch`) through the production adapter. `stale-anchor.real.test.ts` shows how to build a real PXE against `AZTEC_NODE_URL`.

## How CI could run it on PRs touching the routing

1. **E2E scenarios:** a new file under `ext/tests/e2e/network/`.
   - It runs in the shard pool automatically (`vitest.e2e.network.config.ts:17` globs `tests/e2e/network/**`).
   - A timing entry appears after `bun scripts/ci-cd/e2e-timings.ts`.
   - It trips the existing `extension-network` filter because it is under `apps/extension/**`. A package-hosted proxy trips it only if the package is in the filter: add it, and extend `behavior-gating.test.ts` if it becomes an extension dependency.
   - A transfer-in-flight scenario that mutates the shared node's block production must go in a dedicated job (see `same-token-concurrent-sends`, lane `:73-85`). A lane edit means updating `exclude_files`, `verify-cert-run.sh` and `behavior-gating.test.ts`.
2. **Browserless integration layer** (the owner's "run in CI on every PR that touches the routing"): there is no existing harness (§4). The cheapest sound route:
   - Add a dedicated job in `_extension-network-e2e-lane.yml`, calling the suite workflow with a `test_files` list.
   - That runs under `e2e:agent`, so the sandbox, port claim and teardown are free. The file just needs a vitest config that includes it. Today the network config includes only `tests/e2e/network/**` and `tests/e2e/egress-guard.test.ts` (`vitest.e2e.network.config.ts:18`); a file under `tests/e2e/network/` would be included.
   - A browser-free file there would still pay the `agent.sh` extension build and Chrome fixtures only if it imports them. `global-setup.ts` always resolves the browser kind and `EXTENSION_PATH`; the sandbox boot is the cost shared with the other jobs.
   - It inherits the lane's strict aggregator for free.
3. **Alternative: a new standalone workflow** (reusable `_…yml` plus a `pr-…yml` with its own `changes` job and `status`):
   - Needs a new required check (`required-checks.sh --add`, an owner action), a `behavior-gating` pin, an entry in CI.md's table, and a new aggregator in `aggregators.test.ts`.
   - Best if the filter should be narrower than `apps/extension/**`: for example `packages/aztec-runtime/src/**`, the network service, and the proxy tool's own path. Narrower gating is allowed, but each filter entry must follow the "no bare `!`" rule and the lane-files-exact pins.
4. **Runtime budget (CLAUDE.md:498, SKILL.md:292-338):** every added e2e scenario must state the distinct failure mode, why a cheaper layer cannot prove it, its estimated then measured runtime, and each browser's suite wall-clock before and after. This argues for putting the combinatorial fault matrix (kill, delay, 500, stale tip, restore) in the browserless integration layer, with only one or two scenarios per browser in e2e.

**Search trail for the "absent" claims:**
- "No relay/forwarding proxy": the `createServer`/`Bun.serve`/`listen(`/`http-proxy` grep in §3, plus a read of each hit's handler.
- "CI does not run the sandbox-bound real test": `grep -rn "stale-anchor\|NULO_E2E_REORG"` over `.github`, scripts and CI.md found only the soak doc line (CI.md:155, unrelated), SKILL.md:205 and `shard-timings.json`.
- "No recorded wall-clock beyond ~10–20 min per shard": a read of CI.md (§ pr-extension-network-e2e), the README (§ CI sharding) and SKILL.md § Runtime budget; I did not run `gh`.
