# e2e-flakes-3, phase 0: recon and planning

Every consult and every run, in order. Runs at retry 0; smoke from `apps/extension` (`bun run test:e2e -- tests/e2e/onboarding-tab.test.ts --retry=0`, `NULO_E2E_BROWSER=firefox` for Firefox, filtered to the last test), network through `agent.sh` (`NULO_E2E_PROVERLESS=1 NULO_E2E_RETRY=0`).

## Consults

- Explore agent (sonnet): traced Import → `addToken` → toast. Found the popup's catch, the balance wait's two timers, and `batchedViewSimulation` as the metadata reader. Its suggestion that the wait without a bound was the cause did not survive the CI logs (D5).

- Codex audit round 1 (gpt-6.1-sol, high, read-only): approve-with-changes, five findings. Folded and answered in plan.md § Audit verdicts.
- Codex audit round 2 (resumed with the revision and the new control and probe): approve; it withdrew the owner-ask requirement.
- Final pass, fresh Codex session: approve-with-changes, three findings (app-capped sends' new dependency and the validation-on balance band, as an owner ask; the probe's green overstated; run ids not preserved). Resumed with the corrections and the argument against the owner ask: approve, requirement withdrawn.
- Opus Plan leg (opus): approve-with-changes, ten findings. Verified F1 and F6 on its own. Folded and answered in plan.md § Audit verdicts.

## #1667 runs (Firefox 158, local)

| Run | Count | Outcome | Wall-clock per file |
|---|---|---|---|
| Plain | 5 | green | 9.9-12.5 s |
| `taskset` to two CPUs | 6 | green | 12.0-12.7 s |
| Instrumented (BiDi contexts, targets, `chrome.tabs` after the press) | 1 | green; one setup tab in every source within 20 ms | 10.3 s |
| Probe: a tab forced into an `extension` remote at attach, and a web page switched to the setup URL from chrome scope | 4 | green: Puppeteer listed the tab each time | 8.6-9.9 s |
| Chrome, instrumented | 1 | green | 8.4 s |

Probe of the replacement source: `chrome.tabs.query({})` from the control page lists the setup tab's URL on both browsers and `undefined` for `about:blank`, with no `tabs` permission.

Control, after the Opus leg asked for one: a throwaway `bidi-attach.ts` edit drops every BiDi event that names `src/onboarding/index.html` (the setup tab's commits and history updates). With the spec's target count, it failed with `PollTimeoutError: one setup tab: not within 10000 ms; last: 0`, CI's exact message, in 16.7 s. With the `chrome.tabs` count it passed in 8.5 s, with the same events dropped.

Failed attempt: reproducing CI's drop by forcing either BiDi gap. Firefox announced the tab in all four probes, so which gap CI hit stays unverified (plan.md, I3).

## CI evidence

| Issue | Run (workflow) | Job | Outcome | Node refusals (UTC) |
|---|---|---|---|---|
| #1667 | 41725298981 (smoke, Firefox) | 126228672898 | 3 of 3 attempts `last: 0`; job 126240937855 reran green | none |
| #1667 | 41882196956 (smoke, Firefox) | 126757425883 | 3 of 3 attempts `last: 0` | none |
| #1667 | 42015228837 (smoke, Firefox) | 127211382649 | 3 of 3 attempts `last: 0` | none |
| #1590 | 41569948542 (network, Firefox) | 125700432837 | toast timeout | 03:19:31.155, 03:19:31.950 |
| #1590 | 41877094781 (network, Chrome) | 126739474487 | toast timeout | 17:34:23.583, 17:34:24.721 |
| #1590 | 41897234241 (network, Chrome) | 126810034339 | toast timeout | 19:40:00.302, 19:40:01.459 |
| #1590 | 41905697277 (network, Chrome) | 126839933833 | toast timeout; job 126872872495 reran green, no refusal | 20:30:59.594, 20:31:00.603 |
| #1590 | 42045082638 (network, Chrome) | 127305985998 | toast timeout | 14:37:56.265, 14:37:57.413 |

Green Chrome shard 2/5 jobs sampled (2026-11-04/05), all with no refusal except two that logged one each: 126720123875 (17:01:31.740), 126727495714, 126731992291, 126757434707, 126761520545, 126783801934, 126798590476 (19:18:52.125), 126810047772, 126814137789, 127203989447, 127211779970, and the rerun 126872872495. Each refusal line is cut at 200 characters (`global-setup.ts:617`), before the two fee values.

## #1590 runs and data

- CI logs: the 5 failing jobs and 12 green jobs above, read in full. Two node refusals 1.0 s and 2.1 s after the click in every failure; one refusal in 2 green jobs; none in 10.
- Network, Chrome, instrumented popup and token-balance service: `connect-locked-queue` and `token-add-auto-trust` green, 147 s. Then shard 2/5 green, 27 files, 2094 s; `token-add-auto-trust` 33.8 s and `pin-to-home` 33.8 s inside it. 16 instrumented adds: click to toast in 1.8-7.4 s.
- Network, Firefox, instrumented: shard 2/5 green, 26 files, 1770 s; `pin-to-home` 42.0 s inside it.
- Fee sampler on that Firefox run's node, every 250 ms for 19.5 minutes (the last errors are the node going down with the run): `getCurrentMinFees`, the worst of `getPredictedMinFees(limit)`, and each new block's fee. Over 27 blocks, no block's fee exceeded the prior current × 1.5. The current fee fell 5.4× between two blocks.
- Source: the node's `getPredictedMinFees` leads with the next-block fee its simulation charges (plan.md, F7). Upstream `BaseWallet.completeFeeOptions` pads `getMinFees(Limit)`.
- Probe `_probe-fee-rise.test.ts` (uncommitted): a loopback proxy between the wallet and the local node serves a quarter of the node's current fee.
  - Three failed attempts: the proxy rewrote `node_getCurrentMinFees`, and nothing was rewritten. Logging every method showed the wallet calls `aztec_getCurrentMinFees`.
  - Rewriting that method at base reproduced the failure on Chrome (130 s) and Firefox (131 s). The node logged CI's refusal line, 6 times on Chrome and 5 on Firefox; no toast came within 60 s.
  - With the fix applied for one run, Chrome passed in 73 s: three simulations, no refusal, `aztec_getPredictedMinFees` in place of the current fee. The fix was then reverted.
- Failed attempt: the node's refusal values. The CI log cuts each node line at 200 characters before the two fees.
