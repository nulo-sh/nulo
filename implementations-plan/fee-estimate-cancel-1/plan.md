---
plan: fee-estimate-cancel-1
tier: light
status: planned, Codex approve (round 2); arc 1 next
issues: "#989 (arc 1)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); one Codex audit round-trip (gpt-6.1-sol high) plus one Opus Plan leg
base: origin/dev at b3d6e0a2a
trunk: dev
post_implementation_hardening: not scheduled
---

# fee-estimate-cancel-1: an approval ends the window's unfinished fee estimates

One arc, one PR against `dev`, `Closes #989`. No screen changes.

**Invariant:** once the worker accepts an execute approval, the window cancels every estimate and preview it did not hand over and closes only after the worker has handled those cancels (or after 3 s). An estimate the cancel finds admitted stops at its next check; one admitted after it finds its request gone and never simulates; no strategy build that ends after the abort is simulated. A simulation already running or queued runs to its end.

## Outcome & Quality Bar

- **For whom:** a person who confirms a dApp's first transaction from a new account while its fee estimate is still running (Confirm does not wait for a sponsor's figure), most often on Firefox.
- **Excellent:** (1) after Confirm the PXE runs no estimate simulation queued behind the send: in a Firefox run of `authwit-lifecycle`, the node sees no public simulation between the first grant's arrival and the next step, and no rejected one; (2) the window looks and closes as today.
- **Good enough:** the estimate's simulation already running at Confirm still runs; a PXE simulation cannot be preempted.

## Assumptions

**Facts** (recon.md has the evidence)
- F1 No code unmounts the popup app; `closeWindow(true)` removes the window with `chrome.windows.remove`, so the engine's `dispose()` and the window's `onUnmounted` never run on an approval (`index.vue:600-604`, `close-current-window.ts:2-5`).
- F2 `approve()` hands over completed estimates only (`index.vue:470-471`) and sends no cancel.
- F3 `dispose()` clears the timers, remote-cancels every started run and every completed token not handed off, and makes every later settle stale, firing no sink (`fee-estimation-engine.ts:182-190`, pinned at `useFeeEstimationMap.test.ts:72`). It is fire-and-forget, and `schedule()` still runs after it.
- F4 An awaited `cancelEstimate` resolves after the worker's registry handled the cancel. It aborts only an admitted entry of the active profile; a locked wallet, a foreign token or a token not yet admitted is a silent no-op (`service.ts:732-737`, `estimate-cancel-registry.ts:197-217`).
- F5 The fast path checks the signal before its rebuild only (`fpc-strategy.ts:178`); the rebuild of a first transaction calls the PXE and the node (`nulo-account.ts:166-170`) before the validated simulation (`:181`). Likewise `fpc-strategy.ts:244, 255` and `fee-juice-strategy.ts:47`.
- F6 `approveInteraction` deletes the stored request before it starts execution (`dapp-interaction/service.ts:260-270`); every estimate and preview reads it again (`materializeStoredDraft`, `:468`) and throws "Invalid id" once it is gone.
- F7 `estimateOperationFee` and `previewOperationAuthwits` materialize the operation before admission (`execution/service.ts:796-816`). A cancel handled in that window is lost: a scratch script on the real registry (`cancel("t1")` then `admit("t1")`) admits an unaborted entry (`lessons/phase-0.md`).

**Inferences**
- I1 *#989's mechanism does not hold as written.* By F1 the approval path sends no cancel on either browser, so no message is lost. By F6 an estimate whose request read comes after the worker accepted the approval cannot simulate; the boundary is the acceptance, not the click. One timing difference fits the data: Chrome's estimate had landed and the send reused it, while Firefox's, slower, was still running and went on to its rebuild and validated simulation. Moderate confidence; R1 checks the outcome, not the cause.

**Asks** (none for the owner; each settled by the panel, see the ledger)
- A1 Where and when the cancel happens (D1, D2). A2 How long the close waits, and whether that is a UI change (D3).

## Architecture & Implementation

