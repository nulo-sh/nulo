# Fail-closed CI aggregators

Two defects let the required checks disagree with the gates behind them: three aggregators pass when their gates never ran, and a PR event on an unchanged head cancels the run in flight, whose aggregator then posts a FAILURE under a required name beside the surviving run's green one.

## Problem

### 1. Denylist aggregators

`quality-status` (`.github/workflows/pr-quick.yml`), actionlint's `Status` (`.github/workflows/actionlint.yml`), and in `.github/workflows/release.yml` the `status` loop and the `attach-assets` guard fail only on a result reading `failure` or `cancelled`. Any other result passes: `skipped`, or an empty string. During a GitHub Actions outage a Quality run went green twice, once with `Detect changes` cancelled and every gate skipped, once with four gates cancelled without a runner that reached the aggregator as neither. In `release.yml` the same hole lets a push whose release-please job never ran report green, and lets `attach-assets` publish while a gate it needs never ran. The e2e aggregators already fail closed: they require `success` from their control jobs and exactly the state the `Decide` gate asked of every suite.

### 2. Superseded runs on an unchanged head

Every PR workflow groups its runs by pull request number with `cancel-in-progress: true`. When a second event arrives for the same head, the new run cancels the one in flight; that run's aggregator is `if: always()`, so it still runs, sees its gates cancelled and posts FAILURE under the required check name. On Dependabot's PR #5 the `opened` event and two `labeled` events (Dependabot labels its PRs `dependencies` at creation) started three runs of each e2e workflow within a second: the first was cancelled while running and posted four failed aggregators (runs 37556957814, 37556957820, 37556957833, 37556957876), the second was cancelled before it started a job, and the third went green (37556958825 and its siblings). The PR's status rollup read FAILURE. `labeled` and `unlabeled` are the trigger seen in practice, but `ready_for_review` and `reopened` also re-run an unchanged head, so a draft marked ready while its run is in flight hits the same defect.

## How GitHub judges a required check with several runs of one name

What the fix rests on, each with its evidence:

- **Every check run of a required name on the head counts, and a red one is not hidden by a newer green one.** On #5 the GraphQL `statusCheckRollup` of the head listed both the FAILURE and the SUCCESS run of each e2e aggregator, each `isRequired: true`, and the rollup was FAILURE although each SUCCESS completed later. `filter=latest` on the check-runs API dedupes re-run attempts inside one check suite, not separate runs: it returned both. (High confidence for the rollup; the merge box was not captured.)
- **A skipped job posts a check run, and branch protection accepts it.** The docs: required checks "must have a `successful`, `skipped`, or `neutral` status". On #5 every skipped job has a `skipped` check run. So an aggregator skipped by its `if:` greens its required check.
- **A job waiting on `needs` has no check run yet.** Each aggregator's check run starts only after its last need completes (#5: `extension-network-e2e-status` started 3 s after its `Decide` ended). Until then a required name has no check from that run, so any other run's passing check under the name satisfies it.
- **A run replaced while queued posts nothing.** On #5 the four runs replaced in the queue have zero jobs and check suites with zero check runs.
- **`always()` runs after a cancel**, and `!cancelled()` skips; a skipped aggregator passes (above), so neither spelling makes a cancelled run safe.
- **`cancel-in-progress` takes an expression**, evaluated for the incoming run, and a group processes runs in FIFO order of entry with no ordering guarantee.

## Decision

- **D1. Exact state machines.** `quality-status`, actionlint's `Status` and release's `status` require each need to end exactly as its own `if:` says: `success` where the condition held, `skipped` where it did not. Control jobs (`Detect changes`) must succeed, and a filter flag that is neither `true` nor `false` is a wiring fault. Results and conditions reach the script through `env:`, so the script contains no `${{ }}` and a test can run it as CI does.
- **D2. `attach-assets` enumerates success.** Its guard becomes `always() && !cancelled()` plus `needs.<job>.result == 'success'` for every need, with `network-e2e` required to be exactly `success` when `run_network_e2e` asked for it and `skipped` otherwise. `!cancelled()` stops a cancelled release from attaching assets; it is the guard the store-publish jobs already use.
- **D3. Only a new head cancels.** In all six PR workflows, `cancel-in-progress: ${{ github.event_name != 'pull_request' || github.event.action == 'synchronize' }}`. A push supersedes the old head, and a cancelled run's red aggregator lands on that old head, which no required check reads. Every other PR event queues behind the run in flight and runs when it ends. `workflow_dispatch` keeps cancelling, as today. The expression lists what may cancel, so a trigger added later queues by default.
- **D4. Every run is a full evaluation.** A run started by an irrelevant label still runs its whole gate. A queued run reads the labels and draft flag of its own event, which carries the PR's state at that moment, so a newer event that replaces it in the queue loses no opt-in label.
- **D5. Pins.** A new `scripts/ci-cd/aggregators.test.ts` executes each of the three scripts against every legitimate world a run can produce (each must exit 0) and, for every need, against every other result including an empty one (each must exit non-zero); it also requires each script's `env:` to bind exactly its job's `needs`. `behavior-gating.test.ts` pins the `attach-assets` guard and the cancel expression on all six PR workflows.

