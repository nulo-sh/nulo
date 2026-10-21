# block-time-1, phase 1: where the time goes

Runs live in the scratch run directory (`runs/<id>/`: `log.txt`, `results.json`, `node.log`, `spans.jsonl`, `env.txt`); patch sets in `patches/`. Every run: `agent.sh`, retry 0, proverless, `VITE_NULO_FEE_MULTIPLIER=10` (CI parity), default slots (72/12), pool age 2000 ms.

## Step 2: instruments and self-test

- Patch set (scratch, never committed): node log tee (`LOG_JSON=1`, `LOG_LEVEL='info; verbose: automine-sequencer; debug: tx_pool_v2'`), boot and teardown chain-clock skew, an optional block pump and anvil args; spans through a Vite transform over every exported function in `tests/e2e/fixtures/*.ts` and `tests/e2e/helpers/*.ts` and each test file's own async helpers, Puppeteer page, frame, element and browser calls (≥ 20 ms), and every fired timer ≥ 200 ms with its call site; the wallet transition recorder (D11).
- `bt-st-01` (2026-10-20 20:03Z): red before any test. The hook file passed `suite` as `beforeAll`'s first parameter, which vitest 4 parses as a fixture (`FixtureParseError`). Fixed; not a finding.
- `bt-st-02` (20:10Z, `wait-for-tx-mined` + `failed-send-check`, Chrome): green. Spans 596; transitions 26 across three background instances (the launch and both `stopBackground` restarts); node log: 9 builds, 9 publishes, 20 "Time set to", 9 tx arrivals; skew at boot +613.7 s (L1), at teardown +541.7 s.
- Node path, every tx at the default: arrival to build start 2009 to 2047 ms (the 2000 ms pool age, 9 of 9), build to published 530 to 1238 ms (4564 ms for the first, at boot).
- A clock recon missed: the wallet re-reads a mined tx's finality every 60 s (`FINALITY_READ_INTERVAL_MS`, `src/wallet/services/transaction/inclusion.ts:13`). In `failed-send-check` it is 57.7 s of the poll "activity row was not written Finalized", after `finalizeThrough` took 2.0 s. The same file's first case observes the check for 150 s by design (`OBSERVE_PAST_TERMINAL_MS`, sampled every 5 s): 154 s of fixed waits that no chain setting moves.

## Step 1: CI baselines (three green PR runs per lane and browser, 2026-10-20)

Network: Chrome runs 39480000408, 39477728140, 39477584910; Firefox 39480000356, 39477727911, 39477584945. Smoke: Chrome 39480945420, 39480000252, 39477727946; Firefox 39480000231, 39477727820, 39477585010. Job times in minutes, median [the three].

| Lane | Envelope | Critical job | Next job | Summed file medians |
|---|---|---|---|---|
| Network Chrome | 18.2, 17.9, 18.0 | shard 2/5: 18.0 [18.2, 17.8, 18.0] | shard 1/5: 15.3 | 103 min, 128 files |
| Network Firefox | 20.9, 21.1, 18.4 | shard 2/5: 19.0 [20.9, 19.0, 18.4] | shard 1/5: 16.6, shard 5/5: 16.5 | 114 min, 127 files |
| Smoke Chrome | 12.6, 12.8, 13.0 | shard 2/3: 12.8 [12.6, 12.8, 13.0] | shard 3/3: 9.1 | 27 min, 60 files |
| Smoke Firefox | 16.7, 18.5, 19.3 | shard 2/3: 18.5 [16.7, 18.5, 19.3] | shard 1/3: 11.0 | 37 min, 64 files |

