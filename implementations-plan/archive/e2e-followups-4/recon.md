# e2e-followups-4 — recon

Base: `origin/dev` at `6488b1b`. Two Explore agents (sonnet) plus the driver's own reading of the issue, the failed nightly log and the code. Every claim below cites the tree at that commit, or a CI log.

## The sample

- Nightly run 38130969762 (dev `0643a14`), job `smoke-against-artifact / Vitest + Puppeteer` (Chrome, `artifact_name: extension-chrome`, `NULO_E2E_ARTIFACT_RUN=1`): `send-keyboard.test.ts:134` failed with `the focused row send-fee-method-sponsored: expected 'da2d6064' to be 'e2e-protocol-fpc-1'`. The test pins `retry: 0` itself (`send-keyboard.test.ts:110`), so this was one attempt. 198 passed, 23 skipped.
- The same run's `smoke-firefox-against-artifact` passed the same test (job 114446227139).
- **This was the first artifact run of the test at all.** The test landed in #235 (`83a6c22`, 2026-10-09 20:05 UTC). The 10-09 nightly (37919470569) ran before it; the 10-10 nightly (38043372938) skipped both artifact smoke jobs. So the artifact lane has run it once on Chrome (red) and once on Firefox (green).
- The CI log carries no extension-side log line (the smoke job uploads `.e2e-state`, which was empty). Nothing in the log shows which rows existed.

## The mechanism the code supports (an inference until Phase 1 measures it)

1. **`da2d6064` is a row id, not an address prefix.** Protocol-FPC discovery stores each row under `nextRandomId(this.storage)` (`src/wallet/services/fpc/service.ts:222`), eight random hex digits (`src/wallet/services/id-allocators.ts`, `nextRandomId`). No other path in a smoke run writes an FPC row: `addFpc` is the settings form, restore is a backup import.
2. **Discovery needs a node that answers.** `getFpcs(chainId)` discovers when the profile lacks a protocol row at the derived address (`service.ts:138-142`). It re-reads under the lock, then calls `pxe.registerContract` (`service.ts:215`). That reaches the offscreen PXE, whose runtime creation awaits `node.getL1ContractAddresses()` and `createPXE(node, …)` (`packages/aztec-runtime/src/pxe/chain-runtime.ts:189`, `:231`). A failure is caught per item and writes nothing (`service.ts:170-174`).
3. **A guarded smoke run has no such node; an artifact run does.** `global-setup-smoke.ts:72` arms the egress guard only when `NULO_E2E_ARTIFACT_RUN !== "1"` ("An artifact run keeps its documented live leg, the shipped token list against the live chain"). Only a guarded launch holds the Testnet stand-in that answers every call with HTTP 400 (`fixtures/extension.ts:101`, `:141-151`; `fixtures/node-stub.ts`). An artifact launch only blackholes the price host (`fixtures/browser/chrome.ts:48-51`). Every build seeds Testnet as the active network (`src/wallet/services/network/service.ts:100-104`), at `TESTNET_RPC_URL` (`src/wallet/constants/network-endpoints.ts`).
4. **Discovery starts before the test's seed.** `registeredExtensionPerTest` runs `registerProfile`, which waits on Home's `balance-amount` (`fixtures/extension.ts:329-373`). Home's `GasBalanceCard` calls `ensure(gas)` (`src/popup/components/modules/general/GasBalanceCard.vue:128`); the service worker answers with `getGasBalances` → `readPrivate` → `getFpcs(chainId)` (`src/wallet/services/execution/gas-balance-reader.ts:183`, `execution/service.ts:321`). The test seeds its two rows later, after its own `openPopup` reaches Home (`send-keyboard.test.ts:20-31`, `helpers/fpc-seeds.ts`).
5. **The picker then lists two Nulo sponsors.** `buildFeeMethods` adds one row per `DefaultSponsoredFpc` row and dedupes nothing (`src/popup/components/modules/send/fee-helpers.ts:202-223`). Both rows sit at the protocol address, so both are `isProtocol`. `menuOrder` is a stable partition, Fee Juice rows, then Nulo sponsors, then hand-added ones (`fee-helpers.ts:260-265`). Within the Nulo sponsors the order is storage order: `EntityStorage.getValues()` is `Object.entries` of `storage.get()` filtered by prefix, with no sort.
6. **ArrowDown focuses the first enabled row.** From the trigger, `focusAdjacentItem` with no active item focuses item 0 of `[data-dropdown-item]`; disabled and checking rows carry no such attribute (`src/components/ui/Dropdown/DropdownRoot.vue:241-256`, `DropdownItem.vue`). Both Fee Juice rows are disabled with no balance, so item 0 is the first Nulo sponsor in storage order.
7. **The Send page reads the list once.** `FeeSettingsCard` subscribes to `onFpcDeleted` and `onFpcUpdated` only (`src/popup/components/modules/send/FeeSettingsCard.vue:438-439`). A row discovery adds after the Send mount does not appear until the next fetch.

