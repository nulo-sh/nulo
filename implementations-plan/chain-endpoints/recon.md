# Recon: chain-endpoints

Read at `origin/dev` 9574a9d by three Sonnet explorers (outbound hosts; smoke harness and CI; arc-2 surfaces and issue claims), then checked by the planner at the cited lines. Paths are repo-relative; `EXT` = `apps/extension`, `AR` = `packages/aztec-runtime/src`, `SW` = the background service worker (Firefox: the event page).

## Reuse map

| Capability the plan needs | Existing code | Verdict |
|---|---|---|
| Refuse every non-loopback host for a smoke browser, both browsers | Per-host precedents only: Chrome `--host-resolver-rules=MAP api.coingecko.com 127.0.0.1:1` (`EXT/tests/e2e/fixtures/browser/chrome.ts:53`) and a Firefox PAC routing that host to a dead port (`fixtures/browser/firefox.ts:229-247`), both armed only when `NULO_E2E_ARTIFACT_RUN=1` | **adapt**: same launch-level seam, generalised to "loopback direct, everything else to the guard" |
| Record which hosts a run tried to reach | None. Searched `drpc`, `coingecko`, `host-resolver`, `proxy-server`, `network.proxy`, `blockedHosts`, `allowedHosts`, `egress`, `hermetic`, `Network\.`, `setOfflineMode`, `NetLog`, `on("request`, `requestfailed` over `EXT/tests`, `EXT/scripts`, `scripts/`, `.github/` | **build new**: a loopback proxy that refuses and records (`fixtures/egress-guard.ts`) |
| Fail a launch on a recorded problem at close | The CSP recorder's latch in `launchExtension` (`fixtures/extension.ts:98-110`, `fixtures/csp-violations.ts`) | **reuse the shape**: a second check in the same `close` latch |
| Per-request refusal or redirect of one origin | `interceptRpc` (`fixtures/browser/index.ts:122,224`; CDP `Fetch` on Chrome, a `http-on-modify-request` observer on Firefox) | **reuse as-is** where a spec must count hits; it runs inside the browser, before the guard |
| Smoke-only arming, off for the network suite and artifact runs | `project.provide("extensionPath")` in `global-setup-smoke.ts:51`, read with `inject` in `launchExtension` | **adapt**: one more provided key |
| Build-time e2e flag (double opt-in, stamp, negative release grep) | `EXT/src/e2e/config.ts:29-40,79-99`; `.github/workflows/_build-extension.yml:84-101,139` | **not used by arc 1** (D3); the fallback F2 would copy it |
| Hidden-character detection for a URL | Strippers only: `stripWireControl`/`SANITIZER_STRIP` (`EXT/src/wallet/services/dapp-session/capability-meta.ts:155-169`), `contact-name.ts:12-15`, `sanitizeString` (`EXT/src/utils/string.ts`). Searched `\p{C}`, `\p{Z}`, `\u200`, `\u202`, ` `, `zero-width`, `bidi`, `invisible`, `control char` | **build new** predicate beside `rpcTransportVerdict` (`packages/wallet-core/src/utils/rpc-url.ts`) |
| Map a refusal to a field line | `endpointErrorText` (`EXT/src/popup/components/popups/endpoint-error-text.ts`), keyed on exported `ERR_*` constants | **reuse**: one more constant and branch |
| Honest "unavailable" value | `FeeCostReadout.vue:42-45` (`aria-hidden` dash plus a visually hidden sentence); `balance-hero-unknown` (`BalanceView.vue:316`, dash, no reason) | **adapt** for the hero |
| A test over the built manifest | None reads `dist/*/manifest.json`; `EXT/src/manifest.test.ts:123-130` pins the source config; `tests/e2e/security.test.ts:123-128` already calls `chrome.runtime.getManifest()` in the built extension | **adapt** `security.test.ts` (smoke, both browsers) |
| Hash for an inline `<style>` | None (`grep sha256-` over `EXT/manifest`, `EXT/src`, `EXT/store`, `SECURITY.md`) | **build new**, derived from the installed package in a test |
| Shadow-root stylesheet | None in our code; `style-mod` adopts sheets on a root without `.head` (`node_modules/.bun/style-mod@4.1.3/.../style-mod.js:94-101`) | **build new** (mount the viewers in a shadow root) |

## Outbound hosts a smoke run reaches today

PR source build: `VITE_NULO_E2E_TOKEN_SEEDS(+_CONFIRM)=1` with no storage key, so the token seed list is empty (`.github/workflows/_extension-smoke-e2e.yml:116-122`).

