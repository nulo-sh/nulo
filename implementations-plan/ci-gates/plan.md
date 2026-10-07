# Fail-closed CI aggregators

Two defects let the required checks disagree with the gates behind them: three aggregators pass when their gates never ran, and a PR event on an unchanged head cancels the run in flight, whose aggregator then posts a FAILURE under a required name beside the surviving run's green one.

## Problem

### 1. Denylist aggregators

`quality-status` (`.github/workflows/pr-quick.yml`), actionlint's `Status` (`.github/workflows/actionlint.yml`), and in `.github/workflows/release.yml` the `status` loop and the `attach-assets` guard fail only on a result reading `failure` or `cancelled`. Any other result passes: `skipped`, or an empty string. During a GitHub Actions outage a Quality run went green twice, once with `Detect changes` cancelled and every gate skipped, once with four gates cancelled without a runner that reached the aggregator as neither. In `release.yml` the same hole lets a push whose release-please job never ran report green, and lets `attach-assets` publish while a gate it needs never ran. The e2e aggregators already fail closed: they require `success` from their control jobs and exactly the state the `Decide` gate asked of every suite.

### 2. Superseded runs on an unchanged head

Every PR workflow groups its runs by pull request number with `cancel-in-progress: true`. When a second event arrives for the same head, the new run cancels the one in flight; that run's aggregator is `if: always()`, so it still runs, sees its gates cancelled and posts FAILURE under the required check name. On Dependabot's PR #5 the `opened` event and two `labeled` events (Dependabot labels its PRs `dependencies` at creation) started three runs of each e2e workflow within a second: the first was cancelled while running and posted four failed aggregators (runs 37556957814, 37556957820, 37556957833, 37556957876), the second was cancelled before it started a job, and the third went green (37556958825 and its siblings). The PR's status rollup read FAILURE. `labeled` and `unlabeled` are the trigger seen in practice, but `ready_for_review`, `reopened` and a re-run also re-run an unchanged head, so a draft marked ready while its run is in flight hits the same defect.

## How GitHub judges a required check with several runs of one name

What the fix rests on, with the evidence and its strength:

