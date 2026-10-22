# pxe-limits-1, phase 6: findings, review, publication

The review loop ran over the scratch `findings.md`, the issue drafts, the #1016 comment draft and `lessons/phase-1.md` to `phase-5.md`; there is no code diff. Codex by `run-codex.sh … high read-only gpt-6.1-sol` (session `01a16171`), the Opus leg as a subagent.

## Round 1 (2026-10-22 02:30-02:45Z)

- **Codex r1:** *reject*, 17 items. **Opus r1:** *reject*, 22 items. Every item was checked against the raw records and every one held; all accepted:
  - verdicts judged on the plan's falsifiers: H5 holds (the read rises with stored rows in 3 of 3 CI iterations; the local and Firefox pairs are load-confounded); H7's burst half inconclusive (the gas budget was never reached); H1 holds through 1,000 blocks on PXE-side node calls and tags;
  - medians of even counts were the lower middle value in three aggregators; every table recomputed with the mean of the two middle values;
  - the unlock profile counted activity after the unlock and on probe tokens with no contract: replaced by offsets aligned to the unlock, the seed's limits stated, the share left unmeasured;
  - the health-ping cause was stated as demonstrated: now the sequence is demonstrated and the cause inferred, with a second trigger (long page opens, no PXE sync) the records had all along;
  - the `Icon` fit could not be reproduced: replaced by a direct A/B/A run (phase 5);
  - the per-sender tag cost was off by a factor of 2 against the 84-index window: traced to a second contract sync per block;
  - code sites cited the instrumented worktree: moved to HEAD's lines, versions added;
  - issue bodies took the README's five sections; the Firefox thread limit is `blocked:external`, not a known limit; run ids and load1 on every cell.
- Deviation: the round-1 prompt carried neither the Post-implementation standard's two rules verbatim nor its exact adversarial ask; round 2 carries both.

## Round 2

- **Codex r2** (resumed `01a16171`): *conditional approve*, 5 should-fix. **Opus r2** (resumed): *conditional approve*, 5 should-fix and 9 nits; it re-checked the A/B, the health-ping counts, the Firefox and CI cells, the recomputed medians and every new code site, and found them right. All accepted after re-checking the records:
  - the tag formula fits within 2 tags, not exactly, and gains a handshake term (86 tags: 84 indexes plus a 2-tag constrained probe), which also explains the notes axis; the 1,000-sender tally is the replacement document's first sync, 1,691 node requests;
  - "22 node reads" were PXE read calls: 22 PXE reads, 4 of 8 `getContractInstance` calls failed;
  - the seal comparison was not at equal load (HEAD's reads at load1 186-203, the base's at 104-106): the per-row figure is withdrawn;
  - the unlock's 0.1 s coincidence holds on CI only; locally it is within the start clock's ±1 s; issue 06's title no longer claims what the unlock waits on;
  - H5 rests on CI's 3 of 3 iterations, in a fixed order; the Firefox pair is load-confounded too;
  - the A/B's HEAD run overlapped document closes and a concurrent e2e run: activity at 5,000 rows is the clean figure; the ping misses persist without the CSS `v-bind`, so the bug and the lever stay separate issues.
- Deviation: the first resume picked the script's default model and took the worktree as its output directory; it was stopped before any review output, its files removed, and the round re-run on `gpt-6.1-sol` in the session's own directory.

## Round 3

Round 3 also covered this plan directory as the PR commits it and the PR body; growth, the tokens axis and the new issue 09 were reviewed for the first time.

- **Codex r3** (resumed `01a16171`): *conditional approve*, 4 should-fix and 1 nit. **Opus r3** (resumed): *conditional approve*, 7 should-fix and 9 nits; it re-ran the growth fit (+7.30 ms per 1,000 blocks, se 1.01), the tallies, the tokens axis, the store samples and every new code site, and found them right. All accepted after re-checking the records:
  - the tag count splits by node method: private-log tags = 84 × (watched tokens + 1) × scopes × (senders + own accounts) + scopes + 86 × handshakes and one public-log tag per watched token, exact at every point; the old "within 2 tags" was the public tags, and the 184,229 prediction stands;
  - H1 at 10,000: 89 / 852 against 58 / 594 is a whole-test difference, not a bound on the catch-up; the Outcome's 58 / 594 is over the whole test;
  - the late token's transfer-history backfill was never timed (1.78 s is its public balance): now stated, and listed among the ideas not tried;
  - issue 09's host inventory is age-filtered, four of nine kinds, owners and liveness unchecked; the leak is demonstrated for one run, and the body names the harness contract it breaks;
  - the summaries name their denominators (`proveTx` total, the `aztecDebug_mineBlock` round trip, the A/B export); OPFS is 3.0 KiB a note at 100, 3.1 at 1,000;
  - the timings predate #1029 and #986, now said in the findings and issues 04-06; the first probes archive was overwritten in place, now said;
  - the block-time-1 links in plan.md and recon.md are repaired in the archive move; the health-ping tally is 17 runs and 8,526 pings; the phase 4 result is "burst half inconclusive"; the Outcome records the delivery branch.
- The loop stops here at its three-round cap. Both legs approved on conditions that were then applied; no fourth round verified the applied fixes.