| Host | Who | Trigger | Evidence |
|---|---|---|---|
| `lb.drpc.live` (Testnet seed RPC, key in path) | SW | `syncNetworkStatus` → `getNodeStatus` → `getNodeInfo`, fire-and-forget on every popup bootstrap and network switch | `EXT/src/composables/useProfileBootstrap.ts:79`; `EXT/src/wallet/services/network/service.ts:737-751,1004-1007`; retries 3 times with 1/2/3 s backoff (`AR/utils/fetch.ts:115-118`) |
| `lb.drpc.live` | offscreen PXE (Firefox: background page) | Home's gas card reads the gas balance; the first PXE op creates the chain runtime (`getL1ContractAddresses`, `getNodeInfo`, `getBlock(0)`) | `GasBalanceCard.vue:128`; `gas-balance-reader.ts:173-193`; `AR/pxe/chain-runtime.ts:179,195` |
| `api.coingecko.com` | SW | Immediately on profile create and unlock, every 3 min while unlocked, and on each popup mount when the cache is incomplete; the id set always includes Fee Juice, so holdings do not matter | `EXT/src/wallet/services/price/service.ts:31,114,147-161,179-213,323`; `price-map.ts:36-39,89-95` |
| `localhost:8080` (Local Network seed) | SW | Backup export and import status probes | loopback, on the host |
| `127.0.0.1:59833/59834` (Presto) | popup, onboarding, offscreen | Only after a Presto server was once reached, or on a click | `EXT/src/composables/usePrestoCheck.ts:36-44`; loopback |
| `crs.aztec-cdn.foundation`, `crs.aztec-labs.com` | offscreen | WASM proving only | `@aztec-foundation/bb.js` `net_crs.js:3,5`; no smoke spec proves (inference, see plan) |
| `nulo.sh`, `presto.build`, `testnet.app.unleashed.systems`, `testnet.aztecscan.xyz` | navigations | User clicks only; `setUninstallURL` is a registration, not a request | `EXT/src/utils/legal-links.ts:10`; `fee-helpers.ts:318-319`; `explorers.ts:38`; `presto/config.ts:15`; `runtime.ts:129` |
| `passkey.nulo.sh` | browser (WebAuthn) | Passkey ceremonies; whether either browser fetches anything is unknown | `EXT/src/wallet/services/passkey/spec.ts:27`; `infra/passkey-rp/src/worker.ts:4` |

No `WebSocket`, `XMLHttpRequest`, `EventSource`, `sendBeacon`, `importScripts`, remote `<img>`/`<link>`/`<script>`, analytics or error reporting in `EXT/src` or `packages/*/src`. The Presto banner's Google Fonts link is off (`EXT/src/onboarding/pages/presto.vue:94`, `fonts="none"`).

Artifact runs (release and nightly smoke of the production zip) block only the price host and keep the RPC live on purpose: "the one run of the shipped list against the live chain before a release" (`EXT/tests/e2e/README.md:59`). Blocking the RPC there once failed three reset specs, because the unarmed seeder's retries delayed profile deletion (`chrome.ts:49-52`).

## Smoke specs that touch these hosts

