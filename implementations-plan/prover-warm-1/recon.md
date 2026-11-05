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
