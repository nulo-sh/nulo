# prover-warm-1 recon

Base: `origin/dev` at 4291a8c98. One Sonnet explorer (reuse sweep over eight capabilities) plus the planner's own reads of the installed `@alejoamiras/presto` 6.0.0, `@aztec-labs/bb-prover` 6.0.0 and `@aztec-foundation/bb.js` 6.0.0 builds. Paths are repo-relative; `node_modules/...` names the installed package file.

## What the issue claims, checked

| #1623 claim | Holds? | Evidence |
|---|---|---|
| The service worker warms the hashing WASM, not the prover | yes | `apps/extension/src/wallet/runtime.ts:492` (`BarretenbergSync.initSingleton`) |
| The proving singleton is created lazily on the first `createChonkProof`, in the offscreen document or the Firefox frame | yes | bb-prover `dest/prover/client/bb_private_kernel_prover.js:165-171`; the PXE page is the same `src/offscreen/index.html` on both browsers (`apps/extension/src/wallet/utils/offscreen.ts:262-267, 324`) |
| "with the prover's own options (wasm path, threads, logger)" | **partly**: the prover passes none | `PrestoProver`'s constructor calls `super(opts.simulator ?? createLazySimulator())` (presto `dist/lib/presto-prover.js:91`), so `this.options` is `{}` and the call is `initSingleton({ logger: undefined })`; bb.js then picks its defaults (threads from `hardwareConcurrency`, the shimmed WASM URL, a 2^19-point CRS) |
| `initSingleton` ignores options after the first call | yes, and a failed init clears the memo | bb.js `dest/browser/barretenberg/index.js:110-123` |
| One-time cost: WASM fetch and compile, worker spawn (threads only when isolated), CRS load | yes | fetch, `pako` ungzip and `WebAssembly.compile` on the calling thread (`barretenberg_wasm/index.js:3-13`, `apps/extension/src/shims/bb-fetch-code.ts:17-30`); threads `= shared ? min(cores, 32) : 1` (`barretenberg_wasm/index.js:4-7`, `helpers/browser/index.js:4`); CRS 2^19 G1 points (32 MiB uncompressed) plus 2^16 Grumpkin points (4 MiB) from IndexedDB `keyval-store`, else downloaded (`barretenberg/index.js:6, 62-77`, `crs/browser/cached_net_crs.js`) |
| Only the browser prover is affected | yes | `PrestoProver.createChonkProof` calls `super.createChonkProof` only on `forceLocal` or a fallback (`presto-prover.js:122-171`) |
| The singleton dies with the document | yes | module-level `barretenbergSingletonPromise`; Chrome's offscreen document survives a worker restart, Firefox's frame lives as long as the background page (`ARCHITECTURE.md` § 6) |
| Privacy § 5.9 ties the CRS download to proving | yes | `legal/privacy.md:260-266`: "Browser-based proving may download … when the required data is not already cached" |
| "The repo holds no cold-versus-warm measurement" | **partly** | no controlled one, but `implementations-plan/archive/pxe-limits-1/lessons/phase-2.md:21` records Chrome WASM `transfers`' first proof at 18.3 s against 6.6-10.4 s for the next three, on a fresh profile (CRS download included, different transaction shapes), and that Firefox's PXE frame is not cross-origin isolated, so it proves on one thread (`:23`) |

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| Earliest "this request will prove" point | dApp: `DappInteractionService.execute()` (`apps/extension/src/wallet/services/dapp-interaction/service.ts:584-610`), before `isConfirmationNeeded`; proving kinds are `BROADCASTING_OPERATION_KINDS` (`apps/extension/src/wallet/services/execution/service.ts:147`). Own Send: the review sheet in `apps/extension/src/popup/pages/send.vue` (`SendReviewSheet`, `REVIEW_KEY`), no execute window. `register_token` and `createAuthWit` open the same window and do not prove | adapt: key on the operation kind, never on the window |
| SW → offscreen call | `PxeService` allowlist (`packages/aztec-runtime/src/pxe/service.ts:94-118`), `Methods` (`spec.ts`), descriptor table with compile-time drift checks (`descriptors.ts:44-84`), client (`client.ts:110-141`); a non-PXE method is `{ rpc: true, ipxe: false, requiresNetwork: false }` like `provisionChainStoreKey` | adapt: one method; it takes no PXE lock (a proof holds the chain write lock up to 30 min) |
| "Will Presto prove" before proving | nothing decides it before `createChonkProof`. A probe can raise the browser's local-network prompt, so the wallet probes unasked only once `prestoReached` is set (`apps/extension/src/composables/usePrestoCheck.ts:1-10`, `apps/extension/src/wallet/config/config.ts:64`); `ExecutionCoordinator.getLastProveOutcome()` holds the last attempt's backend in worker memory (`execution-coordinator.ts:189-226`) | adapt: predict from `prestoReached` and the last outcome; never probe |
| Prior warm-up | only `BarretenbergSync` in the worker; nothing in the repo calls the async `Barretenberg` (searched `\bBarretenberg\b[^S]`, `from "@aztec-foundation/bb.js"` over `apps/extension/src` and `packages/*/src`; `warm|prewarm|preload|prefetch|eager`) | build new, about one function |
| Isolation and threads | manifest COEP/COOP for every extension page (`apps/extension/manifest/manifest.config.ts:62-67`); Chrome's offscreen document is isolated, Firefox's frame is not (pxe-limits-1, above) | reuse; record per run |
| CRS cache identity | `packages/aztec-runtime/src/pxe/crs-cache.sources.test.ts` pins `keyval-store` and the keys `g1Data`, `g2Data`, `grumpkinG1DataV2` as bb.js's only IndexedDB use | reuse: a "cached" check reads exactly what that test pins |
| Prover-ON e2e | `apps/extension/scripts/e2e/agent.sh` builds prover-ON unless `NULO_E2E_PROVERLESS=1`; no Presto listening means the silent WASM fallback; `sendDefaultTx` (`tests/e2e/fixtures/send.ts:107`) is one 1-token `sendTx` through the execute window | reuse |
| A fresh PXE document | Chrome `closePxeHost` (`tests/e2e/fixtures/browser/chrome.ts:361`); Firefox's is a no-op (`firefox.ts:1004`), and removing the frame from the background page makes `ensureOffscreenRunning` create a new one | reuse on Chrome, a probe-only frame removal on Firefox |
| Reading the PXE page | Chrome: CDP `Runtime.evaluate` on the offscreen target (`chrome.ts:35-55`); Firefox: `evaluateInBackgroundPage` and a sandbox into the frame (`firefox.ts:606-640`); pxe-limits-1's scratch instruments (`__pxl` records, `withHostSessions`, a PSS sampler over `/proc/<pid>/smaps_rollup`) do both | adapt as scratch, never committed |
| Option and prover pins | `packages/aztec-runtime/src/pxe/chain-runtime.test.ts` mocks `@alejoamiras/presto` and pins `httpsOnly`, the required preflight and proverless; `apps/extension/src/offscreen/index.test.ts` mocks the runtime | adapt: a new test runs the real prover against a mocked bb.js |