- **Window** (`popup/windows/execute/index.vue`, `approve()`): after `approveInteraction` resolves, start both maps' `dispose()` (`estimatesEnded`), run `scopeFollow.follow` as today, then `await endAndClose(() => estimatesEnded)` in place of `closeWindow(true)`. Both maps' `cancelRemote` return `executionService.cancelEstimate(token).catch(() => {})`. A refused approval disposes nothing: the catch path and `rearm` are unchanged. `useDappApprovalWindow.ts`: `endAndClose`'s doc names any acknowledgement, not only the window's end.
- **Engine** (`composables/internal/fee-estimation-engine.ts`): `cancelRemote?: (token) => void | Promise<unknown>`, documented as never rejecting; `dispose(): Promise<void>` settles once every promise its remote cancels returned has settled (`Promise.allSettled`), and a repeated call returns the first call's promise. `schedule()` returns at once on a disposed engine. `useFeeEstimationMap` widens `cancelRemote` and types `dispose: () => Promise<void>`; `useFeeEstimation` and `useWalletTxEstimates` keep their `void` types.
- **Worker** (`wallet/services/execution/service.ts`): `estimateOperationFee` and `previewOperationAuthwits` materialize inside `withEstimateAdmission`'s run, so a token is admitted before its request is read. Then every order of approval, admission and cancel ends the estimate: admitted before the cancel, it is aborted; admitted after, its materialization meets the deleted request (F6). No new state.
- **Strategies** (`execution/fee/fee-strategy.ts`, `buildFor`): after the build and `ctx.onBuilt`, `throwIfAborted(ctx.signal)` (`execution/rpc-cancel.ts:60`). This closes the during-build gap on every strategy; the checks before each rebuild stay, since they spare the rebuild. The send path passes no signal.
- **Flow:** Confirm → hand over completed estimates → `approveInteraction` (request deleted) → dispose (timers cleared; started runs aborted locally and cancelled remotely) → scope follow → close once the worker has handled the cancels, or after 3 s.

## Security & Adversarial Considerations

- **Threat model:** the dApp supplies the operations, not the estimate tokens; the window mints the tokens and the registry gates every cancel on the active profile (F4). No new input crosses a trust boundary; no new RPC, permission, dependency or log line.
- **Commit point unchanged:** the worker's acceptance stays the commit point and the cancel follows it, so a refused approval leaves every estimate as today, and a handed-over estimate (the stash the send reuses) is never cancelled.
- **Resource use:** the attacker-relevant target is the PXE queue; the fix only removes work from it. Admission before materialization holds a slot for the length of a storage read, inside the existing per-profile cap.
- **Liveness:** a wedged worker cannot hold the window open longer than the Reject path's 3 s bound.

## UI impact

None, per the lane brief: "The fee card, the Confirm button and every copy stay as they are." Dispose fires no sink, so the window keeps its state until it closes. The close now waits for the worker's answer to the cancels: one message round trip, at most 3 s with a worker that stalls right after accepting the approval (D3).

## Phases (arc 1, branch `fee-estimate-cancel-1-a1` off `origin/dev`, this plan's commit cherry-picked first)

### Phase 0: base measurement ✓
- Before any code change, run R1 (Phase 3) on the arc branch.

### Phase 1: the engine's dispose is awaitable and terminal ✓
- `fee-estimation-engine.ts` and `useFeeEstimationMap.ts` as above; doc comments state the contract in one sentence each.
- Tests, `useFeeEstimationMap.test.ts`: T1 `Promise.resolve(dispose())` stays pending while the in-flight token's remote cancel is held and settles once it is released; a rejecting cancel still lets it settle; a second `dispose()` returns the same promise. T2 `estimate()` after `dispose()` never calls the estimator and leaves `estimating` unchanged (control: the existing tests run it before dispose).
- **Validation gate:** `bun run --cwd apps/extension test src/composables` all pass; with the base engine copied in place T1 and T2 fail on their assertions, then restore; `bun run lint` exit 0. Layers: lint, unit.

### Phase 2: the approval ends the estimates, which stop ✓
- `index.vue`, `useDappApprovalWindow.ts` (doc), `execution/service.ts` and `fee-strategy.ts` as above, each change with a one-sentence comment stating the invariant it keeps.
- Tests, `execute/index.test.ts`: T3 an accepted approval calls both maps' `dispose` after `approveInteraction` resolves and calls `windows.remove` only after both promises settle; and, for both instances, the captured `cancelRemote("t")` stays pending while `cancelEstimate` is held and settles after it. T4 a refused approval calls no `dispose` (added to the existing refused-approval case). Worker, a test on the real registry in the shape of `estimate-hold.integration.test.ts`'s harness: T5 `test.each` over `estimateOperationFee` and `previewOperationAuthwits`: a cancel handled while the operation is still materializing reaches the executor as an aborted signal; a cancel handled before admission, with the request deleted, rejects at materialization, the executor never called and the registry's unsettled count back to 0; control, no cancel: the signal is live. `fee/strategies-lifecycle.test.ts`: an `abortOnBuild: n` harness option; T6 `test.each` over the `FOLD_MATRIX` rows with two or more builds, abort during build 2: `JobCancelledSentinel`, one simulation, task `Failed`; and over the single-build paths, abort during build 1: no simulation (control: the matrix test).
- **Validation gate:** `bun run --cwd apps/extension test src/popup/windows/execute src/wallet/services/execution` all pass; with the base copy of `index.vue`, `service.ts` and `fee-strategy.ts` (each from `origin/dev`, one at a time) T3, T5's aborted-signal case and T6 fail on their assertions (T5's cancel-before-admission case passes on the base, a control), then restore; `bun run lint` and `bun run typecheck:all` exit 0. Layers: lint, typecheck, unit, component.