- Network heavy jobs (Chrome / Firefox medians): snack-placement + failed-send-check 13.7 / 14.1, concurrent-confirm 12.0 / 13.2, fee-methods + selfpay-phase 7.6 / 8.4; canary 8.0 / 9.6; chaos 4.2-4.7.
- Longest network files (median s, Chrome / Firefox): `same-token-concurrent-sends` 557 / 620, `snack-placement` 469 / 483, `incoming-arrival` 342 / 313, `send-chaos` 300 / 339, `failed-send-check` 251 / 256, `fee-methods` 186 / 207, `selfpay-phase` 158 / 176, `type-roles-windows` 122 / 154.
- Shard 2/5 holds 23 files on Chrome (952 s of file time in run 39480000408, `incoming-arrival` 345 s of it) and 24 on Firefox (1119 s in run 39480000356, `incoming-arrival` 320 s); the list is the P-pole set.
- Smoke boots no sandbox, so no chain setting moves it. Its critical shard is a sharding imbalance: in runs 39480000252 / 39480000231 shard 2/3 carries 11.8 / 15.7 min of file time against 7.2-7.5 / 8.0-10.1 for the other two (`legal-acceptance` 144 / 185 s is in it). An even split would take about 3 min (Chrome) to 4.5 min (Firefox) off the smoke envelope; out of this lane's scope, filed in phase 5.

## Step 3: CI's proverless set, Chrome (`p1-ci-chrome`)

- First launch void: zsh passed the excludes as one argument and vitest found no file. Relaunched 20:27Z.
- `same-token-concurrent-sends` (first file) failed every case after its bodies ran green: it passes `releaseMining` straight to `afterEach`, and the span wrapper's `...args` made vitest parse a fixture parameter and throw. An instrument fault, not a finding: the wrapper now declares no parameters (`instruments-v5`), applied from the run's third file on, and the file gets its own rerun.
- Site-less timers are dropped from attribution: refreshed library keep-alive timers (499 ms, no e2e frame on the stack) are not sleeps.
- `tx-sendTx-sponsoredFpc` failed at 21:51Z: it passes a test-local async function to `page.evaluate`, Puppeteer serialized the span wrapper into the page, and the page threw on the wrapper's closure. Instrument fault again: the wrapper's `toString` now returns the original's source (`instruments-v6`, from about 21:56Z). Any file of this run that failed before then on a function passed to `evaluate` reruns under v6.
- Result (2026-10-20 22:37Z, 2 h 10 min wall, load1 106 at start): 120 files green, 5 skipped, the two above red. `p1-rerun-chrome` (22:43-22:59Z, v6) ran both green: `same-token-concurrent-sends` 627 s, `tx-sendTx-sponsoredFpc` 26 s. Tables below merge the two runs, the rerun replacing the red files.

**Correction (2026-10-21).** The first version of these tables summed each span's own time, which counted concurrent sibling spans and root timers twice: categories exceeded the wall clock by 2.6 % over the 127 files and by up to 40 % in a single file. Every table here now gives each instant to the deepest span active then (the latest started on a tie), so categories plus unattributed equal the file time; the node-path and pool-wait overlays were computed separately and do not change.

### Chrome: where the time goes (default 72/12, pool age 2000 ms)

Exclusive time per category (a span's own time, its children's subtracted; launch, onboarding and the close read own everything under them). "Node path" is an overlay, not a category: the union of [tx enters the pool, its checkpoint is published] from the node log, and "pool wait" the part of it before the build starts, outside the `minTxsPerBlock: 2` holds tests set on purpose.

| | All 127 files | Shard 2/5 (23, the critical job) | Heavy jobs (6) | P-mech (9) |
|---|---:|---:|---:|---:|
| File time | 7272 s | 1234 s | 1854 s | 1006 s |
| Onboarding & profile | 20.8 % | 22.3 % | 4.8 % | 8.6 % |
| UI waits (`waitFor*`) | 22.2 % | 22.8 % | 17.7 % | 21.1 % |
| Script-side setup | 13.7 % | 11.5 % | 12.1 % | 14.7 % |
| Polls (`pollUntil`) | 12.2 % | 12.8 % | 36.7 % | 22.1 % |
| Browser launch | 12.3 % | 13.1 % | 3.2 % | 5.0 % |
| Fixture UI driving, Puppeteer calls, navigation, test helpers | 10.7 % | 11.8 % | 14.5 % | 5.8 % |
| Fixed waits (literal sleeps) | 2.8 % | 0.7 % | 8.1 % | 15.8 % |
| Script waits on chain | 1.2 % | 1.8 % | 2.2 % | 1.7 % |
| Module import (lazy aztec.js) | 0.5 % | 0.0 % | 0.0 % | 3.8 % |
| Close and CSP read | 0.8 % | 1.2 % | 0.2 % | 0.4 % |
| Unattributed | 2.8 % | 1.9 % | 0.6 % | 1.0 % |
| **Node path (overlay)** | **12.1 %** (255 txs) | **7.7 %** (34 txs) | **24.4 %** (98 txs) | **10.2 %** (38 txs) |
| **Pool wait outside holds** | **6.6 %** | **5.6 %** | **8.7 %** | **7.7 %** |

