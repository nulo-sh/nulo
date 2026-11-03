---
plan: fixes-1.2.0-1
tier: light
status: completed (arc 1 PR to dev, awaiting merge)
issues: "#1574"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); one Codex gpt-6.1-sol high audit, resumed until approve; no Opus leg (lane tier light)
base: origin/dev at 3b845ef02
trunk: dev
post_implementation_hardening: not scheduled
---

## Outcome

- **Date**: 2026-11-03
- **Status**: completed, one arc: the PR that carries this close-out, to `dev`.
- **Shipped**: closes #1574. Every writer of a Home token row's `isUpdating` derives it from the row's unfinished balance tasks: the three task handlers (D1, D2) and the balance update path, which now goes through `mapRow` (D5). Four tests, red at `3b845ef02` first.
- **Known limits**: #1628 (Holdings dims a failed row during its retry, D4 (b)), #1629 (a task read overtaken by a create event, D4 (c)).
- **Dispositions**: rejected, dropping the mirrored flag (B), a state-returning composable (C) and a TokensView wrapper around the balance update (D).
- **Lessons**: none promoted: `lessons.md` holds 8174 of 8192 bytes, and the rule is stated at `syncRowUpdating`.
- **Open items**: #1627 (a throwing failure write orphans balance tasks, D4 (a)).
- **Seeds retired**: the `/goal` and `/loop` seeds below are not to be run.

# fixes-1.2.0-1: Home's refreshing dot stays lit while a newer refresh of the same row runs

