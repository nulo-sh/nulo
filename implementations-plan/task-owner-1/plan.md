---
plan: task-owner-1
tier: mid
status: delivered (one PR against dev, merge pending)
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); dual review (Codex gpt-6.1-sol high + Opus Plan); one fresh final Codex pass; at most two in-process agents at once; one Codex consult at a time
base: origin/dev at 9c913679b
trunk: dev
post_implementation_hardening: not scheduled
---

## Outcome

- **Date:** 2026-11-24.
- **Status:** delivered as the single PR against `dev`, with this close-out as its final commits; it closes no issue and merges on the orchestrator's word.
- **Shipped:** `TaskService.startNewTask` / `createNewTask` take the owner profile first and insert a root only for the registry's own profile; any other owner receives a `RefusedTask` that emits nothing and whose lifecycle does nothing. Subtasks go through `startSubtask` / `createSubtask(parentId, …)`, which always resolve the parent. Every creator passes the profile its fence, row or network names (`batchOwner` for a batch with no fence); the balance queue keeps no refused id; the coordinator's step wrappers run untracked without a parent; task ids carry 64 random bits. `task/root-task-creators.test.ts` pins the seven creator files and refuses a literal `undefined` owner. No visible change.
- **Dispositions:** D1-D12 as the ledger records (D8's start-up reorder dropped). Arc review: Codex approve; Opus diff review, three points accepted (one test regained its failure mode, two comments corrected). The `action_operations` digest of `auth-registry/service.ts` re-attested and re-pinned.
- **Known limits:** none filed from this lane; the boundaries the Security section and D10 state stand.
- **Open items:** none.
- **Lessons:** none promoted; the vacuous-test point is the existing success-control line in `lessons.md`.
- **Seeds retired:** the `/goal` and `/loop` seeds below; never run them.

# task-owner-1: every root task names the profile it belongs to

Recon: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). Build log: [lessons/phase-1.md](lessons/phase-1.md), [lessons/phase-2.md](lessons/phase-2.md).

One arc, one PR against `dev`, no stack. Paths are under `apps/extension/src/wallet/services/` unless they say otherwise.

## Outcome & Quality Bar

**For whom.** A person with two or more profiles on one device who switches profile while an operation of the first profile is still running; and the maintainer who adds the next task creator.

**What excellent looks like.**
- The task registry holds only its profile's tasks at every moment: a root task created for any other profile never enters it and emits no event.
- One place decides (`TaskService`). A creator cannot leave the owner out: typecheck refuses a call that does not name one, and a scan refuses the literal `undefined`.
- A refused root changes nothing else: the creator's code runs on and ends as its own fence says, records nothing, throws nothing new and logs nothing about the other profile.
- No screen, copy or layout changes; inside one profile the registry fills as on the base, start-up included.

**Good enough.** No e2e scenario is added: the rule is a synchronous check that unit tests prove at the boundary, and the existing profile-switch network spec reruns as a no-regression check.

## Assumptions

**Facts** (verified at `9c913679b`; recon.md has the rest):
- F1. `TaskService` keeps the registry's profile in `profile` (`task/service.ts:39`), pulls it at start (`:49-52`) and clears every task when a different profile becomes active (`:268-276`); a lock leaves `profile` set, so a lock and an unlock of the same profile keep its tasks (pinned in `task/service.test.ts`).
- F2. Root creation is `createNewTask(content, parentId?, origin?)` and `startNewTask(content, parentId?, origin?, walletTraceId?)` (`task/service.ts:106,118`); each emits `onTaskCreated` (`:90`).
- F3. A new session is published and `onActiveProfileChanged` runs in one synchronous block (`profile/session-manager.ts:329-336`), and `TaskService`'s handler has no await.
- F4. Fourteen root-creation sites exist (recon.md table). Each holds its profile when it creates, except the coordinator's three step wrappers (none in scope) and the RPC form of `executeOperations` (no fence).
- F5. Every production caller of the coordinator's three step wrappers (`execution/execution-coordinator.ts:261,287,325`) passes a parent (recon.md).
- F6. `startBatchTasks` (`token-balance/balance-job-queue.ts:271`) runs before `syncBatch`'s try (`:246-248`).
- F7. `classifyOperationCatch` (`execution/rpc-cancel.ts:86-92`) calls `task.fail` / `task.cancel`, which throw `Invalid task id` on an id the registry lacks.
- F8. No creator runs before `TaskService` has read its profile, although `ExecutionService` and `AuthRegistryService` start in an earlier phase (recon.md, "Start-up order"): a page's calls wait for Ready, which the background posts only once the whole collection has started (`packages/extension-messaging/src/background/service.ts:58-80`); dApp calls are wired after `services.start()` (`apps/extension/src/wallet/runtime.ts:287,307`); neither service's `init` creates a task or starts work that does; `TokenService` and `TokenBalanceService` start after `TaskService`.
- F9. Task ids are 8 random hex characters drawn against the live map (`task/service.ts:62`); a dApp interaction id already uses 16 (`dapp-interaction/service.ts:683`). The incoming-transfer outbox stores one as `pendingTaskId` (`incoming-transfer/spec.ts:286,297`, a plain string) and resolves it through `TaskService` (`incoming-transfer/balance-outbox.ts:98-99,173-185`).
- F10. The reproducer (Phase 1, step 1) fails at `9c913679b`; its control passes.

