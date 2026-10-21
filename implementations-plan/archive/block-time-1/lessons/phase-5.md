# Phase 5: the findings and their review

The findings document, the `## Findings` comment on #959 and the issues were reviewed by Codex before anything was posted or filed. Its review covered the run data, the parsers and the scratch instruments.

## Codex round 1 (`gpt-6.1-sol`, high, session 01a15d86): fix-then-ship

The no-arc-2 decision stands. Every finding was checked against the data and accepted:

1. Tracked privately: GHSA-4c23-7xf4-f9q3.
2. **The gain rule was misquoted** in the public texts (the #959 comment and the issues) as "every pair beats 10 %". The plan's rule is all three pairs favour B and the median gain is at least M. Corrected everywhere; no verdict changes.
3. **The summary dropped two Firefox classifications**: `tx-sendTx-sponsoredFpc` is a regression by the rule, and `concurrent-sendtx-confirm` is faster in every pair but below M. Both are now stated, and the regression's cause is marked not established.
4. **The Firefox collision is in all three Firefox B runs**, not two. Counts corrected; the lost cancel message is labelled inferred.
5. **H6 overreached.** The thirds included five pre-pump txs per run (now excluded). They measure pool arrival to published and the wallet's mined transition, not demand-sync latency. The corrected thirds do not fall through the run; they do not rise either. H6 holds for what was measured; the rest is marked unverified.
6. **The `UnconsumedInboxMessages` cause is inferred**, not shown, and the recoveries were of empty blocks only. Both now say so.
7. **The nonce race happened three times**, not twice: Firefox at 0.5 s too, 1861 → 1865. Its timing is labelled inferred, it is "observed under the pump" rather than "likely under any lever", and the CI follow-up names the nonce fix as its prerequisite.
8. **Browser coverage was overstated**: the short-pair screens ran on Chrome at every pair that boots and on Firefox at 2/2 only.
9. Tracked privately (item 1).
10. **The 1.2-1.4 min figure is an estimate scaled from local attribution, not a bound.** Reworded in phase 1, the findings and the public texts (the #959 comment and the issues).

## Codex round 2 (resumed 01a15d86, verification): fix-then-ship

Findings 2, 3 and 6-10 verified fixed. Three residuals, all accepted:

- Tracked privately: GHSA-4c23-7xf4-f9q3.
- The Firefox estimate draft kept a stale "3 of 4 runs"; it now names the runs.
- "The last third inside the earlier range" was false for two runs, whose last third was faster. Corrected to "no run's last third is slower than the slower of its first two", here and in the public texts (the #959 comment and the issues).

## Codex round 3 (resumed 01a15d86, verification): clean

## Delivered

- The findings document went to the orchestrator; the `## Findings` comment is on #959.
- Issues, each after a dedupe: #988 (the bridge fixture's L1 nonce race), #989 (Firefox's late fee estimate), #990 (the node-side levers on CI, in balanced order), #991 (per-file launch and onboarding cost), #992 (the wallet clocks). Shard balance was already #972.
- Tracked privately: GHSA-4c23-7xf4-f9q3.
- Owner ask OA-1 (the wallet clocks), with what ships now: the production intervals stay.
- The scratch instruments were reverted from the worktree; their diff and parsers were never committed and are not preserved here.

## Opus close-out review (over the PR diff)

Accepted and fixed:

- The disposition and round-log lines that pointed at the advisory's history now carry only its reference.
- F3 and the recon said the pool age is runtime-mutable; it is boot-only (D12).
- The phase-1 "Envelope" column is the run's wall clock: one Firefox run's shard 1/5 queued two minutes late (F6).
- The Outcome's launch-and-onboarding share is now 35 % and 43 %.
- One broken sentence, fixed.
- The archive index line no longer reads as if the pool age were the lever.
- "filed" is now "tracked in #972".
- The five issues carry a Record link.
- References to files the repo does not hold were dropped, and the instrument diff is stated as not preserved (D4).

Rejected: promoting a lesson by retiring others, since the curated file is at its budget and nothing in it is superseded.

Left to the owner: the branch history holds text from before the advisory was filed. Removing it needs a history rewrite.