Home's Holdings header dot can go out while a row's balance is still being re-read (#1574). One arc, one PR to `dev`. Recon: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md) (none). Consults: [lessons/phase-0.md](lessons/phase-0.md).

## The issue, checked

- **The cause holds.** `TokensView.vue`'s `onTaskUpdated` and `onTaskDeleted` (:154-159) write `false` to the row whenever `useBalanceTasks` accepts the event, which it does for any finished or deleted balance task (`useBalanceTasks.ts:47-57`), even when a newer unfinished task for the same row is still kept.
- **Demonstrated at the component layer**: scratch tests on the existing harness, red at `3b845ef02` and reverted: (1) old task created, finished, new task created, old task deleted: the dot goes out; (2) old and new tasks created, old finished: the dot goes out.
- **A third writer has the same defect** (found in audit round 1, demonstrated by trace and a scratch test red at base): `useTokenBalanceSnapshot`'s `onBalanceUpdated` replaces a listed row as received, without `mapRow` (`useTokenBalanceSnapshot.ts:24-25, :54-58`), so the row loses `isUpdating`. Path: a refresh of X runs; X's token metadata changes; `onTokenUpdated` emits X's balance update, then `enqueue` coalesces onto the running task, so no create event follows (`token-balance/service.ts:529-533`, `balance-job-queue.ts:144-152`). The dot goes out while X's task runs. The queue's own writes finish the task before they emit (`balance-job-queue.ts:233, :402-408`).
- **The browser trigger of the delete path is plausible but unverified.** It needs a finished task for row X retained longer than 60 minutes (`spec.ts:7`), a newer refresh of X in flight while Home shows X, and a task read by another reader (Holdings, `useExecutingTask` on Home's activity list, the balance queue's `getTaskSync`), whose `cleanupStaleTasks` emits the delete (`service.ts:192-227`). Home's own reconnect read re-derives every flag after it lands (TokensView.vue:219-228).
- **The update path needs two unfinished tasks for one row,** which the balance queue does not produce on its normal paths (recon § Producer). The rule below does not depend on producer order, so it covers both orders at no cost.
- **A consequence the issue does not name:** `TokenCard`'s `syncFailed` (TokenCard.vue:84) reads the same flag, so on Home a row whose last sync failed shows its failure dim while its retry runs. The same fix covers it.

## Outcome & Quality Bar

- **For whom:** a person on Home who refreshed balances, or whose wallet refreshes them on its own, and reads the header dot as "a shown value is being re-read".
- **Excellent:** (1) the dot is lit while a shown row has an unfinished balance task Home has been told of, the rule Holdings already uses; (2) a failed row's dim stays hidden while its retry runs; (3) every writer of a Home row, the task events and the balance events alike, applies that rule.

## Assumptions

**Facts**
- F1. `onTaskCreated` writes `true`, `onTaskUpdated` and `onTaskDeleted` write `false`, through `setRowUpdating` (TokensView.vue:147-159).
- F2. `useBalanceTasks` drops the event's task by id before it returns; `isUpdating(tbId)` is true while any kept task of that row is unfinished (useBalanceTasks.ts:42-60).
- F3. `withTaskFlags` (TokensView.vue:166) is the balance snapshot's `mapRow`; the snapshot (`useTokenBalanceSnapshot.ts:100`) and the add event (:45-52) apply it, the update event (:54-58) does not. TokensView is the only caller that passes `mapRow`. The reconnect loop (TokensView.vue:227) derives the flag too.
- F4. The flag's readers are `anyRefreshing` (TokensView.vue:89) and `TokenCard`'s `syncFailed` (TokenCard.vue:84). `TokenList` forwards the whole row (TokenList.vue:148-163); Holdings' rows lack the flag because holdings.vue never decorates them; its dot derives from the remaining tasks, as #1574 says (holdings.vue:72).
- F5. The task service deletes only finished root tasks past retention, with their subtrees (service.ts:219-235); it cannot finish a parent with unfinished subtasks (service.ts:105-114).
- F6. The component harness emits task and balance events directly and has `balanceTask`, `balanceRow` and `sectionDot` (TokensView.test.ts:16-50, :120-242).
- F7. `home-links.test.ts` is a general Home smoke check: it mounts Home's token list and waits for it to settle (`waitForSettledTokens`); it asserts nothing about the dot.

**Inferences**
- I1. After the composable drops the event's task, its list holds every unfinished balance task of the active account that Home has read or been told of, **provided a task read is not overtaken by an event**. A snapshot replaces the list (useBalanceTasks.ts:25-33), so a task created in the service's gap between computing `getTasks` and posting its answer arrives as an event first and is then dropped by the answer. Plausible but unverified; consequence, the row is not lit for that refresh; it exists at base, on Holdings too, and this plan does not change it (D4 (c)).
- I2. No e2e reaches these orders without new test hooks (a clock or a task-seeding hook: none exists), and none is needed: the component layer drives the same events in a chosen order.

**Asks:** none for the owner. The brief's "the Home smoke e2e file" is read as `home-links.test.ts` (F7).

## Architecture & Implementation

1. **`TokensView.vue`**: replace `setRowUpdating(tbId, updating)` with one writer that derives the value, called from all three task handlers after the composable accepts the event:

```js
/** A row is updating while any of its refreshes is unfinished, whichever task the event names. */
const syncRowUpdating = (tbId) => {
	const row = tokenBalances.value.find((tb) => tb.id === tbId)
	if (row) row.isUpdating = balanceTasks.isUpdating(tbId)
}
function onTaskCreated(task) {
	if (balanceTasks.onTaskCreated(task)) syncRowUpdating(task.content.tbId)
}
// onTaskUpdated and onTaskDeleted: the same shape.
```

2. **`useTokenBalanceSnapshot.ts`**: `onBalanceUpdated` writes `mapped(tb)`, as `onBalanceAdded` and the snapshot already do, and the `mapRow` doc drops "an update that replaces a listed row writes it as received". Only TokensView passes `mapRow`, so no other surface changes.

No change to `useBalanceTasks`, the task service, `TokenCard`, Holdings, storage or any message. No new state.

**Trade-offs not taken.** (B) Drop the mirrored flag and derive the dot as Holdings does: `TokenCard` would take a new prop, `mapRow` would lose its only caller, and the TokensView tests that pin the task-before-balance wait (TokensView.test.ts:410-437, :774-821) would need a new reason for that order. More churn than the cause needs. (C) Have the composable's task handlers return the row's new state: a contract change for one caller, where `isUpdating` already answers. (D) Codex's round-1 option, re-derive in a TokensView wrapper around the balance update handler: it patches the consumer around the composable's inconsistent `mapRow` rule instead of fixing the rule.

## Security & Adversarial Considerations

- **Surface and trust:** none new. The events come from the wallet's own services over the extension port; the change reads state the view already holds, trusting `useBalanceTasks`' list as Holdings and the reconnect path already do (I1 states where it can miss a task). No storage, message shape, permission or log line changes.
- **What could go wrong:** a row lit for as long as an unfinished task stays kept. The one orphaning path (recon § Producer, plausible but unverified) already lights the row on every Home mount (`withTaskFlags`) and on Holdings at base; this fix does not create it (D4 (a)).

## UI impact

Home's Holdings header dot (`tokens-refreshing`) and a failed row's dim on Home: no layout, copy or format change. Both now hold for as long as a refresh runs, the behaviour their code already documents. Sign-off: the lane brief, "None visible beyond the dot staying lit for as long as a refresh runs, which is today's intended behaviour." Holdings, Send and Select token: no change.

## Phase 1 (arc 1): every Home row writer derives the flag from the remaining tasks ✓

1. Add three tests to `TokensView.test.ts`, describe "TokensView — section refresh dot", rows `[X]`, each ending on its success control (the dot can still go out):
   - T1: old task created then finished, new task created, old task deleted: the dot is lit and the card's `tokenBalance.isUpdating` is `true`; then the new task finishes: the dot is out.
   - T2: old and new tasks created, old finished: the dot is lit; then the new task finishes: the dot is out.
   - T3: a task created, then a balance update for X: the dot is lit and the card's flag is `true`; then the task finishes: the dot is out.
2. Add to `useTokenBalanceSnapshot.test.ts` one test: with a `mapRow`, an update for a listed id lands through it.
3. Run the four tests at this commit: all red. Record the output in `lessons/phase-1.md`.
4. Make the two changes in Architecture & Implementation. Run them again: green.

**Validation gate**
- `cd apps/extension && bun --bun vitest run src/popup/components/modules/general/TokensView.test.ts src/composables/useTokenBalanceSnapshot.test.ts`: the four new tests red before step 4, both files green after.
- From the root: `bun run lint`, `bun run typecheck:all`, `bun run test`, `bun run test:all`: each exit 0.
- `cd apps/extension && bun run test:e2e -- tests/e2e/home-links.test.ts --retry=0`, then the same with `NULO_E2E_BROWSER=firefox`: each green; record each wall-clock. No e2e scenario is added or changed.
- Layers: lint and typecheck, unit and component, smoke e2e on Chrome and Firefox.

## Delivery

One PR from `worktree-fixes-1.2.0-1` to `dev` with `gh pr create`, opened only after the review loop converges, without labels. Title (82 characters): `fix(home): the refreshing dot stays lit while a newer refresh of the same row runs`. Body: what changed and why, the validation runs with outcomes, `Closes #1574`. Then `gh pr checks <n> --watch`. Nothing merges before the orchestrator's word.

## Post-implementation

The contract is this plan plus [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard) at `3b845ef02`. Specific here:
- Step 1 is absent (`code_review: off`). Step 2 runs once over `git diff 3b845ef02...HEAD` after phase 1 is green: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; prompts under `~/.cache/nulo-backlog/fixes-1.2.0-1/`. Hard stop at three rounds; each round in `lessons/phase-1.md` and the table below.
- **Approval boundary (a plan change; stop):** any code edit outside `TokensView.vue`, `useTokenBalanceSnapshot.ts` and their two test files; a change to `useBalanceTasks`, the task service or its retention; a new e2e scenario.
- Close-out, as the PR's final commits: the Outcome block; D4's items filed in their homes after a dedupe; lessons promoted only if one generalizes; `STATUS.md` deleted; `git mv` into `archive/`, index line moved. Teardown after the merge: `agent-worktree done fixes-1.2.0-1 --merged`, trunk `dev`.

## Decision ledger

- D1. Derive the flag at the three task handlers from `balanceTasks.isUpdating` (chosen) over B and C.
- D2. `onTaskCreated` derives too, instead of writing `true`: one rule for every writer. Its value is the same in every case the producer creates.
- D3. No new e2e scenario: the orders need hooks that do not exist (I2), and the component tests drive the same events. `home-links.test.ts` runs on both browsers as the general Home smoke check.
- D4. Out of scope, filed at close-out after a dedupe:
  - (a) A storage write that throws inside `failBatchOnProjectorError` leaves later owned tasks unfinished with their pointers released (recon § Producer): plausible but unverified; consequence, the row's dot stays lit on Home and Holdings until the worker restarts. An open issue labelled `bug`.
  - (b) Holdings never decorates its rows with `isUpdating`, so there a failed row's dim shows while its retry runs (TokenCard.vue:84, holdings.vue): demonstrated by trace; consequence, a dim of seconds that the next success clears. A closed `known-limit` issue; reopens on a user report or an owner call to match Home.
  - (c) A task read overtaken by a create event drops that task (I1): plausible but unverified, a missing dot for one refresh, at base and on Holdings. A closed `known-limit` issue; reopens on a user report or a trace that shows the gap on a supported path.
- D5. The balance update path goes through `mapRow` in the composable (chosen) over a TokensView wrapper (D), since the composable's `mapRow` rule is where adds and updates disagree.

## Audit verdicts

| Round | Reviewer | Verdict | Findings and dispositions |
|---|---|---|---|
| 1 | Codex gpt-6.1-sol high | changes-required | (1) the balance update path drops the flag: accepted, demonstrated; fixed in the composable (D5), not the wrapper Codex offered. (2) I1 overstated: accepted; I1 qualified, D4 (c). (3) TokenList forwards the whole row: accepted; F4 and B corrected. (4) home-links proves no dot, e2e is possible with hooks: accepted; F7, I2, D3 narrowed. D4 (a) and (b) homes confirmed. |
| 2 | Codex gpt-6.1-sol high (resumed) | approve | No new material finding. D5 verified: "writes it as received" documented behaviour preserved through the extraction, not an invariant; callers without `mapRow` are unchanged. |
| diff 1 | Codex gpt-6.1-sol high + one Opus 5.5 review | clean (Codex); one finding (Opus) | Opus: the balance-update test never checked the update reached the row: accepted, it now asserts the card's `publicBalance` too. |
| diff 2 | Codex (resumed) | clean | Verified the test fix; no regression. Loop converged. |

## Seeds (not run; orchestrator-owned)

```
/goal Phase 1 marked ✓ in implementations-plan/fixes-1.2.0-1/plan.md, its validation gate reported passing in the transcript; LESSONS_FILE=implementations-plan/fixes-1.2.0-1/lessons/phase-1.md printed; /code-review NOT run (code_review: off); the Codex fix loop over the whole diff converged, evidenced by a resumed pass with no new material finding quoted in the transcript; one PR to dev exists (gh pr view output), opened after the loop, carrying the close-out that archived the plan (git show --stat of the archive-move commit); bun run test and bun run lint both exit 0 in the transcript.
```

```
/loop 15m Drive implementations-plan/fixes-1.2.0-1 forward per the blueprint /loop template with <plan>=fixes-1.2.0-1, <trunk>=dev, <test>=bun run test, <lint>=bun run lint; the plan's Approval boundary and Post-implementation section bind every firing.
```
