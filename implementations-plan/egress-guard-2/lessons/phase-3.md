# Phase 3: the e2e runs stay green, and the leak goes red

All runs on this host at retry 0 (`NULO_E2E_RETRY=0`), load1 under 150 at each start. A temporary, uncommitted trace logged each `lb.drpc.live` attempt at the guard (`held`, watched or not), each watch, suspend, re-arm and close start, on one clock; it was removed before the PR.

## Step 1: red run, Chrome, the allow-list filter (2026-10-19)

- `NOT_PAGES` set to `service_worker`, `background_page`, then `{ exclude: true }`; `NULO_E2E_RETRY=0 bun run e2e:agent tests/e2e/network/passkey-execution-canary.test.ts`, prover-ON (WASM).
- Red, and the close's message was the only failure: `chrome sent lb.drpc.live:443 to the guard 20 time(s) while the launch's stand-in held its origin`. The trace shows the attempts from 1.5 s after the watch, every 1 to 3 s, all `held=true`, none near the one suspend and re-arm (the post-restart window). The test body's own steps passed; ci-e2e-hygiene-1 measured 24 such attempts in a green run.
- Filter restored (`git diff --exit-code` clean on the file); Step 5 is the green rerun.

## Step 3: full smoke, Chrome

- Armed build (`VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run build:chrome`), then `NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 NULO_E2E_RETRY=0 bun run test:e2e`.
- Green: 58 files passed, 6 skipped; 265 tests passed, 14 skipped; 1858 s.
- Trace: 159 watched launches, 27 suspend and re-arm pairs, one `lb.drpc.live` attempt in the whole run, the control case's own (`held=true`). No attempt before a hold, in a window, at an arm's edge or after a close began. ci-e2e-hygiene-1's four Chrome smoke records did not recur.
- The new control case: 3.9 s on Chrome (control spec 10.1 s for its 8 tests).

## Step 3: full smoke, Firefox

- Same armed build for Firefox, then the same command under `NULO_E2E_BROWSER=firefox`.
- Green: 61 files passed, 3 skipped; 265 tests passed, 14 skipped; 2288 s.
- Trace: 164 watched launches, 22 suspend and re-arm pairs, one `lb.drpc.live` attempt: in `sw-resilience`, inside a kill window (182 ms after the suspend, 145 ms before the re-arm), counted unheld, as the rule says. None at an arm's edge or after a close began.
- The new control case: 5.2 s on Firefox.

## Step 4: network subset, Chrome, proverless

- `NODE_OPTIONS=--dns-result-order=ipv4first NULO_E2E_PROVERLESS=1 NULO_E2E_RETRY=0 bun run e2e:agent` with `tests/e2e/egress-guard.test.ts` and the 13 network files recon lists under a kill or a spec interception (both canaries excluded).
- Green: 13 files passed, 1 skipped (`firefox-background-restart`, Firefox-only); 50 tests passed; 1718 s.
- Trace: 20 watched launches, 17 suspend and re-arm pairs, one `lb.drpc.live` attempt, the control case's (`held=true`); the control case took 4.0 s.

## Step 4: network subset, Firefox, proverless

- The same command under `NULO_E2E_BROWSER=firefox`.
- Green: 13 files passed, 1 skipped; 48 tests passed, 3 skipped; 1788 s.
- Trace: 18 watched launches, 16 suspend and re-arm pairs, no `lb.drpc.live` attempt at the guard at all: the control case's page request went to the stand-in, as on Firefox it must. The control case took 6.5 s.

## Step 5: both canaries prover-ON

- `NULO_E2E_RETRY=0 bun run e2e:agent tests/e2e/network/frozen-account-canary.test.ts tests/e2e/network/passkey-execution-canary.test.ts`; nothing listened on `127.0.0.1:59834`, so the proofs ran in WASM.
- Chrome: 2 files, 4 tests green, 254 s (frozen 93.7 s, passkey 75.1 s). This is Step 1's green rerun on the restored filter. No node attempt at the guard; 2 watched launches, 2 kill windows.
- Firefox: 2 files, 4 tests green, 492 s (frozen 204.5 s, passkey 180.3 s). No node attempt at the guard.

## What the trace says (I2, I4)

- Over 363 watched launches and 84 kill or swap windows on both browsers, the guard saw two `lb.drpc.live` attempts beside the red run: the control case's own on Chrome (held, as asserted twice) and one inside a Firefox kill window (unheld). None at an arm's edge, none before a hold, none after a close began. I2 and I4 stay plausible and unreproduced; per D5 the close-out files them as one closed `known-limit` issue.
- The trace was removed (`git status` clean but this log) before the review loop.

## Wall-clock

- Smoke: Chrome 1858 s, Firefox 2288 s (ci-e2e-hygiene-1 measured 1635 s and 2345 s at be8ae1c5, under other load; the gap is load, not this change). Network subset: Chrome 1718 s, Firefox 1788 s.
- The one added e2e case: 3.9 s (Chrome smoke), 4.0 s (Chrome network), 5.2 s (Firefox smoke), 6.5 s (Firefox network), against the 6-10 s estimate.