- **Every copy of a required name on the head is reported, and a red one is not hidden by a newer green one in the rollup.** On #5 the GraphQL `statusCheckRollup` of the head listed the FAILURE and the SUCCESS copy of each e2e aggregator, each `isRequired: true`, and the rollup was FAILURE although each SUCCESS completed later. `filter=latest` on the check-runs API dedupes re-run attempts inside one check suite, not separate runs. Not established: which copy the merge box applies (it was not captured). The design does not depend on it: it removes the red copy, and its other arguments hold whether the merge box takes the newest copy or requires all of them.
- **A skipped job posts a check run, and branch protection accepts it.** The docs: a job skipped by a conditional reports success, and required checks pass on `success`, `skipped` or `neutral`. On #5 every skipped job has a `skipped` check run. So an aggregator skipped by its `if:` greens its required check.
- **A job waiting on `needs` shows no check run until it is queued** (observed, not documented: each aggregator's check run starts after its last need ends). The rejection below of inert runs does not rest on this alone.
- **A run replaced while queued posts nothing** (observed: on #5 the four runs replaced in the queue have zero jobs and check suites with zero check runs).
- **`always()` runs after a cancel**, and `!cancelled()` skips; a skipped aggregator passes, so neither spelling makes a cancelled run's aggregator harmless.
- **`cancel-in-progress` takes an expression**, evaluated for the incoming run. Runs enter a group in FIFO order of entry, which GitHub does not guarantee to match event order.
- **Only `push`, `pull_request` and four other events' checks count toward a PR's required checks.** A `workflow_dispatch` run's checks never do, so `pr-quick.yml`'s comment that recovered a stuck head with `gh workflow run` was wrong; it now says to close and reopen the PR, or push.

## Decision

- **D1. Exact state machines.** `quality-status`, actionlint's `Status` and release's `status` require each need to end exactly as its own `if:` says: `success` where the condition held, `skipped` where it did not. Each also validates the control outputs its conditions read, since a malformed one would otherwise decide which stages are due. Results and outputs reach the script through `env:`, so the script contains no `${{ }}` and a test can run it as CI does.
- **D2. `attach-assets` enumerates success.** Its guard becomes `always() && !cancelled()` plus `needs.<job>.result == 'success'` for every need, with `network-e2e` required to be exactly `success` when `run_network_e2e` asked for it and `skipped` otherwise. `!cancelled()` stops a cancelled release from attaching assets; the store-publish jobs already use it.
- **D3. Only a push's first attempt cancels.** In all six PR workflows, `cancel-in-progress: ${{ github.event_name != 'pull_request' || (github.event.action == 'synchronize' && github.run_attempt == '1') }}`. A push supersedes the old head, and a cancelled run's red aggregator lands on that old head, which no required check reads. Every other PR event queues behind the run in flight and runs when it ends. A re-run keeps its original event, `synchronize` included, so without the attempt test a re-run of an old push would cancel the current head's run. `workflow_dispatch` keeps cancelling, as today. The expression lists what may cancel, so a trigger added later queues by default.
- **D4. Every run is a full evaluation.** A run started by an irrelevant label still runs its whole gate, and decides from the labels and draft flag its own event carries.
- **D5. Pins.** `scripts/ci-cd/aggregators.test.ts` (new) runs each of the three scripts against every legitimate world (each must exit 0); for every need, against every other result including an empty one (each must exit non-zero); and against each malformed control output in the world a run would really produce with it, where the jobs whose `if:` reads that output have skipped (each must exit non-zero). It also requires each aggregator to wait on every job of its workflow but a named advisory list, to bind exactly its needs' results through `env:`, and pins the `attach-assets` guard clause by clause. `behavior-gating.test.ts` pins the cancel expression on all six PR workflows.

### The release state machine

| Stage | `success` when | otherwise |
|---|---|---|
| `release-please` | the event is a push | `skipped` |
| `auto-unstick` | a push where `release_created` is not `true` | `skipped` |
| `resolve` | a dispatch, or `release_created` or `unstuck` is `true` | `skipped` |
| lint, units, both builds, both smokes, `attach-assets` | `resolve` was due | `skipped` |
| `network-e2e` | `resolve` was due and `run_network_e2e` is `true` | `skipped` |
| `publish-chrome-store`, `publish-firefox-amo` | `resolve` was due, its input is `true`, `is_prerelease` is `false` and `on_main` is `true` | `skipped` |

Control outputs: `release_created` must be empty, `true` or `false` on a push (release-please sets it only when it tagged); `unstuck` must be `true` or `false` when `auto-unstick` ran; `is_prerelease` and `on_main` must be `true` or `false` when `resolve` ran. Without the last two checks an empty output would excuse a requested store upload that silently skipped. A cancel needs no rule of its own: a cancelled stage reads `cancelled`, and one that `!cancelled()` skipped reads `skipped` where `success` was due, so both fail; a cancel after every due stage ended passes, correctly.

### Rejected

- **Skip the work and the aggregator on irrelevant label events** (the suggested direction). A skipped aggregator posts `skipped` under the required name, which branch protection accepts. A label run that reaches the queue first (FIFO order is not guaranteed, and Dependabot's label arrives a second after `opened`) or replaces a queued push run would green the required check before any run of that head had run its suites. The same holds for a run that only checks whether its label is an e2e one.
- **A separate concurrency group for label events.** Two label events still cancel each other inside it, red again, and runs in it are never cancelled by a push.
- **A group per head SHA with no cancellation.** It removes every concurrency cancel, but a push no longer cancels the old head's run: on the e2e lanes each push would run eight network suite jobs per browser to completion for a head nobody reads, against the account's runner concurrency. Cancelling obsolete heads by API instead would put `actions: write` in PR workflows.
- **`!cancelled()` on the aggregators.** A cancelled run then posts `skipped`, which passes: an outage-cancelled run would green the gate.
- **A dynamic aggregator `name:`** that differs on irrelevant label events, so their skipped check misses the required name. It works only while an expression in a job name stays right, and it couples the required names to event parsing.
- **Dropping `labeled`/`unlabeled`.** The opt-in labels `e2e:extension-smoke` and `e2e:extension-network` must keep starting a run without a push.
- **One shared aggregator script.** The aggregators check out nothing; a shared script would add a checkout to the one job that must always report. The duplicated part is three small shell functions per script, and the executing test pins each copy.
- **`nightly.yml`'s `status` stays a denylist.** Nothing waits on it, and its `publish-nightly` gate already enumerates success, so a nightly whose gates never ran publishes nothing; its `status` can still read green for such a night.

### Cost

A label added, a draft marked ready, a PR reopened or a run re-run while a run is in flight now costs a second full run of each subscribed workflow on the same head, after the first ends. Where it used to cost the cancelled partial run plus a full one, it now costs two full ones; on a PR that trips the network filter that is eight more suite jobs per browser, and they queue against every other PR's jobs for the account's runners. A queued run waits at most for the run ahead of it; pending replacement keeps one run waiting per workflow and PR, which bounds the backlog, not the total, so repeated label toggles still cost repeated runs.

## Residuals

None is introduced by this change; D3 makes the first two rarer and moves the rest to `follow-ups.md`.

- **An earlier green copy stands while a later run of the same head works.** A docs-only PR is green with its suites skipped; adding an opt-in label starts a run whose aggregator reports only when its suites end, and until then the earlier copy satisfies the required name. A draft's Firefox lanes skip and pass, so once it is marked ready the PR is mergeable on that pass while the ready run's Firefox suites still run.
- **A run decides from its own event's snapshot, and runs can enter the group out of event order.** An older event's run that enters after a newer one replaces it if it was queued, and decides on stale labels or a stale draft flag; an older push's first attempt entering after a newer one cancels the current head's run, which then reads red until that run is re-run (a re-run queues, never cancels). Reading the PR's labels, draft flag and head in `changes`, which already holds `pull-requests: read`, would remove both.
- **A manual or outage cancel** still leaves a red copy on its head, by design: fail closed.

## Files

- `.github/workflows/pr-quick.yml`: `quality-status` as D1; the label and retarget comments corrected; D3.
- `.github/workflows/actionlint.yml`: `Status` as D1; D3.
- `.github/workflows/release.yml`: `status` as D1, `attach-assets` as D2.
- `.github/workflows/pr-extension-{smoke,network}-e2e{,-firefox}.yml`: D3.
- `scripts/ci-cd/aggregators.test.ts` (new) and `scripts/ci-cd/behavior-gating.test.ts`: D5.
- `CI.md` (a Concurrency section, the exact aggregators, the release guard, adding a gate), `.github/WORKFLOWS.md` (triggers), `CLAUDE.md` (the staged-rollout rollback line, `quality-status`).
- `implementations-plan/follow-ups.md`: the resolved entry deleted, the residuals added.

## UI impact

None: CI configuration, a test and docs.

## Security and adversarial considerations

- **Fail-open is the threat.** D1 and D2 turn unknown, empty and malformed values into failures; D3 removes a path that posted FAILURE, never one that posted success; D4 refuses the inert run that could green a required check early.
- **Who can start a queued run.** Labels need triage access; `ready_for_review` and `reopened` need write access or authorship. Anyone who can do so can queue one more full run per workflow and PR at a time, which costs runner time on this public repository and delays other PRs' jobs; it cannot turn a check green.
- **Injection.** The scripts read only job results, our own job outputs, the event name and the boolean dispatch inputs, all through `env:`; no PR-controlled string (title, branch, label name) reaches a script.
- **Permissions** are unchanged: the aggregators keep the workflows' read-only token.

## Validation gate

- `bun run test:ci-gating`: the new executing test and every existing pin pass.
- `bun run lint:actions`: actionlint, with shellcheck on every `run:` script, is clean.
- `bun run lint` and `bun run typecheck:all` pass.
- A mutation probe: dropping any one `expect` or output check, turning a gate back into a denylist, dropping the attempt test's effect on the chain, or dropping `!cancelled()` from `attach-assets` fails `aggregators.test.ts`.
- On the PR: every required check green on the head, with no FAILURE copy of any aggregator.
- After merge, the next PR that receives a label while a run is in flight (the weekly Dependabot PR does) shows the label run queued, then green, and no cancelled run with a failed aggregator on its head.

## Close-out

In the same PR, after the review loop: an Outcome block after the title; the generalizable gotcha promoted to `lessons.md`; the resolved follow-up deleted and the residuals added to `follow-ups.md`; then, in its own commit, `git mv` of this directory into `archive/`, its links repaired and its index line moved to `archive/index.md`.

## Review

### Plan review (adversarial, second model): reject, then revised

Each finding and its resolution:

1. **A re-run of a `synchronize` run would still cancel a same-head run** (blocker). Adopted: D3 cancels only on the first attempt.
2. **The merge box's choice among copies is unproven, and `workflow_dispatch` checks never count for a PR.** Adopted: the claim is narrowed to the rollup and the design is shown not to depend on it; `pr-quick.yml`'s recovery advice is corrected. A disposable protected-PR experiment was not run: no outcome of it changes the design.
3. **Out-of-order entry can replace a newer queued run with a stale one, or let an older push cancel the current head's run.** Adopted as a residual, with its remedy, in `follow-ups.md`: both races predate this change, which makes them rarer, and reading live PR state in four gates is a change of its own.
4. **The earlier-green window exists for opt-in labels too, not only Firefox drafts.** Adopted: both are named under Residuals, and the plan claims fail-closed aggregators, not closed windows.
5. **The release state machine was promised, not specified, and empty outputs could excuse a skipped store upload.** Adopted: the table above, and validation of `release_created`, `unstuck`, `is_prerelease` and `on_main`.
6. **Cancellation must fail the release status.** Adopted in substance: a stage cancelled, or skipped by `!cancelled()` where it was due, already fails the exact check, and the test covers both; no separate cancel rule was added.
7. **The test proves shell comparisons, not orchestration.** Partly adopted: an independent jobs inventory, malformed-output worlds and a clause-by-clause guard pin were added. Rejected: a hosted concurrency rehearsal before merge, since it would queue full e2e lanes on the PR for evidence the first labelled PR after merge gives for free.
8. **The cost was understated.** Adopted: Cost now counts runner occupancy and states that pending replacement bounds the backlog, not the total.
9. **Close-out and nightly wording.** Adopted.

### Diff review

Recorded when the review loop ends.
