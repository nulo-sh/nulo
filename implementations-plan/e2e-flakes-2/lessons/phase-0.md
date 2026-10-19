# Phase 0: root cause and plan consults

## Probe (2026-10-18)

A throwaway `tests/e2e/network/_probe-balance-writers.test.ts` (never committed) armed a
`chrome.storage.onChanged` recorder on `nulo:core:token-balances@*` in the popup, right after
`tokenReadyExtension`. Phase "live": Home open, no delete, 35 s of records. Phase "locked": close the
page, `stopBackground`, reopen on `#/popup/auth`, delete every balance row, 35 s of records, then
unlock and 20 s more. One run per browser through `agent.sh`, retry 0, both exit 0.

| Browser | Home settled | Live writes after the fixture | Writes while locked (35 s) | After unlock |
|---|---|---|---|---|
| Firefox | +2.06 s | +1.35 s (projection, same value, new `updatedAt`) | 0 | create at `updatedAt: 0`, then projection |
| Chrome | +0.80 s | +0.61 s and +30.3 s (projections) | 0 | create at `updatedAt: 0`, then projection |

Reading: a projection lands in the 0.6 to 1.4 s after the fixture returns, and the spec's delete runs
at about +1.5 s on Firefox CI (13:29:16.70 fixture log, 13:29:18.18 failure). With the worker gone and
the wallet locked, nothing writes the root.

## Base timings (2026-10-18)

Unchanged spec, prover-ON, one run each through `agent.sh`: Firefox 112.9 s, Chrome 52.1 s (both
`1 passed`). The Chrome run started at load 188, over the host's 150 rule: the check printed the
load but did not gate on it. Every later run waits in an `until` loop on the load first.

## Consults

- **Codex r1** (gpt-6.1-sol, high, session 01a1505c): conditional approve, 5 findings, all
  accepted or agreed; see plan § Audit verdicts. Verified against the tree: strict mode defaults on
  (`src/wallet/config/config.ts:26`), projections stamp `Date.now()` after the projection
  (`balance-job-queue.ts:247`), the task-spy test exists (`service.test.ts:715`).
- **Opus Plan r1**: conditional approve, 8 findings, all accepted. Verified: the CI shard pool is
  proverless (`_extension-network-e2e-lane.yml`), `waitForLockScreen` checks the session record
  then the route (`tests/e2e/fixtures/auth.ts:48-61`), init loads tokens only for an active
  profile (`token-balance/service.ts:178-186`), and the 13:29:18.18 CI line is the teardown dump.
- **Codex r2** (resume, session 01a1505c): conditional approve, 4 findings; 3 accepted, the
  `onChanged` recorder rejected on proportion (plan D7).
- **Codex final** (fresh session 01a1506a): approve, two wording fixes applied.
