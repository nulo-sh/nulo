---
plan: shard-balance-1
tier: light
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: origin/dev at 41ed6c594
trunk: dev
issues: "#972 (Refs: a draft PR the owner reviews and closes on merge)"
post_implementation_hardening: not scheduled
---

# shard-balance-1: the e2e shards carry equal measured time

One arc (A1), one **draft** PR against `dev`, `Refs #972`. The owner said "go, but don't merge without my approval" and asked for the gains and the complexity. A committed timings record drives a vitest sequencer: it splits each lane's files across the same shards by measured time, and the workflows do not change. Recon: [recon.md](recon.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md).

## Measurement

Source: of the 10 latest green runs per PR lane (2026-10-20 18:45–22:41Z), the latest first-attempt run of each PR branch: 8 runs per lane, 9 on network Firefox, nine branches in all. A file's cost is the wall time from the previous file's result line to its own. The first file's gap holds the global setup, so it costs its reported time capped by that gap, or 0 when it reports none (a skipped file). Each run is replayed with a record of the other runs (leave-one-out), split by the exact rules below. Re-running vitest's SHA-1 split on each run's files rebuilds every shard's job duration within 4 % (worst 3.6 %). That checks the re-implemented split and the accounting only; it says nothing about I1. Metric: the median over runs of the slowest `Run / …` job (GitHub job timestamps, setup included); the range is over runs.

| Lane | Before: per shard (s) | Before | Balanced (leave-one-out) | Gain | Lower bound |
|---|---|---|---|---|---|
| smoke Chrome | 496 · **761** · 515 | 761 (687–804) | **590** (535–645) | −171 s (−22 %) | 587 |
| smoke Firefox | 667 · **1105** · 540 | 1105 (859–1142) | **772** (724–806) | −333 s (−30 %) | 762 |
| network Chrome | 879 · **1090** · 788 · 849 · 905 (heavy-long 843) | 1090 (924–1115) | **905** (886–954) | −185 s (−17 %) | 886 |
| network Firefox | 1014 · **1142** · 861 · 1115 · 988 (heavy-long 876) | 1143 (1088–1293) | **1028** (956–1104) | −115 s (−10 %) | 1016 |

- A record shared by both browsers balances worse: 629 / 813 / 924 / 1039 s, so the record is per suite, per browser. Reported durations balance as well as gaps (592 / 770 / 905 / 1037 s), but a printed line can forge them (D3).
- Runner minutes do not change. The balanced network pool stays the floor, just above heavy-long. The shard spread (slowest minus fastest) falls from 282 / 518 / 353 / 367 s to 6 / 23 / 40 / 37 s.
- Issue claims: "smoke 2/3 ends 4–8 min after its siblings" holds on Firefox (median 5.8 min) but not on Chrome (median 3.6 min, range 1.6–5.0). "Network 2/5 ~952 s of file time" holds on Chrome (median 950 s). "`incoming-arrival` 345 s" holds on Chrome (Firefox 313 s).
- The tree's own docs are stale: `CI.md:52` and the e2e README say the pool is "109 of 121" files; it is 121 of 133.

## Outcome & Quality Bar

- **For whom**: a contributor waiting on a PR's required e2e checks, and the owner, who weighs the gain against what must be kept current.
- **Excellent**: (1) every e2e file still runs exactly once per lane, proven by a test, and a new file needs no action from its author; (2) each lane's slowest shard lands near the projection, with the before and after numbers per browser in the PR body.
- **Good enough**: the record may drift between regenerations; drift costs balance, never coverage.

## Architecture & Implementation

