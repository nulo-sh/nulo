# e2e-fixed-cost-1: recon and the measured baseline

Base: `origin/dev` at `b3d6e0a2a`. Two Explore agents (Sonnet) mapped the harness and classified every e2e file; the parent read the launch path and measured. Raw run data lives in the scratch run directory (`runs/<id>/`), never committed.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| Browser launch, guarded | `launchExtension` (`apps/extension/tests/e2e/fixtures/extension.ts:92`), `ownGuardedLaunch` (`fixtures/egress-guard.ts:426`), drivers `fixtures/browser/{chrome,firefox}.ts` | adapt (the first-run read and the liveness poll in `settleLaunchedExtension`) |
| Relaunch over a stored profile | `launchExtension({ userDataDir })`: `freshProfile` is "dir absent or empty" (`extension.ts:114`); used by `migration`, `legal-acceptance`, `restore-outcome`, `backup-roundtrip`, the network `backup-*` files | reuse as-is |
| Onboarding | `registerProfile` (`extension.ts:356`), `launchOnLocalNetwork` (`:607`), `setupConnectedPlayground` (`:469`), `connectPlayground` (`:407`), `grantCapBundle` (`:492`) | reuse as-is |
| Storage dump and restore | `readLocalStorage` / `writeLocalStorage` (`fixtures/update/in-place.ts:190-212`) | not needed (no template) |
| Script wallet (aztec.js) | `fixtures/aztec.ts`, loaded lazily by `tokenReadyExtension` (`extension.ts:847`), `feeJuiceReadyExtension` (`:891`), `feeJuiceImportedExtension` (`:958`), `burst-account.ts:94`, `extra-tokens.ts:25`, `helpers/handshake-import.ts:142`; statically by 36 network files and `fixtures/selfpay-phase.ts` | reuse as-is |
| Loading `@aztec` in vitest | `networkRunner().server.deps.inline: [/@aztec(-labs\|-foundation)?\//]` (`apps/extension/vite.shared.ts:156-160`), `noirAliases` (`:86`) spread by `vitest.e2e.network.config.ts` and `vitest.e2e.all.config.ts` only | reuse as-is (native loading is a known limit) |
| Per-file isolation | `e2eIsolation` = forks, `isolate: true`, `fileParallelism: false` (`vite.shared.ts:132`) | reuse as-is; no test pins it |
| Fork setup | `tests/e2e/network-setup.ts` (setupFiles, per fork); `global-setup.ts` (main process, imports `./fixtures/aztec` statically at line 16) | reuse as-is |

No "launch from a template profile" helper and no profile copy exist: searched `cpSync|copyProfile|fs.cp(|snapshot|seedStorage|dumpStorage` over `tests/e2e` and `scripts/e2e`; the one `cpSync` stages a build (`update/in-place.ts:87`). No warm-up of the aztec import exists: `network/_probe-warmup-effect.test.ts` is a gated probe of a browser warm-up, not of the import.

## The file population (199 e2e files)

- **Test onboarding, first run, import, restore, migration or update replay: 31** (20 smoke, 11 network). They must keep proving a clean install.
- **Only need an onboarded wallet: 161.** 148 start from `registeredExtension` or `registeredExtensionPerTest`; 64 network files connect the playground through a `dappConnected*` fixture, 21 more connect explicitly.
- **Bare launch: 2** (`egress-guard`, `shipped-token-list`). **No browser: 5.**
- **A fresh browser per test: 90 files** use a per-test fixture (clean install, WebAuthn, capability or session state, profile wipes, worker kills, RPC interception).
- **aztec.js in the fork:** 36 network files import it statically (it loads before any fixture); 34 load it through a fixture or helper; about 60 never load it.

## Where a launch's time goes (baseline spans, block-time-1)

Spans from block-time-1's instrumented runs at `ca052f08` (loaded host, load1 100-310), exclusive time per file:

| | Chrome network, 124 files | Chrome smoke 2/3, 20 files | Firefox smoke 2/3, 21 files | Firefox network union, 32 files |
|---|---:|---:|---:|---:|
| File time | 7915 s | 847 s | 1316 s | 3829 s |
| Launches (registrations) | 176 (157) | 77 (41) | 83 (44) | 48 (46) |
| Launch, mean per launch | 5.1 s (11.4 %) | 4.4 s (40.0 %) | 5.6 s (35.5 %) | 8.1 s (10.2 %) |
| `registerProfile` | 2.7 s (5.4 %) | 2.4 s (11.6 %) | 3.3 s (11.0 %) | 4.0 s (4.8 %) |
| `switchToLocalNetwork` | 0.8 s (1.7 %) | — | — | 1.2 s (1.5 %) |
| `connectPlayground` + `grantCapBundle` | 5.1 + 1.3 s (7.0 %) | — | — | 8.4 + 2.5 s (8.6 %) |
| Close (egress and CSP checks) | 0.6 s (1.4 %) | 0.5 s (4.8 %) | 1.7 s (10.7 %) | 2.8 s (3.5 %) |

