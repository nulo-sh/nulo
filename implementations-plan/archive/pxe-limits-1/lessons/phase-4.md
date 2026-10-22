# pxe-limits-1, phase 4: sandbox throughput

Probe `_probe-sandbox` (scratch): the script wallet only, no browser; each tx a `mint_to_public` of 1 proven ahead (proverless) and sent with `node.sendTx`, its receipt polled every 500 ms. The sandbox is the suite's own `--local-network` node: `aztecSlotDuration` 72 s, `blockDurationMs` 3,000, `maxBlocksPerCheckpoint` 24, `SEQ_MIN_TX_PER_BLOCK` 0 (read from the node's config print). Block contents and processing times come from the node's `public-processor` summaries.

## Local (`p4-sandbox-chrome`, 2026-10-22 00:11-00:40Z, load1 63-188)

**Burst** (k pre-built txs sent at once):

| k | Blocks (txs) | Drain | Block processing | Gas skips |
|---|---|---|---|---|
| 1 | 1 | 2.6 s | — | 0 |
| 4 | 4 | 2.9 s | — | 0 |
| 16 | 3 + 13 | 4.7 s | 0.47 s for 13 | 0 |
| 64 | 7 + 57 | 9.8 s | 0.46 s for 7, 2.82 s for 57 | 0 |

No tx was skipped for gas or blob space in any of the run's 363 block summaries; the 57-tx block used 38.3 M L2 gas and 25.5 k DA gas. The first block of a burst takes what has arrived when its build starts, the next one the rest. The 57-tx block took 2.82 s to process (about 49 ms a tx at load1 about 160) against a 3 s block duration, so the bound a larger burst meets is likely build time per block, not gas: the 128 and 256 bursts (local and CI) test it. (The probe's first skip counter counted summary lines, not their numbers; the figures above are read from the summaries.)

**Sustained** (offered rate for 5 min, txs pre-built so the generator never lagged):

| Offered | Included | Steady state | Latency p50 / p90 | Blocks | Max per block | Drain after the last send |
|---|---|---|---|---|---|---|
| 10/min | 50 / 50 | 10.0/min | 2.48 / 2.76 s | 50 | 1 | 2.2 s |
| 20/min | 100 / 100 | 20.0/min | 2.51 / 2.67 s | 100 | 1 | 2.4 s |
| 40/min | 200 / 200 | 39.8/min | 1.55 / 2.55 s | 199 | 2 | 1.5 s |
| 80/min | 400 / 400 | 80.3/min | 0.78 / 2.36 s | 301 | 4 | 0.5 s |

The sandbox includes every tx it is offered up to 80 a minute, with no backlog, no drop and no refusal; it builds a block as soon as a tx is pending, so blocks track txs one to one through 40 a minute. No sustained ceiling is reached at 80 a minute; the latency falls as the rate rises (likely because a pending tx more often meets a block already being built; not measured).

## CI burst (soak 39701296358, measure commit `5107f0910`, proverless, 3 iterations, load1 0.5-1.6)

Bursts of 1, 4, 16, 64, 128, 256, one fresh sandbox per iteration.

| k | Included per iteration | Largest block (txs) | Drain |
|---|---|---|---|
| 1-64 | all, every iteration | 54-60 | 2.6-6.1 s |
| 128 | 128, 128, 128 | 111-120 | 8.4-13.8 s |
| 256 | 151, 151, 151 of 222-233 accepted | 133-148 | 57-94 s |

Up to 148 txs landed in one block with no gas skip: no count bounds a block up to 148, and the gas budget was never reached. At k = 256 the bound was the suite's shared sponsored fee payer: 23-34 sends were refused at the node ("Fee payer … has insufficient balance") and 71-82 accepted txs were later dropped, so exactly 151 of the 256 landed in every iteration. The soak is red only on that cell's every-accepted-tx-included assertion.