- **Shape (a), the sequencer.** `shardSequencer(table)` returns a class that extends vitest's `BaseSequencer` and overrides `shard()` only. It reads `ctx.config.shard` (`index`, `count`) and the browser from `resolveBrowserKind()`. It maps each spec to its path relative to `ctx.config.root`, takes `assignShards(paths, table[browser], count)[index - 1]`, and returns the original `TestSpecification` objects for those paths, in input order. Smoke and network configs each pass their own table.
- **`assignShards(files, costs, count)`**, pure. Known files, longest first (ties by path, compared by code unit, never `localeCompare`, since CI splits on Node and the test runs on Bun), go each to the lightest shard (ties by fewer files, then lowest index). Then unknown files, by path, go each to the lightest shard at the record's median cost. Every shard job of a run reads the same commit, so all compute the same split. The file-count tie-break spreads files only when totals tie, as in an empty or all-zero table; known near-zero files may share the lightest shard, which costs nothing.
- **Record** `apps/extension/tests/e2e/shard-timings.json`: `{ "generated": "<date>", "runs": { "<workflow>": [ids] }, "smoke": { "chrome": { "tests/e2e/x.test.ts": seconds } , "firefox": {…} }, "network": {…} }`. Whole seconds, keys relative to `apps/extension`, tab-indented. Only files on disk at generation are kept.
- **Generator** `scripts/ci-cd/e2e-timings.ts` (`bun run e2e:timings`, no options). For each PR lane workflow it takes, from the 10 latest green runs, the newest first-attempt run of each head branch whose pool shard jobs all ran (`gh run list`, `gh api …/runs/<id>/jobs`). It streams each `Run / shard i/n` job log (`gh api …/jobs/<id>/logs`) and parses the default reporter's file lines in memory; it never writes a log to disk. Costs follow the Measurement rule, so each is bounded by real elapsed time. Integrity, each a local check with no new state: in a job, the matched files are distinct and their number equals vitest's `Test Files … (N)` summary; in a run, each file appears in exactly one of the lane's shards; a run failing either is dropped and named in the output; a job with no matched line stops the script (the reporter's format changed); a path holds no `..` segment. It takes each file's median and writes the record. The once-per-run check catches a file run twice; it cannot see one run zero times. That rests on the wired partition pin and on every job of a run reading the same commit. It prints each lane's shard spread (max − min job duration) per run, which is how drift shows.
- **Change map**: add `apps/extension/tests/e2e/shard-sequencer.ts`, `apps/extension/tests/e2e/shard-timings.json`, `apps/extension/scripts/e2e/shard-sequencer.test.ts`, `scripts/ci-cd/e2e-timings.ts`, `scripts/ci-cd/e2e-timings.test.ts`. Modify `apps/extension/vitest.e2e.config.ts`, `apps/extension/vitest.e2e.network.config.ts` (`sequence: { sequencer: shardSequencer(timings.<suite>) }`), root `package.json` (`e2e:timings`), the docs and comments recon lists, and `docker-ci-like.sh:27-28`'s claim about what shard 5/5 holds. Unchanged in behaviour: every workflow's steps and matrices, `agent.sh`, `proverless-guard.sh`, the soak workflow, `vitest.e2e.all.config.ts` (never sharded). Their shard expressions stay valid; what a given shard holds changes, so an exact reproduction names its files.
- **Not taken**: (b) explicit per-shard file lists. That breaks the matrix pins (`behavior-gating.test.ts:873-892`), makes a local `--shard=2/5` differ from CI's, and leaves any file missing from every list unrun. (c) Vitest's results cache shared through `actions/cache`. Each shard could read a different cache and drop or repeat files, and a new PR starts cold. (d) The json reporter uploaded as artifacts: a workflow change for data the logs already hold.

## Security & Adversarial Considerations