### Rejected

- **Skip the work and the aggregator on irrelevant label events** (the suggested direction). A skipped aggregator posts `skipped` under the required name, which branch protection accepts, and the real run's aggregator has no check run until its suites end. A label added while the real run works, or one that reaches the queue first (FIFO order is not guaranteed, and Dependabot's label arrives a second after `opened`), would green the required check before any suite ran. The same holds for a run that only checks whether its label is an e2e one.
- **A separate concurrency group for label events.** Two label events still cancel each other inside it, red again, and runs in it are never cancelled by a push.
- **`!cancelled()` on the aggregators.** A cancelled run then posts `skipped`, which passes: an outage-cancelled run would green the gate.
- **A dynamic aggregator `name:`** that differs on irrelevant label events, so their skipped check misses the required name. It works only while an expression in a job name stays right, and it couples the required names to event parsing.
- **Dropping `labeled`/`unlabeled`.** The opt-in labels `e2e:extension-smoke` and `e2e:extension-network` must keep starting a run without a push.
- **One shared aggregator script.** The aggregators check out nothing; a shared script would add a checkout to the one job that must always report. The duplicated part is two small shell functions per script, and the executing test pins each copy.
- **`nightly.yml`'s `status` stays a denylist.** Nothing waits on it, and its `publish-nightly` gate already enumerates success, so a nightly whose gates never ran publishes nothing.

### Cost

A label added, or a draft marked ready, while a run is in flight now costs a second full run on the same head, after the first ends, where it used to cost the cancelled partial run plus the full one. The PR is mergeable once the first run's checks are green, so the queue adds no wait to a merge. Pending replacement keeps at most one run waiting per workflow and PR.

## Files

- `.github/workflows/pr-quick.yml`: `quality-status` as D1; the trigger comment on label events rewritten; D3.
- `.github/workflows/actionlint.yml`: `Status` as D1; D3.
- `.github/workflows/release.yml`: `status` as D1, `attach-assets` as D2.
- `.github/workflows/pr-extension-{smoke,network}-e2e{,-firefox}.yml`: D3.
- `scripts/ci-cd/aggregators.test.ts` (new) and `scripts/ci-cd/behavior-gating.test.ts`: D5.
- `CI.md`, `.github/WORKFLOWS.md`, `CLAUDE.md`: the concurrency rule, a label run queueing behind the run in flight, the exact aggregators, the staged-rollout rollback line that names `attach-assets`' guard.
- `implementations-plan/follow-ups.md`: the resolved entry deleted.

## UI impact

None: CI configuration, a test and docs.

## Security and adversarial considerations

- **Fail-open is the threat.** Every change narrows what passes: D1 and D2 turn unknown or empty results into failures, D3 removes a path that posted FAILURE, never one that posted success, and D4 refuses the inert run that could green a required check early.
- **Who can start a queued run.** Labels need triage access; `ready_for_review` and `reopened` need write access or authorship. A user toggling labels can at most queue one more full run per workflow and PR (a queued run is replaced, not stacked), which costs runner time on this public repository and blocks nothing.
- **Injection.** The scripts read only job results, our own filter outputs, the event name and the boolean dispatch inputs, all through `env:`; no PR-controlled string (title, branch, label name) reaches a script.
- **Permissions** are unchanged: the aggregators keep the workflows' read-only token.
- **Residual: a draft's skipped Firefox lane.** A Firefox lane skips drafts and its aggregator then passes, so once the PR is marked ready it is mergeable on that pass while the ready run's Firefox suites still run. This predates the change and needs an owner call between running the Firefox lanes on drafts and accepting the window; it goes to `follow-ups.md`.

## Validation gate

- `bun run test:ci-gating`: the new executing test and every existing pin pass.
- `bun run lint:actions`: actionlint is clean on every changed workflow.
- `bun run lint` and `bun run typecheck:all` pass.
- A mutation probe: reverting any one aggregator to its denylist, or dropping one need from its checks, fails `aggregators.test.ts`.
- On the PR: every required check green on the head, with no FAILURE copy of any aggregator.
- After merge, the next PR that receives a label while a run is in flight shows the label run queued, then green, and no cancelled run with a failed aggregator on its head.

## Review

Plan review and diff review verdicts, with each finding's resolution, are recorded here before the work closes.