So in an artifact run the test fails when discovery has stored its rows before the Send page reads the list, and the random id sorts before `e2e-protocol-fpc-1` in the order the browser's storage returns. Chrome's `storage.local` is believed to return keys in byte order (unverified here); an id that starts with `0`-`9` or `a`-`d` (14 of 16) sorts first. Firefox's green run fits either branch: discovery had not stored its rows by the Send mount, or its id sorted later.

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| Keep a spec's node from answering, in every run mode | `interceptRpc(browser, extensionId, origin, mode)` (`fixtures/browser/index.ts:245`): "on an origin the launch holds, it replaces the launch's until `stop()`". `send-fee-privacy.test.ts:36` uses it with `{ kind: "refuse" }` "so the run does not depend on the public endpoint being up or down". | reuse-as-is |
| The guarded launch's node stand-in (HTTP 400 with a JSON-RPC body, which the node client stops on at once) | `startNodeStub()` (`fixtures/node-stub.ts:21`), port claimed through `listenClaimed` in `~/.agents/ports.md`; `holdNodeStub` wraps it for the launch only | reuse-as-is (`startNodeStub` + `interceptRpc` redirect) |
| A fresh launch with no profile, and the registration flow | `freshExtensionPerTest` (`fixtures/extension.ts:681`), `registerProfile(ctx)` (`:329`, exported) | reuse-as-is |
| Seeding the protocol FPC rows | `seedProtocolFpcs`, `SEEDED_SPONSOR_FPC_ID` (`helpers/fpc-seeds.ts`); only `send-keyboard.test.ts` uses them | reuse; its doc comment needs the artifact-run caveat |
| A wait until discovery has finished | none. Searched `fpc`, `discover` in `src/e2e`, `tests/e2e/fixtures`, `tests/e2e/helpers`, `scripts/e2e` | build nothing (the chosen fix removes the need) |
| Repeating one smoke file N times at retry 0 and tallying | none for smoke. `scripts/ci-cd/test-soak/` drives a workspace's unit `test` script; `extension-network-e2e-soak.yml` is network-only; the e2e-testing skill names a hand loop (`SKILL.md` § Reproduce like CI) | a scratch shell loop under `~/.cache/nulo-backlog/e2e-followups-4/`, never committed |
| Running smoke against a release-shaped build locally | no script. The nightly builds with `_build-extension.yml` (`bun run --cwd apps/extension build:chrome`, no `VITE_*`; the job refuses five e2e flags if present) and the smoke job loads it with `EXTENSION_PATH` and `NULO_E2E_ARTIFACT_RUN=1` | compose by hand (plan § Phase 1); one line in the e2e-testing skill if the recipe proves useful |
| Port claims for smoke runs | `agent.sh` is the network runner only (root `e2e:agent`). `test:e2e` claims its loopback listeners itself on guarded launches (`ownGuardedLaunch`, `nulo-e2e-egress-*` rows) and none on an artifact run | the plan runs smoke through `test:e2e`, not `agent.sh` |

## PR-lane build versus nightly artifact

| | PR lane (`pr-extension-smoke-e2e.yml`) | Nightly (`smoke-against-artifact`) |
|---|---|---|
| Build | in-job `build:chrome`, production mode, `VITE_NULO_E2E_MIGRATION_FIXTURE=1`, `VITE_NULO_E2E_TOKEN_SEEDS=1` + `_CONFIRM=1` (empty seed list), `VITE_NULO_E2E_CSP_REPORT=1` | `_build-extension.yml`, production mode, no `VITE_*` (shipped Testnet token list), `version_override` |
| Run mode | guarded: egress guard plus the Testnet stand-in | `NULO_E2E_ARTIFACT_RUN=1`: unguarded, live Testnet node, price host blackholed |
| Shards | three | whole suite |

`src` has no `import.meta.env.DEV`/`PROD`/`MODE` branch; every build difference is a `VITE_*` flag, and none touches FPC discovery. The difference that matters to #308 is the run mode, not the build.

## Collisions and neighbours

- Open PRs: #271 (`tokens-and-balances`, draft) touches token balances, not the fee picker or the e2e fixtures this lane edits.
- Lane `wallet-followups-5` (#312) runs network files on both browsers on this host now; its close-out edits `index.md` and `lessons.md`.
- #281 (`e2e-followups-3`), which #308 said it waited on, is closed and archived.
- Not in scope, noted for Phase 1 to watch: `send-fee-privacy.test.ts` arms its refusal only after `registeredExtensionPerTest` registered, so on an artifact run the registration still reaches the live node; and the `priced` tests seed a token row while an artifact run's shipped token list seeds its own through the same node. Both passed in the sample run.