Local 128/256 (`p4-burst256-chrome`, 2026-10-22 01:38-01:47Z, load1 142-143): 128 all included (5 + 4 + 5 + 114); 256: 230 accepted, 26 refused, 79 dropped, **151 included again** (15 + 4 + 3 + 129), although this sandbox had run only 128 burst txs before it (CI: 213) and charged 22 times less per tx (1.77e15 against 3.9e16, the node's minimum L2 fee at the time). So 151 is a per-burst bound, not a balance used up over time. Mechanism, from the node's log: the tx pool's `fee_payer_balance_pre_add_rule` admits a pending tx only while the max fees of every pending tx from the same fee payer fit that payer's balance; past it a new tx evicts a lower-priority pending one ("Accepting tx … and evicting 1 lower-priority txs due to fee payer balance") or is refused ("not added to pool … insufficient balance", the 3.27 ETH-unit requirement against a 35.2 ETH-unit balance here). The probe declares `maxFeesPerGas` 10^13, so its per-tx reservation is large; a lower max fee fits more.

**H7, burst half: inconclusive.** No block reached the gas budget (0 gas skips up to 148 txs in one block), so the hypothesis was not tested; a burst from one fee payer stopped first at that payer's balance against the pending txs' max fees (151 landed at the probe's `maxFeesPerGas` of 10^13, every iteration). Txs the suite's sponsored fee payer pays share that one budget, far above what a shard has pending (its logs show 8-24 awaited fixture txs per shard in all). The rule's source is not in this repository: the node logs it as module `p2p:tx_pool_v2:fee_payer_balance_pre_add_rule` (Aztec 6.0.0-rc.3).

## CI sustained (soak 39704296940, measure commit `0c389d28a`, proverless, 3 iterations, load1 0.03-1.2)

The runner's 30 min job budget does not fit the local program (four rates for 5 min each plus 750 pre-built txs and the sandbox boot), so CI ran 20 and 80 a minute for 5 min each.

| Offered | Included (3 iterations) | Steady state | Latency p50 / p90 | Blocks | Max per block |
|---|---|---|---|---|---|
| 20/min | 100, 100, 100 | 20.0/min | 2.44-2.57 / 2.58-2.67 s | 100 | 1 |
| 80/min | 400, 400, 400 | 79.3-80.0/min | 0.68-1.70 / 0.91-2.46 s | 199-395 | 4-6 |

No refusal, drop or backlog. **H7, sustained half:** the sandbox includes what it is offered through 80 a minute on both hosts, so the suite never meets a sustained ceiling (a shard sends tens of txs in 15 min).

**H7, growth half: holds.** Through 10,000 blocks `aztecDebug_mineBlock` rises 7.3 ms per 1,000 blocks after load, about 4.4 s more for a 60-block shard, under the falsifier's 1 min; a public mint stays 4.1-4.6 s (`p3-growth-chrome`, [phase-3.md](phase-3.md) § Growth to 10,000 blocks).

## CI shards (the last three first-attempt green PR runs per browser, 2026-10-21/22, 5 shards each)

Runs: Chrome 39700800819, 39699434810, 39693767076; Firefox 39700800839, 39699434753, 39693767215. Shard wall time: Chrome median 880 s, max 960 s; Firefox median 1,010 s, max 1,091 s; 21-27 files per shard, 121 per run.

- **Blocks per shard:** a green log never prints the node's block numbers (the node's own log is uploaded only on failure, and the setup forwards only lines naming "Aztec", "ready" or "error"). The fixtures print 8-24 awaited txs per shard, so a shard's sandbox reaches at least about 13-29 L2 blocks, plus the wallet's own sends; the only block print (`incoming-arrival`, first in shard 1) reads block 10 in all six runs.
- **Duration against position:** files run largest first, at the same position in every run of a browser, so position cannot be separated from the file within a browser. Across browsers, where 115 files sit at different positions, Firefox's slowdown does not grow with position (−1.0 % per position, se 0.86) or with elapsed time (+0.61 % per minute, se 1.30): no trend, though up to about 3 % per minute is not excluded. One repeated step does slow: the token fixture's mint takes a median 7.7 s 3-6 min into a shard and 8.6-9.0 s at 9-15 min, cause not attributed.
