# pxe-limits-1, phase 2: proving per flow

Flows: `transfers` (shield, unshield, private→private, public→public; four proofs), `tx-sendTx-default` (two dApp sends), `tx-sendTx-delegated-authwit` (one dApp send with an authwit), and a scratch PrivateFPC fuel send with `selfpay-phase`'s setup and assertions (one proof). Every run asserted a non-zero proof count. Times are the PXE's own `proveTx` timings: `proving` is the backend's proof, witness is the sum of `perFunction`, `sync` the header step. Cells are min / median / max in seconds over the proofs of that flow; a median of an even count is the mean of the two middle values.

## Local, one screening pass per arm and browser (2026-10-21, 188 cores)

| Run | load1 start → end | Backend seen |
|---|---|---|
| `p2-chrome-wasm` | 154 → 97 | WASM (`fallback`: no Presto server locally), 32 threads |
| `p2-firefox-wasm` | 97 → 56 | WASM, **1 thread** (below) |
| `p2-chrome-pl` | 56 → 143 | none (proverless) |
| `p2-firefox-pl` | 143 → 112 | none (proverless) |

| Flow (proofs) | Chrome WASM total | Chrome WASM proving | Firefox WASM total | Firefox WASM proving | Proving share |
|---|---|---|---|---|---|
| transfers (4) | 6.6 / 9.7 / 18.3 | 5.5 / 8.0 / 16.1 | 34.2 / 36.7 / 51.9 | 32.6 / 35.1 / 50.1 | 81-88 % / 95-97 % |
| dApp sendTx, default (2) | 16.3, 17.8 | 14.6, 15.9 | 58.9, 71.5 | 55.2, 68.4 | 89 % / 94-96 % |
| dApp sendTx + authwit (1) | 21.0 | 18.1 | 76.3 | 71.9 | 86 % / 94 % |
| PrivateFPC fuel send (1) | 23.2 | 20.5 | 65.5 | 62.8 | 88 % / 96 % |

Proverless, the same proofs take 0.8-3.5 s on Chrome and 1.1-4.6 s on Firefox, nearly all of it witness generation (0.7-4.3 s). Send to inclusion (the first receipt with a block number, status `proposed`) is 2.1-2.6 s on every arm (n = 5 per run; the dApp sends' receipt watcher did not record before their launch closed): the sandbox's 2 s pool age plus the build. The first proof of a launch carries bb.js's cold start (`transfers`' first proof 18.3 s against 6.6-10.4 s for the next three on Chrome WASM).

**Firefox proves single-threaded.** Its PXE frame reports `crossOriginIsolated: false` and no `SharedArrayBuffer` (`_pxl-env.ts` readout, `p1-iso-firefox`, 2026-10-21 21:49Z), while Chrome's offscreen document is isolated. bb.js sizes its pool only when shared memory exists (`@aztec-foundation/bb.js` 6.0.0-rc.6 `dest/browser/barretenberg_wasm/index.js:3-7`: `shared ? getAvailableThreads() : 1`, capped at 32), so every Firefox WASM proof runs on one thread: 2.8-3.8 × Chrome's total and 3.1-4.4 × its proving per flow (medians), on the same host at lower load. The manifest's `cross_origin_embedder_policy` / `cross_origin_opener_policy` keys are Chrome's opt-in; Firefox does not isolate extension pages (Mozilla bug 1673477, REOPENED). Recon's line "extension pages are cross-origin isolated" holds for Chrome only.

## CI, Chrome soak, `repeats=3`, `retry=0`

Native (Presto 1.1.3, soak 39684358284, measure commit `0fd1ab009`, 4-core runner): every flow file green in all three iterations; 24 proofs, every one through `transmit` → `proved`.

| Flow (proofs) | Total | Proving | Witness | Proving share |
|---|---|---|---|---|
| transfers (12) | 8.0 / 8.9 / 9.7 | 7.0 / 7.7 / 8.3 | 0.9 / 1.2 / 1.4 | 85-88 % |
| dApp sendTx, default (6) | 8.4 / 9.0 / 9.8 | 7.1 / 7.7 / 8.4 | 1.2 / 1.3 / 1.4 | 84-86 % |
| dApp sendTx + authwit (3) | 16.0 / 17.0 / 17.4 | 13.2 / 13.9 / 14.3 | 2.6 / 2.9 / 2.9 | 82-83 % |
| PrivateFPC fuel send (3) | 16.3 / 16.9 / 17.9 | 14.3 / 14.7 / 15.7 | 1.9 / 2.1 / 2.1 | 87-88 % |