- **Threat**: a PR's test prints a line shaped like a reporter line to skew the record. The runner, not the test, writes each line's timestamp prefix, so a printed line cannot forge one. A cost is a gap between real timestamps (the first file's is also capped by its gap), so a forged line can only move time between files of one job, never add any. A forged line also breaks the per-job count or the once-per-run check, so its run is dropped. Paths must exist on disk. Each branch gives one run, so one PR moves a median only by one sample. The worst outcome is an unbalanced split, never a lost file. Every record change is a reviewed diff.
- **A mis-split hides a file** (the risk the orchestrator names): the pin test proves each real file list is partitioned exactly once for every browser and shard count.
- **Known limit, mixed commits**: a manual dispatch and the soak check out `github.ref`, a branch, so a push mid-run can hand shards different records and run a file zero times or twice. PR runs, nightly and release pin a SHA (`head.sha`, `resolve.outputs.sha`) and are not exposed. Before this change, only a file added or removed mid-run did this. Disposition: no push while a dispatch runs; the close-out files it as a closed `known-limit` issue (reopen if a gate ever runs on `github.ref`).
- **Least privilege**: the generator runs on a maintainer's machine with their read-only `gh` login, never in CI. No workflow, token, permission or secret changes. No new dependency.
- **Secrets**: no log is stored, and the record holds paths and numbers only. Nobody opens `network-endpoints.ts`.

## Assumptions

- **Facts**: F1 vitest 4.1.10's `BaseSequencer.shard` sorts by SHA-1 and slices contiguous ranges (`coverage.DM_a_rWm.js:35-46`). F2 `shard()` runs only in `executeTests` with `config.shard` set, after include and exclude filters (`cli-api.BK8pd4xc.js:3618-3622`), so `vitest list` and `proverless-guard.sh` never see it. F3 `sequence.sequencer` takes a constructor and `vitest/node` exports `BaseSequencer` (`node.d.ts:232,264`). F4 the shard-matrix pins hold under (a) unchanged (`behavior-gating.test.ts:873-892`). F5 both e2e workflows set `NULO_E2E_BROWSER` from `inputs.browser` at job level (`_extension-smoke-e2e.yml:72`, `_extension-network-e2e.yml:117`) and pass `--shard` (`:178-184`, `:262-283`). F6 `apps/extension/**` trips both e2e path filters, so the draft PR also runs all four lanes. F7 `test:ci-gating` is `bun test scripts/ci-cd/` and the extension's vitest runs `scripts/**/*.test.ts` on Bun, where `fs.globSync` exists. F8 a `// @vitest-environment node` test under `bun --bun vitest` imports `vitest/node`, extends `BaseSequencer` and loads both e2e configs (planner probe, 2026-10-20).
- **Inferences**: I1 a file's cost barely depends on its neighbours. Untested: the fit is accounting, and a balanced network shard runs a new mix on one sandbox. Phase 5 tests it. I2 run-to-run noise (smoke Chrome: 687–804 s) rivals the gains. Two samples per lane (the dispatch and the PR's own run) give direction, not a stable percentage; the PR shows each run beside the before range. I3 a record may stay useful for weeks, but a file's time also moves with an Aztec or browser bump, a harness change or a runner change.
- **Asks** (working assumption in force): A1 regenerate on demand: when a PR run shows a lane's shards spread by more than 2 minutes, after adding or removing a file over a minute long, or after an Aztec, browser or harness change. No gate checks freshness. A2 shard counts and dedicated jobs stay; OWNER-ASKS.md carries the runner-count observations.

## UI impact

None. CI and the e2e harness only; no surface a user sees changes.

## Phases (arc A1, branch `shard-balance-1-a1`, off this plan's branch)

**Phase 1 ✓ (planning): measure.** The table above; the raw report went to the orchestrator before any build.

**Phase 2 ✓: the generator and the record.** Write `scripts/ci-cd/e2e-timings.ts` and its test. The test parses a short excerpt of a real log, ANSI codes included. It pins: the cost rule (the first file its reported time capped by its gap, 0 for a skipped first file, later files the gap); a forged first line claiming 999999 s costs no more than its gap; a forged extra line drops its run (count, and once per run); nested test lines and non-reporter lines ignored; a skipped file costs its gap; a job naming a file twice dropped, beside a clean job kept; one run per branch; no matched line is an error; median per file; and files absent from disk dropped. Add `e2e:timings` to the root `package.json`. Run `bun run e2e:timings`, never edit the record by hand. If Biome reformats the record, make the writer emit Biome's format.
Gate: `bun test scripts/ci-cd/e2e-timings.test.ts`; `bun run e2e:timings`; `bun run lint`; `bun run typecheck:all`; `bun run test:ci-gating`. Pass: all exit 0; the record names the runs it used, and each table's keys are exactly those runs' files that exist on disk.

