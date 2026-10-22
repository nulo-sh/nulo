# Phase 3: e2e at retry 0

Host: shared, load1 125-177 throughout (no deps-audit-1 soak running). Dist built from `af337ad54`; the later commits change only tests and docs.

## Smoke, Chrome

`VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run build:chrome`, then `env -u EXTENSION_PATH NULO_E2E_RETRY=0 NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e`: 2,271 s, 271 passed, 24 skipped, **1 failed**.

- `network-arrival.test.ts` › "waits for the Terms sheet, shows until answered, and stays answered after Stay". It failed at L48: `reopen` waited 30 s for `#/popup/general` after the arrival had shown, and the test took 40.7 s against a usual 10 s. That route runs through the start grace (the background's Ready) and the profile reads (`popup/route-guard.ts`), and neither reads the PXE, so the offscreen document cannot hold it. Three runs of the file alone at load 130-133 passed, at 10.1, 10.3 and 10.1 s. Read as a load flake unrelated to this change; no open issue names it.

## Smoke, Firefox

The same build and run under `NULO_E2E_BROWSER=firefox`: 2,990 s, 276 passed, 20 skipped, 0 failed.

## Network, each file alone

`NULO_E2E_BROWSER=<browser> NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/<file>.test.ts`, from `af337ad54`'s source. These runs are prover-on with no Presto on the host, so the wallet proves in WASM. That keeps the document busy for longer than CI's proverless shards do, which is the case this change targets. Every run passed at retry 0.

| Browser | File | Tests | File time | Wall (with build and sandbox) | load1 at start | Recorded median (recon) |
|---|---|---|---|---|---|---|
| Chrome | `incoming-transfers` | 3/3 | 54 s | 135 s | 138 | 37 s |
| Chrome | `execute-scope-account` | 1/1 | 65 s | 146 s | 55 | 46 s |
| Chrome | `pxe-host-state` | 1/1 | 35 s | 170 s | 41 | 25 s |
| Firefox | `incoming-transfers` | 3/3 | 104 s | 243 s | 49 | 47 s |
| Firefox | `execute-scope-account` | 1/1 | 189 s | 358 s | 123 | 56 s |
| Firefox | `pxe-host-state` | 1/1 | 95 s | 225 s | 119 | 28 s |
| Firefox | `firefox-background-restart` | 1/1 | 153 s | 297 s | 142 | 41 s |

The medians come from `shard-timings.json` (CI, mostly proverless, 4-core runners). The times here are a prover-on build on a shared host and measure no regression. The change adds no e2e scenario (D7), so the suites' wall-clock is unchanged by construction.
