# pxe-limits-1, phase 1: instruments and calibration

Runs live in the scratch run directory (`runs/<id>/`: `log.txt`, `rec.jsonl`, `env.txt` with HEAD, patch sha, arm, browser, load1 at start and end, and other e2e runs in the host port registry). Every local run: `agent.sh`, retry 0, `NODE_OPTIONS=--dns-result-order=ipv4first`; host 188 usable cores of 192 (AMD EPYC 7R13), 753 GiB.

## The patch set (scratch, never committed)

Purpose-built instead of block-time-1's `instruments-v11.diff`, which applies at this base only with `--3way` and records transitions this lane does not use. One in-memory sink per context (`globalThis.__pxl`), drained by the test over CDP (Chrome: the offscreen target and the service worker) or a frame script (Firefox: each PXE iframe of the background page, then the page), every 5 s and at close, so a reaped context loses at most 5 s.

- **PXE calls** (`packages/aztec-runtime/src/pxe/service.ts`): one record per `withPxeWrite` / `withPxeRead` call with its label, lock wait, run time, ok, the anchor block after the call (writes), and the returned `timings` and `nodeRPCCalls`; a live in-flight counter for the probes' *quiet* (no call queued or running for 2 s).
- **Node calls** (`packages/aztec-runtime/src/utils/fetch.ts`, the one fetch every node client is built on): per context and JSON-RPC method, the count, the tags carried (`params[0].tags`, or `params[0]` when it is an array), wall ms and response bytes. No payload is kept.
- **Proving** (`chain-runtime.ts` `onPhase`): every Presto phase with its data (`durationMs` on `proved`).
- **Scanner** (`incoming-transfer/service.ts`): each private and public poll's duration, forced or not, ok.
- **Send to inclusion** (`execution-coordinator.ts`): after `node.sendTx`, a receipt poll every 250 ms until the receipt carries a block number (status `proposed`). Its `getTxReceipt` calls count in the service worker's node tally.
- **Test side** (`tests/e2e/_pxl.ts`, attached to every `launchExtension` by a scratch edit of `fixtures/extension.ts`): the PSS of every process this test process spawned, sampled each second (peak kept); `navigator.storage.estimate()` and the OPFS walk; on Chrome the JS heap of the service worker, the offscreen document and each of its workers after a forced GC; `aztecDebug_mineBlock` for an empty block.

Two instrument faults found and fixed before any measurement: the scanner record's `kind` is the scheduler's failure label ("Poll failed" = private, "Public poll failed" = public), read as such; the first node tally counted no tags because a logs query carries them inside an object (v2).

## Self-test (2026-10-21)

| Run | Files | Result | Wall | load1 start → end |
|---|---|---|---|---|
| `p1-self-chrome` (v1) | `transfers`, `_probe-selftest` | green, 168 s + 64 s | 446 s | 223 → 183 |
| `p1-self-firefox` (v1) | the same | green, 184 s + 74 s | 524 s | 206 → 226 |
| `p1-self-chrome-v2` | `_probe-selftest` | green, 124 s | 293 s | 185 → 191 |
| `p1-self-firefox-v2` | `_probe-selftest` | green, 152 s | 390 s | 172 → 193 |

Every instrument recorded on both browsers: PXE write and read records with stats, node tallies with tags, scanner ticks, PSS, OPFS size; heaps on Chrome. A run's fixed cost (build, sandbox boot, teardown) is 170-240 s at load1 170-220.

**Cold versus warm, one empty block, fresh profile with one token and one private note** (three repeats each, min / median / max):

| Browser | Call | Cold wall (ms) | Cold node calls / tags | Warm wall (ms) | Warm node calls |
|---|---|---|---|---|---|
| Chrome | `note.getNotesRaw` | 773 / 1171 / 1350 | 10-11 / 255 | 167 / 171 / 292 | 1-7 |
| Firefox | `note.getNotesRaw` | 786 / 1126 / 1176 | 10-14 / 255 | 71 / 81 / 143 | 1-6 |
| Chrome | balance refresh (`executeUtility`, PXE run) | 571 / 700 / 938 | 11 / 255 | 28, 52 (one coalesced) | 1 |
| Firefox | balance refresh (`executeUtility`, PXE run) | 994 / 1086 / 1124 | 11 / 255 | 40, 49 (one coalesced) | 1 |

The first PXE call after a block pays it: 10-14 node calls, 4 `getPrivateLogsByTags` requests carrying 255 tags in all, 0.6-1.3 s; the call after it costs one `getChainTips`. Whichever caller comes first (scanner, balance queue, a dApp) pays; the recorded labels show which. The one repeat per browser above 1 warm call (7 on Chrome, 6 on Firefox) overlapped a scanner tick.

Two more instrument faults, found by phase 3's first runs and fixed before any number below was kept: Puppeteer's `browser.targets()` can drop the Chrome offscreen target while Chrome still runs the document (`chrome.runtime.getContexts` lists it, its SQLite workers stay listed), so every host read now falls back to the browser's own `Target.getTargets` and a flat attach (v6, counted per launch); and the busy counter is taken inside the guarded block, so a throw before it cannot leak a phantom in-flight call. The worker side also records each offscreen health ping (3 s budget), close and create; no close was recorded in phase 1's runs (phases 3 and 5 recorded some, in their lessons).

## CI self-test (soak 39684358284, 2026-10-21 22:09Z, measure commit `0fd1ab009`, 3 iterations)

Dispatched with phase 2's native arm (below). It started 5 s after warm-stack-1's `measure-f` dispatch (39684348870); separate runners, so only queue time overlaps.

- Runner: 4 cores (AMD EPYC 7763 in iterations 2 and 3, an Intel Xeon Platinum 8573C in iteration 1), 16 GiB, `navigator.hardwareConcurrency` 4; the offscreen document is cross-origin isolated with `SharedArrayBuffer`, so bb.js gets 4 threads there.
- Iteration 2 green; iterations 1 and 3 red in the self-test only, on the dropped-target fault above (`0 host(s)`), every flow file green in all three. Records present on CI: PXE records with stats, node tallies, scanner ticks, proving phases, PSS.
- CI cold versus warm (iteration 2, load1 2.3-2.9): `getNotesRaw` cold 349 / 351 / 412 ms, warm 46-50 ms; a 4-core runner pays an empty block about half what this host pays at load1 170-210.
- Phase 2's WASM soak (39688200977, measure commit `c34f464a9`, with the v6 fallback): the self-test green in all three iterations, every launch recorded, and no launch needed the fallback (`relocated: 0` in all 18), so the dropped target did not recur there; the fallback is proven locally only.