**Phase 3 ✓: the sequencer, its wiring, the pins.** Write `shard-sequencer.ts` and wire both configs. `shard-sequencer.test.ts` (`// @vitest-environment node`) pins:
(1) each config's own `sequence.sequencer`, built on a stub context (`root`, `shard: { index, count }`) for every index, both browsers (`NULO_E2E_BROWSER`) and the lane's count (3, 5), returns spec objects whose union over the indexes is each input spec exactly once. Inputs: the real smoke and network lists (each config's `include`/`exclude` resolved with `fs.globSync`) and the network pool list (less the lane's one-line `exclude_files`);
(2) the algorithm on a small table: costs 7, 5, 4, 3, 1 into two shards give exactly {7, 3} and {5, 4, 1} (a shortest-first or round-robin split fails it). On the real record, every shard has files and the slowest minus the fastest is at most the largest single cost. A file absent from the record lands on the lightest shard, and the control: a known file lands where its cost sends it;
(3) shuffled input gives the same split;
(4) a spec's absolute `moduleId` under `ctx.config.root` is looked up by its relative key: a costed file lands where its cost sends it, not where an unknown file would;
(5) a zero-cost or empty table still gives every shard files;
(6) the committed record's shape: relative `tests/e2e/…test.ts` keys, finite non-negative numbers.
Gate: `cd apps/extension && bun --bun vitest run scripts/e2e/shard-sequencer.test.ts`; `bun run lint`; `bun run typecheck:all`; `bun run test`; `bun run test:all`; `bun run test:ci-gating`. Then one real smoke shard on the armed build: `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:chrome`, then `cd apps/extension && env -u EXTENSION_PATH NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- --shard=2/3 --retry=0`. Pass: all exit 0, and the run's file set equals `assignShards`' shard 2 for Chrome (a set: the order within a shard comes from vitest's `sort()`).

**Phase 4 ✓: the docs.** Correct every SHA-1 statement recon lists, without counts that rot, plus the README's "picks the same files locally as in CI" (now true only with the browser set and the pool's `--exclude` list, which its reproduction command must show) and `docker-ci-like.sh:27-28`. Keep each dedicated job's reason, but drop "the sharder weighs no runtime". Put the record's upkeep in CI.md § the e2e lanes (what it is, that a new file needs nothing, when to regenerate) and the procedure in the e2e-testing skill.
Gate: `bun run lint`; `bun run check:plans`; `bun run test:ci-gating`; `bun run lint:actions`; `git grep -nE "SHA-1|deterministically|same files locally" -- CI.md .github apps/extension/tests/e2e/README.md apps/extension/scripts/e2e/docker-ci-like.sh .claude/skills/e2e-testing` shows no claim that the split is by path hash or fixed per shard.

**Phase 5: measure after** (after the Codex loop, before the PR). Push the branch. Run `gh workflow run <wf> --ref shard-balance-1-a1` for each of the four `pr-extension-*-e2e*.yml`. Do not push until all four end. Poll them in one bounded loop. Record, per lane: the shard spread (slowest minus fastest), the slowest job beside the before range, every shard's duration, and the e2e-testing skill's envelope. Check that each shard's file set equals `assignShards`' prediction for its browser.
Gate: all four dispatches green. Pass: the numbers and the file-set check are in the PR body, and any lane that did not improve says so. A red run is read honestly: a known flake gets one rerun, reported apart from the first attempt's numbers; real breakage gets a fix. A red that the new split causes (a new first file paying the cold-start cost the README names) is evidence against I1: report it, never rerun it to green.

## Delivery

One arc, one PR, no stack (D-orch-1). Title: `ci(e2e): split e2e shards by measured file time` (48 characters). Open it as a **draft** with `Refs #972` and no label, only after the Codex loop converges and Phase 5 has its numbers. The body holds the before and after table per lane and browser, the per-shard totals, the validation runs, and the complexity evaluation: files and lines added, the record and its upkeep, how it drifts and what the pin catches, what a contributor adding a file must do (nothing), and the owner-visible risk. Then run `gh pr checks <n> --watch` once; the PR's own four lane runs are the second sample. Never merge: the owner merges or closes it.

## Post-implementation

Execution contract: this plan plus `implementations-plan/README.md` § Post-implementation standard at 41ed6c594. Plan-specific values:

