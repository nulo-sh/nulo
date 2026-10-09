# Phase 3 — entry 147 rechecked (Firefox, prover-ON, in-browser proving)

## Setup

- Nothing listened on this build's Presto endpoints (`127.0.0.1:59833`, `:59834`, from
  `src/presto/config.ts`) before or after the run (`ss -ltn`), so proving ran in the browser (WASM).
- A never-staged copy, `tests/e2e/network/_probe-imported-timing.test.ts`, wrapped each of the file's
  three `sendTransfer` calls with a timestamp before and after. Deleted after the run; `git status`
  showed it gone.
- `NULO_E2E_BROWSER=firefox NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/_probe-imported-timing.test.ts`,
  no `NULO_E2E_PROVERLESS`: the bundle check printed no proverless stamp, and the log shows no Presto
  proving phase.

## Result (2026-10-09) — green, 3/3 (247 s)

| Call | Where | `sendTransfer` duration (fill, estimate, prove, submit toast) |
|---|---|---|
| 1 | source account's first self-transfer (deploys it) | 56.2 s |
| 2 | file-imported account in a second profile | 52.9 s |
| 3 | file-imported account in a passkey profile, after a ceremony re-unlock | 52.1 s |

No "Transaction submitted" toast wait came near its 300 s bound, and nothing failed.

## Routing

Every call submitted well inside its toast wait, so entry 147 is deleted at close-out with these
three durations; no WASM proving-time line goes into the `aztec-update` skill.

Caveat, recorded so nobody over-reads it: this host has 192 cores, and in-browser proving scales
with them; a 4-core CI runner would prove more slowly. No CI lane proves in WASM (follow-ups: "No CI
lane proves in browser WASM", an owner call), so the old overrun's most likely cause stays the
popup's former 60 s `executeTransfer` deadline, now 60 minutes.