### Phase 3: the proof on both browsers, and the arc gate
- **Scratch instrument** (a patch under `~/.cache/nulo-backlog/fee-estimate-cancel-1/patches/`, applied for a run and reverted; never committed): `tests/e2e/global-setup.ts` tees the node's stdout and stderr to `$NULO_E2E_NODE_LOG` (a path under `~/.cache/nulo-backlog/fee-estimate-cancel-1/runs/`) with `LOG_JSON=1` and `LOG_LEVEL="info; verbose: node:public-calls-simulator"`; `authwit-lifecycle`'s `step()` prints `Date.now()`. Window W: from G1's `Received tx` line to the `G1 consume` stamp.
- **Runs**, each `cd <worktree> && NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/authwit-lifecycle.test.ts` at retry 0, one at a time in this worktree: R1 Firefox, base code (Phase 0), instrumented, `P2P_MIN_TX_POOL_AGE_MS=0` (where #989 reproduced in 3 of 3 runs); R2 the same on the arc head; R3 Chrome, arc head, default settings, no instrument. CI's network lanes run the whole suite on both browsers.
- **Pass criteria:** R1 shows at least one `Simulating public calls` line in W or a `Simulated tx … fails` line; if it shows neither, report the browser proof as inconclusive and rely on the unit layers. R2 shows no `Simulating public calls` line in W and no `fails` line; R2 and R3 green. Report each run's total G1 simulations (expected: R2 one fewer than R1) and wall-clock in `lessons/phase-3.md` and the PR body.
- **Arc gate:** `bun run lint`; `bun run typecheck:all`; `bun run test`; `bun run test:all`; `bun run check:plans` after staging; `git diff --exit-code -- apps/extension/tests/e2e` (no instrument left).

## Decision ledger

- **D1 The window ends its estimates.** It owns them (the engine's handoff model), and the approval is the last moment it can act. Rejected: the worker cancels a request's estimates when it accepts the approval (an index from request to tokens and a cross-service call for one caller); the worker cancels on a port disconnect (a messaging-layer abort for every RPC, beyond #989). Both legs agree.
- **D2 After the worker accepts.** Rejected: before `approveInteraction`: dispose is final, so a refused approval would leave dead estimates and need a re-schedule. Both legs agree.
- **D3 The close waits through `endAndClose`**, the Reject path's bounded wait (3 s). Rejected: an unbounded await (a wedged worker holds the window for the RPC default timeout). Codex and Opus each suggested telling the owner about the worst-case delay; not an owner ask: the lane brief prescribes the awaited cancel and its no-UI-change record, the common case adds one round trip, and the 3 s case needs a worker that answered the approval and then stalls. The 3 s bound starts at `endAndClose`, after the scope follow, which keeps its existing waits when the scope differs (`scope-follow.ts:47, 54`). The PR body states it.
- **D4 `dispose()` is the cancel**, made awaitable and terminal: it already excludes handed-over tokens and fires no sink (F3). Rejected: `cancelAll()`, which clears the fee card's figure and spinner; a new engine method that copies dispose.
- **D5 Admission before materialization** (Codex 1 and 3). The approval's own delete of the request does the work a cancel record would. Rejected: a record of tokens cancelled before admission in the registry (new state with expiry and token-reuse rules).
- **D6 The check sits in `buildFor`:** one line covers the four rebuild sites and every first build. Rejected: copies at the rebuild sites.
- **D7 Tests.** No composition test: `tests/COMPOSITION-TESTS.md` D2, D3 and D6 forbid a simulation, a built request and bb, and no harness mounts a window over the worker. Each link has its own layer (T1-T2 engine, T3-T4 window, T5 worker, T6 strategies); the e2e runs confirm the whole. No new e2e file: `authwit-lifecycle`'s first grant already drives the path, and its count is a measurement. T4 of the first draft (the 3 s bound) is dropped: `useDappApprovalWindow.test.ts:248` pins it.
- **D8 Known limits** (plausible but unverified; the consequence is one wasted estimate run, no state change), filed at close-out as closed `known-limit` issues: KL1 a window ended by Reject or by its own close button posts its cancels without waiting for them (`index.vue:519-520`, the unload rejection), reopen on a run or report of such an estimate simulating; KL2 a cancel that lands during the embedded strategy's fee-cap read (`embedded-strategy.ts:44`) or the unfolded discovery build (`discovery-aware-estimator.ts:131-133`) still runs that one simulation, reopen on a run or report showing it.

## Review verdicts

- **Round 1, Codex (gpt-6.1-sol high, session 01a15da5): `conditional approve`.** Accepted: (1) an acknowledged cancel is not an effective one: F4 and the invariant restated, and the pre-admission case fixed (D5); (2) I2's ordering was unenforced: removed; (3) the pre-admission race is supported, so not a known limit: fixed (D5), and the close-button case filed apart (KL1); (5) the `cancelRemote` wiring had no test: T3 extended; the count window runs to the next step; R1 that shows nothing is inconclusive; (6) `buildFor` closes the during-build gap only: invariant narrowed, KL2. Rejected: (4) an owner ask for the close delay (D3).
- **Round 1, Opus Plan leg: `conditional approve`.** Accepted: (1) equal counts were the wrong criterion: R2 is judged on window W; (2) as Codex 5; (3) F6 added and I1 rewritten; (4) invariant narrowed, KL2; (5) F4; (6) T4 dropped, single-build rows in T6, T1 through `Promise.resolve`; (7) `throwIfAborted`, `cancelRemote` never rejects, D2's reason, `endAndClose`'s doc, `useWalletTxEstimates` named; (8) R1 before Phase 1, the clean-tree check, the log path, R4 and R5 dropped. Rejected: the OWNER-ASKS note (D3).
- **Round 2, Codex resumed: `approve`.** D5 holds across both ports, for parked entries and on the materialization error path; no test pins the old order. Accepted: I1's boundary is the worker's acceptance, not the click; T5 gains the cancel-before-admission order over both entry points; D3 states where the 3 s bound starts. D3 not reopened. Confidence: high on the source-level ordering, moderate on the browser outcome until R1-R3.
- **Arc review round 1, Codex (session 01a15dc9): `conditional approve`**, no production defect. Accepted, all low: T3 held the approval and runs both release orders; T1 compares the first `dispose()` promise; two comments trimmed.
- **Arc review round 1, Opus `general-purpose`: `approve`**, low findings, all accepted: a test that an approval whose cancels never answer still closes at `END_ACK_TIMEOUT_MS`; a rejecting `cancelEstimate` row; four comments (two docs naming callers or a stale cause); the Phase 2 gate's red-on-base claim narrowed to T5's aborted-signal case.

## Delivery

- **Arc 1** = Phases 0-3, one PR against `dev` (the orchestrator's D-orch-1: no stack), ready, not a draft. Title: `fix(execute): approval cancels the window's unfinished fee estimates before it closes` (84 characters). Body: what changed and why, I1 as a correction to #989, the close-wait note (D3), the validation runs with outcomes and `authwit-lifecycle`'s wall-clock per run, `Closes #989`. No label: the extension's source trips the e2e path filters.

## Post-implementation

Execution contract: this plan plus `implementations-plan/README.md` § Post-implementation standard at `b3d6e0a2a`. Plan-specific values:
- **Diff review:** `code_review: off`; the step is absent.
- **Review loop**, once over the arc diff after Phase 3: `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; the prompt carries the diff from `origin/dev`, this plan and its ledger, the adversarial ask and the README's two rules verbatim. One Opus `general-purpose` review of the same diff beside round 1. Hard stop at three rounds; log each in `lessons/phase-3.md` and under Review verdicts.
- **Delivery:** `gh pr create --base dev`, then `gh pr checks <n> --watch`; one rerun for a known flake. Never merge.
- **Close-out** as the PR's final commits: merge `origin/dev` and read `index.md` and `lessons.md`; KL1 and KL2 filed and closed (dedupe first); the `## Outcome` block with `Known limits:`; lessons only within the 8 KiB budget; delete `STATUS.md`; `git mv implementations-plan/fee-estimate-cancel-1 implementations-plan/archive/fee-estimate-cancel-1` in its own commit, index line moved to `archive/index.md`; `bun run check:plans` green after staging.
- **Teardown after the merge** (standing authorization): once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/fee-estimate-cancel-1/plan.md` succeeds, run `agent-worktree done fee-estimate-cancel-1 --merged`; relay a refusal, never force. A `/loop` session checks on every firing; a `/goal` session arms one background wait after its wrap-up report.

## Seeds (draft until approval)

```
/goal Arc 1 of implementations-plan/fee-estimate-cancel-1/plan.md done: Phases 0-3 marked ✓, each gate reported passing in the transcript; the Codex loop (gpt-6.1-sol high) converged on the arc diff, quoted; the PR open against dev (gh pr view output).
```

```
/loop 15m Drive arc 1 of implementations-plan/fee-estimate-cancel-1 per its plan.md (plan.md is the state). Next unchecked step, fast gates after each edit, signed commits. After Phase 3 run the Post-implementation loop, open the PR, watch checks, report and stop. Never merge.
```