- Step 1 is absent (`code_review: off`).
- Step 2, once, over `git diff origin/dev...HEAD` after Phase 4 is green: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`; resume with `resume-codex.sh`. One Opus `general-purpose` review runs beside round 1. Hard stop at three rounds, then surface. Log each round in `lessons/phase-N.md` and under Audit verdicts below.
- Close-out: the PR's final commits, written after Phase 5 so the Outcome cites real numbers, Status `completed (pending the owner's merge)`. Then `git mv` into `archive/` in its own commit. If the owner closes the PR, the plan never lands; nothing else to undo. The close-out also deletes the planner's scratch logs (`~/.cache/nulo-backlog/shard-balance-1/measure/logs`, 88 MB).
- Teardown after the merge, never asked: once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/shard-balance-1/plan.md` succeeds, run `agent-worktree done shard-balance-1 --merged`. Relay a refusal and stop.

## Decision ledger

- D1 shape (a) over (b), (c) and (d), for the reasons under Not taken.
- D2 per-browser tables over one table: 11–41 s per lane (Measurement).
- D3 wall-gap costs over reported durations. Both balance alike (within 9 s), but a printed line can forge a reported duration and cannot forge a gap.
- D4 no freshness gate: an unlisted file lands on the lightest shard, and a stale entry is ignored. A gate would force a `gh`-authenticated regeneration on whoever adds or renames a file.
- D5 the generator parses the job logs rather than adding a json artifact: no workflow change.
- D6 (implementation) the record's upkeep paragraph lives once, in the e2e README § CI sharding, beside the shard mechanics. CI.md states the split in one sentence and links there; the e2e-testing skill holds the refresh procedure.

## Audit verdicts

**Round 1, Codex (`gpt-6.1-sol`, high): conditional approve.** All six findings verified and adopted:
- C1 (high) the pin tested `assignShards` and the wiring apart, so a wrong adapter could pass. Phase 3 (1) now drives each config's own class, and `shard()` returns `TestSpecification`s (`node.d.ts:235`).
- C2 (medium, demonstrated on the scratch parser) a forged reporter line passed. Now costs are timestamp gaps, duplicates drop the job, and each branch gives one run.
- C3 (medium) an attempt-2 run trained the record, and the branch count was wrong. Measurement re-run on the corrected sample. The "floor is heavy-long" line was wrong and is now corrected.
- C4 (medium) the 1–2 % fit is an identity of the accounting, not evidence for I1. I1 is relabelled untested.
- C5 (low) I3 is too narrow. Its triggers now include Aztec, browser and harness changes.
- C6 (low) `docker-ci-like.sh:27-28` names what shard 5/5 holds. That comment is in the change map.

**Round 1, Opus 5.5 Plan lens: conditional approve.** Nine findings, verified; all adopted, with one variant:
- O1 (medium) a forged line splits a real gap. Adopted as per-job count and once-per-run checks, `..` refused, and a stop when no line matches. The lens's "keys in the suite's selection" check is covered by the count and on-disk checks, so the generator needs no copy of the include globs.
- O2 (medium) no success control for balance. Adopted: the exact small-table split, the greedy bound on the real record, and pin (1) through each config's class.
- O3 (low) a `vitest/node` import under jsdom on Bun was a risk. Probed (F8): it works under `// @vitest-environment node`. Paths compare by code unit.
- O4 (low) the smoke command failed without the armed build. Now the established armed-build command, compared as a set.
- O5 (low) two samples cannot confirm the network gains. Phase 5 now leads with the spread, shows the before range, checks the file sets, and reports a split-caused red.
- O6 (low) a push mid-dispatch mixes commits. Added as a known limit.
- O7 (low) several misstated facts: OA-1 per browser, the 1–2 % fit (worst 3.6 %), the tie-break claim, F5's lines, a skipped first file. All corrected.
- O8 (low) the `--runs` option had one caller (now dropped), and two stale doc claims were missed (now in Phase 4).
- O9 (low) the scratch logs are deleted at close-out.

**Round 2, Codex (resumed): approve.** It re-ran the revised numbers and found them matching. One low finding, adopted: the once-per-run check proves no file ran twice, not that none ran zero times (mixed partitions can drop one). The sentence now says so; the known limit stands.

**Implementation round 1, Codex (`gpt-6.1-sol`, high, session `01a15bd5`): findings.** Both adopted:
- I-C1 (medium, demonstrated in memory) a printed file line plus a printed `Test Files` count passed the per-job check, since the parser read the first summary. A job now needs exactly one summary; a regression test covers it.
- I-C2 (low) three comments restated their code. They are deleted.

**Implementation round 1, Opus 5.5 diff review: findings.** One duplicated I-C1; two adopted:
- I-O1 (low–medium, demonstrated by mutation) the order test held only recorded files, so dropping the sort of unknown files passed. It now adds two unknown files out of order, and that mutation fails it. Vitest's glob order is a crawl order, so this sort is what keeps a new file in exactly one shard.
- I-O2 (low) three lines still said a plain local `--shard` reproduces CI's shard (README:21, the README's reproduction block, `docker-ci-like.sh`). Locally the whole suite is split, not CI's pool. All three are corrected.

**Implementation round 2, Codex (resumed): clean.** It verified both fixes, re-ran the parser tests and the unknown-file mutation, and found no regression. The loop converged.

## Seeds (drafts, not run: the orchestrator owns execution)

```
/goal implementations-plan/shard-balance-1/plan.md phases 2–5 each ✓ with its gate pasted green; the Codex fix loop converged (a resumed round with no new material finding quoted); draft PR open with Refs #972, the before/after table and the complexity section; close-out commits on the PR; `bun run test:ci-gating` and `bun run lint` exit 0.
/loop 15m Drive implementations-plan/shard-balance-1 per its plan.md: reality-check plan.md, STATUS.md and the PR; run the next phase gate; never merge; stop when the draft PR carries the Phase 5 numbers and the close-out.
```