On Chrome 3.7 s of the 5.1 s launch is the wait for `nulo:liveness` (the worker's boot); on Firefox the launch is the driver (Firefox start, add-on install, BiDi attach).

## Probes on this host (2026-10-21; load1 at start: Chrome 43, Firefox 98)

Probe spec (scratch): five fresh launch+register+close cycles, then a template profile registered once and copied per launch, five copy+launch+unlock+close cycles. Medians, ms:

| Step | Chrome | Firefox |
|---|---:|---:|
| Fresh launch (browser start / liveness / settle total) | 2705 (417 / 2014 / 2226) | 4429 (3160 driver: session 1798, add-on 955, attach 215) |
| `registerProfile` | 1827 | 2904 |
| Close (CSP read / browser / guard stop) | 346 (109 / 141 / 103) | 1778 (597 / 935 / 103) |
| **Fresh cycle total** | **4996** | **9212** |
| Copy the template (113 MB on Chrome) | 87 | 32 |
| Launch over the copy | 7463, of which **5019 the first-run-tab poll** | 9714, of which **5205** |
| Unlock to `#/popup/general` | 1257 | 2068 |
| Close | 497 | 1520 |
| **Template cycle total, poll excluded** | **~4260 (−0.7 s)** | **~8100 (−1.1 s)** |

- The first-run-tab read (`extension.ts:292-304`) waited its full 20 × 250 ms on every launch over the copy. In the baseline the same wait cost `migration` six launches and `legal-acceptance` one on Firefox smoke 2/3 (36 s), `legal-acceptance` one on Chrome smoke 2/3 (5 s), and no network launch.
- Chrome's liveness wait lands at 2014-2027 ms in every fresh sample: the 500 ms poll (`extension.ts:280`) rounds the worker's boot up to its grid.

## Every launch installs (relaunch probe, load1 at start 159-188)

Scratch spec: the staged build plus a probe `onInstalled` listener that records `reason` in session storage; launch fresh and register, then relaunch over the same `userDataDir` twice, snapshotting `chrome.windows.getAll({ populate: true })` (and on Chrome `browser.targets()`) after the settle and 3 s later.

- `reason: "install"` on every launch, fresh and reused: 4 of 4 per browser. Under `--load-extension` (Chrome) and as a temporary add-on (Firefox) a relaunch is an install.
- After each relaunch's settle, and still 3 s later, one `type: "popup"` window shows `src/popup/index.html#/popup/auth`, on both browsers, and `nulo:onboarding:tab-id` is gone: the onboarding page read `nulo:onboarding:completed` (true since the first launch), opened that window, dropped the id and closed itself (`src/onboarding/app.vue:51-72`) before the settle's read.
- Chrome relaunch launches took 7.6-8.8 s, of which the 5 s read.
- The popup's page is a Puppeteer `page` target on both browsers (`relaunch-chrome-2`, `relaunch-firefox-2`: `…/src/popup/index.html#/popup/auth`), while `chrome.windows.getAll({ populate: true })` hides its tab URL on Chrome (`"tabs":[null]`; the manifest has no `tabs` permission). Firefox shows it in both.

## The aztec.js import (probes; load1 at start 92-194)

A fork per file (`isolate: true`) imports `fixtures/aztec.ts` from scratch:

| Load path | First fork of a run | Every later fork |
|---|---:|---:|
| Today: `@aztec` inlined through vitest's module runner | 22.1-25.3 s (vite's transform of the graph) | 4.1-5.8 s |
| Same, after `global-setup` imported it in the main process | 22.1 s: the main process's import warms nothing for the workers | 4.4-5.8 s |
| Native Node loading (no inline) plus a load hook that adds the JSON attribute | 2.5 s | 2.1-2.2 s |

- The inline exists because four packages lazily `import()` JSON without `with { type: "json" }`, which Node 24 refuses (`ERR_IMPORT_ATTRIBUTE_MISSING`). Literal `import("….json")` sites in their runtime `.js`: `@aztec-labs/accounts` 6 in 6 files, `noir-protocol-circuits-types` 99 in 2, `protocol-contracts` 3 in 3, `standard-contracts` 4 in 4; no static JSON import lacks the attribute. Inlining only those four cannot work: a natively loaded importer (`@aztec-labs/pxe`) would load them natively too.
- `noirAliases` force the noir wrappers' `nodejs/` entry against vite's resolver; Node's own resolver takes the `node` export condition of both packages, so native loading needs no alias.
- In situ (agent runs `native-1` at load1 118 / `inline-1` at 176, `holdings` + `tx-sendTx-default` + `wait-for-tx-mined`, Chrome, retry 0): all green both ways; the fixture's import took 2209 ms native against 5276 ms inlined, and vitest's summed import time 15.8 s against 29.9 s. Unpaired and at different loads: an indication, not a measurement.
- vitest's SSR dependency optimizer (`deps.optimizer.ssr`, the 17 entry points `fixtures/aztec.ts` imports, inline kept): bundles, then fails on import in every fork with `Cannot read properties of undefined (reading 'MAX_STRING_LENGTH')` in pino's `thread-stream`, whose `require("buffer")` the bundle bound to the npm `buffer` stand-in; the same with `rolldownOptions: { platform: "node" }` (runs `import-5`, `import-6`).

## Collisions

- PR #978 (draft, shard balance) edits both e2e configs (three lines each, the sequencer) and `apps/extension/tests/e2e/README.md` § CI sharding. Small textual overlap with this lane's config edit; whichever lands second merges `dev`.
- No closed `known-limit` issue covers e2e launch or onboarding cost (`gh issue list --state closed --label known-limit --search "e2e launch onboarding"`).
