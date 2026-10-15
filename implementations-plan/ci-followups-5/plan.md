---
plan: ci-followups-5
tier: light
status: completed; one arc, one PR against dev (Closes #251); close-out in the same PR
issues: "#251 (arc 1)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: one recon explorer (sonnet); one Codex audit (gpt-6.1-sol high) resumed to a verdict; one Opus Plan lens beside it
base: origin/dev at 116974dc
trunk: dev
post_implementation_hardening: not scheduled
---

## Outcome

- **Date:** 2026-10-15. Planned and delivered the same day.
- **Status:** delivered in one PR against `dev` from `worktree-ci-followups-5`, which closes #251; this close-out is its final commits, and its merge closes the plan.
- **Shipped:** `.github/workflows/pr-retarget.yml`: on a base change of a same-repository pull request, one job with `actions: write` re-runs all jobs of each e2e lane's latest run of the head, cancelling and then waiting for a run in flight, so the lane's `Detect changes` reads the new base; a title or body edit runs nothing. `retarget.test.ts` (13 cases, each failure mode proven red by a mutation), B1-B3 in `behavior-gating.test.ts`, the shim runner shared with `supersede.test.ts` in `gh-step-harness.ts`; `CI.md` § Concurrency and `.github/WORKFLOWS.md`. The live probe (`lessons/phase-2.md`) proved the `GITHUB_TOKEN` re-run, two quick retargets, a retarget over runs in flight and the skipped edits.
- **Dropped, rejected, superseded:** `pr-quick.yml` is not re-run (D6: its base gates read the event payload, which a re-run keeps); the reason is commented on #251. Review dispositions are in § Audit record and § Implementation review. No `lessons.md` promotion: the probe's GitHub behaviours are stated in `CI.md`, and the curated budget is full.
- **Known limits:** #483 (D9, OP3, CX1: a lane left on its old-base check when the job cannot re-run it, a listing that trails a re-run, a run older than the live base read).
- **Open items:** none.
- **Seeds retired:** the `/goal` and `/loop` drafts are retired and removed; this plan is a record, not a task list.

# ci-followups-5: re-run the e2e lanes when a pull request's base changes

One arc, one PR against `dev`, closing #251 as the owner decided it (decision page 17, option A, 2026-10-15). Recon: [recon.md](recon.md). Owner asks: [OWNER-ASKS.md](OWNER-ASKS.md) (none). Consults: [lessons/phase-0.md](lessons/phase-0.md). Over the light target (150 lines) because the audit record and the implementation review carry both legs' findings.

**The path (#251, plausible but unverified until Phase 2).** A PR into `dev` whose diff misses every lane's paths filter gets green e2e aggregators with skipped suites. Its author changes the base to `main`. GitHub sends `pull_request` `edited`, which no workflow subscribes to (F1), so no run starts. The skipped-suite greens stay on the head although `main` force-runs every suite (F2): a PR could merge into `main` on suites that never ran. Every claim in the issue holds at the base.

## Scope

**In:** a new workflow, `.github/workflows/pr-retarget.yml`, with one job; its tests; the docs that state the old recovery. **Out:** `pr-quick.yml` (D6); any change to the four lanes, their path filters, aggregators, check names, rulesets or `timeout-minutes` (owner boundary).

**UI impact: none.** The lane brief's record is "No screen."; no file under `apps/` or `packages/` changes.

## Outcome & Quality Bar

**For whom.** The maintainer who retargets a PR, and the reviewer who trusts the required checks on `main`.
**Excellent.** After a base change of a same-repository PR, each e2e lane's required check comes from an attempt that read the new base, with no action by a person; a title or body edit starts no lane; one slow lane never holds back the others.
**Good enough.** When the job cannot re-run a lane, it goes red and names the run and the recovery; that case is a stated known limit (D9). A fork's PR keeps the manual recovery (none has ever existed, F7). The job may re-run suites whose result would not change (the owner accepted the cost).

## Architecture & Implementation

**Workflow.** `name: Retarget`; `on: pull_request: types: [edited]`; `permissions: {}`; no concurrency group (D5). One job, `rerun-e2e` (name `Re-run the e2e lanes on the new base`):
- `if: github.event.changes.base && github.event.pull_request.head.repo.full_name == github.repository && github.actor != 'dependabot[bot]'`
- `permissions: { actions: write }`; `timeout-minutes: 15`; `runs-on: ubuntu-latest`
- one `run:` step: no `uses`, no checkout, no `${{` in the script. `env:` holds `GH_TOKEN`, `REPO`, `PR` (number), `HEAD_SHA` (`github.event.pull_request.head.sha`), `RETRY_PAUSE: "5"`, `POLL_PAUSE: "10"`.

**Script.** `WORKFLOWS=(` the four lane files `)` and `api()`, the same one-retry wrapper as `pr-supersede.yml` (D2). Then:
1. Select. For each lane, list `repos/$REPO/actions/workflows/<basename>/runs` with `event=pull_request`, `head_sha=$HEAD_SHA`, `per_page=100`, `--paginate`. In jq, keep runs whose `head_sha` is `$HEAD_SHA`, whose `event` is `pull_request` and whose `pull_requests` name `$PR`. Take the highest `id`, with its `run_attempt` and `status`. No run: print it and go on.
2. Act. POST `runs/<id>/rerun` for a completed run. POST `runs/<id>/cancel` for a run in flight (HTTP 409: it already finished), then read the run once: the attempt it shows becomes the lane's baseline, since this job's cancel may have hit an attempt newer than the one selected. Keep the lane outstanding.
3. Poll. While runs are outstanding, read each `runs/<id>` once per pass, then sleep `POLL_PAUSE`. A `run_attempt` above the baseline counts as done: another request started that attempt after this job's listing, and this job never cancelled it. A `completed` run gets its `/rerun` now.
4. A refused `/rerun` counts as done when a fresh read shows a newer attempt (D5). Any other failed call fails its lane; the job goes on, prints `<id> <file>` for each re-run, and exits 1 at the end naming each failed lane's run.

**Why a re-run is enough (F2, F3).** The new attempt's `Detect changes` reads the live base and labels, and paths-filter lists the PR's files live. `read-attempt` equals the new attempt, so the aggregator accepts its skip.

**Harness.** Move the shim runner of `supersede.test.ts` (temp dir, shim on `PATH`, `${{ }}` env binding that throws on an unbound value, `bash -e -o pipefail`, call log) to `scripts/ci-cd/gh-step-harness.ts`. Both tests use it; supersede's assertions do not change (D7).

**File map.**
| File | Change |
|---|---|
| `.github/workflows/pr-retarget.yml` | new |
| `scripts/ci-cd/gh-step-harness.ts` | new: the extracted runner |
| `scripts/ci-cd/retarget.test.ts` | new: R1-R5 |
| `scripts/ci-cd/supersede.test.ts` | uses the harness; header (`:2`) drops "the only script" |
| `scripts/ci-cd/behavior-gating.test.ts` | B1-B3; `LANES` hoisted to module scope; the `:188` comment says two jobs |
| `CI.md` § Concurrency | `:104`'s retarget sentence; a paragraph on the job: the cancel, the poll, D9 with its recovery, the fork case, a stacked parent's merge (GitHub retargets the child, so the job fires; the rebase push that follows supersedes it), and that a head without this file in its merge ref keeps the old recovery until the next promote |
| `.github/WORKFLOWS.md` | a row for `pr-retarget.yml`; supersede's row (`:16`) drops "the one job"; a cheat-sheet line |

## Decisions

| # | Decision | Why (alternatives) |
|---|---|---|
| D1 | A new workflow file, not a second job in `pr-supersede.yml` | Supersede stays on `synchronize` and its pins stay; "nothing else subscribes to `edited`" is one file. A shared file would make every title edit start a supersede run |
| D2 | The script is inline and copies `api()` (a third copy, after `live-labels.sh` and supersede) | A job that holds `actions: write` runs nothing it fetched; sourcing a shared file needs a checkout of PR code. No retry would leave the stale green on one transient 5xx. An equality pin on the two inline copies was rejected: they differ by supersede's call log |
| D3 | Re-run completed lanes at once; cancel lanes in flight and poll them together; a newer attempt counts as done | GitHub re-runs only completed runs, and the common retarget ("wrong base") comes seconds after opening, while the first runs are in flight. Waiting without a cancel holds a runner for up to a 30-minute network suite. Force-cancel is for runs that ignore a cancel. A base check in each aggregator touches four lanes and still needs a person. Polling lane by lane would let one slow cancel starve the rest (Codex 2, Opus 2) |
| D4 | The event's head; no live read of the PR | A head that moved after the retarget has its own runs, started later, which read the new base. A re-run of the old head's run fails in `Detect changes` on that old head only. A live read that lags a push could stop the job and leave the stale green; skipping it also keeps the scope at `actions: write` |
| D5 | No concurrency group | The last base change's job lists each run after that change. Every attempt it starts, and every attempt it sees above the one its own cancel left, began after its listing and was never cancelled by it, so it read the newest base. Both legs traced every interleaving of two retargets seconds apart and found no stale lane with both jobs green. A workflow group would let a title-edit run replace a waiting retarget run; whether a skipped job joins a job-level group is undocumented |
| D6 | `pr-quick.yml` is not re-run | Its base-dependent gates read the event payload, which a re-run keeps (F4): a re-run decides nothing new. Its own comment (`pr-quick.yml:24-29`) and auto-unstick's `launch-legal` repeat stand. The close-out comments this on #251 |
| D7 | Extract the shim runner instead of a second copy | The rules forbid a copy made to avoid a change; supersede's tests are the regression check |
| D8 | Phase 2 proves the trigger on GitHub before the PR | Only GitHub can prove that a `GITHUB_TOKEN` re-run works and that the `if` reads `changes.base`. `/cancel` with this token already runs in production (`pr-supersede.yml`) |
| D9 | Known limit, filed at close-out as a closed `known-limit` issue: when the job cannot re-run a lane, the lane keeps its old-base check and only the job is red | Causes: GitHub's 30-day re-run window and 50-re-run cap, a cancelled run not completed within 15 minutes, a refusal after the retry, and I4's stale read after a cancel (a red lane, not a stale one). A cancel after `Decide` skipped posts the skip's success, so the cancel is not fail-closed (Codex 1). The job cannot be required: it runs only on a base change, so every other PR would wait at `Expected`. A later title edit's skipped run may hide the red in the rollup. Recovery: re-run all jobs of the failed Retarget run (its payload keeps `changes.base`), push, or close and reopen. Turning the lane red would need `checks: write` and a new contract (Opus 3) |
| D-orch-1 | One arc, one PR against `dev`, no stack | orchestrator |
| D-impl-2 | The job prints `cancelled <id> <file>` for each cancel | Phase 2 found a successful cancel left no trace in the log; R5 asserts the line |
| D-impl-1 | The hoisted lane map is `E2E_LANES`; the harness takes `overrides` | `describe("canary lanes")` has its own `LANES`, which would shadow a module-level one; both tests zero their pauses after binding |

## Assumptions

**Facts** (verified at `116974dc`; citations in recon): F1 no workflow subscribes to `edited`. F2 lanes read the base live and force-run on `main`; a skip must be read in the run's own attempt. F3 paths-filter lists PR files live. F4 `pr-quick.yml`'s base gates read the event payload. F5 a run cancelled after its jobs started runs its `always()` aggregator: FAILURE if `Detect changes`, `Decide` or a suite was cancelled, the skip's success if only the aggregator was left; a run cancelled while waiting in its group posts nothing. F6 a re-run queues in its lane's per-head group (`CI.md:100`). F7 no fork PR in 150 (both legs re-ran the query).
**Inferences:** I1 a `GITHUB_TOKEN` with `actions: write` may POST `/rerun` on `pull_request` runs (common practice; GitHub's REST page does not say; Phase 2 proves it). I2 `edited` carries `changes.base` only on a base change, a GitHub retarget of a stacked child included (Phase 2 checks the first half). I3 a cancelled run reaches `completed` within minutes once its aggregator gets a runner. I4 the read after a cancel shows the attempt the cancel hit or a later one. A stale read there could leave a cancelled lane (red, not stale) behind two green jobs: an unverified residual inside D9, with no mechanism added. A read that lags after a refused `/rerun` can only make a job red. I5 the rollup and branch protection read the newest check run of a name, as `CI.md:100` already assumes.
**Asks:** none. If I1 fails, the arc stops: a stronger token is a secret and the owner's call.

## Security & Adversarial Considerations

- **Threat model.** The job holds `actions: write` over every run in the repository, which also allows a dispatch. Its only inputs are the PR number, the head SHA and the repository name, all through `env:`; it never reads the title, body or branch names. It selects runs by lane file, head SHA, event and PR number, so it cannot touch `nightly`, `release*` or `publish-*` runs, and B1 pins its shape.
- **Who can fire it.** Changing a base needs write access or authorship of a same-repository PR; such a person can already push workflows. Fork PRs get a read-only token and are skipped. The cost a writer can cause is one re-run of each lane per retarget, which the owner accepted.
- **No escalation.** A re-run uses the original run's workflow files and privileges.
- **Least privilege:** `permissions: {}` at the top; the job gets `actions: write` only. No `pull_request_target`. Crypto, supply chain: nothing new (no action, no dependency).

## Phase 1: the job, its tests, the docs ✓

Assumes F1-F6 and nothing about GitHub beyond what the shim encodes; Phase 2 carries I1 and I2.
1. Extract the harness; run `bun test scripts/ci-cd/supersede.test.ts` and confirm all eight tests pass unchanged.
2. Add `pr-retarget.yml` per § Architecture.
3. Add `retarget.test.ts` on the harness. The shim answers the paginated list (per lane basename), `runs/<id>` (a sequence of status and attempt), `/cancel` and `/rerun`, and logs each call:
   - R1: completed runs. Each lane's highest-id run of this PR on this head gets one `/rerun`. An older run, another PR's run, a higher-id run on another head, a `workflow_dispatch` run and a run on the list's second page are selected only when they should be; no `/cancel`.
   - R2: a run in flight gets `/cancel`, reads until `completed`, then `/rerun`; a 409 on the cancel still leads to the re-run; a read that shows a newer attempt ends the lane with no `/rerun`; a cancel that lands on a newer attempt (the read after it shows n+1) waits for n+1 to complete and re-runs it.
   - R3: a lane with no run is skipped; the others are still re-run; exit 0.
   - R4: a 502 is retried once; a 404 on one lane's re-run fails the job after the other lanes are re-run; a refused re-run whose next read shows a newer attempt exits 0.
   - R5: both lanes are in flight and cancelled; lane 1 reads `in_progress` three times while lane 2 reads `completed`; lane 2's `/rerun` comes before lane 1's.
4. In `behavior-gating.test.ts`:
   - B1: pin the workflow's `on`, `permissions`, job `if`, job `permissions`, no `concurrency`, one step with no `uses` and no `${{`, and `WORKFLOWS` equal to `LANES`' keys.
   - B2: only `pr-retarget.yml` lists `edited` in any `pull_request` or `pull_request_target` types. Success control: it does list it.
   - B3: the "no other workflow can cancel or re-run a run" test allows exactly `pr-supersede.yml` and `pr-retarget.yml`.
5. Prove each R test and B2 red by one scratch mutation, never committed: pick the lowest id (R1); drop the jq `head_sha` filter (R1); drop the cancel (R2); keep the selected attempt as the baseline after a cancel (R2); exit 1 on a lane with no run (R3); count every refused re-run as done (R4); wait lane by lane (R5); add `edited` to `pr-quick.yml` (B2). Log each red run in `lessons/phase-1.md`.
6. Update `CI.md`, `.github/WORKFLOWS.md` and the two comments per the file map.

Gate: `bun run test:ci-gating`; `bun run lint`; `bun run lint:actions`; `bun run typecheck:all`; `bun run test:release`. Pass: all exit 0; the eight reds from step 5 observed. Layers: lint, typecheck, unit (CI gating).

## Phase 2: prove it on GitHub (throwaway branches, never `main`) ✓

Assumes the arc's Phase 1 is green; tests I1, I2 and, when step 4 catches a run in flight, I3.
Warning: create, change and delete only the three `retarget-probe-<s>-*` branches this phase names, with `<s>` a fresh UTC timestamp.
1. Push the arc branch. From its head, push `retarget-probe-<s>-a` and `retarget-probe-<s>-b`. Push `retarget-probe-<s>-head`: the arc head plus one empty commit.
2. Open a PR `-head` → `-a`. Wait until the four lanes' runs complete (suites skipped: the diff is empty).
3. Set the base to `-b`; as soon as the first `Retarget` run shows `in_progress`, set it back to `-a`. Check: both `Retarget` runs green; each lane's latest attempt logs `base=retarget-probe-<s>-a, read at attempt <that attempt>`; every aggregator green.
4. Push one more empty commit to `-head`. When `gh run list` shows the new head's lane runs `in_progress`, set the base to `-b`. Check: the `Retarget` log shows a cancel that succeeded; that lane's run has a higher attempt logging `base=retarget-probe-<s>-b`; every aggregator green. If no lane was still in flight at the listing, repeat this step at most twice, then record that only R2 covers the cancel path. Log every try; an API failure or a wrong outcome is a failure, never a reason to try again.
5. Edit the title, then the body. Check: two `Retarget` runs with the job skipped; no new attempt on any lane.
6. Close the PR; delete the three branches; log run ids and outcomes in `lessons/phase-2.md`.

Gate: steps 3 and 5 hold, and step 4 holds or is recorded per its last sentence. If `/rerun` gets HTTP 403, stop the arc and report it (I1). Layers: live CI.

## Delivery

One PR from `worktree-ci-followups-5` against `dev`; `code_review: off`. Merge `origin/dev` first. Title: `ci: re-run the e2e lanes when a pull request's base changes` (60). Open it without labels; the lanes' filters skip it, which is right (no lane changes). The body states what changed and why, Phase 2's run ids, the validation outcomes, D9's limit, `Closes #251`, and ends with the Claude Code line. Commits are signed and end `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Then `gh pr checks <n> --watch`: `quality-status` and `actionlint` green.

## Post-implementation

`implementations-plan/README.md` § Post-implementation standard at `116974dc`, with:
- **Codex loop**, once over `git diff origin/dev...HEAD` after Phase 2: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; each round logged in `lessons/phase-2.md`; hard stop at three rounds.
- **Close-out**, as the PR's final commits: the Outcome block; D9 filed as a closed `known-limit` issue (reopening condition: a stale-green merge into `main` observed, or a required check that can carry it); a comment on #251 with D6's disposition; no lessons promotion unless Phase 2 finds a GitHub behaviour worth one; `STATUS.md` deleted; the `git mv` into `archive/` in its own commit; `bun run check:plans` green.
- **Teardown** after the merge: `agent-worktree done ci-followups-5 --merged`.

## Audit record

**Round 1 (2026-10-15).** Codex (gpt-6.1-sol high, session `01a13ffd`): **conditional approve** (fail-closed overstated; lane starvation; pagination; a probe that cannot prove the cancel; re-run limits). Opus Plan lens: **conditional approve** (one poll keyed on `run_attempt`; an honest limit; selection pins; red proofs). Each claim was checked against the tree.

| # | Finding | Disposition |
|---|---|---|
| C1 / O3 | A cancel after `Decide` skipped posts the skip's success (demonstrated: the aggregator has no cancellation check); a timed-out job leaves the old green; the job is not required | Accepted: F5 qualified; D9 known limit with its recovery |
| C2 / O2 | Waiting lane by lane lets one slow cancel starve the rest | Accepted: completed lanes re-run first, one poll over the rest (D3); R5 |
| O1 | A job polling an attempt another job started waits until its own timeout | Accepted: a newer `run_attempt` counts as done (D5); R2 |
| C3 / O4 | One page can miss the PR's run; server-side filters are silently ignored when misspelled | Accepted: `--paginate`, basenames, jq filters on head, event and PR; R1 |
| C4 / O6 | Phase 2 could pass with no cancel | Accepted: step 4 retargets while the new head's runs are in flight; body-only edit; unique branch names |
| C5 | 30-day re-run window and 50-re-run cap | Accepted into D9 and `CI.md` |
| O5 | Red-proof list did not match the gate; one wrong citation | Accepted: seven mutations; `CI.md:102` dropped from the map |
| O7 / O8 | A head whose merge ref lacks the file; GitHub retargets a stacked child on its parent's merge | Accepted: `CI.md` text, no code |
| O-D2 | Pin the two inline `api()` copies equal | Rejected: they differ by supersede's call log |

**Round 2 (2026-10-15, Codex resume, verify).** **Conditional approve**: every round-1 fix present. Repeating the live cancel probe is acceptable as fresh evidence, never to turn a failure green.

| # | Finding | Disposition |
|---|---|---|
| R2-1 | Job B's delayed cancel can hit attempt n+1 that job A just started; B then counts n+1 as done, leaving a cancelled lane behind two green jobs (red, not stale) | Accepted: after a cancel the job reads the run and takes that attempt as its baseline; R2 case and mutation |
| R2-2 | R5's ready lane was re-run in step 2, so sequential polling would still pass | Accepted: both lanes in flight and cancelled |
| R2-3 | Phase 2 never shows that `run_attempt` moves at once | Accepted by removing the claim (I4) |

**Round 3 (2026-10-15, Codex resume, verify).** **Conditional approve (with conditions: narrow I4's claim about lagging reads).** The round-2 fixes check out; no other regression. The condition (a stale post-cancel read could leave a cancelled lane behind two green jobs: plausible but unverified) is text-only and applied as asked: I4 is scoped, and the residual sits in D9 with no new mechanism.

**Opus Plan lens:** conditional approve (round 1); its conditions are the accepted O-rows above.

## Implementation review (Codex fix loop over `origin/dev...HEAD`)

**Round 1 (2026-10-15).** Codex (gpt-6.1-sol high, session `01a14025`): **approve with fixes**, one finding. Opus diff review beside it: **approve with fixes**, three.

| # | Finding | Disposition |
|---|---|---|
| CX1 | A re-run keeps its run's workflow revision and event, so a lane run created before the lanes read their base live (`c0e1e696`, 2026-10-09) re-decides on the event's base: every job green, the lane stale (plausible-unverified) | Needs conditions the repo lacks: the one open PR's lane runs date from today, and a retarget to `main` reaches this job only once `main` carries it, after a promote whose merge commit no old branch contains, so `main`'s `strict: true` forces a push and fresh runs first. Known limit (close-out issue); one clause in `CI.md` |
| OP1 | The four fail-closed branches (list, unreadable listing, read after a cancel, read in the poll) had no test: each mutated to a skip, all tests passed (demonstrated) | Fixed: four cases; each mutation now red (M9-M12, `lessons/phase-2.md`) |
| OP2 | `CI.md` said the job "goes red naming the run"; on a timeout the final summary never prints | Fixed: the text names the `cancelled <id> <file>` lines for that case |
| OP3 | A listing that trails a re-run started before the base change would count that stale attempt as done (plausible-unverified, the I4 class) | Known limit, folded into the close-out issue; no code |

**Round 2 (Codex resume, verify).** **Approve**, no findings: CX1's disposition holds under `strict: true` (no merge path into `main` keeps the old checks); the four tests and the doc fixes hold.

**Round 3 (Codex resume).** Rounds 1-2 omitted the comment-audit rule of [§ Post-implementation standard](../README.md#post-implementation-standard), so round 3 carried both rules verbatim. **Approve with fixes**, comments only; no correctness or security finding. Accepted: the harness header (the shim lives in, not runs from, a fresh directory), the narrating `read_run` and shim comments and B1's lead comment deleted, B1's concurrency comment cut to its reason. Rejected: replacing the `api()` comment (it decodes the retry regex and mirrors supersede's deliberate copy), the test-file headers (the repo's convention for these files), the pre-existing supersede comment, and a reword of `E2E_LANES`'s doc of equal length. The loop stops here: three rounds, no material finding left.