- Per tx (312 txs with a build, both runs): arrival to build start p10 2009, p50 2034, p90 2066 ms (the pool age; the 26 s maximum is a hold); build start to published p10 489, p50 633, p90 813 ms; the wallet's row reads mined p50 47 ms *before* the publish line (PROPOSED is set when the block is added, before the L1 publish), p90 420 ms after.
- Chain clock at teardown: +10 998 s ahead of the wall clock after 256 blocks (boot: +623 s after 5).
- No `Automine propose did not succeed`, `mined in slot`, prune or dropped-tx line in either node log.
- The critical shard's largest waits are the incoming scanner's: `incoming-arrival`'s "a new incoming record" 119 s (5 polls), `waitForReceivedSnack` 54 s (2), the row-render poll 24 s. The case the plan names "discovery by the 30 s scheduler" is by design; no chain setting reaches that clock.
- Heavy jobs: `same-token-concurrent-sends` spends 232 s of its 287 s pool wait inside its own mining holds; `snack-placement` 161 s in three polls on "the wallet reading its grant final" (the 60 s finality re-read) and 83 s on "the wallet never settled the mint's receipt"; `failed-send-check` 150 s of designed observation and 57.5 s on the finality re-read.

## Steps 4-5: P-mech and P-pole on Firefox (`p1-ff-union`)

One run of the union (32 files: shard 2/5's 24 as CI's Firefox log lists them, the three heavy files, the P-mech files not already in it), `instruments-v7` (adds spans on the script wallet's and contract interactions' own methods, which test bodies call directly). 2026-10-20 23:00Z to 00:10Z, load1 about 220, 32 of 32 green. Chrome P-mech spans come from the CI-set run (the same selection and instruments), so Chrome got no separate P-mech run; its three P-mech files whose test bodies call the script wallet directly rerun under v7 (`p1-pmech-v7-chrome`).

| Firefox | Shard 2/5 (24) | Heavy (4 of the 6) | P-mech (9) |
|---|---:|---:|---:|
| File time | 1747 s | 1808 s | 1135 s |
| Onboarding & profile | 26.8 % | 7.3 % | 12.2 % |
| UI waits (`waitFor*`) | 20.2 % | 14.5 % | 21.3 % |
| Script-side setup | 8.5 % | 6.3 % | 15.5 % |
| Polls (`pollUntil`) | 10.4 % | 40.8 % | 17.5 % |
| Browser launch | 16.1 % | 4.2 % | 7.0 % |
| Fixture UI driving, Puppeteer calls, navigation, test helpers | 11.0 % | 16.9 % | 7.5 % |
| Fixed waits (literal sleeps) | 0.5 % | 8.3 % | 13.9 % |
| Script waits on chain | 1.2 % | 0.8 % | 1.3 % |
| Module import (lazy aztec.js) | 0.0 % | 0.0 % | 0.0 % |
| Close and CSP read | 3.9 % | 0.7 % | 1.1 % |
| Unattributed | 1.5 % | 0.1 % | 2.5 % |
| **Node path (overlay)** | **6.3 %** (36 txs) | **21.4 %** (60 txs) | **10.4 %** (37 txs) |
| **Pool wait outside holds** | **4.2 %** | **4.6 %** | **6.6 %** |

