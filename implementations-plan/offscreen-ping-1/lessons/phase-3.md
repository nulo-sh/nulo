# Phase 3: e2e at retry 0

Host: shared, load1 125-177 throughout (no deps-audit-1 soak running). Dist built from `af337ad54`; the later commits change only tests and docs.

## Smoke, Chrome

`VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run build:chrome`, then `env -u EXTENSION_PATH NULO_E2E_RETRY=0 NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e`: 2,271 s, 271 passed, 24 skipped, **1 failed**.

- `network-arrival.test.ts` › "waits for the Terms sheet, shows until answered, and stays answered after Stay". It failed at L48: `reopen` waited 30 s for `#/popup/general` after the arrival had shown, and the test took 40.7 s against a usual 10 s. That route runs through the start grace (the background's Ready) and the profile reads (`popup/route-guard.ts`), and neither reads the PXE, so the offscreen document cannot hold it. Three runs of the file alone at load 130-133 passed, at 10.1, 10.3 and 10.1 s. Read as a load flake unrelated to this change; no open issue names it.

## Smoke, Firefox

The same build and run under `NULO_E2E_BROWSER=firefox`: 2,990 s, 276 passed, 20 skipped, 0 failed.