**Inferences** (challenge these):
- I1. No profile-change subscriber creates a root before its first await, so a creation after a switch sees the new `profile`. Read for every background subscriber (`git grep onActiveProfileChanged.add`): `execution/service.ts:355,625`, `incoming-transfer/service.ts:460`, `network/service.ts:249`, `price/service.ts:169`, `token-balance/service.ts:165` (awaits `getTokensRaw` first), `token/service.ts:235` (the seeder awaits before it parses), `wallet-sdk/background.ts:394`, `wallet-sdk/profile-switch-teardown.ts:91,124`, `wallet-sdk/verification-hold.ts:145`.
- I2. No page calls the RPC form of `executeOperations` (`git grep executeOperations` under `apps/extension/src` outside `wallet/services`: none).
- I3. No surface renders a root step (recon.md, "Registry readers"), so a step that runs untracked without a parent is invisible.

**Asks** (working assumption in brackets; the orchestrator may overrule):
- A1. ["The registry's profile" means the active profile, or the last one before a lock, as the clear already defines it (F1).] A rule of "an unlocked session right now" would also refuse an operation that started before a lock and ended after it, so its own profile would not see its failed task after the next unlock: a visible change inside one profile.
- A2. [No visible change; the PR says "No visible change." and carries no frames.]

## Architecture & Implementation

**Shape.** The owner is checked at insertion, in `TaskService`, against the profile the registry already tracks. Root creation and subtask creation split into two pairs of methods: a root names its profile; a subtask needs none, because its parent is in the registry only while the registry holds the parent's profile.

```ts
// task/service.ts. Owner first: no call written for the old signature typechecks.
startNewTask(owner: string | undefined, content: ITaskContent, origin?: TxOrigin, walletTraceId?: string): WrappedTask
createNewTask(owner: string | undefined, content: ITaskContent, origin?: TxOrigin): WrappedTask
startSubtask(parentId: string, content: ITaskContent, origin?: TxOrigin): WrappedTask   // used by WrappedTask
createSubtask(parentId: string, content: ITaskContent, origin?: TxOrigin): WrappedTask  // used by WrappedTask
```

- The check, in one private `createRoot`: insert only when `owner !== undefined && owner === this.profile`; otherwise return a `RefusedTask` and emit nothing. `undefined` is allowed in the type only for the RPC form of `executeOperations` with no profile unlocked (I2).
- The subtask methods always resolve `parentId` and throw `Invalid task id` when it is absent, `""` included; they never fall back to a root.
- Task ids grow to 16 hex characters (F9): 64 random bits, so an id a stale handle or the outbox holds is improbably reissued to another profile's task after a clear. A longer string changes no stored shape; outbox rows written before keep their 8-character ids.
- **What the owner means.** The profile that the creator's fence, row or network names. A creator that takes its fence when its RPC arrives names the profile active then.

**The refused handle.** `RefusedTask extends WrappedTask` (`task/wrapped-task.ts`): id `""` (no registry id is empty), `exists` false; `start`, `complete`, `completeIfTracked`, `fail` and `cancel` do nothing; `createSubtask` / `startSubtask` return a refused handle; `task`, `status` and `isFinished` throw as for any absent record. So the creator runs unchanged to its own fence check, its catch records nothing and rethrows that check's error, and `executeOperations` still returns the fence's `SessionEndedError` result (F7 would turn it into `Invalid task id`). The balance queue keeps a refused id nowhere (`if (task.exists)` before it stores one), so it skips that row's result and clears nothing it never held. A handle the registry dropped after creation keeps today's behaviour.

**Owners per site** (recon.md has the evidence):