## Collisions

- A warm-up that calls `checkPrestoStatus()` would probe Presto at window open: an earlier local-network prompt is a change a person sees. Excluded.
- A warm-up with any option other than the prover's wins the singleton for the document's life.
- A warm-up through the PXE lock would queue behind a running proof.
- Open issues: #1624 (endpoint failover) and #1236 (mailing list) share no file with this lane.

## Probe (2026-11-05)

Phase 1 as written, with the deviations listed at the end. Builds: `agent.sh` prover-ON at 4291a8c98 plus the scratch instruments, never committed. Nothing listened on 59833 or 59834 before any launch, and every send's phases ran `fallback → proving → proved`: the browser proved. The host has 188 cores shared with other leads; load1 was 56-315 across the runs and is recorded on every record. Chrome's offscreen page: `crossOriginIsolated` and `SharedArrayBuffer` true, `hardwareConcurrency` 188, 35 worker targets once bb.js runs (its 32-thread cap). Firefox's frame: neither, `hardwareConcurrency` 128, one thread.

Instruments, sha256:

| file | Chrome runs 1-4 | Firefox runs 1-6, Chrome runs 5-6 |
|---|---|---|
| `src.patch` | `0361810b27076bc0dd8d9e681ad5b66bb034805e633418ecd6965f8d396fbb63` | `a95111129f606fd1ad4c8bf5d500b787e5f9aea8a452349265b5dc7bde52a2fe` (adds the fetch counter) |
| `_probe-prover-warm.test.ts` | `4942de3964018987c739a0f73ee59f0945cf3ad317434800c7c97835e5f88b50` | `f2cabc71e3de827b162f104262cb2625b23c3f06785a5afb63c0fc7dda250d86` (reads the counter; the A-arm fix) |

### Verdict: close (D2)

