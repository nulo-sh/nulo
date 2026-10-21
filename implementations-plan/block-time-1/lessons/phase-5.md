# Phase 5: the findings and their review

The findings document, the `## Findings` comment on #959 and the issues were reviewed by Codex before anything was posted or filed. Its review covered the run data, the parsers and the scratch instruments.

## Codex round 1 (`gpt-6.1-sol`, high, session 01a15d86): fix-then-ship

The no-arc-2 decision stands. Every finding was checked against the data and accepted:

1. **Tracked privately: GHSA-4c23-7xf4-f9q3.** The plan, recon and phase-2 text now carry only that reference.
2. **The gain rule was misquoted** in the drafts as "every pair beats 10 %". The plan's rule is all three pairs favour B and the median gain is at least M. Corrected everywhere; no verdict changes.
3. **The summary dropped two Firefox classifications**: `tx-sendTx-sponsoredFpc` is a regression by the rule, and `concurrent-sendtx-confirm` is faster in every pair but below M. Both are now stated, and the regression's cause is marked not established.
4. **The Firefox collision is in all three Firefox B runs**, not two. Counts corrected; the lost cancel message is labelled inferred.
5. **H6 overreached.** The thirds included five pre-pump txs per run (now excluded in `cadence.ts`). They measure pool arrival to published and the wallet's mined transition, not demand-sync latency. The corrected thirds do not fall through the run; they do not rise either. H6 holds for what was measured; the rest is marked unverified.
6. **The `UnconsumedInboxMessages` cause is inferred**, not shown, and the recoveries were of empty blocks only. Both now say so.
7. **The nonce race happened three times**, not twice: Firefox at 0.5 s too, 1861 → 1865. Its timing is labelled inferred, it is "observed under the pump" rather than "likely under any lever", and the CI follow-up names the nonce fix as its prerequisite.
8. **Browser coverage was overstated**: the short-pair screens ran on Chrome at every pair that boots and on Firefox at 2/2 only.
9. Tracked privately: GHSA-4c23-7xf4-f9q3.
10. **The 1.2-1.4 min figure is an estimate scaled from local attribution, not a bound.** Reworded in phase 1, the findings and the drafts.

## Codex round 2 (resumed 01a15d86, verification): fix-then-ship

Findings 2, 3 and 6-10 verified fixed. Three residuals, all accepted:

- The round-1 log restated what the advisory covers; it now carries only the advisory reference.
- The Firefox estimate draft kept a stale "3 of 4 runs"; it now names the runs.
- "The last third inside the earlier range" was false for two runs, whose last third was faster. Corrected to "no run's last third is slower than the slower of its first two", here and in the drafts.