- No smoke spec needs a live host on the source build. `fiat-display.test.ts:12-29` passes because nothing is price-mapped; refusal makes that deterministic.
- `send-fee-privacy.test.ts:36,70` refuses the Testnet origin with `interceptRpc` and asserts `hits() > 0`; `contacts-import.test.ts:78` refuses Testnet; `import-dead-rpc.test.ts:139` and `import-errors-scroll.test.ts:59` refuse or redirect the loopback Local Network. In-browser interception runs before the network stack, so a launch-level guard leaves these specs as they are (inference; arc 1's gate proves it).
- `home-links`, `navigation`, `rows`, `send-keyboard` seed a USD quote into storage (`fixtures/helpers.ts:1055-1063`); a live refresh can race that seed today.
- `isPrestoProbeNoise` (`fixtures/extension.ts:46-56`) filters only `ERR_CONNECTION_REFUSED` on two loopback URLs; a page-level fetch of a refused host would add a console error. Recon found no page-level fetch of a non-loopback host.

## CI and pins

- No test in `scripts/ci-cd` pins the smoke workflow's env, build flags or negative-grep list. `scripts/e2e/firefox-driver.test.ts:15-17` pins `FIREFOX_LAUNCH_PREFS`; `scripts/e2e/browser-seam.test.ts:11` exempts only `chrome.ts` and `firefox.ts` from the one-driver rule.
- Nothing in `.github/` denies egress on a runner (no `iptables`, `unshare`, `harden-runner`); the composite actions state "No sudo".
- Smoke never builds: `bun run test:e2e` loads whatever `EXT/dist/<browser>` holds (`FIREFOX.md:5`); a plain `bun run build` disarms the dist (`.claude/skills/e2e-testing/SKILL.md:125-126`).

## Arc-2 surfaces

- **CSP** (`EXT/manifest/manifest.config.ts:47-62`): one string on both browsers, `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; img-src 'self' data: blob:; connect-src 'self' blob: https: http:; style-src 'self' 'unsafe-inline'`. Pinned at source by `EXT/src/manifest.test.ts:123-130`. `EXT/store/remote-code.md:32,38` cites the lines and says connect-src admits any HTTPS host; `EXT/scripts/store-listing.test.ts:121-141` checks only that cited lines exist.
- **What needs `'unsafe-inline'`**: CodeMirror's `style-mod` writes a `<style>` into `document.head` for both viewers (`EXT/src/components/JsonViewer/LogsViewer.vue:222`, `JsonViewer.vue:68`); the Presto banner sets its shadow root's `innerHTML` to `<style>${STYLES}</style>…` (`@alejoamiras/presto-banners@1.1.0` `dist/element.js:145`), a fixed string. Vue `style`/`:style` bindings set CSSOM properties, which style-src does not govern. No `attachShadow` or `adoptedStyleSheets` in our code. `LogsViewer.vue:238-245` listens on `document` and reads `e.target.closest(…)`, which a shadow root would retarget. `JsonViewer` also renders in `DataViewerPopup` (`PopupManager.vue`). `EXT/tests/e2e/rows.test.ts:403-447` already opens the logs window under the CSP recorder.
- **[::1]**: allowed by `rpcTransportVerdict` (`packages/wallet-core/src/utils/rpc-url.ts:13-23`), used by `RpcUrlSchema` (`EXT/src/wallet/services/network/spec.ts:145-159`) and by the node factory (`AR/adapters/aztec-node-factory-adapter.ts:48,55`).
- **The refine message never reaches a person**: a refused URL surfaces as "Something went wrong." (`endpoint-error-text.ts:6-12`, pinned by `EditEndpointPopup.test.ts:116`) or the toast in `NewNetworkPopup.vue:108-135`.
- **`RpcUrlSchema` also validates results**: `NetworkEndpointSchema`/`NetworkSchema` are the result schemas of the network client (`network/client.ts:37-46`, `spec.ts:161-174,231-239`), and the account-state restore filter keeps only networks that pass `NetworkSchema` (`EXT/src/wallet/services/account-state/service.ts:304`), over the live networks it is handed. Backups carry no network rows: the `network` slice is retired and refused (`EXT/src/wallet/services/backup/backup-migration-registry.test.ts:105`) and a full restore reseeds the built-in networks (`EXT/src/composables/full-backup-restore.ts:263`). The storage row codec is lax (`spec.ts:52-75`). `setActiveNetwork` calls the node factory after writing the active pointer, and the factory throws on a refused URL (`network/service.ts:609-622`; `AR/adapters/aztec-node-factory-adapter.ts:65-68`); popup start awaits it (`EXT/src/composables/useProfileBootstrap.ts:76`).
- **Trim**: no explicit `.trim()`; zod 4's `.url()` trims and writes back (`zod/v4/core/schemas.js:192,245`), but the service passes the raw param on (`network/service.ts:~662-664`), so a trailing NBSP is stored as `%C2%A0` (inference from code).
- **WHATWG `URL`** (Bun, matches the spec): space, NBSP, C0, DEL, C1, ZWSP, bidi controls, U+2028, U+3000 and BOM inside a path are percent-encoded; tab, LF and CR are removed; a ZWSP in a host is dropped.
- **Hero** (`EXT/src/popup/components/modules/general/BalanceView.vue:117-120,186-218,313-316,346-352`; `EXT/src/composables/usePrices.ts:28-59`): a failed fetch is indistinguishable from success: `PriceService.doRefresh` swallows the failure and returns `readUsable()` without emitting (`price/service.ts:315,368-375`). Pinned today by `BalanceView.test.ts:546-558`. `TokenCard.vue:47,79` hides a missing fiat line.
- **Default tokens** (`EXT/src/wallet/services/token/default-tokens.ts:48-86`): compiled in; no fetch.

## Collisions and order

- `e2e-harness-gaps` arc 1a (#169, gate G1) edits `fixtures/browser/firefox.ts`, `fixtures/browser/ownership.ts`, `tests/e2e/README.md`, `FIREFOX.md` and the `e2e-testing` skill; arc 1b edits `vite.shared.ts` (`e2eReporters`, which the smoke config calls). Arc 1 here edits `firefox.ts`, `chrome.ts`, `index.ts`, `extension.ts` and the same docs, so it builds on `dev` after #169's PR lands.
- PR #252 (ci-release-supply) edits the smoke workflows; arc 1 here edits no workflow.
- Reservations (program lane map): R2 `usePrices.ts`/`BalanceView.vue` after send-queue-activity arc 3 (#103); R3 `LogsViewer.vue` after forms-and-contacts arc 1 (#212); R5 `manifest.config.ts`: this lane's arc 2 (#101) before home-onboarding-chrome arc 2 (#156). The R2 rule text says "send-queue arc 2 (#103)", but the same file's arc table puts #103 in send-queue arc 3, as the lane brief does.
- #197's guard belongs where `fee-juice.ts` lives (fees-and-sponsors depends on it); #77 waits on unleashed.