| | Chrome | Firefox |
|---|---|---|
| `C − H` of `proved.durationMs` by run (ms; runs 1-3, then the added 5-6) | 1279, −1480, −243, 4610, 970 | −4502, −899, 6694, 2465, −3884 |
| **median saving** | **970** | **−899** |
| median C proof (the slower browser has the larger) | 11056 | **33131** |
| `E_H − E_C` by run (ms) | 922, 596, 680, 201, 228 | 898, 739, −440, −1185, 1798 |
| median `E_H − E_C` (R4: < 500) | 596 | 739 |
| constrained pair, 4 cores (run 4): saving / `E_H − E_C` | 2601 / 356 | 2257 / 711 |
| Confirm-to-proved, median `C − H` | 895 | −988 |

Both medians are under 1.0 s, so D2 says close. The first three pairs crossed a bar on both browsers, so each browser got D2's two added pairs (runs 5-6), the most Phase 1 allows. Chrome's five-pair median sits 30 ms under the bar. The verdict does not rest on that margin:
- Ship needed at least 2.0 s on Firefox. The whole removable init, measured on its own in the split page, is 1.16-1.31 s there and 1.29-1.62 s on Chrome.
- R4 fails on both browsers (596 and 739 ms) and in Firefox's constrained pair (711 ms).

### Split page (no send; bb.js's traced log, ms)

| segment | Chrome (5 runs) | Firefox (5 runs) |
|---|---|---|
| D4's read of the three rows | 168-262 | 191-244 |
| fetch and ungzip | 185-306 | 249-304 |
| compile | 32-41 | 100-146 |
| threads and CRS load (one segment) | 766-978 | 668-764 |
| **whole init** | **1294-1619** | **1158-1309** |
| browser-tree PSS: init peak / 5 s settled, over the baseline (MiB) | +298..+476 / +271..+474 | +380..+487 / +92..+248 |

### H arm (the shipped sequence: D4's read, then the exact-options init, at window open)

- From window open, the warm-up ended after 1496-2190 ms on Chrome and 1537-2455 ms on Firefox.
  - The init inside the window took 1280-1934 ms (Chrome) and 1303-2019 ms (Firefox), longer than in the split page because the estimate competes for the same page.
  - D4's read took 163-266 ms (Chrome) and 206-416 ms (Firefox).
- Every warm-up ended before its window could be approved (`E_H` 2722-3509 ms on Chrome, 2230-3884 ms on Firefox). I1's condition held, so the saving measured is the whole init, and the proof's own variance between pages of one shape (3.7-6.5 s per arm) buries it.
- R3 held, but did not decide the verdict.
  - Chrome: every C page went from 3 to 35 workers at its proof. Every H page held 35 after its warm-up and 35 after its proof.
  - bb WASM fetches (Chrome runs 5-6, Firefox runs 1-6): 2 per page in every arm, C included, so the warm-up added none. The second fetch is present in every arm, so it is not the prover's; it is probably the page's synchronous hashing backend (moderate confidence).

### A arm (CRS absent; recorded only)

`keyval-store` was deleted from an extension page while no PXE page was open, and the delete returned `ok` every time.
- Firefox: 43730-51071 ms (median 45406), about 12 s over C's median.
- Chrome (runs 5-6 only): 8882 and 11470 ms, no visible cost.

The probe did not check where the points came from (the CRS hosts are direct on a guarded launch, and the profile's HTTP cache may hold the first send's download). Neither number is a device's first-proof cost.

### Not compared

- S0 (the first send, which deploys the account): Chrome 12160-16762 ms, Firefox 47849-53338 ms.
- W (the second send, same page): Chrome 7226-11462 ms, Firefox 27694-36540 ms.

### Deviations from Phase 1

1. **P4's fetch count.** Resource Timing listed no bb WASM fetch on Chrome; the extension-scheme fetch never reaches it (0 in every Chrome run 1-4 page, while workers went 3 → 35). From Firefox run 1 and Chrome run 5 on, a scratch counter in `apps/extension/src/shims/bb-fetch-code.ts` counts the fetches. On Chrome runs 1-4, R3 rests on the worker count alone.
2. **Chrome's A arm, runs 1-3.** It failed on a probe bug, not a host reason. The arm closed the page itself, then the fresh-page helper closed it again, and `chrome.offscreen.closeDocument()` threw "No current offscreen document". Every record before A was complete. The helper now closes only a live page, and Chrome's A comes from runs 5-6.
3. **Firefox runs 5-6.** The first launch was stopped in setup, before any send, by the driver's own tool time limit. Its ports were released, its owner process ended, and no record was kept. The relaunch is the run reported here.