Send to inclusion 2.3 / 2.5 / 2.6 s (n = 15).

WASM (soak 39688200977, measure commit `c34f464a9`, Presto disabled): green in all three iterations; 24 proofs, every one through `detect` → `secure-connection-unavailable` → `fallback` → `proving` → `proved`, in an isolated offscreen document with `SharedArrayBuffer` and 4 cores.

| Flow (proofs) | Total | Proving | Witness | Proving share | WASM ÷ native, proving medians |
|---|---|---|---|---|---|
| transfers (12) | 16.7 / 18.3 / 26.1 | 15.6 / 17.0 / 24.8 | 1.0 / 1.2 / 1.4 | 92-95 % | 2.2 × |
| dApp sendTx, default (6) | 25.5 / 26.2 / 26.5 | 23.9 / 24.7 / 25.1 | 1.3 / 1.3 / 1.4 | 94-95 % | 3.2 × |
| dApp sendTx + authwit (3) | 38.9 / 39.2 / 39.5 | 35.8 / 36.2 / 36.5 | 2.9 / 2.9 / 2.9 | 92 % | 2.6 × |
| PrivateFPC fuel send (3) | 34.2 / 34.5 / 35.1 | 32.0 / 32.2 / 32.9 | 2.1 / 2.1 / 2.1 | 93-94 % | 2.2 × |

Send to inclusion 2.3 / 2.5 / 2.6 s (n = 15), the same as native: the sandbox's pool age and build, not the backend.

Runners are not one CPU: iteration 1 of each soak ran on an Intel Xeon Platinum (8573C native, 8370C WASM), iterations 2 and 3 on an AMD EPYC 7763; all 4 cores, 16 GiB. The per-iteration proving median barely moves with it (native 7.7 / 8.2 / 8.0 s, WASM 24.4 / 24.3 / 24.8 s; load1 at the self-test 2.3-3.0 native, 3.1-4.6 WASM).

Proverless (soak 39693343873, measure commit `e60236f56`): green in all three iterations; 24 sends, no proving phase recorded. Runners again mixed (AMD EPYC 7763, AMD EPYC 9V45, Intel Xeon Platinum 8573C; load1 1.6-2.0 at the self-test).

| Flow (sends) | Total | Witness |
|---|---|---|
| transfers (12) | 0.5 / 0.7 / 1.0 | 0.5 / 0.7 / 0.9 |
| dApp sendTx, default (6) | 0.5 / 0.7 / 1.0 | 0.5 / 0.7 / 0.9 |
| dApp sendTx + authwit (3) | 1.5 / 2.0 / 2.5 | 1.4 / 1.8 / 2.3 |
| PrivateFPC fuel send (3) | 1.2 / 1.5 / 1.8 | 1.1 / 1.3 / 1.6 |

Send to inclusion 2.3 / 2.4 / 2.5 s (n = 15). Witness generation reads about half the prover arms' figure for the same flows (0.7 against 1.2 s median for transfers); the cause is not measured (a likely one is the proving arms' witness steps sharing 4 cores with the backend), so the proverless figure is read as the lower bound.

## Verdicts

- **H4a holds** on every backend and browser: proving is 81-89 % of `proveTx` on Chrome WASM locally, 94-97 % on Firefox WASM, 82-88 % native on CI and 92-95 % WASM on CI. Witness generation is the rest (1-3 s), and it is what a proverless run measures.
- **H4b holds**, at the low end of "several": on 4-core runners (separate jobs) WASM proving takes 2.2-3.2 × native per flow (3.1 × over all 24 proofs' medians), never under 2. A send a user waits on costs 8-17 s with Presto and 17-39 s without it on a 4-core machine; on Firefox, single-threaded, a further 2.8-3.8 × the Chrome WASM total on the same host.