| Site | Owner passed |
|---|---|
| `auth-registry/service.ts` `revokeAuthwits`, `setRegistryEnabled` | `fence.profileId` |
| `auth-registry/service.ts` `checkRegistry` | `scope.profileId` |
| `execution/service.ts` `executeOperations` | `authorizedFence?.profileId`; with no fence and no parent, the active profile read once at entry, before the Terms check (`getActiveProfile()`, `undefined` when locked): the profile the batch was admitted under |
| `execution/transfer-executor.ts` `execute` | `fence.profileId` |
| `execution/fee/fee-strategy.ts` `startEstimateTask` | `ctx.fence.profileId` |
| `execution/tx-request-builder.ts` `buildStandard`, `buildNoFrom` | `fence.profileId` |
| `token/service.ts` `parseTokenInterface` | a subtask starts at once, as today; a root takes `network.profileId` from a network read before it, so only the invisible root starts later |
| `token-balance/balance-job-queue.ts` `enqueue`, `startBatchTasks` | `balance.profileId`, `tb.profileId` |
| `execution/execution-coordinator.ts` three wrappers | none: the root branch goes, and with no parent the step runs untracked (`parentTask?.startSubtask`, as `transaction/service.ts` `waitForTx` does), since every production caller passes one (F5) |

**Data and control flow** (the traced case). A revoke captures A's fence and awaits its reads. The person switches to B: `profile` becomes B in the same tick (F3) and the registry clears. The revoke calls `startNewTask(fence.profileId, content)`; `"A" !== "B"`, so `TaskService` returns a `RefusedTask` and emits nothing. The revoke continues to its send, whose fence check fails with `SessionEndedError`; its catch calls `task.fail` (a no-op) and rethrows that error to A's caller.

**File-level change map.**
- `task/service.ts`: the four creation methods, `createRoot`, 16-character ids. `task/wrapped-task.ts`: the subtask calls, `RefusedTask`.
- The owner sites and the coordinator wrappers above; the balance queue's two `exists` guards. In `token/service.ts`, at least one unchanged line stays between this edit and the `wallet-followups-9-decimals` hunks; in `auth-registry/service.ts`, edits stay inside the three creators (recon.md, Collisions).
- Tests: `task/service.test.ts` moves subtask calls to the subtask methods and passes owners; `fee/strategies-lifecycle.test.ts` and `transaction/service.test.ts` build their registry through `startedTaskService`; every test that calls a real root method gains the owner; the balance queue's test doubles that return a handle expose `exists: true` (`balance-job-queue.test.ts`, `balance-job-queue.order.pins.test.ts`, `purge-commit-race.test.ts`, `token-balance/service.test.ts`). New `task/root-task-creators.test.ts` (Phase 2).

**Alternatives not taken.** The decision ledger below records each with both reviewers' views.

## Security & Adversarial Considerations

- **Threat model.** Two local profiles on one device. The invariant: one profile's popup never receives another profile's task content (transfer parties and amounts, revoked row keys, a dApp's name and method, an error's text), across a profile switch during an operation's awaited work included. No dApp reach, no key, no funds.
- **What the change guarantees.** At insertion the owner equals the registry's profile, and the registry clears on every change to another profile; no creator runs before the registry knows its profile (F8); a stale handle's id is improbably reissued (F9). Together, the registry and its events hold one profile's tasks. A subtask inherits this from its parent's presence.
- **What it does not cover.** Which profile composed an RPC's arguments: the owner is the profile active when the creator takes its fence. A caller that reached a creating service before the collection started would have its root refused (fail-closed); the wallet has none (F8). Updates through a handle the registry dropped go nowhere and throw, as today. Request-log stages for a refused dApp root are not recorded (the stage belongs to the other profile).
- **Logging.** A refusal logs nothing (logging-policy skill).
- **Input validation, crypto, supply chain, least privilege.** No new input, cryptography, dependency or permission.

**UI impact.** None. No surface renders a root step (I3). Inside one profile the registry fills as on the base, start-up included; a coordinator step with no parent, which no production path creates, is untracked.

## Phase 1: the ownership rule and its owners ✓

