---
plan: heavy-pool-1
tier: light
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: origin/dev at 8663cdd15
trunk: dev
issues: "#972 (Closes only if the fold ships; otherwise a known limit recorded on it)"
post_implementation_hardening: not scheduled
---

# heavy-pool-1: fold the heavy-long network job into the balanced pool, only on measured evidence

One arc (A1), one PR against `dev`, no stack (D-orch-1). The owner picked P78-08 B on #972: "Fold the two files back into the pool, in a follow-up that measures again", with five shards kept (P78-07 A). The two files are `snack-placement` and `failed-send-check`, which `network-e2e-heavy-long` runs. The plan measures the current layout (A) against the folded layout (B), on CI, before anything ships. B ships only if it passes the gate below; otherwise the lane closes with a docs-only PR. Recon: [recon.md](recon.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md).

## Measurement

Source: every first-attempt green run of both network PR lanes, 2026-10-21 01:26–14:34Z (9 Chrome, 10 Firefox runs that ran the suite). Three per browser ran the balanced split (#978's branch). Job durations come from GitHub's timestamps, setup included. File time comes from `parseJobLog`'s gap rule. Projections replay `assignShards` on each run's own file costs with a record of the other runs (leave-one-out), plus the median per-job fixed cost (job minus file time: 109 s Chrome, 114 s Firefox).

| Seconds, median (range) | Chrome | Firefox |
|---|---|---|
| Lane wall-clock today, balanced runs (slowest job) | 954 (933–961) | 1109 (1087–1116) |
| `heavy-long` job, all runs | 870 (796–895) | 894 (834–922) |
| its files: `snack-placement` / `failed-send-check` | 486 / 261 | 510 / 268 |
| Replay, today's layout (A, five shards + heavy-long) | 914 (878–948) | 1056 (999–1114) |
| Replay, folded at five shards (B) | **1052** (1011–1101) | **1210** (1152–1292) |
| B's slowest shard, file time (line: 1500) | 943 (902–992) | 1097 (1038–1178) |
| Replay, folded at six shards (C, today's runner count) | 904 (886–932) | 1030 (992–1098) |
| Paired, B minus A, per run | +139 (+115 to +171) | +162 (+142 to +178) |
| Paired, C minus A, per run | −8 (−16 to +8) | −25 (−36 to +19) |

- **Projection: B fails the gate.** In all 19 runs, the replay puts B above A, by about 15 %. B saves one job's fixed cost, about 110 s of runner time per browser per run, 1.4 % of a lane run's 7200–8800 runner-seconds. No B shard nears the 1500 s line. On A, the replay sat under the measured slowest job by 25–73 s (Chrome) and 50–106 s (Firefox), mostly in the slowest shard's file time (I2). B has no run yet, so the paired difference is a hypothesis, which Phase 2 tests.
- **The owner's note on #972, answered.** "How slow are they compared to our network runners?" On the balanced runs the heavy-long job ends 1–2.5 minutes (Chrome) and 3–4.5 minutes (Firefox) before the slowest pool shard, so it never sets the lane's time. Its runner costs only its ~110 s of setup. "Where would it put the gates?" Folded at five shards, the slowest job would end near 18–19 min on Chrome and 21 min on Firefox (today 16 and 18.5): the measured time plus the paired difference. The slowest shard would hold about 16–17 and 19–20 min of file time, under the 25-minute line. "The most professional way?" One pool sized by time, with dedicated jobs only for isolation. heavy-long already behaves as a sixth shard, a little lighter than the others. Folding it at six shards (C) gains 8–25 s, inside the noise, at the same runner count. So no shard count makes the fold pay.
- **The lane brief named the wrong jobs.** It scopes `network-e2e-heavy` and `network-e2e-heavy-concurrent`. The owner's pick and its source (shard-balance-1's OA-2) name heavy-long's two files. Those two jobs exist for isolation, not time (recon § Why each dedicated proverless job exists). They stay as they are, so the note that two heavy workloads never share one prover queue holds unchanged (Ask-1).

## Outcome & Quality Bar

- **For whom**: a contributor waiting on the required network checks, and the owner, who asked whether the fold pays.
- **Excellent**: (1) the decision rests on interleaved CI runs of both layouts on one commit, measured by a rule written down before the first run; (2) the shipped state, folded or not, states its real reason at the job and in the docs, so nobody re-runs this question blind.
- **Good enough**: three pairs per browser give direction, not a stable percentage; a clear miss needs no more samples.

## Architecture & Implementation

- **What B needs to be fair.** The record lacks the two files, and the sequencer would place each at the record's median (23 s Chrome, 29 s Firefox) in place of ~500 and ~265 s. So the generator learns the dedicated proverless jobs too: `scripts/ci-cd/e2e-timings.ts` reads `Run / heavy / …` beside `Run / shard i/n`. A run still needs every shard green; `runCosts` already drops a run that names a file in two jobs. Canary is prover-ON and chaos runs one file twice, so both stay out. A dedicated key reaches the pool's split only through the median that prices a file the record lacks; a record generated at the measured base knows every pool file. So A and B carry the same record and differ only in the lane workflow. The script also takes an optional suite (`network` or `smoke`): with one, it rewrites only that suite's tables and run ids and keeps the rest of the committed record, so the smoke split never moves (D7). `generated` dates the last rewrite; each lane's run ids are its provenance.
- **B's change**: in `_extension-network-e2e-lane.yml`, delete `network-e2e-heavy-long` and its comment, and drop its two files from the pool's `exclude_files`. In `scripts/ci-cd/verify-cert-run.sh`, drop its `EXPECTED_NETWORK_JOBS` entry and make the comment read "2 heavies". The pins (`behavior-gating.test.ts:294-306`, `:1069-1074`, `shard-sequencer.test.ts:26-33`) read the lane, so they need no edit.
- **Ship change map (3a)**: B's commits, plus the docs recon lists (`CI.md:52,104,133`, `.github/WORKFLOWS.md:15`, the e2e README `:210,217`, the e2e-testing skill `:233-236`) and the suite argument in the README's § Shard timings. **Docs-only change map (3b)**: the heavy-long reason at `_extension-network-e2e-lane.yml:94-95`, `CI.md:52` and the README `:217` states the measured reason, not the retired one.
- **Not taken**: (a) folding `network-e2e-heavy` or `network-e2e-heavy-concurrent`. Their isolation needs a sequencer constraint (a new mechanism) or a proof that it is obsolete; neither is the owner's pick. (b) Six shards: the owner kept five, and C's projected gain is inside the noise. (c) Seeding B's record from a hand-built table: the record is only ever the generator's output.

## Security & Adversarial Considerations

- **Threat**: a PR's test prints reporter-shaped lines to skew the record. The widened filter reads the same reporter output through the same checks: costs are spans between the runner's own timestamps, a printed line or count drops the job, and a file in two jobs drops the run. The worst outcome is an unbalanced split, never a lost file.
- **Measurement branches** go to `origin` (public). They carry the plan, the generator change, the record and the lane edit: paths and numbers, no secret. Before each push, read the outgoing diff: only those files. Dispatches use the existing workflows' `contents: read` / `pull-requests: read` tokens; no permission, secret or setting changes. The collector issues only read calls (`gh run list`, `gh api` GETs) and parses logs in memory. A contributor who slows a valid test moves real time into the record; that exists today, and every record change is a reviewed diff. Nobody opens `network-endpoints.ts`.
- **#977** (a dispatch checks out the branch): a measurement branch never moves after its first dispatch. Each run's `head_sha` is recorded and checked.

## Assumptions

- **Facts**: F1 heavy-long exists for wall time only (2a518c37f, #433; lane `:94-95`). F2 the record has no dedicated file, and an unknown file lands on the lightest shard at the median (`shard-sequencer.ts:35-39`). F3 both PR lanes accept `workflow_dispatch`, and a dispatch's concurrency group is per workflow, ref and SHA with cancel-in-progress (`pr-extension-network-e2e.yml:21-25`): A and B never cancel each other, but a second dispatch of one arm and browser cancels the first. F4 `verify-cert-run.sh:58` names heavy-long, and `behavior-gating.test.ts:294-306` fails unless it moves with the lane. F5 shards run files one at a time on one sandbox (`vite.shared.ts:134`). F6 the per-job fixed cost ranges 82–140 s. F7 the repository is public on the Team plan (60 concurrent jobs).
- **Inferences**: I1 a folded file costs in a pool shard what it costs in its own job; the replay rests on it. I2 the replay's shortfall on A (25–106 s, mostly the slowest shard's file time) is of the same size on B; B has no run to check it. I3 #1003 (open) changes per-file time unevenly, so the result holds for the measured base only. I4 the folded files do not slow their neighbours: they ran in the pool before #433, and `finalizeThrough` mines L1 blocks only to advance finality. Phase 2 tests I1, I2 and I4.
- **Asks** (working assumption in force): **Ask-1** fold heavy-long only, per the owner's words; heavy and heavy-concurrent stay. **Ask-2** "raises the wall-clock" means, per browser, B's median or B's highest slowest job above A's, with no tolerance; anything short of a clear pass is a docs-only close. Approving this plan settles the rule before the first run. **Ask-3** on a docs-only close, #972 gets the measurement as a `known-limit` record and closes as not planned; no new issue. **Ask-4** six shards are reported, not asked: no gain to ask about.

## UI impact

None. CI workflow, a CI script, the e2e timings record and docs only; no surface a person sees.

## Phases (arc A1)

**Phase 1: the measurement inputs.** Warning: never edit `shard-timings.json` by hand. Merge `origin/dev` into the worktree branch and record its SHA (the base). Create branch `heavy-pool-1-measure-a` from it. Widen the generator's job filter and add the suite argument. Test both in `scripts/ci-cd/e2e-timings.test.ts`: from shard, heavy, canary and chaos jobs the selector keeps exactly the shards and the heavies, and a missing shard selects nothing; a one-suite rewrite passes the other suite's tables and run ids through unchanged. Run `bun scripts/ci-cd/e2e-timings.ts network` and commit the record. Create `heavy-pool-1-measure-b` from A and commit B's change.
Gate, on each branch: `bun test scripts/ci-cd/e2e-timings.test.ts`; `cd apps/extension && bun --bun vitest run scripts/e2e/shard-sequencer.test.ts`; `bun run typecheck:all`; `bun run test:ci-gating`; `bun run lint`; `bun run lint:actions`. Pass: all exit 0. Both browsers' network tables hold `snack-placement` and `failed-send-check`, and every pool file. `git diff <base> A -- apps/extension/tests/e2e/shard-timings.json` touches no smoke line. `git diff A B --stat` names only the lane workflow and `verify-cert-run.sh`.

**Phase 2: measure, then decide.** Warning: a measurement branch never moves after its first push, and a dispatch never runs beside another of the same arm and browser (F3). Push both branches. Rounds hold one browser each, in this order: Chrome A+B, Firefox B+A, Chrome B+A, Firefox A+B, Chrome A+B, Firefox B+A (`gh workflow run <wf> --ref <branch>`, in the order named). Before every dispatch, the first or a replacement, list both network workflows' queued and in-progress runs: while another lane's measurement dispatch is listed (a `*-measure-*` or `e2e-clocks-1*` ref other than this lane's own), wait for it to end. Poll the round's two runs in one bounded loop until both end, then start the next round. Run rounds 1 and 2 first (D9). Settle their red runs by the rule below and apply gate checks (2)–(5) to them first. Then, if B's slowest job exceeds A's by more than 60 s on both browsers, stop and take 3b. Otherwise run rounds 3–6 and apply the whole gate. With a scratch collector (under `~/.cache/nulo-backlog/heavy-pool-1/`, logs parsed in memory), record per run: its ID and `head_sha`; every `Run /` job's created, started and completed times; each shard's file time, file set and per-file costs; the runner-seconds (the sum of `Run /` job durations).
Red runs. On B, a red in a folded file, or in a shard that holds one, counts against B and is never rerun. Elsewhere, a red is a known flake only when it matches an **open** row of the e2e-testing skill's § 5 Flake ledger, read at the base, whose sanctioned response is a rerun. Then dispatch one replacement alone after its round ends, and keep the red in the table. A red replacement, or any other red, is breakage: stop and report it.
Gate. Pass (B ships) only when all hold: (1) per browser, B's median slowest job ≤ A's median and B's highest ≤ A's highest; (2) no shard of any run holds more than 1500 s of file time; (3) every counted run is green at retry 0; (4) every shard ran exactly `assignShards`' files for its branch, browser and index; (5) all runs of an arm share one `head_sha`. Write the table into this plan and `lessons/phase-2.md`: every run with its ID, the folded files' cost in B beside their cost in A's heavy-long job, and the pool's total file time in A and in B (I1, I4). Then take 3a or 3b. A stop after rounds 1 and 2 writes the same table, with one run per arm and browser. A B rejected for a red in a folded shard is a correctness verdict, not a timing one, and the table says so.

**Phase 3a (B passed): ship the fold.** Branch `heavy-pool-1-a1` from the worktree branch. Merge `origin/dev` (#1003 edits the e2e-testing skill). Warning: if the merge brings a change under a path the `extension-network` filter of `pr-extension-network-e2e.yml` lists, the measurement no longer describes the shipped base: repeat Phase 1 and Phase 2 on the merged base first, on fresh measurement branches with a new sample set. Cherry-pick A's and B's commits, then edit the docs in the ship change map.
Gate: `bun run lint`; `bun run typecheck:all`; `bun run test`; `bun run test:all`; `bun run test:ci-gating`; `bun run test:release`; `bun run lint:actions`; `bun run check:plans`. Pass: all exit 0; `git grep -nE "heavy-long|snack-placement \+ failed|twelve|3 heav|three heav|eleven suite" -- CI.md .github apps/extension/tests/e2e/README.md .claude/skills/e2e-testing scripts/ci-cd` shows no stale claim.

**Phase 3b (B failed): docs-only.** Branch `heavy-pool-1-a1` from the worktree branch. Merge `origin/dev`. Rewrite heavy-long's reason at its three sites. The workflow comment states the mechanism: spread over five shards, the two files' time outweighs the pool's slack, so the pool would end later. `CI.md` and the README add that the fold was measured, on #972. No number that a later regeneration makes false, and no issue number in the workflow comment.
Gate: `bun run lint`; `bun run lint:actions`; `bun run test:ci-gating`; `bun run check:plans`. Pass: all exit 0, and the diff touches only those three files and `implementations-plan/`.

## Delivery

One PR against `dev`, opened without labels, only after the Codex loop converges. 3a title: `ci(e2e): fold the heavy-long network job into the balanced pool` (62 characters), body with `Closes #972`. 3b title: `docs(ci): keep the heavy-long network job out of the pool, measured` (66 characters), no `Closes`. Both bodies hold the Phase 2 table (per browser and run: slowest job, slowest shard file time, runner-seconds, A against B, run IDs) and the projection beside it. Then `gh pr checks <n> --watch`; the PR's own lane runs are reported as extra samples. Never merge.

## Post-implementation

Execution contract: this plan plus `implementations-plan/README.md` § Post-implementation standard at 8663cdd15. Plan-specific values:

- Step 1 is absent (`code_review: off`).
- Step 2, once, over `git diff origin/dev...heavy-pool-1-a1` after Phase 3a or 3b is green: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`. On 3a, one Opus `general-purpose` diff review runs beside round 1. Hard stop at three rounds. Log each round in `lessons/phase-3.md` and under Audit verdicts.
- Close-out as the PR's final commits: the Outcome with the measured table. On 3b, post the #972 comment in known-limit form (hypothesis, consequence, the measurement, disposition, reopening condition: the owner raises the shard count, a pool shard ends before heavy-long, or either file's time moves by more than a minute), then add the `known-limit` label and close it as not planned. On 3a, file D8 as a closed `known-limit` issue. Delete both measurement branches from `origin`. Then `git mv` into `archive/` in its own commit.
- Teardown after the merge, never asked: once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/heavy-pool-1/plan.md` succeeds, run `agent-worktree done heavy-pool-1 --merged`. Relay a refusal and stop.

## Decision ledger

- D1 fold scope: heavy-long only (Ask-1); the other two dedicated jobs keep their isolation. Both legs agree.
- D2 measure although the replay predicts a miss: the owner asked to measure again, and the brief sets three runs per arm as the minimum. The bound: folding adds 704–787 s of file time, about 150 s per shard, while A's slowest shard sat only 56–108 s above its mean; B can match A only if the two files cost over a quarter less in the pool. The price: about 26 runner-hours, at most 22 of the Team plan's 60 job slots at a time.
- D3 B's record comes from the real generator with a widened job filter, on a commit both arms share. It ships only with the fold: without it, a regeneration from today's runs would price both files at the median.
- D4 A and B run in the same window, one browser per round, their order alternated. The metric is job duration, so queueing does not distort it.
- D5 six shards are projected only (Ask-4).
- D6 a docs-only close rewrites heavy-long's reason at its three sites, so a later reader does not fold it on the retired reason.
- D7 the generator takes an optional suite, so A, B and 3a rewrite the network tables alone and the smoke split stays as it is ("Smoke is untouched"). A whole regeneration would have re-split smoke. The argument is the smallest change that honours the constraint; with none, the script behaves as today.
- D8 the widened filter selects `Run / heavy / …` by name. A future prover-ON heavy job would add keys the pool never runs, which reach it only through the median that prices an unknown file; a chaos-armed one would drop its runs (file twice). No consequence today: not pinned; a closed `known-limit` issue if 3a ships.
- D9 (orchestrator, at approval) the measurement is staged. Rounds 1 and 2 (one pair per browser) run first and alone; a B slower than A by more than 60 s on both browsers ends the lane docs-only. This is a futility rule, not a proof: one pair per browser can stop a B that three would pass (A 900/1000/1000 against B 970/900/900), a risk accepted on proportion. Six rounds cost about 26 runner-hours at 22 concurrent jobs, from the CI capacity every lane's checks share, and the replay (a qualitative prior, from runs before #1003) put B slower in all 19 runs. A closer or faster B still gets three runs per arm and the full gate. Codex reviewed the change (round 4: conditional approve; its three conditions are this wording, the checks before the threshold, and a check before every dispatch).

## Audit verdicts

**Round 1, Codex (`gpt-6.1-sol`, high, session `01a15f04`): conditional approve.** Every number in the Measurement table reproduced. Findings, all verified; adopted unless noted:
- C1 (medium) I2's "40–55 s on both layouts" compared unmatched medians; the matched residuals are 25–73 / 50–106 s, and B has none. I2 and the bullet are rewritten.
- C2 (medium) a median rule passes A 950/951/1100 against B 949/950/1300. Ask-2 now also bounds B's highest run, ambiguity closes docs-only, and the flake rule is fixed in advance.
- C3 (medium) I1, I3, I4 are hypotheses; I3 does not follow from a shared base. Rewritten; Phase 2 reports the folded and neighbour costs.
- C4 (low) record dispatch, start and completion times; keep the branches immutable. Adopted.
- C5 (low, demonstrated) dedicated keys move the median that prices an unknown file. The claim is corrected.
- C6 (low) the collector's calls are read-only, not its credential; read the outgoing diff before a push. Adopted.

**Round 1, Opus 5.5 Plan lens: conditional approve.** It re-implemented the replay and matched every figure. Findings, all verified; adopted unless noted:
- O1 (medium) the flake rule conflicted for a red in a folded file. Phase 2's red-run rule settles it.
- O2 (low-medium, from the config) a replacement beside a live run of the same arm and browser cancels one (F3). Replacements run alone, after their round.
- O3 (low) an arm's commit was not pinned between rounds. The collector records `head_sha`; gate (5).
- O4 (low) duplicates C1; also corrected the owner-facing file-time figures (16–17 and 19–20 min).
- O5 (low) D2 understated the bound and the cost. Written into D2; rounds now hold one browser each (at most 22 jobs). Its optional early stop is rejected: the brief sets three runs as the minimum.
- O6 (low, demonstrated) the 3b gate missed `index.md`, the 3a grep hit unrelated files, Phase 1 lacked `typecheck:all`, and 3b's "about 2 minutes" broke its own rule. All four fixed.
- O7 (low) #1003 edits the e2e-testing skill. 3a and 3b merge `origin/dev` first.
- O8 (low) the regeneration re-splits smoke. Adopted; after Codex round 2 (R2-1) the fix became D7's suite argument.
- O9 (low, needs unsupported conditions) the name-based filter. Not pinned (D8).

**Round 2, Codex (resumed): conditional approve.** It verified C1–C6 and O1–O9 (the paired differences, 704–787 s and 56–108 s reproduce). Three new findings and one caveat, verified and adopted:
- R2-1 (medium) "Smoke is untouched" is new evidence against the whole regeneration: D7 is now the suite argument, so no smoke line moves.
- R2-2 (medium) 3a's merge of `origin/dev` could ship a base the runs never measured. 3a now repeats Phase 2 when the merge touches a network-filter path.
- R2-3 (medium) a fixed ledger row must not excuse a red. Only an open row whose sanctioned response is a rerun qualifies, and a red replacement stops the run.
- R2-4 (low) D8 now carries C5's median caveat.

**Round 3, Codex (resumed): approve.** No remaining material finding. Two clarifications folded in: `generated` dates the last rewrite, not each suite's data; a re-measurement on a merged base uses fresh branches and a new sample set.

**Round 4, Codex (resumed, on the orchestrator's staging, D9): conditional approve.** Three findings, adopted: (1, medium, demonstrated) one pair can stop a B that would pass, so D9 calls the 60 s rule a futility rule and drops the claim that it confirms the replay; (2, medium) red runs and gate checks (2)–(5) are settled before the threshold, and a folded-shard red is a correctness verdict; (3, low) the contention check runs before every dispatch, replacements included.

## Seeds (drafts, not run: the orchestrator owns execution)

```
/goal implementations-plan/heavy-pool-1/plan.md phases 1, 2 and 3a or 3b each ✓ with its gate pasted green; the Phase 2 table and decision in plan.md; the Codex fix loop converged (a resumed round with no new material finding quoted); the PR open per Delivery with the close-out commits; `bun run test:ci-gating` and `bun run lint` exit 0.
/loop 15m Drive implementations-plan/heavy-pool-1 per its plan.md: reality-check plan.md, STATUS.md and the PR; run the next phase gate; never move a measurement branch after its first push; never merge; stop when the PR carries the Phase 2 table and the close-out.
```
