---
plan: unit-flakes-3
tier: light
status: completed (PR #1271)
issues: "#1122, #1244, #1198, #1215"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); one Codex audit round-trip (gpt-6.1-sol high) plus one Opus Plan leg
base: origin/dev at 78f5f9171
trunk: dev
post_implementation_hardening: not scheduled
---

## Outcome

- **Date:** 2026-10-27.
- **Status:** completed. One arc, PR #1271 against `dev`; its merge closes the plan.
- **Shipped:** `proveAndSend` checks the cancel signal after the `proving` mark, so a cancel that won the journal lock first stops the send before its proof (#1122); the same-tick re-ask case holds the slot its claim needs; the `clearChain` case clears with its tokens gone (#1244); the auth-registry tx-update handler returns its promise and its suite awaits it (#1198); the seeder retry case waits for the marker (#1215). Each touched file passed 30/30 at retry 0 on the final head, with one red control per fix ([lessons/phase-3.md](lessons/phase-3.md), [lessons/phase-4.md](lessons/phase-4.md)).
- **Dispositions:** #1122's "runner load" reading did not hold (F1, F2). The self-delivered abort was not built: it is an add-on to D1, and I1 holds. The type-roles digest re-pin (D8) was outside the plan's change map.
- **Known limits:** none.
- **Open items:** none.
- **Lessons:** none promoted. `lessons.md` holds 8183 of its 8192 bytes and nothing there is superseded; the gotchas are in [lessons/phase-0.md](lessons/phase-0.md) and [lessons/phase-4.md](lessons/phase-4.md).
- **Seeds retired:** the `/goal` and `/loop` seeds below are retired; this plan is a record, not a task list.

# unit-flakes-3: four races in unit and composition tests, one of them in the send pipeline

One arc, one PR against `dev`, closing #1122, #1244, #1198 and #1215. Recon: [recon.md](recon.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). Three causes are in test ordering; #1122's is in production code, and the issue's reading of it did not hold.

## Outcome & Quality Bar

- **For whom:** a contributor whose `quality-status` goes red on a change that touched none of these files; and a person who cancels a send while it waits behind an earlier one.
- **Excellent:** each touched file passes 30 of 30 runs at retry 0, and each fix removes the cause: no timeout, sleep, retry, `skipIf` or looser assertion. A cancel that wins the journal lock before the send's `proving` transition stops the send before its proof, proved by a test that reds on an assertion at the base commit; a cancel after that transition stays the mid-prove cancel, whose proof is dropped.
- **Good enough:** races nobody has observed in other files stay out of scope.

## Findings (each with its path)

- **F1 (#1122), demonstrated, production.** A send asks again; the person accepts; the send moves `pending → simulating`. The cancel's `transitionOperation(cancelled)` takes the journal lock before the send's `proving` mark. The mark is refused and swallowed (`markJournal` logs and returns), and `proveAndSend` has no cancel check between that mark and `proveTxTask`. Invariant broken: a cancel that wins the lock before the `proving` transition prevents the proof (a later cancel is the mid-prove cancel, `cancel-mid-prove` pins it). Consequence: the proof runs (minutes of BB.wasm in a browser) while the record reads cancelled, holding the slot so later sends wait; nothing is broadcast, because the post-prove check and the refused `submitting` write stop it. Evidence: CI run 40543798176 (`proveTx` called once) and runs 40139222310 / 40414519299 (`cancelled → proving` logged, then the proof gate waits forever because its `release()` came before `wait()`). A scratch reproducer (parked `cancelled` write, cancel started from `getAccountContract` after `simulating`) is red 1/1 at the base and green 10/10 with the Phase 3 checkpoint.
- **F2 (#1122), demonstrated, test.** The same-tick case asserts "never proved" in every order. If the cancel's first read comes back after the send's `proving` mark, the cancel is a mid-prove cancel: the proof is dropped, the record ends cancelled, nothing is sent, which is correct. A scratch run that slows the cancel's first `getOperation` until the gate is entered is red; Phase 3 shows the slot-held shape green (an earlier send still running).
- **F3 (#1244), demonstrated (CI run 40505435023).** `clearChain` wipes the scope, then the rebuild re-installs the public scan for `tokenA`, still listed by the stub, and its unawaited first poll writes a fresh cursor row. A real chain purge runs TokenService's subscriber first, so the rebuild lists no token on that chain.
- **F4 (#1198), demonstrated (loaded host).** The handler discards `reconcileFromTx`'s promise; the test waits 10 ms. Under load the reconcile has not written yet. The two never-happens cases pass vacuously for the same reason.
- **F5 (#1215), demonstrated (loaded host).** The test reads the marker once `persist` is called; `outcome: "seeded"` lands after `persist` resolves, a sealed read and a sealed write.

## Assumptions

- **Facts:** every line in [recon.md](recon.md) § Facts; the `submitting` arm relies on the ordering F1's fix relies on (the parked-cancel case at `service.composition.test.ts:762-781` pins it), and so does `markJournal(simulating); checkCancelled()` (`transfer-executor.ts:358-359`, `dapp-send-executor.ts:847-848, 955-956, 1012-1013`); no unit vitest config sets `retry` (the e2e configs do); both `commitSubmitting`s are strict transitions and `cancelled` is terminal (`packages/wallet-core/src/jobs/fsm.ts`), so no cancelled send is broadcast whatever the timing.
- **Inferences:** (I1) a refused journal move resolves after `cancelJob`'s abort: the cancel stored a sealed row, so the refused move's read decrypts, while the abort runs on microtasks once the cancel's write commits. Traced at `78f5f9171` for both executors (every controller is registered with no await before it: `claim-helper.ts:140-142,159-160`); the new F1 case reds if it ever breaks. (I2, hypothesis) Under CI load a later WebCrypto call can complete before an earlier one, which would explain the cancel's read losing to several sequential journal moves; F2 needs only that the cancel's first read can be late.
- **Asks:** none. No surface a person reads changes.

## Architecture & Implementation (branch `worktree-unit-flakes-3` off `origin/dev`)

### Phase 1: the two test-order fixes (#1244, #1215) ✓ (30/30 each; controls red)

- `apps/extension/src/wallet/services/incoming-transfer/service.scenarios.test.ts`, case `clearChain wipes the public cursor + outbox rows too`: boot with `makeTokenStub([tokenA])`; assert the seeded cursor and outbox rows exist; then `tokens.getTokensRaw.mockResolvedValue([])` before `clearChain`, with one comment line (a chain purge runs the token service's subscriber first), and `await flushPromises()` after it, as the sibling at `:3364` does, so a rebuild that re-installs the scan is caught.
- `apps/extension/src/wallet/services/token/seeder.status.test.ts`, case `accepted: counter reset, pass started…`: replace the `persist` wait and the read with `await vi.waitFor(async () => expect((await readMarker())[KEY]).toMatchObject({ attempts: 1, outcome: "seeded" }))`, then `expect(deps.persist).toHaveBeenCalledTimes(1)`.
- **Gate:** `bun run lint`; `bun run typecheck:all`; each file 30/30 (§ Delivery). Red controls, run once each and not committed: for #1244 the old case with a `flushPromises()` before its read; for #1215 the old read with `markers.set` held after `persist`.

### Phase 2: the reconcile handler returns its promise (#1198) ✓ (30/30; control red)

- `apps/extension/src/wallet/services/auth-registry/service.ts:154-156`: `onTransactionUpdated.add((tx) => this.reconcileFromTx(tx).catch(() => {}))`. Production behaviour is unchanged: `EventHandler.invoke` drops the promise.
- `apps/extension/src/wallet/services/auth-registry/service.test.ts`: the harness's `txUpdated` becomes `awaitedBus<unknown>()`; `emitTx` becomes `await h.txUpdated.dispatch(...)`; delete the "give its storage ops a beat" comment and the 10 ms sleep.
- **Gate:** lint; typecheck; the file 30/30. Control: with the old fire-and-forget handler, `dispatch` resolves before the reconcile and the `Proven + Success` case reds (run once, then revert).

### Phase 3: a cancel the journal took stops the send before its proof (#1122) ✓ (30/30 both files; [lessons/phase-3.md](lessons/phase-3.md))

- `apps/extension/src/wallet/services/execution/execution-coordinator.ts` `proveAndSend`: `ctx.checkCancelled()` right after `markJournal({ stage: "proving" … })`. Update the frozen-sequence doc and the proof-gate comment, which name the cancel checkpoints around the hold.
- `execution-coordinator.test.ts`: the order pins at `:103-117` and `:306-320` gain the new `checkCancelled`; the count-based throws at `:151`, `:168` and `:344` move one check later, and each asserts the step its name places it at was reached.
- `service.composition.test.ts`, new case beside the `submitting` one: park the `cancelled` write; start the cancel from `getAccountContract` once `simulating` is written; wait for the queued `proving` move on the `transitionOperation` spy; release; wait until the run settles or the gate is entered. Assert the gate was never entered, then release it; the run ends `JobCancelledError`, `proveTx` was not called, the stage is `cancelled`. At the base copy (taken from `78f5f9171`, per `lessons.md`) it reds on the gate assertion, not by timeout.
- Same file, the same-tick `test.each`, renamed `… while the send waits for the slot …`: take the slot with `h.lane.tryTakeSlot("p1", NETWORK.chainId)` after `asking` and assert it was granted; release it after `Promise.all`. One comment line: the resumed send cannot pass its accept before the cancel lands; a cancel after the `proving` transition is the mid-prove cancel. Assertions unchanged. Fix the stale header at `:405-408`: a transfer does contend the slot (`acquireTransferSlot`).
- Red controls, not committed, with the Phase 3 checkpoint applied: hold the cancel's first `getOperation`. Without the slot hold, release it once the gate is entered: red (`proveTx` called, the mid-prove order). With the hold, release it once the resumed send has queued behind the slot (`queued` written again after `pending`, or the `acquireTransferSlot` spy called); green with no wait reaching its deadline.
- **Gate:** lint; typecheck; `execution-coordinator.test.ts` green; `service.composition.test.ts` 30/30; the new case red at the base copy.

### Phase 4: whole-suite gates ✓ ([lessons/phase-4.md](lessons/phase-4.md))

- `bun run test` and `bun run test:all`, both green at retry 0; `bun run check:plans` after staging plan files.

### Alternatives not taken

- F1, a self-delivered abort: both `markJournal`s would also abort their controller on a refusal from `cancelled`. It is an add-on to D1, not a replacement (`proveTxTask` reads no signal), it makes the executors a second abort owner against the lane's write-first, abort-second rule, and I1 holds; the answer if a red F1 case ever shows I1 broken.
- F1, rethrow a refused progress mark as `JobCancelledSentinel`: the same closures write `failed` in catch paths, so a cancel would replace the caller's error there.
- F2, assert `sendTx` not called instead of `proveTx`: drops the "never proved" claim the case exists for.
- F3, assert a fresh row instead of none: tests the re-index, not the wipe, from a state a purge never reaches.
- F4, call the private `reconcileFromTx` directly: loses the subscription; `vi.waitFor` on state: vacuous for the never-happens cases.
- F5, `settleSeals()` before the read: misses the sealed operations the pass starts after it.

## Security & Adversarial Considerations

- **Threat model:** no trust boundary changes; nothing a dApp reaches changes. `cancelJob` and `acceptQueuedFee` keep their ownership gate; the new check reads the send's own signal. Past `submitting`, `cancelJob` is refused and aborts nothing, so the new check never stops a send that may be on chain. F1's window let no broadcast through: the post-prove check and the strict `submitting` write stop it.
- **Least privilege, crypto, supply chain:** no workflow, credential, cryptography or dependency changes.
- **Logging:** no log line changes; `Failed to update journal operation` still logs a refused move.

## UI impact

None. No rendered surface, copy or row changes. A cancelled send now stops before its proof, as `cancelJob`'s contract and the case names already state.

## Decision ledger

| # | Decision | Why |
|---|---|---|
| D1 | F1: a check after the `proving` mark | The cause is a missing checkpoint; the `submitting` arm sets the pattern |
| D2 | F1 proved by a parked-cancel composition case | The real journal and lock decide the order |
| D3 | F2: hold the slot in the same-tick case | States the precondition the claim needs |
| D4 | F3: empty the token stub | A purge removes the tokens first |
| D5 | F4: return the promise, `awaitedBus` | Existing helper and handler shape |
| D6 | F5: wait for the marker | The file's own pattern |
| D7 | One arc, one PR, one commit per issue | About 150 diff lines; each commit reverts alone |
| D8 | Deviation: re-pin `auth-registry/service.ts`'s digest in `apps/extension/scripts/type-roles/identifier-sites.expected.json` | Phase 2's edit reopened that attestation (`test:all` red); re-attested, the operations still run outside the execute window |

## Review verdicts

- **Codex round 1** (gpt-6.1-sol, high): `conditional approve` (update the missed count pin at `:344`, narrow the invariant to a cancel that wins the lock before `proving`, label I2 a hypothesis, qualify "decrypts" and the `retry` fact, rename the slot case, check the grant). All accepted. Rejected: releasing the slot in `finally`; the harness and its mutex live per test, so nothing leaks.
- **Opus Plan leg:** `conditional approve` (the `:344` pin; red by assertion, not timeout; reword the self-delivered abort and cite the `simulating` precedent). Also accepted: `flushPromises()` after `clearChain`, red controls per fix, the stale slot header, a note that the F2 scratch ran without the F1 checkpoint.
- **Codex verification 1:** `conditional approve` (the F2 control was circular: the gate cannot open while the slot is held, so the held read must be released once the send queues behind the slot). Accepted: the earlier scratch "green" had passed through its wait's 1.5 s fallback.
- **Codex verification 2:** `approve`. The panel's verdicts are final for planning; implementation gates remain.
- **Review loop round 1** (Codex, gpt-6.1-sol high, arc diff): `findings: 1`, low: the auth-registry subscription comment said a dropped tx removes its row and cited a plan path. **Opus `general-purpose` review** beside it: `findings: 3`, all low: the slot header named the wrong primitive, the same-tick name and comment overstated the precondition, the new check's comment omitted the abort-before-refusal invariant. All four accepted; no correctness finding from either.
- **Review loop round 2** (Codex resume): `clean`. Converged.

## Delivery

- One arc on `worktree-unit-flakes-3`; PR `fix(execution): stop a cancelled send before its proof; close three test races` (79 characters) against `dev`, body with `Closes #1122`, `Closes #1244`, `Closes #1198`, `Closes #1215` and each file's 30-run count. Open it without labels; add `e2e:extension-network` only if the path filter skips a lane the change needs.
- **30-run command** (from `apps/extension`; logs under `~/.cache/nulo-backlog/unit-flakes-3/runs/`): three streams of ten at once, for contention, each `for i in $(seq 10); do timeout 900 bun --bun vitest run <file> --retry=0 > <log>-<stream>-$i 2>&1 && echo pass >> <tally>; done`, then count the tally: 30/30 or the fix is reported as not shown deterministic. The streams run in the foreground of one tool call.
- Parallelism: none; the four fixes are small and sequential.

## Post-implementation

Execution contract: this plan plus `implementations-plan/README.md` § Post-implementation standard at `78f5f9171`. Plan-specific values:
- **Diff review:** `code_review: off`; absent.
- **Review loop** after Phase 4, over the arc diff from `origin/dev`: `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; one Opus `general-purpose` review beside round 1; hard stop at three rounds; each round in `lessons/phase-4.md` and under Review verdicts.
- **Delivery:** `gh pr create --base dev`, then `gh pr checks <n> --watch`; one rerun for a known flake. Never merge.
- **Close-out** as the PR's final commits: merge `origin/dev`, read `index.md` and `lessons.md`; the `## Outcome` block (`Known limits:`, `Open items:`); lessons within 8 KiB; delete `STATUS.md`; `git mv implementations-plan/unit-flakes-3 implementations-plan/archive/unit-flakes-3` in its own commit, index line to `archive/index.md`; `bun run check:plans` green after staging.
- **Teardown after the merge** (standing authorization): once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/unit-flakes-3/plan.md` succeeds, run `agent-worktree done unit-flakes-3 --merged`; relay a refusal, never force. A `/loop` session checks on every firing; a `/goal` session arms one background wait after its wrap-up report.

## Seeds

```
/goal Arc 1 of implementations-plan/unit-flakes-3/plan.md done: Phases 1-4 marked ✓, each gate's output in the transcript with a 30/30 count per touched file at retry 0 and the new composition case red at the base copy; the Codex loop (gpt-6.1-sol high) converged, quoted; the PR open against dev (gh pr view output); bun run test and bun run lint exit 0.
```

```
/loop 15m Drive arc 1 of implementations-plan/unit-flakes-3 per its plan.md (plan.md is the state). Next unchecked phase, fast gates after each edit, signed commits, 30 runs per touched file at retry 0. Review loop after Phase 4, then open the PR, watch checks, report and stop. Never merge.
```