1. Write the reproducer in `auth-registry/service.test.ts`, beside the real-registry revoke test: a revoke starts under `p1`; the profile switches to `p2` while `revokeOperation` is awaited; the revoke finishes. Assert `tasks.getTasks()` is empty and `onTaskCreated` never fired; the control (no switch) has one completed revoke task. Run it at the base and record the red in `lessons/phase-1.md`.
2. Add the four creation methods, `createRoot`, `RefusedTask` and 16-character ids.
3. Pass the owner at every site in the table; add the balance queue's `exists` guards; remove the coordinator's root branch.
4. Add the tests in `task/service.test.ts`: a root for the registry's profile is inserted and emits (success control); one `test.each` over the refused classes (another profile; no owner with a registry profile; no owner before any profile; an owner before any profile), each inserting nothing and emitting neither `onTaskCreated` nor `onTaskUpdated`; a refused root's lifecycle calls throw nothing, emit nothing, and its subtask is refused; a subtask of a tracked root is inserted; a subtask under an absent parent (stale, or `""`) throws, inserting and emitting nothing.
5. Add two tests at their consumers: `classifyOperationCatch` given a `SessionEndedError` and a refused task returns the failed result with its code and throws nothing (`execution/rpc-cancel.test.ts`); a balance batch with a refused row and a row of the registry's profile completes the second, calls no task method for the first and clears both pointers (`token-balance/balance-job-queue.test.ts`).

**Validation gate.**
- Commands: `bun run lint`; `bun run typecheck:all`; from `apps/extension`, `bun --bun vitest run src/wallet/services/task src/wallet/services/auth-registry src/wallet/services/execution src/wallet/services/token src/wallet/services/token-balance src/wallet/services/transaction src/wallet/request-captures.reach.test.ts`.
- Pass criteria: all exit 0; the reproducer is red at `9c913679b` and green here; its control is green on both.
- Layers: lint, typecheck, unit, composition.

## Phase 2: the scan, the suites, the no-regression run ✓

1. Add `task/root-task-creators.test.ts`, shaped like `utils/toast-call-sites.test.ts` with `callsTo`: the files outside `task/` that call `startNewTask` / `createNewTask` are exactly the reasoned-about set; no call passes the literal `undefined` as its owner; a self-test on an inline snippet. Its header says what it cannot see, as the toast scan's does: an owner read from the wrong source passes it, so the behavioural tests stay the proof.
2. Run the full local gates and the network spec.

**Validation gate.**
- Commands: `bun run lint`; `bun run typecheck:all`; `bun run audit:vue`; `bun run test:all`; from the root, `NODE_OPTIONS=--dns-result-order=ipv4first NULO_E2E_PROVERLESS=1 bun run e2e:agent tests/e2e/network/profile-switch-sweeps-transfer.test.ts` at retry 0.
- Pass criteria: all exit 0. The scan fails when one owner is replaced by `undefined` (checked once by hand, then reverted).
- Layers: lint, typecheck, unit, component, composition, network e2e on Chrome. Firefox is not run: no message handling, focus, window or session lifetime changes.

## Decision ledger

| # | Question | Chosen | Rejected, and why | Views |
|---|---|---|---|---|
| D1 | Where the owner is checked | At insertion in `TaskService`, against `profile` | An owner field on `Task` filtered by every reader and event: grows the record the popup receives and adds a filter to five readers | Codex and Opus agree |
| D2 | Owner type | A profile id, from the fence, row or network the creator holds | An `ExecutionFence` checked with `isFenceLive`: four creators hold no fence, and a fence is per session while the registry is per profile (A1) | both agree |
| D3 | Signature | Owner first, `string \| undefined` | Owner second: the two calls that pass `undefined` as `parentId` today keep compiling and would refuse every transfer and dApp root | Opus raised, Codex agrees |
| D4 | What a refused creator receives | `RefusedTask` (no-op lifecycle) | Throw: drops a balance batch (F6) and needs a catch in every creator. `undefined`: changes fourteen sites and every use after them. A plain handle with an absent id: `executeOperations` would reject with `Invalid task id` (F7) | both agree |
| D5 | The coordinator wrappers | Drop the root branch | Thread an owner into the prove context and simulate callback for a branch no production path runs; require a parent by type (about 45 test call sites) | both agree |
| D6 | Competing outline: steps are never roots | Not taken; adopted only for the coordinator | Drops the estimate and token-parse root steps that exist today, beyond this change's purpose, and puts `task?.` in every fee strategy | both agree |
| D7 | Token parse | Root branch reads the network first; a subtask starts at once | Moving the read before both: a parented step's label would show later under a running execution | Codex raised, Opus agrees the root move is invisible |
| D8 | A root created before `TaskService` reads its profile | No start-up change: no entry reaches a creator that early (F8), and a refusal there would hide a task, never show another profile's | Declaring `TaskService` in each creating service's `dependencies` (S4): reorders two services' start for a caller the wallet does not have. A synchronous profile read at insertion (S2): `TaskService` holds no profile service before its own `init`, and making it whole needs constructor binding and reconciliation | Opus raised the window; round 2 took S4; the final pass pointed at the Ready handshake, the lead traced every entry (F8), and Codex then approved dropping it |
| D9 | Ids a stale handle or the outbox holds | 16-character ids (64 bits; reissue improbable) | Keep 8 and accept the reissue: a subtask label can carry a row id, a stale handle carries its origin and can write an error's text. Bind handles to the task object: changes the handle's contract and leaves id-based readers as they are | Codex raised the content and the stored id; the final pass approved 16 as proportionate |
| D10 | Which profile composed an RPC's arguments | Out of scope; the plan states what the owner means | Capture earlier at RPC entry: narrows one await, cannot prove which popup composed the request; a popup-held fence on the send RPC is a public contract change | both agree |
| D11 | Smallest local step (check the held fence before the one traced call) | Not taken | Leaves every other creator as it is; the owner asked for the fix | both agree |
| D12 | Tests | One `test.each` over refused classes, one success control, consumer tests for the two id-based paths, the scan | A coordinator no-parent test and a scan call-count floor: the scan's exact file set already covers both | Opus raised, accepted |