- Per tx (113): arrival to build p50 2037 ms; build to published p50 709, p90 962 ms; wallet reads mined p50 4 ms before the publish line, p90 433 ms after. Chain clock +4033 s at teardown after 109 blocks. No propose failure, slot mismatch, prune or drop line.
- Firefox's own launch cost shows in the critical shard: the driver's `waitForTarget` polls take 204 s over 115 popup and window waits.
- `p1-pmech-v7-chrome` (00:07-00:17Z): the three P-mech files green. `wait-for-tx-mined` now 0.3 % unattributed. `imported-account-execution` (30.9 %) and `incoming-transfers` (17.6 %) hold one gap each, between the fixture's `getAccountAddress` and its first script call: the lazy `await import("./aztec")` (aztec.js and its WASM), 43.5 s and 8.8 s under load. `instruments-v8` gives every dynamic import a span; the two files rerun under it.

## Step 6: smoke's critical shard

- `p1-smoke-chrome` (00:17-00:32Z, shard 2/3's 20 files as CI's Chrome log lists them, built as CI's smoke job builds): 20 of 20 green, 847 s of file time. Browser launch 37.4 % (the egress-guarded launch alone 205 s over 69 launches, about 3 s each), onboarding and profile 20.1 %, UI waits 19.0 %, navigation 6.2 %, unattributed 8.5 %, no node path. No chain setting can move smoke.
- `p1-smoke-firefox` (00:33-00:57Z, shard 2/3's 21 files as CI's Firefox log lists them): 21 of 21 green, 1316 s. Browser launch 32.7 %, onboarding 18.6 %, UI waits 15.1 %, close and CSP read 7.7 %, unattributed 12.4 %.

## Step 7: the top waits

Grouped by what they wait for (span name and label, hashes and amounts folded); page waits are named by the helper that called them. Chrome: all 127 proverless files (`p1-ci-chrome` + reruns); Firefox: the 32-file union.

Chrome:

| Wait | total s | count | files |
|---|---:|---:|---|
| egress-guard:ownGuardedLaunch → frame.waitForFunction | 646.1 | 173 | egress-guard.test.ts, account-balance-orphans.test.ts, account-switch-isolation.test.ts +116 |
| dom:waitForHash → frame.waitForFunction [#/popup/general] | 385.0 | 484 | account-balance-orphans.test.ts, account-switch-isolation.test.ts, account-switch-live-session.test.ts +115 |
| widgets:waitForToast → frame.waitForFunction [Token added] | 228.0 | 60 | account-balance-orphans.test.ts, account-switch-isolation.test.ts, auto-lock-defers-while-proving.test.ts +37 |
| playground:waitForPgResult → frame.waitForFunction [sendTx] | 200.4 | 42 | account-switch-live-session.test.ts, authwit-consume-smoke.test.ts, authwit-lifecycle.test.ts +21 |
| poll:pollUntil [waitForFreshBalanceRow] | 191.5 | 94 | account-balance-orphans.test.ts, account-switch-isolation.test.ts, auto-lock-defers-while-proving.test.ts +33 |
| test body → frame.waitForFunction | 189.3 | 85 | account-balance-orphans.test.ts, authwit-lifecycle.test.ts, backup-edited-local-network.test.ts +42 |
| popups:waitForPopup → frame.waitForFunction | 162.6 | 409 | account-switch-live-session.test.ts, authwit-consume-smoke.test.ts, authwit-lifecycle.test.ts +71 |
| poll:pollUntil [the wallet reading its grant final] | 161.3 | 3 | snack-placement.test.ts |
| sleep 5000 ms @ network/failed-send-check.test.ts:56 | 150.3 | 30 | failed-send-check.test.ts |
| poll:pollUntil [a new incoming record for 0x...] | 119.0 | 5 | incoming-arrival.test.ts |
| networks:switchToNetwork → frame.waitForFunction | 115.5 | 615 | account-balance-orphans.test.ts, account-switch-isolation.test.ts, account-switch-live-session.test.ts +108 |
| dom:clickByTestId → frame.waitForFunction [[data-testid="discover-allow-btn"]] | 114.0 | 107 | account-switch-live-session.test.ts, authwit-consume-smoke.test.ts, authwit-lifecycle.test.ts +69 |
| widgets:waitForToast → frame.waitForFunction [Transaction submitted] | 92.6 | 17 | account-switch-isolation.test.ts, auto-lock-defers-while-proving.test.ts, fee-methods.test.ts +4 |
| poll:pollUntil [the estimate landed or failed] | 89.7 | 33 | same-token-concurrent-sends.test.ts |
| aztec:waitForTxMined [0x...] | 89.5 | 33 | account-switch-live-session.test.ts, authwit-consume-smoke.test.ts, authwit-lifecycle.test.ts +11 |
| poll:pollUntil [the wallet never settled the mint's receipt] | 83.3 | 3 | snack-placement.test.ts |
| wallet-pages:openPopup → frame.waitForFunction | 82.7 | 518 | account-balance-orphans.test.ts, account-switch-isolation.test.ts, account-switch-live-session.test.ts +115 |
| transfers:fillSendForm → frame.waitForFunction | 81.1 | 21 | account-switch-isolation.test.ts, auto-lock-defers-while-proving.test.ts, failed-send-check.test.ts +7 |
| poll:pollUntil [[failed-send-check] activity row was not written Finalized] | 57.5 | 1 | failed-send-check.test.ts |
| test:incoming-arrival:waitForReceivedSnack | 54.0 | 3 | incoming-arrival.test.ts |

Firefox:

| Wait | total s | count | files |
|---|---:|---:|---|
| poll:pollUntil [waitForTarget: a matching target] | 252.6 | 146 | account-switch-live-session.test.ts, authwit-lifecycle.test.ts, cap-chain-mismatch.test.ts +21 |
| poll:pollUntil [the wallet reading its grant final] | 162.1 | 3 | snack-placement.test.ts |
| sleep 5000 ms @ network/failed-send-check.test.ts:56 | 150.0 | 30 | failed-send-check.test.ts |
| poll:pollUntil [waitForFreshBalanceRow] | 143.3 | 38 | failed-send-check.test.ts, imported-account-execution.test.ts, incoming-arrival.test.ts +4 |
| dom:waitForHash → frame.waitForFunction [#/popup/general] | 136.7 | 160 | account-switch-live-session.test.ts, authwit-lifecycle.test.ts, backup-edited-local-network.test.ts +28 |
| poll:pollUntil [the estimate landed or failed] | 118.3 | 33 | same-token-concurrent-sends.test.ts |
| playground:waitForPgResult → frame.waitForFunction [sendTx] | 110.4 | 15 | account-switch-live-session.test.ts, authwit-lifecycle.test.ts, firefox-background-restart.test.ts +5 |
| poll:pollUntil [a new incoming record for 0x...] | 89.5 | 4 | incoming-arrival.test.ts |
| poll:pollUntil [the wallet never settled the mint's receipt] | 81.8 | 3 | snack-placement.test.ts |
| widgets:waitForToast → frame.waitForFunction [Token added] | 71.5 | 17 | failed-send-check.test.ts, imported-account-execution.test.ts, incoming-arrival.test.ts +4 |
| dom:clickByTestId → frame.waitForFunction [[data-testid="discover-allow-btn"]] | 69.7 | 37 | account-switch-live-session.test.ts, authwit-lifecycle.test.ts, cap-chain-mismatch.test.ts +21 |
| poll:pollUntil [[failed-send-check] activity row was not written Finalized] | 57.5 | 1 | failed-send-check.test.ts |
| poll:pollUntil [txs mined] | 56.9 | 21 | same-token-concurrent-sends.test.ts |
| poll:pollUntil [transfer N at succeeded] | 44.9 | 20 | same-token-concurrent-sends.test.ts |
| popups:approveConnect → frame.waitForFunction | 41.5 | 37 | account-switch-live-session.test.ts, authwit-lifecycle.test.ts, cap-chain-mismatch.test.ts +21 |
| networks:switchToNetwork → frame.waitForFunction | 41.5 | 242 | account-switch-live-session.test.ts, authwit-lifecycle.test.ts, backup-edited-local-network.test.ts +27 |
| test:incoming-arrival:waitForReceivedSnack | 38.0 | 3 | incoming-arrival.test.ts |
| widgets:waitForToast → frame.waitForFunction [Received] | 37.9 | 3 | incoming-arrival.test.ts |
| aztec:waitForTxMined [0x...] | 37.6 | 17 | account-switch-live-session.test.ts, authwit-lifecycle.test.ts, concurrent-sendtx-confirm.test.ts +5 |
| wallet-pages:openPopup → frame.waitForFunction | 35.8 | 182 | account-switch-live-session.test.ts, authwit-lifecycle.test.ts, backup-edited-local-network.test.ts +28 |

What the waits are:

- The launch and onboarding waits (`ownGuardedLaunch`, `waitForHash #/popup/general`, `registerProfile`, `switchToNetwork`, `openPopup`, `discover-allow-btn`, Firefox's `waitForTarget` polls) are the browser and the wallet booting, per test or per file. No chain setting reaches them.
- The incoming scanner's 30 s tick sets "a new incoming record", `waitForReceivedSnack`, the row-render poll (`incoming-arrival`) and "the wallet never settled the mint's receipt" (`snack-placement`, whose public receipt is found by the same scanner).
- The finality re-read's 60 s sets "the wallet reading its grant final" (`snack-placement`, three times) and "activity row was not written Finalized" (`failed-send-check`).
- `failed-send-check`'s 150 s of 5 s samples is the observation window the test exists for.
- The polls that wait on a send (`waitForPgResult [sendTx]`, `waitForFreshBalanceRow`, "txs mined", "transfer N at succeeded", "the estimate landed or failed") each contain one node path: about 2.0 s of pool age, 0.6-0.7 s of build and publish, and the wallet's 1 s receipt and balance ticks.

## H5 and the gate

- **H5 falsified as written.** The node path is above 10 % of 6 of the 9 P-mech files on each browser (Chrome: `wait-for-tx-mined` 55.9 %, `authwit-lifecycle` 18.9 %, `concurrent-sendtx-confirm` 18.8 %, `incoming-transfers` 15.4 %, `sim-from-selfpay` 14.0 %, `tx-sendTx-sponsoredFpc` 10.4 %; Firefox: `wait-for-tx-mined` 43.2 %, `authwit-lifecycle` 17.0 %, `incoming-transfers` 17.0 %, `sim-from-selfpay` 15.4 %, `incoming-arrival` 12.8 %, `concurrent-sendtx-confirm` 12.7 %), 24.4 % / 21.4 % of the heavy jobs (most of it `same-token-concurrent-sends`' own holds), and under 10 % of the critical job: 7.7 % (Chrome) and 6.3 % (Firefox) of shard 2/5. Two thirds to three quarters of every node path is the 2000 ms pool age; the rest is build and publish. Neither is a slot wait (H1 decides whether the slot moves them).
- **What a node-side lever could take off the network envelope**, estimated from attribution: shard 2/5's node path, about 95 s (Chrome) of a local 1234 s, scales on CI's 18-19 min job to about 1.2-1.4 min, of which the pool age is about 1 min. It is an estimate, not a bound: no CI run tested it, and a shorter wait can also shorten the polls behind it. Shard 2/5 leads the next job by 2.7 min (Chrome) and 2.4 min (Firefox), so the envelope would move by the shard's own gain.
- **Gate.** Every cell names its run; every `env.txt` shows the default slots and pool age; unattributed time per P-mech file ≤ 10 % on Firefox (max 9.8 %) and on Chrome except `imported-account-execution` and `incoming-transfers`, whose single gap is the lazy aztec.js import, rerun under v8 (`p1-pmech-v8-chrome`, below).
- `p1-pmech-v8-chrome` (01:00-01:08Z): both green; unattributed 0.2 % (`imported-account-execution`) and 0.4 % (`incoming-transfers`). The lazy aztec.js import is its own category now: 30.7 s of `imported-account-execution`'s 102 s on this host.

## Budget projection (after phase 1)

Measured on this host (load1 110-310): a boot costs about 5 min (build, vitest start, node, playground, deploy); P-mech's file time is 1011 s (Chrome) and 1135 s (Firefox); the probe is about 40 txs. Projected serial time: phase 2 V-boot 0.3 h; 3a ten probe runs 1.7 h; 3b five P-mech screens 2 h; 3c four cadence runs 1.6 h; 3d twelve runs over the targeted files 3 h; 3e both browsers' proverless sets, canaries and chaos seeds 6.5 h. About 15 h, inside the plan's 20-30 h, so no priority call is needed. 3d and 3e run only for a candidate setting.