## Review verdicts

- Round 1, Codex (gpt-6.1-sol, high): conditional approve. Accepted: D7; subtask parents always resolved; the balance and `classifyOperationCatch` consumer tests; the no-fence owner read at entry; the scan states its limit. Its id-reuse point became D9.
- Round 1, Opus (Plan): conditional approve. Accepted: D3; the start-up gap (D8); the balance queue keeps no refused id; D12; two tests move to `startedTaskService`; recon's transfer row corrected (its window became D10); I1 lists every subscriber; the no-fence read only with no fence and no parent.
- Round 2, Codex (resumed): conditional approve, conditions: take S4 or make S2 whole; correct the id-reuse reasoning (D9).
- Final fresh Codex pass: conditional approve, conditions: correct F9 (the outbox stores a task id) and D9's wording; the balance queue's test doubles expose `exists`; cover start-up; refused tests also assert no `onTaskUpdated`. Resumed with the Ready-handshake trace (F8): **approve**, D8 dropped and the start-up coverage withdrawn with it.
- Arc 1, Codex (gpt-6.1-sol, high, one pass over the plan and the diff): **approve**, no actionable point.
- Arc 1, Opus diff review: conditional approve; three points accepted (one pull test regained its failure mode, two comments corrected). Log: `lessons/phase-2.md`.

## Delivery

- Branch `task-owner-1-a1` off `origin/dev` after `git fetch`; the plan commit is cherry-picked onto it.
- One PR against `dev`, titled `fix(tasks): a task names the profile it belongs to, and joins only that profile's list` (79 characters). The body states the change and the invariant, the validation runs with outcomes, and "No visible change."; it closes nothing.
- Opened ready only after the local gates pass and the review below converges; no label at creation; `e2e:extension-network` added afterwards only if the path filter skips the network lane.
- Close-out rides on the PR as its final commits.

## Post-implementation

Execution contract: this plan plus `implementations-plan/README.md` § Post-implementation standard at `9c913679b`. Plan-specific parts:

- Step 1 (diff review): absent (`code_review: off`).
- Step 2: bounded work, so one Codex pass (`~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`) over this plan and the whole diff from `9c913679b`, with the adversarial ask and the two verbatim rules, then targeted verification of each material fix; then one Opus diff review (`Agent`, `model: "opus"`, `general-purpose`). Log both in `lessons/phase-2.md` and here.
- Step 3: `gh pr create`, then `gh pr checks <n> --watch`; a known flake gets one rerun.
- Step 4 (close-out, the PR's final commits): merge `origin/dev` in and read `index.md` and `lessons.md`; the Outcome block; lessons promoted if any generalize; `STATUS.md` deleted; `git mv` into `archive/` in its own commit, the index line moved to `archive/index.md`; `bun run check:plans` green. Every commit is pushed before the report; nothing is committed after the last push.
- Step 5 (teardown): once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/task-owner-1/plan.md` succeeds, `agent-worktree done task-owner-1 --merged`. The orchestrator's session notices the merge.

## Seeds

```
/goal Phases 1-2 of implementations-plan/task-owner-1/plan.md marked ✓, each gate reported passing in the transcript; one Codex pass and one Opus diff review logged with their verdicts; the PR exists on GitHub (gh pr view output), opened after both; its close-out archived the plan (git show --stat of the archive move); bun run lint and bun run test:all exit 0.
```

```
/loop 15m Drive implementations-plan/task-owner-1 forward from plan.md and lessons/ (the authoritative state). Run the next unmet phase gate; on red, fix the cause, never loosen an assertion. When both phases are ✓, run the Post-implementation section once, open the PR, watch checks, report and stop. Never merge.
```
